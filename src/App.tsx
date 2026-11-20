/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info, ShieldAlert, Lock, AlertTriangle } from 'lucide-react';
import { ERPProvider, useERP } from './context/ERPContext';
import { LoginScreen } from './components/LoginScreen';
import { TopBar } from './components/TopBar';
import { PageHeaderBar } from './components/PageHeaderBar';
import { DashboardView } from './views/DashboardView';
import { POSView } from './views/POSView';
import { SalesView } from './views/SalesView';
import { PurchaseInvoiceView } from './views/PurchaseInvoiceView';
import { InvoicesInboxView } from './views/InvoicesInboxView';
import { InventoryView } from './views/InventoryView';
import { CustomersView } from './views/CustomersView';
import { SuppliersView } from './views/SuppliersView';
import { SettlementView } from './views/SettlementView';
import { CashboxView } from './views/CashboxView';
import { ExchangeView } from './views/ExchangeView';
import { PrintSettingsView } from './views/PrintSettingsView';
import { PrintPreviewView } from './views/PrintPreviewView';
import { BackupView } from './views/BackupView';
import { LedgerView } from './views/LedgerView';
import { ReportsView } from './views/ReportsView';
import { AuditLogView } from './views/AuditLogView';
import { DeveloperActivationView } from './views/DeveloperActivationView';
import { SettingsView } from './views/SettingsView';
import { sanitizeBarcode } from './utils/numbers';

function TrialExpiredLockScreen() {
  const { state, updateDeveloperLicense, notify } = useERP();
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'permanent' | 'trial'>('permanent');
  const [nextExpiry, setNextExpiry] = useState(() => {
    const d = new Date(Date.now() + 30 * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  });

  const handleRenew = (e: React.FormEvent) => {
    e.preventDefault();
    const expected = state.developerPin || '9999';
    if (sanitizeBarcode(pin) !== expected) {
      notify('رمز المبرمج غير صحيح.', 'error');
      return;
    }
    updateDeveloperLicense({
      developerMode: mode,
      expiryDate: nextExpiry,
      developerPin: expected,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">انتهت فترة النسخة التجريبية</h1>
            <p className="text-xs text-slate-500 mt-0.5 font-num">
              تاريخ الانتهاء المسجل: {state.expiryDate}
            </p>
          </div>
        </div>

        <form onSubmit={handleRenew} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">نوع التفعيل الجديد</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'permanent' | 'trial')}
              className="w-full h-10 px-3 border border-slate-300 rounded-lg bg-white text-sm"
            >
              <option value="permanent">تفعيل دائم (مفتوح)</option>
              <option value="trial">تمديد الفترة التجريبية</option>
            </select>
          </div>

          {mode === 'trial' && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">تاريخ الانتهاء الجديد</label>
              <input
                type="date"
                value={nextExpiry}
                onChange={(e) => setNextExpiry(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg font-num text-sm"
              />
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">رمز المبرمج السري</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(sanitizeBarcode(e.target.value))}
                placeholder="أدخل رمز المبرمج..."
                className="w-full h-10 pr-9 pl-3 border border-slate-300 rounded-lg font-num text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-10 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800"
          >
            تفعيل النظام والمتابعة
          </button>
        </form>
      </div>
    </div>
  );
}

function AppShell() {
  const {
    state,
    currentUser,
    activeNav,
    printPayload,
    toasts,
    dismissToast,
    pendingNavTarget,
    confirmDiscardAndNavigate,
    cancelPendingNavigation,
  } = useERP();

  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const isTrialExpired = state.developerMode === 'trial' && state.expiryDate < todayLocal;

  if (isTrialExpired) {
    return <TrialExpiredLockScreen />;
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopBar />
      <main
        className={`flex-1 p-4 md:p-5 max-w-[1600px] w-full mx-auto ${
          printPayload ? '' : 'no-print'
        }`}
      >
          {!printPayload && <PageHeaderBar />}

          {/* Inline Unsaved Changes Warning Guard Bar (No Modals) */}
          {!printPayload && pendingNavTarget !== null && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 no-print">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  لديك تغييرات غير محفوظة في هذه الصفحة (تم حفظ مسودة تلقائية). هل تريد مغادرة الصفحة؟
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmDiscardAndNavigate}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 whitespace-nowrap"
                >
                  نعم، الانتقال الآن
                </button>
                <button
                  type="button"
                  onClick={cancelPendingNavigation}
                  className="px-3.5 py-1.5 rounded-lg border border-amber-300 bg-white text-amber-900 font-semibold hover:bg-amber-100 whitespace-nowrap"
                >
                  البقاء في هذه الصفحة
                </button>
              </div>
            </div>
          )}

          {printPayload ? (
            <PrintPreviewView />
          ) : (
            <>
              {activeNav === 'dashboard' && <DashboardView />}
              {activeNav === 'pos' && <POSView />}
              {activeNav === 'sales' && <SalesView />}
              {activeNav === 'purchase' && <PurchaseInvoiceView />}
              {activeNav === 'invoices' && <InvoicesInboxView />}
              {activeNav === 'inventory' && <InventoryView />}
              {activeNav === 'customers' && <CustomersView />}
              {activeNav === 'suppliers' && <SuppliersView />}
              {activeNav === 'settlement' && <SettlementView />}
              {activeNav === 'cashbox' && <CashboxView />}
              {activeNav === 'exchange' && <ExchangeView />}
              {activeNav === 'print' && <PrintSettingsView />}
              {activeNav === 'backup' && <BackupView />}
              {activeNav === 'ledger' && <LedgerView />}
              {activeNav === 'reports' && <ReportsView />}
              {activeNav === 'audit' && <AuditLogView />}
              {activeNav === 'developer' && <DeveloperActivationView />}
              {activeNav === 'settings' && <SettingsView />}
            </>
          )}
        </main>

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 left-5 z-50 space-y-2 max-w-sm no-print">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-md text-xs font-medium bg-white ${
                t.type === 'error'
                  ? 'border-red-200 text-red-800'
                  : t.type === 'info'
                  ? 'border-blue-200 text-blue-900'
                  : 'border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {t.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                ) : t.type === 'info' ? (
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <span>{t.text}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.actionLabel && t.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      t.onAction?.();
                      dismissToast(t.id);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 whitespace-nowrap"
                  >
                    {t.actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ERPProvider>
      <AppShell />
    </ERPProvider>
  );
}
