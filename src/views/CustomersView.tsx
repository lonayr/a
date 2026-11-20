import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Printer,
  Wallet,
  Trash2,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { Customer, NavSection, PrintablePayload } from '../types/erp';
import { useERP } from '../context/ERPContext';
import { formatCurrency, formatIQD, formatUSD } from '../utils/currency';
import { normalizeArabicDigits } from '../utils/numbers';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';
import { ExportBar } from '../components/ExportBar';

export function CustomersView() {
  const {
    state,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerBalances,
    openSettlementPage,
    openPrintPreview,
    hasPermission,
    customerFormContext,
    clearCustomerFormContext,
    setActiveNav,
    setSubPageTitle,
    setHasUnsavedChanges,
  } = useERP();

  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'debt' | 'settled'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    () => state.customers[0]?.id || ''
  );
  const [subView, setSubView] = useState<'list' | 'form'>('list');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [returnToNav, setReturnToNav] = useState<NavSection | null>(null);
  const [formDirty, setFormDirty] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [formErrors, setFormErrors] = useState<{ name?: string; phone?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeleteCustId, setConfirmDeleteCustId] = useState<string | null>(null);

  // Honor external openCustomerForm (e.g. from POS or TopBar)
  useEffect(() => {
    if (!customerFormContext) return;
    if (customerFormContext.mode === 'edit' && customerFormContext.partyId) {
      const target = state.customers.find((c) => c.id === customerFormContext.partyId);
      if (target) {
        setEditingCustomer(target);
        setName(target.name);
        setPhone(target.phone);
        setAddress(target.address || '');
        setNationalId(target.nationalId || '');
        setGuarantorName(target.guarantorName || '');
        setGuarantorPhone(target.guarantorPhone || '');
        setFormErrors({});
        setFormDirty(false);
        setReturnToNav(customerFormContext.returnTo || null);
        setSubView('form');
      }
    } else {
      setEditingCustomer(null);
      setName('');
      setPhone('');
      setAddress('');
      setNationalId('');
      setGuarantorName('');
      setGuarantorPhone('');
      setFormErrors({});
      setFormDirty(false);
      setReturnToNav(customerFormContext.returnTo || null);
      setSubView('form');
    }
    clearCustomerFormContext();
  }, [customerFormContext, state.customers, clearCustomerFormContext]);

  useEffect(() => {
    if (subView === 'form') {
      setSubPageTitle(
        editingCustomer ? `تعديل بيانات الزبون: ${editingCustomer.name}` : 'تسجيل زبون جديد'
      );
      setHasUnsavedChanges(formDirty);
    } else {
      setSubPageTitle(null);
      setHasUnsavedChanges(false);
    }
  }, [subView, editingCustomer, formDirty, setSubPageTitle, setHasUnsavedChanges]);

  useEffect(() => {
    return () => {
      setSubPageTitle(null);
      setHasUnsavedChanges(false);
    };
  }, [setSubPageTitle, setHasUnsavedChanges]);

  useEffect(() => {
    setConfirmDeleteCustId(null);
  }, [selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.customers.filter((c) => {
      const bal = getCustomerBalances(c.id);
      const hasDebt = bal.usd > 0 || bal.iqd > 0;
      if (balanceFilter === 'debt' && !hasDebt) return false;
      if (balanceFilter === 'settled' && hasDebt) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
      );
    });
  }, [state.customers, search, balanceFilter, getCustomerBalances]);

  const activeCustomer =
    filteredCustomers.find((c) => c.id === selectedCustomerId) ||
    filteredCustomers[0] ||
    null;

  const customerSales = useMemo(
    () => (activeCustomer ? state.sales.filter((s) => s.customerId === activeCustomer.id) : []),
    [state.sales, activeCustomer]
  );

  const customerReceipts = useMemo(
    () =>
      activeCustomer
        ? state.payments.filter(
            (p) => p.partyType === 'customer' && p.partyId === activeCustomer.id
          )
        : [],
    [state.payments, activeCustomer]
  );

  // Keyboard navigation in List View
  useEffect(() => {
    if (subView !== 'list') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (filteredCustomers.length === 0) return;

      const curIdx = activeCustomer
        ? filteredCustomers.findIndex((c) => c.id === activeCustomer.id)
        : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = Math.min(filteredCustomers.length - 1, curIdx + 1);
        setSelectedCustomerId(filteredCustomers[nextIdx].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = Math.max(0, curIdx <= 0 ? 0 : curIdx - 1);
        setSelectedCustomerId(filteredCustomers[prevIdx].id);
      } else if (
        e.key === 'Delete' &&
        activeCustomer &&
        hasPermission('canDeleteRecords')
      ) {
        e.preventDefault();
        setConfirmDeleteCustId(activeCustomer.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [subView, filteredCustomers, activeCustomer, hasPermission]);

  const openNewCustomer = () => {
    setEditingCustomer(null);
    setReturnToNav(null);
    setName('');
    setPhone('');
    setAddress('');
    setNationalId('');
    setGuarantorName('');
    setGuarantorPhone('');
    setFormErrors({});
    setFormDirty(false);
    setSubView('form');
  };

  const openEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setReturnToNav(null);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address || '');
    setNationalId(c.nationalId || '');
    setGuarantorName(c.guarantorName || '');
    setGuarantorPhone(c.guarantorPhone || '');
    setFormErrors({});
    setFormDirty(false);
    setSubView('form');
  };

  const exitForm = (targetAfter?: NavSection | null) => {
    setFormDirty(false);
    setHasUnsavedChanges(false);
    setFormErrors({});
    setEditingCustomer(null);
    setSubView('list');
    setReturnToNav(null);
    if (targetAfter && targetAfter !== 'customers') {
      setActiveNav(targetAfter, { bypassDirtyCheck: true });
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const errs: { name?: string; phone?: string } = {};
    if (!name.trim()) errs.name = 'يرجى إدخال اسم الزبون (حقل إلزامي).';
    if (!phone.trim()) errs.phone = 'يرجى إدخال رقم الهاتف (حقل إلزامي).';
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone: normalizeArabicDigits(phone).trim(),
        address: address.trim(),
        nationalId: normalizeArabicDigits(nationalId).trim() || undefined,
        guarantorName: guarantorName.trim() || undefined,
        guarantorPhone: normalizeArabicDigits(guarantorPhone).trim() || undefined,
      };

      if (editingCustomer) {
        updateCustomer(editingCustomer.id, payload);
        setSelectedCustomerId(editingCustomer.id);
      } else {
        const created = addCustomer(payload);
        setSelectedCustomerId(created.id);
      }

      const dest = returnToNav;
      exitForm(dest);
    } finally {
      setIsSubmitting(false);
    }
  };

  const custHeaders = [
    'الكود',
    'اسم الزبون',
    'الهاتف',
    'العنوان',
    'الكفيل',
    'المتبقي ($)',
    'المتبقي (د.ع)',
  ];
  const custRows = filteredCustomers.map((c) => {
    const bal = getCustomerBalances(c.id);
    return [c.code, c.name, c.phone, c.address, c.guarantorName || '-', bal.usd, bal.iqd];
  });

  const buildCustomerStatementPrint = (): PrintablePayload | null => {
    if (!activeCustomer) return null;
    const bal = getCustomerBalances(activeCustomer.id);
    const cols = [
      'التاريخ',
      'نوع الحركة',
      'المرجع',
      'مدفوع ($)',
      'مدفوع (د.ع)',
      'المحتسب بالذمة',
      'فرق الصرف',
    ];
    const rows = customerReceipts.map((r) => [
      new Date(r.date).toLocaleDateString('ar-IQ'),
      r.category === 'installment_receipt'
        ? 'قبض قسط'
        : r.category === 'down_payment'
          ? 'مقدمة'
          : r.category === 'cash_sale'
            ? 'بيع نقدي'
            : 'قبض آجل',
      `${r.voucherNumber} (${r.invoiceNumber || '-'})`,
      r.paidUSD,
      r.paidIQD,
      formatCurrency(r.settledInInvoiceCurrency, r.invoiceCurrency),
      `${r.fxDiffIQD >= 0 ? '+' : ''}${formatIQD(r.fxDiffIQD)}`,
    ]);
    return {
      kind: 'statement',
      title: `كشف حساب زبون: ${activeCustomer.name}`,
      subtitle: `${activeCustomer.code} · هاتف: ${activeCustomer.phone} · ${activeCustomer.address}`,
      partyType: 'customer',
      columns: cols,
      rows,
      summaryLines: [
        { label: 'عدد الفواتير', value: String(customerSales.length) },
        { label: 'المتبقي بذمته (دولار)', value: formatUSD(bal.usd) },
        { label: 'المتبقي بذمته (دينار)', value: formatIQD(bal.iqd) },
      ],
      rawData: {
        customer: activeCustomer,
        balances: bal,
        sales: customerSales,
        receipts: customerReceipts,
      },
    };
  };

  const handlePrintTopAction = () => {
    const statement = buildCustomerStatementPrint();
    if (statement) {
      openPrintPreview(statement);
      return;
    }
    openPrintPreview({
      kind: 'statement',
      title: 'قائمة الزبائن والأرصدة',
      subtitle: `عدد الزبائن: ${filteredCustomers.length}`,
      partyType: 'customer',
      columns: custHeaders,
      rows: custRows,
      summaryLines: [{ label: 'إجمالي الزبائن', value: String(filteredCustomers.length) }],
      rawData: filteredCustomers,
    });
  };

  if (subView === 'form') {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {editingCustomer ? `تعديل الزبون: ${editingCustomer.name}` : 'تسجيل زبون جديد'}
            </h2>
            {returnToNav && returnToNav !== 'customers' && (
              <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                بعد الحفظ سيتم إعادتك تلقائياً إلى فاتورة البيع واختيار الزبون.
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
              {returnToNav && returnToNav !== 'customers'
                ? 'إلغاء والعودة للفاتورة'
                : 'العودة لقائمة الزبائن'}
            </span>
          </button>
        </div>

        <form
          onSubmit={handleSave}
          noValidate
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs"
        >
          <div>
            <label className="block font-semibold mb-1">اسم الزبون *</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormDirty(true);
                if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: undefined }));
              }}
              className={`w-full px-3 py-2 border rounded-lg text-sm bg-white ${
                formErrors.name ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
              }`}
            />
            {formErrors.name && (
              <div className="text-[11px] font-semibold text-red-600 mt-1">{formErrors.name}</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">رقم الهاتف *</label>
              <input
                type="text"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(normalizeArabicDigits(e.target.value));
                  setFormDirty(true);
                  if (formErrors.phone) setFormErrors((prev) => ({ ...prev, phone: undefined }));
                }}
                className={`w-full px-3 py-2 border rounded-lg font-num text-sm bg-white ${
                  formErrors.phone ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              />
              {formErrors.phone && (
                <div className="text-[11px] font-semibold text-red-600 mt-1">
                  {formErrors.phone}
                </div>
              )}
            </div>
            <div>
              <label className="block font-semibold mb-1">رقم الهوية / البطاقة</label>
              <input
                type="text"
                value={nationalId}
                onChange={(e) => {
                  setNationalId(normalizeArabicDigits(e.target.value));
                  setFormDirty(true);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-num text-sm bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">العنوان</label>
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setFormDirty(true);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">اسم الكفيل</label>
              <input
                value={guarantorName}
                onChange={(e) => {
                  setGuarantorName(e.target.value);
                  setFormDirty(true);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">هاتف الكفيل</label>
              <input
                type="text"
                inputMode="tel"
                value={guarantorPhone}
                onChange={(e) => {
                  setGuarantorPhone(normalizeArabicDigits(e.target.value));
                  setFormDirty(true);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-num text-sm bg-white"
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
              disabled={isSubmitting}
              className="px-6 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : editingCustomer ? 'حفظ التعديلات' : 'حفظ الزبون'}
            </button>
          </div>
        </form>
      </div>
    );
  }

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
              placeholder="بحث عن زبون بالاسم أو الهاتف أو الكود..."
              className="w-64 h-9 pr-9 pl-3 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            {(
              [
                { id: 'all', label: `الكل (${state.customers.length})` },
                { id: 'debt', label: 'عليهم ذمم' },
                { id: 'settled', label: 'خالص' },
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
            onClick={openNewCustomer}
            className="h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>جديد</span>
          </button>
          <button
            type="button"
            disabled={!activeCustomer}
            onClick={() => activeCustomer && openEditCustomer(activeCustomer)}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>تعديل</span>
          </button>
          {hasPermission('canDeleteRecords') && (
            <button
              type="button"
              disabled={!activeCustomer}
              onClick={() => activeCustomer && setConfirmDeleteCustId(activeCustomer.id)}
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
              exportToExcel('customers-balances.xlsx', 'الزبائن', custHeaders, custRows)
            }
            onCSV={() =>
              exportToCSV('customers-balances.csv', custHeaders, custRows)
            }
            onJSON={() => exportToJSON('customers-balances.json', filteredCustomers)}
          />
        </div>
      </div>

      {/* Inline Delete Customer Confirmation Bar */}
      {confirmDeleteCustId && activeCustomer && confirmDeleteCustId === activeCustomer.id && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-red-900">
            هل أنت متأكد من حذف ملف الزبون «{activeCustomer.name}»؟
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const ok = deleteCustomer(activeCustomer.id);
                if (ok) setConfirmDeleteCustId(null);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
            >
              تأكيد الحذف
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteCustId(null)}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Full-Screen Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">لا يوجد زبائن مطابقون.</div>
        ) : (
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-3 px-3 text-center w-10 font-semibold">ت</th>
                  <th className="py-3 px-4 text-right font-semibold">الكود</th>
                  <th className="py-3 px-4 text-right font-semibold">اسم الزبون</th>
                  <th className="py-3 px-4 text-right font-semibold">الهاتف</th>
                  <th className="py-3 px-4 text-right font-semibold">العنوان</th>
                  <th className="py-3 px-4 text-right font-semibold">الكفيل</th>
                  <th className="py-3 px-4 text-left font-semibold">المتبقي ($)</th>
                  <th className="py-3 px-4 text-left font-semibold">المتبقي (د.ع)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((c, idx) => {
                  const bal = getCustomerBalances(c.id);
                  const selected = activeCustomer?.id === c.id;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      onDoubleClick={() => openEditCustomer(c)}
                      className={`cursor-pointer transition-colors ${
                        selected ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-num text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-num text-slate-600">{c.code}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{c.name}</td>
                      <td className="py-2.5 px-4 font-num text-slate-700">{c.phone}</td>
                      <td className="py-2.5 px-4 text-slate-600">{c.address || '-'}</td>
                      <td className="py-2.5 px-4 text-slate-600">{c.guarantorName || '-'}</td>
                      <td className="py-2.5 px-4 text-left font-num font-bold">
                        {bal.usd > 0 ? (
                          <span className="text-red-700">{formatUSD(bal.usd)}</span>
                        ) : (
                          <span className="text-emerald-700 font-sans">خالص</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-left font-num font-bold">
                        {bal.iqd > 0 ? (
                          <span className="text-red-700">{formatIQD(bal.iqd)}</span>
                        ) : (
                          <span className="text-emerald-700 font-sans">خالص</span>
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

      {/* Selected Customer Account & Ledger Strip */}
      {activeCustomer && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 font-num">{activeCustomer.code}</div>
              <h2 className="text-base font-bold text-slate-900">{activeCustomer.name}</h2>
              <div className="text-xs text-slate-600 mt-0.5 space-x-2 space-x-reverse">
                <span className="font-num">{activeCustomer.phone}</span>
                <span>·</span>
                <span>{activeCustomer.address || 'العنوان غير محدد'}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasPermission('canReceivePayments') && (
                <button
                  type="button"
                  onClick={() =>
                    openSettlementPage({
                      partyType: 'customer',
                      partyId: activeCustomer.id,
                      partyName: activeCustomer.name,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>استلام مبلغ / تسديد</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const pl = buildCustomerStatementPrint();
                  if (pl) openPrintPreview(pl);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>كشف الحساب</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Customer Invoices */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">فواتير الزبون والقبض بالآجل</h3>
                <span className="text-xs text-slate-500 font-num">{customerSales.length} فواتير</span>
              </div>
              {customerSales.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  لا توجد فواتير لهذا الزبون.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 text-right">الفاتورة</th>
                        <th className="py-2.5 px-3 text-right">النوع</th>
                        <th className="py-2.5 px-3 text-left">الإجمالي</th>
                        <th className="py-2.5 px-3 text-left">المتبقي</th>
                        <th className="py-2.5 px-3 text-center">قبض</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerSales.map((s) => {
                        const isCancelled = s.status === 'cancelled';
                        return (
                          <tr
                            key={s.id}
                            className={isCancelled ? 'bg-red-50/40 text-slate-500' : ''}
                          >
                            <td className="py-2.5 px-3">
                              <span className={`font-num font-bold ${isCancelled ? 'line-through' : ''}`}>
                                {s.invoiceNumber}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              {s.saleType === 'cash'
                                ? 'نقدي'
                                : s.saleType === 'installment'
                                  ? 'أقساط'
                                  : 'آجل'}{' '}
                              · <span className="font-num font-semibold">{s.currency}</span>
                            </td>
                            <td className="py-2.5 px-3 text-left font-num">
                              {formatCurrency(s.total, s.currency)}
                            </td>
                            <td className="py-2.5 px-3 text-left font-num font-bold text-red-700">
                              {formatCurrency(isCancelled ? 0 : s.remainingAmount, s.currency)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isCancelled ? (
                                <span className="text-red-700 font-semibold">ملغاة</span>
                              ) : s.remainingAmount > 0 && hasPermission('canReceivePayments') ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openSettlementPage({
                                      partyType: 'customer',
                                      partyId: activeCustomer.id,
                                      partyName: activeCustomer.name,
                                      invoiceId: s.id,
                                      invoiceNumber: s.invoiceNumber,
                                      invoiceCurrency: s.currency,
                                      invoiceExchangeRate: s.exchangeRateAtSale,
                                      remainingAmount: s.remainingAmount,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
                                >
                                  <Wallet className="w-3 h-3" />
                                  <span>قبض</span>
                                </button>
                              ) : (
                                <span className="text-emerald-700 font-semibold">مسدد</span>
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

            {/* Receipts History */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <h3 className="text-sm font-bold text-slate-900">سجل سندات القبض</h3>
                </div>
                <span className="text-xs text-slate-500 font-num">{customerReceipts.length} سند</span>
              </div>
              {customerReceipts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  لا توجد سندات قبض مسجلة.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 text-right">السند</th>
                        <th className="py-2.5 px-3 text-right">التاريخ</th>
                        <th className="py-2.5 px-3 text-left">مدفوع ($)</th>
                        <th className="py-2.5 px-3 text-left">مدفوع (د.ع)</th>
                        <th className="py-2.5 px-3 text-left">المسدد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerReceipts.map((r) => {
                        const isCancelled = r.status === 'cancelled';
                        return (
                          <tr
                            key={r.id}
                            className={
                              r.isReversal
                                ? 'bg-amber-50/40'
                                : isCancelled
                                  ? 'bg-red-50/40 text-slate-500'
                                  : ''
                            }
                          >
                            <td className="py-2.5 px-3 font-num font-semibold">
                              <span className={isCancelled ? 'line-through' : ''}>
                                {r.voucherNumber}
                              </span>
                              <div className="text-[10px] text-slate-500">{r.invoiceNumber}</div>
                            </td>
                            <td className="py-2.5 px-3 font-num text-slate-600">
                              {new Date(r.date).toLocaleDateString('ar-IQ')}
                            </td>
                            <td className="py-2.5 px-3 text-left font-num">
                              {formatUSD(r.paidUSD)}
                            </td>
                            <td className="py-2.5 px-3 text-left font-num">
                              {formatIQD(r.paidIQD)}
                            </td>
                            <td className="py-2.5 px-3 text-left font-num font-semibold">
                              {formatCurrency(r.settledInInvoiceCurrency, r.invoiceCurrency)}
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
        </div>
      )}
    </div>
  );
}
