import { useMemo, useState } from 'react';
import { ClipboardList, Search, ShieldAlert } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { AuditEntityType } from '../types/erp';
import { ExportBar } from '../components/ExportBar';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';

const ENTITY_FILTERS: { id: 'all' | AuditEntityType; label: string }[] = [
  { id: 'all', label: 'كل السجلات' },
  { id: 'sale', label: 'المبيعات' },
  { id: 'purchase', label: 'المشتريات' },
  { id: 'inbox', label: 'صندوق الفواتير' },
  { id: 'payment', label: 'السندات والتسديد' },
  { id: 'inventory', label: 'المخزون' },
  { id: 'customer', label: 'الزبائن' },
  { id: 'supplier', label: 'الموردون' },
  { id: 'exchange', label: 'سعر الصرف' },
  { id: 'settings', label: 'الإعدادات' },
  { id: 'user', label: 'المستخدمون' },
  { id: 'system', label: 'النظام والنسخ' },
];

export function AuditLogView() {
  const { auditLogs, hasPermission, openPrintPreview } = useERP();
  const [entityFilter, setEntityFilter] = useState<'all' | AuditEntityType>('all');
  const [search, setSearch] = useState('');

  const canSeeCostAndProfits =
    hasPermission('canViewProfitsAndFX') || hasPermission('canEditCostPrices');

  const visibleLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLogs
      .filter((log) => {
        if (!canSeeCostAndProfits && (log.entityType === 'purchase' || log.entityType === 'inbox')) {
          return false;
        }
        if (entityFilter !== 'all' && log.entityType !== entityFilter) {
          return false;
        }
        if (!q) return true;
        return (
          log.userName.toLowerCase().includes(q) ||
          log.actionLabel.toLowerCase().includes(q) ||
          (log.reference || '').toLowerCase().includes(q) ||
          (log.reason || '').toLowerCase().includes(q) ||
          (log.beforeValue || '').toLowerCase().includes(q) ||
          (log.afterValue || '').toLowerCase().includes(q)
        );
      });
  }, [auditLogs, canSeeCostAndProfits, entityFilter, search]);

  const maskIfNeeded = (val?: string) => {
    if (!val) return '-';
    if (canSeeCostAndProfits) return val;
    if (val.includes('تكلفة') || val.includes('متوسط مرجّح') || val.includes('آخر سعر')) {
      return 'مخفي حسب الصلاحية';
    }
    return val;
  };

  const headers = [
    'التاريخ والوقت',
    'المستخدم',
    'العملية',
    'التصنيف',
    'المرجع',
    'القيمة قبل',
    'القيمة بعد',
    'السبب / الملاحظة',
  ];

  const rows = visibleLogs.map((l) => [
    new Date(l.date).toLocaleString('ar-IQ'),
    l.userName,
    l.actionLabel,
    ENTITY_FILTERS.find((f) => f.id === l.entityType)?.label || l.entityType,
    l.reference || '-',
    maskIfNeeded(l.beforeValue),
    maskIfNeeded(l.afterValue),
    l.reason || l.note || '-',
  ]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-5 h-5 text-slate-800" />
            <div>
              <h2 className="text-base font-bold text-slate-900">سجل التدقيق والمراقبة (Audit Log)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                توثيق زمني لكل عملية إنشاء أو تعديل أو إلغاء وسند عكسي مع القيمة قبل وبعد والسبب.
              </p>
            </div>
          </div>

          {hasPermission('canExportData') && (
            <ExportBar
              compact
              onExcel={() => exportToExcel('audit-log.xlsx', 'سجل_التدقيق', headers, rows)}
              onCSV={() => exportToCSV('audit-log.csv', headers, rows)}
              onJSON={() => exportToJSON('audit-log.json', visibleLogs)}
              onPrint={() =>
                openPrintPreview({
                  kind: 'statement',
                  title: 'تقرير سجل التدقيق والمراقبة',
                  subtitle: `إجمالي السجلات المعروضة: ${visibleLogs.length}`,
                  partyType: 'general',
                  columns: headers,
                  rows,
                  summaryLines: [
                    { label: 'عدد القيود في السجل', value: String(visibleLogs.length) },
                  ],
                  rawData: visibleLogs,
                })
              }
            />
          )}
        </div>

        {!canSeeCostAndProfits && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              يتم إخفاء تفاصيل أسعار الشراء والتكلفة في سجل التدقيق تلقائياً عن حساب الكاشير.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث باسم المستخدم، العملية، المرجع، أو سبب الإلغاء..."
              className="w-full pr-9 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {ENTITY_FILTERS.filter(
              (f) => canSeeCostAndProfits || (f.id !== 'purchase' && f.id !== 'inbox')
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setEntityFilter(f.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  entityFilter === f.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 text-right whitespace-nowrap">التاريخ والوقت</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">المستخدم</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">العملية</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">المرجع</th>
                <th className="py-3 px-4 text-right">القيمة قبل</th>
                <th className="py-3 px-4 text-right">القيمة بعد</th>
                <th className="py-3 px-4 text-right">السبب / الملاحظة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    لا توجد قيود تدقيق مطابقة حالياً. ستُسجل جميع العمليات المالية والإدارية هنا تلقائياً.
                  </td>
                </tr>
              ) : (
                visibleLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-4 font-num text-slate-600 whitespace-nowrap">
                      {new Date(log.date).toLocaleString('ar-IQ')}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {log.userName}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-semibold whitespace-nowrap ${
                          log.action.startsWith('cancel_') || log.action.startsWith('delete_')
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : log.action.startsWith('update_')
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {log.actionLabel}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-num font-bold text-blue-800 whitespace-nowrap">
                      {log.reference || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs">
                      {maskIfNeeded(log.beforeValue)}
                    </td>
                    <td className="py-3 px-4 text-slate-900 font-medium max-w-xs">
                      {maskIfNeeded(log.afterValue)}
                    </td>
                    <td className="py-3 px-4 text-slate-700 max-w-xs">
                      {log.reason ? (
                        <span className="text-red-700 font-semibold">السبب: {log.reason}</span>
                      ) : (
                        log.note || '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
