import { useMemo, useState } from 'react';
import { useERP } from '../context/ERPContext';
import { formatIQD, formatUSD } from '../utils/currency';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';
import { ExportBar } from '../components/ExportBar';

type ReportTab = 'customers_report' | 'suppliers_report' | 'fx_profit_report';

export function ReportsView() {
  const { state, getCustomerBalances, getSupplierBalances, openPrintPreview, hasPermission } = useERP();
  const [tab, setTab] = useState<ReportTab>('customers_report');

  const canSeeProfit = hasPermission('canViewProfitsAndFX');

  // 1. Customer Detailed Report (strictly separated from Suppliers)
  const customerReportRows = useMemo(() => {
    return state.customers.map((c) => {
      const custSales = state.sales.filter((s) => s.status !== 'cancelled' && s.customerId === c.id);
      const custReceipts = state.payments.filter(
        (p) => p.status !== 'cancelled' && !p.isReversal && p.partyType === 'customer' && p.partyId === c.id
      );
      const totalSalesUSD = custSales
        .filter((s) => s.currency === 'USD')
        .reduce((a, b) => a + b.total, 0);
      const totalSalesIQD = custSales
        .filter((s) => s.currency === 'IQD')
        .reduce((a, b) => a + b.total, 0);
      const receivedUSD = custReceipts.reduce((a, b) => a + b.paidUSD, 0);
      const receivedIQD = custReceipts.reduce((a, b) => a + b.paidIQD, 0);
      const fxDiffIQD = custReceipts.reduce((a, b) => a + b.fxDiffIQD, 0);
      const bal = getCustomerBalances(c.id);
      return {
        customer: c,
        invoicesCount: custSales.length,
        totalSalesUSD,
        totalSalesIQD,
        receivedUSD,
        receivedIQD,
        remainingUSD: bal.usd,
        remainingIQD: bal.iqd,
        fxDiffIQD,
      };
    });
  }, [state.customers, state.sales, state.payments, getCustomerBalances]);

  // 2. Supplier Detailed Report (strictly separated from Customers)
  const supplierReportRows = useMemo(() => {
    return state.suppliers.map((s) => {
      const supPurchases = state.purchases.filter((p) => p.status !== 'cancelled' && p.supplierId === s.id);
      const supPayments = state.payments.filter(
        (p) => p.status !== 'cancelled' && !p.isReversal && p.partyType === 'supplier' && p.partyId === s.id
      );
      const totalBuyUSD = supPurchases
        .filter((p) => p.currency === 'USD')
        .reduce((a, b) => a + b.total, 0);
      const totalBuyIQD = supPurchases
        .filter((p) => p.currency === 'IQD')
        .reduce((a, b) => a + b.total, 0);
      const paidUSD = supPayments.reduce((a, b) => a + b.paidUSD, 0);
      const paidIQD = supPayments.reduce((a, b) => a + b.paidIQD, 0);
      const fxDiffIQD = supPayments.reduce((a, b) => a + b.fxDiffIQD, 0);
      const bal = getSupplierBalances(s.id);
      return {
        supplier: s,
        invoicesCount: supPurchases.length,
        totalBuyUSD,
        totalBuyIQD,
        paidUSD,
        paidIQD,
        remainingUSD: bal.usd,
        remainingIQD: bal.iqd,
        fxDiffIQD,
      };
    });
  }, [state.suppliers, state.purchases, state.payments, getSupplierBalances]);

  // 3. Profit & FX Gain/Loss Report
  const profitSummary = useMemo(() => {
    let grossProfitUSD = 0;
    let grossProfitIQD = 0;

    for (const s of state.sales) {
      if (s.status === 'cancelled') continue;
      let saleProfit = -s.discount;
      for (const it of s.items) {
        const lineRevenue = it.lineTotal;
        let lineCostInSaleCurrency = it.unitCost * it.quantity;
        if (it.costCurrency !== s.currency && s.exchangeRateAtSale > 0) {
          lineCostInSaleCurrency =
            it.costCurrency === 'USD' && s.currency === 'IQD'
              ? lineCostInSaleCurrency * s.exchangeRateAtSale
              : lineCostInSaleCurrency / s.exchangeRateAtSale;
        }
        saleProfit += lineRevenue - lineCostInSaleCurrency;
      }
      if (s.currency === 'USD') grossProfitUSD += saleProfit;
      else grossProfitIQD += saleProfit;
    }

    const fxTransactions = state.payments.filter(
      (p) => p.status !== 'cancelled' && !p.isReversal && p.fxDiffIQD !== 0
    );
    const totalFxGainLossIQD = fxTransactions.reduce((sum, p) => sum + p.fxDiffIQD, 0);

    return {
      grossProfitUSD,
      grossProfitIQD,
      totalFxGainLossIQD,
      fxTransactions,
    };
  }, [state.sales, state.payments]);

  const custHeaders = [
    'الكود',
    'الزبون',
    'عدد الفواتير',
    'إجمالي مبيعات ($)',
    'إجمالي مبيعات (د.ع)',
    'المقبوض فعلياً ($)',
    'المقبوض فعلياً (د.ع)',
    'المتبقي بذمته ($)',
    'المتبقي بذمته (د.ع)',
    'فرق الصرف (د.ع)',
  ];
  const custExportRows = customerReportRows.map((r) => [
    r.customer.code,
    r.customer.name,
    r.invoicesCount,
    r.totalSalesUSD,
    r.totalSalesIQD,
    r.receivedUSD,
    r.receivedIQD,
    r.remainingUSD,
    r.remainingIQD,
    r.fxDiffIQD,
  ]);

  const supHeaders = [
    'الكود',
    'المورد',
    'فواتير الشراء',
    'إجمالي التجهيز ($)',
    'إجمالي التجهيز (د.ع)',
    'المدفوع فعلياً ($)',
    'المدفوع فعلياً (د.ع)',
    'المتبقي للمورد ($)',
    'المتبقي للمورد (د.ع)',
    'فرق الصرف (د.ع)',
  ];
  const supExportRows = supplierReportRows.map((r) => [
    r.supplier.code,
    r.supplier.name,
    r.invoicesCount,
    r.totalBuyUSD,
    r.totalBuyIQD,
    r.paidUSD,
    r.paidIQD,
    r.remainingUSD,
    r.remainingIQD,
    r.fxDiffIQD,
  ]);

  const fxHeaders = ['السند', 'التاريخ', 'الجهة', 'النوع', 'سعر الفاتورة', 'سعر السند', 'فرق الصرف (د.ع)'];
  const fxExportRows = profitSummary.fxTransactions.map((t) => [
    t.voucherNumber,
    new Date(t.date).toLocaleDateString('ar-IQ'),
    t.partyName,
    t.partyType === 'customer' ? 'قبض زبون' : 'تسديد مورد',
    t.invoiceExchangeRate * 100,
    t.paymentExchangeRate * 100,
    t.fxDiffIQD,
  ]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('customers_report')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === 'customers_report' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            تقرير حركة الزبائن المفصل
          </button>
          <button
            type="button"
            onClick={() => setTab('suppliers_report')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === 'suppliers_report' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            تقرير حركة الموردين المفصل
          </button>
          {canSeeProfit && (
            <button
              type="button"
              onClick={() => setTab('fx_profit_report')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                tab === 'fx_profit_report' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              تقرير الأرباح وفروقات الصرف
            </button>
          )}
        </div>

        <ExportBar
          onExcel={() => {
            if (tab === 'customers_report')
              exportToExcel('customers-financial-report.xlsx', 'تقرير_الزبائن', custHeaders, custExportRows);
            else if (tab === 'suppliers_report')
              exportToExcel('suppliers-financial-report.xlsx', 'تقرير_الموردين', supHeaders, supExportRows);
            else exportToExcel('fx-profit-report.xlsx', 'فروقات_الصرف', fxHeaders, fxExportRows);
          }}
          onCSV={() => {
            if (tab === 'customers_report')
              exportToCSV('customers-financial-report.csv', custHeaders, custExportRows);
            else if (tab === 'suppliers_report')
              exportToCSV('suppliers-financial-report.csv', supHeaders, supExportRows);
            else exportToCSV('fx-profit-report.csv', fxHeaders, fxExportRows);
          }}
          onJSON={() => {
            if (tab === 'customers_report') exportToJSON('customers-report.json', customerReportRows);
            else if (tab === 'suppliers_report') exportToJSON('suppliers-report.json', supplierReportRows);
            else exportToJSON('fx-profit-report.json', profitSummary);
          }}
          onPrint={() => {
            if (tab === 'customers_report') {
              openPrintPreview({
                kind: 'statement',
                title: 'التقرير المالي التفصيلي لحركة الزبائن',
                subtitle: 'مفصول بالكامل عن حركة الموردين · دولار ودينار عراقي',
                partyType: 'customer',
                columns: custHeaders,
                rows: custExportRows,
                summaryLines: [
                  { label: 'عدد الزبائن', value: String(customerReportRows.length) },
                  {
                    label: 'إجمالي الذمم ($)',
                    value: formatUSD(customerReportRows.reduce((a, b) => a + b.remainingUSD, 0)),
                  },
                  {
                    label: 'إجمالي الذمم (د.ع)',
                    value: formatIQD(customerReportRows.reduce((a, b) => a + b.remainingIQD, 0)),
                  },
                ],
                rawData: customerReportRows,
              });
            } else if (tab === 'suppliers_report') {
              openPrintPreview({
                kind: 'statement',
                title: 'التقرير المالي التفصيلي لحركة الموردين',
                subtitle: 'مفصول بالكامل عن حركة الزبائن · دولار ودينار عراقي',
                partyType: 'supplier',
                columns: supHeaders,
                rows: supExportRows,
                summaryLines: [
                  { label: 'عدد الموردين', value: String(supplierReportRows.length) },
                  {
                    label: 'المستحق للموردين ($)',
                    value: formatUSD(supplierReportRows.reduce((a, b) => a + b.remainingUSD, 0)),
                  },
                  {
                    label: 'المستحق للموردين (د.ع)',
                    value: formatIQD(supplierReportRows.reduce((a, b) => a + b.remainingIQD, 0)),
                  },
                ],
                rawData: supplierReportRows,
              });
            } else {
              openPrintPreview({
                kind: 'statement',
                title: 'تقرير الأرباح وفروقات سعر الصرف',
                subtitle: 'صافي الربح التجاري وفروقات الصرف المتحققة',
                partyType: 'general',
                columns: fxHeaders,
                rows: fxExportRows,
                summaryLines: [
                  { label: 'أرباح المبيعات ($)', value: formatUSD(profitSummary.grossProfitUSD) },
                  { label: 'أرباح المبيعات (د.ع)', value: formatIQD(profitSummary.grossProfitIQD) },
                  { label: 'صافي فروقات الصرف', value: formatIQD(profitSummary.totalFxGainLossIQD) },
                ],
                rawData: profitSummary,
              });
            }
          }}
        />
      </div>

      {tab === 'customers_report' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">حركة الزبائن التفصيلية (ذمم مدينة / أقساط)</h2>
            <span className="text-xs text-slate-500">مستقل تماماً عن سجل الموردين</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-right">الزبون</th>
                  <th className="py-2.5 px-4 text-center">الفواتير</th>
                  <th className="py-2.5 px-4 text-left">مشترياته ($)</th>
                  <th className="py-2.5 px-4 text-left">مشترياته (د.ع)</th>
                  <th className="py-2.5 px-4 text-left">المقبوض ($)</th>
                  <th className="py-2.5 px-4 text-left">المقبوض (د.ع)</th>
                  <th className="py-2.5 px-4 text-left">المتبقي ($)</th>
                  <th className="py-2.5 px-4 text-left">المتبقي (د.ع)</th>
                  <th className="py-2.5 px-4 text-left">فرق الصرف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customerReportRows.map((r) => (
                  <tr key={r.customer.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{r.customer.name}</td>
                    <td className="py-2.5 px-4 text-center font-num">{r.invoicesCount}</td>
                    <td className="py-2.5 px-4 text-left font-num">{formatUSD(r.totalSalesUSD)}</td>
                    <td className="py-2.5 px-4 text-left font-num">{formatIQD(r.totalSalesIQD)}</td>
                    <td className="py-2.5 px-4 text-left font-num text-emerald-700">{formatUSD(r.receivedUSD)}</td>
                    <td className="py-2.5 px-4 text-left font-num text-emerald-700">{formatIQD(r.receivedIQD)}</td>
                    <td className="py-2.5 px-4 text-left font-num font-bold text-red-700">{formatUSD(r.remainingUSD)}</td>
                    <td className="py-2.5 px-4 text-left font-num font-bold text-red-700">{formatIQD(r.remainingIQD)}</td>
                    <td className="py-2.5 px-4 text-left font-num">
                      {r.fxDiffIQD !== 0 ? (
                        <span className={r.fxDiffIQD > 0 ? 'text-emerald-700' : 'text-red-700'}>
                          {r.fxDiffIQD > 0 ? '+' : ''}
                          {formatIQD(r.fxDiffIQD)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'suppliers_report' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">حركة الموردين التفصيلية (ذمم دائنة / تجهيز)</h2>
            <span className="text-xs text-slate-500">مستقل تماماً عن سجل الزبائن</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-right">المورد</th>
                  <th className="py-2.5 px-4 text-center">الفواتير</th>
                  <th className="py-2.5 px-4 text-left">التجهيز ($)</th>
                  <th className="py-2.5 px-4 text-left">التجهيز (د.ع)</th>
                  <th className="py-2.5 px-4 text-left">المدفوع ($)</th>
                  <th className="py-2.5 px-4 text-left">المدفوع (د.ع)</th>
                  <th className="py-2.5 px-4 text-left">المتبقي ($)</th>
                  <th className="py-2.5 px-4 text-left">المتبقي (د.ع)</th>
                  <th className="py-2.5 px-4 text-left">فرق الصرف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierReportRows.map((r) => (
                  <tr key={r.supplier.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{r.supplier.name}</td>
                    <td className="py-2.5 px-4 text-center font-num">{r.invoicesCount}</td>
                    <td className="py-2.5 px-4 text-left font-num">{formatUSD(r.totalBuyUSD)}</td>
                    <td className="py-2.5 px-4 text-left font-num">{formatIQD(r.totalBuyIQD)}</td>
                    <td className="py-2.5 px-4 text-left font-num text-emerald-700">{formatUSD(r.paidUSD)}</td>
                    <td className="py-2.5 px-4 text-left font-num text-emerald-700">{formatIQD(r.paidIQD)}</td>
                    <td className="py-2.5 px-4 text-left font-num font-bold text-amber-700">{formatUSD(r.remainingUSD)}</td>
                    <td className="py-2.5 px-4 text-left font-num font-bold text-amber-700">{formatIQD(r.remainingIQD)}</td>
                    <td className="py-2.5 px-4 text-left font-num">
                      {r.fxDiffIQD !== 0 ? (
                        <span className={r.fxDiffIQD > 0 ? 'text-emerald-700' : 'text-red-700'}>
                          {r.fxDiffIQD > 0 ? '+' : ''}
                          {formatIQD(r.fxDiffIQD)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'fx_profit_report' && canSeeProfit && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">هامش ربح فواتير الدولار</div>
              <div className="text-xl font-bold font-num text-slate-900 mt-1.5">
                {formatUSD(profitSummary.grossProfitUSD)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">هامش ربح فواتير الدينار العراقي</div>
              <div className="text-xl font-bold font-num text-slate-900 mt-1.5">
                {formatIQD(profitSummary.grossProfitIQD)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">صافي أرباح/خسائر فروقات سعر الصرف</div>
              <div
                className={`text-xl font-bold font-num mt-1.5 ${
                  profitSummary.totalFxGainLossIQD >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {profitSummary.totalFxGainLossIQD >= 0 ? '+' : ''}
                {formatIQD(profitSummary.totalFxGainLossIQD)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-bold text-slate-900">
              العمليات التي نتج عنها فرق صرف
            </div>
            {profitSummary.fxTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                لا توجد فروقات صرف مسجلة حتى الآن.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 text-right">السند</th>
                      <th className="py-2.5 px-4 text-right">التاريخ</th>
                      <th className="py-2.5 px-4 text-right">الجهة</th>
                      <th className="py-2.5 px-4 text-left">سعر الفاتورة</th>
                      <th className="py-2.5 px-4 text-left">سعر السند</th>
                      <th className="py-2.5 px-4 text-left">فرق الصرف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profitSummary.fxTransactions.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2.5 px-4 font-num font-bold">{t.voucherNumber}</td>
                        <td className="py-2.5 px-4 font-num text-slate-600">
                          {new Date(t.date).toLocaleDateString('ar-IQ')}
                        </td>
                        <td className="py-2.5 px-4">{t.partyName}</td>
                        <td className="py-2.5 px-4 text-left font-num">
                          {(t.invoiceExchangeRate * 100).toLocaleString()} د.ع
                        </td>
                        <td className="py-2.5 px-4 text-left font-num">
                          {(t.paymentExchangeRate * 100).toLocaleString()} د.ع
                        </td>
                        <td
                          className={`py-2.5 px-4 text-left font-num font-bold ${
                            t.fxDiffIQD >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {t.fxDiffIQD >= 0 ? '+' : ''}
                          {formatIQD(t.fxDiffIQD)}
                        </td>
                      </tr>
                    ))}
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
