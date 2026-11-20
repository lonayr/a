import { FileSpreadsheet, FileText, Braces, Printer } from 'lucide-react';
import { useERP } from '../context/ERPContext';

interface ExportBarProps {
  onExcel: () => void;
  onCSV: () => void;
  onJSON: () => void;
  onPrint?: () => void;
  compact?: boolean;
}

export function ExportBar({ onExcel, onCSV, onJSON, onPrint, compact = false }: ExportBarProps) {
  const { hasPermission } = useERP();
  if (!hasPermission('canExportData')) return null;

  const btnCls = compact
    ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0'
    : 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onExcel} className={btnCls} title="تصدير ملف Excel">
        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
        <span>Excel</span>
      </button>
      <button type="button" onClick={onCSV} className={btnCls} title="تصدير ملف CSV">
        <FileText className="w-3.5 h-3.5 text-blue-700" />
        <span>CSV</span>
      </button>
      <button type="button" onClick={onJSON} className={btnCls} title="تصدير بيانات JSON">
        <Braces className="w-3.5 h-3.5 text-slate-700" />
        <span>JSON</span>
      </button>
      {onPrint && (
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          title="معاينة وطباعة PDF (A4 / A5)"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>طباعة / PDF</span>
        </button>
      )}
    </div>
  );
}
