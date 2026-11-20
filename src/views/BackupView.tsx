import React, { useRef, useState } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { exportFullBackupJSON, parseAndValidateBackupJSON } from '../utils/export';

export function BackupView() {
  const { state, restoreFullState, resetToEmptyStore, resetToDemoSeed, hasPermission, notify } =
    useERP();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmReset, setConfirmReset] = useState<'empty' | 'demo' | null>(null);

  const canBackup = hasPermission('canRestoreBackup');

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseAndValidateBackupJSON(text);
      if (!parsed.ok || !parsed.state) {
        notify(parsed.error || 'ملف النسخة الاحتياطية غير صالح.', 'error');
        return;
      }
      restoreFullState(parsed.state);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              النسخ الاحتياطي الشامل واستعادة البيانات (JSON)
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              آخر حفظ محلي تلقائي:{' '}
              <span className="font-num">{new Date(state.lastSavedAt).toLocaleString('ar-IQ')}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => exportFullBackupJSON(state)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              <Download className="w-4 h-4" />
              <span>تصدير نسخة JSON احتياطية</span>
            </button>

            {canBackup && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
                >
                  <Upload className="w-4 h-4" />
                  <span>استعادة من ملف JSON</span>
                </button>
              </>
            )}
          </div>
        </div>

        {canBackup && (
          <div className="border border-slate-200 rounded-xl p-5 bg-slate-50 space-y-3">
            <h3 className="text-xs font-bold text-slate-900">إدارة قاعدة البيانات المحلية (للمدير فقط)</h3>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-600">
                يمكنك تصفير جميع بيانات المتجر للبدء من الصفر أو إعادة تحميل البيانات التجريبية.
              </span>
              <div>
                {confirmReset ? (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    <span className="font-semibold text-amber-900">
                      {confirmReset === 'empty'
                        ? 'تأكيد مسح كافة البيانات الحالية والبدء بمتجر فارغ؟'
                        : 'تأكيد استرجاع البيانات التجريبية الافتراضية؟'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmReset === 'empty') resetToEmptyStore();
                        else resetToDemoSeed();
                        setConfirmReset(null);
                      }}
                      className="px-3 py-1 bg-red-600 text-white rounded font-semibold"
                    >
                      تأكيد
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(null)}
                      className="px-2.5 py-1 text-slate-600"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmReset('empty')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 font-medium"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>تصفير المتجر (متجر جديد فارغ)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset('demo')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-medium"
                    >
                      <span>تحميل البيانات التجريبية</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
