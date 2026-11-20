import * as XLSX from 'xlsx';
import { ERPState } from '../types/erp';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportToExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
  const safeRows = rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? '' : cell))
  );
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...safeRows]);
  worksheet['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...safeRows.map((r) => String(r[i] ?? '').length)
    );
    return { wch: Math.min(42, Math.max(12, maxLen + 4)) };
  });

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  triggerDownload(blob, safeName);
}

export function exportToCSV(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
) {
  const escapeCell = (val: string | number | boolean | null | undefined) => {
    const str = String(val ?? '');
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvLines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ];
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  triggerDownload(blob, safeName);
}

export function exportToJSON(filename: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const safeName = filename.endsWith('.json') ? filename : `${filename}.json`;
  triggerDownload(blob, safeName);
}

export function exportFullBackupJSON(state: ERPState) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  exportToJSON(`mobile-pro-backup-${stamp}.json`, {
    backupType: 'MOBILE_PRO_FULL_BACKUP',
    exportedAt: new Date().toISOString(),
    data: state,
  });
}

export function parseAndValidateBackupJSON(rawText: string): {
  ok: boolean;
  state?: ERPState;
  error?: string;
} {
  try {
    const parsed = JSON.parse(rawText);
    const candidate: ERPState | undefined =
      parsed && parsed.backupType === 'MOBILE_PRO_FULL_BACKUP' && parsed.data
        ? parsed.data
        : parsed;

    if (!candidate || typeof candidate !== 'object') {
      return { ok: false, error: 'صيغة ملف JSON غير صالحة.' };
    }
    const requiredArrays: (keyof ERPState)[] = [
      'users',
      'inventory',
      'customers',
      'suppliers',
      'sales',
      'purchases',
      'payments',
      'exchangeLogs',
    ];
    for (const key of requiredArrays) {
      if (!Array.isArray(candidate[key])) {
        return { ok: false, error: `الحقل المطلوب مفقود أو تالف: ${String(key)}` };
      }
    }
    if (typeof candidate.activeExchangeRate !== 'number' || candidate.activeExchangeRate <= 0) {
      return { ok: false, error: 'سعر الصرف الأساسي غير صالح داخل النسخة الاحتياطية.' };
    }
    if (!candidate.printSettings || typeof candidate.printSettings !== 'object') {
      return { ok: false, error: 'إعدادات الطباعة مفقودة في النسخة الاحتياطية.' };
    }
    return { ok: true, state: candidate };
  } catch {
    return { ok: false, error: 'تعذر قراءة ملف JSON. يرجى التأكد من سلامة الملف.' };
  }
}
