import { CurrencyCode } from '../types/erp';

const ONES = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const TENS = [
  '',
  '',
  'عشرون',
  'ثلاثون',
  'أربعون',
  'خمسون',
  'ستون',
  'سبعون',
  'ثمانون',
  'تسعون',
];

const HUNDREDS = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];

function convertThreeDigits(num: number): string {
  if (num === 0) return '';
  const parts: string[] = [];
  const h = Math.floor(num / 100);
  const rem = num % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rem > 0) {
    if (rem < 20) {
      parts.push(ONES[rem]);
    } else {
      const u = rem % 10;
      const t = Math.floor(rem / 10);
      if (u > 0) parts.push(`${ONES[u]} و${TENS[t]}`);
      else parts.push(TENS[t]);
    }
  }
  return parts.join(' و');
}

function integerToArabicWords(n: number): string {
  const num = Math.floor(Math.abs(n));
  if (num === 0) return 'صفر';

  const billions = Math.floor(num / 1_000_000_000);
  const millions = Math.floor((num % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((num % 1_000_000) / 1000);
  const rest = num % 1000;

  const chunks: string[] = [];

  if (billions > 0) {
    if (billions === 1) chunks.push('مليار');
    else if (billions === 2) chunks.push('ملياران');
    else if (billions >= 3 && billions <= 10) chunks.push(`${convertThreeDigits(billions)} مليارات`);
    else chunks.push(`${convertThreeDigits(billions)} مليار`);
  }

  if (millions > 0) {
    if (millions === 1) chunks.push('مليون');
    else if (millions === 2) chunks.push('مليونان');
    else if (millions >= 3 && millions <= 10) chunks.push(`${convertThreeDigits(millions)} ملايين`);
    else chunks.push(`${convertThreeDigits(millions)} مليون`);
  }

  if (thousands > 0) {
    if (thousands === 1) chunks.push('ألف');
    else if (thousands === 2) chunks.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) chunks.push(`${convertThreeDigits(thousands)} آلاف`);
    else chunks.push(`${convertThreeDigits(thousands)} ألف`);
  }

  if (rest > 0) {
    chunks.push(convertThreeDigits(rest));
  }

  return chunks.join(' و');
}

export function amountToArabicTafqeet(amount: number, currency: CurrencyCode): string {
  const clean = Math.max(0, amount);
  const intPart = Math.floor(clean);
  const decPart = Math.round((clean - intPart) * 100);

  const unitLabel = currency === 'USD' ? 'دولار أمريكي' : 'دينار عراقي';
  const mainWords = integerToArabicWords(intPart);

  if (currency === 'USD' && decPart > 0) {
    const centWords = integerToArabicWords(decPart);
    return `فقط ${mainWords} ${unitLabel} و${centWords} سنت لا غير`;
  }

  return `فقط ${mainWords} ${unitLabel} لا غير`;
}
