import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  UserPlus,
  Printer,
  CheckCircle2,
  Barcode,
  ArrowRight,
  Search,
  Save,
  RotateCcw,
  AlertTriangle,
  Lock,
  ChevronRight,
  ChevronLeft,
  Ban,
  Wallet,
  BookOpen,
  X,
} from 'lucide-react';
import { CurrencyCode, InventoryItem, SaleInvoice, SaleType } from '../types/erp';
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

interface POSCartRow {
  itemId: string; // 'custom-item' or InventoryItem.id
  sku: string;
  name: string;
  specs: string;
  quantity: number;
  maxStock: number | null;
  unitPrice: number;
  unitCost: number;
}

interface POSDraftPayload {
  customerId: string;
  invoiceNumber: string;
  saleType: SaleType;
  invoiceCurrency: CurrencyCode;
  cart: POSCartRow[];
  discount: string;
  discountType: 'amount' | 'percent';
  paidNowInput: string;
  showMixedCurrency: boolean;
  downUSD: string;
  downIQD: string;
  ratePer100: string;
  installmentCount: string;
  firstDueDate: string;
  notes: string;
}

const POS_DRAFT_KEY = 'alkafeel_pos_draft_v1';

function toLocalDateTimeInput(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function getNextSaleInvoiceNumber(existingNumbers: string[]): string {
  let maxNum = 1000;
  for (const code of existingNumbers) {
    const match = code.match(/(\d+)/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxNum) maxNum = val;
    }
  }
  return `${maxNum + 1}A`;
}

function loadPOSDraft(): Partial<POSDraftPayload> | null {
  try {
    const raw = localStorage.getItem(POS_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<POSDraftPayload>;
  } catch {
    return null;
  }
}

export function POSView() {
  const {
    state,
    storeSettings,
    setActiveNav,
    goBack,
    openCustomerForm,
    lastCreatedCustomerId,
    clearLastCreatedCustomerId,
    createSaleInvoice,
    cancelSaleInvoice,
    getCustomerBalances,
    openPrintPreview,
    openSettlementPage,
    hasPermission,
    verifyAdminPin,
    setHasUnsavedChanges,
    notify,
  } = useERP();

  const initialDraft = useMemo(() => loadPOSDraft(), []);
  const canSeeCost = hasPermission('canEditCostPrices') || hasPermission('canViewProfitsAndFX');

  // Header & Customer Metadata
  const [customerId, setCustomerId] = useState<string>(
    initialDraft?.customerId || state.customers[0]?.id || ''
  );
  const [invoiceNumber, setInvoiceNumber] = useState<string>(
    () =>
      initialDraft?.invoiceNumber ||
      getNextSaleInvoiceNumber(state.sales.map((s) => s.invoiceNumber))
  );
  const [saleType, setSaleType] = useState<SaleType>(initialDraft?.saleType || 'cash');
  const [invoiceCurrency, setInvoiceCurrency] = useState<CurrencyCode>(
    initialDraft?.invoiceCurrency || 'USD'
  );
  const [invoiceDateTime, setInvoiceDateTime] = useState<string>(() => toLocalDateTimeInput());

  // Classic Bottom Entry Row State
  const [entryQuery, setEntryQuery] = useState('');
  const [entryQty, setEntryQty] = useState('1');
  const [entryPrice, setEntryPrice] = useState('');
  const [selectedInvItem, setSelectedInvItem] = useState<InventoryItem | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [missingBarcodeNotice, setMissingBarcodeNotice] = useState<string | null>(null);
  const [entryErrors, setEntryErrors] = useState<{
    query?: string;
    qty?: string;
    price?: string;
  }>({});

  // Catalog Inline Quick Lookup Drawer (F2)
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');

  // Table Row Selection (for Arrow Up/Down & Delete key)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [confirmClearCart, setConfirmClearCart] = useState(false);

  // Refs for Enter keyboard flow: Barcode/Name -> Qty -> Price -> Next Row
  const entryCellRef = useRef<HTMLDivElement | null>(null);
  const entryQueryRef = useRef<HTMLInputElement | null>(null);
  const entryQtyRef = useRef<HTMLInputElement | null>(null);
  const entryPriceRef = useRef<HTMLInputElement | null>(null);
  const catalogSearchRef = useRef<HTMLInputElement | null>(null);
  const keyBurstRef = useRef<{ lastTime: number; chars: number }>({ lastTime: 0, chars: 0 });

  // Invoice Items & Totals
  const [cart, setCart] = useState<POSCartRow[]>(
    () => (Array.isArray(initialDraft?.cart) ? initialDraft.cart : [])
  );
  const [discount, setDiscount] = useState<string>(initialDraft?.discount || '0');
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>(
    initialDraft?.discountType || 'amount'
  );
  const [paidNowInput, setPaidNowInput] = useState<string>(initialDraft?.paidNowInput || '');
  const [showMixedCurrency, setShowMixedCurrency] = useState(
    Boolean(initialDraft?.showMixedCurrency)
  );
  const [downUSD, setDownUSD] = useState<string>(initialDraft?.downUSD || '0');
  const [downIQD, setDownIQD] = useState<string>(initialDraft?.downIQD || '0');
  const [ratePer100, setRatePer100] = useState<string>(
    initialDraft?.ratePer100 || String(Math.round(state.activeExchangeRate * 100))
  );
  const [installmentCount, setInstallmentCount] = useState<string>(
    initialDraft?.installmentCount || '6'
  );
  const [firstDueDate, setFirstDueDate] = useState<string>(() => {
    if (initialDraft?.firstDueDate) return initialDraft.firstDueDate;
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState(initialDraft?.notes || '');

  // Below-cost confirmation & Validation & Submit lock
  const [belowCostConfirmed, setBelowCostConfirmed] = useState(false);
  const [managerApprovalPin, setManagerApprovalPin] = useState('');
  const [managerPinError, setManagerPinError] = useState('');
  const [formErrors, setFormErrors] = useState<{
    customer?: string;
    cart?: string;
    discount?: string;
    belowCost?: string;
    general?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastCreatedSale, setLastCreatedSale] = useState<SaleInvoice | null>(null);

  // Invoice Navigator State (null = current new invoice draft)
  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null);
  const [showCancelViewedBar, setShowCancelViewedBar] = useState(false);
  const [cancelViewedReason, setCancelViewedReason] = useState('');
  const [cancelViewedError, setCancelViewedError] = useState('');
  const [isCancellingViewed, setIsCancellingViewed] = useState(false);

  const orderedSales = useMemo(
    () =>
      [...state.sales].sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (diff !== 0) return diff;
        return a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true });
      }),
    [state.sales]
  );

  const viewingSale = useMemo(
    () => (viewingSaleId ? orderedSales.find((s) => s.id === viewingSaleId) || null : null),
    [viewingSaleId, orderedSales]
  );

  const viewingIndex = useMemo(
    () => (viewingSale ? orderedSales.findIndex((s) => s.id === viewingSale.id) : -1),
    [viewingSale, orderedSales]
  );

  const canGoPrevSale = viewingSale === null ? orderedSales.length > 0 : viewingIndex > 0;
  const canGoNextSale = viewingSale !== null;

  const focusBarcodeEntry = useCallback(() => {
    setTimeout(() => {
      entryQueryRef.current?.focus();
    }, 30);
  }, []);

  // Auto-focus Barcode/Name cell when opening POS in new-invoice mode
  useEffect(() => {
    if (!viewingSaleId) {
      focusBarcodeEntry();
    }
  }, [viewingSaleId, focusBarcodeEntry]);

  // Auto-select customer if returning from standalone New Customer Page
  useEffect(() => {
    if (lastCreatedCustomerId && state.customers.some((c) => c.id === lastCreatedCustomerId)) {
      setCustomerId(lastCreatedCustomerId);
      setFormErrors((prev) => ({ ...prev, customer: undefined }));
      clearLastCreatedCustomerId();
    }
  }, [lastCreatedCustomerId, state.customers, clearLastCreatedCustomerId]);

  // Sync customer if invalid
  useEffect(() => {
    if ((!customerId || !state.customers.some((c) => c.id === customerId)) && state.customers.length > 0) {
      setCustomerId(state.customers[0].id);
    }
  }, [customerId, state.customers]);

  // Auto-save POS Draft to localStorage
  useEffect(() => {
    try {
      const draft: POSDraftPayload = {
        customerId,
        invoiceNumber,
        saleType,
        invoiceCurrency,
        cart,
        discount,
        discountType,
        paidNowInput,
        showMixedCurrency,
        downUSD,
        downIQD,
        ratePer100,
        installmentCount,
        firstDueDate,
        notes,
      };
      localStorage.setItem(POS_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore quota errors
    }
  }, [
    customerId,
    invoiceNumber,
    saleType,
    invoiceCurrency,
    cart,
    discount,
    discountType,
    paidNowInput,
    showMixedCurrency,
    downUSD,
    downIQD,
    ratePer100,
    installmentCount,
    firstDueDate,
    notes,
  ]);

  // Mark unsaved changes when cart has items
  useEffect(() => {
    setHasUnsavedChanges(cart.length > 0);
  }, [cart.length, setHasUnsavedChanges]);

  useEffect(() => {
    return () => setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  const activeCustomer = useMemo(
    () => state.customers.find((c) => c.id === customerId) || state.customers[0] || null,
    [state.customers, customerId]
  );

  const getItemPriceInInvoiceCurrency = useCallback(
    (it: InventoryItem, targetCurrency: CurrencyCode, activeSaleType: SaleType): number => {
      const basePrice = activeSaleType === 'installment' ? it.installmentPrice : it.cashPrice;
      if (it.sellCurrency === targetCurrency) return basePrice;
      if (targetCurrency === 'IQD') return Math.round(basePrice * state.activeExchangeRate);
      return Number((basePrice / state.activeExchangeRate).toFixed(2));
    },
    [state.activeExchangeRate]
  );

  const getItemCostInInvoiceCurrency = useCallback(
    (it: InventoryItem, targetCurrency: CurrencyCode): number => {
      if (it.costCurrency === targetCurrency) return it.costPrice;
      if (targetCurrency === 'IQD') return Math.round(it.costPrice * state.activeExchangeRate);
      return Number((it.costPrice / state.activeExchangeRate).toFixed(2));
    },
    [state.activeExchangeRate]
  );

  // Sync cart unitCost & refresh maxStock from live inventory when currency/inventory changes
  useEffect(() => {
    setCart((prev) =>
      prev.map((row) => {
        if (row.itemId === 'custom-item') return row;
        const live = state.inventory.find((i) => i.id === row.itemId);
        if (!live) return row;
        return {
          ...row,
          maxStock: live.quantity,
          unitCost: getItemCostInInvoiceCurrency(live, invoiceCurrency),
        };
      })
    );
  }, [invoiceCurrency, state.inventory, getItemCostInInvoiceCurrency]);

  useEffect(() => {
    if (selectedInvItem) {
      setEntryPrice(String(getItemPriceInInvoiceCurrency(selectedInvItem, invoiceCurrency, saleType)));
    }
  }, [selectedInvItem, invoiceCurrency, saleType, getItemPriceInInvoiceCurrency]);

  // Search matching in entry cell
  const normalizedQuery = useMemo(() => {
    const raw = entryQuery.trim();
    if (!raw) return '';
    return raw.toLowerCase();
  }, [entryQuery]);

  const matchedInventory = useMemo(() => {
    if (!normalizedQuery) return [];
    const cleanLatin = sanitizeBarcode(normalizedQuery).toLowerCase();
    return state.inventory.filter((it) => {
      const fullName = `${it.brand} ${it.model} ${it.storage} ${it.color}`.toLowerCase();
      const skuLower = it.sku.toLowerCase();
      const last3 = skuLower.slice(-3);
      return (
        fullName.includes(normalizedQuery) ||
        it.brand.toLowerCase().includes(normalizedQuery) ||
        it.model.toLowerCase().includes(normalizedQuery) ||
        skuLower.includes(cleanLatin || normalizedQuery) ||
        last3.includes(cleanLatin || normalizedQuery) ||
        it.imeiList.some((im) => im.toLowerCase().includes(cleanLatin || normalizedQuery))
      );
    });
  }, [state.inventory, normalizedQuery]);

  const catalogItems = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return state.inventory;
    const cleanQ = sanitizeBarcode(q).toLowerCase();
    return state.inventory.filter((it) => {
      const fullName = `${it.brand} ${it.model} ${it.storage} ${it.color}`.toLowerCase();
      const skuLower = it.sku.toLowerCase();
      return (
        fullName.includes(q) ||
        skuLower.includes(cleanQ || q) ||
        skuLower.slice(-3).includes(cleanQ || q)
      );
    });
  }, [state.inventory, catalogSearch]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [matchedInventory.length, normalizedQuery]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (entryCellRef.current && !entryCellRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const clearEntryRow = useCallback(() => {
    setEntryQuery('');
    setEntryQty('1');
    setEntryPrice('');
    setSelectedInvItem(null);
    setDropdownOpen(false);
    setMissingBarcodeNotice(null);
    setEntryErrors({});
  }, []);

  const addInventoryItemToCart = useCallback(
    (it: InventoryItem, qtyToAdd = 1, customUnitPrice?: number): boolean => {
      if (qtyToAdd <= 0) {
        notify('الكمية يجب أن تكون أكبر من صفر.', 'error');
        return false;
      }

      const existingRow = cart.find((row) => row.itemId === it.id);
      const currentQty = existingRow ? existingRow.quantity : 0;

      if (!storeSettings.allowNegativeStock) {
        if (it.quantity <= 0) {
          notify(`المنتج ${it.brand} ${it.model} نفذت كميته من المخزن (المتاح: 0).`, 'error');
          return false;
        }
        if (currentQty + qtyToAdd > it.quantity) {
          notify(
            `الكمية المطلوبة للمنتج ${it.brand} ${it.model} تتجاوز المتاح بالمخزن (${it.quantity}).`,
            'error'
          );
          return false;
        }
      }

      const unitPrice =
        customUnitPrice !== undefined && Number.isFinite(customUnitPrice)
          ? customUnitPrice
          : getItemPriceInInvoiceCurrency(it, invoiceCurrency, saleType);
      const unitCost = getItemCostInInvoiceCurrency(it, invoiceCurrency);
      const displayName = `${it.brand}${it.model ? ` ${it.model}` : ''}`.trim();
      const specs = `${it.storage}${it.color ? ` · ${it.color}` : ''}`;

      setCart((prev) => {
        const existingIdx = prev.findIndex((row) => row.itemId === it.id);
        if (existingIdx >= 0) {
          return prev.map((row, idx) =>
            idx === existingIdx
              ? {
                  ...row,
                  quantity: row.quantity + qtyToAdd,
                  unitPrice: customUnitPrice !== undefined ? unitPrice : row.unitPrice,
                  maxStock: it.quantity,
                  unitCost,
                }
              : row
          );
        }
        return [
          ...prev,
          {
            itemId: it.id,
            sku: it.sku,
            name: displayName,
            specs,
            quantity: qtyToAdd,
            maxStock: it.quantity,
            unitPrice,
            unitCost,
          },
        ];
      });

      setFormErrors((prev) => ({ ...prev, cart: undefined }));
      setMissingBarcodeNotice(null);
      setSelectedRowIndex(null);
      return true;
    },
    [
      cart,
      storeSettings.allowNegativeStock,
      getItemCostInInvoiceCurrency,
      getItemPriceInInvoiceCurrency,
      invoiceCurrency,
      notify,
      saleType,
    ]
  );

  const findItemByBarcode = useCallback(
    (rawCode: string): InventoryItem | null => {
      const code = sanitizeBarcode(rawCode).toLowerCase();
      if (!code) return null;

      const exactSku = state.inventory.find((it) => it.sku.toLowerCase() === code);
      if (exactSku) return exactSku;

      const exactImei = state.inventory.find((it) =>
        it.imeiList.some((im) => im.toLowerCase() === code)
      );
      if (exactImei) return exactImei;

      if (code.length >= 3) {
        const suffixMatches = state.inventory.filter((it) =>
          it.sku.toLowerCase().endsWith(code)
        );
        if (suffixMatches.length === 1) return suffixMatches[0];
      }

      return null;
    },
    [state.inventory]
  );

  const selectItemIntoEntryAndAdvance = useCallback(
    (it: InventoryItem) => {
      const price = getItemPriceInInvoiceCurrency(it, invoiceCurrency, saleType);
      const displayName = `${it.brand}${it.model ? ` ${it.model}` : ''}`.trim();
      setSelectedInvItem(it);
      setEntryQuery(displayName);
      setEntryQty('1');
      setEntryPrice(String(price));
      setDropdownOpen(false);
      setMissingBarcodeNotice(null);
      setEntryErrors({});
      setTimeout(() => {
        entryQtyRef.current?.focus();
        entryQtyRef.current?.select();
      }, 15);
    },
    [getItemPriceInInvoiceCurrency, invoiceCurrency, saleType]
  );

  // Instant scanner add (used when scanner wedge bursts or re-scanning an already-in-cart barcode)
  const handleScannerInstantAdd = useCallback(
    (rawCode: string): boolean => {
      const cleanCode = sanitizeBarcode(rawCode);
      if (!cleanCode) return false;
      const found = findItemByBarcode(cleanCode);
      if (!found) return false;
      if (addInventoryItemToCart(found, 1)) {
        clearEntryRow();
        notify(`تم إضافة ${found.brand} ${found.model} (${found.sku})`);
      }
      focusBarcodeEntry();
      return true;
    },
    [addInventoryItemToCart, clearEntryRow, findItemByBarcode, focusBarcodeEntry, notify]
  );

  // Commit current entry row from Price field (or manual confirm)
  const commitEntryRow = useCallback(() => {
    const qty = Math.round(parseLocaleNumber(entryQty));
    const unitPrice = parseLocaleNumber(entryPrice);

    const errs: typeof entryErrors = {};
    if (qty <= 0) errs.qty = 'الكمية > 0';
    if (entryPrice.trim() && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      errs.price = 'سعر غير صالح';
    }
    if (Object.keys(errs).length > 0) {
      setEntryErrors(errs);
      if (errs.qty) entryQtyRef.current?.focus();
      else if (errs.price) entryPriceRef.current?.focus();
      return;
    }

    if (selectedInvItem) {
      if (
        addInventoryItemToCart(
          selectedInvItem,
          qty,
          entryPrice.trim() ? unitPrice : undefined
        )
      ) {
        clearEntryRow();
        focusBarcodeEntry();
      }
      return;
    }

    const byCode = findItemByBarcode(entryQuery);
    if (byCode) {
      if (addInventoryItemToCart(byCode, qty, entryPrice.trim() ? unitPrice : undefined)) {
        clearEntryRow();
        focusBarcodeEntry();
      }
      return;
    }

    if (!entryQuery.trim()) {
      setEntryErrors({ query: 'أدخل الباركود أو اسم المادة.' });
      focusBarcodeEntry();
      return;
    }

    const cleanQuery = sanitizeBarcode(entryQuery) || entryQuery.trim();
    setDropdownOpen(false);
    setMissingBarcodeNotice(cleanQuery);
    setEntryErrors({
      query: 'المادة غير موجودة في المخزون — تتم إضافة المواد الجديدة عبر فاتورة الشراء فقط.',
    });
    focusBarcodeEntry();
  }, [
    addInventoryItemToCart,
    clearEntryRow,
    entryPrice,
    entryQty,
    entryQuery,
    findItemByBarcode,
    focusBarcodeEntry,
    selectedInvItem,
  ]);

  // Keyboard flow inside Entry Barcode/Name field
  const handleEntryQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    const isRapidScan = now - keyBurstRef.current.lastTime < 45;
    if (e.key.length === 1) {
      keyBurstRef.current = {
        lastTime: now,
        chars: isRapidScan ? keyBurstRef.current.chars + 1 : 1,
      };
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdownOpen && matchedInventory.length > 0) {
        setHighlightedIdx((prev) => (prev + 1) % matchedInventory.length);
      } else if (selectedRowIndex !== null && cart.length > 0) {
        if (selectedRowIndex < cart.length - 1) setSelectedRowIndex(selectedRowIndex + 1);
        else setSelectedRowIndex(null);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (dropdownOpen && matchedInventory.length > 0) {
        setHighlightedIdx((prev) => (prev - 1 + matchedInventory.length) % matchedInventory.length);
      } else if (cart.length > 0) {
        setDropdownOpen(false);
        setSelectedRowIndex((prev) =>
          prev === null ? cart.length - 1 : Math.max(0, prev - 1)
        );
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      clearEntryRow();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();

      if (!entryQuery.trim()) return;

      // 1. If a dropdown suggestion is open & highlighted, pick it
      if (dropdownOpen && matchedInventory.length > 0 && !selectedInvItem) {
        const picked = matchedInventory[highlightedIdx] || matchedInventory[0];
        // If user just scanned exact barcode of an existing item in cart OR hardware burst scan:
        const clean = sanitizeBarcode(entryQuery).toLowerCase();
        const isExactCode =
          picked.sku.toLowerCase() === clean ||
          picked.imeiList.some((im) => im.toLowerCase() === clean);
        const alreadyInCart = cart.some((r) => r.itemId === picked.id);

        if (isExactCode && (alreadyInCart || keyBurstRef.current.chars >= 4)) {
          handleScannerInstantAdd(entryQuery);
          return;
        }
        selectItemIntoEntryAndAdvance(picked);
        return;
      }

      // 2. If exact barcode match exists:
      const byCode = findItemByBarcode(entryQuery);
      if (byCode) {
        const alreadyInCart = cart.some((r) => r.itemId === byCode.id);
        if (alreadyInCart || keyBurstRef.current.chars >= 4) {
          handleScannerInstantAdd(entryQuery);
          return;
        }
        selectItemIntoEntryAndAdvance(byCode);
        return;
      }

      // 3. If user already picked an item, advance to Qty
      if (selectedInvItem) {
        entryQtyRef.current?.focus();
        entryQtyRef.current?.select();
        return;
      }

      // 4. Not found in inventory -> block creation here and direct user to purchase invoice
      const clean = sanitizeBarcode(entryQuery) || entryQuery.trim();
      setDropdownOpen(false);
      setMissingBarcodeNotice(clean);
      setEntryErrors({
        query: 'المادة غير موجودة في المخزون — تُضاف المواد الجديدة عبر فاتورة الشراء فقط.',
      });
    }
  };

  const handleEntryQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      clearEntryRow();
      focusBarcodeEntry();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const q = Math.round(parseLocaleNumber(entryQty));
      if (q <= 0) {
        setEntryErrors({ qty: 'الكمية يجب أن تكون > 0' });
        return;
      }
      setEntryErrors((prev) => ({ ...prev, qty: undefined }));
      entryPriceRef.current?.focus();
      entryPriceRef.current?.select();
    }
  };

  const handleEntryPriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      clearEntryRow();
      focusBarcodeEntry();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commitEntryRow();
    }
  };

  // Global Hardware Barcode Scanner Wedge Listener (when focus is outside entryQueryRef)
  useEffect(() => {
    if (viewingSale) return;
    let buffer = '';
    let lastKeyTime = 0;

    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isInputFocused = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (target === entryQueryRef.current) {
        buffer = '';
        return;
      }

      const now = Date.now();
      const delta = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 3 && (!isInputFocused || delta < 70)) {
          e.preventDefault();
          const scanned = buffer;
          buffer = '';
          if (!handleScannerInstantAdd(scanned)) {
            setMissingBarcodeNotice(sanitizeBarcode(scanned));
            focusBarcodeEntry();
          }
        } else {
          buffer = '';
        }
        return;
      }

      if (e.key.length === 1) {
        if (!isInputFocused) {
          if (delta > 150) buffer = '';
          buffer += e.key;
        } else {
          if (delta > 45) buffer = '';
          buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [viewingSale, handleScannerInstantAdd, focusBarcodeEntry]);

  const updateCartQty = (idx: number, nextQty: number) => {
    const cleanQty = Math.max(1, Math.round(nextQty) || 1);
    const row = cart[idx];
    if (!row) return;
    if (
      !storeSettings.allowNegativeStock &&
      row.maxStock !== null &&
      cleanQty > row.maxStock
    ) {
      notify(`المتاح في المخزن من ${row.name} هو ${row.maxStock} فقط.`, 'error');
      return;
    }
    setCart((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: cleanQty } : r)));
  };

  const updateCartPrice = (idx: number, nextPrice: number) => {
    setCart((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, unitPrice: Math.max(0, nextPrice) } : r))
    );
  };

  // Totals Calculations
  const subtotal = useMemo(
    () => cart.reduce((sum, r) => sum + r.unitPrice * r.quantity, 0),
    [cart]
  );

  const totalUnits = useMemo(
    () => cart.reduce((sum, r) => sum + r.quantity, 0),
    [cart]
  );

  const belowCostRows = useMemo(
    () => cart.filter((r) => r.unitCost > 0 && r.unitPrice < r.unitCost),
    [cart]
  );
  const hasBelowCostSale = belowCostRows.length > 0;

  useEffect(() => {
    if (!hasBelowCostSale) {
      setBelowCostConfirmed(false);
      setManagerApprovalPin('');
      setManagerPinError('');
      setFormErrors((prev) => ({ ...prev, belowCost: undefined }));
    }
  }, [hasBelowCostSale]);

  const rawDiscountInput = Math.max(0, parseLocaleNumber(discount));
  const calculatedDiscountAmount = useMemo(() => {
    if (discountType === 'percent') {
      const pct = Math.min(100, rawDiscountInput);
      const raw = (subtotal * pct) / 100;
      return invoiceCurrency === 'USD' ? Number(raw.toFixed(2)) : Math.round(raw);
    }
    return invoiceCurrency === 'USD'
      ? Number(rawDiscountInput.toFixed(2))
      : Math.round(rawDiscountInput);
  }, [discountType, rawDiscountInput, subtotal, invoiceCurrency]);

  const isDiscountExceeded =
    discountType === 'percent' ? rawDiscountInput > 100 : rawDiscountInput > subtotal;

  const netTotal = useMemo(() => {
    const d = Math.min(subtotal, Math.max(0, calculatedDiscountAmount));
    return invoiceCurrency === 'USD'
      ? Number(Math.max(0, subtotal - d).toFixed(2))
      : Math.max(0, Math.round(subtotal - d));
  }, [subtotal, calculatedDiscountAmount, invoiceCurrency]);

  const payRate = (parseLocaleNumber(ratePer100) || 150000) / 100;

  const resolvedPaidAmounts = useMemo(() => {
    if (showMixedCurrency) {
      return {
        usd: Math.max(0, parseLocaleNumber(downUSD)),
        iqd: Math.max(0, Math.round(parseLocaleNumber(downIQD))),
      };
    }
    const directVal = Math.max(0, parseLocaleNumber(paidNowInput));
    if (saleType === 'cash' && paidNowInput.trim() === '') {
      return invoiceCurrency === 'USD' ? { usd: netTotal, iqd: 0 } : { usd: 0, iqd: netTotal };
    }
    return invoiceCurrency === 'USD'
      ? { usd: directVal, iqd: 0 }
      : { usd: 0, iqd: Math.round(directVal) };
  }, [showMixedCurrency, downUSD, downIQD, paidNowInput, saleType, invoiceCurrency, netTotal]);

  const downPaymentFX = useMemo(() => {
    return calculateSettlementFX({
      partyType: 'customer',
      invoiceCurrency,
      invoiceExchangeRate: state.activeExchangeRate,
      paymentExchangeRate: payRate,
      paidUSD: resolvedPaidAmounts.usd,
      paidIQD: resolvedPaidAmounts.iqd,
    });
  }, [invoiceCurrency, state.activeExchangeRate, payRate, resolvedPaidAmounts]);

  const effectivePaid =
    saleType === 'cash'
      ? resolvedPaidAmounts.usd === 0 && resolvedPaidAmounts.iqd === 0
        ? netTotal
        : Math.min(netTotal, downPaymentFX.settledInInvoiceCurrency)
      : Math.min(netTotal, downPaymentFX.settledInInvoiceCurrency);

  const remaining = Math.max(
    0,
    invoiceCurrency === 'USD'
      ? Number((netTotal - effectivePaid).toFixed(2))
      : Math.round(netTotal - effectivePaid)
  );

  const parsedInstCount = Math.max(1, Math.round(parseLocaleNumber(installmentCount)) || 1);
  const perMonth = saleType === 'installment' && parsedInstCount > 0 ? remaining / parsedInstCount : 0;

  const customerBalances = useMemo(() => {
    if (!customerId) return { usd: 0, iqd: 0 };
    return getCustomerBalances(customerId);
  }, [customerId, getCustomerBalances]);

  const newCustomerBalanceInInvoiceCurrency = useMemo(() => {
    const prevBal = invoiceCurrency === 'USD' ? customerBalances.usd : customerBalances.iqd;
    return invoiceCurrency === 'USD'
      ? Number((prevBal + remaining).toFixed(2))
      : Math.round(prevBal + remaining);
  }, [customerBalances, invoiceCurrency, remaining]);

  const tafqeetText = useMemo(
    () => amountToArabicTafqeet(netTotal, invoiceCurrency),
    [netTotal, invoiceCurrency]
  );

  const resetForm = useCallback(() => {
    setCart([]);
    setDiscount('0');
    setDiscountType('amount');
    setPaidNowInput('');
    setDownUSD('0');
    setDownIQD('0');
    setNotes('');
    clearEntryRow();
    setSelectedRowIndex(null);
    setConfirmClearCart(false);
    setBelowCostConfirmed(false);
    setManagerApprovalPin('');
    setManagerPinError('');
    setFormErrors({});
    setInvoiceDateTime(toLocalDateTimeInput());
    try {
      localStorage.removeItem(POS_DRAFT_KEY);
    } catch {
      // Ignore
    }
    focusBarcodeEntry();
  }, [clearEntryRow, focusBarcodeEntry]);

  const handleSubmit = useCallback(
    (openPrintAfter: boolean) => {
      if (isSubmitting || viewingSale) return;

      const resolvedCustomerId = customerId || state.customers[0]?.id || '';
      const errs: typeof formErrors = {};
      if ((saleType === 'credit' || saleType === 'installment') && !resolvedCustomerId) {
        errs.customer = 'يرجى اختيار الزبون للبيع الآجل أو بالأقساط.';
      } else if (!resolvedCustomerId) {
        errs.customer = 'يرجى إضافة زبون افتراضي أولاً.';
      }
      if (cart.length === 0) errs.cart = 'الفاتورة فارغة — أضف مادة واحدة على الأقل.';
      if (cart.some((r) => r.quantity <= 0)) {
        errs.cart = 'الكمية يجب أن تكون أكبر من صفر لجميع المواد.';
      }
      if (isDiscountExceeded) {
        errs.discount =
          discountType === 'percent'
            ? 'نسبة الخصم لا يمكن أن تتجاوز 100%.'
            : 'مبلغ الخصم أكبر من المجموع الأولي للفاتورة.';
      }

      if (hasBelowCostSale) {
        if (canSeeCost) {
          if (!belowCostConfirmed) {
            errs.belowCost = 'يوجد صنف بسعر بيع أقل من سعر الشراء — يرجى تأكيد الموافقة.';
          }
        } else {
          const approver = verifyAdminPin(managerApprovalPin);
          if (!approver) {
            errs.belowCost = 'البيع بأقل من سعر الشراء يتطلب إدخال رمز موافقة المدير (PIN) الصحيح.';
            setManagerPinError('رمز المدير غير صحيح أو مفقود.');
          }
        }
      }

      if (Object.keys(errs).length > 0) {
        setFormErrors(errs);
        return;
      }

      setIsSubmitting(true);
      try {
        const res = createSaleInvoice({
          customerId: resolvedCustomerId,
          saleType,
          currency: invoiceCurrency,
          invoiceNumber: invoiceNumber.trim() || undefined,
          date: invoiceDateTime ? new Date(invoiceDateTime).toISOString() : undefined,
          invoiceExchangeRate: payRate,
          items: cart.map((row) => ({
            itemId: row.itemId,
            sku: row.sku,
            name: row.name,
            specs: row.specs,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            unitCost: row.unitCost,
          })),
          discount: calculatedDiscountAmount,
          discountType,
          discountInput: rawDiscountInput,
          downPaymentUSD: resolvedPaidAmounts.usd,
          downPaymentIQD: resolvedPaidAmounts.iqd,
          paymentExchangeRate: payRate,
          installmentCount: saleType === 'installment' ? parsedInstCount : 0,
          firstDueDate,
          notes,
        });

        if (!res.ok || !res.sale) {
          setFormErrors({ general: res.error || 'تعذر حفظ الفاتورة.' });
          notify(res.error || 'تعذر حفظ الفاتورة.', 'error');
          return;
        }

        setLastCreatedSale(res.sale);
        if (openPrintAfter) {
          openPrintPreview({ kind: 'sale', data: res.sale });
        }
        setInvoiceNumber(
          getNextSaleInvoiceNumber([res.sale.invoiceNumber, ...state.sales.map((s) => s.invoiceNumber)])
        );
        resetForm();
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting,
      viewingSale,
      customerId,
      state.customers,
      state.sales,
      saleType,
      cart,
      isDiscountExceeded,
      discountType,
      hasBelowCostSale,
      canSeeCost,
      belowCostConfirmed,
      verifyAdminPin,
      managerApprovalPin,
      createSaleInvoice,
      invoiceCurrency,
      invoiceNumber,
      invoiceDateTime,
      payRate,
      calculatedDiscountAmount,
      rawDiscountInput,
      resolvedPaidAmounts.usd,
      resolvedPaidAmounts.iqd,
      parsedInstCount,
      firstDueDate,
      notes,
      openPrintPreview,
      resetForm,
      notify,
    ]
  );

  // Global Shortcuts in POSView: F9 Save, F2 Search, Delete selected row, ArrowUp/ArrowDown
  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (viewingSale) return;

      if (e.key === 'F9') {
        e.preventDefault();
        handleSubmit(false);
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        setShowCatalogPanel((prev) => {
          const next = !prev;
          if (next) {
            setTimeout(() => catalogSearchRef.current?.focus(), 30);
          } else {
            focusBarcodeEntry();
          }
          return next;
        });
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTypingInInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (e.key === 'Delete' && selectedRowIndex !== null && !isTypingInInput) {
        e.preventDefault();
        setCart((prev) => prev.filter((_, idx) => idx !== selectedRowIndex));
        setSelectedRowIndex((prev) => {
          if (prev === null) return null;
          if (cart.length <= 1) return null;
          return Math.min(prev, cart.length - 2);
        });
        focusBarcodeEntry();
        return;
      }

      if (!isTypingInInput && cart.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (selectedRowIndex === null) setSelectedRowIndex(0);
          else if (selectedRowIndex < cart.length - 1) setSelectedRowIndex(selectedRowIndex + 1);
          else {
            setSelectedRowIndex(null);
            focusBarcodeEntry();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (selectedRowIndex === null) setSelectedRowIndex(cart.length - 1);
          else setSelectedRowIndex(Math.max(0, selectedRowIndex - 1));
        }
      }
    };

    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [viewingSale, handleSubmit, selectedRowIndex, cart.length, focusBarcodeEntry]);

  // Invoice Navigator Handlers
  const handleGoPrevSale = () => {
    setShowCancelViewedBar(false);
    setCancelViewedReason('');
    setCancelViewedError('');
    if (viewingSale === null) {
      if (orderedSales.length > 0) {
        setViewingSaleId(orderedSales[orderedSales.length - 1].id);
      }
      return;
    }
    if (viewingIndex > 0) {
      setViewingSaleId(orderedSales[viewingIndex - 1].id);
    }
  };

  const handleGoNextSale = () => {
    setShowCancelViewedBar(false);
    setCancelViewedReason('');
    setCancelViewedError('');
    if (viewingSale === null) return;
    if (viewingIndex >= 0 && viewingIndex < orderedSales.length - 1) {
      setViewingSaleId(orderedSales[viewingIndex + 1].id);
    } else {
      setViewingSaleId(null);
    }
  };

  const handleBackToNewDraft = () => {
    setViewingSaleId(null);
    setShowCancelViewedBar(false);
    setCancelViewedReason('');
    setCancelViewedError('');
    focusBarcodeEntry();
  };

  const handleConfirmCancelViewed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingSale || isCancellingViewed) return;
    if (!cancelViewedReason.trim()) {
      setCancelViewedError('يرجى كتابة سبب إلغاء الفاتورة (حقل إلزامي).');
      return;
    }
    setIsCancellingViewed(true);
    const res = cancelSaleInvoice(viewingSale.id, cancelViewedReason);
    setIsCancellingViewed(false);
    if (!res.ok) {
      setCancelViewedError(res.error || 'تعذر إلغاء الفاتورة.');
      return;
    }
    setShowCancelViewedBar(false);
    setCancelViewedReason('');
    setCancelViewedError('');
  };

  // ==================== VIEWING SAVED SALE INVOICE MODE ====================
  if (viewingSale) {
    const isCancelled = viewingSale.status === 'cancelled';
    const viewedCustBalances = getCustomerBalances(viewingSale.customerId);
    const viewedCustomer = state.customers.find((c) => c.id === viewingSale.customerId) || null;

    return (
      <div className="space-y-3">
        {/* Classic 1-2 Row Top Invoice Header */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={handleGoPrevSale}
                  disabled={!canGoPrevSale}
                  title="الفاتورة السابقة"
                  className="w-8 h-8 inline-flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="px-3 text-center">
                  <div className="text-[10px] text-slate-500">رقم الفاتورة</div>
                  <div className="font-num font-extrabold text-sm text-slate-900">
                    {viewingSale.invoiceNumber}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGoNextSale}
                  disabled={!canGoNextSale}
                  title="الفاتورة التالية"
                  className="w-8 h-8 inline-flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <span
                className={`px-2.5 py-1 rounded-md font-bold ${
                  isCancelled ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'
                }`}
              >
                {isCancelled
                  ? 'فاتورة ملغاة'
                  : viewingSale.saleType === 'cash'
                    ? 'بيع نقدي'
                    : viewingSale.saleType === 'installment'
                      ? 'بيع أقساط'
                      : 'بيع آجل'}
              </span>

              <span className="px-2.5 py-1 rounded-md bg-slate-100 font-num font-bold text-slate-800">
                {viewingSale.currency === 'USD' ? 'دولار ($)' : 'دينار (د.ع)'}
              </span>

              <span className="font-num text-slate-600">
                {new Date(viewingSale.date).toLocaleString('ar-IQ')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600">
                الزبون: <strong className="text-slate-900">{viewingSale.customerName}</strong>
                {viewedCustomer?.phone ? ` (${viewedCustomer.phone})` : ''}
              </span>
              <span className="text-[11px] font-num text-slate-500">
                ({viewingIndex + 1} من {orderedSales.length})
              </span>
            </div>
          </div>
        </div>

        {isCancelled && (
          <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-xs text-red-900">
            <strong>تنبيه: هذه الفاتورة ملغاة</strong>
            {viewingSale.cancelledBy ? ` بواسطة ${viewingSale.cancelledBy}` : ''}
            {viewingSale.cancelledAt
              ? ` بتاريخ ${new Date(viewingSale.cancelledAt).toLocaleString('ar-IQ')}`
              : ''}
            {viewingSale.cancellationReason ? ` — السبب: ${viewingSale.cancellationReason}` : ''}
          </div>
        )}

        {showCancelViewedBar && !isCancelled && (
          <form
            onSubmit={handleConfirmCancelViewed}
            className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-red-900">
                إلغاء الفاتورة رقم <span className="font-num">{viewingSale.invoiceNumber}</span> وإصدار قيد عكسي وإرجاع البضاعة للمخزون
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCancelViewedBar(false);
                  setCancelViewedReason('');
                  setCancelViewedError('');
                }}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                تراجع
              </button>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[260px]">
                <input
                  type="text"
                  value={cancelViewedReason}
                  onChange={(e) => {
                    setCancelViewedReason(e.target.value);
                    if (cancelViewedError) setCancelViewedError('');
                  }}
                  placeholder="اكتب سبب الإلغاء الإلزامي (سيُحفظ في سجل التدقيق)..."
                  className={`w-full h-10 px-3 text-xs rounded-lg border bg-white ${
                    cancelViewedError ? 'border-red-500 bg-red-50/40' : 'border-red-300'
                  }`}
                />
                {cancelViewedError && (
                  <div className="text-[11px] font-semibold text-red-700 mt-1">{cancelViewedError}</div>
                )}
              </div>
              <button
                type="submit"
                disabled={isCancellingViewed}
                className="h-10 px-5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {isCancellingViewed ? 'جاري التنفيذ...' : 'تأكيد إلغاء الفاتورة'}
              </button>
            </div>
          </form>
        )}

        {/* Full-Width Classic Items Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 text-center w-12 font-bold">ت</th>
                  <th className="py-3 px-3 text-right font-bold">الباركود / اسم المادة</th>
                  <th className="py-3 px-3 text-center w-28 font-bold">الكمية</th>
                  <th className="py-3 px-3 text-left w-36 font-bold">السعر</th>
                  <th className="py-3 px-3 text-left w-40 font-bold">المجموع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {viewingSale.items.map((it, idx) => (
                  <tr key={`${it.itemId}-${idx}`} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 text-center font-num text-slate-500 font-semibold">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">
                        {it.brand} {it.model}
                      </div>
                      <div className="text-[11px] text-slate-500 font-num">
                        {it.sku || it.imei || '-'} {it.specs ? `· ${it.specs}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-num font-bold text-slate-900">
                      {formatQtyNumber(it.quantity)}
                    </td>
                    <td className="py-2.5 px-3 text-left font-num font-semibold text-slate-800">
                      {formatCurrency(it.unitPrice, viewingSale.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-left font-num font-bold text-emerald-700">
                      {formatCurrency(it.lineTotal, viewingSale.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {viewingSale.notes && (
            <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-700">
              <strong>ملاحظات:</strong> {viewingSale.notes}
            </div>
          )}
        </div>

        {/* Large Totals Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">المجموع</div>
            <div className="font-num font-extrabold text-base text-slate-900">
              {formatCurrency(viewingSale.subtotal, viewingSale.currency)}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">الخصم</div>
            <div className="font-num font-extrabold text-base text-amber-700">
              {formatCurrency(viewingSale.discount, viewingSale.currency)}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-[11px] text-emerald-800 font-semibold">الصافي</div>
            <div className="font-num font-extrabold text-lg text-emerald-700">
              {formatCurrency(viewingSale.total, viewingSale.currency)}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">المدفوع</div>
            <div className="font-num font-extrabold text-base text-emerald-700">
              {formatCurrency(viewingSale.paidTotal, viewingSale.currency)}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <div className="text-[11px] text-amber-900 font-semibold">المتبقي</div>
            <div className="font-num font-extrabold text-base text-red-700">
              {formatCurrency(isCancelled ? 0 : viewingSale.remainingAmount, viewingSale.currency)}
            </div>
            {(viewedCustBalances.usd > 0 || viewedCustBalances.iqd > 0) && (
              <div className="text-[10px] font-num text-slate-600 mt-0.5">
                ذمة الزبون: {viewedCustBalances.usd > 0 ? formatUSD(viewedCustBalances.usd) : ''}{' '}
                {viewedCustBalances.iqd > 0 ? formatIQD(viewedCustBalances.iqd) : ''}
              </div>
            )}
          </div>
        </div>

        {/* Fixed Bottom Bar for Saved Invoice */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openPrintPreview({ kind: 'sale', data: viewingSale })}
              className="h-10 px-4 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة الفاتورة</span>
            </button>
            <button
              type="button"
              onClick={handleBackToNewDraft}
              className="h-10 px-4 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>فاتورة جديدة</span>
            </button>
            {!isCancelled && viewingSale.remainingAmount > 0 && hasPermission('canReceivePayments') && (
              <button
                type="button"
                onClick={() =>
                  openSettlementPage({
                    partyType: 'customer',
                    partyId: viewingSale.customerId,
                    partyName: viewingSale.customerName,
                    invoiceId: viewingSale.id,
                    invoiceNumber: viewingSale.invoiceNumber,
                    invoiceCurrency: viewingSale.currency,
                    invoiceExchangeRate: viewingSale.exchangeRateAtSale,
                    remainingAmount: viewingSale.remainingAmount,
                  })
                }
                className="h-10 px-4 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold hover:bg-emerald-100 inline-flex items-center gap-1.5"
              >
                <Wallet className="w-4 h-4" />
                <span>قبض دفعة</span>
              </button>
            )}
            {!isCancelled && hasPermission('canDeleteRecords') && (
              <button
                type="button"
                onClick={() => {
                  setShowCancelViewedBar(true);
                  setCancelViewedReason('');
                  setCancelViewedError('');
                }}
                className="h-10 px-4 rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold hover:bg-red-100 inline-flex items-center gap-1.5"
              >
                <Ban className="w-4 h-4" />
                <span>إلغاء الفاتورة</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActiveNav('sales')}
            className="h-10 px-4 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 inline-flex items-center gap-1.5"
          >
            <ArrowRight className="w-4 h-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>
    );
  }

  // ==================== CLASSIC NEW SALE INVOICE (AL-AMEER STYLE) ====================
  const showCustomerRow = saleType === 'credit' || saleType === 'installment';

  return (
    <div className="space-y-3">
      {/* 1. COMPACT CLASSIC INVOICE HEADER (1-2 ROWS) */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2.5 text-xs">
        {/* Row 1: Invoice No + Arrows, Date, Sale Type, Currency, Draft Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Invoice Number with Right/Left Navigator Arrows */}
            <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
              <button
                type="button"
                onClick={handleGoPrevSale}
                disabled={!canGoPrevSale}
                title="الفاتورة السابقة"
                aria-label="الفاتورة السابقة"
                className="w-8 h-8 inline-flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 px-2">
                <span className="text-[11px] text-slate-500 font-semibold whitespace-nowrap">رقم الفاتورة:</span>
                <input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-24 h-7 px-2 border border-slate-300 rounded bg-white font-num font-extrabold text-slate-900 text-center"
                />
              </div>
              <button
                type="button"
                onClick={handleGoNextSale}
                disabled={!canGoNextSale}
                title="الفاتورة التالية"
                aria-label="الفاتورة التالية"
                className="w-8 h-8 inline-flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Date & Time */}
            <input
              type="datetime-local"
              value={invoiceDateTime}
              onChange={(e) => setInvoiceDateTime(e.target.value)}
              className="h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-num text-xs text-slate-800"
            />

            {/* Sale Type Toggle */}
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'cash', label: 'نقدي' },
                  { id: 'credit', label: 'آجل' },
                  { id: 'installment', label: 'قسط' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSaleType(t.id);
                    setFormErrors((prev) => ({ ...prev, customer: undefined }));
                  }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                    saleType === t.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Currency Toggle */}
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['USD', 'IQD'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setInvoiceCurrency(c)}
                  className={`px-3 py-1.5 rounded-md font-bold text-xs transition-colors whitespace-nowrap ${
                    invoiceCurrency === c
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {c === 'USD' ? 'دولار ($)' : 'دينار (د.ع)'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-num text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
              100$ = {(payRate * 100).toLocaleString()} د.ع
            </span>
            {cart.length > 0 && (
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">
                مسودة محفوظة · {cart.length} أصناف ({formatQtyNumber(totalUnits)})
              </span>
            )}
          </div>
        </div>

        {/* Row 2 (Appears ONLY on Credit or Installment): Customer + Installments */}
        {showCustomerRow && (
          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[260px]">
              <div className="flex items-center gap-2">
                <label className="font-bold text-slate-700 whitespace-nowrap">الزبون *:</label>
                <select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setFormErrors((prev) => ({ ...prev, customer: undefined }));
                  }}
                  className={`flex-1 h-9 px-3 border rounded-lg bg-white text-xs font-semibold text-slate-900 ${
                    formErrors.customer ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                  }`}
                >
                  <option value="">اختر الزبون...</option>
                  {state.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `— ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => openCustomerForm({ mode: 'new', returnTo: 'pos' })}
                  className="h-9 px-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ زبون جديد</span>
                </button>
              </div>
              {formErrors.customer && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{formErrors.customer}</p>
              )}
            </div>

            {activeCustomer && (
              <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2">
                <span className="text-slate-500">رصيد سابق:</span>
                <span className="font-num font-bold text-red-700">
                  {invoiceCurrency === 'USD'
                    ? formatUSD(customerBalances.usd)
                    : formatIQD(customerBalances.iqd)}
                </span>
              </div>
            )}

            {saleType === 'installment' && (
              <div className="flex flex-wrap items-center gap-2 bg-blue-50/70 border border-blue-200 rounded-lg px-3 py-1.5">
                <label className="font-semibold text-blue-900">الأقساط:</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(sanitizeNumericInput(e.target.value, false))}
                  className="w-14 h-7 px-2 border border-blue-300 rounded bg-white font-num font-bold text-center"
                />
                <label className="font-semibold text-blue-900">أول قسط:</label>
                <input
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                  className="h-7 px-2 border border-blue-300 rounded bg-white font-num text-[11px]"
                />
                {remaining > 0 && (
                  <span className="font-num font-bold text-blue-900">
                    ({formatCurrency(perMonth, invoiceCurrency)} / شهر)
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Saved Success Banner */}
      {lastCreatedSale && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              تم حفظ الفاتورة <strong className="font-num">{lastCreatedSale.invoiceNumber}</strong> بمبلغ{' '}
              <strong className="font-num">
                {formatCurrency(lastCreatedSale.total, lastCreatedSale.currency)}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewingSaleId(lastCreatedSale.id)}
              className="px-3 py-1 rounded-lg border border-emerald-300 bg-white text-emerald-800 font-semibold hover:bg-emerald-100"
            >
              عرض الفاتورة
            </button>
            <button
              type="button"
              onClick={() => openPrintPreview({ kind: 'sale', data: lastCreatedSale })}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>
            <button
              type="button"
              onClick={() => setLastCreatedSale(null)}
              className="text-slate-600 hover:text-slate-900 px-1.5"
            >
              إخفاء
            </button>
          </div>
        </div>
      )}

      {/* Missing Barcode Alert (No product creation from POS) */}
      {missingBarcodeNotice && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs">
          <div className="flex items-center gap-2 text-red-800 font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>
              المادة / الباركود (<strong className="font-num">{missingBarcodeNotice}</strong>) غير موجودة في المخزون. إضافة أي مادة جديدة تكون عبر فاتورة الشراء فقط.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMissingBarcodeNotice(null);
                focusBarcodeEntry();
              }}
              className="px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-red-800 font-semibold hover:bg-red-100"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* F2 Quick Catalog Search Panel (Inline, No Modal) */}
      {showCatalogPanel && (
        <div className="bg-white border border-slate-300 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <BookOpen className="w-4 h-4 text-emerald-700" />
              <span>دليل البحث السريع عن المواد (F2)</span>
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
                      focusBarcodeEntry();
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
                  focusBarcodeEntry();
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
                  <th className="py-2 px-3 text-center">المتوفر</th>
                  <th className="py-2 px-3 text-left">السعر</th>
                  <th className="py-2 px-3 text-center">إضافة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalogItems.slice(0, 30).map((it) => {
                  const unitP = getItemPriceInInvoiceCurrency(it, invoiceCurrency, saleType);
                  const blocked = !storeSettings.allowNegativeStock && it.quantity <= 0;
                  return (
                    <tr
                      key={it.id}
                      onClick={() => {
                        if (blocked) return;
                        addInventoryItemToCart(it, 1);
                        setShowCatalogPanel(false);
                        focusBarcodeEntry();
                      }}
                      className={blocked ? 'opacity-50' : 'hover:bg-emerald-50/50 cursor-pointer'}
                    >
                      <td className="py-2 px-3 font-bold text-slate-900">
                        {it.brand} {it.model}{' '}
                        <span className="font-normal text-slate-500">({it.storage})</span>
                      </td>
                      <td className="py-2 px-3 font-num text-slate-600">
                        {it.sku} · <strong className="text-blue-700">{it.sku.slice(-3)}</strong>
                      </td>
                      <td className="py-2 px-3 text-center font-num font-bold">
                        {it.quantity}
                      </td>
                      <td className="py-2 px-3 text-left font-num font-bold text-emerald-700">
                        {formatCurrency(unitP, invoiceCurrency)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[11px] font-bold">
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

      {/* 2. CENTER: FULL-WIDTH CLASSIC ITEMS TABLE + ALWAYS-READY ENTRY ROW AT BOTTOM */}
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
                <th className="py-3 px-3 text-center w-28 font-bold">الكمية</th>
                <th className="py-3 px-3 text-left w-36 font-bold">السعر ({invoiceCurrency === 'USD' ? '$' : 'د.ع'})</th>
                <th className="py-3 px-3 text-left w-36 font-bold">المجموع</th>
                <th className="py-3 px-3 text-center w-16 font-bold">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cart.map((row, idx) => {
                const isBelowCost = row.unitCost > 0 && row.unitPrice < row.unitCost;
                const isRowSelected = selectedRowIndex === idx;
                return (
                  <tr
                    key={`${row.itemId}-${idx}`}
                    onClick={() => setSelectedRowIndex(idx)}
                    className={`transition-colors ${
                      isBelowCost
                        ? 'bg-red-50/60'
                        : isRowSelected
                          ? 'bg-blue-50/70'
                          : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-2 px-3 text-center font-num font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-900">{row.name}</div>
                      <div className="text-[11px] text-slate-500 font-num">
                        {row.sku !== '-' ? `باركود: ${row.sku}` : 'صنف مباشر'}
                        {row.specs ? ` · ${row.specs}` : ''}
                        {row.maxStock !== null ? ` · المتاح: ${row.maxStock}` : ''}
                      </div>
                      {isBelowCost && (
                        <div className="text-[11px] font-bold text-red-700 mt-0.5">
                          تنبيه: سعر البيع أقل من سعر الشراء!
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.quantity}
                        onChange={(e) => {
                          const v = parseLocaleNumber(e.target.value);
                          if (v > 0) updateCartQty(idx, v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            focusBarcodeEntry();
                          }
                        }}
                        className="w-20 h-8 px-2 border border-slate-300 rounded bg-white font-num font-bold text-center text-slate-900"
                      />
                    </td>
                    <td className="py-2 px-3 text-left">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.unitPrice}
                        onChange={(e) => {
                          const v = parseLocaleNumber(e.target.value);
                          if (Number.isFinite(v) && v >= 0) updateCartPrice(idx, v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            focusBarcodeEntry();
                          }
                        }}
                        className={`w-28 h-8 px-2 border rounded bg-white font-num font-bold text-left ${
                          isBelowCost
                            ? 'border-red-500 text-red-700'
                            : 'border-slate-300 text-slate-900'
                        }`}
                      />
                    </td>
                    <td className="py-2 px-3 text-left font-num font-extrabold text-emerald-700">
                      {formatCurrency(row.unitPrice * row.quantity, invoiceCurrency)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCart((prev) => prev.filter((_, i) => i !== idx));
                          setSelectedRowIndex(null);
                          focusBarcodeEntry();
                        }}
                        title="حذف السطر"
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* ALWAYS-READY EMPTY ENTRY ROW AT BOTTOM OF TABLE */}
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
                          setMissingBarcodeNotice(null);
                          setEntryErrors((prev) => ({ ...prev, query: undefined }));
                          setDropdownOpen(Boolean(e.target.value.trim()));
                        }}
                        onFocus={() => {
                          setSelectedRowIndex(null);
                          if (entryQuery.trim() && !selectedInvItem) setDropdownOpen(true);
                        }}
                        onKeyDown={handleEntryQueryKeyDown}
                        placeholder="امسح الباركود أو اكتب اسم المادة ثم Enter..."
                        className={`w-full h-9 pr-8 pl-3 border rounded-lg bg-white text-xs font-semibold focus:outline-none focus:ring-2 ${
                          entryErrors.query
                            ? 'border-red-500 bg-red-50/40 focus:ring-red-500'
                            : 'border-emerald-500 focus:ring-emerald-600'
                        }`}
                      />
                    </div>
                    {entryErrors.query && (
                      <div className="text-[11px] text-red-600 font-semibold mt-0.5">
                        {entryErrors.query}
                      </div>
                    )}

                    {/* Search Autocomplete Dropdown (Price + Available Stock + Last 3 digits) */}
                    {dropdownOpen && normalizedQuery.length > 0 && (
                      <div className="absolute right-0 left-0 top-full mt-1 bg-white border border-slate-300 rounded-xl shadow-xl z-40 max-h-64 overflow-y-auto">
                        {matchedInventory.length === 0 ? (
                          <div className="p-3 text-xs text-red-700 font-semibold">
                            المادة غير موجودة في المخزون — تتم إضافة المواد الجديدة عبر صفحة فواتير الشراء فقط.
                          </div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                              <tr>
                                <th className="py-1.5 px-3 text-right">المادة والمواصفات</th>
                                <th className="py-1.5 px-3 text-right">آخر 3 / الباركود</th>
                                <th className="py-1.5 px-3 text-center">المخزون المتاح</th>
                                <th className="py-1.5 px-3 text-left">السعر</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {matchedInventory.slice(0, 12).map((it, mIdx) => {
                                const unitP = getItemPriceInInvoiceCurrency(it, invoiceCurrency, saleType);
                                const isHighlighted = mIdx === highlightedIdx;
                                const outOfStock = !storeSettings.allowNegativeStock && it.quantity <= 0;
                                return (
                                  <tr
                                    key={it.id}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      if (!outOfStock) selectItemIntoEntryAndAdvance(it);
                                    }}
                                    className={`cursor-pointer ${
                                      outOfStock
                                        ? 'bg-red-50/50 text-slate-400 cursor-not-allowed'
                                        : isHighlighted
                                          ? 'bg-emerald-50 text-slate-900'
                                          : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <td className="py-2 px-3 font-bold">
                                      {it.brand} {it.model}{' '}
                                      <span className="font-normal text-slate-500">
                                        ({it.storage}{it.color ? ` · ${it.color}` : ''})
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 font-num">
                                      <span className="font-extrabold text-blue-700">{it.sku.slice(-3)}</span>
                                      <span className="text-slate-400 mr-1.5">({it.sku})</span>
                                    </td>
                                    <td className="py-2 px-3 text-center font-num font-bold">
                                      <span className={it.quantity <= 0 ? 'text-red-600' : 'text-emerald-700'}>
                                        {it.quantity}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-left font-num font-extrabold text-emerald-700">
                                      {formatCurrency(unitP, invoiceCurrency)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
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
                    ref={entryPriceRef}
                    type="text"
                    inputMode="decimal"
                    value={entryPrice}
                    onChange={(e) => {
                      setEntryPrice(
                        sanitizeNumericInput(e.target.value, invoiceCurrency === 'USD')
                      );
                      setEntryErrors((prev) => ({ ...prev, price: undefined }));
                    }}
                    onKeyDown={handleEntryPriceKeyDown}
                    placeholder={invoiceCurrency === 'USD' ? '0.00' : '0'}
                    className={`w-28 h-9 px-2 border rounded-lg bg-white font-num font-bold text-emerald-700 text-left focus:outline-none focus:ring-2 ${
                      entryErrors.price
                        ? 'border-red-500 bg-red-50/40 focus:ring-red-500'
                        : 'border-slate-300 focus:ring-emerald-600'
                    }`}
                  />
                </td>

                <td className="py-2.5 px-3 text-left font-num font-bold text-slate-600">
                  {entryPrice.trim()
                    ? formatCurrency(
                        (parseLocaleNumber(entryPrice) || 0) *
                          Math.max(1, Math.round(parseLocaleNumber(entryQty)) || 1),
                        invoiceCurrency
                      )
                    : '—'}
                </td>

                <td className="py-2.5 px-3 text-center">
                  <button
                    type="button"
                    onClick={commitEntryRow}
                    title="إدراج السطر"
                    className="h-9 px-2.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 inline-flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes & Below-Cost Inline Warning */}
        <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات الفاتورة أو شروط الضمان..."
            className="flex-1 min-w-[240px] h-8 px-3 border border-slate-200 rounded-lg bg-white text-xs"
          />
          <span className="text-[11px] text-slate-500">
            تنقل: الباركود ← الكمية ← السعر ← Enter للسطر التالي | الأسهم ↑↓ لتحديد سطر | Delete للحذف | F9 للحفظ
          </span>
        </div>
      </div>

      {/* Inline Clear Confirmation Bar (Zero Modals) */}
      {confirmClearCart && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-amber-950">
            هل تريد مسح كافة المواد وإعادة تصفير الفاتورة الحالية؟
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
            >
              نعم، مسح الفاتورة
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

      {/* Below-Cost Inline Guard & Manager Approval */}
      {hasBelowCostSale && (
        <div className="p-3.5 rounded-xl border border-red-300 bg-red-50 flex flex-wrap items-center justify-between gap-3 text-xs text-red-900">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>
              تحذير: يوجد {belowCostRows.length} صنف بسعر بيع أقل من سعر الشراء!
            </span>
          </div>

          {canSeeCost ? (
            <label className="flex items-center gap-2 cursor-pointer font-semibold">
              <input
                type="checkbox"
                checked={belowCostConfirmed}
                onChange={(e) => {
                  setBelowCostConfirmed(e.target.checked);
                  setFormErrors((prev) => ({ ...prev, belowCost: undefined }));
                }}
                className="rounded border-red-400 text-red-600"
              />
              <span>أؤكد الموافقة على البيع بسعر أقل من سعر الشراء.</span>
            </label>
          ) : (
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-red-600" />
              <input
                type="password"
                inputMode="numeric"
                value={managerApprovalPin}
                onChange={(e) => {
                  setManagerApprovalPin(sanitizeBarcode(e.target.value));
                  setManagerPinError('');
                  setFormErrors((prev) => ({ ...prev, belowCost: undefined }));
                }}
                placeholder="رمز موافقة المدير (PIN)..."
                className="w-44 h-8 px-2.5 border border-red-300 rounded-lg bg-white font-num text-xs"
              />
            </div>
          )}

          {(formErrors.belowCost || managerPinError) && (
            <span className="font-bold text-red-700 w-full">
              {formErrors.belowCost || managerPinError}
            </span>
          )}
        </div>
      )}

      {formErrors.general && (
        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
          {formErrors.general}
        </div>
      )}

      {/* 3. LARGE BOTTOM TOTALS BAR: المجموع | الخصم | الصافي | المدفوع | المتبقي */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-stretch">
          {/* المجموع */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div className="text-xs font-semibold text-slate-500">المجموع</div>
            <div className="font-num font-extrabold text-xl text-slate-900 mt-1">
              {formatCurrency(subtotal, invoiceCurrency)}
            </div>
          </div>

          {/* الخصم */}
          <div
            className={`p-3 rounded-xl border flex flex-col justify-between ${
              isDiscountExceeded ? 'border-red-500 bg-red-50/40' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-semibold text-slate-500">الخصم</span>
              <select
                value={discountType}
                onChange={(e) => {
                  setDiscountType(e.target.value as 'amount' | 'percent');
                  setFormErrors((prev) => ({ ...prev, discount: undefined }));
                }}
                className="text-[11px] font-bold bg-white border border-slate-300 rounded px-1.5 py-0.5"
              >
                <option value="amount">{invoiceCurrency === 'USD' ? '$' : 'د.ع'}</option>
                <option value="percent">%</option>
              </select>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={discount}
              onChange={(e) => {
                setDiscount(
                  sanitizeNumericInput(
                    e.target.value,
                    discountType === 'percent' || invoiceCurrency === 'USD'
                  )
                );
                setFormErrors((prev) => ({ ...prev, discount: undefined }));
              }}
              className={`w-full h-9 px-2.5 mt-1 border rounded-lg bg-white font-num font-extrabold text-lg ${
                isDiscountExceeded ? 'border-red-500 text-red-700' : 'border-slate-300 text-amber-700'
              }`}
            />
            {isDiscountExceeded && (
              <span className="text-[10px] font-bold text-red-600 mt-0.5">خصم غير صالح</span>
            )}
          </div>

          {/* الصافي */}
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 flex flex-col justify-between">
            <div className="text-xs font-bold text-emerald-800">الصافي</div>
            <div className="font-num font-extrabold text-2xl text-emerald-700 mt-0.5">
              {formatCurrency(netTotal, invoiceCurrency)}
            </div>
            <div className="text-[10px] font-semibold text-emerald-800 truncate" title={tafqeetText}>
              {tafqeetText}
            </div>
          </div>

          {/* المدفوع */}
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-semibold text-slate-500">المدفوع</span>
              <button
                type="button"
                onClick={() => setShowMixedCurrency((v) => !v)}
                className="text-[10px] font-bold text-blue-700 hover:underline"
              >
                {showMixedCurrency ? 'عملة واحدة' : 'مختلط ($ + د.ع)'}
              </button>
            </div>
            {!showMixedCurrency ? (
              <input
                type="text"
                inputMode="decimal"
                value={paidNowInput}
                onChange={(e) =>
                  setPaidNowInput(sanitizeNumericInput(e.target.value, invoiceCurrency === 'USD'))
                }
                placeholder={saleType === 'cash' ? String(netTotal) : '0'}
                className="w-full h-9 px-2.5 mt-1 border border-slate-300 rounded-lg bg-white font-num font-extrabold text-lg text-emerald-700"
              />
            ) : (
              <div className="font-num font-extrabold text-lg text-emerald-700 mt-1">
                {formatCurrency(effectivePaid, invoiceCurrency)}
              </div>
            )}
          </div>

          {/* المتبقي */}
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 flex flex-col justify-between">
            <div className="text-xs font-bold text-amber-900">المتبقي</div>
            <div className="font-num font-extrabold text-xl text-red-700 mt-1">
              {formatCurrency(remaining, invoiceCurrency)}
            </div>
            {showCustomerRow && (
              <div className="text-[10px] font-num text-amber-800">
                الإجمالي على الزبون: {formatCurrency(newCustomerBalanceInInvoiceCurrency, invoiceCurrency)}
              </div>
            )}
          </div>
        </div>

        {/* Mixed Currency Inputs (when toggled) */}
        {showMixedCurrency && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">مدفوع دولار ($)</label>
              <input
                type="text"
                inputMode="decimal"
                value={downUSD}
                onChange={(e) => setDownUSD(sanitizeNumericInput(e.target.value, true))}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-num font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">مدفوع دينار (د.ع)</label>
              <input
                type="text"
                inputMode="numeric"
                value={downIQD}
                onChange={(e) => setDownIQD(sanitizeNumericInput(e.target.value, false))}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-num font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">سعر الصرف (د.ع / 100$)</label>
              <input
                type="text"
                inputMode="numeric"
                value={ratePer100}
                onChange={(e) => setRatePer100(sanitizeNumericInput(e.target.value, false))}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-num font-bold"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. FIXED BOTTOM SHORTCUT ACTION BAR */}
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
                else focusBarcodeEntry();
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
          onClick={() => goBack()}
          className="h-10 px-4 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 inline-flex items-center gap-1.5"
        >
          <ArrowRight className="w-4 h-4" />
          <span>خروج</span>
        </button>
      </div>
    </div>
  );
}
