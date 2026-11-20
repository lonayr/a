import { CurrencyCode, DisplayCurrencyMode } from '../types/erp';

export function formatUSD(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatIQD(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(safe)} د.ع`;
}

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  return currency === 'USD' ? formatUSD(amount) : formatIQD(amount);
}

export function formatRatePer100(ratePer1USD: number): string {
  const safe = Number.isFinite(ratePer1USD) ? Math.round(ratePer1USD * 100) : 150000;
  return `${new Intl.NumberFormat('en-US').format(safe)} د.ع / 100$`;
}

export function convertAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rateIQDPerUSD: number
): number {
  const safeRate = rateIQDPerUSD > 0 ? rateIQDPerUSD : 1500;
  if (from === to) return amount;
  if (from === 'USD' && to === 'IQD') {
    return Math.round(amount * safeRate);
  }
  return Number((amount / safeRate).toFixed(2));
}

export function formatInDisplayMode(
  amount: number,
  originalCurrency: CurrencyCode,
  displayMode: DisplayCurrencyMode,
  activeRate: number
): { primary: string; secondary?: string; effectiveCurrency: CurrencyCode } {
  if (displayMode === 'ORIGINAL') {
    return {
      primary: formatCurrency(amount, originalCurrency),
      effectiveCurrency: originalCurrency,
    };
  }
  if (displayMode === originalCurrency) {
    return {
      primary: formatCurrency(amount, originalCurrency),
      effectiveCurrency: originalCurrency,
    };
  }
  const converted = convertAmount(amount, originalCurrency, displayMode, activeRate);
  return {
    primary: formatCurrency(converted, displayMode),
    secondary: `الأصل: ${formatCurrency(amount, originalCurrency)}`,
    effectiveCurrency: displayMode,
  };
}

export interface FXCalculationInput {
  partyType: 'customer' | 'supplier';
  invoiceCurrency: CurrencyCode;
  invoiceExchangeRate: number;
  paymentExchangeRate: number;
  paidUSD: number;
  paidIQD: number;
  manualSettledAmount?: number | null;
  manualFxDiffIQD?: number | null;
}

export interface FXCalculationResult {
  autoSettledInInvoiceCurrency: number;
  settledInInvoiceCurrency: number;
  fxDiffIQD: number;
  fxDiffUSD: number;
  isManualOverride: boolean;
  hasCurrencyConversion: boolean;
  explanation: string;
}

export function calculateSettlementFX(input: FXCalculationInput): FXCalculationResult {
  const invRate = input.invoiceExchangeRate > 0 ? input.invoiceExchangeRate : 1500;
  const payRate = input.paymentExchangeRate > 0 ? input.paymentExchangeRate : 1500;
  const paidUSD = Math.max(0, Number(input.paidUSD) || 0);
  const paidIQD = Math.max(0, Math.round(Number(input.paidIQD) || 0));

  let autoSettled = 0;
  let hasCurrencyConversion = false;

  if (input.invoiceCurrency === 'USD') {
    hasCurrencyConversion = paidIQD > 0;
    autoSettled = Number((paidUSD + paidIQD / payRate).toFixed(2));
  } else {
    hasCurrencyConversion = paidUSD > 0;
    autoSettled = Math.round(paidIQD + paidUSD * payRate);
  }

  const hasManualSettled =
    input.manualSettledAmount !== undefined &&
    input.manualSettledAmount !== null &&
    Number.isFinite(input.manualSettledAmount) &&
    input.manualSettledAmount >= 0;

  const settled = hasManualSettled
    ? input.invoiceCurrency === 'USD'
      ? Number(input.manualSettledAmount!.toFixed(2))
      : Math.round(input.manualSettledAmount!)
    : autoSettled;

  let rawFxDiffIQD = 0;
  let explanation = 'لا يوجد تحويل عملة؛ السداد بنفس عملة الفاتورة.';

  if (input.invoiceCurrency === 'USD' && paidIQD > 0) {
    const iqdPortionSettledUSD = Math.max(0, settled - paidUSD);
    const expectedIQDAtInvoiceRate = iqdPortionSettledUSD * invRate;
    const diffForReceipt = Math.round(paidIQD - expectedIQDAtInvoiceRate);
    rawFxDiffIQD = input.partyType === 'customer' ? diffForReceipt : -diffForReceipt;
    explanation = `المستلم بالدينار (${formatIQD(paidIQD)}) مقابل قيمة الجزء المسدد بسعر الفاتورة (${formatIQD(expectedIQDAtInvoiceRate)})`;
  } else if (input.invoiceCurrency === 'IQD' && paidUSD > 0) {
    const usdPortionSettledIQD = Math.max(0, settled - paidIQD);
    const valueAtTodayRate = paidUSD * payRate;
    const valueAtInvoiceRate = paidUSD * invRate;
    // If settled manually differs from today's market value, or today's rate differs from invoice rate
    const diffForReceipt = hasManualSettled
      ? Math.round(valueAtTodayRate - usdPortionSettledIQD)
      : Math.round(valueAtTodayRate - valueAtInvoiceRate);
    rawFxDiffIQD = input.partyType === 'customer' ? diffForReceipt : -diffForReceipt;
    explanation = `قيمة الدولار المدفوع بسعر اليوم (${formatIQD(valueAtTodayRate)}) مقارنة بالمرجع (${formatIQD(
      hasManualSettled ? usdPortionSettledIQD : valueAtInvoiceRate
    )})`;
  } else if (hasManualSettled && Math.abs(settled - autoSettled) > 0.01) {
    const delta = autoSettled - settled;
    const deltaIQD =
      input.invoiceCurrency === 'USD' ? Math.round(delta * payRate) : Math.round(delta);
    rawFxDiffIQD = input.partyType === 'customer' ? deltaIQD : -deltaIQD;
    explanation = 'فرق ناتج عن التعديل اليدوي لقيمة التسوية.';
  }

  const hasManualFx =
    input.manualFxDiffIQD !== undefined &&
    input.manualFxDiffIQD !== null &&
    Number.isFinite(input.manualFxDiffIQD);

  const fxDiffIQD = hasManualFx ? Math.round(input.manualFxDiffIQD!) : rawFxDiffIQD;
  const fxDiffUSD = Number((fxDiffIQD / payRate).toFixed(2));

  return {
    autoSettledInInvoiceCurrency: autoSettled,
    settledInInvoiceCurrency: settled,
    fxDiffIQD,
    fxDiffUSD,
    isManualOverride: hasManualSettled || hasManualFx,
    hasCurrencyConversion,
    explanation,
  };
}
