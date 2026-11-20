import React, { useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag,
  Search,
  Edit2,
  Trash2,
  Printer,
  ArrowRight,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react';
import { CurrencyCode, InventoryItem, NavSection } from '../types/erp';
import { useERP } from '../context/ERPContext';
import { formatInDisplayMode } from '../utils/currency';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';
import { ExportBar } from '../components/ExportBar';
import {
  formatQtyNumber,
  parseLocaleNumber,
  sanitizeBarcode,
  sanitizeNumericInput,
  tryParseLocaleNumber,
} from '../utils/numbers';

export function InventoryView() {
  const {
    state,
    displayMode,
    updateInventoryItem,
    adjustInventoryStock,
    deleteInventoryItem,
    openPrintPreview,
    hasPermission,
    productFormContext,
    clearProductFormContext,
    inventoryLowStockHint,
    setInventoryLowStockHint,
    setActiveNav,
    setSubPageTitle,
    setHasUnsavedChanges,
  } = useERP();

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'available'>('all');
  const [selectedItemId, setSelectedItemId] = useState<string>(
    () => state.inventory[0]?.id || ''
  );
  const [subView, setSubView] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [returnToNav, setReturnToNav] = useState<NavSection | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formDirty, setFormDirty] = useState(false);

  // Form fields
  const [sku, setSku] = useState('');
  const [brand, setBrand] = useState('Apple');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('256GB');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [minStock, setMinStock] = useState('2');
  const [costCurrency, setCostCurrency] = useState<CurrencyCode>('USD');
  const [costPrice, setCostPrice] = useState('0');
  const [sellCurrency, setSellCurrency] = useState<CurrencyCode>('USD');
  const [cashPrice, setCashPrice] = useState('');
  const [installmentPrice, setInstallmentPrice] = useState('');

  const [formErrors, setFormErrors] = useState<{
    sku?: string;
    brand?: string;
    model?: string;
    cashPrice?: string;
    general?: string;
  }>({});

  // Inline Stock Adjustment (جرد / تسوية مخزون) inside Edit page
  const [showStockAdjust, setShowStockAdjust] = useState(false);
  const [adjQuantity, setAdjQuantity] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjErrors, setAdjErrors] = useState<{ qty?: string; reason?: string; general?: string }>({});
  const [isAdjusting, setIsAdjusting] = useState(false);

  const canManage = hasPermission('canManageInventory');
  const canSeeCost =
    hasPermission('canEditCostPrices') || hasPermission('canViewProfitsAndFX');

  // Honor external low-stock navigation hint
  useEffect(() => {
    if (inventoryLowStockHint) {
      setStockFilter('low');
      setSubView('list');
      setInventoryLowStockHint(false);
    }
  }, [inventoryLowStockHint, setInventoryLowStockHint]);

  // Auto-open Edit Form when requested via productFormContext
  useEffect(() => {
    if (!productFormContext) return;

    if (productFormContext.mode === 'edit' && productFormContext.itemId) {
      const target = state.inventory.find((i) => i.id === productFormContext.itemId);
      if (target) {
        setEditing(target);
        setSku(target.sku);
        setBrand(target.brand);
        setModel(target.model);
        setStorage(target.storage);
        setColor(target.color);
        setQuantity(String(target.quantity));
        setMinStock(String(target.minStock));
        setCostCurrency(target.costCurrency);
        setCostPrice(String(target.costPrice));
        setSellCurrency(target.sellCurrency);
        setCashPrice(String(target.cashPrice));
        setInstallmentPrice(String(target.installmentPrice));
        setFormErrors({});
        setFormDirty(false);
        setShowStockAdjust(false);
        setAdjQuantity(String(target.quantity));
        setAdjReason('');
        setAdjErrors({});
        setReturnToNav(productFormContext.returnTo || null);
        setSubView('form');
        setSubPageTitle(`تعديل: ${target.brand} ${target.model}`);
      }
      clearProductFormContext();
    }
  }, [productFormContext, state.inventory, clearProductFormContext, setSubPageTitle]);

  useEffect(() => {
    if (subView === 'form' && editing) {
      setSubPageTitle(`تعديل: ${editing.brand} ${editing.model}`);
      setHasUnsavedChanges(formDirty);
    } else {
      setSubPageTitle(null);
      setHasUnsavedChanges(false);
    }
  }, [subView, editing, formDirty, setSubPageTitle, setHasUnsavedChanges]);

  useEffect(() => {
    return () => {
      setSubPageTitle(null);
      setHasUnsavedChanges(false);
    };
  }, [setSubPageTitle, setHasUnsavedChanges]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.inventory.filter((it) => {
      if (stockFilter === 'low' && it.quantity > it.minStock) return false;
      if (stockFilter === 'available' && it.quantity <= 0) return false;
      if (!q) return true;
      return (
        it.brand.toLowerCase().includes(q) ||
        it.model.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        it.sku.toLowerCase().endsWith(q)
      );
    });
  }, [state.inventory, search, stockFilter]);

  const activeItem = useMemo(
    () => filtered.find((it) => it.id === selectedItemId) || filtered[0] || null,
    [filtered, selectedItemId]
  );

  useEffect(() => {
    setConfirmDeleteId(null);
  }, [selectedItemId]);

  const openEdit = (it: InventoryItem) => {
    if (!canManage) return;
    setEditing(it);
    setReturnToNav(null);
    setSku(it.sku);
    setBrand(it.brand);
    setModel(it.model);
    setStorage(it.storage);
    setColor(it.color);
    setQuantity(String(it.quantity));
    setMinStock(String(it.minStock));
    setCostCurrency(it.costCurrency);
    setCostPrice(String(it.costPrice));
    setSellCurrency(it.sellCurrency);
    setCashPrice(String(it.cashPrice));
    setInstallmentPrice(String(it.installmentPrice));
    setFormErrors({});
    setFormDirty(false);
    setShowStockAdjust(false);
    setAdjQuantity(String(it.quantity));
    setAdjReason('');
    setAdjErrors({});
    setSubView('form');
  };

  const exitForm = (targetAfter?: NavSection | null) => {
    setFormDirty(false);
    setHasUnsavedChanges(false);
    setSubPageTitle(null);
    setSubView('list');
    setEditing(null);
    setShowStockAdjust(false);
    setReturnToNav(null);
    if (targetAfter && targetAfter !== 'inventory') {
      setActiveNav(targetAfter, { bypassDirtyCheck: true });
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !editing) return;

    const errs: typeof formErrors = {};
    const cleanSku = sanitizeBarcode(sku);
    if (!cleanSku) {
      errs.sku = 'الباركود / الكود (SKU) حقل إلزامي.';
    } else {
      const dup = state.inventory.find(
        (it) =>
          it.id !== editing.id &&
          it.sku.trim().toLowerCase() === cleanSku.toLowerCase()
      );
      if (dup) {
        errs.sku = `الباركود (${cleanSku}) مستخدم مسبقاً للمنتج: ${dup.brand} ${dup.model}.`;
      }
    }

    if (!brand.trim()) {
      errs.brand = 'اسم المادة / الفئة الرئيسية مطلوب.';
    }
    if (!model.trim() && !brand.trim()) {
      errs.model = 'يرجى إدخال اسم أو موديل المادة.';
    }

    const parsedCash = tryParseLocaleNumber(cashPrice);
    if (parsedCash === null || parsedCash <= 0) {
      errs.cashPrice = 'يرجى إدخال سعر البيع النقدي أكبر من صفر.';
    }

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    setIsSubmitting(true);
    try {
      const safeCash = Math.max(0, parsedCash || 0);
      const parsedInst = tryParseLocaleNumber(installmentPrice);
      const safeInst =
        parsedInst !== null && parsedInst > 0
          ? parsedInst
          : sellCurrency === 'USD'
            ? Number((safeCash * 1.1).toFixed(2))
            : Math.round(safeCash * 1.1);

      // Only metadata and sell prices can be edited; quantity and cost are strictly read-only
      const res = updateInventoryItem(editing.id, {
        sku: cleanSku,
        brand: brand.trim(),
        model: model.trim(),
        storage: storage.trim() || 'قياسي',
        color: color.trim(),
        minStock: Math.max(0, Math.round(parseLocaleNumber(minStock))),
        sellCurrency,
        cashPrice: safeCash,
        installmentPrice: safeInst,
      });

      if (!res.ok) {
        setFormErrors({ general: res.error || 'تعذر حفظ بيانات المادة.' });
        return;
      }
      setSelectedItemId(editing.id);

      const dest = returnToNav;
      exitForm(dest);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmStockAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || isAdjusting) return;

    const errs: typeof adjErrors = {};
    const parsedQty = tryParseLocaleNumber(adjQuantity);
    if (parsedQty === null || !Number.isFinite(parsedQty)) {
      errs.qty = 'يرجى إدخال كمية الجرد الصحيحة.';
    }
    if (!adjReason.trim()) {
      errs.reason = 'سبب تسوية المخزون حقل إلزامي.';
    }

    if (Object.keys(errs).length > 0) {
      setAdjErrors(errs);
      return;
    }

    setIsAdjusting(true);
    try {
      const cleanQty = Math.round(parsedQty!);
      const res = adjustInventoryStock(editing.id, cleanQty, adjReason.trim());
      if (!res.ok) {
        setAdjErrors({ general: res.error || 'تعذر اعتماد تسوية المخزون.' });
        return;
      }
      setQuantity(String(cleanQty));
      setEditing((prev) => (prev ? { ...prev, quantity: cleanQty } : prev));
      setShowStockAdjust(false);
      setAdjReason('');
      setAdjErrors({});
    } finally {
      setIsAdjusting(false);
    }
  };

  // Keyboard navigation in List View
  useEffect(() => {
    if (subView !== 'list') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (filtered.length === 0) return;

      const curIdx = activeItem ? filtered.findIndex((i) => i.id === activeItem.id) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = Math.min(filtered.length - 1, curIdx + 1);
        setSelectedItemId(filtered[nextIdx].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = Math.max(0, curIdx <= 0 ? 0 : curIdx - 1);
        setSelectedItemId(filtered[prevIdx].id);
      } else if (e.key === 'Delete' && activeItem && hasPermission('canDeleteRecords')) {
        e.preventDefault();
        setConfirmDeleteId(activeItem.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [subView, filtered, activeItem, hasPermission]);

  const exportHeaders = canSeeCost
    ? [
        'SKU',
        'الماركة',
        'الموديل',
        'السعة',
        'اللون',
        'الكمية',
        'عملة التكلفة',
        'التكلفة',
        'عملة البيع',
        'سعر النقد',
        'سعر الأقساط',
      ]
    : [
        'SKU',
        'الماركة',
        'الموديل',
        'السعة',
        'اللون',
        'الكمية',
        'عملة البيع',
        'سعر النقد',
        'سعر الأقساط',
      ];

  const exportRows = filtered.map((it) =>
    canSeeCost
      ? [
          it.sku,
          it.brand,
          it.model,
          it.storage,
          it.color,
          it.quantity,
          it.costCurrency,
          it.costPrice,
          it.sellCurrency,
          it.cashPrice,
          it.installmentPrice,
        ]
      : [
          it.sku,
          it.brand,
          it.model,
          it.storage,
          it.color,
          it.quantity,
          it.sellCurrency,
          it.cashPrice,
          it.installmentPrice,
        ]
  );

  const handlePrintInventory = () => {
    openPrintPreview({
      kind: 'statement',
      title: 'جرد مخزون المنتجات والأجهزة',
      subtitle: `عدد الأصناف: ${filtered.length} · إجمالي الكمية: ${formatQtyNumber(
        filtered.reduce((a, b) => a + b.quantity, 0)
      )}`,
      partyType: 'general',
      columns: exportHeaders,
      rows: exportRows,
      summaryLines: [
        { label: 'عدد الأصناف', value: String(filtered.length) },
        {
          label: 'إجمالي القطع المتوفرة',
          value: formatQtyNumber(filtered.reduce((a, b) => a + b.quantity, 0)),
        },
      ],
      rawData: filtered,
    });
  };

  if (subView === 'form' && editing) {
    const parsedCostVal = parseLocaleNumber(costPrice);
    const parsedCashVal = parseLocaleNumber(cashPrice);
    const costSellWarn =
      canSeeCost &&
      costCurrency === sellCurrency &&
      parsedCostVal > 0 &&
      parsedCashVal > 0 &&
      parsedCashVal < parsedCostVal;

    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">تعديل بيانات المادة</h2>
            {returnToNav && returnToNav !== 'inventory' && (
              <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                بعد الحفظ سيتم إعادتك تلقائياً إلى الصفحة السابقة.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => exitForm(returnToNav)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة لقائمة المواد</span>
          </button>
        </div>

        <form
          onSubmit={handleSave}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs"
        >
          {formErrors.general && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-semibold">
              {formErrors.general}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">اسم المادة / الفئة *</label>
              <input
                value={brand}
                onChange={(e) => {
                  setBrand(e.target.value);
                  setFormDirty(true);
                  setFormErrors((prev) => ({ ...prev, brand: undefined }));
                }}
                placeholder="مثال: Apple أو شاحن"
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-white ${
                  formErrors.brand ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              />
              {formErrors.brand && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{formErrors.brand}</p>
              )}
            </div>
            <div>
              <label className="block font-semibold mb-1">الموديل / التفصيل</label>
              <input
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setFormDirty(true);
                  setFormErrors((prev) => ({ ...prev, model: undefined }));
                }}
                placeholder="iPhone 16 Pro"
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-white ${
                  formErrors.model ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              />
              {formErrors.model && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{formErrors.model}</p>
              )}
            </div>
            <div>
              <label className="block font-semibold mb-1">الباركود / الكود (SKU) فريد *</label>
              <input
                value={sku}
                onChange={(e) => {
                  setSku(sanitizeBarcode(e.target.value));
                  setFormDirty(true);
                  setFormErrors((prev) => ({ ...prev, sku: undefined }));
                }}
                placeholder="امسح أو اكتب الباركود..."
                className={`w-full px-3 py-2 border rounded-lg font-num text-sm bg-white ${
                  formErrors.sku ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              />
              {formErrors.sku && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{formErrors.sku}</p>
              )}
            </div>
            <div>
              <label className="block font-semibold mb-1">المواصفات / السعة</label>
              <input
                value={storage}
                onChange={(e) => {
                  setStorage(e.target.value);
                  setFormDirty(true);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">اللون</label>
              <input
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setFormDirty(true);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold mb-1">الكمية (للعرض فقط)</label>
                <input
                  type="text"
                  value={quantity}
                  readOnly
                  disabled
                  title="تتغير الكمية فقط عبر الشراء أو البيع أو المرتجع أو تسوية المخزون"
                  className="w-full px-2.5 py-2 border border-slate-200 rounded-lg font-num text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">حد التنبيه</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={minStock}
                  onChange={(e) => {
                    setMinStock(sanitizeNumericInput(e.target.value, false));
                    setFormDirty(true);
                  }}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-num text-sm bg-white"
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <span>
              الكمية غير قابلة للتعديل المباشر (تتغير عبر: فاتورة شراء، فاتورة بيع، مرتجع، أو تسوية مخزون بسبب إلزامي).
            </span>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setAdjQuantity(String(editing.quantity));
                  setAdjReason('');
                  setAdjErrors({});
                  setShowStockAdjust((v) => !v);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-800 font-bold hover:bg-slate-100"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-slate-600" />
                <span>تسوية مخزون (جرد)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
            {canSeeCost && (
              <>
                <div>
                  <label className="block font-semibold mb-1">عملة التكلفة (من الشراء)</label>
                  <select
                    value={costCurrency}
                    disabled
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-600 text-sm cursor-not-allowed"
                  >
                    <option value="USD">دولار ($ USD)</option>
                    <option value="IQD">دينار عراقي (د.ع IQD)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    التكلفة ({costCurrency === 'USD' ? '$' : 'د.ع'}) — من فواتير الشراء
                  </label>
                  <input
                    type="text"
                    value={costPrice}
                    readOnly
                    disabled
                    title="التكلفة تأتي من فواتير الشراء ولا تُعدَّل يدوياً"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-num text-sm bg-slate-100 text-slate-600 cursor-not-allowed"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block font-semibold mb-1">عملة البيع *</label>
              <select
                value={sellCurrency}
                onChange={(e) => {
                  setSellCurrency(e.target.value as CurrencyCode);
                  setFormDirty(true);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
              >
                <option value="USD">دولار ($ USD)</option>
                <option value="IQD">دينار عراقي (د.ع IQD)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">
                سعر البيع النقدي ({sellCurrency === 'USD' ? '$' : 'د.ع'}) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={cashPrice}
                onChange={(e) => {
                  setCashPrice(sanitizeNumericInput(e.target.value, sellCurrency === 'USD'));
                  setFormDirty(true);
                  setFormErrors((prev) => ({ ...prev, cashPrice: undefined }));
                }}
                placeholder={sellCurrency === 'USD' ? '0.00' : '0'}
                className={`w-full px-3 py-2 border rounded-lg font-num text-sm bg-white ${
                  formErrors.cashPrice ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              />
              {formErrors.cashPrice && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">
                  {formErrors.cashPrice}
                </p>
              )}
            </div>
          </div>

          {costSellWarn && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>تنبيه: سعر البيع النقدي أقل من سعر الشراء/التكلفة المسجل!</span>
            </div>
          )}

          <div>
            <label className="block font-semibold mb-1">
              سعر الأقساط ({sellCurrency === 'USD' ? '$' : 'د.ع'})
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={installmentPrice}
              onChange={(e) => {
                setInstallmentPrice(
                  sanitizeNumericInput(e.target.value, sellCurrency === 'USD')
                );
                setFormDirty(true);
              }}
              placeholder="يُحتسب تلقائياً (+10%) إن تُرك فارغاً"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-num text-sm bg-white"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => exitForm(returnToNav)}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ تعديلات المادة'}
            </button>
          </div>
        </form>

        {/* Inline Stock Adjustment Panel (جرد / تسوية مخزون بسبب إلزامي) */}
        {showStockAdjust && (
          <form
            onSubmit={handleConfirmStockAdjustment}
            className="bg-amber-50/70 border border-amber-300 rounded-xl p-5 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <ClipboardCheck className="w-4 h-4 text-amber-700" />
                <span>تسوية مخزون (جرد فعلي للمادة: {editing.brand} {editing.model})</span>
              </div>
              <span className="font-num text-amber-900">
                الرصيد الحالي: <strong>{formatQtyNumber(editing.quantity)}</strong>
              </span>
            </div>

            {adjErrors.general && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 font-semibold">
                {adjErrors.general}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-amber-950 mb-1">
                  الكمية الفعلية الجديدة (بعد الجرد) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={adjQuantity}
                  onChange={(e) => {
                    setAdjQuantity(sanitizeNumericInput(e.target.value, false));
                    setAdjErrors((prev) => ({ ...prev, qty: undefined, general: undefined }));
                  }}
                  className={`w-full px-3 py-2 border rounded-lg font-num text-sm bg-white ${
                    adjErrors.qty ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                  }`}
                />
                {adjErrors.qty && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">{adjErrors.qty}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-amber-950 mb-1">
                  سبب تسوية المخزون (إلزامي — يُسجل في سجل التدقيق) *
                </label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => {
                    setAdjReason(e.target.value);
                    setAdjErrors((prev) => ({ ...prev, reason: undefined, general: undefined }));
                  }}
                  placeholder="مثال: جرد سنوي، تلف، فرق عد فعلي في المخزن..."
                  className={`w-full px-3 py-2 border rounded-lg text-sm bg-white ${
                    adjErrors.reason ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                  }`}
                />
                {adjErrors.reason && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">{adjErrors.reason}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowStockAdjust(false)}
                className="px-3.5 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 font-semibold hover:bg-amber-100"
              >
                إلغاء التسوية
              </button>
              <button
                type="submit"
                disabled={isAdjusting}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-50"
              >
                {isAdjusting ? 'جاري الاعتماد...' : 'اعتماد تسوية المخزون'}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Unified Top Command & Filter Bar (Standardized across Inventory, Customers, Suppliers) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالموديل، الماركة، أو الباركود..."
              className="w-64 h-9 pr-9 pl-3 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            {(
              [
                { id: 'all', label: `الكل (${state.inventory.length})` },
                { id: 'available', label: 'المتوفر' },
                { id: 'low', label: 'نواقص المخزون' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStockFilter(f.id)}
                className={`px-3 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                  stockFilter === f.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Standardized Action Buttons: إضافة عبر فاتورة شراء | تعديل | حذف | طباعة (+ Export) */}
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={() => setActiveNav('purchase')}
              className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-slate-600" />
              <span>إضافة مواد عبر فاتورة شراء</span>
            </button>
          )}
          {canManage && (
            <button
              type="button"
              disabled={!activeItem}
              onClick={() => activeItem && openEdit(activeItem)}
              className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>تعديل</span>
            </button>
          )}
          {hasPermission('canDeleteRecords') && (
            <button
              type="button"
              disabled={!activeItem}
              onClick={() => activeItem && setConfirmDeleteId(activeItem.id)}
              className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-bold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف</span>
            </button>
          )}
          <button
            type="button"
            onClick={handlePrintInventory}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة</span>
          </button>

          <ExportBar
            compact
            onExcel={() =>
              exportToExcel('inventory.xlsx', 'المخزون', exportHeaders, exportRows)
            }
            onCSV={() =>
              exportToCSV('inventory.csv', exportHeaders, exportRows)
            }
            onJSON={() => exportToJSON('inventory.json', filtered)}
          />
        </div>
      </div>

      {/* Inline Delete Confirmation Bar (Zero Modals) */}
      {confirmDeleteId && activeItem && confirmDeleteId === activeItem.id && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-red-900">
            تأكيد حذف الصنف ({activeItem.brand} {activeItem.model}) من المخزون؟
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                deleteInventoryItem(activeItem.id);
                setConfirmDeleteId(null);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
            >
              نعم، حذف الصنف
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Full-Screen Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500 space-y-3">
            <div>
              {state.inventory.length === 0
                ? 'لا توجد مواد، أضفها من فاتورة شراء'
                : 'لا توجد أصناف مطابقة في المخزون.'}
            </div>
            {canManage && (
              <div>
                <button
                  type="button"
                  onClick={() => setActiveNav('purchase')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-slate-600" />
                  <span>إضافة مواد عبر فاتورة شراء</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 text-center w-10 font-semibold">ت</th>
                  <th className="py-3 px-4 text-right font-semibold">المنتج والمواصفات</th>
                  <th className="py-3 px-4 text-right font-semibold">SKU / الباركود</th>
                  <th className="py-3 px-4 text-center font-semibold">الكمية</th>
                  {canSeeCost && (
                    <th className="py-3 px-4 text-left font-semibold">التكلفة</th>
                  )}
                  <th className="py-3 px-4 text-left font-semibold">سعر النقد</th>
                  <th className="py-3 px-4 text-left font-semibold">سعر الأقساط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((it, idx) => {
                  const cashDisp = formatInDisplayMode(
                    it.cashPrice,
                    it.sellCurrency,
                    displayMode,
                    state.activeExchangeRate
                  );
                  const instDisp = formatInDisplayMode(
                    it.installmentPrice,
                    it.sellCurrency,
                    displayMode,
                    state.activeExchangeRate
                  );
                  const costDisp = formatInDisplayMode(
                    it.costPrice,
                    it.costCurrency,
                    displayMode,
                    state.activeExchangeRate
                  );
                  const isLow = it.quantity <= it.minStock;
                  const isSelected = activeItem?.id === it.id;

                  return (
                    <tr
                      key={it.id}
                      onClick={() => setSelectedItemId(it.id)}
                      onDoubleClick={() => openEdit(it)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-3 px-3 text-center font-num text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {it.brand} {it.model}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {it.storage} {it.color ? `· ${it.color}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-num text-slate-800">{it.sku}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`font-num font-bold ${
                            it.quantity < 0
                              ? 'text-red-700'
                              : isLow
                                ? 'text-amber-700'
                                : 'text-slate-900'
                          }`}
                        >
                          {formatQtyNumber(it.quantity)}
                        </span>
                        {isLow && (
                          <div className="text-[10px] text-red-600">
                            {it.quantity < 0 ? 'مخزون سالب' : 'منخفض'}
                          </div>
                        )}
                      </td>
                      {canSeeCost && (
                        <td className="py-3 px-4 text-left font-num text-slate-700">
                          {costDisp.primary}
                        </td>
                      )}
                      <td className="py-3 px-4 text-left">
                        <div className="font-num font-semibold text-slate-900">
                          {cashDisp.primary}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-left">
                        <div className="font-num font-semibold text-blue-800">
                          {instDisp.primary}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
