import React, { useState } from 'react';
import { Lock, ShieldCheck, UserCheck, ArrowLeft } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { getRoleDisplayLabel } from '../data/seedData';
import { sanitizeBarcode } from '../utils/numbers';

export function LoginScreen() {
  const { state, loginWithPin } = useERP();
  const activeUsers = state.users.filter((u) => u.active);
  const [selectedUserId, setSelectedUserId] = useState<string>(activeUsers[0]?.id || '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const selectedUser = activeUsers.find((u) => u.id === selectedUserId) || activeUsers[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!pin.trim()) {
      setError('يرجى إدخال رمز الدخول (PIN).');
      return;
    }
    const ok = loginWithPin(selectedUser.id, pin);
    if (!ok) {
      setError('رمز الدخول غير صحيح. يرجى المحاولة مرة أخرى.');
      return;
    }
    setError('');
    setPin('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
        <div className="mb-8">
          <div className="text-xs font-medium text-slate-500 mb-2">
            برنامج الكفيل لإدارة المبيعات والمخزون · تخزين محلي آمن
          </div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">
            {state.printSettings.storeName}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            اختر الحساب وأدخل رمز الدخول للوصول إلى النظام
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              اختر المستخدم
            </label>
            <div className="space-y-2">
              {activeUsers.map((user) => {
                const isSelected = user.id === (selectedUser?.id || '');
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setError('');
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-lg border text-right transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 text-slate-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {user.role === 'admin' ? (
                        <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
                      ) : (
                        <UserCheck className="w-5 h-5 text-slate-600 shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-semibold">{user.name}</div>
                        <div className="text-xs text-slate-500">
                          {getRoleDisplayLabel(user.role)}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-num text-slate-400">@{user.username}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              رمز الدخول (PIN) *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => {
                  setPin(sanitizeBarcode(e.target.value));
                  setError('');
                }}
                placeholder="أدخل رمز الدخول..."
                className={`w-full pr-10 pl-4 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 font-num ${
                  error
                    ? 'border-red-500 bg-red-50/40 focus:ring-red-500 focus:border-red-500'
                    : 'border-slate-300 focus:ring-blue-600 focus:border-blue-600'
                }`}
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-red-600 mt-2 font-semibold">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors"
          >
            <span>تسجيل الدخول</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>المدير: <strong className="font-num text-slate-700">1234</strong></span>
          <span>المحاسب: <strong className="font-num text-slate-700">1111</strong></span>
          <span>الكاشير: <strong className="font-num text-slate-700">0000</strong></span>
        </div>
      </div>
    </div>
  );
}
