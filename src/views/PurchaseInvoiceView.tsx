import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  Barcode,
  ArrowRight,
  Search,
  Save,
  RotateCcw,
  UserPlus,
  BookOpen,
  AlertTriangle,
  PackagePlus,
  ChevronRight,
  ChevronLeft,
  X,
  Upload,
  FileImage,
} from 'lucide-react';
import { CurrencyCode, InventoryItem, PurchaseInvoice, PurchaseType } from '../types/erp';
import { useERP } from '../context/ERPContext';
import {
  calculateSettlementFX,
  formatCurrency,
  formatIQD,
  formatUSD,
} from '../utils/currency';
import { amountToArabicTafqeet } from '../utils/arabicWords';
import {
  formatQtyNumber,
  parseLocaleNumber,
  sanitizeBarcode,
  sanitizeNumericInput,
} from '../utils/numbers';
import { findSimilarInventoryItems } from '../utils/inventoryDomain';

interface PurchaseCartRow {
  itemId?: string;
  isNewItem?: boolean;
  sku: string;
  name: string;
  specs: string;
  unitCost: number;
  sellPrice: number;
  installmentPrice?: number;
  quantity: number;
}

interface PurchaseDraftPayload {
  supplierId: string;
  invoiceNumber: string;
  purchaseType: PurchaseType;
  purCurrency: CurrencyCode;
  cart: PurchaseCartRow[];
  discount: string;
  paidNowInput: string;
  showMixedCurrency: boolean;
  paidUSD: string;
  paidIQD: string;
  ratePer100: string;
  notes: string;
}

const PURCHASE_DRAFT_KEY = 'alkafeel_purchase_draft_v1';

function toLocalDateTimeInput(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function getNextPurchaseNumber(existingNumbers: string[]): string {
  let maxNum = 2000;
  for (const code of existingNumbers) {
    const match = code.match(/(\d+)/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxNum) maxNum = val;
    }
  }
  return `${maxNum + 1}B`;
}

function loadPurchaseDraft(): Partial<PurchaseDraftPayload> | null {
  try {
    const raw = localStorage.getItem(PURCHASE_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PurchaseDraftPayload>;
  } catch {
    return null;
  }
}

interface PurchaseInvoiceViewProps {
  initialSupplierId?: string;
  onBack?: () => void;
}

export function PurchaseInvoiceView({ initialSupplierId, onBack }: PurchaseInvoiceViewProps) {
  const {
    state,
    storeSettings,
    goBack,
    openSupplierForm,
    lastCreatedSupplierId,
    clearLastCreatedSupplierId,
    createPurchaseInvoice,
    getSupplierBalances,
    openPrintPreview,
    setHasUnsavedChanges,
    notify,
    uploadFilesToInbox,
    openInboxImageViewer,
  } = useERP();

  const inboxUploadInputRef = useRef<HTMLInputElement | null>(null);

  const initialDraft = useMemo(() => loadPurchaseDraft(), []);

  // Header fields
  const [supplierId, setSupplierId] = useState<string>(
    initialSupplierId || initialDraft?.supplierId || state.suppliers[0]?.id || ''
  );
  const [invoiceNumber, setInvoiceNumber] = useState<string>(
    () =>
      initialDraft?.invoiceNumber ||
      getNextPurchaseNumber(state.purchases.map((p) => p.invoiceNumber))
  );
  const [purchaseType, setPurchaseType] = useState<PurchaseType>(
    initialDraft?.purchaseType || 'credit'
  );
  const [purCurrency, setPurCurrency] = useState<CurrencyCode>(
    initialDraft?.purCurrency || 'IQD'
  );
  const [invoiceDateTime, setInvoiceDateTime] = useState<string>(() => toLocalDateTimeInput());

  // Always-ready bottom entry row state
  const [entryQuery, setEntryQuery] = useState('');
  const [entryQty, setEntryQty] = useState('1');
  const [entryCost, setEntryCost] = useState('');
  const [entrySell, setEntrySell] = useState('');
  const [selectedInvItem, setSelectedInvItem] = useState<InventoryItem | null>(null);
  const [selectedNewItem, setSelectedNewItem] = useState<{ name: string; sku: string } | null>(null);
  const [notFoundPrompt, setNotFoundPrompt] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [entryErrors, setEntryErrors] = useState<{
    query?: string;
    qty?: string;
    cost?: string;
  }>({});

  // Popup Modal for "أضف المادة" (ONLY اسم المادة + باركود المادة — prices come from Purchase table)
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemSku, setNewItemSku] = useState('');
  const [modalErrors, setModalErrors] = useState<{
    name?: string;
    sku?: string;
  }>({});

  // F2 Inline Catalog Lookup
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');

  // Row Selection & Clear confirmation
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [confirmClearCart, setConfirmClearCart] = useState(false);

  // Refs for Enter progression: Query -> Qty -> Cost -> Sell -> commit & focus Query
  const entryCellRef = useRef<HTMLDivElement | null>(null);
  const entryQueryRef = useRef<HTMLInputElement | null>(null);
  const entryQtyRef = useRef<HTMLInputElement | null>(null);
  const entryCostRef = useRef<HTMLInputElement | null>(null);
  const entrySellRef = useRef<HTMLInputElement | null>(null);
  const newItemNameRef = useRef<HTMLInputElement | null>(null);
  const newItemSkuRef = useRef<HTMLInputElement | null>(null);
  const catalogSearchRef = useRef<HTMLInputElement | null>(null);

  // Cart & Financial Totals
  const [cart, setCart] = useState<PurchaseCartRow[]>(
    () => (Array.isArray(initialDraft?.cart) ? initialDraft.cart : [])
  );
  const [discount, setDiscount] = useState<string>(initialDraft?.discount || '0');
  const [paidNowInput, setPaidNowInput] = useState<string>(initialDraft?.paidNowInput || '');
  const [showMixedCurrency, setShowMixedCurrency] = useState(
    Boolean(initialDraft?.showMixedCurrency)
  );
  const [paidUSD, setPaidUSD] = useState<string>(initialDraft?.paidUSD || '0');
  const [paidIQD, setPaidIQD] = useState<string>(initialDraft?.paidIQD || '0');
  const [ratePer100, setRatePer100] = useState<string>(
    initialDraft?.ratePer100 || String(Math.round(state.activeExchangeRate * 100))
  );
  const [notes, setNotes] = useState(initialDraft?.notes || '');

  const [formErrors, setFormErrors] = useState<{
    supplier?: string;
    invoiceNumber?: string;
    cart?: string;
    discount?: string;
    general?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCreatedPurchase, setLastCreatedPurchase] = useState<PurchaseInvoice | null>(null);

  // Saved Purchase Navigator
  const [viewingPurchaseId, setViewingPurchaseId] = useState<string | null>(null);

  const orderedPurchases = useMemo(
    () =>
      [...state.purchases].sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (diff !== 0) return diff;
        return a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true });
      }),
    [state.purchases]
  );

  const viewingPurchase = useMemo(
    () => (viewingPurchaseId ? orderedPurchases.find((p) => p.id === viewingPurchaseId) || null : null),
    [viewingPurchaseId, orderedPurchases]
  );

  const viewingIndex = useMemo(
    () => (viewingPurchase ? orderedPurchases.findIndex((p) => p.id === viewingPurchase.id) : -1),
    [viewingPurchase, orderedPurchases]
  );

  const canGoPrevPurchase =
    viewingPurchase === null ? orderedPurchases.length > 0 : viewingIndex > 0;
  const canGoNextPurchase = viewingPurchase !== null;

  const focusEntryQuery = useCallback(() => {
    setTimeout(() => {
      entryQueryRef.current?.focus();
    }, 30);
  }, []);

  useEffect(() => {
    if (!viewingPurchaseId) {
      focusEntryQuery();
    }
  }, [viewingPurchaseId, focusEntryQuery]);

  // Honor initialSupplierId or returning from standalone New Supplier Page
  useEffect(() => {
    if (initialSupplierId) setSupplierId(initialSupplierId);
  }, [initialSupplierId]);

  useEffect(() => {
    if (lastCreatedSupplierId && state.suppliers.some((s) => s.id === lastCreatedSupplierId)) {
      setSupplierId(lastCreatedSupplierId);
      setFormErrors((prev) => ({ ...prev, supplier: undefined }));
      clearLastCreatedSupplierId();
    }
  }, [lastCreatedSupplierId, state.suppliers, clearLastCreatedSupplierId]);

  useEffect(() => {
    if (
      (!supplierId || !state.suppliers.some((s) => s.id === supplierId)) &&
      state.suppliers.length > 0
    ) {
      setSupplierId(state.suppliers[0].id);
    }
  }, [supplierId, state.suppliers]);

  // Auto-save draft
  useEffect(() => {
    try {
      const draft: PurchaseDraftPayload = {
        supplierId,
        invoiceNumber,
        purchaseType,
        purCurrency,
        cart,
        discount,
        paidNowInput,
        showMixedCurrency,
        paidUSD,
        paidIQD,
        ratePer100,
        notes,
      };
      localStorage.setItem(PURCHASE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore quota errors
    }
  }, [
    supplierId,
    invoiceNumber,
    purchaseType,
    purCurrency,
    cart,
    discount,
    paidNowInput,
    showMixedCurrency,
    paidUSD,
    paidIQD,
    ratePer100,
    notes,
  ]);

  useEffect(() => {
    setHasUnsavedChanges(cart.length > 0);
  }, [cart.length, setHasUnsavedChanges]);

  useEffect(() => {
    return () => setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  const isOpeningBalance = purchaseType === 'opening_balance';

  const activeSupplier = useMemo(
    () => (isOpeningBalance ? null : state.suppliers.find((s) => s.id === supplierId) || null),
    [state.suppliers, supplierId, isOpeningBalance]
  );

  // Duplicate invoice check for same supplier (or opening balance)
  const duplicateSupplierInvoice = useMemo(() => {
    const cleanInv = invoiceNumber.trim().toLowerCase();
    if (!cleanInv) return null;
    if (isOpeningBalance) {
      return (
        state.purchases.find(
          (p) =>
            p.status !== 'cancelled' &&
            p.purchaseType === 'opening_balance' &&
            p.invoiceNumber.trim().toLowerCase() === cleanInv
        ) || null
      );
    }
    if (!supplierId) return null;
    return (
      state.purchases.find(
        (p) =>
          p.status !== 'cancelled' &&
          p.supplierId === supplierId &&
          p.invoiceNumber.trim().toLowerCase() === cleanInv
      ) || null
    );
  }, [state.purchases, supplierId, invoiceNumber, isOpeningBalance]);

  const payRate = (parseLocaleNumber(ratePer100) || 150000) / 100;

  const convertToPurCurrency = useCallback(
    (amount: number, sourceCurrency: CurrencyCode, targetCurrency: CurrencyCode): number => {
      if (sourceCurrency === targetCurrency) return amount;
      if (targetCurrency === 'IQD') return Math.round(amount * payRate);
      return Number((amount / payRate).toFixed(2));
    },
    [payRate]
  );

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (entryCellRef.current && !entryCellRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const normalizedQuery = useMemo(() => entryQuery.trim().toLowerCase(), [entryQuery]);

  const matchedInventory = useMemo(() => {
    if (!normalizedQuery) return [];
    const clean = sanitizeBarcode(normalizedQuery).toLowerCase();
    return state.inventory.filter((it) => {
      const fullName = `${it.brand} ${it.model} ${it.storage}`.toLowerCase();
      const skuLower = it.sku.toLowerCase();
      return (
        fullName.includes(normalizedQuery) ||
        skuLower.includes(clean || normalizedQuery) ||
        skuLower.slice(-3).includes(clean || normalizedQuery)
      );
    });
  }, [state.inventory, normalizedQuery]);

  const catalogItems = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return state.inventory;
    const clean = sanitizeBarcode(q).toLowerCase();
    return state.inventory.filter((it) => {
      const fullName = `${it.brand} ${it.model} ${it.storage}`.toLowerCase();
      const skuLower = it.sku.toLowerCase();
      return fullName.includes(q) || skuLower.includes(clean || q) || skuLower.slice(-3).includes(clean || q);
    });
  }, [state.inventory, catalogSearch]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [matchedInventory.length, normalizedQuery]);

  const clearEntryRow = useCallback(() => {
    setEntryQuery('');
    setEntryQty('1');
    setEntryCost('');
    setEntrySell('');
    setSelectedInvItem(null);
    setSelectedNewItem(null);
    setNotFoundPrompt(null);
    setDropdownOpen(false);
    setEntryErrors({});
  }, []);

  // Real-time duplicate barcode & similar-name detection for the 2-field popup
  const modalDuplicateSkuSource = useMemo(() => {
    const clean = sanitizeBarcode(newItemSku).toLowerCase();
    if (!clean) return null;
    const inInv = state.inventory.find((it) => it.sku.trim().toLowerCase() === clean);
    if (inInv) return `${inInv.brand} ${inInv.model}`.trim();
    const inCart = cart.find((r) => r.sku.trim().toLowerCase() === clean);
    if (inCart) return `${inCart.name} (في الفاتورة الحالية)`;
    return null;
  }, [newItemSku, state.inventory, cart]);

  const modalSimilarItems = useMemo(() => {
    if (!newItemModalOpen) return [];
    return findSimilarInventoryItems(newItemName, state.inventory);
  }, [newItemModalOpen, newItemName, state.inventory]);

  const generateUniqueSku = useCallback(() => {
    const existingSet = new Set([
      ...state.inventory.map((i) => i.sku.toLowerCase()),
      ...cart.map((c) => c.sku.toLowerCase()),
    ]);
    let candidate = `B${Math.floor(100000 + Math.random() * 900000)}`;
    while (existingSet.has(candidate.toLowerCase())) {
      candidate = `B${Math.floor(100000 + Math.random() * 900000)}`;
    }
    return candidate;
  }, [state.inventory, cart]);

  const openNewItemModal = useCallback(
    (prefillText?: string) => {
      const raw = (prefillText ?? entryQuery).trim();
      const cleanedCode = sanitizeBarcode(raw);
      const looksLikeBarcode =
        Boolean(cleanedCode) &&
        /^[A-Za-z0-9-]+$/.test(cleanedCode) &&
        /\d/.test(cleanedCode) &&
        cleanedCode.length >= 3;

      setNewItemName(looksLikeBarcode ? '' : raw);
      setNewItemSku(looksLikeBarcode ? cleanedCode : '');
      setModalErrors({});
      setDropdownOpen(false);
      setNewItemModalOpen(true);
      setTimeout(() => {
        if (looksLikeBarcode) newItemNameRef.current?.focus();
        else if (raw) newItemSkuRef.current?.focus();
        else newItemNameRef.current?.focus();
      }, 25);
    },
    [entryQuery]
  );

  const closeNewItemModal = useCallback(() => {
    setNewItemModalOpen(false);
    setModalErrors({});
    focusEntryQuery();
  }, [focusEntryQuery]);

  const confirmNewItemModal = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const cleanName = newItemName.trim();
      const cleanSku = sanitizeBarcode(newItemSku);

      const errs: typeof modalErrors = {};
      if (!cleanName) {
        errs.name = 'يرجى إدخال اسم المادة.';
      }
      if (!cleanSku) {
        errs.sku = 'يرجى إدخال باركود المادة.';
      } else if (modalDuplicateSkuSource) {
        errs.sku = `الباركود (${cleanSku}) مستخدم مسبقاً للمادة: ${modalDuplicateSkuSource}.`;
      }

      if (Object.keys(errs).length > 0) {
        setModalErrors(errs);
        return;
      }

      // Stage ONLY name & barcode into the purchase invoice entry row so qty & prices are set inside the purchase table
      setSelectedInvItem(null);
      setSelectedNewItem({ name: cleanName, sku: cleanSku });
      setEntryQuery(cleanName);
      setEntryQty('1');
      setEntryCost('');
      setEntrySell('');
      setEntryErrors({});
      setNotFoundPrompt(null);
      setNewItemModalOpen(false);
      setModalErrors({});

      setTimeout(() => {
        entryQtyRef.current?.focus();
        entryQtyRef.current?.select();
      }, 25);
    },
    [newItemName, newItemSku, modalDuplicateSkuSource]
  );

  const findItemByBarcode = useCallback(
    (rawCode: string): InventoryItem | null => {
      const code = sanitizeBarcode(rawCode).toLowerCase();
      if (!code) return null;
      const exact = state.inventory.find((it) => it.sku.toLowerCase() === code);
      if (exact) return exact;
      if (code.length >= 3) {
        const suffix = state.inventory.filter((it) => it.sku.toLowerCase().endsWith(code));
        if (suffix.length === 1) return suffix[0];
      }
      return null;
    },
    [state.inventory]
  );

  const selectInventoryIntoEntry = useCallback(
    (it: InventoryItem) => {
      setNewItemModalOpen(false);
      setSelectedNewItem(null);
      setNotFoundPrompt(null);
      setSelectedInvItem(it);
      setEntryQuery(`${it.brand}${it.model ? ` ${it.model}` : ''}`.trim());
      setEntryQty('1');
      setEntryCost(String(convertToPurCurrency(it.costPrice, it.costCurrency, purCurrency)));
      setEntrySell(String(convertToPurCurrency(it.cashPrice, it.sellCurrency, purCurrency)));
      setEntryErrors({});
      setDropdownOpen(false);
      setTimeout(() => {
        entryQtyRef.current?.focus();
        entryQtyRef.current?.select();
      }, 15);
    },
    [convertToPurCurrency, purCurrency]
  );

  const commitEntryRow = useCallback(() => {
    if (!selectedInvItem && !selectedNewItem) {
      const byCode = findItemByBarcode(entryQuery);
      if (byCode) {
        selectInventoryIntoEntry(byCode);
        return;
      }
      if (!entryQuery.trim()) {
        setEntryErrors({ query: 'أدخل الباركود أو اسم المادة.' });
        focusEntryQuery();
        return;
      }
      setDropdownOpen(false);
      setNotFoundPrompt(entryQuery.trim());
      return;
    }

    const qty = Math.round(parseLocaleNumber(entryQty));
    const cost = parseLocaleNumber(entryCost);
    const sell = Math.max(0, parseLocaleNumber(entrySell));

    const errs: typeof entryErrors = {};
    if (qty <= 0) errs.qty = 'الكمية > 0';
    if (!Number.isFinite(cost) || cost <= 0) errs.cost = 'سعر الشراء > 0';

    if (Object.keys(errs).length > 0) {
      setEntryErrors(errs);
      if (errs.qty) entryQtyRef.current?.focus();
      else if (errs.cost) entryCostRef.current?.focus();
      return;
    }

    if (selectedInvItem) {
      const itemName = `${selectedInvItem.brand}${selectedInvItem.model ? ` ${selectedInvItem.model}` : ''}`.trim();
      setCart((prev) => {
        const idx = prev.findIndex((r) => r.itemId === selectedInvItem.id);
        if (idx >= 0) {
          return prev.map((r, i) =>
            i === idx
              ? { ...r, quantity: r.quantity + qty, unitCost: cost, sellPrice: sell }
              : r
          );
        }
        return [
          ...prev,
          {
            itemId: selectedInvItem.id,
            isNewItem: false,
            sku: selectedInvItem.sku,
            name: itemName,
            specs: selectedInvItem.storage || 'قياسي',
            unitCost: cost,
            sellPrice: sell,
            installmentPrice: selectedInvItem.installmentPrice,
            quantity: qty,
          },
        ];
      });
    } else if (selectedNewItem) {
      setCart((prev) => {
        const idx = prev.findIndex(
          (r) => r.isNewItem && r.sku.toLowerCase() === selectedNewItem.sku.toLowerCase()
        );
        if (idx >= 0) {
          return prev.map((r, i) =>
            i === idx
              ? { ...r, quantity: r.quantity + qty, unitCost: cost, sellPrice: sell }
              : r
          );
        }
        return [
          ...prev,
          {
            itemId: undefined,
            isNewItem: true,
            sku: selectedNewItem.sku,
            name: selectedNewItem.name,
            specs: 'قياسي',
            unitCost: cost,
            sellPrice: sell,
            quantity: qty,
          },
        ];
      });
    }

    setFormErrors((prev) => ({ ...prev, cart: undefined }));
    setSelectedRowIndex(null);
    clearEntryRow();
    focusEntryQuery();
  }, [
    selectedInvItem,
    selectedNewItem,
    findItemByBarcode,
    entryQuery,
    selectInventoryIntoEntry,
    entryQty,
    entryCost,
    entrySell,
    clearEntryRow,
    focusEntryQuery,
  ]);

  const quickAddFromCatalog = (it: InventoryItem) => {
    const cost = convertToPurCurrency(it.costPrice, it.costCurrency, purCurrency);
    const sell = convertToPurCurrency(it.cashPrice, it.sellCurrency, purCurrency);
    setCart((prev) => {
      const idx = prev.findIndex((r) => r.itemId === it.id);
      if (idx >= 0) {
        return prev.map((r, i) => (i === idx ? { ...r, quantity: r.quantity + 1 } : r));
      }
      return [
        ...prev,
        {
          itemId: it.id,
          sku: it.sku,
          name: `${it.brand} ${it.model}`.trim(),
          specs: it.storage || 'قياسي',
          unitCost: cost > 0 ? cost : 1,
          sellPrice: sell,
          quantity: 1,
        },
      ];
    });
    setFormErrors((prev) => ({ ...prev, cart: undefined }));
    setShowCatalogPanel(false);
    focusEntryQuery();
  };

  // Enter sequence handlers
  const handleEntryQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (dropdownOpen) setDropdownOpen(false);
      else clearEntryRow();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdownOpen && matchedInventory.length > 0) {
        setHighlightedIdx((prev) => Math.min(matchedInventory.length - 1, prev + 1));
      } else if (cart.length > 0) {
        setSelectedRowIndex((prev) => (prev === null ? 0 : Math.min(cart.length - 1, prev + 1)));
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (dropdownOpen && matchedInventory.length > 0) {
        setHighlightedIdx((prev) => Math.max(0, prev - 1));
      } else if (cart.length > 0) {
        setSelectedRowIndex((prev) => (prev === null ? cart.length - 1 : Math.max(0, prev - 1)));
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (dropdownOpen && matchedInventory.length > 0) {
        const chosen = matchedInventory[highlightedIdx] || matchedInventory[0];
        if (chosen) {
          selectInventoryIntoEntry(chosen);
          return;
        }
      }

      const byCode = findItemByBarcode(entryQuery);
      if (byCode) {
        selectInventoryIntoEntry(byCode);
        return;
      }

      if (selectedInvItem || selectedNewItem) {
        entryQtyRef.current?.focus();
        entryQtyRef.current?.select();
        return;
      }

      if (entryQuery.trim()) {
        // Not found in inventory -> show "المادة غير موجودة في المخزن" + "أضف المادة" button
        setDropdownOpen(false);
        setNotFoundPrompt(entryQuery.trim());
      }
    }
  };

  const handleEntryQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEntryQty('1');
      focusEntryQuery();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const qty = Math.round(parseLocaleNumber(entryQty));
      if (qty <= 0) {
        setEntryErrors((prev) => ({ ...prev, qty: 'الكمية > 0' }));
        return;
      }
      entryCostRef.current?.focus();
      entryCostRef.current?.select();
    }
  };

  const handleEntryCostKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEntryCost('');
      focusEntryQuery();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cost = parseLocaleNumber(entryCost);
      if (!Number.isFinite(cost) || cost <= 0) {
        setEntryErrors((prev) => ({ ...prev, cost: 'سعر الشراء > 0' }));
        return;
      }
      entrySellRef.current?.focus();
      entrySellRef.current?.select();
    }
  };

  const handleEntrySellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setEntrySell('');
      focusEntryQuery();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEntryRow();
    }
  };

  const updateCartRow = (idx: number, patch: Partial<PurchaseCartRow>) => {
    setCart((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const entryCostVal = parseLocaleNumber(entryCost);
  const entrySellVal = parseLocaleNumber(entrySell);
  const entrySellBelowCost = entrySellVal > 0 && entryCostVal > 0 && entrySellVal < entryCostVal;

  const subtotal = useMemo(() => cart.reduce((s, r) => s + r.unitCost * r.quantity, 0), [cart]);
  const parsedDiscount = isOpeningBalance ? 0 : Math.max(0, parseLocaleNumber(discount));
  const isDiscountExceeded = !isOpeningBalance && parsedDiscount > subtotal + (purCurrency === 'USD' ? 0.01 : 0);

  const netTotal = useMemo(() => {
    const d = Math.min(subtotal, parsedDiscount);
    return purCurrency === 'USD'
      ? Number(Math.max(0, subtotal - d).toFixed(2))
      : Math.max(0, Math.round(subtotal - d));
  }, [subtotal, parsedDiscount, purCurrency]);

  const resolvedPaidAmounts = useMemo(() => {
    if (isOpeningBalance) return { usd: 0, iqd: 0 };
    if (showMixedCurrency) {
      return {
        usd: Math.max(0, parseLocaleNumber(paidUSD)),
        iqd: Math.max(0, Math.round(parseLocaleNumber(paidIQD))),
      };
    }
    const directVal = Math.max(0, parseLocaleNumber(paidNowInput));
    if (purchaseType === 'cash' && paidNowInput.trim() === '') {
      return purCurrency === 'USD' ? { usd: netTotal, iqd: 0 } : { usd: 0, iqd: netTotal };
    }
    return purCurrency === 'USD'
      ? { usd: directVal, iqd: 0 }
      : { usd: 0, iqd: Math.round(directVal) };
  }, [isOpeningBalance, showMixedCurrency, paidUSD, paidIQD, paidNowInput, purchaseType, purCurrency, netTotal]);

  const paymentFX = useMemo(() => {
    return calculateSettlementFX({
      partyType: 'supplier',
      invoiceCurrency: purCurrency,
      invoiceExchangeRate: payRate,
      paymentExchangeRate: payRate,
      paidUSD: resolvedPaidAmounts.usd,
      paidIQD: resolvedPaidAmounts.iqd,
    });
  }, [purCurrency, payRate, resolvedPaidAmounts]);

  const effectivePaid = isOpeningBalance
    ? 0
    : purchaseType === 'cash'
    ? resolvedPaidAmounts.usd === 0 && resolvedPaidAmounts.iqd === 0
      ? netTotal
      : Math.min(netTotal, paymentFX.settledInInvoiceCurrency)
    : Math.min(netTotal, paymentFX.settledInInvoiceCurrency);

  const remaining = isOpeningBalance
    ? 0
    : Math.max(
        0,
        purCurrency === 'USD'
          ? Number((netTotal - effectivePaid).toFixed(2))
          : Math.round(netTotal - effectivePaid)
      );

  const supplierBalances = useMemo(() => {
    if (!supplierId || isOpeningBalance) return { usd: 0, iqd: 0 };
    return getSupplierBalances(supplierId);
  }, [supplierId, isOpeningBalance, getSupplierBalances]);

  const newSupplierBalance = useMemo(() => {
    const prevBal = purCurrency === 'USD' ? supplierBalances.usd : supplierBalances.iqd;
    return purCurrency === 'USD'
      ? Number((prevBal + remaining).toFixed(2))
      : Math.round(prevBal + remaining);
  }, [supplierBalances, purCurrency, remaining]);

  const tafqeetText = useMemo(
    () => amountToArabicTafqeet(netTotal, purCurrency),
    [netTotal, purCurrency]
  );

  const resetForm = useCallback(() => {
    setCart([]);
    setDiscount('0');
    setPaidNowInput('');
    setPaidUSD('0');
    setPaidIQD('0');
    setNotes('');
    clearEntryRow();
    setFormErrors({});
    setSelectedRowIndex(null);
    setConfirmClearCart(false);
    try {
      localStorage.removeItem(PURCHASE_DRAFT_KEY);
    } catch {
      // Ignore
    }
    focusEntryQuery();
  }, [clearEntryRow, focusEntryQuery]);

  const handleSubmit = useCallback(
    (openPrintAfter: boolean) => {
      if (isSubmitting || viewingPurchase) return;

      const errs: typeof formErrors = {};
      if (!isOpeningBalance && !supplierId) errs.supplier = 'يرجى اختيار المورد أولاً.';
      if (!invoiceNumber.trim()) errs.invoiceNumber = 'رقم فاتورة الشراء حقل إلزامي.';
      if (duplicateSupplierInvoice) {
        errs.invoiceNumber = isOpeningBalance
          ? `رقم فاتورة الرصيد الافتتاحي (${invoiceNumber.trim()}) مكرر.`
          : `رقم الفاتورة (${invoiceNumber.trim()}) مكرر لنفس المورد (${activeSupplier?.name || ''}).`;
      }
      if (cart.length === 0) {
        errs.cart = 'يرجى إضافة منتج واحد على الأقل لفاتورة الشراء.';
      } else if (cart.some((r) => r.quantity <= 0 || r.unitCost <= 0)) {
        errs.cart = 'كل سطر في الفاتورة يجب أن يحتوي على كمية > 0 وسعر شراء > 0.';
      }
      if (isDiscountExceeded) {
        errs.discount = 'خصم المورد لا يمكن أن يتجاوز المجموع الأولي للفاتورة.';
      }

      if (Object.keys(errs).length > 0) {
        setFormErrors(errs);
        notify(
          errs.supplier || errs.invoiceNumber || errs.cart || errs.discount || 'تحقق من الحقول المطلوبة.',
          'error'
        );
        return;
      }

      setIsSubmitting(true);
      try {
        const res = createPurchaseInvoice({
          supplierId: isOpeningBalance ? '' : supplierId,
          purchaseType,
          currency: purCurrency,
          invoiceNumber: invoiceNumber.trim(),
          date: invoiceDateTime ? new Date(invoiceDateTime).toISOString() : undefined,
          invoiceExchangeRate: payRate,
          discount: isOpeningBalance ? 0 : parsedDiscount,
          items: cart.map((row) => ({
            itemId: row.itemId,
            isNewItem: row.isNewItem,
            sku: row.sku,
            name: row.name,
            specs: row.specs,
            quantity: row.quantity,
            unitCost: row.unitCost,
            sellPrice: row.sellPrice,
            installmentPrice: row.installmentPrice,
          })),
          paidUSD: resolvedPaidAmounts.usd,
          paidIQD: resolvedPaidAmounts.iqd,
          paymentExchangeRate: payRate,
          notes,
        });

        if (!res.ok || !res.purchase) {
          setFormErrors({ general: res.error || 'تعذر حفظ فاتورة الشراء.' });
          notify(res.error || 'تعذر حفظ فاتورة الشراء.', 'error');
          return;
        }

        setLastCreatedPurchase(res.purchase);
        if (openPrintAfter) {
          openPrintPreview({ kind: 'purchase', data: res.purchase });
        }
        setInvoiceNumber(
          getNextPurchaseNumber([
            res.purchase.invoiceNumber,
            ...state.purchases.map((p) => p.invoiceNumber),
          ])
        );
        resetForm();
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting,
      viewingPurchase,
      isOpeningBalance,
      supplierId,
      invoiceNumber,
      duplicateSupplierInvoice,
      activeSupplier,
      cart,
      isDiscountExceeded,
      notify,
      createPurchaseInvoice,
      purchaseType,
      purCurrency,
      invoiceDateTime,
      payRate,
      parsedDiscount,
      resolvedPaidAmounts,
      notes,
      openPrintPreview,
      state.purchases,
      resetForm,
    ]
  );

  // Global keyboard shortcuts: F9 save, F2 catalog, Delete selected row, Arrow Up/Down
  useEffect(() => {
    if (viewingPurchase) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (newItemModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setNewItemModalOpen(false);
          focusEntryQuery();
        }
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        handleSubmit(false);
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        setShowCatalogPanel((prev) => {
          const next = !prev;
          if (next) setTimeout(() => catalogSearchRef.current?.focus(), 30);
          else focusEntryQuery();
          return next;
        });
        return;
      }

      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isEditingInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
      if (isEditingInput) return;

      if (e.key === 'ArrowDown' && cart.length > 0) {
        e.preventDefault();
        setSelectedRowIndex((prev) => (prev === null ? 0 : Math.min(cart.length - 1, prev + 1)));
      } else if (e.key === 'ArrowUp' && cart.length > 0) {
        e.preventDefault();
        setSelectedRowIndex((prev) => (prev === null ? cart.length - 1 : Math.max(0, prev - 1)));
      } else if (e.key === 'Delete' && selectedRowIndex !== null && cart[selectedRowIndex]) {
        e.preventDefault();
        setCart((prev) => prev.filter((_, i) => i !== selectedRowIndex));
        setSelectedRowIndex(null);
        focusEntryQuery();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewingPurchase, newItemModalOpen, handleSubmit, cart, selectedRowIndex, focusEntryQuery]);

  const handlePrevPurchase = () => {
    if (!canGoPrevPurchase) return;
    if (viewingPurchase === null) {
      setViewingPurchaseId(orderedPurchases[orderedPurchases.length - 1].id);
    } else if (viewingIndex > 0) {
      setViewingPurchaseId(orderedPurchases[viewingIndex - 1].id);
    }
  };

  const handleNextPurchase = () => {
    if (!canGoNextPurchase) return;
    if (viewingIndex < orderedPurchases.length - 1) {
      setViewingPurchaseId(orderedPurchases[viewingIndex + 1].id);
    } else {
      setViewingPurchaseId(null);
    }
  };

  const currencyLabel = purCurrency === 'USD' ? '$' : 'د.ع';

  // ==================== READ-ONLY VIEW OF SAVED PURCHASE INVOICE ====================
  if (viewingPurchase) {
    const isCancelled = viewingPurchase.status === 'cancelled';
    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-300 rounded-lg p-1">
              <button
                type="button"
                onClick={handlePrevPurchase}
                disabled={!canGoPrevPurchase}
                title="الفاتورة السابقة"
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="px-3 text-center">
                <div className="font-num font-extrabold text-sm text-slate-900">
                  {viewingPurchase.invoiceNumber}
                </div>
                <div className="text-[10px] text-slate-500">فاتورة شراء محفوظة</div>
              </div>
              <button
                type="button"
                onClick={handleNextPurchase}
                disabled={!canGoNextPurchase}
                title="الفاتورة التالية / الجديدة"
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="font-bold text-sm text-slate-900">
                المورد: {viewingPurchase.supplierName}
              </div>
              <div className="text-[11px] text-slate-500 font-num">
                {new Date(viewingPurchase.date).toLocaleString('ar-IQ')} ·{' '}
                {viewingPurchase.purchaseType === 'cash'
                  ? 'نقدي'
                  : viewingPurchase.purchaseType === 'opening_balance'
                  ? 'رصيد افتتاحي'
                  : 'آجل'}{' '}
                · {viewingPurchase.currency}
              </div>
            </div>

            {isCancelled && (
              <span className="px-2.5 py-1 rounded bg-red-100 text-red-700 font-bold">
                ملغاة ({viewingPurchase.cancellationReason})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {viewingPurchase.sourceInboxId && (
              <button
                type="button"
                onClick={() => openInboxImageViewer(viewingPurchase.sourceInboxId!)}
                className="h-9 px-3.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 font-bold hover:bg-blue-100 inline-flex items-center gap-1.5"
              >
                <FileImage className="w-4 h-4" />
                <span>الصورة الأصلية</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openPrintPreview({ kind: 'purchase', data: viewingPurchase })}
              className="h-9 px-3.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>
            <button
              type="button"
              onClick={() => setViewingPurchaseId(null)}
              className="h-9 px-3.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>العودة للفاتورة الجديدة</span>
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 text-center w-12">ت</th>
                <th className="py-2.5 px-3 text-right">المادة / الباركود</th>
                <th className="py-2.5 px-3 text-center w-24">الكمية</th>
                <th className="py-2.5 px-3 text-left w-32">سعر الشراء</th>
                <th className="py-2.5 px-3 text-left w-32">المجموع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {viewingPurchase.items.map((it, idx) => (
                <tr key={idx}>
                  <td className="py-2.5 px-3 text-center font-num text-slate-500">{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-slate-900">
                      {it.brand} {it.model}
                    </div>
                    <div className="text-[11px] text-slate-500 font-num">{it.sku}</div>
                  </td>
                  <td className="py-2.5 px-3 text-center font-num font-bold">{it.quantity}</td>
                  <td className="py-2.5 px-3 text-left font-num">
                    {formatCurrency(it.unitCost, viewingPurchase.currency)}
                  </td>
                  <td className="py-2.5 px-3 text-left font-num font-bold">
                    {formatCurrency(it.lineTotal, viewingPurchase.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">المجموع</div>
            <div className="font-num font-bold text-lg text-slate-900">
              {formatCurrency(viewingPurchase.subtotal ?? viewingPurchase.total, viewingPurchase.currency)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">الخصم</div>
            <div className="font-num font-bold text-lg text-amber-700">
              {formatCurrency(viewingPurchase.discount ?? 0, viewingPurchase.currency)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-[11px] text-emerald-800 font-semibold">الصافي</div>
            <div className="font-num font-extrabold text-lg text-emerald-700">
              {formatCurrency(viewingPurchase.total, viewingPurchase.currency)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">المدفوع</div>
            <div className="font-num font-bold text-lg text-emerald-700">
              {formatCurrency(viewingPurchase.paidTotal, viewingPurchase.currency)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="text-[11px] text-amber-900 font-semibold">المتبقي للمورد</div>
            <div className="font-num font-extrabold text-lg text-red-700">
              {formatCurrency(
                isCancelled ? 0 : viewingPurchase.remainingAmount,
                viewingPurchase.currency
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== CLASSIC AL-AMEER PURCHASE INVOICE VIEW ====================
  return (
    <div className="space-y-3">
      {/* Success Banner */}
      {lastCreatedPurchase && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              تم تسجيل فاتورة الشراء <strong className="font-num">{lastCreatedPurchase.invoiceNumber}</strong> للمورد{' '}
              <strong>{lastCreatedPurchase.supplierName}</strong> وتحديث المخزن بنجاح.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openPrintPreview({ kind: 'purchase', data: lastCreatedPurchase })}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة إذن الاستلام</span>
            </button>
            <button
              type="button"
              onClick={() => setLastCreatedPurchase(null)}
              className="text-slate-600 hover:text-slate-900 px-2"
            >
              إخفاء
            </button>
          </div>
        </div>
      )}

      {/* 1. COMPACT 1-2 ROW CLASSIC INVOICE HEADER */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Invoice Number + Prev/Next */}
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1 border rounded-lg p-0.5 ${
                duplicateSupplierInvoice || formErrors.invoiceNumber
                  ? 'border-red-500 bg-red-50/40'
                  : 'border-slate-300 bg-slate-50'
              }`}
            >
              <button
                type="button"
                onClick={handlePrevPurchase}
                disabled={!canGoPrevPurchase}
                title="الفاتورة السابقة"
                className="p-1.5 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <div className="px-2 flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500">رقم فاتورة الشراء:</span>
                <input
                  value={invoiceNumber}
                  onChange={(e) => {
                    setInvoiceNumber(e.target.value);
                    setFormErrors((prev) => ({ ...prev, invoiceNumber: undefined }));
                  }}
                  className="w-24 h-7 px-2 border border-slate-300 rounded bg-white font-num font-extrabold text-center text-slate-900"
                />
              </div>
              <button
                type="button"
                onClick={handleNextPurchase}
                disabled={!canGoNextPurchase}
                title="الفاتورة التالية"
                className="p-1.5 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Date */}
            <input
              type="datetime-local"
              value={invoiceDateTime}
              onChange={(e) => setInvoiceDateTime(e.target.value)}
              className="h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-num text-xs text-slate-800"
            />
          </div>

          {/* Purchase Type + Currency + Rate */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'credit', label: 'آجل' },
                  { id: 'cash', label: 'نقدي' },
                  { id: 'opening_balance', label: 'رصيد افتتاحي' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setPurchaseType(t.id);
                    setFormErrors((prev) => ({ ...prev, supplier: undefined }));
                  }}
                  className={`px-3 py-1.5 rounded-md font-bold transition-colors ${
                    purchaseType === t.id
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['USD', 'IQD'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPurCurrency(c)}
                  className={`px-3 py-1.5 rounded-md font-bold transition-colors ${
                    purCurrency === c
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {c === 'USD' ? 'دولار $' : 'دينار د.ع'}
                </button>
              ))}
            </div>

            <span className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-semibold text-slate-600">
              {storeSettings.costCalculationMethod === 'weighted_avg'
                ? 'التكلفة: المتوسط المرجّح'
                : 'التكلفة: آخر شراء'}
            </span>

            <input
              ref={inboxUploadInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void uploadFilesToInbox(Array.from(e.target.files));
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => inboxUploadInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 font-bold hover:bg-blue-100 whitespace-nowrap"
              title="رفع صورة فاتورة أو PDF إلى صندوق وارد الفواتير للقراءة في الخلفية"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>رفع صورة لصندوق الفواتير</span>
            </button>
          </div>
        </div>

        {(duplicateSupplierInvoice || formErrors.invoiceNumber) && (
          <div className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            {formErrors.invoiceNumber || 'تحذير: رقم هذه الفاتورة مكرر لنفس المورد!'}
          </div>
        )}

        {/* Row 2: Supplier Selection (or Opening Balance Info) + Fixed Exchange Rate */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {isOpeningBalance ? (
            <div className="flex-1 min-w-[260px] px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold text-xs">
              وضع <strong>الرصيد الافتتاحي</strong>: لإدخال البضاعة السابقة وأول المدة — يدخل المخزن فوراً بدون مورد، وبدون دين أو صرف من الصندوق.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              <span className="font-bold text-slate-700">المورد *:</span>
              <select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setFormErrors((prev) => ({ ...prev, supplier: undefined }));
                }}
                className={`min-w-[240px] flex-1 max-w-sm h-9 px-3 border rounded-lg bg-white font-semibold ${
                  formErrors.supplier ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              >
                <option value="">اختر المورد...</option>
                {state.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.company ? `— ${s.company}` : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => openSupplierForm({ mode: 'new', returnTo: 'purchase' })}
                className="h-9 inline-flex items-center gap-1 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold hover:bg-emerald-100"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ مورد جديد</span>
              </button>

              {formErrors.supplier && (
                <span className="text-[11px] font-bold text-red-600">{formErrors.supplier}</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-semibold">سعر الصرف (لكل 100$):</span>
              <input
                type="text"
                inputMode="numeric"
                value={ratePer100}
                onChange={(e) => setRatePer100(sanitizeNumericInput(e.target.value, false))}
                className="w-24 h-8 px-2 border border-slate-300 rounded-lg bg-white font-num font-bold text-center"
              />
            </div>

            {!isOpeningBalance && activeSupplier && (
              <div className="text-[11px] font-num bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700">
                الرصيد السابق للمورد:{' '}
                <strong className="text-amber-700">
                  {purCurrency === 'USD'
                    ? formatUSD(supplierBalances.usd)
                    : formatIQD(supplierBalances.iqd)}
                </strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* F2 Quick Catalog Panel */}
      {showCatalogPanel && (
        <div className="bg-white border border-slate-300 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <BookOpen className="w-4 h-4 text-emerald-700" />
              <span>دليل مواد المخزن (F2)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={catalogSearchRef}
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowCatalogPanel(false);
                      focusEntryQuery();
                    }
                  }}
                  placeholder="ابحث بالاسم أو الباركود أو آخر 3 أرقام..."
                  className="w-72 h-9 pr-9 pl-3 border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCatalogPanel(false);
                  focusEntryQuery();
                }}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2 px-3 text-right">المادة</th>
                  <th className="py-2 px-3 text-right">الباركود / آخر 3</th>
                  <th className="py-2 px-3 text-center">المتاح</th>
                  <th className="py-2 px-3 text-left">آخر شراء</th>
                  <th className="py-2 px-3 text-center">إضافة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalogItems.slice(0, 30).map((it) => {
                  const unitC = convertToPurCurrency(it.costPrice, it.costCurrency, purCurrency);
                  return (
                    <tr
                      key={it.id}
                      onClick={() => quickAddFromCatalog(it)}
                      className="hover:bg-emerald-50/50 cursor-pointer"
                    >
                      <td className="py-2 px-3 font-bold text-slate-900">
                        {it.brand} {it.model}{' '}
                        <span className="font-normal text-slate-500">({it.storage})</span>
                      </td>
                      <td className="py-2 px-3 font-num text-slate-600">
                        {it.sku} · <strong className="text-blue-700">{it.sku.slice(-3)}</strong>
                      </td>
                      <td className="py-2 px-3 text-center font-num font-bold">
                        {formatQtyNumber(it.quantity)}
                      </td>
                      <td className="py-2 px-3 text-left font-num font-bold text-amber-700">
                        {formatCurrency(unitC, purCurrency)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[11px] font-bold">
                          إضافة
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. CENTER: FULL-WIDTH CLASSIC PURCHASE ITEMS TABLE + ALWAYS-READY ENTRY ROW */}
      <div
        className={`bg-white border rounded-xl overflow-visible ${
          formErrors.cart ? 'border-red-500' : 'border-slate-200'
        }`}
      >
        {formErrors.cart && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs font-bold text-red-700">
            {formErrors.cart}
          </div>
        )}

        <div className="overflow-x-auto min-h-[340px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="py-3 px-3 text-center w-12 font-bold">ت</th>
                <th className="py-3 px-3 text-right font-bold">الباركود / اسم المادة</th>
                <th className="py-3 px-3 text-center w-24 font-bold">الكمية</th>
                <th className="py-3 px-3 text-left w-32 font-bold">سعر الشراء ({currencyLabel})</th>
                <th className="py-3 px-3 text-left w-32 font-bold">سعر البيع ({currencyLabel})</th>
                <th className="py-3 px-3 text-left w-32 font-bold">المجموع</th>
                <th className="py-3 px-3 text-center w-16 font-bold">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cart.map((row, idx) => {
                const isRowBadCost = row.unitCost <= 0 || row.quantity <= 0;
                const isSellBelowCost = row.sellPrice > 0 && row.sellPrice < row.unitCost;
                const isRowSelected = selectedRowIndex === idx;

                return (
                  <tr
                    key={`${row.sku}-${idx}`}
                    onClick={() => setSelectedRowIndex(idx)}
                    className={`transition-colors ${
                      isRowBadCost || isSellBelowCost
                        ? 'bg-red-50/50'
                        : isRowSelected
                          ? 'bg-blue-50/70'
                          : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-2 px-3 text-center font-num font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{row.name}</span>
                        {row.isNewItem && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            مادة جديدة (تُنشأ عند الحفظ)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-num">
                        {row.sku} · {row.specs} · آخر 3: {row.sku.slice(-3)}
                      </div>
                      {isSellBelowCost && (
                        <div className="text-[11px] text-red-700 font-bold mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>تنبيه: سعر البيع أقل من سعر الشراء!</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.quantity}
                        onChange={(e) => {
                          const v = Math.round(
                            parseLocaleNumber(sanitizeNumericInput(e.target.value, false))
                          );
                          if (v > 0) updateCartRow(idx, { quantity: v });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            focusEntryQuery();
                          }
                        }}
                        className="w-20 h-8 px-2 border border-slate-300 rounded bg-white font-num font-bold text-center text-slate-900"
                      />
                    </td>
                    <td className="py-2 px-3 text-left">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.unitCost}
                        onChange={(e) =>
                          updateCartRow(idx, {
                            unitCost: parseLocaleNumber(
                              sanitizeNumericInput(e.target.value, purCurrency === 'USD')
                            ),
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            focusEntryQuery();
                          }
                        }}
                        className={`w-28 h-8 px-2 border rounded bg-white font-num font-bold text-left ${
                          row.unitCost <= 0
                            ? 'border-red-500 text-red-700'
                            : 'border-slate-300 text-amber-700'
                        }`}
                      />
                    </td>
                    <td className="py-2 px-3 text-left">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.sellPrice}
                        onChange={(e) =>
                          updateCartRow(idx, {
                            sellPrice: parseLocaleNumber(
                              sanitizeNumericInput(e.target.value, purCurrency === 'USD')
                            ),
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            focusEntryQuery();
                          }
                        }}
                        className={`w-28 h-8 px-2 border rounded bg-white font-num font-semibold text-left ${
                          isSellBelowCost
                            ? 'border-red-500 text-red-700'
                            : 'border-slate-300 text-emerald-700'
                        }`}
                      />
                    </td>
                    <td className="py-2 px-3 text-left font-num font-extrabold text-slate-900">
                      {formatCurrency(row.unitCost * row.quantity, purCurrency)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCart((prev) => prev.filter((_, i) => i !== idx));
                          setSelectedRowIndex(null);
                          focusEntryQuery();
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        title="حذف السطر"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* ALWAYS-READY BOTTOM ENTRY ROW */}
              <tr className="bg-slate-50/90 border-t-2 border-slate-200">
                <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                  {cart.length + 1}
                </td>
                <td className="py-2.5 px-3 relative overflow-visible">
                  <div ref={entryCellRef} className="relative">
                    <div className="relative flex items-center">
                      <Barcode className="w-4 h-4 text-emerald-700 absolute right-2.5 pointer-events-none" />
                      <input
                        ref={entryQueryRef}
                        type="text"
                        value={entryQuery}
                        onChange={(e) => {
                          setEntryQuery(e.target.value);
                          setSelectedInvItem(null);
                          setSelectedNewItem(null);
                          setNotFoundPrompt(null);
                          setEntryErrors((prev) => ({ ...prev, query: undefined }));
                          setDropdownOpen(Boolean(e.target.value.trim()));
                        }}
                        onFocus={() => {
                          setSelectedRowIndex(null);
                          if (entryQuery.trim() && !selectedInvItem && !selectedNewItem) setDropdownOpen(true);
                        }}
                        onKeyDown={handleEntryQueryKeyDown}
                        placeholder="امسح الباركود أو اكتب اسم المادة الموردة..."
                        className={`w-full h-9 pr-8 pl-3 border rounded-lg bg-white text-xs font-semibold focus:outline-none focus:ring-2 ${
                          entryErrors.query
                            ? 'border-red-500 bg-red-50/40 focus:ring-red-500'
                            : 'border-emerald-500 focus:ring-emerald-600'
                        }`}
                      />
                    </div>
                    {selectedNewItem && (
                      <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                        <span>مادة جديدة جاهزة للإدراج · باركود: {selectedNewItem.sku}</span>
                      </div>
                    )}
                    {entryErrors.query && (
                      <div className="text-[11px] text-red-600 font-semibold mt-0.5">
                        {entryErrors.query}
                      </div>
                    )}

                    {/* Search Dropdown + "المادة غير موجودة في المخزن" + "أضف المادة" */}
                    {dropdownOpen && normalizedQuery.length > 0 && (
                      <div className="absolute right-0 left-0 top-full mt-1 bg-white border border-slate-300 rounded-xl shadow-xl z-40 max-h-72 overflow-y-auto">
                        {matchedInventory.length > 0 && (
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                              <tr>
                                <th className="py-1.5 px-3 text-right">المادة</th>
                                <th className="py-1.5 px-3 text-right">آخر 3 / الباركود</th>
                                <th className="py-1.5 px-3 text-center">الرصيد</th>
                                <th className="py-1.5 px-3 text-left">آخر شراء</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {matchedInventory.slice(0, 12).map((it, mIdx) => {
                                const unitC = convertToPurCurrency(
                                  it.costPrice,
                                  it.costCurrency,
                                  purCurrency
                                );
                                return (
                                  <tr
                                    key={it.id}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      selectInventoryIntoEntry(it);
                                    }}
                                    className={`cursor-pointer ${
                                      mIdx === highlightedIdx
                                        ? 'bg-emerald-50 text-slate-900'
                                        : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <td className="py-2 px-3 font-bold">
                                      {it.brand} {it.model}{' '}
                                      <span className="font-normal text-slate-500">
                                        ({it.storage})
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 font-num">
                                      <span className="font-extrabold text-blue-700">
                                        {it.sku.slice(-3)}
                                      </span>
                                      <span className="text-slate-400 mr-1.5">({it.sku})</span>
                                    </td>
                                    <td className="py-2 px-3 text-center font-num font-bold">
                                      {formatQtyNumber(it.quantity)}
                                    </td>
                                    <td className="py-2 px-3 text-left font-num font-bold text-amber-700">
                                      {formatCurrency(unitC, purCurrency)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}

                        <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-red-700">
                            {matchedInventory.length === 0
                              ? 'المادة غير موجودة في المخزن'
                              : 'مادة جديدة غير مسجلة؟'}
                          </span>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              openNewItemModal(entryQuery);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            <span>أضف المادة</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </td>

                <td className="py-2.5 px-3 text-center">
                  <input
                    ref={entryQtyRef}
                    type="text"
                    inputMode="numeric"
                    value={entryQty}
                    onChange={(e) => {
                      setEntryQty(sanitizeNumericInput(e.target.value, false));
                      setEntryErrors((prev) => ({ ...prev, qty: undefined }));
                    }}
                    onKeyDown={handleEntryQtyKeyDown}
                    className={`w-20 h-9 px-2 border rounded-lg bg-white font-num font-bold text-center focus:outline-none focus:ring-2 ${
                      entryErrors.qty
                        ? 'border-red-500 bg-red-50/40 focus:ring-red-500'
                        : 'border-slate-300 focus:ring-emerald-600'
                    }`}
                  />
                </td>

                <td className="py-2.5 px-3 text-left">
                  <input
                    ref={entryCostRef}
                    type="text"
                    inputMode="decimal"
                    value={entryCost}
                    onChange={(e) => {
                      setEntryCost(sanitizeNumericInput(e.target.value, purCurrency === 'USD'));
                      setEntryErrors((prev) => ({ ...prev, cost: undefined }));
                    }}
                    onKeyDown={handleEntryCostKeyDown}
                    placeholder={purCurrency === 'USD' ? '0.00' : '0'}
                    className={`w-28 h-9 px-2 border rounded-lg bg-white font-num font-bold text-amber-700 text-left focus:outline-none focus:ring-2 ${
                      entryErrors.cost
                        ? 'border-red-500 bg-red-50/40 focus:ring-red-500'
                        : 'border-slate-300 focus:ring-emerald-600'
                    }`}
                  />
                </td>

                <td className="py-2.5 px-3 text-left">
                  <input
                    ref={entrySellRef}
                    type="text"
                    inputMode="decimal"
                    value={entrySell}
                    onChange={(e) =>
                      setEntrySell(sanitizeNumericInput(e.target.value, purCurrency === 'USD'))
                    }
                    onKeyDown={handleEntrySellKeyDown}
                    placeholder="سعر البيع..."
                    className={`w-28 h-9 px-2 border rounded-lg bg-white font-num font-bold text-left focus:outline-none focus:ring-2 ${
                      entrySellBelowCost
                        ? 'border-red-500 text-red-700 bg-red-50/40 focus:ring-red-500'
                        : 'border-slate-300 text-emerald-700 focus:ring-emerald-600'
                    }`}
                  />
                </td>

                <td className="py-2.5 px-3 text-left font-num font-bold text-slate-600">
                  {entryCost.trim()
                    ? formatCurrency(
                        (parseLocaleNumber(entryCost) || 0) *
                          Math.max(1, Math.round(parseLocaleNumber(entryQty)) || 1),
                        purCurrency
                      )
                    : '—'}
                </td>

                <td className="py-2.5 px-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={commitEntryRow}
                      title="إضافة للشحنة"
                      className="h-9 px-2.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 inline-flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openNewItemModal()}
                      title="أضف المادة"
                      className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold hover:bg-slate-100 inline-flex items-center justify-center gap-1"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      <span className="text-[11px]">أضف المادة</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Message when typed/scanned material is NOT in inventory + "أضف المادة" button */}
        {notFoundPrompt && (
          <div className="px-4 py-2.5 bg-red-50 border-t border-red-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-red-800 font-bold">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                المادة غير موجودة في المخزن (<span className="font-num">{notFoundPrompt}</span>)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openNewItemModal(notFoundPrompt)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>أضف المادة</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotFoundPrompt(null);
                  focusEntryQuery();
                }}
                className="px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-red-800 font-semibold hover:bg-red-100"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}

        {entrySellBelowCost && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>تنبيه فوري: سعر البيع المقترح في سطر الإدخال أقل من سعر الشراء!</span>
          </div>
        )}

        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات الشحنة (رقم البوليصة، شروط السداد)..."
            className="flex-1 min-w-[240px] h-8 px-3 border border-slate-200 rounded-lg bg-white text-xs"
          />
          <span className="text-[11px] text-slate-500">
            تنقل: الباركود ← الكمية ← سعر الشراء ← سعر البيع ← Enter للإضافة | Delete للحذف | F9 للحفظ
          </span>
        </div>
      </div>

      {/* Inline Clear Confirmation Bar */}
      {confirmClearCart && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-amber-950">
            هل تريد مسح مواد فاتورة الشراء الحالية وإعادة تصفيرها؟
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
            >
              نعم، مسح
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearCart(false)}
              className="px-4 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 font-semibold hover:bg-amber-100"
            >
              تراجع
            </button>
          </div>
        </div>
      )}

      {formErrors.general && (
        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
          {formErrors.general}
        </div>
      )}

      {/* 3. LARGE BOTTOM TOTALS BAR: المجموع | الخصم | الصافي | المدفوع | المتبقي للمورد */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-stretch">
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div className="text-xs font-semibold text-slate-500">المجموع</div>
            <div className="font-num font-extrabold text-xl text-slate-900 mt-1">
              {formatCurrency(subtotal, purCurrency)}
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border flex flex-col justify-between ${
              isDiscountExceeded ? 'border-red-500 bg-red-50/40' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="text-xs font-semibold text-slate-500">
              الخصم ({currencyLabel})
            </div>
            <input
              type="text"
              inputMode="decimal"
              disabled={isOpeningBalance}
              value={isOpeningBalance ? '0' : discount}
              onChange={(e) => {
                setDiscount(sanitizeNumericInput(e.target.value, purCurrency === 'USD'));
                setFormErrors((prev) => ({ ...prev, discount: undefined }));
              }}
              className={`w-full h-9 px-2.5 mt-1 border rounded-lg font-num font-extrabold text-lg ${
                isOpeningBalance
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : isDiscountExceeded
                  ? 'bg-white border-red-500 text-red-700'
                  : 'bg-white border-slate-300 text-amber-700'
              }`}
            />
            {isDiscountExceeded && (
              <span className="text-[10px] font-bold text-red-600 mt-0.5">
                يتجاوز المجموع
              </span>
            )}
          </div>

          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 flex flex-col justify-between">
            <div className="text-xs font-bold text-emerald-800">الصافي</div>
            <div className="font-num font-extrabold text-2xl text-emerald-700 mt-0.5">
              {formatCurrency(netTotal, purCurrency)}
            </div>
            <div className="text-[10px] font-semibold text-emerald-800 truncate" title={tafqeetText}>
              {tafqeetText}
            </div>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-semibold text-slate-500">المدفوع</span>
              {!isOpeningBalance && (
                <button
                  type="button"
                  onClick={() => setShowMixedCurrency((v) => !v)}
                  className="text-[10px] font-bold text-blue-700 hover:underline"
                >
                  {showMixedCurrency ? 'عملة واحدة' : 'مختلط ($ + د.ع)'}
                </button>
              )}
            </div>
            {isOpeningBalance ? (
              <div className="font-num font-extrabold text-lg text-slate-500 mt-1">
                {formatCurrency(0, purCurrency)} (رصيد افتتاحي)
              </div>
            ) : !showMixedCurrency ? (
              <input
                type="text"
                inputMode="decimal"
                value={paidNowInput}
                onChange={(e) =>
                  setPaidNowInput(sanitizeNumericInput(e.target.value, purCurrency === 'USD'))
                }
                placeholder={purchaseType === 'cash' ? String(netTotal) : '0'}
                className="w-full h-9 px-2.5 mt-1 border border-slate-300 rounded-lg bg-white font-num font-extrabold text-lg text-emerald-700"
              />
            ) : (
              <div className="font-num font-extrabold text-lg text-emerald-700 mt-1">
                {formatCurrency(effectivePaid, purCurrency)}
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 flex flex-col justify-between">
            <div className="text-xs font-bold text-amber-900">
              {isOpeningBalance ? 'دين المورد' : 'المتبقي للمورد'}
            </div>
            <div className="font-num font-extrabold text-xl text-red-700 mt-1">
              {formatCurrency(remaining, purCurrency)}
            </div>
            <div className="text-[10px] font-num text-amber-800">
              {isOpeningBalance
                ? 'رصيد افتتاحي — لا ينشئ ديناً على المحل'
                : `رصيد المورد بعد الفاتورة: ${formatCurrency(newSupplierBalance, purCurrency)}`}
            </div>
          </div>
        </div>

        {!isOpeningBalance && showMixedCurrency && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                المدفوع دولار ($)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={paidUSD}
                onChange={(e) => setPaidUSD(sanitizeNumericInput(e.target.value, true))}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-num font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                المدفوع دينار (د.ع)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={paidIQD}
                onChange={(e) => setPaidIQD(sanitizeNumericInput(e.target.value, false))}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-num font-bold"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. STICKY BOTTOM SHORTCUT ACTION BAR */}
      <div className="sticky bottom-2 z-20 bg-white border border-slate-300 shadow-sm rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit(false)}
            className="h-10 px-4 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ (F9)'}</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSubmit(true)}
            className="h-10 px-4 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>حفظ وطباعة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (cart.length > 0) setConfirmClearCart(true);
              else resetForm();
            }}
            className="h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-800 font-bold hover:bg-slate-50 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>فاتورة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowCatalogPanel((prev) => {
                const next = !prev;
                if (next) setTimeout(() => catalogSearchRef.current?.focus(), 30);
                else focusEntryQuery();
                return next;
              });
            }}
            className="h-10 px-3.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 font-bold hover:bg-blue-100 inline-flex items-center gap-1.5"
          >
            <Search className="w-4 h-4" />
            <span>بحث (F2)</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmClearCart(true)}
            disabled={cart.length === 0 && !entryQuery}
            className="h-10 px-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold hover:bg-red-100 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            <span>مسح</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => (onBack ? onBack() : goBack())}
          className="h-10 px-4 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 inline-flex items-center gap-1.5"
        >
          <ArrowRight className="w-4 h-4" />
          <span>خروج</span>
        </button>
      </div>

      {/* Popup Window for Adding New Material (اسم المادة + باركود المادة فقط — السعر يتحدد في قائمة المشتريات) */}
      {newItemModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          onClick={closeNewItemModal}
        >
          <form
            onSubmit={confirmNewItemModal}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <PackagePlus className="w-4 h-4 text-emerald-700" />
                <span>إضافة مادة جديدة (الاسم والباركود فقط)</span>
              </div>
              <button
                type="button"
                onClick={closeNewItemModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalSimilarItems.length > 0 && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>تنبيه: توجد مواد مشابهة في المخزن:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {modalSimilarItems.map((sim) => (
                    <button
                      key={sim.id}
                      type="button"
                      onClick={() => selectInventoryIntoEntry(sim)}
                      className="px-2 py-1 rounded bg-white border border-amber-300 text-amber-950 font-semibold hover:bg-amber-100 text-[11px]"
                    >
                      اختيار: {sim.brand} {sim.model} ({sim.sku})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم المادة *</label>
                <input
                  ref={newItemNameRef}
                  type="text"
                  value={newItemName}
                  onChange={(e) => {
                    setNewItemName(e.target.value);
                    setModalErrors((p) => ({ ...p, name: undefined }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeNewItemModal();
                  }}
                  placeholder="أدخل اسم المادة..."
                  className={`w-full h-10 px-3 border rounded-lg text-sm bg-white ${
                    modalErrors.name ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                  }`}
                />
                {modalErrors.name && (
                  <p className="text-[11px] text-red-600 font-bold mt-1">{modalErrors.name}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">باركود المادة *</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewItemSku(generateUniqueSku());
                      setModalErrors((p) => ({ ...p, sku: undefined }));
                    }}
                    className="text-[11px] font-bold text-blue-700 hover:underline"
                  >
                    توليد باركود
                  </button>
                </div>
                <input
                  ref={newItemSkuRef}
                  type="text"
                  value={newItemSku}
                  onChange={(e) => {
                    setNewItemSku(sanitizeBarcode(e.target.value));
                    setModalErrors((p) => ({ ...p, sku: undefined }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeNewItemModal();
                  }}
                  placeholder="امسح أو اكتب باركود المادة..."
                  className={`w-full h-10 px-3 border rounded-lg text-sm font-num bg-white ${
                    modalErrors.sku || modalDuplicateSkuSource
                      ? 'border-red-500 bg-red-50/40'
                      : 'border-slate-300'
                  }`}
                />
                {(modalErrors.sku || modalDuplicateSkuSource) && (
                  <p className="text-[11px] text-red-600 font-bold mt-1">
                    {modalErrors.sku || `الباركود مستخدم مسبقاً للمادة: ${modalDuplicateSkuSource}`}
                  </p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              بعد التأكيد سيتم إدراج المادة في سطر قائمة المشتريات لتحديد الكمية وسعر الشراء والبيع مباشرة.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={closeNewItemModal}
                className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={Boolean(modalDuplicateSkuSource)}
                className="h-9 px-4 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تأكيد وإضافة للفاتورة</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
