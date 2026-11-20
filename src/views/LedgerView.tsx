import React, { useMemo, useState } from 'react';
import { Ban, Printer, XCircle } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { formatCurrency, formatIQD, formatRatePer100, formatUSD } from '../utils/currency';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';
import { ExportBar } from '../components/ExportBar';

type LedgerTab =
  | 'all'
  | 'sales_ops'
  | 'customer_receipts'
  | 'purchase_ops'
  | 'supplier_payments'
  | 'fx_history';

export function LedgerView() {
  const {
    state,
    cancelSaleInvoice,
    cancelPurchaseInvoice,
    cancelPaymentTransaction,
    openPrintPreview,
    hasPermission,
  } = useERP();
  const [tab, setTab] = useState<LedgerTab>('all');

  const canSeeCostAndFx = hasPermission('canEditCostPrices') || hasPermission('canViewProfitsAndFX');

  const [cancellingRef, setCancellingRef] = useState<{
    kind: 'sale' | 'purchase' | 'payment';
    id: string;
    code: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const orderedOperations = useMemo(() => {
    const items: {
      id: string;
      date: string;
      orderCode: string;
      group: 'sale' | 'purchase' | 'customer_receipt' | 'supplier_payment';
      label: string;
      partyRole: string;
      partyName: string;
      currency: 'USD' | 'IQD';
      amountText: string;
      paidUsdIqd: string;
      fxDiffIQD: number;
      createdBy: string;
      isCancelled: boolean;
      isReversal: boolean;
      cancellationReason?: string;
      rawRef: { kind: 'sale' | 'purchase' | 'payment'; id: string };
    }[] = [];

    for (const s of state.sales) {
      items.push({
        id: `op-${s.id}`,
        date: s.date,
        orderCode: s.invoiceNumber,
        group: 'sale',
        label: s.saleType === 'cash' ? 'بيع نقدي' : s.saleType === 'installment' ? 'بيع أقساط' : 'بيع بالآجل',
        partyRole: 'زبون',
        partyName: s.customerName,
        currency: s.currency,
        amountText: formatCurrency(s.total, s.currency),
        paidUsdIqd: formatCurrency(s.paidTotal, s.currency),
        fxDiffIQD: 0,
        createdBy: s.createdBy,
        isCancelled: s.status === 'cancelled',
        isReversal: false,
        cancellationReason: s.cancellationReason,
        rawRef: { kind: 'sale', id: s.id },
      });
    }

    if (canSeeCostAndFx) {
      for (const p of state.purchases) {
        items.push({
          id: `op-${p.id}`,
          date: p.date,
          orderCode: p.invoiceNumber,
          group: 'purchase',
          label:
            p.purchaseType === 'cash'
              ? 'شراء نقدي'
              : p.purchaseType === 'opening_balance'
              ? 'رصيد افتتاحي للمخزن'
              : 'شراء بالآجل',
          partyRole: 'مورد',
          partyName: p.supplierName,
          currency: p.currency,
          amountText: formatCurrency(p.total, p.currency),
          paidUsdIqd: formatCurrency(p.paidTotal, p.currency),
          fxDiffIQD: 0,
          createdBy: p.createdBy,
          isCancelled: p.status === 'cancelled',
          isReversal: false,
          cancellationReason: p.cancellationReason,
          rawRef: { kind: 'purchase', id: p.id },
        });
      }
    }

    for (const pay of state.payments) {
      if (!canSeeCostAndFx && pay.partyType === 'supplier') continue;
      const catLabel = pay.isReversal
        ? 'سند عكسي'
        : pay.category === 'installment_receipt'
        ? 'قبض قسط'
        : pay.category === 'credit_receipt'
        ? 'قبض بالآجل'
        : pay.category === 'down_payment'
        ? 'دفعة مقدمة'
        : pay.category === 'cash_sale'
        ? 'قبض نقدي'
        : 'تسديد مورد';

      items.push({
        id: `op-${pay.id}`,
        date: pay.date,
        orderCode: pay.voucherNumber,
        group: pay.partyType === 'customer' ? 'customer_receipt' : 'supplier_payment',
        label: catLabel,
        partyRole: pay.partyType === 'customer' ? 'زبون' : 'مورد',
        partyName: pay.partyName,
        currency: pay.invoiceCurrency,
        amountText: formatCurrency(pay.settledInInvoiceCurrency, pay.invoiceCurrency),
        paidUsdIqd: `${pay.paidUSD !== 0 ? formatUSD(pay.paidUSD) : ''} ${
          pay.paidUSD !== 0 && pay.paidIQD !== 0 ? '+ ' : ''
        }${pay.paidIQD !== 0 ? formatIQD(pay.paidIQD) : ''}`,
        fxDiffIQD: pay.fxDiffIQD,
        createdBy: pay.createdBy,
        isCancelled: pay.status === 'cancelled',
        isReversal: Boolean(pay.isReversal),
        cancellationReason: pay.cancellationReason,
        rawRef: { kind: 'payment', id: pay.id },
      });
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [state.sales, state.purchases, state.payments, canSeeCostAndFx]);

  const filteredOps = useMemo(() => {
    if (tab === 'all') return orderedOperations;
    if (tab === 'sales_ops') return orderedOperations.filter((o) => o.group === 'sale');
    if (tab === 'customer_receipts')
      return orderedOperations.filter((o) => o.group === 'customer_receipt');
    if (tab === 'purchase_ops') return orderedOperations.filter((o) => o.group === 'purchase');
    if (tab === 'supplier_payments')
      return orderedOperations.filter((o) => o.group === 'supplier_payment');
    return [];
  }, [orderedOperations, tab]);

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingRef || isCancelling) return;
    if (!cancelReason.trim()) {
      setCancelError('يرجى كتابة سبب الإلغاء الإلزامي.');
      return;
    }
    setIsCancelling(true);
    let res: { ok: boolean; error?: string };
    if (cancellingRef.kind === 'sale') {
      res = cancelSaleInvoice(cancellingRef.id, cancelReason);
    } else if (cancellingRef.kind === 'purchase') {
      res = cancelPurchaseInvoice(cancellingRef.id, cancelReason);
    } else {
      res = cancelPaymentTransaction(cancellingRef.id, cancelReason);
    }
    setIsCancelling(false);
    if (!res.ok) {
      setCancelError(res.error || 'تعذر تنفيذ الإلغاء.');
      return;
    }
    setCancellingRef(null);
    setCancelReason('');
    setCancelError('');
  };

  const opHeaders = canSeeCostAndFx
    ? ['المرجع', 'الحالة', 'التاريخ', 'العملية', 'الصفة', 'الاسم', 'العملة', 'القيمة المحتسبة', 'المقبوض/المدفوع', 'فرق الصرف (د.ع)', 'المستخدم']
    : ['المرجع', 'الحالة', 'التاريخ', 'العملية', 'الصفة', 'الاسم', 'العملة', 'القيمة المحتسبة', 'المقبوض/المدفوع', 'المستخدم'];
  const opRows = filteredOps.map((o) => {
    const statusText = o.isReversal ? 'سند عكسي' : o.isCancelled ? 'ملغاة' : 'نشطة';
    const base = [
      o.orderCode,
      statusText,
      new Date(o.date).toLocaleString('ar-IQ'),
      o.label,
      o.partyRole,
      o.partyName,
      o.currency,
      o.amountText,
      o.paidUsdIqd,
    ];
    return canSeeCostAndFx ? [...base, o.fxDiffIQD, o.createdBy] : [...base, o.createdBy];
  });

  const fxHeaders = ['التاريخ', 'السعر السابق', 'السعر الجديد', 'المصدر', 'المرجع', 'التفاصيل', 'المستخدم'];
  const fxRows = state.exchangeLogs.map((l) => [
    new Date(l.date).toLocaleString('ar-IQ'),
    l.previousRate * 100,
    l.newRate * 100,
    l.source === 'manual_update' ? 'تحديث يدوي' : l.source === 'auto_conversion' ? 'تحويل تلقائي' : 'تسوية',
    l.reference || '-',
    l.note,
    l.userName,
  ]);

  const openOperationPrint = (ref: { kind: 'sale' | 'purchase' | 'payment'; id: string }) => {
    if (ref.kind === 'sale') {
      const s = state.sales.find((x) => x.id === ref.id);
      if (s) openPrintPreview({ kind: 'sale', data: s });
    } else if (ref.kind === 'purchase') {
      const p = state.purchases.find((x) => x.id === ref.id);
      if (p) openPrintPreview({ kind: 'purchase', data: p });
    } else {
      const pay = state.payments.find((x) => x.id === ref.id);
      if (pay) openPrintPreview({ kind: 'payment', data: pay });
    }
  };

  const tabsList = (
    canSeeCostAndFx
      ? [
          { id: 'all', label: 'كافة العمليات بالترتيب' },
          { id: 'sales_ops', label: 'المبيعات' },
          { id: 'customer_receipts', label: 'قبض الزبائن بالآجل' },
          { id: 'purchase_ops', label: 'المشتريات' },
          { id: 'supplier_payments', label: 'تسديد الموردين' },
          { id: 'fx_history', label: 'تاريخ التحويل التلقائي' },
        ]
      : [
          { id: 'all', label: 'كافة العمليات بالترتيب' },
          { id: 'sales_ops', label: 'المبيعات' },
          { id: 'customer_receipts', label: 'قبض الزبائن بالآجل' },
        ]
  ) as { id: LedgerTab; label: string }[];

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {tabsList.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <ExportBar
          onExcel={() =>
            tab === 'fx_history'
              ? exportToExcel('exchange-rate-history.xlsx', 'تاريخ_الصرف', fxHeaders, fxRows)
              : exportToExcel(`operations-${tab}.xlsx`, 'العمليات', opHeaders, opRows)
          }
          onCSV={() =>
            tab === 'fx_history'
              ? exportToCSV('exchange-rate-history.csv', fxHeaders, fxRows)
              : exportToCSV(`operations-${tab}.csv`, opHeaders, opRows)
          }
          onJSON={() =>
            exportToJSON(
              tab === 'fx_history' ? 'exchange-rate-history.json' : `operations-${tab}.json`,
              tab === 'fx_history' ? state.exchangeLogs : filteredOps
            )
          }
          onPrint={() =>
            openPrintPreview({
              kind: 'statement',
              title: tab === 'fx_history' ? 'سجل تاريخ التحويل التلقائي وأسعار الصرف' : 'سجل العمليات المالية المرتب',
              subtitle: `عدد القيود: ${tab === 'fx_history' ? state.exchangeLogs.length : filteredOps.length}`,
              partyType: 'general',
              columns: tab === 'fx_history' ? fxHeaders : opHeaders,
              rows: tab === 'fx_history' ? fxRows : opRows,
              summaryLines: [
                {
                  label: 'إجمالي السجلات',
                  value: String(tab === 'fx_history' ? state.exchangeLogs.length : filteredOps.length),
                },
                { label: 'سعر الصرف الحالي', value: formatRatePer100(state.activeExchangeRate) },
              ],
              rawData: tab === 'fx_history' ? state.exchangeLogs : filteredOps,
            })
          }
        />
      </div>

      {/* Inline Cancellation Bar */}
      {cancellingRef && (
        <form
          onSubmit={handleConfirmCancel}
          className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-red-900">
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                إلغاء العملية المالية <span className="font-num">{cancellingRef.code}</span> وإصدار قيد عكسي
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCancellingRef(null);
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
                placeholder="اكتب سبب الإلغاء الإلزامي (يُحفظ في سجل التدقيق)..."
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
              {isCancelling ? 'جاري التنفيذ...' : 'تأكيد الإلغاء والقيد العكسي'}
            </button>
          </div>
        </form>
      )}

      {tab === 'fx_history' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 text-right font-semibold">التاريخ والوقت</th>
                  <th className="py-3 px-4 text-right font-semibold">نوع الحركة</th>
                  <th className="py-3 px-4 text-left font-semibold">السعر السابق</th>
                  <th className="py-3 px-4 text-left font-semibold">السعر المعتمد</th>
                  <th className="py-3 px-4 text-right font-semibold">التفاصيل والمرجع</th>
                  <th className="py-3 px-4 text-right font-semibold">المستخدم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.exchangeLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-num text-slate-600">
                      {new Date(log.date).toLocaleString('ar-IQ')}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">
                      {log.source === 'manual_update'
                        ? 'تحديث سعر الصرف'
                        : log.source === 'auto_conversion'
                        ? 'تحويل تلقائي لعملية'
                        : 'تسوية صرف'}
                    </td>
                    <td className="py-2.5 px-4 text-left font-num text-slate-500">
                      {formatRatePer100(log.previousRate)}
                    </td>
                    <td className="py-2.5 px-4 text-left font-num font-bold text-slate-900">
                      {formatRatePer100(log.newRate)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{log.note}</td>
                    <td className="py-2.5 px-4 text-slate-600">{log.userName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredOps.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              لا توجد عمليات مسجلة في هذا القسم.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4 text-right font-semibold">المرجع</th>
                    <th className="py-3 px-4 text-right font-semibold">التاريخ</th>
                    <th className="py-3 px-4 text-right font-semibold">نوع العملية</th>
                    <th className="py-3 px-4 text-right font-semibold">الجهة (زبون / مورد)</th>
                    <th className="py-3 px-4 text-left font-semibold">قيمة العملية</th>
                    <th className="py-3 px-4 text-left font-semibold">التفصيل النقدي</th>
                    {canSeeCostAndFx && <th className="py-3 px-4 text-left font-semibold">فرق الصرف</th>}
                    <th className="py-3 px-4 text-center font-semibold">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOps.map((op) => (
                    <tr
                      key={op.id}
                      className={
                        op.isReversal
                          ? 'bg-amber-50/40'
                          : op.isCancelled
                          ? 'bg-red-50/40 text-slate-500'
                          : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-2.5 px-4 font-num font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className={op.isCancelled ? 'line-through text-slate-500' : ''}>
                            {op.orderCode}
                          </span>
                          {op.isReversal && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-sans font-bold">
                              سند عكسي
                            </span>
                          )}
                          {op.isCancelled && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-sans font-bold">
                              ملغاة
                            </span>
                          )}
                        </div>
                        {op.isCancelled && op.cancellationReason && (
                          <div className="text-[10px] font-sans text-red-700 mt-0.5">
                            السبب: {op.cancellationReason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-num text-slate-600">
                        {new Date(op.date).toLocaleDateString('ar-IQ')}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{op.label}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`text-[11px] font-semibold ${
                            op.partyRole === 'زبون' ? 'text-blue-700' : 'text-amber-700'
                          }`}
                        >
                          {op.partyRole}
                        </span>{' '}
                        <span className="text-slate-400">·</span>{' '}
                        <span className="font-medium text-slate-900">{op.partyName}</span>
                      </td>
                      <td className="py-2.5 px-4 text-left font-num font-semibold text-slate-900">
                        {op.amountText}
                      </td>
                      <td className="py-2.5 px-4 text-left font-num text-slate-700">{op.paidUsdIqd}</td>
                      {canSeeCostAndFx && (
                        <td className="py-2.5 px-4 text-left font-num">
                          {op.fxDiffIQD !== 0 ? (
                            <span className={op.fxDiffIQD > 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                              {op.fxDiffIQD > 0 ? '+' : ''}
                              {formatIQD(op.fxDiffIQD)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openOperationPrint(op.rawRef)}
                            className="p-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                            title="طباعة وتصدير"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {!op.isCancelled && !op.isReversal && hasPermission('canDeleteRecords') && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingRef({
                                  kind: op.rawRef.kind,
                                  id: op.rawRef.id,
                                  code: op.orderCode,
                                });
                                setCancelReason('');
                                setCancelError('');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-semibold whitespace-nowrap"
                              title="إلغاء وإصدار قيد عكسي"
                            >
                              <Ban className="w-3 h-3" />
                              <span>إلغاء</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
