import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Printer,
  CreditCard,
  Trash2,
  ShoppingBag,
  ArrowRight,
  Ban,
  XCircle,
} from 'lucide-react';
import { NavSection, PrintablePayload, Supplier } from '../types/erp';
import { useERP } from '../context/ERPContext';
import { formatCurrency, formatIQD, formatUSD } from '../utils/currency';
import { normalizeArabicDigits } from '../utils/numbers';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';
import { ExportBar } from '../components/ExportBar';
import { PurchaseInvoiceView } from './PurchaseInvoiceView';

export function SuppliersView() {
  const {
    state,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    cancelPurchaseInvoice,
    getSupplierBalances,
    openSettlementPage,
    openPrintPreview,
    hasPermission,
    supplierFormContext,
    clearSupplierFormContext,
    setActiveNav,
    setSubPageTitle,
    setHasUnsavedChanges,
    openInboxImageViewer,
  } = useERP();

  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'payable' | 'settled'>('all');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    () => state.suppliers[0]?.id || ''
  );

  // Sub-view mode: 'list' | 'form' | 'new_purchase'
  const [subView, setSubView] = useState<'list' | 'form' | 'new_purchase'>('list');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [returnToNav, setReturnToNav] = useState<NavSection | null>(null);
  const [formDirty, setFormDirty] = useState(false);

  // Supplier Form
  const [supName, setSupName] = useState('');
  const [supCompany, setSupCompany] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [supErrors, setSupErrors] = useState<{ name?: string }>({});
  const [isSubmittingSup, setIsSubmittingSup] = useState(false);

  // Inline Delete / Cancellation Bars
  const [confirmDeleteSupId, setConfirmDeleteSupId] = useState<string | null>(null);
  const [cancellingPurchaseId, setCancellingPurchaseId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Honor external openSupplierForm (from PurchaseInvoiceView or TopBar)
  useEffect(() => {
    if (!supplierFormContext) return;
    if (supplierFormContext.mode === 'edit' && supplierFormContext.partyId) {
      const target = state.suppliers.find((s) => s.id === supplierFormContext.partyId);
      if (target) {
        setEditingSupplier(target);
        setSupName(target.name);
        setSupCompany(target.company || '');
        setSupPhone(target.phone || '');
        setSupAddress(target.address || '');
        setSupErrors({});
        setFormDirty(false);
        setReturnToNav(supplierFormContext.returnTo || null);
        setSubView('form');
      }
    } else {
      setEditingSupplier(null);
      setSupName('');
      setSupCompany('');
      setSupPhone('');
      setSupAddress('');
      setSupErrors({});
      setFormDirty(false);
      setReturnToNav(supplierFormContext.returnTo || null);
      setSubView('form');
    }
    clearSupplierFormContext();
  }, [supplierFormContext, state.suppliers, clearSupplierFormContext]);

  useEffect(() => {
    if (subView === 'form') {
      setSubPageTitle(
        editingSupplier ? `تعديل المورد: ${editingSupplier.name}` : 'إضافة مورد جديد'
      );
      setHasUnsavedChanges(formDirty);
    } else if (subView === 'new_purchase') {
      setSubPageTitle('فاتورة شراء وتوريد بضاعة');
      setHasUnsavedChanges(false);
    } else {
      setSubPageTitle(null);
      setHasUnsavedChanges(false);
    }
  }, [subView, editingSupplier, formDirty, setSubPageTitle, setHasUnsavedChanges]);

  useEffect(() => {
    return () => {
      setSubPageTitle(null);
      setHasUnsavedChanges(false);
    };
  }, [setSubPageTitle, setHasUnsavedChanges]);

  useEffect(() => {
    setConfirmDeleteSupId(null);
  }, [selectedSupplierId]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.suppliers.filter((s) => {
      const bal = getSupplierBalances(s.id);
      const hasBal = bal.usd > 0 || bal.iqd > 0;
      if (balanceFilter === 'payable' && !hasBal) return false;
      if (balanceFilter === 'settled' && hasBal) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.phone.includes(q) ||
        s.code.toLowerCase().includes(q)
      );
    });
  }, [state.suppliers, search, balanceFilter, getSupplierBalances]);

  const activeSupplier =
    filteredSuppliers.find((s) => s.id === selectedSupplierId) ||
    filteredSuppliers[0] ||
    null;

  const supplierPurchases = useMemo(
    () =>
      activeSupplier
        ? state.purchases.filter((p) => p.supplierId === activeSupplier.id)
        : [],
    [state.purchases, activeSupplier]
  );

  const supplierPayments = useMemo(
    () =>
      activeSupplier
        ? state.payments.filter(
            (p) => p.partyType === 'supplier' && p.partyId === activeSupplier.id
          )
        : [],
    [state.payments, activeSupplier]
  );

  const cancellingPurchase = useMemo(
    () =>
      cancellingPurchaseId
        ? state.purchases.find((p) => p.id === cancellingPurchaseId) || null
        : null,
    [cancellingPurchaseId, state.purchases]
  );

  // Keyboard navigation in List View
  useEffect(() => {
    if (subView !== 'list') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (filteredSuppliers.length === 0) return;

      const curIdx = activeSupplier
        ? filteredSuppliers.findIndex((s) => s.id === activeSupplier.id)
        : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = Math.min(filteredSuppliers.length - 1, curIdx + 1);
        setSelectedSupplierId(filteredSuppliers[nextIdx].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = Math.max(0, curIdx <= 0 ? 0 : curIdx - 1);
        setSelectedSupplierId(filteredSuppliers[prevIdx].id);
      } else if (
        e.key === 'Delete' &&
        activeSupplier &&
        hasPermission('canDeleteRecords')
      ) {
        e.preventDefault();
        setConfirmDeleteSupId(activeSupplier.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [subView, filteredSuppliers, activeSupplier, hasPermission]);

  const openNewSupplier = () => {
    setEditingSupplier(null);
    setReturnToNav(null);
    setSupName('');
    setSupCompany('');
    setSupPhone('');
    setSupAddress('');
    setSupErrors({});
    setFormDirty(false);
    setSubView('form');
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setReturnToNav(null);
    setSupName(s.name);
    setSupCompany(s.company || '');
    setSupPhone(s.phone || '');
    setSupAddress(s.address || '');
    setSupErrors({});
    setFormDirty(false);
    setSubView('form');
  };

  const exitForm = (targetAfter?: NavSection | null) => {
    setFormDirty(false);
    setHasUnsavedChanges(false);
    setSupErrors({});
    setEditingSupplier(null);
    setSubView('list');
    setReturnToNav(null);
    if (targetAfter && targetAfter !== 'suppliers') {
      setActiveNav(targetAfter, { bypassDirtyCheck: true });
    }
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingSup) return;
    if (!supName.trim()) {
      setSupErrors({ name: 'يرجى إدخال اسم المورد (حقل إلزامي).' });
      return;
    }

    setIsSubmittingSup(true);
    try {
      const payload = {
        name: supName.trim(),
        company: supCompany.trim() || supName.trim(),
        phone: normalizeArabicDigits(supPhone).trim(),
        address: supAddress.trim(),
      };

      if (editingSupplier) {
        updateSupplier(editingSupplier.id, payload);
        setSelectedSupplierId(editingSupplier.id);
      } else {
        const created = addSupplier(payload);
        setSelectedSupplierId(created.id);
      }

      const dest = returnToNav;
      exitForm(dest);
    } finally {
      setIsSubmittingSup(false);
    }
  };

  const handleConfirmCancelPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingPurchaseId || isCancelling) return;
    if (!cancelReason.trim()) {
      setCancelError('يرجى كتابة سبب إلغاء الفاتورة (حقل إلزامي).');
      return;
    }
    setIsCancelling(true);
    const res = cancelPurchaseInvoice(cancellingPurchaseId, cancelReason);
    setIsCancelling(false);
    if (!res.ok) {
      setCancelError(res.error || 'تعذر إلغاء فاتورة الشراء.');
      return;
    }
    setCancellingPurchaseId(null);
    setCancelReason('');
    setCancelError('');
  };

  const supHeaders = [
    'الكود',
    'اسم المورد',
    'الشركة',
    'الهاتف',
    'العنوان',
    'مستحق له ($)',
    'مستحق له (د.ع)',
  ];
  const supRows = filteredSuppliers.map((s) => {
    const bal = getSupplierBalances(s.id);
    return [s.code, s.name, s.company, s.phone, s.address, bal.usd, bal.iqd];
  });

  const buildSupplierStatement = (): PrintablePayload | null => {
    if (!activeSupplier) return null;
    const bal = getSupplierBalances(activeSupplier.id);
    const cols = [
      'السند',
      'التاريخ',
      'المرجع',
      'مدفوع ($)',
      'مدفوع (د.ع)',
      'المحتسب بالفاتورة',
      'فرق الصرف',
    ];
    const rows = supplierPayments.map((p) => [
      p.voucherNumber,
      new Date(p.date).toLocaleDateString('ar-IQ'),
      p.invoiceNumber || '-',
      p.paidUSD,
      p.paidIQD,
      formatCurrency(p.settledInInvoiceCurrency, p.invoiceCurrency),
      `${p.fxDiffIQD >= 0 ? '+' : ''}${formatIQD(p.fxDiffIQD)}`,
    ]);
    return {
      kind: 'statement',
      title: `كشف حساب مورد: ${activeSupplier.name}`,
      subtitle: `${activeSupplier.code} · ${activeSupplier.company} · ${activeSupplier.phone}`,
      partyType: 'supplier',
      columns: cols,
      rows,
      summaryLines: [
        {
          label: 'فواتير التجهيز النشطة',
          value: String(
            supplierPurchases.filter((p) => p.status !== 'cancelled').length
          ),
        },
        { label: 'المتبقي للمورد (دولار)', value: formatUSD(bal.usd) },
        { label: 'المتبقي للمورد (دينار)', value: formatIQD(bal.iqd) },
      ],
      rawData: {
        supplier: activeSupplier,
        balances: bal,
        purchases: supplierPurchases,
        payments: supplierPayments,
      },
    };
  };

  const handlePrintTopAction = () => {
    const st = buildSupplierStatement();
    if (st) {
      openPrintPreview(st);
      return;
    }
    openPrintPreview({
      kind: 'statement',
      title: 'قائمة الموردين والأرصدة',
      subtitle: `عدد الموردين: ${filteredSuppliers.length}`,
      partyType: 'supplier',
      columns: supHeaders,
      rows: supRows,
      summaryLines: [{ label: 'إجمالي الموردين', value: String(filteredSuppliers.length) }],
      rawData: filteredSuppliers,
    });
  };

  // SubView: Standalone Supplier Form Page (New or Edit)
  if (subView === 'form') {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {editingSupplier ? `تعديل المورد: ${editingSupplier.name}` : 'إضافة مورد جديد'}
            </h2>
            {returnToNav && returnToNav !== 'suppliers' && (
              <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                بعد الحفظ سيتم إعادتك تلقائياً إلى فاتورة الشراء واختيار المورد.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => exitForm(returnToNav)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowRight className="w-4 h-4" />
            <span>
              {returnToNav && returnToNav !== 'suppliers'
                ? 'إلغاء والعودة لفاتورة الشراء'
                : 'العودة لقائمة الموردين'}
            </span>
          </button>
        </div>

        <form
          onSubmit={handleSaveSupplier}
          noValidate
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs"
        >
          <div>
            <label className="block font-semibold mb-1">اسم المورد *</label>
            <input
              value={supName}
              onChange={(e) => {
                setSupName(e.target.value);
                setFormDirty(true);
                if (supErrors.name) setSupErrors({});
              }}
              className={`w-full px-3 py-2 border rounded-lg text-sm bg-white ${
                supErrors.name ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
              }`}
            />
            {supErrors.name && (
              <div className="text-[11px] font-semibold text-red-600 mt-1">
                {supErrors.name}
              </div>
            )}
          </div>
          <div>
            <label className="block font-semibold mb-1">اسم الشركة / المكتب</label>
            <input
              value={supCompany}
              onChange={(e) => {
                setSupCompany(e.target.value);
                setFormDirty(true);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">رقم الهاتف</label>
              <input
                type="text"
                inputMode="tel"
                value={supPhone}
                onChange={(e) => {
                  setSupPhone(normalizeArabicDigits(e.target.value));
                  setFormDirty(true);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-num text-sm bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">العنوان</label>
              <input
                value={supAddress}
                onChange={(e) => {
                  setSupAddress(e.target.value);
                  setFormDirty(true);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              />
            </div>
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
              disabled={isSubmittingSup}
              className="px-6 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {isSubmittingSup
                ? 'جاري الحفظ...'
                : editingSupplier
                  ? 'حفظ التعديلات'
                  : 'حفظ المورد'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // SubView: New Purchase Invoice Full Page
  if (subView === 'new_purchase' && activeSupplier) {
    return (
      <PurchaseInvoiceView
        initialSupplierId={activeSupplier.id}
        onBack={() => setSubView('list')}
      />
    );
  }

  // Main List View
  return (
    <div className="space-y-4">
      {/* Unified Top Command & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث عن مورد بالاسم أو الشركة..."
              className="w-64 h-9 pr-9 pl-3 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            {(
              [
                { id: 'all', label: `الكل (${state.suppliers.length})` },
                { id: 'payable', label: 'مستحق لهم' },
                { id: 'settled', label: 'مسدد' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setBalanceFilter(f.id)}
                className={`px-3 py-1 rounded-md font-semibold transition-colors whitespace-nowrap ${
                  balanceFilter === f.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Standardized Action Buttons: جديد | تعديل | حذف | طباعة (+ Export) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openNewSupplier}
            className="h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>جديد</span>
          </button>
          <button
            type="button"
            disabled={!activeSupplier}
            onClick={() => activeSupplier && openEditSupplier(activeSupplier)}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>تعديل</span>
          </button>
          {hasPermission('canDeleteRecords') && (
            <button
              type="button"
              disabled={!activeSupplier}
              onClick={() => activeSupplier && setConfirmDeleteSupId(activeSupplier.id)}
              className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-bold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف</span>
            </button>
          )}
          <button
            type="button"
            onClick={handlePrintTopAction}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة</span>
          </button>

          <ExportBar
            compact
            onExcel={() =>
              exportToExcel('suppliers-balances.xlsx', 'الموردون', supHeaders, supRows)
            }
            onCSV={() =>
              exportToCSV('suppliers-balances.csv', supHeaders, supRows)
            }
            onJSON={() => exportToJSON('suppliers-balances.json', filteredSuppliers)}
          />
        </div>
      </div>

      {/* Inline Delete Supplier Confirmation Bar */}
      {confirmDeleteSupId && activeSupplier && confirmDeleteSupId === activeSupplier.id && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-red-900">
            هل أنت متأكد من حذف ملف المورد «{activeSupplier.name}»؟
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const ok = deleteSupplier(activeSupplier.id);
                if (ok) setConfirmDeleteSupId(null);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
            >
              تأكيد الحذف
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteSupId(null)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Full-Screen Suppliers Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">لا يوجد موردون مطابقون.</div>
        ) : (
          <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-3 px-3 text-center w-10 font-semibold">ت</th>
                  <th className="py-3 px-4 text-right font-semibold">الكود</th>
                  <th className="py-3 px-4 text-right font-semibold">اسم المورد</th>
                  <th className="py-3 px-4 text-right font-semibold">الشركة / المكتب</th>
                  <th className="py-3 px-4 text-right font-semibold">الهاتف</th>
                  <th className="py-3 px-4 text-right font-semibold">العنوان</th>
                  <th className="py-3 px-4 text-left font-semibold">مستحق له ($)</th>
                  <th className="py-3 px-4 text-left font-semibold">مستحق له (د.ع)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((s, idx) => {
                  const bal = getSupplierBalances(s.id);
                  const selected = activeSupplier?.id === s.id;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSupplierId(s.id)}
                      onDoubleClick={() => openEditSupplier(s)}
                      className={`cursor-pointer transition-colors ${
                        selected ? 'bg-amber-50/70' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-num text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-num text-slate-600">{s.code}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{s.name}</td>
                      <td className="py-2.5 px-4 text-slate-600">{s.company || '-'}</td>
                      <td className="py-2.5 px-4 font-num text-slate-700">{s.phone || '-'}</td>
                      <td className="py-2.5 px-4 text-slate-600">{s.address || '-'}</td>
                      <td className="py-2.5 px-4 text-left font-num font-bold">
                        {bal.usd > 0 ? (
                          <span className="text-amber-700">{formatUSD(bal.usd)}</span>
                        ) : (
                          <span className="text-emerald-700 font-sans">مسدد</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-left font-num font-bold">
                        {bal.iqd > 0 ? (
                          <span className="text-amber-700">{formatIQD(bal.iqd)}</span>
                        ) : (
                          <span className="text-emerald-700 font-sans">مسدد</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Supplier Ledger Strip */}
      {activeSupplier && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 font-num">{activeSupplier.code}</div>
              <h2 className="text-base font-bold text-slate-900">{activeSupplier.name}</h2>
              <div className="text-xs text-slate-600 mt-0.5">
                {activeSupplier.company} · <span className="font-num">{activeSupplier.phone}</span>{' '}
                · {activeSupplier.address || 'العنوان غير محدد'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasPermission('canManageInventory') && (
                <button
                  type="button"
                  onClick={() => setSubView('new_purchase')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>فاتورة شراء جديدة</span>
                </button>
              )}
              {hasPermission('canPaySuppliers') && (
                <button
                  type="button"
                  onClick={() =>
                    openSettlementPage({
                      partyType: 'supplier',
                      partyId: activeSupplier.id,
                      partyName: activeSupplier.name,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>تسديد دفعة للمورد</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const pl = buildSupplierStatement();
                  if (pl) openPrintPreview(pl);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>كشف المورد</span>
              </button>
            </div>
          </div>

          {/* Inline Cancel Purchase Invoice Bar */}
          {cancellingPurchase && (
            <form
              onSubmit={handleConfirmCancelPurchase}
              className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-red-900">
                  <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>
                    إلغاء فاتورة الشراء رقم{' '}
                    <span className="font-num">{cancellingPurchase.invoiceNumber}</span> وعكس سنداتها
                    وخصم الكمية الموردة
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCancellingPurchaseId(null);
                    setCancelReason('');
                    setCancelError('');
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  تراجع
                </button>
              </div>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[240px]">
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => {
                      setCancelReason(e.target.value);
                      if (cancelError) setCancelError('');
                    }}
                    placeholder="اكتب سبب إلغاء الفاتورة الإلزامي..."
                    className={`w-full h-9 px-3 text-xs rounded-lg border bg-white ${
                      cancelError ? 'border-red-500 bg-red-50/40' : 'border-red-300'
                    }`}
                  />
                  {cancelError && (
                    <div className="text-[11px] font-semibold text-red-700 mt-1">
                      {cancelError}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="h-9 px-4 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {isCancelling ? 'جاري الإلغاء...' : 'تأكيد إلغاء الفاتورة'}
                </button>
              </div>
            </form>
          )}

          {/* Purchase Invoices */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">فواتير الشراء من المورد</h3>
              <span className="text-xs text-slate-500 font-num">
                {supplierPurchases.length} فواتير
              </span>
            </div>
            {supplierPurchases.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                لا توجد فواتير شراء مسجلة لهذه الشركة.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 text-right">الفاتورة</th>
                      <th className="py-2.5 px-4 text-right">التاريخ</th>
                      <th className="py-2.5 px-4 text-center">العملة</th>
                      <th className="py-2.5 px-4 text-left">الإجمالي</th>
                      <th className="py-2.5 px-4 text-left">المدفوع</th>
                      <th className="py-2.5 px-4 text-left">المتبقي</th>
                      <th className="py-2.5 px-4 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {supplierPurchases.map((p) => {
                      const isCancelled = p.status === 'cancelled';
                      return (
                        <tr key={p.id} className={isCancelled ? 'bg-red-50/40 text-slate-500' : ''}>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-num font-bold ${isCancelled ? 'line-through' : ''}`}>
                                {p.invoiceNumber}
                              </span>
                              {isCancelled && (
                                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">
                                  ملغاة
                                </span>
                              )}
                            </div>
                            {isCancelled && p.cancellationReason && (
                              <div className="text-[10px] text-red-700 mt-0.5">
                                السبب: {p.cancellationReason}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-num text-slate-600">
                            {new Date(p.date).toLocaleDateString('ar-IQ')}
                          </td>
                          <td className="py-2.5 px-4 text-center font-num font-semibold">
                            {p.currency}
                          </td>
                          <td className="py-2.5 px-4 text-left font-num">
                            {formatCurrency(p.total, p.currency)}
                          </td>
                          <td className="py-2.5 px-4 text-left font-num text-emerald-700">
                            {formatCurrency(p.paidTotal, p.currency)}
                          </td>
                          <td className="py-2.5 px-4 text-left font-num font-bold text-amber-700">
                            {formatCurrency(isCancelled ? 0 : p.remainingAmount, p.currency)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              {!isCancelled &&
                                p.remainingAmount > 0 &&
                                hasPermission('canPaySuppliers') && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openSettlementPage({
                                        partyType: 'supplier',
                                        partyId: activeSupplier.id,
                                        partyName: activeSupplier.name,
                                        invoiceId: p.id,
                                        invoiceNumber: p.invoiceNumber,
                                        invoiceCurrency: p.currency,
                                        invoiceExchangeRate: p.exchangeRateAtPurchase,
                                        remainingAmount: p.remainingAmount,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
                                  >
                                    <CreditCard className="w-3 h-3" />
                                    <span>تسديد</span>
                                  </button>
                                )}
                              {p.sourceInboxId && (
                                <button
                                  type="button"
                                  onClick={() => openInboxImageViewer(p.sourceInboxId!)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 text-[11px] font-semibold whitespace-nowrap"
                                  title="عرض الصورة الأصلية في تبويب الفواتير"
                                >
                                  <span>الصورة الأصلية</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openPrintPreview({ kind: 'purchase', data: p })}
                                className="p-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                                title="طباعة الفاتورة"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {!isCancelled && hasPermission('canDeleteRecords') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancellingPurchaseId(p.id);
                                    setCancelReason('');
                                    setCancelError('');
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-semibold whitespace-nowrap"
                                  title="إلغاء فاتورة الشراء"
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>إلغاء</span>
                                </button>
                              )}
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

          {/* Supplier Payments */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">سندات تسديد المورد</h3>
              <span className="text-xs text-slate-500 font-num">{supplierPayments.length} سند</span>
            </div>
            {supplierPayments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                لا توجد سندات تسديد لهذا المورد.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 text-right">السند</th>
                      <th className="py-2.5 px-4 text-right">التاريخ</th>
                      <th className="py-2.5 px-4 text-left">مدفوع ($)</th>
                      <th className="py-2.5 px-4 text-left">مدفوع (د.ع)</th>
                      <th className="py-2.5 px-4 text-left">المسدد بالفاتورة</th>
                      <th className="py-2.5 px-4 text-left">فرق الصرف</th>
                      <th className="py-2.5 px-4 text-center">طباعة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {supplierPayments.map((pay) => {
                      const isCancelled = pay.status === 'cancelled';
                      return (
                        <tr
                          key={pay.id}
                          className={
                            pay.isReversal
                              ? 'bg-amber-50/40'
                              : isCancelled
                                ? 'bg-red-50/40 text-slate-500'
                                : ''
                          }
                        >
                          <td className="py-2.5 px-4 font-num font-semibold">
                            <span className={isCancelled ? 'line-through' : ''}>
                              {pay.voucherNumber}
                            </span>
                            <div className="text-[10px] text-slate-500">{pay.invoiceNumber}</div>
                          </td>
                          <td className="py-2.5 px-4 font-num text-slate-600">
                            {new Date(pay.date).toLocaleDateString('ar-IQ')}
                          </td>
                          <td className="py-2.5 px-4 text-left font-num">{formatUSD(pay.paidUSD)}</td>
                          <td className="py-2.5 px-4 text-left font-num">{formatIQD(pay.paidIQD)}</td>
                          <td className="py-2.5 px-4 text-left font-num font-semibold">
                            {formatCurrency(pay.settledInInvoiceCurrency, pay.invoiceCurrency)}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-left font-num font-semibold ${
                              pay.fxDiffIQD >= 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {pay.fxDiffIQD >= 0 ? '+' : ''}
                            {formatIQD(pay.fxDiffIQD)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => openPrintPreview({ kind: 'payment', data: pay })}
                              className="p-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
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
      )}
    </div>
  );
}
