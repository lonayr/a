import React, { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Check } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { sanitizeBarcode } from '../utils/numbers';

export function DeveloperActivationView() {
  const { state, updateDeveloperLicense, notify } = useERP();
  const [developerPinInput, setDeveloperPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const [mode, setMode] = useState<'trial' | 'permanent'>(state.developerMode || 'permanent');
  const [expiry, setExpiry] = useState<string>(
    state.expiryDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [newPin, setNewPin] = useState(state.developerPin || '9999');
  const [newPinError, setNewPinError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMode(state.developerMode || 'permanent');
    if (state.expiryDate) setExpiry(state.expiryDate);
    if (state.developerPin) setNewPin(state.developerPin);
  }, [state.developerMode, state.expiryDate, state.developerPin]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = state.developerPin || '9999';
    const clean = sanitizeBarcode(developerPinInput);
    if (!clean) {
      setPinError('يرجى إدخال رمز المبرمج السري.');
      return;
    }
    if (clean === correctPin) {
      setPinError('');
      setUnlocked(true);
      notify('تم فك قفل صلاحيات المبرمج بنجاح.', 'success');
    } else {
      setPinError('رمز المبرمج السري غير صحيح.');
      notify('رمز المبرمج السري غير صحيح.', 'error');
    }
  };

  const handleSaveActivation = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const cleanNew = sanitizeBarcode(newPin);
    if (!cleanNew) {
      setNewPinError('رمز المبرمج السري حقل إلزامي.');
      return;
    }
    setIsSubmitting(true);
    try {
      setNewPinError('');
      updateDeveloperLicense({
        developerMode: mode,
        expiryDate: expiry,
        developerPin: cleanNew,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const todayLocal = new Date();
  const todayStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(todayLocal.getDate()).padStart(2, '0')}`;
  const isTrialExpired = state.developerMode === 'trial' && state.expiryDate < todayStr;

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-bold text-slate-900">صلاحيات المبرمج والتفعيل الرسمي</h2>
          </div>
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-md ${
              isTrialExpired
                ? 'bg-red-50 text-red-700'
                : state.developerMode === 'permanent'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-800'
            }`}
          >
            {isTrialExpired
              ? 'تجريبية منتهية'
              : state.developerMode === 'permanent'
              ? 'تفعيل دائم'
              : `تجريبية حتى ${state.expiryDate}`}
          </span>
        </div>

        {!unlocked ? (
          <form onSubmit={handleUnlock} className="space-y-4 py-4 text-xs">
            <div className="text-slate-600">
              هذا القسم محمي برقم سري خاص بالمبرمج للتحكم بتفعيل البرنامج (نسخة تجريبية أو تفعيل دائم).
            </div>
            <div>
              <label className="block font-semibold mb-1">أدخل رمز المبرمج السري (الافتراضي: 9999) *</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  inputMode="numeric"
                  value={developerPinInput}
                  onChange={(e) => {
                    setDeveloperPinInput(sanitizeBarcode(e.target.value));
                    setPinError('');
                  }}
                  placeholder="أدخل رمز المبرمج..."
                  className={`w-full pr-10 pl-4 py-2.5 border rounded-lg font-num text-sm ${
                    pinError ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                  }`}
                  autoFocus
                />
              </div>
              {pinError && <p className="text-[11px] text-red-600 font-semibold mt-1">{pinError}</p>}
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 text-xs"
            >
              فك القفل والدخول
            </button>
          </form>
        ) : (
          <form onSubmit={handleSaveActivation} className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900">
              تم فتح قفل لوحة تحكم المبرمج بنجاح. يمكنك تعديل حالة تفعيل البرنامج أدناه.
            </div>

            <div>
              <label className="block font-semibold mb-1">حالة الترخيص والتفعيل</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'trial' | 'permanent')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
              >
                <option value="permanent">تفعيل دائم (مرخصة رسمياً)</option>
                <option value="trial">نسخة تجريبية (مؤقتة)</option>
              </select>
            </div>

            {mode === 'trial' && (
              <div>
                <label className="block font-semibold mb-1">تاريخ انتهاء النسخة التجريبية</label>
                <input
                  type="date"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-num text-sm"
                />
              </div>
            )}

            <div>
              <label className="block font-semibold mb-1">تعديل رمز المبرمج السري الجديد *</label>
              <input
                type="text"
                value={newPin}
                onChange={(e) => {
                  setNewPin(sanitizeBarcode(e.target.value));
                  setNewPinError('');
                }}
                className={`w-full px-3 py-2 border rounded-lg font-num text-sm ${
                  newPinError ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              />
              {newPinError && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{newPinError}</p>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 text-xs disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ واعتماد التفعيل'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
