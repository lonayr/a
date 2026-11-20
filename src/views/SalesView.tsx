import React, { useEffect, useMemo, useState } from 'react';
import { Ban, ChevronDown, ChevronUp, Printer, Search, Wallet, XCircle } from 'lucide-react';
import { CurrencyCode, SaleType } from '../types/erp';
import { useERP } from '../context/ERPContext';
import { formatCurrency, formatInDisplayMode } from '../utils/currency';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';
import { ExportBar } from '../components/ExportBar';

export function SalesView() {
  const {
    state,
    displayMode,
    cancelSaleInvoice,
    openPrintPreview,
    openSettlementPage,
    hasPermission,
    salesFilterHint,
    setSalesFilterHint,
  } = useERP();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | SaleType>(() => salesFilterHint || 'ALL');
  const [filterCurrency, setFilterCurrency] = useState<'ALL' | CurrencyCode>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (salesFilterHint) {
      setFilterType(salesFilterHint);
      setSalesFilterHint(null);
    }
  }, [salesFilterHint, setSalesFilterHint]);

  // Inline Cancellation Bar state (no modals)
  const [cancellingSaleId, setCancellingSaleId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.sales.filter((s) => {
      if (filterType !== 'ALL' && s.saleType !== filterType) return false;
      if (filterCurrency !== 'ALL' && s.currency !== filterCurrency) return false;
      if (!q) return true;
      return (
        s.invoiceNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.items.some((it) => `${it.brand} ${it.model} ${it.sku || ''} ${it.imei || ''}`.toLowerCase().includes(q))
      );
    });
  }, [state.sales, search, filterType, filterCurrency]);

  const activeFiltered = useMemo(
    () => filtered.filter((s) => s.status !== 'cancelled'),
    [filtered]
  );

  const cancellingSale = useMemo(
    () => (cancellingSaleId ? state.sales.find((s) => s.id === cancellingSaleId) || null : null),
    [cancellingSaleId, state.sales]
  );

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingSaleId || isCancelling) return;
    if (!cancelReason.trim()) {
      setCancelError('يرجى كتابة سبب إلغاء الفاتورة (حقل إلزامي).');
      return;
    }
    setIsCancelling(true);
    const res = cancelSaleInvoice(cancellingSaleId, cancelReason);
    setIsCancelling(false);
    if (!res.ok) {
      setCancelError(res.error || 'تعذر إلغاء الفاتورة.');
      return;
    }
    setCancellingSaleId(null);
    setCancelReason('');
    setCancelError('');
  };

  const exportHeaders = [
    'رقم الفاتورة',
    'الحالة',
    'التاريخ',
    'الزبون',
    'نوع البيع',
    'العملة',
    'سعر الصرف',
    'الإجمالي',
    'المدفوع',
    'المتبقي',
    'الأصناف',
  ];

  const exportRows = filtered.map((s) => [
    s.invoiceNumber,
    s.status === 'cancelled' ? 'ملغاة' : 'نشطة',
    new Date(s.date).toLocaleString('ar-IQ'),
    s.customerName,
    s.saleType === 'cash' ? 'نقدي' : s.saleType === 'installment' ? 'أقساط' : 'آجل',
    s.currency,
    s.exchangeRateAtSale * 100,
    s.total,
    s.paidTotal,
    s.status === 'cancelled' ? 0 : s.remainingAmount,
    s.items.map((i) => `${i.brand} ${i.model} (×${i.quantity})`).join(' | '),
  ]);

  return (
    <div className="space-y-5">
      {/* Filter & Export Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم الفاتورة، الزبون، الباركود..."
              className="w-64 pr-9 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'ALL', label: 'الكل' },
                { id: 'cash', label: 'نقدي' },
                { id: 'installment', label: 'أقساط' },
                { id: 'credit', label: 'آجل' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterType === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ALL', 'USD', 'IQD'] as const).map((cur) => (
              <button
                key={cur}
                type="button"
                onClick={() => setFilterCurrency(cur)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterCurrency === cur ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {cur === 'ALL' ? 'كل العملات' : cur === 'USD' ? 'دولار ($)' : 'عراقي (د.ع)'}
              </button>
            ))}
          </div>
        </div>

        <ExportBar
          onExcel={() => exportToExcel('sales-invoices.xlsx', 'المبيعات', exportHeaders, exportRows)}
          onCSV={() => exportToCSV('sales-invoices.csv', exportHeaders, exportRows)}
          onJSON={() => exportToJSON('sales-invoices.json', filtered)}
          onPrint={() =>
            openPrintPreview({
              kind: 'statement',
              title: 'تقرير فواتير المبيعات والأقساط',
              subtitle: `عدد الفواتير النشطة: ${activeFiltered.length} (الإجمالي: ${filtered.length})`,
              partyType: 'customer',
              columns: exportHeaders,
              rows: exportRows,
              summaryLines: [
                { label: 'الفواتير النشطة', value: String(activeFiltered.length) },
                {
                  label: 'إجمالي المتبقي ($)',
                  value: formatCurrency(
                    activeFiltered.filter((s) => s.currency === 'USD').reduce((a, b) => a + b.remainingAmount, 0),
                    'USD'
                  ),
                },
                {
                  label: 'إجمالي المتبقي (د.ع)',
                  value: formatCurrency(
                    activeFiltered.filter((s) => s.currency === 'IQD').reduce((a, b) => a + b.remainingAmount, 0),
                    'IQD'
                  ),
                },
              ],
              rawData: filtered,
            })
          }
        />
      </div>

      {/* Inline Cancellation Bar (No Modals) */}
      {cancellingSale && (
        <form
          onSubmit={handleConfirmCancel}
          className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-red-900">
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                إلغاء فاتورة البيع رقم <span className="font-num">{cancellingSale.invoiceNumber}</span> (
                {cancellingSale.customerName}) وإصدار سند عكسي وإرجاع البضاعة للمخزون
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCancellingSaleId(null);
                setCancelReason('');
                setCancelError('');
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
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  if (cancelError) setCancelError('');
                }}
                placeholder="اكتب سبب الإلغاء الإلزامي (سيُحفظ في سجل التدقيق)..."
                className={`w-full h-10 px-3 text-xs rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  cancelError ? 'border-red-500 bg-red-50/40' : 'border-red-300'
                }`}
              />
              {cancelError && <div className="text-[11px] font-semibold text-red-700 mt-1">{cancelError}</div>}
            </div>
            <button
              type="submit"
              disabled={isCancelling}
              className="h-10 px-5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
            >
              {isCancelling ? 'جاري التنفيذ...' : 'تأكيد إلغاء الفاتورة وإصدار قيد عكسي'}
            </button>
          </div>
        </form>
      )}

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            لا توجد فواتير مبيعات مطابقة للبحث الحالي.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-right font-semibold">الفاتورة</th>
                  <th className="py-3 px-4 text-right font-semibold">التاريخ</th>
                  <th className="py-3 px-4 text-right font-semibold">الزبون</th>
                  <th className="py-3 px-4 text-center font-semibold">النوع / العملة</th>
                  <th className="py-3 px-4 text-left font-semibold">الإجمالي</th>
                  <th className="py-3 px-4 text-left font-semibold">المدفوع</th>
                  <th className="py-3 px-4 text-left font-semibold">المتبقي</th>
                  <th className="py-3 px-4 text-center font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((sale) => {
                  const isOpen = expandedId === sale.id;
                  const isCancelled = sale.status === 'cancelled';
                  const totDisp = formatInDisplayMode(
                    sale.total,
                    sale.currency,
                    displayMode,
                    state.activeExchangeRate
                  );
                  const paidDisp = formatInDisplayMode(
                    sale.paidTotal,
                    sale.currency,
                    displayMode,
                    state.activeExchangeRate
                  );
                  const remDisp = formatInDisplayMode(
                    isCancelled ? 0 : sale.remainingAmount,
                    sale.currency,
                    displayMode,
                    state.activeExchangeRate
                  );
                  return (
                    <React.Fragment key={sale.id}>
                      <tr className={isCancelled ? 'bg-red-50/40 text-slate-500' : 'hover:bg-slate-50/70'}>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedId(isOpen ? null : sale.id)}
                              className={`inline-flex items-center gap-1.5 font-num font-bold hover:text-blue-700 ${
                                isCancelled ? 'line-through text-slate-500' : 'text-slate-900'
                              }`}
                            >
                              {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              <span>{sale.invoiceNumber}</span>
                            </button>
                            {isCancelled && (
                              <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold whitespace-nowrap">
                                ملغاة
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-num text-slate-600">
                          {new Date(sale.date).toLocaleDateString('ar-IQ')}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">{sale.customerName}</td>
                        <td className="py-3 px-4 text-center text-slate-700">
                          {sale.saleType === 'cash' ? 'نقدي' : sale.saleType === 'installment' ? 'أقساط' : 'آجل'}
                          <span className="mx-1 text-slate-300">·</span>
                          <span className="font-num font-semibold">{sale.currency}</span>
                        </td>
                        <td className="py-3 px-4 text-left">
                          <div className="font-num font-semibold text-slate-900">{totDisp.primary}</div>
                          {totDisp.secondary && (
                            <div className="text-[10px] text-slate-400 font-num">{totDisp.secondary}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-left font-num text-emerald-700 font-semibold">
                          {paidDisp.primary}
                        </td>
                        <td className="py-3 px-4 text-left font-num font-bold text-red-700">
                          {remDisp.primary}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            {!isCancelled && sale.remainingAmount > 0 && hasPermission('canReceivePayments') && (
                              <button
                                type="button"
                                onClick={() =>
                                  openSettlementPage({
                                    partyType: 'customer',
                                    partyId: sale.customerId,
                                    partyName: sale.customerName,
                                    invoiceId: sale.id,
                                    invoiceNumber: sale.invoiceNumber,
                                    invoiceCurrency: sale.currency,
                                    invoiceExchangeRate: sale.exchangeRateAtSale,
                                    remainingAmount: sale.remainingAmount,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
                                title="قبض دفعة أو قسط"
                              >
                                <Wallet className="w-3 h-3" />
                                <span>قبض</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openPrintPreview({ kind: 'sale', data: sale })}
                              className="p-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                              title="طباعة وتصدير الفاتورة"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {!isCancelled && hasPermission('canDeleteRecords') && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancellingSaleId(sale.id);
                                  setCancelReason('');
                                  setCancelError('');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-semibold whitespace-nowrap"
                                title="إلغاء الفاتورة وإصدار قيد عكسي"
                              >
                                <Ban className="w-3 h-3" />
                                <span>إلغاء</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={8} className="p-4 space-y-4">
                            {isCancelled && (
                              <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-xs text-red-800">
                                <strong>فاتورة ملغاة</strong>
                                {sale.cancelledBy ? ` بواسطة ${sale.cancelledBy}` : ''}
                                {sale.cancelledAt ? ` في ${new Date(sale.cancelledAt).toLocaleString('ar-IQ')}` : ''}
                                {sale.cancellationReason ? ` — السبب: ${sale.cancellationReason}` : ''}
                              </div>
                            )}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div className="bg-white border border-slate-200 rounded-lg p-3">
                                <div className="text-xs font-bold text-slate-800 mb-2">تفاصيل الأجهزة</div>
                                <div className="divide-y divide-slate-100">
                                  {sale.items.map((it, i) => (
                                    <div key={i} className="py-1.5 flex items-center justify-between text-xs">
                                      <div>
                                        <span className="font-semibold">{it.brand} {it.model}</span>{' '}
                                        <span className="text-slate-500">({it.specs})</span>
                                        {(it.sku || it.imei) && (
                                          <span className="mr-2 font-num text-slate-500">
                                            الباركود: {it.sku || it.imei}
                                          </span>
                                        )}
                                      </div>
                                      <div className="font-num font-semibold">
                                        {it.quantity} × {formatCurrency(it.unitPrice, sale.currency)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {sale.installments.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-lg p-3">
                                  <div className="text-xs font-bold text-slate-800 mb-2">
                                    جدول الأقساط ({sale.installments.length} قسط)
                                  </div>
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr className="text-slate-500 border-b border-slate-200">
                                        <th className="py-1 text-right">#</th>
                                        <th className="py-1 text-right">الاستحقاق</th>
                                        <th className="py-1 text-left">المبلغ</th>
                                        <th className="py-1 text-left">المدفوع</th>
                                        <th className="py-1 text-center">الحالة</th>
                                        <th className="py-1 text-center">تسديد</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {sale.installments.map((inst) => (
                                        <tr key={inst.id}>
                                          <td className="py-1.5 font-num">{inst.index}</td>
                                          <td className="py-1.5 font-num">{inst.dueDate}</td>
                                          <td className="py-1.5 text-left font-num">
                                            {formatCurrency(inst.amount, sale.currency)}
                                          </td>
                                          <td className="py-1.5 text-left font-num text-emerald-700">
                                            {formatCurrency(inst.paidAmount, sale.currency)}
                                          </td>
                                          <td className="py-1.5 text-center font-semibold">
                                            {isCancelled ? (
                                              <span className="text-red-700">ملغى</span>
                                            ) : inst.status === 'paid' ? (
                                              <span className="text-emerald-700">مسدد</span>
                                            ) : inst.status === 'partial' ? (
                                              <span className="text-amber-700">جزئي</span>
                                            ) : (
                                              <span className="text-slate-600">مستحق</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 text-center">
                                            {!isCancelled && inst.status !== 'paid' && hasPermission('canReceivePayments') && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  openSettlementPage({
                                                    partyType: 'customer',
                                                    partyId: sale.customerId,
                                                    partyName: sale.customerName,
                                                    invoiceId: sale.id,
                                                    invoiceNumber: sale.invoiceNumber,
                                                    invoiceCurrency: sale.currency,
                                                    invoiceExchangeRate: sale.exchangeRateAtSale,
                                                    remainingAmount: sale.remainingAmount,
                                                    installmentId: inst.id,
                                                    suggestedAmount: inst.amount - inst.paidAmount,
                                                  })
                                                }
                                                className="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px]"
                                              >
                                                قبض
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
