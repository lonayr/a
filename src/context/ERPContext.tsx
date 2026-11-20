import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AppUser,
  AuditEntityType,
  AuditLogEntry,
  CurrencyCode,
  Customer,
  DisplayCurrencyMode,
  ERPState,
  InboxExtractedSnapshot,
  InboxInvoice,
  InboxPageFile,
  InboxReviewLine,
  InstallmentScheduleItem,
  InventoryItem,
  NavSection,
  PartyFormContext,
  PaymentTransaction,
  PrintSettings,
  PrintablePayload,
  ProductFormContext,
  PurchaseInvoice,
  PurchaseType,
  SaleInvoice,
  SaleLineItem,
  SaleType,
  SettlementTarget,
  StoreSettings,
  Supplier,
  UserPermissions,
} from '../types/erp';
import {
  ADMIN_PERMISSIONS,
  DEFAULT_STORE_SETTINGS,
  createEmptyStoreState,
  createInitialSeedState,
  getPresetPermissionsForRole,
} from '../data/seedData';
import { calculateSettlementFX, formatCurrency } from '../utils/currency';
import { sanitizeBarcode, normalizeArabicDigits } from '../utils/numbers';
import {
  applyInventoryMetadataUpdate,
  EditableProductMetadataPatch,
  executeStockAdjustment,
  processPurchaseInvoiceCreation,
  PurchaseInvoiceCreatePayload,
} from '../utils/inventoryDomain';
import {
  computeFastHash,
  createThumbnailFromDataUrl,
  inferInvoiceMimeType,
  loadOriginalFileData,
  prepareImageForApi,
  readFileAsDataUrl,
  saveOriginalFileData,
} from '../utils/fileVault';
import {
  InboxAlertNotification,
  buildExtractedDiffSummary,
  computeInboxNotifications,
  matchInventoryLine,
  matchSupplierByName,
  validateInboxReview,
} from '../utils/invoiceInboxDomain';

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const STORAGE_KEY = 'mobile_pro_erp_state_v1';
const SESSION_USER_KEY = 'mobile_pro_erp_session_uid';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface CreateSaleInput {
  customerId: string;
  saleType: SaleType;
  currency: CurrencyCode;
  invoiceNumber?: string;
  date?: string;
  invoiceExchangeRate?: number;
  items: {
    itemId: string;
    sku?: string;
    name?: string;
    specs?: string;
    quantity: number;
    unitPrice: number;
    unitCost?: number;
    imei?: string;
  }[];
  discount: number;
  discountType?: 'amount' | 'percent';
  discountInput?: number;
  downPaymentUSD: number;
  downPaymentIQD: number;
  paymentExchangeRate: number;
  installmentCount: number;
  firstDueDate: string;
  notes?: string;
}

export type CreatePurchaseInput = PurchaseInvoiceCreatePayload;

export interface RecordSettlementInput {
  partyType: 'customer' | 'supplier';
  partyId: string;
  invoiceId?: string;
  paidUSD: number;
  paidIQD: number;
  paymentExchangeRate: number;
  manualSettledAmount?: number | null;
  manualFxDiffIQD?: number | null;
  installmentId?: string;
  notes?: string;
}

export type ActionResult<T = unknown> = { ok: boolean; error?: string; data?: T };

interface ERPContextValue {
  state: ERPState;
  storeSettings: StoreSettings;
  auditLogs: AuditLogEntry[];
  currentUser: AppUser | null;
  activeNav: NavSection;
  navHistory: NavSection[];
  openTabs: NavSection[];
  closeTab: (nav: NavSection) => void;
  canGoBack: boolean;
  subPageTitle: string | null;
  setSubPageTitle: (title: string | null) => void;
  setActiveNav: (nav: NavSection, options?: { bypassDirtyCheck?: boolean }) => void;
  goBack: (options?: { bypassDirtyCheck?: boolean }) => void;

  // Unsaved Changes Guard (page-level inline bar, no modals)
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (dirty: boolean) => void;
  pendingNavTarget: NavSection | 'back' | 'print_close' | null;
  confirmDiscardAndNavigate: () => void;
  cancelPendingNavigation: () => void;

  // Cross-page Standalone Form Contexts (Product Edit / Customer / Supplier -> Back)
  productFormContext: ProductFormContext | null;
  openInventoryEditProduct: (ctx: ProductFormContext) => void;
  clearProductFormContext: () => void;
  customerFormContext: PartyFormContext | null;
  openCustomerForm: (ctx: PartyFormContext) => void;
  clearCustomerFormContext: () => void;
  supplierFormContext: PartyFormContext | null;
  openSupplierForm: (ctx: PartyFormContext) => void;
  clearSupplierFormContext: () => void;
  lastCreatedCustomerId: string | null;
  clearLastCreatedCustomerId: () => void;
  lastCreatedSupplierId: string | null;
  clearLastCreatedSupplierId: () => void;
  salesFilterHint: 'ALL' | 'installment' | null;
  setSalesFilterHint: (hint: 'ALL' | 'installment' | null) => void;
  inventoryLowStockHint: boolean;
  setInventoryLowStockHint: (val: boolean) => void;

  settlementTarget: SettlementTarget | null;
  openSettlementPage: (target?: SettlementTarget | null) => void;
  clearSettlementTarget: () => void;
  printPayload: PrintablePayload | null;
  openPrintPreview: (payload: PrintablePayload) => void;
  closePrintPreview: () => void;
  displayMode: DisplayCurrencyMode;
  setDisplayMode: (mode: DisplayCurrencyMode) => void;
  toggleQuickCurrency: () => void;
  toasts: ToastMessage[];
  notify: (
    text: string,
    type?: ToastMessage['type'],
    action?: { label: string; onClick: () => void }
  ) => void;
  dismissToast: (id: string) => void;

  // Invoice Inbox (صندوق وارد الفواتير المصورة)
  inboxInvoices: InboxInvoice[];
  inboxPendingCount: number;
  inboxNotifications: InboxAlertNotification[];
  activeInboxReviewId: string | null;
  activeInboxViewerId: string | null;
  openInboxReview: (inboxId: string) => void;
  openInboxImageViewer: (inboxId: string) => void;
  clearActiveInboxSelection: () => void;
  uploadFilesToInbox: (files: File[]) => Promise<{ ok: boolean; inboxId?: string; error?: string }>;
  retryInboxExtraction: (inboxId: string) => Promise<{ ok: boolean; error?: string }>;
  saveInboxReviewDraft: (
    inboxId: string,
    patch: Partial<InboxInvoice>,
    recordAudit?: boolean
  ) => { ok: boolean; error?: string };
  approveInboxInvoice: (
    inboxId: string,
    finalOverride?: Partial<InboxInvoice>
  ) => { ok: boolean; purchase?: PurchaseInvoice; error?: string };
  rejectInboxInvoice: (inboxId: string, reason: string) => { ok: boolean; error?: string };

  // Auth
  loginWithPin: (userId: string, pin: string) => boolean;
  logout: () => void;
  hasPermission: (key: keyof UserPermissions) => boolean;
  verifyAdminPin: (pin: string) => AppUser | null;

  // Exchange Rate & Store Settings
  updateExchangeRate: (newRatePer1USD: number, note?: string) => boolean;
  updateStoreSettings: (patch: Partial<StoreSettings>) => boolean;

  // Inventory (Items can ONLY be created via Purchase Invoices; Edit cannot overwrite qty/cost)
  updateInventoryItem: (
    id: string,
    patch: EditableProductMetadataPatch
  ) => { ok: boolean; error?: string };
  adjustInventoryStock: (
    itemId: string,
    newQuantity: number,
    reason: string
  ) => { ok: boolean; error?: string };
  deleteInventoryItem: (id: string) => boolean;

  // Customers & Suppliers
  addCustomer: (customer: Omit<Customer, 'id' | 'code' | 'createdAt'>) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  deleteCustomer: (id: string) => boolean;
  addSupplier: (supplier: Omit<Supplier, 'id' | 'code' | 'createdAt'>) => Supplier;
  updateSupplier: (id: string, patch: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => boolean;

  // Sales & Purchases (No hard delete — use cancellation with mandatory reason)
  createSaleInvoice: (input: CreateSaleInput) => { ok: boolean; sale?: SaleInvoice; error?: string };
  cancelSaleInvoice: (saleId: string, reason: string) => { ok: boolean; error?: string };
  createPurchaseInvoice: (input: CreatePurchaseInput) => { ok: boolean; purchase?: PurchaseInvoice; error?: string };
  cancelPurchaseInvoice: (purchaseId: string, reason: string) => { ok: boolean; error?: string };

  // Settlements (Receipts & Supplier Payments)
  recordSettlement: (input: RecordSettlementInput) => {
    ok: boolean;
    payment?: PaymentTransaction;
    payments?: PaymentTransaction[];
    error?: string;
  };
  cancelPaymentTransaction: (paymentId: string, reason: string) => { ok: boolean; error?: string };

  // Users & Settings & Developer & Backup
  addUser: (user: Omit<AppUser, 'id' | 'createdAt'>) => { ok: boolean; error?: string };
  updateUser: (id: string, patch: Partial<AppUser>) => void;
  deleteUser: (id: string) => boolean;
  updatePrintSettings: (patch: Partial<PrintSettings>) => void;
  updateDeveloperLicense: (patch: {
    developerMode: 'trial' | 'permanent';
    expiryDate: string;
    developerPin: string;
  }) => void;
  restoreFullState: (nextState: ERPState) => boolean;
  resetToEmptyStore: () => boolean;
  resetToDemoSeed: () => boolean;

  // Helpers
  getCustomerBalances: (customerId: string) => { usd: number; iqd: number };
  getSupplierBalances: (supplierId: string) => { usd: number; iqd: number };
}

const ERPContext = createContext<ERPContextValue | null>(null);

function hydrateState(raw: ERPState): ERPState {
  return {
    ...raw,
    users: (raw.users || []).map((u) => ({
      ...u,
      permissions: {
        ...getPresetPermissionsForRole(u.role),
        ...(u.permissions || {}),
        canApproveInboxInvoices:
          u.permissions?.canApproveInboxInvoices ??
          (u.role === 'admin' || u.role === 'accountant'),
      },
    })),
    storeSettings: {
      ...DEFAULT_STORE_SETTINGS,
      ...(raw.storeSettings || {}),
    },
    auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : [],
    inboxInvoices: Array.isArray(raw.inboxInvoices) ? raw.inboxInvoices : [],
  };
}

function loadInitialState(): ERPState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ERPState;
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.inventory)) {
        return hydrateState(parsed);
      }
    }
  } catch {
    // Fallback to seed
  }
  return hydrateState(createInitialSeedState());
}

function nextSequenceCode(prefix: string, existingNumbers: string[], baseStart: number, separator = '-'): string {
  let maxNum = baseStart - 1;
  for (const code of existingNumbers) {
    const match = code.match(/(\d+)$/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxNum) maxNum = val;
    }
  }
  return `${prefix}${separator}${maxNum + 1}`;
}

export function ERPProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ERPState>(loadInitialState);
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_USER_KEY);
    } catch {
      return null;
    }
  });
  const [navHistory, setNavHistory] = useState<NavSection[]>(['dashboard']);
  const [openTabs, setOpenTabs] = useState<NavSection[]>(['dashboard', 'pos']);
  const activeNav = navHistory[navHistory.length - 1] || 'dashboard';
  const [subPageTitle, setSubPageTitle] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingNavTarget, setPendingNavTarget] = useState<NavSection | 'back' | 'print_close' | null>(null);

  const [productFormContext, setProductFormContext] = useState<ProductFormContext | null>(null);
  const [customerFormContext, setCustomerFormContext] = useState<PartyFormContext | null>(null);
  const [supplierFormContext, setSupplierFormContext] = useState<PartyFormContext | null>(null);
  const [lastCreatedCustomerId, setLastCreatedCustomerId] = useState<string | null>(null);
  const [lastCreatedSupplierId, setLastCreatedSupplierId] = useState<string | null>(null);
  const [salesFilterHint, setSalesFilterHint] = useState<'ALL' | 'installment' | null>(null);
  const [inventoryLowStockHint, setInventoryLowStockHint] = useState(false);
  const [settlementTarget, setSettlementTarget] = useState<SettlementTarget | null>(null);
  const [printPayload, setPrintPayload] = useState<PrintablePayload | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayCurrencyMode>('ORIGINAL');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeInboxReviewId, setActiveInboxReviewId] = useState<string | null>(null);
  const [activeInboxViewerId, setActiveInboxViewerId] = useState<string | null>(null);

  const storeSettings: StoreSettings = useMemo(
    () => ({
      ...DEFAULT_STORE_SETTINGS,
      ...(state.storeSettings || {}),
    }),
    [state.storeSettings]
  );

  const auditLogs: AuditLogEntry[] = useMemo(
    () => (Array.isArray(state.auditLogs) ? state.auditLogs : []),
    [state.auditLogs]
  );

  const inboxInvoices: InboxInvoice[] = useMemo(
    () => (Array.isArray(state.inboxInvoices) ? state.inboxInvoices : []),
    [state.inboxInvoices]
  );

  const inboxPendingCount = useMemo(
    () => inboxInvoices.filter((inv) => inv.status === 'pending_review').length,
    [inboxInvoices]
  );

  const inboxNotifications = useMemo(
    () => computeInboxNotifications(inboxInvoices),
    [inboxInvoices]
  );

  const currentUser = useMemo(() => {
    if (!currentUserId) return null;
    return state.users.find((u) => u.id === currentUserId && u.active) ?? null;
  }, [state.users, currentUserId]);

  const buildAuditEntry = useCallback(
    (params: {
      action: string;
      actionLabel: string;
      entityType: AuditEntityType;
      entityId?: string;
      reference?: string;
      beforeValue?: string;
      afterValue?: string;
      reason?: string;
      note?: string;
    }): AuditLogEntry => ({
      id: uniqueId('aud'),
      date: new Date().toISOString(),
      userId: currentUser?.id || 'system',
      userName: currentUser?.name || 'النظام',
      ...params,
    }),
    [currentUser]
  );

  const performNavigate = useCallback((nav: NavSection) => {
    setPrintPayload(null);
    setSubPageTitle(null);
    setPendingNavTarget(null);
    setHasUnsavedChanges(false);
    setOpenTabs((prev) => (prev.includes(nav) ? prev : [...prev, nav]));
    setNavHistory((prev) => {
      if (prev[prev.length - 1] === nav) return prev;
      return [...prev.slice(-19), nav];
    });
  }, []);

  const performGoBack = useCallback(() => {
    setPrintPayload(null);
    setSubPageTitle(null);
    setPendingNavTarget(null);
    setHasUnsavedChanges(false);
    setNavHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const setActiveNav = useCallback(
    (nav: NavSection, options?: { bypassDirtyCheck?: boolean }) => {
      if (!options?.bypassDirtyCheck && hasUnsavedChanges && nav !== activeNav) {
        setPendingNavTarget(nav);
        return;
      }
      performNavigate(nav);
    },
    [activeNav, hasUnsavedChanges, performNavigate]
  );

  const closeTab = useCallback(
    (nav: NavSection) => {
      setOpenTabs((prev) => {
        if (prev.length <= 1) return prev;
        const nextTabs = prev.filter((t) => t !== nav);
        if (activeNav === nav) {
          const idx = prev.indexOf(nav);
          const fallback = nextTabs[Math.max(0, idx - 1)] || nextTabs[0] || 'dashboard';
          performNavigate(fallback);
        }
        return nextTabs;
      });
    },
    [activeNav, performNavigate]
  );

  const goBack = useCallback(
    (options?: { bypassDirtyCheck?: boolean }) => {
      if (!options?.bypassDirtyCheck && hasUnsavedChanges) {
        setPendingNavTarget('back');
        return;
      }
      performGoBack();
    },
    [hasUnsavedChanges, performGoBack]
  );

  const confirmDiscardAndNavigate = useCallback(() => {
    const target = pendingNavTarget;
    setPendingNavTarget(null);
    setHasUnsavedChanges(false);
    if (!target) return;
    if (target === 'back') {
      performGoBack();
    } else if (target === 'print_close') {
      setPrintPayload(null);
    } else {
      performNavigate(target);
    }
  }, [pendingNavTarget, performGoBack, performNavigate]);

  const cancelPendingNavigation = useCallback(() => {
    setPendingNavTarget(null);
  }, []);

  const openInventoryEditProduct = useCallback(
    (ctx: ProductFormContext) => {
      setProductFormContext(ctx);
      performNavigate('inventory');
    },
    [performNavigate]
  );

  const clearProductFormContext = useCallback(() => {
    setProductFormContext(null);
  }, []);

  const openCustomerForm = useCallback(
    (ctx: PartyFormContext) => {
      setCustomerFormContext(ctx);
      performNavigate('customers');
    },
    [performNavigate]
  );

  const clearCustomerFormContext = useCallback(() => {
    setCustomerFormContext(null);
  }, []);

  const openSupplierForm = useCallback(
    (ctx: PartyFormContext) => {
      setSupplierFormContext(ctx);
      performNavigate('suppliers');
    },
    [performNavigate]
  );

  const clearSupplierFormContext = useCallback(() => {
    setSupplierFormContext(null);
  }, []);

  const clearLastCreatedCustomerId = useCallback(() => {
    setLastCreatedCustomerId(null);
  }, []);

  const clearLastCreatedSupplierId = useCallback(() => {
    setLastCreatedSupplierId(null);
  }, []);

  const openSettlementPage = useCallback(
    (target?: SettlementTarget | null) => {
      setSettlementTarget(target ?? null);
      setActiveNav('settlement');
    },
    [setActiveNav]
  );

  const clearSettlementTarget = useCallback(() => {
    setSettlementTarget(null);
  }, []);

  const openPrintPreview = useCallback((payload: PrintablePayload) => {
    setPrintPayload(payload);
  }, []);

  const closePrintPreview = useCallback(() => {
    setPrintPayload(null);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota warnings
    }
  }, [state]);

  useEffect(() => {
    try {
      if (currentUserId) {
        localStorage.setItem(SESSION_USER_KEY, currentUserId);
      } else {
        localStorage.removeItem(SESSION_USER_KEY);
      }
    } catch {
      // Ignore
    }
  }, [currentUserId]);

  const notify = useCallback(
    (
      text: string,
      type: ToastMessage['type'] = 'success',
      action?: { label: string; onClick: () => void }
    ) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [
        ...prev,
        { id, type, text, actionLabel: action?.label, onAction: action?.onClick },
      ]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, action ? 8000 : 4200);
    },
    []
  );

  const openInboxReview = useCallback(
    (inboxId: string) => {
      setActiveInboxViewerId(null);
      setActiveInboxReviewId(inboxId);
      setActiveNav('invoices');
    },
    [setActiveNav]
  );

  const openInboxImageViewer = useCallback(
    (inboxId: string) => {
      setActiveInboxReviewId(null);
      setActiveInboxViewerId(inboxId);
      setActiveNav('invoices');
    },
    [setActiveNav]
  );

  const clearActiveInboxSelection = useCallback(() => {
    setActiveInboxReviewId(null);
    setActiveInboxViewerId(null);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loginWithPin = (userId: string, pin: string): boolean => {
    const user = state.users.find((u) => u.id === userId && u.active);
    if (!user) return false;
    const cleanPin = sanitizeBarcode(pin);
    if (user.pin !== cleanPin && user.pin !== pin.trim()) return false;
    setCurrentUserId(user.id);
    setNavHistory(['dashboard']);
    setSubPageTitle(null);
    setHasUnsavedChanges(false);
    setPendingNavTarget(null);
    notify(`مرحباً ${user.name}`, 'info');
    return true;
  };

  const logout = () => {
    setCurrentUserId(null);
    setHasUnsavedChanges(false);
    setPendingNavTarget(null);
  };

  const hasPermission = useCallback(
    (key: keyof UserPermissions): boolean => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true;
      return Boolean(currentUser.permissions[key]);
    },
    [currentUser]
  );

  const verifyAdminPin = useCallback(
    (pin: string): AppUser | null => {
      const clean = sanitizeBarcode(pin);
      if (!clean) return null;
      return (
        state.users.find((u) => u.active && u.role === 'admin' && u.pin === clean) ?? null
      );
    },
    [state.users]
  );

  const toggleQuickCurrency = () => {
    setDisplayMode((prev) => {
      if (prev === 'ORIGINAL') return 'IQD';
      if (prev === 'IQD') return 'USD';
      return 'ORIGINAL';
    });
  };

  const updateExchangeRate = (newRatePer1USD: number, note?: string): boolean => {
    if (!hasPermission('canChangeExchangeRate')) {
      notify('ليس لديك صلاحية تعديل سعر الصرف.', 'error');
      return false;
    }
    if (!Number.isFinite(newRatePer1USD) || newRatePer1USD <= 0) {
      notify('سعر الصرف غير صالح.', 'error');
      return false;
    }
    const cleanRate = Math.round(newRatePer1USD);
    setState((prev) => {
      const logEntry = {
        id: `fx-${Date.now()}`,
        date: new Date().toISOString(),
        previousRate: prev.activeExchangeRate,
        newRate: cleanRate,
        source: 'manual_update' as const,
        note:
          note ||
          `تحديث سعر الصرف من ${(prev.activeExchangeRate * 100).toLocaleString()} إلى ${(cleanRate * 100).toLocaleString()} د.ع / 100$`,
        userName: currentUser?.name || 'النظام',
      };
      const audit = buildAuditEntry({
        action: 'update_exchange_rate',
        actionLabel: 'تحديث سعر الصرف',
        entityType: 'exchange',
        reference: `${(cleanRate * 100).toLocaleString()} د.ع/100$`,
        beforeValue: `${(prev.activeExchangeRate * 100).toLocaleString()} د.ع`,
        afterValue: `${(cleanRate * 100).toLocaleString()} د.ع`,
        note: logEntry.note,
      });
      return {
        ...prev,
        lastSavedAt: new Date().toISOString(),
        activeExchangeRate: cleanRate,
        exchangeLogs: [logEntry, ...prev.exchangeLogs],
        auditLogs: [audit, ...(prev.auditLogs || [])],
      };
    });
    notify(`تم تحديث سعر الصرف إلى ${(cleanRate * 100).toLocaleString()} د.ع لكل 100$`);
    return true;
  };

  const updateStoreSettings = (patch: Partial<StoreSettings>): boolean => {
    if (currentUser?.role !== 'admin' && !hasPermission('canManageUsers')) {
      notify('تعديل إعدادات النظام العامة متاح للمدير فقط.', 'error');
      return false;
    }
    const before = { ...DEFAULT_STORE_SETTINGS, ...(state.storeSettings || {}) };
    const after = { ...before, ...patch };
    const audit = buildAuditEntry({
      action: 'update_store_settings',
      actionLabel: 'تحديث إعدادات المخزون والتكلفة',
      entityType: 'settings',
      beforeValue: `مخزون سالب: ${before.allowNegativeStock ? 'نعم' : 'لا'} | التكلفة: ${before.costCalculationMethod === 'weighted_avg' ? 'المتوسط المرجّح' : 'آخر سعر'}`,
      afterValue: `مخزون سالب: ${after.allowNegativeStock ? 'نعم' : 'لا'} | التكلفة: ${after.costCalculationMethod === 'weighted_avg' ? 'المتوسط المرجّح' : 'آخر سعر'}`,
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      storeSettings: after,
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم حفظ إعدادات المخزون وطريقة احتساب التكلفة بنجاح.');
    return true;
  };

  const updateInventoryItem = (
    id: string,
    patch: EditableProductMetadataPatch
  ): { ok: boolean; error?: string } => {
    if (!hasPermission('canManageInventory')) {
      const err = 'ليس لديك صلاحية تعديل المخزون.';
      notify(err, 'error');
      return { ok: false, error: err };
    }

    const nowIso = new Date().toISOString();
    const res = applyInventoryMetadataUpdate(state.inventory, id, patch, nowIso);
    if (!res.ok || !res.existing || !res.updatedItem) {
      return { ok: false, error: res.error || 'تعذر تحديث بيانات المادة.' };
    }

    const { existing, updatedItem } = res;
    const audit = buildAuditEntry({
      action: 'update_inventory',
      actionLabel: 'تعديل بيانات مادة',
      entityType: 'inventory',
      entityId: existing.id,
      reference: updatedItem.sku,
      beforeValue: `${existing.brand} ${existing.model} · باركود: ${existing.sku} · نقد: ${formatCurrency(existing.cashPrice, existing.sellCurrency)}`,
      afterValue: `${updatedItem.brand} ${updatedItem.model} · باركود: ${updatedItem.sku} · نقد: ${formatCurrency(updatedItem.cashPrice, updatedItem.sellCurrency)}`,
    });

    setState((prev) => ({
      ...prev,
      lastSavedAt: nowIso,
      inventory: prev.inventory.map((it) => (it.id === id ? updatedItem : it)),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم تحديث بيانات المادة بنجاح.');
    return { ok: true };
  };

  const adjustInventoryStock = (
    itemId: string,
    newQuantity: number,
    reason: string
  ): { ok: boolean; error?: string } => {
    if (!hasPermission('canManageInventory')) {
      const err = 'ليس لديك صلاحية إجراء تسوية المخزون.';
      notify(err, 'error');
      return { ok: false, error: err };
    }
    const nowIso = new Date().toISOString();
    const res = executeStockAdjustment({
      inventory: state.inventory,
      itemId,
      newQuantity,
      reason,
      allowNegativeStock: storeSettings.allowNegativeStock,
      nowIso,
    });
    if (!res.ok || !res.existing || !res.updatedItem) {
      return { ok: false, error: res.error || 'تعذر تنفيذ تسوية المخزون.' };
    }

    const { existing, updatedItem, previousQty, newQty } = res;
    const cleanReason = reason.trim();
    const audit = buildAuditEntry({
      action: 'stock_adjustment',
      actionLabel: 'تسوية مخزون (جرد)',
      entityType: 'inventory',
      entityId: existing.id,
      reference: existing.sku,
      beforeValue: `${existing.brand} ${existing.model} · الكمية: ${previousQty}`,
      afterValue: `${existing.brand} ${existing.model} · الكمية: ${newQty}`,
      reason: cleanReason,
    });

    setState((prev) => ({
      ...prev,
      lastSavedAt: nowIso,
      inventory: prev.inventory.map((it) => (it.id === itemId ? updatedItem : it)),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify(`تم اعتماد تسوية المخزون للمادة ${existing.brand} ${existing.model} (الكمية الجديدة: ${newQty}).`);
    return { ok: true };
  };

  const deleteInventoryItem = (id: string): boolean => {
    if (!hasPermission('canDeleteRecords')) {
      notify('حذف الأصناف متاح للمدير أو المخولين فقط.', 'error');
      return false;
    }
    const target = state.inventory.find((it) => it.id === id);
    if (!target) return false;
    const isReferenced =
      state.sales.some((s) => s.items.some((l) => l.itemId === id)) ||
      state.purchases.some((p) => p.items.some((l) => l.itemId === id));
    if (isReferenced) {
      notify('لا يمكن حذف صنف مرتبط بفواتير بيع أو شراء مسجلة.', 'error');
      return false;
    }
    const audit = buildAuditEntry({
      action: 'delete_inventory',
      actionLabel: 'حذف صنف من المخزون',
      entityType: 'inventory',
      entityId: target.id,
      reference: target.sku,
      beforeValue: `${target.brand} ${target.model} (كمية ${target.quantity})`,
      afterValue: 'محذوف',
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      inventory: prev.inventory.filter((it) => it.id !== id),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم حذف الصنف من المخزون.', 'info');
    return true;
  };

  const addCustomer = (customer: Omit<Customer, 'id' | 'code' | 'createdAt'>): Customer => {
    const code = nextSequenceCode(
      'CUS',
      state.customers.map((c) => c.code),
      101
    );
    const created: Customer = {
      ...customer,
      id: `cus-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      code,
      createdAt: new Date().toISOString(),
    };
    const audit = buildAuditEntry({
      action: 'add_customer',
      actionLabel: 'تسجيل زبون جديد',
      entityType: 'customer',
      entityId: created.id,
      reference: created.code,
      beforeValue: '-',
      afterValue: `${created.name} · ${created.phone || 'بدون هاتف'}`,
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      customers: [created, ...prev.customers],
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    setLastCreatedCustomerId(created.id);
    notify(`تم تسجيل الزبون: ${created.name}`);
    return created;
  };

  const updateCustomer = (id: string, patch: Partial<Customer>) => {
    const prevCust = state.customers.find((c) => c.id === id);
    if (!prevCust) return;
    const nextCust = { ...prevCust, ...patch };
    const audit = buildAuditEntry({
      action: 'update_customer',
      actionLabel: 'تعديل بيانات زبون',
      entityType: 'customer',
      entityId: id,
      reference: prevCust.code,
      beforeValue: `${prevCust.name} (${prevCust.phone})`,
      afterValue: `${nextCust.name} (${nextCust.phone})`,
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      customers: prev.customers.map((c) => (c.id === id ? nextCust : c)),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم تحديث بيانات الزبون.');
  };

  const deleteCustomer = (id: string): boolean => {
    if (!hasPermission('canDeleteRecords')) {
      notify('حذف الزبون متاح للمدير فقط.', 'error');
      return false;
    }
    const hasSales = state.sales.some((s) => s.customerId === id);
    if (hasSales) {
      notify('لا يمكن حذف زبون لديه فواتير مسجلة.', 'error');
      return false;
    }
    const target = state.customers.find((c) => c.id === id);
    if (!target) return false;
    const audit = buildAuditEntry({
      action: 'delete_customer',
      actionLabel: 'حذف ملف زبون',
      entityType: 'customer',
      entityId: id,
      reference: target.code,
      beforeValue: target.name,
      afterValue: 'محذوف',
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      customers: prev.customers.filter((c) => c.id !== id),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم حذف ملف الزبون.', 'info');
    return true;
  };

  const addSupplier = (supplier: Omit<Supplier, 'id' | 'code' | 'createdAt'>): Supplier => {
    const code = nextSequenceCode(
      'SUP',
      state.suppliers.map((s) => s.code),
      201
    );
    const created: Supplier = {
      ...supplier,
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      code,
      createdAt: new Date().toISOString(),
    };
    const audit = buildAuditEntry({
      action: 'add_supplier',
      actionLabel: 'تسجيل مورد جديد',
      entityType: 'supplier',
      entityId: created.id,
      reference: created.code,
      beforeValue: '-',
      afterValue: `${created.name} · ${created.company}`,
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      suppliers: [created, ...prev.suppliers],
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    setLastCreatedSupplierId(created.id);
    notify(`تم تسجيل المورد: ${created.name}`);
    return created;
  };

  const updateSupplier = (id: string, patch: Partial<Supplier>) => {
    const prevSup = state.suppliers.find((s) => s.id === id);
    if (!prevSup) return;
    const nextSup = { ...prevSup, ...patch };
    const audit = buildAuditEntry({
      action: 'update_supplier',
      actionLabel: 'تعديل بيانات مورد',
      entityType: 'supplier',
      entityId: id,
      reference: prevSup.code,
      beforeValue: `${prevSup.name} (${prevSup.company})`,
      afterValue: `${nextSup.name} (${nextSup.company})`,
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      suppliers: prev.suppliers.map((s) => (s.id === id ? nextSup : s)),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم تحديث بيانات المورد.');
  };

  const deleteSupplier = (id: string): boolean => {
    if (!hasPermission('canDeleteRecords')) {
      notify('حذف المورد متاح للمدير فقط.', 'error');
      return false;
    }
    const hasPurchases = state.purchases.some((p) => p.supplierId === id);
    if (hasPurchases) {
      notify('لا يمكن حذف مورد لديه فواتير شراء مسجلة.', 'error');
      return false;
    }
    const target = state.suppliers.find((s) => s.id === id);
    if (!target) return false;
    const audit = buildAuditEntry({
      action: 'delete_supplier',
      actionLabel: 'حذف ملف مورد',
      entityType: 'supplier',
      entityId: id,
      reference: target.code,
      beforeValue: target.name,
      afterValue: 'محذوف',
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      suppliers: prev.suppliers.filter((s) => s.id !== id),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم حذف ملف المورد.', 'info');
    return true;
  };

  const createSaleInvoice = (
    input: CreateSaleInput
  ): { ok: boolean; sale?: SaleInvoice; error?: string } => {
    if (input.saleType === 'cash' && !hasPermission('canSellCash')) {
      return { ok: false, error: 'ليس لديك صلاحية البيع النقدي.' };
    }
    if (input.saleType !== 'cash' && !hasPermission('canSellInstallment')) {
      return { ok: false, error: 'ليس لديك صلاحية البيع بالأقساط أو الآجل.' };
    }
    const customer = state.customers.find((c) => c.id === input.customerId);
    if (!customer) {
      return { ok: false, error: 'يرجى اختيار الزبون أولاً.' };
    }
    if (!input.items.length) {
      return { ok: false, error: 'يرجى إضافة منتج واحد على الأقل للفاتورة.' };
    }

    for (const line of input.items) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        return { ok: false, error: 'يجب أن تكون الكمية أكبر من صفر لجميع المواد.' };
      }
      if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
        return { ok: false, error: 'سعر البيع غير صالح لأحد المواد.' };
      }
    }

    const allowNegativeStock = storeSettings.allowNegativeStock;

    // Aggregate quantities per inventory itemId to validate total stock
    const qtyByInventoryId = new Map<string, number>();
    for (const line of input.items) {
      if (!line.itemId || line.itemId === 'custom-item') continue;
      const inv = state.inventory.find((i) => i.id === line.itemId);
      if (!inv) return { ok: false, error: 'أحد المنتجات المختارة غير موجود بالمخزون.' };
      const nextQty = (qtyByInventoryId.get(inv.id) || 0) + line.quantity;
      qtyByInventoryId.set(inv.id, nextQty);
      if (!allowNegativeStock && inv.quantity < nextQty) {
        return {
          ok: false,
          error: `الكمية غير كافية للمنتج ${inv.brand} ${inv.model} (المتوفر ${inv.quantity}).`,
        };
      }
    }

    const nowIso = new Date().toISOString();
    const saleDateIso = input.date || nowIso;
    const lockedRate =
      input.invoiceExchangeRate && input.invoiceExchangeRate > 0
        ? input.invoiceExchangeRate
        : state.activeExchangeRate;
    const invoiceNumber =
      input.invoiceNumber?.trim() ||
      nextSequenceCode(
        'A',
        state.sales.map((s) => s.invoiceNumber),
        1001,
        ''
      );

    const saleLines: SaleLineItem[] = input.items.map((line) => {
      const inv =
        line.itemId && line.itemId !== 'custom-item'
          ? state.inventory.find((i) => i.id === line.itemId)
          : undefined;

      const lineTotal =
        input.currency === 'USD'
          ? Number((line.unitPrice * line.quantity).toFixed(2))
          : Math.round(line.unitPrice * line.quantity);

      if (inv) {
        return {
          itemId: inv.id,
          sku: inv.sku,
          brand: inv.brand,
          model: inv.model,
          specs: `${inv.storage}${inv.color ? ` · ${inv.color}` : ''}`,
          imei: line.imei,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: inv.costPrice,
          costCurrency: inv.costCurrency,
          lineTotal,
        };
      }

      return {
        itemId: 'custom-item',
        sku: line.sku || '',
        brand: line.name?.trim() || 'منتج عام',
        model: '',
        specs: line.specs?.trim() || 'قياسي',
        imei: line.imei,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost || 0,
        costCurrency: input.currency,
        lineTotal,
      };
    });

    const subtotal = saleLines.reduce((sum, l) => sum + l.lineTotal, 0);
    const discount = Math.max(0, input.discount || 0);
    if (discount > subtotal + (input.currency === 'USD' ? 0.01 : 0)) {
      return { ok: false, error: 'الخصم لا يمكن أن يكون أكبر من المجموع الأولي للفاتورة.' };
    }

    const total =
      input.currency === 'USD'
        ? Number(Math.max(0, subtotal - discount).toFixed(2))
        : Math.max(0, Math.round(subtotal - discount));

    const payRate = input.paymentExchangeRate > 0 ? input.paymentExchangeRate : lockedRate;

    let paidUSD = Math.max(0, input.downPaymentUSD || 0);
    let paidIQD = Math.max(0, Math.round(input.downPaymentIQD || 0));

    if (input.saleType === 'cash' && paidUSD === 0 && paidIQD === 0) {
      if (input.currency === 'USD') paidUSD = total;
      else paidIQD = total;
    }

    const fxCalc = calculateSettlementFX({
      partyType: 'customer',
      invoiceCurrency: input.currency,
      invoiceExchangeRate: lockedRate,
      paymentExchangeRate: payRate,
      paidUSD,
      paidIQD,
    });

    const paidTotal =
      input.saleType === 'cash'
        ? total
        : Math.min(total, fxCalc.settledInInvoiceCurrency);
    const remainingAmount =
      input.currency === 'USD'
        ? Number(Math.max(0, total - paidTotal).toFixed(2))
        : Math.max(0, Math.round(total - paidTotal));

    const installments: InstallmentScheduleItem[] = [];
    if (input.saleType === 'installment' && input.installmentCount > 0 && remainingAmount > 0) {
      const count = input.installmentCount;
      const baseAmount =
        input.currency === 'USD'
          ? Number((remainingAmount / count).toFixed(2))
          : Math.floor(remainingAmount / count);
      let allocated = 0;

      for (let i = 0; i < count; i++) {
        const due = new Date(input.firstDueDate || saleDateIso.slice(0, 10));
        due.setMonth(due.getMonth() + i);
        const amount =
          i === count - 1
            ? input.currency === 'USD'
              ? Number((remainingAmount - allocated).toFixed(2))
              : remainingAmount - allocated
            : baseAmount;
        allocated += amount;
        installments.push({
          id: `inst-${Date.now()}-${i + 1}`,
          index: i + 1,
          dueDate: due.toISOString().slice(0, 10),
          amount,
          paidAmount: 0,
          status: 'pending',
        });
      }
    }

    const saleId = uniqueId('sal');
    const newSale: SaleInvoice = {
      id: saleId,
      invoiceNumber,
      date: saleDateIso,
      customerId: customer.id,
      customerName: customer.name,
      saleType: input.saleType,
      currency: input.currency,
      exchangeRateAtSale: lockedRate,
      items: saleLines,
      subtotal,
      discount,
      discountType: input.discountType || 'amount',
      discountInput: input.discountInput ?? discount,
      total,
      downPaymentUSD: paidUSD,
      downPaymentIQD: paidIQD,
      downPaymentInInvoiceCurrency: paidTotal,
      paidTotal,
      remainingAmount,
      installmentCount: installments.length,
      installments,
      notes: input.notes,
      createdBy: currentUser?.name || 'النظام',
      status: 'active',
    };

    const newPayments: PaymentTransaction[] = [];
    const newExchangeLogs = [...state.exchangeLogs];

    if (paidTotal > 0 || paidUSD > 0 || paidIQD > 0) {
      const voucherNumber = nextSequenceCode(
        'RV',
        state.payments.filter((p) => p.partyType === 'customer' && !p.isReversal).map((p) => p.voucherNumber),
        3001
      );
      newPayments.push({
        id: uniqueId('pay'),
        voucherNumber,
        date: saleDateIso,
        partyType: 'customer',
        partyId: customer.id,
        partyName: customer.name,
        category: input.saleType === 'cash' ? 'cash_sale' : 'down_payment',
        invoiceId: saleId,
        invoiceNumber,
        invoiceCurrency: input.currency,
        invoiceExchangeRate: lockedRate,
        paidUSD,
        paidIQD,
        paymentExchangeRate: payRate,
        settledInInvoiceCurrency: paidTotal,
        autoCalculatedSettled: fxCalc.autoSettledInInvoiceCurrency,
        fxDiffIQD: fxCalc.fxDiffIQD,
        fxDiffUSD: fxCalc.fxDiffUSD,
        isManualOverride: false,
        notes:
          input.saleType === 'cash'
            ? `قبض فاتورة نقدية ${invoiceNumber}`
            : `مقدمة فاتورة ${invoiceNumber}`,
        createdBy: currentUser?.name || 'النظام',
        status: 'active',
      });

      if (fxCalc.hasCurrencyConversion) {
        newExchangeLogs.unshift({
          id: `fx-${Date.now()}-s`,
          date: saleDateIso,
          previousRate: lockedRate,
          newRate: payRate,
          source: 'auto_conversion',
          reference: voucherNumber,
          note: `تحويل تلقائي في ${invoiceNumber} (${customer.name}) بسعر ${(payRate * 100).toLocaleString()} د.ع / 100$`,
          userName: currentUser?.name || 'النظام',
        });
      }
    }

    // Deduct stock and IMEIs (allow negative stock if enabled)
    const updatedInventory = state.inventory.map((inv) => {
      const matchingLines = input.items.filter((l) => l.itemId === inv.id);
      if (matchingLines.length === 0) return inv;
      const totalQty = matchingLines.reduce((s, l) => s + l.quantity, 0);
      const usedImeis = new Set(matchingLines.map((l) => l.imei).filter(Boolean) as string[]);
      const nextQuantity = allowNegativeStock
        ? inv.quantity - totalQty
        : Math.max(0, inv.quantity - totalQty);
      return {
        ...inv,
        quantity: nextQuantity,
        imeiList: inv.imeiList.filter((im) => !usedImeis.has(im)),
        updatedAt: nowIso,
      };
    });

    const audit = buildAuditEntry({
      action: 'create_sale',
      actionLabel: 'إصدار فاتورة بيع',
      entityType: 'sale',
      entityId: newSale.id,
      reference: newSale.invoiceNumber,
      beforeValue: '-',
      afterValue: `${newSale.customerName} · الصافي: ${formatCurrency(newSale.total, newSale.currency)} · المدفوع: ${formatCurrency(newSale.paidTotal, newSale.currency)}`,
    });

    setState((prev) => ({
      ...prev,
      lastSavedAt: nowIso,
      inventory: updatedInventory,
      sales: [newSale, ...prev.sales],
      payments: [...newPayments, ...prev.payments],
      exchangeLogs: newExchangeLogs,
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));

    notify(`تم إصدار الفاتورة ${invoiceNumber} بنجاح.`);
    return { ok: true, sale: newSale };
  };

  const cancelSaleInvoice = (saleId: string, reason: string): { ok: boolean; error?: string } => {
    if (!hasPermission('canDeleteRecords')) {
      return { ok: false, error: 'إلغاء الفواتير متاح للمدير أو المخولين فقط.' };
    }
    const cleanReason = reason.trim();
    if (!cleanReason) {
      return { ok: false, error: 'يرجى كتابة سبب الإلغاء الإلزامي.' };
    }
    const target = state.sales.find((s) => s.id === saleId);
    if (!target) return { ok: false, error: 'الفاتورة غير موجودة.' };
    if (target.status === 'cancelled') {
      return { ok: false, error: 'هذه الفاتورة ملغاة مسبقاً.' };
    }

    const nowIso = new Date().toISOString();
    const userLabel = currentUser?.name || 'النظام';

    const restoredInventory = state.inventory.map((inv) => {
      const soldLines = target.items.filter((l) => l.itemId === inv.id);
      if (!soldLines.length) return inv;
      const qtyBack = soldLines.reduce((s, l) => s + l.quantity, 0);
      const imeisBack = soldLines.map((l) => l.imei).filter(Boolean) as string[];
      return {
        ...inv,
        quantity: inv.quantity + qtyBack,
        imeiList: [...inv.imeiList, ...imeisBack],
        updatedAt: nowIso,
      };
    });

    const reversalVouchers: PaymentTransaction[] = [];
    const updatedPayments = state.payments.map((p) => {
      if (p.invoiceId === saleId && p.status !== 'cancelled' && !p.isReversal) {
        reversalVouchers.push({
          id: uniqueId('pay-rev'),
          voucherNumber: `REV-${p.voucherNumber}`,
          date: nowIso,
          partyType: p.partyType,
          partyId: p.partyId,
          partyName: p.partyName,
          category: 'reversal',
          invoiceId: p.invoiceId,
          invoiceNumber: p.invoiceNumber,
          invoiceCurrency: p.invoiceCurrency,
          invoiceExchangeRate: p.invoiceExchangeRate,
          paidUSD: p.paidUSD ? -p.paidUSD : 0,
          paidIQD: p.paidIQD ? -p.paidIQD : 0,
          paymentExchangeRate: p.paymentExchangeRate,
          settledInInvoiceCurrency: -p.settledInInvoiceCurrency,
          autoCalculatedSettled: -p.autoCalculatedSettled,
          fxDiffIQD: p.fxDiffIQD ? -p.fxDiffIQD : 0,
          fxDiffUSD: p.fxDiffUSD ? -p.fxDiffUSD : 0,
          isManualOverride: p.isManualOverride,
          notes: `سند عكسي لإلغاء فاتورة البيع ${target.invoiceNumber} — السبب: ${cleanReason}`,
          createdBy: userLabel,
          status: 'active',
          isReversal: true,
          reversalOfId: p.id,
        });
        return {
          ...p,
          status: 'cancelled' as const,
          cancelledAt: nowIso,
          cancelledBy: userLabel,
          cancellationReason: `إلغاء الفاتورة ${target.invoiceNumber}: ${cleanReason}`,
        };
      }
      return p;
    });

    const audit = buildAuditEntry({
      action: 'cancel_sale',
      actionLabel: 'إلغاء فاتورة بيع وعكس قيودها',
      entityType: 'sale',
      entityId: target.id,
      reference: target.invoiceNumber,
      beforeValue: `نشطة · الإجمالي: ${formatCurrency(target.total, target.currency)} · المتبقي: ${formatCurrency(target.remainingAmount, target.currency)}`,
      afterValue: `ملغاة (${reversalVouchers.length} سند عكسي + استرجاع المخزون)`,
      reason: cleanReason,
    });

    setState((prev) => ({
      ...prev,
      lastSavedAt: nowIso,
      inventory: restoredInventory,
      sales: prev.sales.map((s) =>
        s.id === saleId
          ? {
              ...s,
              status: 'cancelled',
              cancelledAt: nowIso,
              cancelledBy: userLabel,
              cancellationReason: cleanReason,
            }
          : s
      ),
      payments: [...reversalVouchers, ...updatedPayments],
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify(`تم إلغاء الفاتورة ${target.invoiceNumber} وإصدار السندات العكسية وإرجاع المخزون.`, 'info');
    return { ok: true };
  };

  const createPurchaseInvoice = (
    input: CreatePurchaseInput
  ): { ok: boolean; purchase?: PurchaseInvoice; error?: string } => {
    if (!hasPermission('canManageInventory')) {
      return { ok: false, error: 'ليس لديك صلاحية تسجيل فواتير الشراء.' };
    }

    const nowIso = new Date().toISOString();
    const res = processPurchaseInvoiceCreation({
      inventory: state.inventory,
      suppliers: state.suppliers,
      purchases: state.purchases,
      payments: state.payments,
      activeExchangeRate: state.activeExchangeRate,
      storeSettings,
      currentUserName: currentUser?.name || 'النظام',
      input,
      nowIso,
      uniqueIdFn: uniqueId,
      nextSequenceCodeFn: (prefix, existing, startAt = 2001, sep = '-') =>
        nextSequenceCode(prefix, existing, startAt, sep),
    });

    if (!res.ok || !res.purchase || !res.workingInventory || !res.newPayments) {
      return { ok: false, error: res.error || 'تعذر تسجيل فاتورة الشراء.' };
    }

    const newPurchase = res.purchase;
    const isOpeningBalance = newPurchase.purchaseType === 'opening_balance';
    const costMethod = storeSettings.costCalculationMethod;

    const audit = buildAuditEntry({
      action: isOpeningBalance ? 'create_opening_balance' : 'create_purchase',
      actionLabel: isOpeningBalance
        ? 'تسجيل رصيد افتتاحي للمخزن'
        : 'تسجيل فاتورة شراء وتوريد',
      entityType: 'purchase',
      entityId: newPurchase.id,
      reference: newPurchase.invoiceNumber,
      beforeValue: '-',
      afterValue: isOpeningBalance
        ? `رصيد افتتاحي (${newPurchase.items.length} أصناف) · إجمالي القيمة: ${formatCurrency(newPurchase.total, newPurchase.currency)} · بدون دين أو صرف نقدي`
        : `${newPurchase.supplierName} · الصافي: ${formatCurrency(newPurchase.total, newPurchase.currency)} · المدفوع: ${formatCurrency(newPurchase.paidTotal, newPurchase.currency)} · تكلفة: ${costMethod === 'weighted_avg' ? 'متوسط مرجّح' : 'آخر سعر'}`,
    });

    setState((prev) => ({
      ...prev,
      lastSavedAt: nowIso,
      inventory: res.workingInventory!,
      purchases: [newPurchase, ...prev.purchases],
      payments: [...res.newPayments!, ...prev.payments],
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));

    notify(
      isOpeningBalance
        ? `تم اعتماد الرصيد الافتتاحي ${newPurchase.invoiceNumber} وإدخال المواد للمخزون دون ديون أو قيود صندوق.`
        : `تم تسجيل فاتورة الشراء ${newPurchase.invoiceNumber} وإدخال البضاعة للمخزون.`
    );
    return { ok: true, purchase: newPurchase };
  };

  // ==================== INVOICE INBOX (صندوق وارد الفواتير المصورة) ====================
  const normalizeIsoDate = (rawDate: string, fallbackIso: string): string => {
    const clean = normalizeArabicDigits((rawDate || '').trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const dmy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    const parsed = new Date(clean);
    if (clean && !Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return fallbackIso.slice(0, 10);
  };

  const runBackgroundExtraction = useCallback(
    async (
      inboxId: string,
      filesForApi: { name: string; mimeType: string; base64Data: string }[]
    ) => {
      try {
        const res = await fetch('/api/invoices/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: filesForApi,
            knownSuppliers: state.suppliers.map((s) => s.name),
            defaultCurrency: 'IQD',
          }),
        });

        const rawBody = await res.text();
        let data: {
          ok?: boolean;
          error?: string;
          extracted?: {
            supplierName: string;
            invoiceNumber: string;
            invoiceDate: string;
            currency: CurrencyCode;
            discount: number;
            declaredTotal: number;
            notes: string;
            items: {
              name: string;
              sku: string;
              specs: string;
              quantity: number;
              unitCost: number;
              sellPrice: number;
            }[];
          };
        } = {};
        try {
          data = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          data = {
            ok: false,
            error: 'استجابة غير صالحة من الخادم أثناء قراءة الفاتورة.',
          };
        }

        if (!res.ok || !data.ok || !data.extracted) {
          const errMsg = data.error || 'تعذر قراءة بيانات الفاتورة من الصورة.';
          setState((prev) => ({
            ...prev,
            inboxInvoices: (prev.inboxInvoices || []).map((inv) =>
              inv.id === inboxId
                ? {
                    ...inv,
                    extractionStatus: 'failed',
                    extractionError: errMsg,
                  }
                : inv
            ),
          }));
          notify(`فشل قراءة فاتورة: ${errMsg}`, 'error', {
            label: 'فتح للمراجعة',
            onClick: () => openInboxReview(inboxId),
          });
          return;
        }

        const ext = data.extracted;
        const snapshot: InboxExtractedSnapshot = {
          supplierName: ext.supplierName || '',
          invoiceNumber: ext.invoiceNumber || '',
          invoiceDate: normalizeIsoDate(ext.invoiceDate || '', new Date().toISOString()),
          currency: ext.currency === 'USD' ? 'USD' : 'IQD',
          discount: Math.max(0, Number(ext.discount) || 0),
          declaredTotal: Math.max(0, Number(ext.declaredTotal) || 0),
          notes: ext.notes || '',
          items: Array.isArray(ext.items) ? ext.items : [],
        };

        setState((prev) => {
          const matchedSupplierId = matchSupplierByName(snapshot.supplierName, prev.suppliers);
          const builtLines: InboxReviewLine[] = snapshot.items.map((it, idx) => {
            const match = matchInventoryLine(it.name, it.sku, prev.inventory);
            const matchedInv = match.matchedItemId
              ? prev.inventory.find((x) => x.id === match.matchedItemId)
              : undefined;
            return {
              id: uniqueId(`iln-${idx}`),
              rawName: it.name,
              rawSku: it.sku || '',
              specs: it.specs || '',
              quantity: Number(it.quantity) || 0,
              unitCost: Number(it.unitCost) || 0,
              sellPrice:
                Number(it.sellPrice) > 0
                  ? Number(it.sellPrice)
                  : matchedInv?.cashPrice || 0,
              installmentPrice: matchedInv?.installmentPrice || 0,
              matchedItemId: match.matchedItemId,
              matchStatus: match.matchStatus,
              candidateItemIds: match.candidateItemIds,
            };
          });

          return {
            ...prev,
            inboxInvoices: (prev.inboxInvoices || []).map((inv) =>
              inv.id === inboxId
                ? {
                    ...inv,
                    extractionStatus: 'ready',
                    extractionError: undefined,
                    supplierId: matchedSupplierId,
                    supplierNameRead: snapshot.supplierName,
                    invoiceNumber:
                      snapshot.invoiceNumber ||
                      inv.invoiceNumber ||
                      nextSequenceCode(
                        'P',
                        prev.purchases.map((p) => p.invoiceNumber),
                        2001,
                        ''
                      ),
                    invoiceDate: snapshot.invoiceDate || inv.invoiceDate,
                    currency: snapshot.currency,
                    discount: snapshot.discount,
                    declaredTotal: snapshot.declaredTotal,
                    notes: snapshot.notes,
                    lines: builtLines,
                    extractedSnapshot: snapshot,
                  }
                : inv
            ),
          };
        });

        notify('تمت قراءة فاتورة جديدة، بانتظار مراجعتك', 'info', {
          label: 'مراجعة الآن',
          onClick: () => openInboxReview(inboxId),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'تعذر الاتصال بمحرك قراءة الفواتير.';
        setState((prev) => ({
          ...prev,
          inboxInvoices: (prev.inboxInvoices || []).map((inv) =>
            inv.id === inboxId
              ? {
                  ...inv,
                  extractionStatus: 'failed',
                  extractionError: msg,
                }
              : inv
          ),
        }));
        notify(`فشل قراءة فاتورة: ${msg}`, 'error', {
          label: 'مراجعة الفاتورة',
          onClick: () => openInboxReview(inboxId),
        });
      }
    },
    [state.suppliers, notify, openInboxReview]
  );

  const uploadFilesToInbox = async (
    files: File[]
  ): Promise<{ ok: boolean; inboxId?: string; error?: string }> => {
    try {
      if (!currentUser) {
        const msg = 'يرجى تسجيل الدخول أولاً قبل رفع الفواتير.';
        notify(msg, 'error');
        return { ok: false, error: msg };
      }
      if (
        !hasPermission('canManageInventory') &&
        currentUser.role !== 'cashier' &&
        currentUser.role !== 'accountant' &&
        currentUser.role !== 'admin'
      ) {
        const msg = 'ليس لديك صلاحية رفع الفواتير.';
        notify(msg, 'error');
        return { ok: false, error: msg };
      }
      if (!files || files.length === 0) {
        const msg = 'لم يتم اختيار أي ملف.';
        notify(msg, 'error');
        return { ok: false, error: msg };
      }

      const resolvedFiles = files
        .map((f) => ({ file: f, mimeType: inferInvoiceMimeType(f) }))
        .filter(
          (entry) =>
            entry.mimeType.startsWith('image/') || entry.mimeType === 'application/pdf'
        );

      if (resolvedFiles.length === 0) {
        const msg = 'يرجى رفع صور (PNG/JPG/WEBP) أو ملف PDF صالح.';
        notify(msg, 'error');
        return { ok: false, error: msg };
      }

      const pageFiles: InboxPageFile[] = [];
      const apiFiles: { name: string; mimeType: string; base64Data: string }[] = [];

      for (const { file, mimeType } of resolvedFiles) {
        const dataUrl = await readFileAsDataUrl(file, mimeType);
        const fileId = uniqueId('img');
        const hash = computeFastHash(dataUrl);
        await saveOriginalFileData(fileId, dataUrl);
        const thumb = await createThumbnailFromDataUrl(dataUrl, mimeType);
        const apiPayload = await prepareImageForApi(dataUrl, mimeType);

        pageFiles.push({
          id: fileId,
          name: file.name || 'صورة فاتورة',
          mimeType,
          sizeBytes: file.size,
          hash,
          thumbnailUrl: thumb,
          inlineDataUrl: dataUrl.length < 120000 ? dataUrl : undefined,
        });
        apiFiles.push({
          name: file.name || 'invoice',
          mimeType: apiPayload.mimeType,
          base64Data: apiPayload.base64Data,
        });
      }

      const combinedHash = pageFiles.map((f) => f.hash).sort().join('|');
      const pageHashSet = new Set(pageFiles.map((f) => f.hash));
      const existingDup = (state.inboxInvoices || []).find(
        (existing) =>
          existing.combinedHash === combinedHash ||
          existing.files.some((ef) => pageHashSet.has(ef.hash))
      );

      const nowIso = new Date().toISOString();
      const inboxId = uniqueId('inb');
      const newInbox: InboxInvoice = {
        id: inboxId,
        files: pageFiles,
        combinedHash,
        thumbnailUrl: pageFiles.find((f) => f.thumbnailUrl)?.thumbnailUrl || '',
        status: 'pending_review',
        extractionStatus: 'reading',
        uploadedAt: nowIso,
        uploadedById: currentUser.id,
        uploadedByName: currentUser.name,
        duplicateWarningOfId: existingDup?.id,
        supplierId: '',
        supplierNameRead: '',
        invoiceNumber: '',
        invoiceDate: nowIso.slice(0, 10),
        currency: 'IQD',
        purchaseType: 'credit',
        declaredTotal: 0,
        discount: 0,
        paidUSD: 0,
        paidIQD: 0,
        notes: '',
        lines: [],
      };

      const audit = buildAuditEntry({
        action: 'inbox_upload',
        actionLabel: 'رفع صورة فاتورة إلى صندوق الوارد',
        entityType: 'inbox',
        entityId: inboxId,
        reference: pageFiles.map((f) => f.name).join('، '),
        beforeValue: '-',
        afterValue: `قيد المراجعة (${pageFiles.length} صفحة/ملف)${existingDup ? ' · تنبيه: صورة مشابهة مرفوعة مسبقاً' : ''}`,
      });

      setState((prev) => ({
        ...prev,
        lastSavedAt: nowIso,
        inboxInvoices: [newInbox, ...(prev.inboxInvoices || [])],
        auditLogs: [audit, ...(prev.auditLogs || [])],
      }));

      if (existingDup) {
        notify(
          'تم حفظ الصورة في صندوق الوارد، مع تنبيه: توجد صورة مطابقة أو مشابهة مرفوعة سابقاً.',
          'info',
          { label: 'عرض في الفواتير', onClick: () => openInboxReview(inboxId) }
        );
      } else {
        notify('تم حفظ الصورة في صندوق الوارد وبدأت القراءة في الخلفية.', 'info', {
          label: 'عرض في الفواتير',
          onClick: () => openInboxReview(inboxId),
        });
      }

      void runBackgroundExtraction(inboxId, apiFiles);
      return { ok: true, inboxId };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'تعذر حفظ الملف المرفوع. يرجى المحاولة مرة أخرى.';
      notify(msg, 'error');
      return { ok: false, error: msg };
    }
  };

  const retryInboxExtraction = async (
    inboxId: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const target = (state.inboxInvoices || []).find((x) => x.id === inboxId);
    if (!target) return { ok: false, error: 'السجل غير موجود.' };
    if (target.status !== 'pending_review') {
      return { ok: false, error: 'لا يمكن إعادة قراءة فاتورة معتمدة أو مرفوضة.' };
    }

    const apiFiles: { name: string; mimeType: string; base64Data: string }[] = [];
    for (const f of target.files) {
      const dataUrl = await loadOriginalFileData(f.id, f.inlineDataUrl);
      if (dataUrl) {
        const prepared = await prepareImageForApi(dataUrl, f.mimeType);
        apiFiles.push({
          name: f.name,
          mimeType: prepared.mimeType,
          base64Data: prepared.base64Data,
        });
      }
    }
    if (apiFiles.length === 0) {
      const msg = 'تعذر العثور على ملف الصورة الأصلي لإعادة القراءة.';
      notify(msg, 'error');
      return { ok: false, error: msg };
    }

    const audit = buildAuditEntry({
      action: 'inbox_retry',
      actionLabel: 'إعادة قراءة فاتورة من صندوق الوارد',
      entityType: 'inbox',
      entityId: inboxId,
      reference: target.invoiceNumber || target.files[0]?.name,
      afterValue: 'إعادة إرسال للمعالجة',
    });

    setState((prev) => ({
      ...prev,
      inboxInvoices: (prev.inboxInvoices || []).map((inv) =>
        inv.id === inboxId
          ? { ...inv, extractionStatus: 'reading', extractionError: undefined }
          : inv
      ),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));

    void runBackgroundExtraction(inboxId, apiFiles);
    return { ok: true };
  };

  const saveInboxReviewDraft = (
    inboxId: string,
    patch: Partial<InboxInvoice>,
    recordAudit = true
  ): { ok: boolean; error?: string } => {
    const target = (state.inboxInvoices || []).find((x) => x.id === inboxId);
    if (!target) return { ok: false, error: 'الفاتورة غير موجودة في صندوق الوارد.' };
    if (target.status === 'approved') {
      return { ok: false, error: 'لا يمكن تعديل فاتورة معتمدة مسبقاً.' };
    }

    const nowIso = new Date().toISOString();
    const updated: InboxInvoice = {
      ...target,
      ...patch,
      reviewedAt: nowIso,
      reviewedByName: currentUser?.name || 'النظام',
      hasDraftEdits: true,
    };

    const diff = buildExtractedDiffSummary(updated, state.suppliers);

    setState((prev) => ({
      ...prev,
      lastSavedAt: nowIso,
      inboxInvoices: (prev.inboxInvoices || []).map((inv) =>
        inv.id === inboxId ? updated : inv
      ),
      auditLogs: recordAudit
        ? [
            buildAuditEntry({
              action: 'inbox_review',
              actionLabel: 'حفظ مسودة مراجعة فاتورة واردة',
              entityType: 'inbox',
              entityId: inboxId,
              reference: updated.invoiceNumber || target.files[0]?.name,
              beforeValue: diff.before,
              afterValue: diff.after,
              note: diff.changesText,
            }),
            ...(prev.auditLogs || []),
          ]
        : prev.auditLogs,
    }));

    if (recordAudit) {
      notify('تم حفظ مسودة المراجعة دون التأثير على المخزون أو الحسابات.', 'info');
    }
    return { ok: true };
  };

  const approveInboxInvoice = (
    inboxId: string,
    finalOverride?: Partial<InboxInvoice>
  ): { ok: boolean; purchase?: PurchaseInvoice; error?: string } => {
    if (!hasPermission('canApproveInboxInvoices')) {
      return {
        ok: false,
        error: 'اعتماد فواتير الصور متاح لصاحب صلاحية محاسب أو مدير فقط.',
      };
    }

    const target = (state.inboxInvoices || []).find((x) => x.id === inboxId);
    if (!target) {
      return { ok: false, error: 'الفاتورة غير موجودة في صندوق الوارد.' };
    }
    if (target.status === 'approved') {
      return {
        ok: false,
        error: `تم اعتماد هذه الفاتورة مسبقاً برقم (${target.linkedPurchaseNumber || target.invoiceNumber}) ولا يمكن اعتماد نفس الصورة مرتين.`,
      };
    }
    if (target.status === 'rejected') {
      return { ok: false, error: 'هذه الفاتورة مرفوضة ولا يمكن اعتمادها.' };
    }

    const candidate: InboxInvoice = {
      ...target,
      ...(finalOverride || {}),
    };

    const validation = validateInboxReview({
      inbox: candidate,
      inventory: state.inventory,
      purchases: state.purchases,
    });
    if (!validation.canApprove) {
      return {
        ok: false,
        error: validation.blockingErrors[0] || 'تحقق من أخطاء المراجعة قبل الاعتماد.',
      };
    }

    const nowIso = new Date().toISOString();
    const res = processPurchaseInvoiceCreation({
      inventory: state.inventory,
      suppliers: state.suppliers,
      purchases: state.purchases,
      payments: state.payments,
      activeExchangeRate: state.activeExchangeRate,
      storeSettings,
      currentUserName: currentUser?.name || 'النظام',
      nowIso,
      uniqueIdFn: uniqueId,
      nextSequenceCodeFn: (prefix, existing, startAt = 2001, sep = '-') =>
        nextSequenceCode(prefix, existing, startAt, sep),
      input: {
        supplierId: candidate.purchaseType === 'opening_balance' ? '' : candidate.supplierId,
        purchaseType: candidate.purchaseType,
        currency: candidate.currency,
        invoiceNumber: candidate.invoiceNumber.trim(),
        date: candidate.invoiceDate ? new Date(candidate.invoiceDate).toISOString() : nowIso,
        invoiceExchangeRate: state.activeExchangeRate,
        discount: candidate.purchaseType === 'opening_balance' ? 0 : candidate.discount,
        paidUSD: candidate.paidUSD || 0,
        paidIQD: candidate.paidIQD || 0,
        paymentExchangeRate: state.activeExchangeRate,
        notes: candidate.notes,
        sourceInboxId: candidate.id,
        items: candidate.lines.map((line) => {
          const matchedInv = line.matchedItemId
            ? state.inventory.find((i) => i.id === line.matchedItemId)
            : undefined;
          return {
            itemId: line.createAsNew ? undefined : line.matchedItemId,
            isNewItem: Boolean(line.createAsNew),
            sku: line.createAsNew
              ? sanitizeBarcode(line.newSku || line.rawSku || '')
              : matchedInv?.sku || line.rawSku,
            name: line.createAsNew
              ? (line.newName || line.rawName).trim()
              : matchedInv
              ? `${matchedInv.brand} ${matchedInv.model}`.trim()
              : line.rawName,
            specs: line.specs,
            quantity: line.quantity,
            unitCost: line.unitCost,
            sellPrice: line.sellPrice,
            installmentPrice: line.installmentPrice,
          };
        }),
      },
    });

    if (!res.ok || !res.purchase || !res.workingInventory || !res.newPayments) {
      return { ok: false, error: res.error || 'تعذر اعتماد الفاتورة وإضافتها للمشتريات.' };
    }

    const newPurchase = res.purchase;
    const diff = buildExtractedDiffSummary(candidate, state.suppliers);

    const inboxAudit = buildAuditEntry({
      action: 'inbox_approve',
      actionLabel: 'اعتماد فاتورة واردة وإضافتها للمشتريات',
      entityType: 'inbox',
      entityId: candidate.id,
      reference: newPurchase.invoiceNumber,
      beforeValue: diff.before,
      afterValue: diff.after,
      note: `رفعها: ${candidate.uploadedByName} · راجعها: ${candidate.reviewedByName || currentUser?.name || '-'} · التعديلات: ${diff.changesText}`,
    });

    setState((prev) => ({
      ...prev,
      lastSavedAt: nowIso,
      inventory: res.workingInventory!,
      purchases: [newPurchase, ...prev.purchases],
      payments: [...res.newPayments!, ...prev.payments],
      inboxInvoices: (prev.inboxInvoices || []).map((inv) =>
        inv.id === inboxId
          ? {
              ...candidate,
              status: 'approved',
              reviewedAt: candidate.reviewedAt || nowIso,
              reviewedByName: candidate.reviewedByName || currentUser?.name || 'النظام',
              approvedAt: nowIso,
              approvedByName: currentUser?.name || 'النظام',
              linkedPurchaseId: newPurchase.id,
              linkedPurchaseNumber: newPurchase.invoiceNumber,
            }
          : inv
      ),
      auditLogs: [inboxAudit, ...(prev.auditLogs || [])],
    }));

    notify(
      `تم اعتماد الفاتورة ${newPurchase.invoiceNumber} وإضافتها لفواتير الشراء وتحديث المخزن.`
    );
    return { ok: true, purchase: newPurchase };
  };

  const rejectInboxInvoice = (
    inboxId: string,
    reason: string
  ): { ok: boolean; error?: string } => {
    if (!hasPermission('canApproveInboxInvoices')) {
      return {
        ok: false,
        error: 'رفض الفواتير متاح لصاحب صلاحية محاسب أو مدير فقط.',
      };
    }
    const cleanReason = reason.trim();
    if (!cleanReason) {
      return { ok: false, error: 'يرجى كتابة سبب الرفض الإلزامي.' };
    }
    const target = (state.inboxInvoices || []).find((x) => x.id === inboxId);
    if (!target) return { ok: false, error: 'الفاتورة غير موجودة.' };
    if (target.status === 'approved') {
      return { ok: false, error: 'لا يمكن رفض فاتورة تم اعتمادها مسبقاً.' };
    }
    if (target.status === 'rejected') {
      return { ok: false, error: 'هذه الفاتورة مرفوضة مسبقاً.' };
    }

    const nowIso = new Date().toISOString();
    const audit = buildAuditEntry({
      action: 'inbox_reject',
      actionLabel: 'رفض فاتورة صورة في صندوق الوارد',
      entityType: 'inbox',
      entityId: inboxId,
      reference: target.invoiceNumber || target.files[0]?.name,
      beforeValue: `قيد المراجعة (رفعها: ${target.uploadedByName})`,
      afterValue: 'مرفوضة/ملغاة (مع حفظ الصورة الأصلية)',
      reason: cleanReason,
    });

    setState((prev) => ({
      ...prev,
      lastSavedAt: nowIso,
      inboxInvoices: (prev.inboxInvoices || []).map((inv) =>
        inv.id === inboxId
          ? {
              ...inv,
              status: 'rejected',
              reviewedAt: inv.reviewedAt || nowIso,
              reviewedByName: inv.reviewedByName || currentUser?.name || 'النظام',
              rejectedAt: nowIso,
              rejectedByName: currentUser?.name || 'النظام',
              rejectionReason: cleanReason,
            }
          : inv
      ),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));

    notify('تم رفض الفاتورة وتسجيل السبب مع الإبقاء على الصورة الأصلية.', 'info');
    return { ok: true };
  };

  const cancelPurchaseInvoice = (purchaseId: string, reason: string): { ok: boolean; error?: string } => {
    if (!hasPermission('canDeleteRecords')) {
      return { ok: false, error: 'إلغاء فواتير الشراء متاح للمدير أو المخولين فقط.' };
    }
    const cleanReason = reason.trim();
    if (!cleanReason) {
      return { ok: false, error: 'يرجى كتابة سبب الإلغاء الإلزامي.' };
    }
    const target = state.purchases.find((p) => p.id === purchaseId);
    if (!target) return { ok: false, error: 'فاتورة الشراء غير موجودة.' };
    if (target.status === 'cancelled') {
      return { ok: false, error: 'هذه الفاتورة ملغاة مسبقاً.' };
    }

    const nowIso = new Date().toISOString();
    const userLabel = currentUser?.name || 'النظام';
    const allowNeg = storeSettings.allowNegativeStock;

    const updatedInventory = state.inventory.map((inv) => {
      const lines = target.items.filter((l) => l.itemId === inv.id);
      if (!lines.length) return inv;
      const qtyRemove = lines.reduce((s, l) => s + l.quantity, 0);
      const imeisRemove = new Set(lines.flatMap((l) => l.imeiList));
      return {
        ...inv,
        quantity: allowNeg ? inv.quantity - qtyRemove : Math.max(0, inv.quantity - qtyRemove),
        imeiList: inv.imeiList.filter((im) => !imeisRemove.has(im)),
        updatedAt: nowIso,
      };
    });

    const reversalVouchers: PaymentTransaction[] = [];
    const updatedPayments = state.payments.map((p) => {
      if (p.invoiceId === purchaseId && p.status !== 'cancelled' && !p.isReversal) {
        reversalVouchers.push({
          id: uniqueId('pay-rev'),
          voucherNumber: `REV-${p.voucherNumber}`,
          date: nowIso,
          partyType: p.partyType,
          partyId: p.partyId,
          partyName: p.partyName,
          category: 'reversal',
          invoiceId: p.invoiceId,
          invoiceNumber: p.invoiceNumber,
          invoiceCurrency: p.invoiceCurrency,
          invoiceExchangeRate: p.invoiceExchangeRate,
          paidUSD: p.paidUSD ? -p.paidUSD : 0,
          paidIQD: p.paidIQD ? -p.paidIQD : 0,
          paymentExchangeRate: p.paymentExchangeRate,
          settledInInvoiceCurrency: -p.settledInInvoiceCurrency,
          autoCalculatedSettled: -p.autoCalculatedSettled,
          fxDiffIQD: p.fxDiffIQD ? -p.fxDiffIQD : 0,
          fxDiffUSD: p.fxDiffUSD ? -p.fxDiffUSD : 0,
          isManualOverride: p.isManualOverride,
          notes: `سند عكسي لإلغاء فاتورة الشراء ${target.invoiceNumber} — السبب: ${cleanReason}`,
          createdBy: userLabel,
          status: 'active',
          isReversal: true,
          reversalOfId: p.id,
        });
        return {
          ...p,
          status: 'cancelled' as const,
          cancelledAt: nowIso,
          cancelledBy: userLabel,
          cancellationReason: `إلغاء الفاتورة ${target.invoiceNumber}: ${cleanReason}`,
        };
      }
      return p;
    });

    const audit = buildAuditEntry({
      action: 'cancel_purchase',
      actionLabel: 'إلغاء فاتورة شراء وعكس قيودها',
      entityType: 'purchase',
      entityId: target.id,
      reference: target.invoiceNumber,
      beforeValue: `نشطة · الإجمالي: ${formatCurrency(target.total, target.currency)}`,
      afterValue: `ملغاة (${reversalVouchers.length} سند عكسي + خصم الكمية الموردة)`,
      reason: cleanReason,
    });

    setState((prev) => ({
      ...prev,
      lastSavedAt: nowIso,
      inventory: updatedInventory,
      purchases: prev.purchases.map((p) =>
        p.id === purchaseId
          ? {
              ...p,
              status: 'cancelled',
              cancelledAt: nowIso,
              cancelledBy: userLabel,
              cancellationReason: cleanReason,
            }
          : p
      ),
      payments: [...reversalVouchers, ...updatedPayments],
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify(`تم إلغاء فاتورة الشراء ${target.invoiceNumber} وإصدار السندات العكسية.`, 'info');
    return { ok: true };
  };

  const recordSettlement = (
    input: RecordSettlementInput
  ): { ok: boolean; payment?: PaymentTransaction; payments?: PaymentTransaction[]; error?: string } => {
    if (input.partyType === 'customer' && !hasPermission('canReceivePayments')) {
      return { ok: false, error: 'ليس لديك صلاحية قبض المدفوعات من الزبائن.' };
    }
    if (input.partyType === 'supplier' && !hasPermission('canPaySuppliers')) {
      return { ok: false, error: 'ليس لديك صلاحية تسديد الموردين.' };
    }
    const cleanPaidUSD = Math.max(0, Number(input.paidUSD) || 0);
    const cleanPaidIQD = Math.max(0, Math.round(Number(input.paidIQD) || 0));
    if (cleanPaidUSD <= 0 && cleanPaidIQD <= 0) {
      return { ok: false, error: 'يرجى إدخال مبلغ بالدولار أو بالدينار.' };
    }

    const nowIso = new Date().toISOString();
    const payRate = input.paymentExchangeRate > 0 ? input.paymentExchangeRate : state.activeExchangeRate;
    const allowOverride = hasPermission('canOverrideFXDiff');

    if (input.partyType === 'customer') {
      const allocateOnSale = (
        sale: SaleInvoice,
        usdAmt: number,
        iqdAmt: number,
        voucherNum: string,
        instId?: string
      ) => {
        const fxCalc = calculateSettlementFX({
          partyType: 'customer',
          invoiceCurrency: sale.currency,
          invoiceExchangeRate: sale.exchangeRateAtSale,
          paymentExchangeRate: payRate,
          paidUSD: usdAmt,
          paidIQD: iqdAmt,
          manualSettledAmount: allowOverride && input.invoiceId ? input.manualSettledAmount : null,
          manualFxDiffIQD: allowOverride && input.invoiceId ? input.manualFxDiffIQD : null,
        });

        const appliedAmount = Math.min(sale.remainingAmount, fxCalc.settledInInvoiceCurrency);
        const newPayment: PaymentTransaction = {
          id: uniqueId('pay'),
          voucherNumber: voucherNum,
          date: nowIso,
          partyType: 'customer',
          partyId: sale.customerId,
          partyName: sale.customerName,
          category: sale.saleType === 'installment' ? 'installment_receipt' : 'credit_receipt',
          invoiceId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          invoiceCurrency: sale.currency,
          invoiceExchangeRate: sale.exchangeRateAtSale,
          paidUSD: usdAmt,
          paidIQD: Math.round(iqdAmt),
          paymentExchangeRate: payRate,
          settledInInvoiceCurrency: appliedAmount,
          autoCalculatedSettled: fxCalc.autoSettledInInvoiceCurrency,
          fxDiffIQD: fxCalc.fxDiffIQD,
          fxDiffUSD: fxCalc.fxDiffUSD,
          isManualOverride: fxCalc.isManualOverride,
          installmentId: instId,
          notes: input.notes,
          createdBy: currentUser?.name || 'النظام',
          status: 'active',
        };

        let remainingToAllocate = appliedAmount;
        const orderedInstallments = [...sale.installments];
        if (instId) {
          const idx = orderedInstallments.findIndex((i) => i.id === instId);
          if (idx > 0) {
            const [picked] = orderedInstallments.splice(idx, 1);
            orderedInstallments.unshift(picked);
          }
        }

        const updatedMap = new Map<string, InstallmentScheduleItem>();
        for (const inst of orderedInstallments) {
          const dueLeft = Math.max(0, inst.amount - inst.paidAmount);
          if (remainingToAllocate > 0 && dueLeft > 0) {
            const payHere = Math.min(dueLeft, remainingToAllocate);
            const newPaid =
              sale.currency === 'USD'
                ? Number((inst.paidAmount + payHere).toFixed(2))
                : Math.round(inst.paidAmount + payHere);
            remainingToAllocate =
              sale.currency === 'USD'
                ? Number((remainingToAllocate - payHere).toFixed(2))
                : Math.round(remainingToAllocate - payHere);
            const isFullyPaid = newPaid >= inst.amount - (sale.currency === 'USD' ? 0.01 : 1);
            updatedMap.set(inst.id, {
              ...inst,
              paidAmount: isFullyPaid ? inst.amount : newPaid,
              status: isFullyPaid ? 'paid' : 'partial',
              lastPaidDate: nowIso.slice(0, 10),
            });
          } else {
            updatedMap.set(inst.id, inst);
          }
        }

        const nextInstallments = sale.installments.map((inst) => updatedMap.get(inst.id) || inst);
        const nextPaidTotal =
          sale.currency === 'USD'
            ? Number((sale.paidTotal + appliedAmount).toFixed(2))
            : Math.round(sale.paidTotal + appliedAmount);
        const nextRemaining =
          sale.currency === 'USD'
            ? Number(Math.max(0, sale.total - nextPaidTotal).toFixed(2))
            : Math.max(0, Math.round(sale.total - nextPaidTotal));

        return {
          newPayment,
          fxCalc,
          updatedSale: {
            ...sale,
            paidTotal: nextPaidTotal,
            remainingAmount: nextRemaining,
            installments: nextInstallments,
          },
        };
      };

      if (input.invoiceId) {
        const sale = state.sales.find((s) => s.id === input.invoiceId && s.status !== 'cancelled');
        if (!sale) return { ok: false, error: 'الفاتورة غير موجودة أو ملغاة.' };

        const voucherNumber = nextSequenceCode(
          'RV',
          state.payments.filter((p) => p.partyType === 'customer' && !p.isReversal).map((p) => p.voucherNumber),
          3001
        );
        const { newPayment, fxCalc, updatedSale } = allocateOnSale(
          sale,
          cleanPaidUSD,
          cleanPaidIQD,
          voucherNumber,
          input.installmentId
        );

        const nextLogs = [...state.exchangeLogs];
        if (fxCalc.hasCurrencyConversion || payRate !== sale.exchangeRateAtSale) {
          nextLogs.unshift({
            id: uniqueId('fx'),
            date: nowIso,
            previousRate: sale.exchangeRateAtSale,
            newRate: payRate,
            source: fxCalc.hasCurrencyConversion ? 'auto_conversion' : 'settlement',
            reference: voucherNumber,
            note: `سند قبض ${voucherNumber} (${sale.invoiceNumber}) · فرق الصرف: ${fxCalc.fxDiffIQD >= 0 ? '+' : ''}${fxCalc.fxDiffIQD.toLocaleString()} د.ع`,
            userName: currentUser?.name || 'النظام',
          });
        }

        const audit = buildAuditEntry({
          action: 'record_payment',
          actionLabel: 'تسجيل سند قبض من زبون',
          entityType: 'payment',
          entityId: newPayment.id,
          reference: `${voucherNumber} (${sale.invoiceNumber})`,
          beforeValue: `متبقي: ${formatCurrency(sale.remainingAmount, sale.currency)}`,
          afterValue: `تم قبض ${formatCurrency(newPayment.settledInInvoiceCurrency, sale.currency)} · متبقي: ${formatCurrency(updatedSale.remainingAmount, sale.currency)}`,
        });

        setState((prev) => ({
          ...prev,
          lastSavedAt: nowIso,
          sales: prev.sales.map((s) => (s.id === sale.id ? updatedSale : s)),
          payments: [newPayment, ...prev.payments],
          exchangeLogs: nextLogs,
          auditLogs: [audit, ...(prev.auditLogs || [])],
        }));

        notify(`تم تسجيل سند القبض ${voucherNumber} بنجاح.`);
        return { ok: true, payment: newPayment, payments: [newPayment] };
      }

      const openSales = state.sales
        .filter((s) => s.status !== 'cancelled' && s.customerId === input.partyId && s.remainingAmount > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (openSales.length === 0) {
        return { ok: false, error: 'لا توجد فواتير مفتوحة أو ذمم متبقية على هذا الزبون.' };
      }

      let poolUSD = cleanPaidUSD;
      let poolIQD = cleanPaidIQD;
      const existingRV = state.payments
        .filter((p) => p.partyType === 'customer' && !p.isReversal)
        .map((p) => p.voucherNumber);
      const createdPayments: PaymentTransaction[] = [];
      const updatedSalesMap = new Map<string, SaleInvoice>();
      const newFxLogs = [...state.exchangeLogs];

      const orderedPasses = [
        ...openSales.filter((s) => (s.currency === 'USD' && poolUSD > 0) || (s.currency === 'IQD' && poolIQD > 0)),
        ...openSales,
      ];
      const visitedSaleIds = new Set<string>();

      for (const baseSale of orderedPasses) {
        if (visitedSaleIds.has(baseSale.id)) continue;
        if (poolUSD <= 0.005 && poolIQD <= 0) break;

        const currentSale = updatedSalesMap.get(baseSale.id) || baseSale;
        if (currentSale.remainingAmount <= 0) continue;

        let takeUSD = 0;
        let takeIQD = 0;

        if (currentSale.currency === 'USD') {
          let neededUSD = currentSale.remainingAmount;
          if (poolUSD > 0) {
            takeUSD = Number(Math.min(poolUSD, neededUSD).toFixed(2));
            poolUSD = Number((poolUSD - takeUSD).toFixed(2));
            neededUSD = Number((neededUSD - takeUSD).toFixed(2));
          }
          if (neededUSD > 0.005 && poolIQD > 0) {
            const maxIqdForRest = Math.round(neededUSD * payRate);
            takeIQD = Math.min(poolIQD, maxIqdForRest);
            poolIQD -= takeIQD;
          }
        } else {
          let neededIQD = currentSale.remainingAmount;
          if (poolIQD > 0) {
            takeIQD = Math.min(poolIQD, neededIQD);
            poolIQD -= takeIQD;
            neededIQD -= takeIQD;
          }
          if (neededIQD > 0 && poolUSD > 0.005) {
            const maxUsdForRest = Number((neededIQD / payRate).toFixed(2));
            takeUSD = Number(Math.min(poolUSD, maxUsdForRest).toFixed(2));
            poolUSD = Number((poolUSD - takeUSD).toFixed(2));
          }
        }

        if (takeUSD <= 0 && takeIQD <= 0) continue;
        visitedSaleIds.add(currentSale.id);

        const vNum = nextSequenceCode('RV', [...existingRV, ...createdPayments.map((x) => x.voucherNumber)], 3001);
        const { newPayment, fxCalc, updatedSale } = allocateOnSale(currentSale, takeUSD, takeIQD, vNum);
        createdPayments.push(newPayment);
        updatedSalesMap.set(currentSale.id, updatedSale);

        if (fxCalc.hasCurrencyConversion || payRate !== currentSale.exchangeRateAtSale) {
          newFxLogs.unshift({
            id: uniqueId('fx'),
            date: nowIso,
            previousRate: currentSale.exchangeRateAtSale,
            newRate: payRate,
            source: fxCalc.hasCurrencyConversion ? 'auto_conversion' : 'settlement',
            reference: vNum,
            note: `سند قبض ${vNum} (${currentSale.invoiceNumber}) · فرق الصرف: ${fxCalc.fxDiffIQD >= 0 ? '+' : ''}${fxCalc.fxDiffIQD.toLocaleString()} د.ع`,
            userName: currentUser?.name || 'النظام',
          });
        }
      }

      if (createdPayments.length === 0) {
        return { ok: false, error: 'تعذر احتساب المبلغ على الفواتير المفتوحة.' };
      }

      const audit = buildAuditEntry({
        action: 'record_payment',
        actionLabel: 'تسجيل قبض وتوزيع آلي على فواتير زبون',
        entityType: 'payment',
        reference: createdPayments.map((x) => x.voucherNumber).join('، '),
        beforeValue: `فواتير مفتوحة: ${openSales.length}`,
        afterValue: `${createdPayments[0].partyName} · ${createdPayments.length} سندات صادرة`,
      });

      setState((prev) => ({
        ...prev,
        lastSavedAt: nowIso,
        sales: prev.sales.map((s) => updatedSalesMap.get(s.id) || s),
        payments: [...createdPayments.reverse(), ...prev.payments],
        exchangeLogs: newFxLogs,
        auditLogs: [audit, ...(prev.auditLogs || [])],
      }));

      notify(
        createdPayments.length === 1
          ? `تم تسجيل سند القبض ${createdPayments[0].voucherNumber} بنجاح.`
          : `تم تسديد ${createdPayments.length} فواتير وإصدار السندات بنجاح.`
      );
      return { ok: true, payment: createdPayments[0], payments: createdPayments };
    } else {
      const allocateOnPurchase = (
        purchase: PurchaseInvoice,
        usdAmt: number,
        iqdAmt: number,
        voucherNum: string
      ) => {
        const fxCalc = calculateSettlementFX({
          partyType: 'supplier',
          invoiceCurrency: purchase.currency,
          invoiceExchangeRate: purchase.exchangeRateAtPurchase,
          paymentExchangeRate: payRate,
          paidUSD: usdAmt,
          paidIQD: iqdAmt,
          manualSettledAmount: allowOverride && input.invoiceId ? input.manualSettledAmount : null,
          manualFxDiffIQD: allowOverride && input.invoiceId ? input.manualFxDiffIQD : null,
        });

        const appliedAmount = Math.min(purchase.remainingAmount, fxCalc.settledInInvoiceCurrency);
        const newPayment: PaymentTransaction = {
          id: uniqueId('pay'),
          voucherNumber: voucherNum,
          date: nowIso,
          partyType: 'supplier',
          partyId: purchase.supplierId,
          partyName: purchase.supplierName,
          category: 'supplier_payment',
          invoiceId: purchase.id,
          invoiceNumber: purchase.invoiceNumber,
          invoiceCurrency: purchase.currency,
          invoiceExchangeRate: purchase.exchangeRateAtPurchase,
          paidUSD: usdAmt,
          paidIQD: Math.round(iqdAmt),
          paymentExchangeRate: payRate,
          settledInInvoiceCurrency: appliedAmount,
          autoCalculatedSettled: fxCalc.autoSettledInInvoiceCurrency,
          fxDiffIQD: fxCalc.fxDiffIQD,
          fxDiffUSD: fxCalc.fxDiffUSD,
          isManualOverride: fxCalc.isManualOverride,
          notes: input.notes,
          createdBy: currentUser?.name || 'النظام',
          status: 'active',
        };

        const nextPaidTotal =
          purchase.currency === 'USD'
            ? Number((purchase.paidTotal + appliedAmount).toFixed(2))
            : Math.round(purchase.paidTotal + appliedAmount);
        const nextRemaining =
          purchase.currency === 'USD'
            ? Number(Math.max(0, purchase.total - nextPaidTotal).toFixed(2))
            : Math.max(0, Math.round(purchase.total - nextPaidTotal));

        return {
          newPayment,
          fxCalc,
          updatedPurchase: {
            ...purchase,
            paidTotal: nextPaidTotal,
            remainingAmount: nextRemaining,
          },
        };
      };

      if (input.invoiceId) {
        const purchase = state.purchases.find((p) => p.id === input.invoiceId && p.status !== 'cancelled');
        if (!purchase) return { ok: false, error: 'فاتورة الشراء غير موجودة أو ملغاة.' };

        const voucherNumber = nextSequenceCode(
          'PV',
          state.payments.filter((p) => p.partyType === 'supplier' && !p.isReversal).map((p) => p.voucherNumber),
          4001
        );
        const { newPayment, fxCalc, updatedPurchase } = allocateOnPurchase(
          purchase,
          cleanPaidUSD,
          cleanPaidIQD,
          voucherNumber
        );

        const nextLogs = [...state.exchangeLogs];
        if (fxCalc.hasCurrencyConversion || payRate !== purchase.exchangeRateAtPurchase) {
          nextLogs.unshift({
            id: uniqueId('fx'),
            date: nowIso,
            previousRate: purchase.exchangeRateAtPurchase,
            newRate: payRate,
            source: fxCalc.hasCurrencyConversion ? 'auto_conversion' : 'settlement',
            reference: voucherNumber,
            note: `سند تسديد مورد ${voucherNumber} (${purchase.invoiceNumber}) · فرق الصرف: ${fxCalc.fxDiffIQD >= 0 ? '+' : ''}${fxCalc.fxDiffIQD.toLocaleString()} د.ع`,
            userName: currentUser?.name || 'النظام',
          });
        }

        const audit = buildAuditEntry({
          action: 'record_payment',
          actionLabel: 'تسجيل سند تسديد مورد',
          entityType: 'payment',
          entityId: newPayment.id,
          reference: `${voucherNumber} (${purchase.invoiceNumber})`,
          beforeValue: `متبقي: ${formatCurrency(purchase.remainingAmount, purchase.currency)}`,
          afterValue: `تم دفع ${formatCurrency(newPayment.settledInInvoiceCurrency, purchase.currency)} · متبقي: ${formatCurrency(updatedPurchase.remainingAmount, purchase.currency)}`,
        });

        setState((prev) => ({
          ...prev,
          lastSavedAt: nowIso,
          purchases: prev.purchases.map((p) => (p.id === purchase.id ? updatedPurchase : p)),
          payments: [newPayment, ...prev.payments],
          exchangeLogs: nextLogs,
          auditLogs: [audit, ...(prev.auditLogs || [])],
        }));

        notify(`تم تسجيل سند تسديد المورد ${voucherNumber} بنجاح.`);
        return { ok: true, payment: newPayment, payments: [newPayment] };
      }

      const openPurchases = state.purchases
        .filter((p) => p.status !== 'cancelled' && p.supplierId === input.partyId && p.remainingAmount > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (openPurchases.length === 0) {
        return { ok: false, error: 'لا توجد فواتير شراء مفتوحة أو ذمم مستحقة لهذا المورد.' };
      }

      let poolUSD = cleanPaidUSD;
      let poolIQD = cleanPaidIQD;
      const existingPV = state.payments
        .filter((p) => p.partyType === 'supplier' && !p.isReversal)
        .map((p) => p.voucherNumber);
      const createdPayments: PaymentTransaction[] = [];
      const updatedPurchasesMap = new Map<string, PurchaseInvoice>();
      const newFxLogs = [...state.exchangeLogs];

      const orderedPasses = [
        ...openPurchases.filter((p) => (p.currency === 'USD' && poolUSD > 0) || (p.currency === 'IQD' && poolIQD > 0)),
        ...openPurchases,
      ];
      const visitedPurchaseIds = new Set<string>();

      for (const basePurchase of orderedPasses) {
        if (visitedPurchaseIds.has(basePurchase.id)) continue;
        if (poolUSD <= 0.005 && poolIQD <= 0) break;

        const currentPur = updatedPurchasesMap.get(basePurchase.id) || basePurchase;
        if (currentPur.remainingAmount <= 0) continue;

        let takeUSD = 0;
        let takeIQD = 0;

        if (currentPur.currency === 'USD') {
          let neededUSD = currentPur.remainingAmount;
          if (poolUSD > 0) {
            takeUSD = Number(Math.min(poolUSD, neededUSD).toFixed(2));
            poolUSD = Number((poolUSD - takeUSD).toFixed(2));
            neededUSD = Number((neededUSD - takeUSD).toFixed(2));
          }
          if (neededUSD > 0.005 && poolIQD > 0) {
            const maxIqdForRest = Math.round(neededUSD * payRate);
            takeIQD = Math.min(poolIQD, maxIqdForRest);
            poolIQD -= takeIQD;
          }
        } else {
          let neededIQD = currentPur.remainingAmount;
          if (poolIQD > 0) {
            takeIQD = Math.min(poolIQD, neededIQD);
            poolIQD -= takeIQD;
            neededIQD -= takeIQD;
          }
          if (neededIQD > 0 && poolUSD > 0.005) {
            const maxUsdForRest = Number((neededIQD / payRate).toFixed(2));
            takeUSD = Number(Math.min(poolUSD, maxUsdForRest).toFixed(2));
            poolUSD = Number((poolUSD - takeUSD).toFixed(2));
          }
        }

        if (takeUSD <= 0 && takeIQD <= 0) continue;
        visitedPurchaseIds.add(currentPur.id);

        const vNum = nextSequenceCode('PV', [...existingPV, ...createdPayments.map((x) => x.voucherNumber)], 4001);
        const { newPayment, fxCalc, updatedPurchase } = allocateOnPurchase(currentPur, takeUSD, takeIQD, vNum);
        createdPayments.push(newPayment);
        updatedPurchasesMap.set(currentPur.id, updatedPurchase);

        if (fxCalc.hasCurrencyConversion || payRate !== currentPur.exchangeRateAtPurchase) {
          newFxLogs.unshift({
            id: uniqueId('fx'),
            date: nowIso,
            previousRate: currentPur.exchangeRateAtPurchase,
            newRate: payRate,
            source: fxCalc.hasCurrencyConversion ? 'auto_conversion' : 'settlement',
            reference: vNum,
            note: `سند تسديد مورد ${vNum} (${currentPur.invoiceNumber}) · فرق الصرف: ${fxCalc.fxDiffIQD >= 0 ? '+' : ''}${fxCalc.fxDiffIQD.toLocaleString()} د.ع`,
            userName: currentUser?.name || 'النظام',
          });
        }
      }

      if (createdPayments.length === 0) {
        return { ok: false, error: 'تعذر احتساب المبلغ على فواتير المورد المفتوحة.' };
      }

      const audit = buildAuditEntry({
        action: 'record_payment',
        actionLabel: 'تسجيل تسديد وتوزيع آلي على فواتير مورد',
        entityType: 'payment',
        reference: createdPayments.map((x) => x.voucherNumber).join('، '),
        beforeValue: `فواتير مفتوحة: ${openPurchases.length}`,
        afterValue: `${createdPayments[0].partyName} · ${createdPayments.length} سندات صادرة`,
      });

      setState((prev) => ({
        ...prev,
        lastSavedAt: nowIso,
        purchases: prev.purchases.map((p) => updatedPurchasesMap.get(p.id) || p),
        payments: [...createdPayments.reverse(), ...prev.payments],
        exchangeLogs: newFxLogs,
        auditLogs: [audit, ...(prev.auditLogs || [])],
      }));

      notify(
        createdPayments.length === 1
          ? `تم تسجيل سند تسديد المورد ${createdPayments[0].voucherNumber} بنجاح.`
          : `تم تسديد ${createdPayments.length} فواتير مورد وإصدار السندات بنجاح.`
      );
      return { ok: true, payment: createdPayments[0], payments: createdPayments };
    }
  };

  const cancelPaymentTransaction = (paymentId: string, reason: string): { ok: boolean; error?: string } => {
    if (!hasPermission('canDeleteRecords')) {
      return { ok: false, error: 'إلغاء السندات متاح للمدير أو المخولين فقط.' };
    }
    const cleanReason = reason.trim();
    if (!cleanReason) {
      return { ok: false, error: 'يرجى كتابة سبب الإلغاء الإلزامي.' };
    }
    const target = state.payments.find((p) => p.id === paymentId);
    if (!target) return { ok: false, error: 'السند غير موجود.' };
    if (target.isReversal) {
      return { ok: false, error: 'لا يمكن عكس سند عكسي.' };
    }
    if (target.status === 'cancelled') {
      return { ok: false, error: 'هذا السند تم إلغاؤه وعكسه مسبقاً.' };
    }

    const nowIso = new Date().toISOString();
    const userLabel = currentUser?.name || 'النظام';

    const reversalVoucher: PaymentTransaction = {
      id: uniqueId('pay-rev'),
      voucherNumber: `REV-${target.voucherNumber}`,
      date: nowIso,
      partyType: target.partyType,
      partyId: target.partyId,
      partyName: target.partyName,
      category: 'reversal',
      invoiceId: target.invoiceId,
      invoiceNumber: target.invoiceNumber,
      invoiceCurrency: target.invoiceCurrency,
      invoiceExchangeRate: target.invoiceExchangeRate,
      paidUSD: target.paidUSD ? -target.paidUSD : 0,
      paidIQD: target.paidIQD ? -target.paidIQD : 0,
      paymentExchangeRate: target.paymentExchangeRate,
      settledInInvoiceCurrency: -target.settledInInvoiceCurrency,
      autoCalculatedSettled: -target.autoCalculatedSettled,
      fxDiffIQD: target.fxDiffIQD ? -target.fxDiffIQD : 0,
      fxDiffUSD: target.fxDiffUSD ? -target.fxDiffUSD : 0,
      isManualOverride: target.isManualOverride,
      notes: `سند عكسي للسند ${target.voucherNumber} — السبب: ${cleanReason}`,
      createdBy: userLabel,
      status: 'active',
      isReversal: true,
      reversalOfId: target.id,
    };

    const nextPayments = [
      reversalVoucher,
      ...state.payments.map((p) =>
        p.id === paymentId
          ? {
              ...p,
              status: 'cancelled' as const,
              cancelledAt: nowIso,
              cancelledBy: userLabel,
              cancellationReason: cleanReason,
            }
          : p
      ),
    ];

    const audit = buildAuditEntry({
      action: 'cancel_payment',
      actionLabel: 'إلغاء سند مالي وإصدار سند عكسي',
      entityType: 'payment',
      entityId: target.id,
      reference: target.voucherNumber,
      beforeValue: `نشط · المحتسب: ${formatCurrency(target.settledInInvoiceCurrency, target.invoiceCurrency)}`,
      afterValue: `ملغى + سند عكسي ${reversalVoucher.voucherNumber}`,
      reason: cleanReason,
    });

    if (target.partyType === 'customer' && target.invoiceId) {
      setState((prev) => ({
        ...prev,
        lastSavedAt: nowIso,
        sales: prev.sales.map((s) => {
          if (s.id !== target.invoiceId) return s;
          const nextPaid = Math.max(0, s.paidTotal - target.settledInInvoiceCurrency);
          const nextRemaining = Math.min(s.total, s.total - nextPaid);
          const nextDownInInv =
            target.category === 'down_payment' ? 0 : s.downPaymentInInvoiceCurrency;
          let pool = Math.max(0, nextPaid - nextDownInInv);
          const rebuiltInstallments = s.installments.map((inst) => {
            if (pool <= 0) {
              return { ...inst, paidAmount: 0, status: 'pending' as const };
            }
            const alloc = Math.min(inst.amount, pool);
            pool -= alloc;
            return {
              ...inst,
              paidAmount: s.currency === 'USD' ? Number(alloc.toFixed(2)) : Math.round(alloc),
              status: alloc >= inst.amount - 0.01 ? ('paid' as const) : ('partial' as const),
            };
          });
          return {
            ...s,
            downPaymentInInvoiceCurrency: nextDownInInv,
            downPaymentUSD: target.category === 'down_payment' ? 0 : s.downPaymentUSD,
            downPaymentIQD: target.category === 'down_payment' ? 0 : s.downPaymentIQD,
            paidTotal: s.currency === 'USD' ? Number(nextPaid.toFixed(2)) : Math.round(nextPaid),
            remainingAmount:
              s.currency === 'USD' ? Number(nextRemaining.toFixed(2)) : Math.round(nextRemaining),
            installments: rebuiltInstallments,
          };
        }),
        payments: nextPayments,
        auditLogs: [audit, ...(prev.auditLogs || [])],
      }));
    } else if (target.partyType === 'supplier' && target.invoiceId) {
      setState((prev) => ({
        ...prev,
        lastSavedAt: nowIso,
        purchases: prev.purchases.map((p) => {
          if (p.id !== target.invoiceId) return p;
          const nextPaid = Math.max(0, p.paidTotal - target.settledInInvoiceCurrency);
          const nextRemaining = Math.min(p.total, p.total - nextPaid);
          return {
            ...p,
            paidTotal: p.currency === 'USD' ? Number(nextPaid.toFixed(2)) : Math.round(nextPaid),
            remainingAmount:
              p.currency === 'USD' ? Number(nextRemaining.toFixed(2)) : Math.round(nextRemaining),
          };
        }),
        payments: nextPayments,
        auditLogs: [audit, ...(prev.auditLogs || [])],
      }));
    } else {
      setState((prev) => ({
        ...prev,
        lastSavedAt: nowIso,
        payments: nextPayments,
        auditLogs: [audit, ...(prev.auditLogs || [])],
      }));
    }

    notify(`تم إلغاء السند ${target.voucherNumber} وإصدار سند عكسي ${reversalVoucher.voucherNumber}.`, 'info');
    return { ok: true };
  };

  const addUser = (user: Omit<AppUser, 'id' | 'createdAt'>): { ok: boolean; error?: string } => {
    if (!hasPermission('canManageUsers')) {
      const err = 'إدارة المستخدمين متاحة للمدير فقط.';
      notify(err, 'error');
      return { ok: false, error: err };
    }
    const cleanUsername = user.username.trim().toLowerCase();
    if (state.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return { ok: false, error: 'اسم المستخدم مستخدم مسبقاً.' };
    }
    const created: AppUser = {
      ...user,
      username: cleanUsername,
      pin: sanitizeBarcode(user.pin) || user.pin.trim(),
      id: `usr-${Date.now()}`,
      permissions:
        user.role === 'admin'
          ? { ...ADMIN_PERMISSIONS }
          : { ...getPresetPermissionsForRole(user.role), ...user.permissions },
      createdAt: new Date().toISOString(),
    };
    const audit = buildAuditEntry({
      action: 'add_user',
      actionLabel: 'إنشاء حساب مستخدم',
      entityType: 'user',
      entityId: created.id,
      reference: created.username,
      beforeValue: '-',
      afterValue: `${created.name} (${created.role})`,
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      users: [...prev.users, created],
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify(`تم إضافة الحساب: ${created.name}`);
    return { ok: true };
  };

  const updateUser = (id: string, patch: Partial<AppUser>) => {
    if (!hasPermission('canManageUsers')) {
      notify('تعديل الصلاحيات متاح للمدير فقط.', 'error');
      return;
    }
    const target = state.users.find((u) => u.id === id);
    if (!target) return;
    const updated = { ...target, ...patch };
    const audit = buildAuditEntry({
      action: 'update_user',
      actionLabel: 'تعديل صلاحيات أو حالة مستخدم',
      entityType: 'user',
      entityId: id,
      reference: target.username,
      beforeValue: `دور: ${target.role} · نشط: ${target.active ? 'نعم' : 'لا'}`,
      afterValue: `دور: ${updated.role} · نشط: ${updated.active ? 'نعم' : 'لا'}`,
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      users: prev.users.map((u) => (u.id === id ? updated : u)),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم تحديث صلاحيات المستخدم.');
  };

  const deleteUser = (id: string): boolean => {
    if (!hasPermission('canManageUsers')) {
      notify('حذف المستخدمين متاح للمدير فقط.', 'error');
      return false;
    }
    if (id === currentUser?.id) {
      notify('لا يمكنك حذف الحساب المسجل دخولك به حالياً.', 'error');
      return false;
    }
    const adminsCount = state.users.filter((u) => u.role === 'admin' && u.active).length;
    const target = state.users.find((u) => u.id === id);
    if (!target) return false;
    if (target.role === 'admin' && adminsCount <= 1) {
      notify('يجب الإبقاء على حساب مدير واحد نشط على الأقل.', 'error');
      return false;
    }
    const audit = buildAuditEntry({
      action: 'delete_user',
      actionLabel: 'حذف حساب مستخدم',
      entityType: 'user',
      entityId: id,
      reference: target.username,
      beforeValue: target.name,
      afterValue: 'محذوف',
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      users: prev.users.filter((u) => u.id !== id),
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم حذف المستخدم.', 'info');
    return true;
  };

  const updatePrintSettings = (patch: Partial<PrintSettings>) => {
    if (!hasPermission('canManagePrintSettings')) {
      notify('تعديل إعدادات الطباعة متاح للمدير فقط.', 'error');
      return;
    }
    const audit = buildAuditEntry({
      action: 'update_print_settings',
      actionLabel: 'تحديث إعدادات الطباعة والترويسة',
      entityType: 'settings',
      beforeValue: `${state.printSettings.storeName} (${state.printSettings.defaultPaperSize})`,
      afterValue: `${patch.storeName ?? state.printSettings.storeName} (${patch.defaultPaperSize ?? state.printSettings.defaultPaperSize})`,
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      printSettings: { ...prev.printSettings, ...patch },
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم حفظ إعدادات التحكم بالطباعة.');
  };

  const updateDeveloperLicense = (patch: {
    developerMode: 'trial' | 'permanent';
    expiryDate: string;
    developerPin: string;
  }) => {
    const audit = buildAuditEntry({
      action: 'update_license',
      actionLabel: 'تحديث ترخيص وتفعيل النظام',
      entityType: 'system',
      beforeValue: `${state.developerMode} (${state.expiryDate})`,
      afterValue: `${patch.developerMode} (${patch.expiryDate})`,
    });
    setState((prev) => ({
      ...prev,
      lastSavedAt: new Date().toISOString(),
      developerMode: patch.developerMode,
      expiryDate: patch.expiryDate,
      developerPin: patch.developerPin.trim() || prev.developerPin || '9999',
      auditLogs: [audit, ...(prev.auditLogs || [])],
    }));
    notify('تم تحديث وتثبيت إعدادات الترخيص والتفعيل بنجاح.');
  };

  const restoreFullState = (nextState: ERPState): boolean => {
    if (!hasPermission('canRestoreBackup')) {
      notify('استعادة النسخ الاحتياطية متاحة للمدير فقط.', 'error');
      return false;
    }
    const hydrated = hydrateState(nextState);
    const audit = buildAuditEntry({
      action: 'restore_backup',
      actionLabel: 'استعادة نسخة احتياطية JSON',
      entityType: 'system',
      beforeValue: `${state.sales.length} مبيعات / ${state.inventory.length} أصناف`,
      afterValue: `${hydrated.sales.length} مبيعات / ${hydrated.inventory.length} أصناف`,
    });
    setState({
      ...hydrated,
      lastSavedAt: new Date().toISOString(),
      auditLogs: [audit, ...(hydrated.auditLogs || [])],
    });
    notify('تمت استعادة النسخة الاحتياطية JSON بنجاح.');
    return true;
  };

  const resetToEmptyStore = (): boolean => {
    if (!hasPermission('canRestoreBackup')) {
      notify('تصفير النظام متاح للمدير فقط.', 'error');
      return false;
    }
    const fresh = hydrateState(createEmptyStoreState(state.users, state.printSettings));
    const audit = buildAuditEntry({
      action: 'reset_empty',
      actionLabel: 'تصفير بيانات المتجر (بدء متجر جديد)',
      entityType: 'system',
      beforeValue: `${state.sales.length} مبيعات`,
      afterValue: 'متجر فارغ جديد',
    });
    setState({ ...fresh, auditLogs: [audit] });
    notify('تم تصفير البيانات بنجاح لبدء متجر جديد.', 'info');
    return true;
  };

  const resetToDemoSeed = (): boolean => {
    if (!hasPermission('canRestoreBackup')) {
      notify('استرجاع البيانات التجريبية متاح للمدير فقط.', 'error');
      return false;
    }
    const seed = hydrateState(createInitialSeedState());
    const audit = buildAuditEntry({
      action: 'reset_demo',
      actionLabel: 'تحميل البيانات التجريبية الكاملة',
      entityType: 'system',
      afterValue: `${seed.sales.length} مبيعات تجريبية`,
    });
    setState({ ...seed, auditLogs: [audit] });
    notify('تم تحميل البيانات التجريبية الكاملة.', 'info');
    return true;
  };

  const getCustomerBalances = useCallback(
    (customerId: string) => {
      const custSales = state.sales.filter(
        (s) => s.status !== 'cancelled' && s.customerId === customerId
      );
      let usd = 0;
      let iqd = 0;
      for (const s of custSales) {
        if (s.currency === 'USD') usd += s.remainingAmount;
        else iqd += s.remainingAmount;
      }
      return {
        usd: Number(usd.toFixed(2)),
        iqd: Math.round(iqd),
      };
    },
    [state.sales]
  );

  const getSupplierBalances = useCallback(
    (supplierId: string) => {
      const supPurchases = state.purchases.filter(
        (p) => p.status !== 'cancelled' && p.supplierId === supplierId
      );
      let usd = 0;
      let iqd = 0;
      for (const p of supPurchases) {
        if (p.currency === 'USD') usd += p.remainingAmount;
        else iqd += p.remainingAmount;
      }
      return {
        usd: Number(usd.toFixed(2)),
        iqd: Math.round(iqd),
      };
    },
    [state.purchases]
  );

  return (
    <ERPContext.Provider
      value={{
        state,
        storeSettings,
        auditLogs,
        currentUser,
        activeNav,
        navHistory,
        openTabs,
        closeTab,
        canGoBack: navHistory.length > 1,
        subPageTitle,
        setSubPageTitle,
        setActiveNav,
        goBack,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        pendingNavTarget,
        confirmDiscardAndNavigate,
        cancelPendingNavigation,
        productFormContext,
        openInventoryEditProduct,
        clearProductFormContext,
        customerFormContext,
        openCustomerForm,
        clearCustomerFormContext,
        supplierFormContext,
        openSupplierForm,
        clearSupplierFormContext,
        lastCreatedCustomerId,
        clearLastCreatedCustomerId,
        lastCreatedSupplierId,
        clearLastCreatedSupplierId,
        salesFilterHint,
        setSalesFilterHint,
        inventoryLowStockHint,
        setInventoryLowStockHint,
        settlementTarget,
        openSettlementPage,
        clearSettlementTarget,
        printPayload,
        openPrintPreview,
        closePrintPreview,
        displayMode,
        setDisplayMode,
        toggleQuickCurrency,
        toasts,
        notify,
        dismissToast,
        inboxInvoices,
        inboxPendingCount,
        inboxNotifications,
        activeInboxReviewId,
        activeInboxViewerId,
        openInboxReview,
        openInboxImageViewer,
        clearActiveInboxSelection,
        uploadFilesToInbox,
        retryInboxExtraction,
        saveInboxReviewDraft,
        approveInboxInvoice,
        rejectInboxInvoice,
        loginWithPin,
        logout,
        hasPermission,
        verifyAdminPin,
        updateExchangeRate,
        updateStoreSettings,
        updateInventoryItem,
        adjustInventoryStock,
        deleteInventoryItem,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addSupplier,
        updateSupplier,
        deleteSupplier,
        createSaleInvoice,
        cancelSaleInvoice,
        createPurchaseInvoice,
        cancelPurchaseInvoice,
        recordSettlement,
        cancelPaymentTransaction,
        addUser,
        updateUser,
        deleteUser,
        updatePrintSettings,
        updateDeveloperLicense,
        restoreFullState,
        resetToEmptyStore,
        resetToDemoSeed,
        getCustomerBalances,
        getSupplierBalances,
      }}
    >
      {children}
    </ERPContext.Provider>
  );
}

export function useERP() {
  const ctx = useContext(ERPContext);
  if (!ctx) throw new Error('useERP must be used within ERPProvider');
  return ctx;
}
