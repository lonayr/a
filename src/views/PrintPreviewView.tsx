import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Braces,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Printer,
  SlidersHorizontal,
} from 'lucide-react';
import { PaperSize, PrintablePayload, SaleInvoice } from '../types/erp';
import { useERP } from '../context/ERPContext';
import { formatCurrency, formatIQD, formatRatePer100, formatUSD } from '../utils/currency';
import { amountToArabicTafqeet } from '../utils/arabicWords';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';

export function PrintPreviewView() {
  const {
    state,
    printPayload,
    openPrintPreview,
    closePrintPreview,
    updatePrintSettings,
    getCustomerBalances,
    getSupplierBalances,
    hasPermission,
  } = useERP();

  const [paperSize, setPaperSize] = useState<PaperSize>(state.printSettings.defaultPaperSize);
  const [showHeader, setShowHeader] = useState(state.printSettings.showHeader);
  const [showBalance, setShowBalance] = useState(state.printSettings.showCustomerBalance);
  const [showInstallments, setShowInstallments] = useState(state.printSettings.showInstallmentTable);
  const [showFxDetails, setShowFxDetails] = useState(state.printSettings.showExchangeRateDetails);
  const [showSignatures, setShowSignatures] = useState(state.printSettings.showSignatures);

  useEffect(() => {
    setPaperSize(state.printSettings.defaultPaperSize);
    setShowHeader(state.printSettings.showHeader);
    setShowBalance(state.printSettings.showCustomerBalance);
    setShowInstallments(state.printSettings.showInstallmentTable);
    setShowFxDetails(state.printSettings.showExchangeRateDetails);
    setShowSignatures(state.printSettings.showSignatures);
  }, [printPayload, state.printSettings]);

  useEffect(() => {
    if (!printPayload) return;
    document.body.classList.remove('print-size-a4', 'print-size-a5');
    document.body.classList.add(paperSize === 'A5' ? 'print-size-a5' : 'print-size-a4');

    let styleEl = document.getElementById('dynamic-page-size-style') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamic-page-size-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@media print { @page { size: ${paperSize} portrait; margin: ${
      paperSize === 'A5' ? '6mm' : '10mm'
    }; } }`;

    return () => {
      document.body.classList.remove('print-size-a4', 'print-size-a5');
    };
  }, [printPayload, paperSize]);

  const orderedSales = useMemo(
    () =>
      [...state.sales].sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (diff !== 0) return diff;
        return a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true });
      }),
    [state.sales]
  );

  if (!printPayload) return null;

  const currentSaleIndex =
    printPayload.kind === 'sale'
      ? orderedSales.findIndex((s) => s.id === printPayload.data.id)
      : -1;
  const prevSale = currentSaleIndex > 0 ? orderedSales[currentSaleIndex - 1] : null;
  const nextSale =
    currentSaleIndex >= 0 && currentSaleIndex < orderedSales.length - 1
      ? orderedSales[currentSaleIndex + 1]
      : null;

  const isA5 = paperSize === 'A5';

  const handleSaveDefaults = () => {
    updatePrintSettings({
      defaultPaperSize: paperSize,
      showHeader,
      showCustomerBalance: showBalance,
      showInstallmentTable: showInstallments,
      showExchangeRateDetails: showFxDetails,
      showSignatures,
    });
  };

  const canSeeCost = hasPermission('canEditCostPrices') || hasPermission('canViewProfitsAndFX');
  const canSeeFx = hasPermission('canViewProfitsAndFX');

  const handleExportDocument = (format: 'excel' | 'csv' | 'json') => {
    if (printPayload.kind === 'sale') {
      const s = printPayload.data;
      if (format === 'json') {
        exportToJSON(`invoice-${s.invoiceNumber}.json`, s);
        return;
      }
      const headers = ['رقم الفاتورة', 'الزبون', 'الحالة', 'نوع البيع', 'عملة الفاتورة', 'الصنف', 'الباركود', 'الكمية', 'سعر الوحدة', 'الإجمالي'];
      const rows = s.items.map((it) => [
        s.invoiceNumber,
        s.customerName,
        s.status === 'cancelled' ? 'ملغاة' : 'فعالة',
        s.saleType === 'cash' ? 'نقدي' : s.saleType === 'installment' ? 'أقساط' : 'آجل',
        s.currency,
        `${it.brand} ${it.model} (${it.specs})`,
        it.sku || it.imei || '-',
        it.quantity,
        it.unitPrice,
        it.lineTotal,
      ]);
      if (format === 'excel') exportToExcel(`invoice-${s.invoiceNumber}.xlsx`, s.invoiceNumber, headers, rows);
      else exportToCSV(`invoice-${s.invoiceNumber}.csv`, headers, rows);
    } else if (printPayload.kind === 'purchase') {
      const p = printPayload.data;
      if (format === 'json') {
        exportToJSON(
          `purchase-${p.invoiceNumber}.json`,
          canSeeCost ? p : { ...p, items: p.items.map((it) => ({ ...it, unitCost: undefined, lineTotal: undefined })), subtotal: undefined, total: undefined }
        );
        return;
      }
      const headers = canSeeCost
        ? ['رقم الفاتورة', 'المورد', 'الحالة', 'النوع', 'العملة', 'الصنف', 'الكمية', 'التكلفة', 'الإجمالي']
        : ['رقم الفاتورة', 'المورد', 'الحالة', 'النوع', 'العملة', 'الصنف', 'الكمية'];
      const rows = p.items.map((it) =>
        canSeeCost
          ? [
              p.invoiceNumber,
              p.supplierName,
              p.status === 'cancelled' ? 'ملغاة' : 'فعالة',
              p.purchaseType === 'cash' ? 'نقدي' : p.purchaseType === 'opening_balance' ? 'رصيد افتتاحي' : 'آجل',
              p.currency,
              `${it.brand} ${it.model}`,
              it.quantity,
              it.unitCost,
              it.lineTotal,
            ]
          : [
              p.invoiceNumber,
              p.supplierName,
              p.status === 'cancelled' ? 'ملغاة' : 'فعالة',
              p.purchaseType === 'cash' ? 'نقدي' : p.purchaseType === 'opening_balance' ? 'رصيد افتتاحي' : 'آجل',
              p.currency,
              `${it.brand} ${it.model}`,
              it.quantity,
            ]
      );
      if (format === 'excel') exportToExcel(`purchase-${p.invoiceNumber}.xlsx`, p.invoiceNumber, headers, rows);
      else exportToCSV(`purchase-${p.invoiceNumber}.csv`, headers, rows);
    } else if (printPayload.kind === 'payment') {
      const t = printPayload.data;
      if (format === 'json') {
        exportToJSON(`voucher-${t.voucherNumber}.json`, t);
        return;
      }
      const bal =
        t.partyType === 'customer'
          ? getCustomerBalances(t.partyId)
          : getSupplierBalances(t.partyId);
      const linkedInv =
        t.partyType === 'customer'
          ? state.sales.find((s) => s.id === t.invoiceId)
          : state.purchases.find((p) => p.id === t.invoiceId);
      const headers = [
        'رقم السند',
        'الجهة',
        'النوع',
        'الحالة',
        'رقم الفاتورة',
        'عملة الفاتورة',
        'مدفوع دولار',
        'مدفوع دينار',
        'المسدد بعملة الفاتورة',
        'المتبقي من الفاتورة',
        'إجمالي المتبقي ($)',
        'إجمالي المتبقي (د.ع)',
        ...(canSeeFx ? ['فرق الصرف (د.ع)'] : []),
      ];
      const rows = [[
        t.voucherNumber,
        t.partyName,
        t.isReversal ? 'سند عكسي' : t.partyType === 'customer' ? 'قبض زبون' : 'تسديد مورد',
        t.status === 'cancelled' ? 'ملغى' : 'فعال',
        t.invoiceNumber || '-',
        t.invoiceCurrency,
        t.paidUSD,
        t.paidIQD,
        t.settledInInvoiceCurrency,
        linkedInv ? linkedInv.remainingAmount : 0,
        bal.usd,
        bal.iqd,
        ...(canSeeFx ? [t.fxDiffIQD] : []),
      ]];
      if (format === 'excel') exportToExcel(`voucher-${t.voucherNumber}.xlsx`, t.voucherNumber, headers, rows);
      else exportToCSV(`voucher-${t.voucherNumber}.csv`, headers, rows);
    } else {
      if (format === 'json') {
        exportToJSON(`${printPayload.title}.json`, printPayload.rawData);
      } else if (format === 'excel') {
        exportToExcel(`${printPayload.title}.xlsx`, 'تقرير', printPayload.columns, printPayload.rows);
      } else {
        exportToCSV(`${printPayload.title}.csv`, printPayload.columns, printPayload.rows);
      }
    }
  };

  const saleTypeArabic = (type: SaleInvoice['saleType']) =>
    type === 'cash' ? 'بيع نقدي' : type === 'installment' ? 'بيع بالأقساط' : 'بيع بالآجل';

  return (
    <>
      <div className="space-y-4 no-print">
        {/* Top Page Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={closePrintPreview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 whitespace-nowrap"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>رجوع للصفحة السابقة</span>
            </button>

            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-700" />
              <span className="text-sm font-bold text-slate-900">التحكم بالطباعة والمعاينة</span>
            </div>

            {printPayload.kind === 'sale' && (
              <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => prevSale && openPrintPreview({ kind: 'sale', data: prevSale })}
                  disabled={!prevSale}
                  title="الفاتورة السابقة"
                  aria-label="الفاتورة السابقة"
                  className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="px-2.5 text-xs font-num font-bold text-slate-900 whitespace-nowrap">
                  {printPayload.data.invoiceNumber}
                </span>
                <button
                  type="button"
                  onClick={() => nextSale && openPrintPreview({ kind: 'sale', data: nextSale })}
                  disabled={!nextSale}
                  title="الفاتورة التالية"
                  aria-label="الفاتورة التالية"
                  className="w-7 h-7 inline-flex items-center justify-center rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setPaperSize('A4')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  paperSize === 'A4'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ورق A4 (كامل)
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('A5')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  paperSize === 'A5'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ورق A5 (نصف صفحة)
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExportDocument('excel')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportDocument('csv')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <FileText className="w-3.5 h-3.5 text-blue-700" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportDocument('json')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Braces className="w-3.5 h-3.5 text-slate-700" />
              <span>JSON</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md bg-blue-700 text-white hover:bg-blue-800"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة ({paperSize})</span>
            </button>
          </div>
        </div>

        {/* Display Checkboxes Bar */}
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={showHeader}
                onChange={(e) => setShowHeader(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              <span>ترويسة المتجر</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={showBalance}
                onChange={(e) => setShowBalance(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              <span>إظهار الرصيد المتبقي</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={showInstallments}
                onChange={(e) => setShowInstallments(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              <span>جدول الأقساط</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={showFxDetails}
                onChange={(e) => setShowFxDetails(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              <span>تفاصيل سعر الصرف</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={showSignatures}
                onChange={(e) => setShowSignatures(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              <span>التواقيع والختم</span>
            </label>
          </div>
          {hasPermission('canManagePrintSettings') && (
            <button
              type="button"
              onClick={handleSaveDefaults}
              className="text-blue-700 hover:underline font-medium"
            >
              اعتماد كإعدادات افتراضية
            </button>
          )}
        </div>

        {/* Full-Page Printable Sheet Preview */}
        <div className="bg-slate-200/70 border border-slate-200 rounded-xl p-6 flex justify-center overflow-x-auto">
          <div
            className={`bg-white border border-slate-300 text-slate-900 shadow-sm ${
              isA5 ? 'w-[148mm] min-h-[200mm] p-5 text-[11px]' : 'w-[210mm] min-h-[280mm] p-8 text-xs'
            }`}
          >
            <PrintableDocumentContent
              payload={printPayload}
              paperSize={paperSize}
              showHeader={showHeader}
              showBalance={showBalance}
              showInstallments={showInstallments}
              showFxDetails={showFxDetails}
              showSignatures={showSignatures}
              saleTypeArabic={saleTypeArabic}
            />
          </div>
        </div>
      </div>

      {/* Print-Only Output Root */}
      <div className="hidden print-only-root bg-white text-slate-900">
        <PrintableDocumentContent
          payload={printPayload}
          paperSize={paperSize}
          showHeader={showHeader}
          showBalance={showBalance}
          showInstallments={showInstallments}
          showFxDetails={showFxDetails}
          showSignatures={showSignatures}
          saleTypeArabic={saleTypeArabic}
        />
      </div>
    </>
  );
}

function PrintableDocumentContent({
  payload,
  paperSize,
  showHeader,
  showBalance,
  showInstallments,
  showFxDetails,
  showSignatures,
  saleTypeArabic,
}: {
  payload: PrintablePayload;
  paperSize: PaperSize;
  showHeader: boolean;
  showBalance: boolean;
  showInstallments: boolean;
  showFxDetails: boolean;
  showSignatures: boolean;
  saleTypeArabic: (t: SaleInvoice['saleType']) => string;
}) {
  const { state, getCustomerBalances, getSupplierBalances, hasPermission } = useERP();
  const isA5 = paperSize === 'A5';
  const ps = state.printSettings;
  const canSeeCost = hasPermission('canEditCostPrices') || hasPermission('canViewProfitsAndFX');
  const canSeeFx = hasPermission('canViewProfitsAndFX');

  return (
    <div className={isA5 ? 'space-y-3 text-[11px]' : 'space-y-5 text-xs'} dir="rtl">
      {showHeader && (
        <header className="border-b border-slate-300 pb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className={`${isA5 ? 'text-base' : 'text-xl'} font-bold text-slate-900`}>
              {ps.storeName}
            </h2>
            <p className="text-slate-600 mt-0.5">{ps.storeTagline}</p>
          </div>
          <div className="text-left text-slate-600 space-y-0.5 shrink-0">
            <div>{ps.address}</div>
            <div className="font-num">{ps.phone}</div>
            <div>مقاس الطباعة: {paperSize}</div>
          </div>
        </header>
      )}

      {payload.kind === 'sale' && (() => {
        const s = state.sales.find((x) => x.id === payload.data.id) || payload.data;
        const currLabel = s.currency === 'USD' ? 'دولار أمريكي (USD)' : 'دينار عراقي (IQD)';
        const custBal = getCustomerBalances(s.customerId);
        return (
          <div className="space-y-4">
            {s.status === 'cancelled' && (
              <div className="border-2 border-red-600 bg-red-50 text-red-900 rounded-md p-3 space-y-0.5">
                <div className="font-extrabold text-sm">تنبيه: هذه الفاتورة ملغاة</div>
                {s.cancellationReason && (
                  <div>سبب الإلغاء: <strong>{s.cancellationReason}</strong></div>
                )}
                {s.cancelledBy && (
                  <div className="text-[11px] text-red-800">
                    تم الإلغاء بواسطة: {s.cancelledBy}
                    {s.cancelledAt ? ` · ${new Date(s.cancelledAt).toLocaleString('ar-IQ')}` : ''}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-md p-3">
              <div className="space-y-1">
                <div className="font-bold text-sm">
                  فاتورة مبيعات رقم <span className="font-num">{s.invoiceNumber}</span>
                </div>
                <div className="text-slate-600">
                  الزبون: <strong className="text-slate-900">{s.customerName}</strong>
                </div>
              </div>
              <div className="text-left space-y-1">
                <div>
                  نوع البيع: <strong>{saleTypeArabic(s.saleType)}</strong> · عملة الفاتورة:{' '}
                  <strong>{currLabel}</strong>
                </div>
                <div className="text-slate-600">
                  التاريخ: <span className="font-num">{new Date(s.date).toLocaleString('ar-IQ')}</span>
                </div>
              </div>
            </div>

            {showFxDetails && (
              <div className="text-slate-600 border border-slate-200 rounded px-3 py-1.5 flex items-center justify-between">
                <span>سعر الصرف المثبت بالفاتورة: {formatRatePer100(s.exchangeRateAtSale)}</span>
                <span>المحرر: {s.createdBy}</span>
              </div>
            )}

            <table className="w-full border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-300 p-2 text-right">#</th>
                  <th className="border border-slate-300 p-2 text-right">المنتج والمواصفات</th>
                  <th className="border border-slate-300 p-2 text-right">الباركود</th>
                  <th className="border border-slate-300 p-2 text-center">الكمية</th>
                  <th className="border border-slate-300 p-2 text-left">سعر الوحدة</th>
                  <th className="border border-slate-300 p-2 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, idx) => (
                  <tr key={`${it.itemId}-${idx}`}>
                    <td className="border border-slate-300 p-2 font-num">{idx + 1}</td>
                    <td className="border border-slate-300 p-2">
                      <div className="font-semibold">{it.brand} {it.model}</div>
                      <div className="text-slate-500">{it.specs}</div>
                    </td>
                    <td className="border border-slate-300 p-2 font-num">{it.sku || it.imei || '-'}</td>
                    <td className="border border-slate-300 p-2 text-center font-num">{it.quantity}</td>
                    <td className="border border-slate-300 p-2 text-left font-num">
                      {formatCurrency(it.unitPrice, s.currency)}
                    </td>
                    <td className="border border-slate-300 p-2 text-left font-num font-semibold">
                      {formatCurrency(it.lineTotal, s.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-3 border border-slate-200 rounded-md p-3 bg-slate-50">
              <div className="space-y-1">
                <div>المجموع الفرعي: <span className="font-num font-semibold">{formatCurrency(s.subtotal, s.currency)}</span></div>
                <div>الخصم: <span className="font-num">{formatCurrency(s.discount, s.currency)}</span></div>
                <div className="text-sm font-bold">
                  صافي الفاتورة ({s.currency}):{' '}
                  <span className="font-num">{formatCurrency(s.total, s.currency)}</span>
                </div>
              </div>
              {showBalance && (
                <div className="space-y-1 text-left">
                  <div>
                    المدفوع / المقدمة:{' '}
                    <span className="font-num font-semibold text-emerald-700">
                      {formatCurrency(s.paidTotal, s.currency)}
                    </span>
                  </div>
                  {(s.downPaymentUSD > 0 || s.downPaymentIQD > 0) && (
                    <div className="text-slate-600">
                      تفصيل الدفعة الأولى: {s.downPaymentUSD > 0 ? formatUSD(s.downPaymentUSD) : ''}{' '}
                      {s.downPaymentUSD > 0 && s.downPaymentIQD > 0 ? '+ ' : ''}
                      {s.downPaymentIQD > 0 ? formatIQD(s.downPaymentIQD) : ''}
                    </div>
                  )}
                  <div className="text-sm font-bold">
                    المتبقي من الفاتورة:{' '}
                    <span className="font-num text-red-700">
                      {formatCurrency(s.remainingAmount, s.currency)}
                    </span>
                  </div>
                  {(custBal.usd > 0 || custBal.iqd > 0) && (
                    <div className="text-[11px] text-slate-700 pt-0.5">
                      إجمالي الرصيد المتبقي بذمة الزبون:{' '}
                      <span className="font-num font-bold text-red-700">
                        {custBal.usd > 0 ? formatUSD(custBal.usd) : ''}
                        {custBal.usd > 0 && custBal.iqd > 0 ? ' + ' : ''}
                        {custBal.iqd > 0 ? formatIQD(custBal.iqd) : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {showInstallments && s.installments.length > 0 && (
              <div>
                <div className="font-bold mb-1.5">جدول الأقساط الشهرية ({s.installments.length} قسط)</div>
                <table className="w-full border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 p-1.5 text-center">القسط</th>
                      <th className="border border-slate-300 p-1.5 text-right">تاريخ الاستحقاق</th>
                      <th className="border border-slate-300 p-1.5 text-left">المبلغ</th>
                      <th className="border border-slate-300 p-1.5 text-left">المدفوع</th>
                      <th className="border border-slate-300 p-1.5 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.installments.map((inst) => (
                      <tr key={inst.id}>
                        <td className="border border-slate-300 p-1.5 text-center font-num">{inst.index}</td>
                        <td className="border border-slate-300 p-1.5 font-num">{inst.dueDate}</td>
                        <td className="border border-slate-300 p-1.5 text-left font-num">
                          {formatCurrency(inst.amount, s.currency)}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-left font-num">
                          {formatCurrency(inst.paidAmount, s.currency)}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center">
                          {inst.status === 'paid' ? 'مسدد' : inst.status === 'partial' ? 'جزئي' : 'مستحق'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {payload.kind === 'purchase' && (() => {
        const p = state.purchases.find((x) => x.id === payload.data.id) || payload.data;
        const supBal = getSupplierBalances(p.supplierId);
        return (
          <div className="space-y-4">
            {p.status === 'cancelled' && (
              <div className="border-2 border-red-600 bg-red-50 text-red-900 rounded-md p-3 space-y-0.5">
                <div className="font-extrabold text-sm">تنبيه: فاتورة الشراء هذه ملغاة</div>
                {p.cancellationReason && (
                  <div>سبب الإلغاء: <strong>{p.cancellationReason}</strong></div>
                )}
                {p.cancelledBy && (
                  <div className="text-[11px] text-red-800">
                    تم الإلغاء بواسطة: {p.cancelledBy}
                    {p.cancelledAt ? ` · ${new Date(p.cancelledAt).toLocaleString('ar-IQ')}` : ''}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-md p-3">
              <div>
                <div className="font-bold text-sm">
                  فاتورة مشتريات مورد رقم <span className="font-num">{p.invoiceNumber}</span>
                </div>
                <div>المورد: <strong>{p.supplierName}</strong></div>
              </div>
              <div className="text-left">
                <div>
                  العملة: <strong>{p.currency}</strong> · النوع:{' '}
                  {p.purchaseType === 'cash'
                    ? 'نقدي'
                    : p.purchaseType === 'opening_balance'
                    ? 'رصيد افتتاحي'
                    : 'آجل'}
                </div>
                <div className="font-num text-slate-600">{new Date(p.date).toLocaleString('ar-IQ')}</div>
              </div>
            </div>

            {showFxDetails && (
              <div className="text-slate-600 border border-slate-200 rounded px-3 py-1.5 flex items-center justify-between">
                <span>سعر الصرف المثبت بالفاتورة: {formatRatePer100(p.exchangeRateAtPurchase)}</span>
                <span>المحرر: {p.createdBy}</span>
              </div>
            )}

            <table className="w-full border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-2 text-right">الباركود</th>
                  <th className="border border-slate-300 p-2 text-right">الصنف</th>
                  <th className="border border-slate-300 p-2 text-center">الكمية</th>
                  {canSeeCost && <th className="border border-slate-300 p-2 text-left">تكلفة الوحدة</th>}
                  {canSeeCost && <th className="border border-slate-300 p-2 text-left">الإجمالي</th>}
                </tr>
              </thead>
              <tbody>
                {p.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="border border-slate-300 p-2 font-num">{it.sku || '-'}</td>
                    <td className="border border-slate-300 p-2">{it.brand} {it.model} ({it.specs})</td>
                    <td className="border border-slate-300 p-2 text-center font-num">{it.quantity}</td>
                    {canSeeCost && (
                      <td className="border border-slate-300 p-2 text-left font-num">{formatCurrency(it.unitCost, p.currency)}</td>
                    )}
                    {canSeeCost && (
                      <td className="border border-slate-300 p-2 text-left font-num">{formatCurrency(it.lineTotal, p.currency)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {showBalance && canSeeCost && (
              <div className="border border-slate-200 rounded p-3 bg-slate-50 space-y-1.5">
                <div className="flex flex-wrap justify-between gap-2 font-semibold">
                  {typeof p.discount === 'number' && p.discount > 0 && (
                    <span>الخصم: <span className="font-num">{formatCurrency(p.discount, p.currency)}</span></span>
                  )}
                  <span>الإجمالي الصافي: <span className="font-num">{formatCurrency(p.total, p.currency)}</span></span>
                  <span>المدفوع: <span className="font-num text-emerald-700">{formatCurrency(p.paidTotal, p.currency)}</span></span>
                  <span>المتبقي للمورد: <span className="font-num text-red-700">{formatCurrency(p.remainingAmount, p.currency)}</span></span>
                </div>
                {(supBal.usd > 0 || supBal.iqd > 0) && (
                  <div className="text-[11px] text-slate-700">
                    إجمالي الرصيد المتبقي للمورد:{' '}
                    <span className="font-num font-bold text-red-700">
                      {supBal.usd > 0 ? formatUSD(supBal.usd) : ''}
                      {supBal.usd > 0 && supBal.iqd > 0 ? ' + ' : ''}
                      {supBal.iqd > 0 ? formatIQD(supBal.iqd) : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {payload.kind === 'payment' && (() => {
        const t = state.payments.find((x) => x.id === payload.data.id) || payload.data;
        const linkedSale =
          t.partyType === 'customer' && t.invoiceId
            ? state.sales.find((s) => s.id === t.invoiceId)
            : undefined;
        const linkedPurchase =
          t.partyType === 'supplier' && t.invoiceId
            ? state.purchases.find((p) => p.id === t.invoiceId)
            : undefined;
        const linkedInvoice = linkedSale || linkedPurchase;
        const partyBalances =
          t.partyType === 'customer'
            ? getCustomerBalances(t.partyId)
            : getSupplierBalances(t.partyId);

        return (
          <div className="space-y-4">
            {t.status === 'cancelled' && (
              <div className="border-2 border-red-600 bg-red-50 text-red-900 rounded-md p-3 space-y-0.5">
                <div className="font-extrabold text-sm">تنبيه: هذا السند ملغى</div>
                {t.cancellationReason && (
                  <div>سبب الإلغاء: <strong>{t.cancellationReason}</strong></div>
                )}
                {t.cancelledBy && (
                  <div className="text-[11px] text-red-800">
                    تم الإلغاء بواسطة: {t.cancelledBy}
                    {t.cancelledAt ? ` · ${new Date(t.cancelledAt).toLocaleString('ar-IQ')}` : ''}
                  </div>
                )}
              </div>
            )}

            {t.isReversal && (
              <div className="border-2 border-amber-500 bg-amber-50 text-amber-900 rounded-md p-3 space-y-0.5">
                <div className="font-extrabold text-sm">سند قيد عكسي (إلغاء عملية سابقة)</div>
                {t.notes && <div className="text-[11px]">{t.notes}</div>}
              </div>
            )}

            <div className="border border-slate-300 rounded-md p-4 bg-slate-50 flex justify-between">
              <div>
                <div className="font-bold text-sm">
                  {t.partyType === 'customer' ? 'سند قبض مالي (زبون)' : 'سند تسديد مالي (مورد)'} ·{' '}
                  <span className="font-num">{t.voucherNumber}</span>
                </div>
                <div className="mt-1">الاسم: <strong>{t.partyName}</strong></div>
                {t.invoiceNumber && (
                  <div>
                    عن الفاتورة: <strong className="font-num">{t.invoiceNumber}</strong> ({t.invoiceCurrency})
                  </div>
                )}
              </div>
              <div className="text-left space-y-1">
                <div className="font-num text-slate-600">{new Date(t.date).toLocaleString('ar-IQ')}</div>
                <div>بواسطة: {t.createdBy}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border border-slate-300 rounded-md p-4">
              <div>
                <div className="text-slate-500">المبلغ المدفوع فعلياً</div>
                <div className="font-bold text-sm mt-1 space-y-0.5 text-emerald-700">
                  {t.paidUSD !== 0 && <div className="font-num">{formatUSD(t.paidUSD)}</div>}
                  {t.paidIQD !== 0 && <div className="font-num">{formatIQD(t.paidIQD)}</div>}
                </div>
                <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                  {t.paidUSD > 0 && <div>• {amountToArabicTafqeet(t.paidUSD, 'USD')}</div>}
                  {t.paidIQD > 0 && <div>• {amountToArabicTafqeet(t.paidIQD, 'IQD')}</div>}
                </div>
              </div>
              <div className="text-left">
                <div className="text-slate-500">المبلغ المحتسب تسديده من أصل الفاتورة</div>
                <div className="font-bold text-sm mt-1 font-num text-slate-900">
                  {formatCurrency(t.settledInInvoiceCurrency, t.invoiceCurrency)}
                </div>
              </div>
            </div>

            <div className="border-2 border-slate-300 rounded-md p-4 bg-slate-50 space-y-2.5">
              {linkedInvoice && (
                <div className="grid grid-cols-3 gap-3 pb-2.5 border-b border-slate-200">
                  <div>
                    <div className="text-slate-500">إجمالي الفاتورة ({linkedInvoice.invoiceNumber})</div>
                    <div className="font-num font-bold text-slate-900 mt-0.5">
                      {formatCurrency(linkedInvoice.total, linkedInvoice.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">إجمالي المدفوع للفاتورة</div>
                    <div className="font-num font-bold text-emerald-700 mt-0.5">
                      {formatCurrency(linkedInvoice.paidTotal, linkedInvoice.currency)}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-slate-700 font-bold">المبلغ المتبقي من الفاتورة</div>
                    <div
                      className={`font-num font-extrabold text-sm mt-0.5 ${
                        linkedInvoice.remainingAmount > 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(linkedInvoice.remainingAmount, linkedInvoice.currency)}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-900">
                  {t.partyType === 'customer'
                    ? 'إجمالي المبلغ المتبقي بذمة الزبون بعد التسديد:'
                    : 'إجمالي المبلغ المتبقي للمورد بعد التسديد:'}
                </div>
                <div className="font-num font-extrabold text-sm text-left">
                  {partyBalances.usd === 0 && partyBalances.iqd === 0 ? (
                    <span className="text-emerald-700 font-sans">خالص — لا توجد ذمم متبقية (0)</span>
                  ) : (
                    <span className="text-red-700">
                      {partyBalances.usd > 0 ? formatUSD(partyBalances.usd) : ''}
                      {partyBalances.usd > 0 && partyBalances.iqd > 0 ? ' + ' : ''}
                      {partyBalances.iqd > 0 ? formatIQD(partyBalances.iqd) : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {showFxDetails && (
              <div className="border border-slate-200 rounded p-3 space-y-1 text-slate-700">
                <div>سعر صرف الفاتورة: {formatRatePer100(t.invoiceExchangeRate)} · سعر صرف السند: {formatRatePer100(t.paymentExchangeRate)}</div>
                {canSeeFx && (
                  <div>
                    فرق سعر الصرف:{' '}
                    <strong className="font-num">
                      {t.fxDiffIQD >= 0 ? '+' : ''}{formatIQD(t.fxDiffIQD)} ({t.fxDiffIQD >= 0 ? 'ربح صرف' : 'خسارة صرف'})
                    </strong>
                  </div>
                )}
                {t.notes && <div>ملاحظات: {t.notes}</div>}
              </div>
            )}
          </div>
        );
      })()}

      {payload.kind === 'statement' && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 flex justify-between items-center">
            <div>
              <div className="font-bold text-sm">{payload.title}</div>
              <div className="text-slate-600">{payload.subtitle}</div>
            </div>
            <div className="font-num text-slate-600">{new Date().toLocaleDateString('ar-IQ')}</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {payload.summaryLines.map((item, i) => (
              <div key={i} className="border border-slate-200 rounded p-2">
                <div className="text-slate-500">{item.label}</div>
                <div className="font-bold font-num mt-0.5">{item.value}</div>
              </div>
            ))}
          </div>

          <table className="w-full border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100">
                {payload.columns.map((col, idx) => (
                  <th key={idx} className="border border-slate-300 p-1.5 text-right">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payload.rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="border border-slate-300 p-1.5">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showSignatures && (
        <div className="pt-6 mt-6 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-slate-600">
          <div>
            <div>توقيع المستلم / الزبون</div>
            <div className="mt-8 border-b border-dashed border-slate-400 w-40 mx-auto" />
          </div>
          <div>
            <div>ختم وتوقيع الإدارة</div>
            <div className="mt-8 border-b border-dashed border-slate-400 w-40 mx-auto" />
          </div>
        </div>
      )}

      {ps.footerNote && (
        <div className="pt-3 border-t border-slate-200 text-center text-slate-500">
          {ps.footerNote}
        </div>
      )}
    </div>
  );
}
