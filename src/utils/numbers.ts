import { CurrencyCode } from '../types/erp';

const ARABIC_INDIC_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '٫': '.',
  '٬': ',',
};

/**
 * Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to Latin (0-9).
 */
export function normalizeArabicDigits(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[٠-٩۰-۹٫٬]/g, (ch) => ARABIC_INDIC_MAP[ch] ?? ch);
}

/**
 * Normalizes numeric text input from Arabic/English keyboards while keeping a clean editable string.
 */
export function sanitizeNumericInput(raw: string, allowDecimal = true): string {
  const normalized = normalizeArabicDigits(raw).replace(/,/g, '');
  let cleaned = '';
  let hasDot = false;
  for (const ch of normalized) {
    if (ch >= '0' && ch <= '9') {
      cleaned += ch;
    } else if (allowDecimal && ch === '.' && !hasDot) {
      cleaned += '.';
      hasDot = true;
    }
  }
  return cleaned;
}

/**
 * Parses Arabic/English numeric strings (with optional thousand separators) into a finite number, or 0 if invalid.
 */
export function parseLocaleNumber(val: string | number | undefined | null): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const normalized = normalizeArabicDigits(String(val)).replace(/[,\s]/g, '').trim();
  if (!normalized || normalized === '.') return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Strict parser returning null when empty or non-numeric, useful for mandatory numeric validation.
 */
export function tryParseLocaleNumber(val: string | number | undefined | null): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (val === undefined || val === null) return null;
  const normalized = normalizeArabicDigits(String(val)).replace(/[,\s]/g, '').trim();
  if (!normalized || normalized === '.') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Sanitizes barcode input: converts Arabic digits to Latin and strips whitespace/unexpected control characters.
 */
export function sanitizeBarcode(raw: string): string {
  if (!raw) return '';
  const normalized = normalizeArabicDigits(raw).trim();
  return normalized.replace(/[^A-Za-z0-9\-_./]/g, '');
}

/**
 * Formats numbers with thousand separators according to currency precision (IQD: 0 decimals, USD: 2 decimals).
 */
export function formatAmountNumber(amount: number, currency: CurrencyCode): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (currency === 'IQD') {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(Math.round(safe));
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * Formats integer/quantity values with thousand separators.
 */
export function formatQtyNumber(qty: number): string {
  const safe = Number.isFinite(qty) ? qty : 0;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(safe);
}
