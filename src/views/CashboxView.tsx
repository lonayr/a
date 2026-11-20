import React, { useMemo, useState } from 'react';
import { Ban, Printer, Search, HandCoins, XCircle } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { formatCurrency, formatIQD, formatUSD } from '../utils/currency';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';
import { ExportBar } from '../components/ExportBar';

export function CashboxView() {
  const { state, cancelPaymentTransaction, openPrintPreview, setActiveNav, hasPermission } = useERP();
  const [search, setSearch] = useState('');
  const [filterParty, setFilterParty] = useState<'all' | 'customer' | 'supplier'>('all');

  const [cancellingVoucherId, setCancellingVoucherId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const canSeeFx = hasPermission('canViewProfitsAndFX');

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.payments.filter((p) => {
      if (filterParty !== 'all' && p.partyType !== filterParty) return false;
      if (!q) return true;
      return (
        p.voucherNumber.toLowerCase().includes(q) ||
        p.partyName.toLowerCase().includes(q) ||
        (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(q))
      );
    });
  }, [state.payments, search, filterParty]);

  const totals = useMemo(() => {
    let customerInUSD = 0;
    let customerInIQD = 0;
    let supplierOutUSD = 0;
    let supplierOutIQD = 0;
    let fxDiffTotalIQD = 0;

    for (const p of state.payments) {
      if (p.partyType === 'customer') {
        customerInUSD += p.paidUSD;
        customerInIQD += p.paidIQD;
      } else {
        supplierOutUSD += p.paidUSD;
        supplierOutIQD += p.paidIQD;
      }
      fxDiffTotalIQD += p.fxDiffIQD;
    }

    return {
      customerInUSD,
      customerInIQD,
      supplierOutUSD,
      supplierOutIQD,
      fxDiffTotalIQD,
    };
  }, [state.payments]);

  const cancellingVoucher = useMemo(
    () =>
      cancellingVoucherId
        ? state.payments.find((p) => p.id === cancellingVoucherId) || null
        : null,
    [cancellingVoucherId, state.payments]
  );

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingVoucherId || isCancelling) return;
    if (!cancelReason.trim()) {
      setCancelError('يرجى كتابة سبب إلغاء السند (حقل إلزامي).');
      return;
    }
    setIsCancelling(true);
    const res = cancelPaymentTransaction(cancellingVoucherId, cancelReason);
    setIsCancelling(false);
    if (!res.ok) {
      setCancelError(res.error || 'تعذر إلغاء السند.');
      return;
    }
    setCancellingVoucherId(null);
    setCancelReason('');
    setCancelError('');
  };

  const headers = canSeeFx
    ? ['رقم السند', 'الحالة', 'التاريخ', 'النوع', 'الجهة', 'الاسم', 'المستلم/المدفوع ($)', 'المستلم/المدفوع (د.ع)', 'المحتسب بالفاتورة', 'فرق الصرف (د.ع)', 'المستخدم']
    : ['رقم السند', 'الحالة', 'التاريخ', 'النوع', 'الجهة', 'الاسم', 'المستلم/المدفوع ($)', 'المستلم/المدفوع (د.ع)', 'المحتسب بالفاتورة', 'المستخدم'];
  const rows = filteredPayments.map((p) => {
    const statusText = p.isReversal ? 'سند عكسي' : p.status === 'cancelled' ? 'ملغى' : 'نشط';
    const base = [
      p.voucherNumber,
      statusText,
      new Date(p.date).toLocaleString('ar-IQ'),
      p.partyType === 'customer' ? 'قبض زبون' : 'تسديد مورد',
      p.partyType === 'customer' ? 'زبون' : 'مورد',
      p.partyName,
      p.paidUSD,
      p.paidIQD,
      formatCurrency(p.settledInInvoiceCurrency, p.invoiceCurrency),
    ];
    return canSeeFx ? [...base, p.fxDiffIQD, p.createdBy] : [...base, p.createdBy];
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className={`grid grid-cols-1 ${canSeeFx ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 font-medium">صافي المقبوضات (من الزبائن)</div>
          <div className="text-xl font-bold font-num text-emerald-700 mt-2">
            {formatUSD(totals.customerInUSD)} + {formatIQD(totals.customerInIQD)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 font-medium">صافي المدفوعات (للموردين)</div>
          <div className="text-xl font-bold font-num text-amber-700 mt-2">
            {formatUSD(totals.supplierOutUSD)} + {formatIQD(totals.supplierOutIQD)}
          </div>
        </div>
        {canSeeFx && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs text-slate-500 font-medium">صافي فروقات الصرف المتحققة</div>
            <div
              className={`text-xl font-bold font-num mt-2 ${
                totals.fxDiffTotalIQD >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {totals.fxDiffTotalIQD >= 0 ? '+' : ''}
              {formatIQD(totals.fxDiffTotalIQD)}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم السند، اسم الزبون أو المورد..."
              className="w-72 pr-9 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: 'كافة الحركات' },
                { id: 'customer', label: 'قبض الزبائن (أقساط/آجل)' },
                { id: 'supplier', label: 'تسديد الموردين' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterParty(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  filterParty === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('canReceivePayments') && (
            <button
              type="button"
              onClick={() => setActiveNav('settlement')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
            >
              <HandCoins className="w-4 h-4" />
              <span>استلام / تسديد جديد</span>
            </button>
          )}
          <ExportBar
            onExcel={() => exportToExcel('cashbox-movements.xlsx', 'الصندوق', headers, rows)}
            onCSV={() => exportToCSV('cashbox-movements.csv', headers, rows)}
            onJSON={() => exportToJSON('cashbox-movements.json', filteredPayments)}
            onPrint={() =>
              openPrintPreview({
                kind: 'statement',
                title: 'حركة الصندوق والقبض والتسديد النقدي',
                subtitle: `عدد السندات: ${filteredPayments.length}`,
                partyType: 'general',
                columns: headers,
                rows,
                summaryLines: [
                  { label: 'عدد السندات', value: String(filteredPayments.length) },
                  { label: 'صافي مقبوضات زبائن (دولار)', value: formatUSD(totals.customerInUSD) },
                  { label: 'صافي مدفوعات موردين (دولار)', value: formatUSD(totals.supplierOutUSD) },
                ],
                rawData: filteredPayments,
              })
            }
          />
        </div>
      </div>

      {/* Inline Voucher Cancellation Bar */}
      {cancellingVoucher && (
        <form
          onSubmit={handleConfirmCancel}
          className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-red-900">
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                إلغاء السند المالي <span className="font-num">{cancellingVoucher.voucherNumber}</span> (
                {cancellingVoucher.partyName}) وإصدار سند عكسي
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCancellingVoucherId(null);
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
                placeholder="اكتب سبب إلغاء السند الإلزامي (يُحفظ في سجل التدقيق)..."
                className={`w-full h-9 px-3 text-xs rounded-lg border bg-white ${
                  cancelError ? 'border-red-500 bg-red-50/40' : 'border-red-300'
                }`}
              />
              {cancelError && <div className="text-[11px] font-semibold text-red-700 mt-1">{cancelError}</div>}
            </div>
            <button
              type="submit"
              disabled={isCancelling}
              className="h-9 px-4 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
            >
              {isCancelling ? 'جاري التنفيذ...' : 'تأكيد إلغاء السند وإصدار سند عكسي'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">لا توجد سندات قبض أو تسديد مطابقة.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-right">رقم السند</th>
                  <th className="py-3 px-4 text-right">التاريخ</th>
                  <th className="py-3 px-4 text-right">نوع الحركة</th>
                  <th className="py-3 px-4 text-right">الجهة والاسم</th>
                  <th className="py-3 px-4 text-left">المبلغ المدفوع ($ / د.ع)</th>
                  <th className="py-3 px-4 text-left">المحتسب بالفاتورة</th>
                  {canSeeFx && <th className="py-3 px-4 text-left">فرق الصرف</th>}
                  <th className="py-3 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => {
                  const isCancelled = p.status === 'cancelled';
                  return (
                    <tr
                      key={p.id}
                      className={
                        p.isReversal
                          ? 'bg-amber-50/40'
                          : isCancelled
                          ? 'bg-red-50/40 text-slate-500'
                          : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-3 px-4 font-num font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className={isCancelled ? 'line-through text-slate-500' : ''}>
                            {p.voucherNumber}
                          </span>
                          {p.isReversal && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-sans font-bold">
                              سند عكسي
                            </span>
                          )}
                          {isCancelled && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-sans font-bold">
                              ملغى
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">{p.invoiceNumber}</div>
                        {isCancelled && p.cancellationReason && (
                          <div className="text-[10px] font-sans text-red-700 mt-0.5">
                            السبب: {p.cancellationReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-num text-slate-600">
                        {new Date(p.date).toLocaleString('ar-IQ')}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {p.isReversal
                          ? 'قيد عكسي لإلغاء سند'
                          : p.partyType === 'customer'
                          ? 'قبض من زبون'
                          : 'تسديد لمورد'}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{p.partyName}</td>
                      <td className="py-3 px-4 text-left font-num">
                        {p.paidUSD !== 0 && <div>{formatUSD(p.paidUSD)}</div>}
                        {p.paidIQD !== 0 && <div>{formatIQD(p.paidIQD)}</div>}
                      </td>
                      <td className="py-3 px-4 text-left font-num font-semibold">
                        {formatCurrency(p.settledInInvoiceCurrency, p.invoiceCurrency)}
                      </td>
                      {canSeeFx && (
                        <td
                          className={`py-3 px-4 text-left font-num font-semibold ${
                            p.fxDiffIQD >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {p.fxDiffIQD >= 0 ? '+' : ''}
                          {formatIQD(p.fxDiffIQD)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openPrintPreview({ kind: 'payment', data: p })}
                            className="p-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                            title="طباعة السند"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {!isCancelled && !p.isReversal && hasPermission('canDeleteRecords') && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingVoucherId(p.id);
                                setCancelReason('');
                                setCancelError('');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-semibold whitespace-nowrap"
                              title="إلغاء السند وإصدار سند عكسي"
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
    </div>
  );
}
