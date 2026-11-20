import React, { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { PaperSize } from '../types/erp';
import { sanitizeBarcode } from '../utils/numbers';

export function PrintSettingsView() {
  const { state, updatePrintSettings, hasPermission, setHasUnsavedChanges } = useERP();

  const [storeName, setStoreName] = useState(state.printSettings.storeName);
  const [storeTagline, setStoreTagline] = useState(state.printSettings.storeTagline);
  const [phone, setPhone] = useState(state.printSettings.phone);
  const [address, setAddress] = useState(state.printSettings.address);
  const [defaultPaperSize, setDefaultPaperSize] = useState<PaperSize>(
    state.printSettings.defaultPaperSize
  );
  const [footerNote, setFooterNote] = useState(state.printSettings.footerNote);
  const [showHeader, setShowHeader] = useState(state.printSettings.showHeader);
  const [showCustomerBalance, setShowCustomerBalance] = useState(
    state.printSettings.showCustomerBalance
  );
  const [showInstallmentTable, setShowInstallmentTable] = useState(
    state.printSettings.showInstallmentTable
  );
  const [showExchangeRateDetails, setShowExchangeRateDetails] = useState(
    state.printSettings.showExchangeRateDetails
  );
  const [showSignatures, setShowSignatures] = useState(state.printSettings.showSignatures);
  const [storeNameError, setStoreNameError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const ps = state.printSettings;
    setStoreName(ps.storeName);
    setStoreTagline(ps.storeTagline);
    setPhone(ps.phone);
    setAddress(ps.address);
    setDefaultPaperSize(ps.defaultPaperSize);
    setFooterNote(ps.footerNote);
    setShowHeader(ps.showHeader);
    setShowCustomerBalance(ps.showCustomerBalance);
    setShowInstallmentTable(ps.showInstallmentTable);
    setShowExchangeRateDetails(ps.showExchangeRateDetails);
    setShowSignatures(ps.showSignatures);
  }, [state.printSettings]);

  const isDirty =
    storeName !== state.printSettings.storeName ||
    storeTagline !== state.printSettings.storeTagline ||
    phone !== state.printSettings.phone ||
    address !== state.printSettings.address ||
    defaultPaperSize !== state.printSettings.defaultPaperSize ||
    footerNote !== state.printSettings.footerNote ||
    showHeader !== state.printSettings.showHeader ||
    showCustomerBalance !== state.printSettings.showCustomerBalance ||
    showInstallmentTable !== state.printSettings.showInstallmentTable ||
    showExchangeRateDetails !== state.printSettings.showExchangeRateDetails ||
    showSignatures !== state.printSettings.showSignatures;

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
  }, [isDirty, setHasUnsavedChanges]);

  useEffect(() => {
    return () => setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  const canManage = hasPermission('canManagePrintSettings');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!storeName.trim()) {
      setStoreNameError('اسم المتجر / الشركة حقل إلزامي.');
      return;
    }
    setIsSubmitting(true);
    try {
      setStoreNameError('');
      updatePrintSettings({
        storeName: storeName.trim(),
        storeTagline,
        phone,
        address,
        defaultPaperSize,
        footerNote,
        showHeader,
        showCustomerBalance,
        showInstallmentTable,
        showExchangeRateDetails,
        showSignatures,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <Printer className="w-5 h-5 text-slate-800" />
          <h2 className="text-base font-bold text-slate-900">الطباعة والتحكم الكامل بالطباعة (A4 / A5)</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold mb-1">اسم المتجر / الشركة *</label>
              <input
                disabled={!canManage}
                value={storeName}
                onChange={(e) => {
                  setStoreName(e.target.value);
                  setStoreNameError('');
                }}
                className={`w-full px-3 py-2 border rounded-lg disabled:bg-slate-50 text-sm ${
                  storeNameError ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              />
              {storeNameError && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{storeNameError}</p>
              )}
            </div>
            <div>
              <label className="block font-semibold mb-1">الوصف تحت الاسم</label>
              <input
                disabled={!canManage}
                value={storeTagline}
                onChange={(e) => setStoreTagline(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">رقم الهاتف</label>
              <input
                disabled={!canManage}
                value={phone}
                onChange={(e) => setPhone(sanitizeBarcode(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-num disabled:bg-slate-50 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">العنوان</label>
              <input
                disabled={!canManage}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div>
              <label className="block font-semibold mb-2">مقاس الطباعة الافتراضي</label>
              <div className="flex items-center gap-3">
                {(['A4', 'A5'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    disabled={!canManage}
                    onClick={() => setDefaultPaperSize(sz)}
                    className={`px-5 py-2.5 rounded-lg border font-semibold transition-colors ${
                      defaultPaperSize === sz
                        ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {sz === 'A4' ? 'ورق A4 (كامل)' : 'ورق A5 (نصف صفحة)'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-2">خيارات العناصر في الفواتير المطبوعة</label>
              <div className="flex flex-wrap gap-5 text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canManage}
                    checked={showHeader}
                    onChange={(e) => setShowHeader(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 w-4 h-4"
                  />
                  <span>ترويسة المتجر</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canManage}
                    checked={showCustomerBalance}
                    onChange={(e) => setShowCustomerBalance(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 w-4 h-4"
                  />
                  <span>الرصيد المتبقي</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canManage}
                    checked={showInstallmentTable}
                    onChange={(e) => setShowInstallmentTable(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 w-4 h-4"
                  />
                  <span>جدول الأقساط</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canManage}
                    checked={showExchangeRateDetails}
                    onChange={(e) => setShowExchangeRateDetails(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 w-4 h-4"
                  />
                  <span>تفاصيل سعر الصرف</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canManage}
                    checked={showSignatures}
                    onChange={(e) => setShowSignatures(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 w-4 h-4"
                  />
                  <span>التواقيع والختم</span>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">ملاحظة أسفل الفاتورة (شروط الضمان والاسترجاع)</label>
            <input
              disabled={!canManage}
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50 text-sm"
            />
          </div>

          {canManage && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 text-xs"
              >
                حفظ إعدادات الطباعة الافتراضية
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
