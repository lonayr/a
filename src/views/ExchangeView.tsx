import React, { useEffect, useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { formatRatePer100 } from '../utils/currency';
import { exportToCSV, exportToExcel, exportToJSON } from '../utils/export';
import { ExportBar } from '../components/ExportBar';
import { parseLocaleNumber, sanitizeNumericInput } from '../utils/numbers';

export function ExchangeView() {
  const { state, updateExchangeRate, hasPermission, setHasUnsavedChanges } = useERP();
  const initialRate = String(Math.round(state.activeExchangeRate * 100));
  const [rateInput, setRateInput] = useState(initialRate);
  const [noteInput, setNoteInput] = useState('');
  const [rateError, setRateError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setRateInput(String(Math.round(state.activeExchangeRate * 100)));
  }, [state.activeExchangeRate]);

  useEffect(() => {
    const dirty =
      rateInput !== String(Math.round(state.activeExchangeRate * 100)) || Boolean(noteInput.trim());
    setHasUnsavedChanges(dirty);
  }, [rateInput, noteInput, state.activeExchangeRate, setHasUnsavedChanges]);

  useEffect(() => {
    return () => setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  const canChange = hasPermission('canChangeExchangeRate');

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const val = parseLocaleNumber(rateInput);
    if (!Number.isFinite(val) || val <= 0) {
      setRateError('يرجى إدخال سعر صرف صحيح أكبر من صفر (مثال: 150000).');
      return;
    }
    setIsSubmitting(true);
    try {
      const ok = updateExchangeRate(
        val / 100,
        noteInput.trim() || `تعديل سعر الصرف اليدوي إلى ${val.toLocaleString()} د.ع / 100$`
      );
      if (ok) {
        setRateError('');
        setNoteInput('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const headers = ['التاريخ والوقت', 'السعر السابق', 'السعر الجديد', 'المصدر', 'المرجع', 'التفاصيل', 'المستخدم'];
  const rows = state.exchangeLogs.map((l) => [
    new Date(l.date).toLocaleString('ar-IQ'),
    l.previousRate * 100,
    l.newRate * 100,
    l.source === 'manual_update' ? 'تعديل يدوي' : l.source === 'auto_conversion' ? 'تحويل تلقائي' : 'تسوية',
    l.reference || '-',
    l.note,
    l.userName,
  ]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-bold text-slate-900">التحكم الكامل بسعر صرف الدولار</h2>
          </div>
          <div className="text-sm font-bold font-num text-blue-800 bg-blue-50 px-3.5 py-1.5 rounded-lg border border-blue-200">
            السعر الحالي المعتمد: {formatRatePer100(state.activeExchangeRate)}
          </div>
        </div>

        {canChange ? (
          <form onSubmit={handleUpdate} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs items-start">
            <div>
              <label className="block font-semibold mb-1">سعر الـ 100 دولار بالدينار العراقي *</label>
              <input
                type="text"
                inputMode="numeric"
                value={rateInput}
                onChange={(e) => {
                  setRateInput(sanitizeNumericInput(e.target.value, false));
                  setRateError('');
                }}
                placeholder="150000"
                className={`w-full px-3 py-2 border rounded-lg font-num text-sm ${
                  rateError ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              />
              {rateError && <p className="text-[11px] text-red-600 font-semibold mt-1">{rateError}</p>}
            </div>
            <div>
              <label className="block font-semibold mb-1">سبب التعديل أو الملاحظة</label>
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="مثال: تعديل استقرار السوق..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div className="pt-5">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري التحديث...' : 'اعتماد وتحديث سعر الصرف'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="text-xs text-slate-500">
            تعديل سعر الصرف متاح لصلاحية المدير أو الحسابات المخولة فقط.
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden space-y-3">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">سجل تغيرات أسعار الصرف والتحويل التلقائي</h3>
          <ExportBar
            compact
            onExcel={() => exportToExcel('exchange-rate-history.xlsx', 'أسعار_الصرف', headers, rows)}
            onCSV={() => exportToCSV('exchange-rate-history.csv', headers, rows)}
            onJSON={() => exportToJSON('exchange-rate-history.json', state.exchangeLogs)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 text-right">التاريخ والوقت</th>
                <th className="py-3 px-4 text-left">السعر السابق</th>
                <th className="py-3 px-4 text-left">السعر الجديد</th>
                <th className="py-3 px-4 text-right">المصدر</th>
                <th className="py-3 px-4 text-right">التفاصيل</th>
                <th className="py-3 px-4 text-right">المستخدم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.exchangeLogs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-num text-slate-600">
                    {new Date(l.date).toLocaleString('ar-IQ')}
                  </td>
                  <td className="py-2.5 px-4 text-left font-num text-slate-500">
                    {(l.previousRate * 100).toLocaleString()} د.ع
                  </td>
                  <td className="py-2.5 px-4 text-left font-num font-bold text-slate-900">
                    {(l.newRate * 100).toLocaleString()} د.ع
                  </td>
                  <td className="py-2.5 px-4 font-medium">
                    {l.source === 'manual_update'
                      ? 'تعديل يدوي'
                      : l.source === 'auto_conversion'
                      ? 'تحويل تلقائي لعملية'
                      : 'تسوية'}
                  </td>
                  <td className="py-2.5 px-4 text-slate-700">{l.note}</td>
                  <td className="py-2.5 px-4 text-slate-600">{l.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
