import { useMemo } from 'react';
import { CalendarClock, AlertTriangle, Users, Wallet, Plus, HandCoins, ShoppingBag } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { formatInDisplayMode, formatIQD, formatUSD } from '../utils/currency';

function toLocalYMD(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function DashboardView() {
  const { state, displayMode, setActiveNav, openSettlementPage, hasPermission } = useERP();

  const metrics = useMemo(() => {
    const todayStr = toLocalYMD(new Date());
    const activeSales = state.sales.filter((s) => s.status !== 'cancelled');
    const activePurchases = state.purchases.filter((p) => p.status !== 'cancelled');

    // Today's Sales (compare in local calendar date)
    const todaySales = activeSales.filter((s) => toLocalYMD(new Date(s.date)) === todayStr);
    let todaySalesUSD = 0;
    let todaySalesIQD = 0;
    for (const s of todaySales) {
      if (s.currency === 'USD') todaySalesUSD += s.total;
      else todaySalesIQD += s.total;
    }

    // Today's Estimated Gross Profit (converting item cost currencies properly and deducting discount)
    let todayProfitUSD = 0;
    let todayProfitIQD = 0;
    for (const s of todaySales) {
      let saleProfit = -s.discount;
      for (const it of s.items) {
        let lineCostInSaleCurr = it.unitCost * it.quantity;
        if (it.costCurrency !== s.currency && s.exchangeRateAtSale > 0) {
          lineCostInSaleCurr =
            it.costCurrency === 'USD' && s.currency === 'IQD'
              ? lineCostInSaleCurr * s.exchangeRateAtSale
              : lineCostInSaleCurr / s.exchangeRateAtSale;
        }
        saleProfit += it.lineTotal - lineCostInSaleCurr;
      }
      if (s.currency === 'USD') todayProfitUSD += saleProfit;
      else todayProfitIQD += saleProfit;
    }

    // Customer Receivables
    let custReceivableUSD = 0;
    let custReceivableIQD = 0;
    for (const s of activeSales) {
      if (s.currency === 'USD') custReceivableUSD += s.remainingAmount;
      else custReceivableIQD += s.remainingAmount;
    }

    // Supplier Payables
    let supPayableUSD = 0;
    let supPayableIQD = 0;
    for (const p of activePurchases) {
      if (p.currency === 'USD') supPayableUSD += p.remainingAmount;
      else supPayableIQD += p.remainingAmount;
    }

    // Cashbox flow (reversal vouchers carry negative amounts so net cashbox is accurate)
    let cashUSD = 0;
    let cashIQD = 0;
    let netFxDiffIQD = 0;
    for (const pay of state.payments) {
      if (pay.partyType === 'customer') {
        cashUSD += pay.paidUSD;
        cashIQD += pay.paidIQD;
      } else {
        cashUSD -= pay.paidUSD;
        cashIQD -= pay.paidIQD;
      }
      netFxDiffIQD += pay.fxDiffIQD;
    }

    const totalDevices = state.inventory.reduce((s, it) => s + it.quantity, 0);
    const lowStockItems = state.inventory.filter((it) => it.quantity <= it.minStock);

    // Upcoming installments
    const dueInstallments: {
      saleId: string;
      invoiceNumber: string;
      customerId: string;
      customerName: string;
      currency: 'USD' | 'IQD';
      exchangeRateAtSale: number;
      remainingSaleAmount: number;
      instId: string;
      instIndex: number;
      dueDate: string;
      amount: number;
      paidAmount: number;
      isOverdue: boolean;
    }[] = [];

    for (const s of activeSales) {
      if (s.saleType !== 'installment' || s.remainingAmount <= 0) continue;
      for (const inst of s.installments) {
        if (inst.status === 'paid') continue;
        dueInstallments.push({
          saleId: s.id,
          invoiceNumber: s.invoiceNumber,
          customerId: s.customerId,
          customerName: s.customerName,
          currency: s.currency,
          exchangeRateAtSale: s.exchangeRateAtSale,
          remainingSaleAmount: s.remainingAmount,
          instId: inst.id,
          instIndex: inst.index,
          dueDate: inst.dueDate,
          amount: inst.amount,
          paidAmount: inst.paidAmount,
          isOverdue: inst.dueDate < todayStr,
        });
      }
    }

    dueInstallments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      todaySalesCount: todaySales.length,
      todaySalesUSD,
      todaySalesIQD,
      todayProfitUSD,
      todayProfitIQD,
      custReceivableUSD,
      custReceivableIQD,
      supPayableUSD,
      supPayableIQD,
      cashUSD,
      cashIQD,
      netFxDiffIQD,
      totalDevices,
      lowStockItems,
      dueInstallments: dueInstallments.slice(0, 8),
    };
  }, [state]);

  const showDual = (usd: number, iqd: number) => {
    if (displayMode === 'USD') {
      const totalUsd = usd + iqd / state.activeExchangeRate;
      return {
        main: formatUSD(totalUsd),
        sub: `الأصل: ${formatUSD(usd)} + ${formatIQD(iqd)}`,
      };
    }
    if (displayMode === 'IQD') {
      const totalIqd = Math.round(usd * state.activeExchangeRate + iqd);
      return {
        main: formatIQD(totalIqd),
        sub: `الأصل: ${formatUSD(usd)} + ${formatIQD(iqd)}`,
      };
    }
    return {
      main: formatUSD(usd),
      sub: formatIQD(iqd),
    };
  };

  const cashBoxDisplay = showDual(metrics.cashUSD, metrics.cashIQD);
  const todaySalesDisplay = showDual(metrics.todaySalesUSD, metrics.todaySalesIQD);
  const todayProfitDisplay = showDual(metrics.todayProfitUSD, metrics.todayProfitIQD);
  const custDebtDisplay = showDual(metrics.custReceivableUSD, metrics.custReceivableIQD);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          ملخص نشاط المتجر اليومي · التاريخ:{' '}
          <strong className="font-num text-slate-900">{new Date().toLocaleDateString('ar-IQ')}</strong>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveNav('pos')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>فاتورة بيع جديدة</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNav('purchase')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <ShoppingBag className="w-4 h-4 text-emerald-700" />
            <span>فاتورة شراء</span>
          </button>
          {hasPermission('canReceivePayments') && (
            <button
              type="button"
              onClick={() => setActiveNav('settlement')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
            >
              <HandCoins className="w-4 h-4" />
              <span>التسديد والقبض</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>مبيعات اليوم ({metrics.todaySalesCount} فاتورة)</span>
            <Wallet className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 font-num mt-2">{todaySalesDisplay.main}</div>
          <div className="text-xs text-slate-600 font-num mt-1">{todaySalesDisplay.sub}</div>
        </div>

        {hasPermission('canViewProfitsAndFX') && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>تقدير ربح مبيعات اليوم</span>
              <Wallet className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-700 font-num mt-2">
              {todayProfitDisplay.main}
            </div>
            <div className="text-xs text-slate-600 font-num mt-1">{todayProfitDisplay.sub}</div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>إجمالي الصندوق النقدي</span>
            <Wallet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-900 font-num mt-2">{cashBoxDisplay.main}</div>
          <div className="text-xs text-slate-600 font-num mt-1">{cashBoxDisplay.sub}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>ذمم الزبائن (أقساط وآجل)</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-blue-800 font-num mt-2">{custDebtDisplay.main}</div>
          <div className="text-xs text-slate-600 font-num mt-1">{custDebtDisplay.sub}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Upcoming Installments */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-slate-600" />
              <h2 className="text-sm font-bold text-slate-900">جدول الأقساط المستحقة</h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveNav('sales')}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              عرض الكل
            </button>
          </div>

          {metrics.dueInstallments.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">لا توجد أقساط مستحقة حالياً.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 text-right">الزبون</th>
                    <th className="py-2.5 px-4 text-right">الفاتورة</th>
                    <th className="py-2.5 px-4 text-right">استحقاق القسط</th>
                    <th className="py-2.5 px-4 text-left">المتبقي</th>
                    <th className="py-2.5 px-4 text-center">الحالة</th>
                    <th className="py-2.5 px-4 text-center">قبض</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.dueInstallments.map((item) => {
                    const left = item.amount - item.paidAmount;
                    const disp = formatInDisplayMode(
                      left,
                      item.currency,
                      displayMode,
                      state.activeExchangeRate
                    );
                    return (
                      <tr key={item.instId} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-medium text-slate-900">{item.customerName}</td>
                        <td className="py-2.5 px-4 font-num text-slate-600">
                          {item.invoiceNumber} · قسط #{item.instIndex}
                        </td>
                        <td className="py-2.5 px-4 font-num text-slate-700">{item.dueDate}</td>
                        <td className="py-2.5 px-4 text-left font-num font-semibold text-slate-900">
                          {disp.primary}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={`text-xs font-semibold ${
                              item.isOverdue ? 'text-red-700' : 'text-amber-700'
                            }`}
                          >
                            {item.isOverdue ? 'متأخر' : 'مستحق'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {hasPermission('canReceivePayments') && (
                            <button
                              type="button"
                              onClick={() =>
                                openSettlementPage({
                                  partyType: 'customer',
                                  partyId: item.customerId,
                                  partyName: item.customerName,
                                  invoiceId: item.saleId,
                                  invoiceNumber: item.invoiceNumber,
                                  invoiceCurrency: item.currency,
                                  invoiceExchangeRate: item.exchangeRateAtSale,
                                  remainingAmount: item.remainingSaleAmount,
                                  installmentId: item.instId,
                                  suggestedAmount: left,
                                })
                              }
                              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-900 text-white hover:bg-slate-800"
                            >
                              قبض
                            </button>
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

        {/* Low Stock Alerts */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden h-fit">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-slate-900">تنبيهات نقص المخزون</h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveNav('inventory')}
              className="text-xs text-blue-700 hover:underline"
            >
              المخزون
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {metrics.lowStockItems.length === 0 ? (
              <div className="p-5 text-xs text-slate-500 text-center">جميع الأصناف متوفرة بكفاية.</div>
            ) : (
              metrics.lowStockItems.map((it) => (
                <div key={it.id} className="px-5 py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{it.brand} {it.model}</div>
                    <div className="text-slate-500">{it.storage}</div>
                  </div>
                  <div className="text-left">
                    <span className="font-num font-bold text-red-700">{it.quantity}</span> متبقي
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
