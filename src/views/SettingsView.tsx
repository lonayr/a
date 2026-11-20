import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Upload,
  Printer,
  ShieldCheck,
  UserPlus,
  Trash2,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { CostCalculationMethod, PaperSize, UserPermissions, UserRole } from '../types/erp';
import {
  getPresetPermissionsForRole,
  getRoleDisplayLabel,
} from '../data/seedData';
import { exportFullBackupJSON, parseAndValidateBackupJSON } from '../utils/export';
import { sanitizeBarcode } from '../utils/numbers';

const PERMISSION_LABELS: { key: keyof UserPermissions; label: string }[] = [
  { key: 'canSellCash', label: 'إصدار فواتير بيع نقدي' },
  { key: 'canSellInstallment', label: 'إصدار فواتير أقساط وآجل' },
  { key: 'canReceivePayments', label: 'قبض دفعات وأقساط الزبائن' },
  { key: 'canManageInventory', label: 'إدارة المخزون وفواتير الشراء' },
  { key: 'canEditCostPrices', label: 'رؤية وتعديل أسعار التكلفة' },
  { key: 'canViewProfitsAndFX', label: 'رؤية تقارير الأرباح وفروقات الصرف' },
  { key: 'canPaySuppliers', label: 'تسديد حسابات الموردين' },
  { key: 'canChangeExchangeRate', label: 'تعديل سعر الصرف اليومي' },
  { key: 'canOverrideFXDiff', label: 'تعديل فروقات الصرف يدوياً' },
  { key: 'canDeleteRecords', label: 'إلغاء الفواتير والسندات وإصدار السندات العكسية' },
  { key: 'canManagePrintSettings', label: 'التحكم بإعدادات الطباعة' },
  { key: 'canExportData', label: 'تصدير التقارير والعمليات' },
  { key: 'canRestoreBackup', label: 'استعادة النسخ الاحتياطية وتصفير المتجر' },
  { key: 'canApproveInboxInvoices', label: 'اعتماد ورفض فواتير الصور (صندوق الوارد)' },
  { key: 'canManageUsers', label: 'إدارة المستخدمين والصلاحيات' },
];

export function SettingsView() {
  const {
    state,
    storeSettings,
    currentUser,
    hasPermission,
    updateStoreSettings,
    updatePrintSettings,
    restoreFullState,
    resetToEmptyStore,
    resetToDemoSeed,
    addUser,
    updateUser,
    deleteUser,
    setHasUnsavedChanges,
    notify,
  } = useERP();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Store settings local form
  const [allowNegativeStock, setAllowNegativeStock] = useState(storeSettings.allowNegativeStock);
  const [costCalculationMethod, setCostCalculationMethod] = useState<CostCalculationMethod>(
    storeSettings.costCalculationMethod
  );
  const [savingStoreSettings, setSavingStoreSettings] = useState(false);

  useEffect(() => {
    setAllowNegativeStock(storeSettings.allowNegativeStock);
    setCostCalculationMethod(storeSettings.costCalculationMethod);
  }, [storeSettings]);

  // Print controller local form
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
  const [printFormError, setPrintFormError] = useState('');
  const [savingPrint, setSavingPrint] = useState(false);

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

  // New user form
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('cashier');
  const [userFormErrors, setUserFormErrors] = useState<{
    name?: string;
    username?: string;
    pin?: string;
    general?: string;
  }>({});
  const [savingUser, setSavingUser] = useState(false);

  // Confirm delete user inline bar & reset banner
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [confirmResetMode, setConfirmResetMode] = useState<'empty' | 'demo' | null>(null);

  const canPrintSettings = hasPermission('canManagePrintSettings');
  const canBackupRestore = hasPermission('canRestoreBackup');
  const canUsers = hasPermission('canManageUsers');
  const canManageStoreRules = currentUser?.role === 'admin' || canUsers;

  const isStoreSettingsDirty =
    allowNegativeStock !== storeSettings.allowNegativeStock ||
    costCalculationMethod !== storeSettings.costCalculationMethod;

  const isPrintDirty =
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

  const isNewUserDirty = Boolean(newName.trim() || newUsername.trim() || newPin.trim());

  useEffect(() => {
    setHasUnsavedChanges(isStoreSettingsDirty || isPrintDirty || isNewUserDirty);
  }, [isStoreSettingsDirty, isPrintDirty, isNewUserDirty, setHasUnsavedChanges]);

  useEffect(() => {
    return () => setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  const handleSaveStoreSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (savingStoreSettings || !canManageStoreRules) return;
    setSavingStoreSettings(true);
    try {
      updateStoreSettings({
        allowNegativeStock,
        costCalculationMethod,
      });
    } finally {
      setSavingStoreSettings(false);
    }
  };

  const handleSavePrint = (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPrint) return;
    if (!storeName.trim()) {
      setPrintFormError('اسم المتجر / الشركة حقل إلزامي.');
      return;
    }
    setSavingPrint(true);
    try {
      setPrintFormError('');
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
      setSavingPrint(false);
    }
  };

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

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (savingUser) return;
    const errs: typeof userFormErrors = {};
    if (!newName.trim()) errs.name = 'الاسم الكامل حقل إلزامي.';
    if (!newUsername.trim()) errs.username = 'اسم المستخدم حقل إلزامي.';
    const cleanPin = sanitizeBarcode(newPin);
    if (!cleanPin) errs.pin = 'رمز الدخول PIN حقل إلزامي.';
    if (Object.keys(errs).length > 0) {
      setUserFormErrors(errs);
      return;
    }

    setSavingUser(true);
    try {
      const res = addUser({
        name: newName.trim(),
        username: newUsername.trim(),
        pin: cleanPin,
        role: newRole,
        active: true,
        permissions: getPresetPermissionsForRole(newRole),
      });
      if (!res.ok) {
        setUserFormErrors({ general: res.error || 'تعذر إنشاء الحساب.' });
        return;
      }
      setUserFormErrors({});
      setNewName('');
      setNewUsername('');
      setNewPin('');
      setNewRole('cashier');
    } finally {
      setSavingUser(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 0. Store Inventory & Cost Calculation Settings */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-700" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                إعدادات المخزون وطريقة احتساب التكلفة
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                التحكم بالبيع بمخزون سالب واعتماد طريقة احتساب كلفة البضاعة عند الشراء.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveStoreSettings} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50/60">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <div className="font-bold text-slate-900">السماح بالبيع بمخزون سالب</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    الافتراضي: (لا) — يمنع البيع بكمية تتجاوز الرصيد المتاح بالمخزن.
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!canManageStoreRules}
                  checked={allowNegativeStock}
                  onChange={(e) => setAllowNegativeStock(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-700"
                />
              </label>
              <div className="text-[11px] font-semibold">
                الحالة المختارة:{' '}
                <span className={allowNegativeStock ? 'text-amber-700' : 'text-emerald-700'}>
                  {allowNegativeStock ? 'نعم (مسموح بالبيع السالب)' : 'لا (يمنع البيع فوق الرصيد المتاح)'}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 space-y-2 bg-slate-50/60">
              <label className="block font-bold text-slate-900">
                طريقة احتساب تكلفة الصنف عند الشراء *
              </label>
              <select
                disabled={!canManageStoreRules}
                value={costCalculationMethod}
                onChange={(e) => setCostCalculationMethod(e.target.value as CostCalculationMethod)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold disabled:bg-slate-100"
              >
                <option value="weighted_avg">المتوسط المرجّح للتكلفة (افتراضي)</option>
                <option value="last_price">آخر سعر شراء فقط</option>
              </select>
              <div className="text-[11px] text-slate-500">
                {costCalculationMethod === 'weighted_avg'
                  ? 'يتم احتساب متوسط الكلفة بين الكمية السابقة والوجبة الجديدة تلقائياً.'
                  : 'يتم تحديث سعر التكلفة مباشرة إلى سعر الشراء في آخر فاتورة.'}
              </div>
            </div>
          </div>

          {canManageStoreRules && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingStoreSettings}
                className="px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {savingStoreSettings ? 'جاري الحفظ...' : 'حفظ قواعد المخزون والتكلفة'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* 1. JSON Backup & Restore Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              النسخ الاحتياطي الشامل واستعادة البيانات (JSON)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              آخر حفظ محلي تلقائي:{' '}
              <span className="font-num">{new Date(state.lastSavedAt).toLocaleString('ar-IQ')}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => exportFullBackupJSON(state)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              <Download className="w-4 h-4" />
              <span>تحميل نسخة احتياطية JSON</span>
            </button>

            {canBackupRestore && (
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
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
                >
                  <Upload className="w-4 h-4" />
                  <span>استعادة من ملف JSON</span>
                </button>
              </>
            )}
          </div>
        </div>

        {canBackupRestore && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-600">
              إدارة بيانات المتجر الأولية (للمدير فقط):
            </span>
            <div className="flex items-center gap-2">
              {confirmResetMode ? (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  <span className="font-semibold text-amber-900">
                    {confirmResetMode === 'empty'
                      ? 'تأكيد مسح جميع البيانات والبدء من الصفر؟'
                      : 'تأكيد استرجاع البيانات التجريبية؟'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmResetMode === 'empty') resetToEmptyStore();
                      else resetToDemoSeed();
                      setConfirmResetMode(null);
                    }}
                    className="px-2.5 py-1 bg-red-600 text-white rounded font-semibold"
                  >
                    تأكيد
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetMode(null)}
                    className="px-2 py-1 text-slate-600"
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmResetMode('empty')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>تصفير البيانات (بدء متجر جديد)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetMode('demo')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <span>إعادة تحميل البيانات التجريبية</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Print Controller Section (A4 / A5) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Printer className="w-4 h-4 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">التحكم بالطباعة ومقاسات الورق (A4 / A5)</h2>
        </div>

        <form onSubmit={handleSavePrint} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold mb-1">اسم المتجر / الشركة *</label>
              <input
                disabled={!canPrintSettings}
                value={storeName}
                onChange={(e) => {
                  setStoreName(e.target.value);
                  setPrintFormError('');
                }}
                className={`w-full px-3 py-2 border rounded-lg disabled:bg-slate-50 ${
                  printFormError ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                }`}
              />
              {printFormError && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">{printFormError}</p>
              )}
            </div>
            <div>
              <label className="block font-semibold mb-1">الوصف تحت الاسم</label>
              <input
                disabled={!canPrintSettings}
                value={storeTagline}
                onChange={(e) => setStoreTagline(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">رقم الهاتف</label>
              <input
                disabled={!canPrintSettings}
                value={phone}
                onChange={(e) => setPhone(sanitizeBarcode(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-num disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">العنوان</label>
              <input
                disabled={!canPrintSettings}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <label className="block font-semibold mb-1.5">مقاس الطباعة الافتراضي</label>
              <div className="flex items-center gap-2">
                {(['A4', 'A5'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    disabled={!canPrintSettings}
                    onClick={() => setDefaultPaperSize(sz)}
                    className={`px-4 py-2 rounded-lg border font-semibold transition-colors ${
                      defaultPaperSize === sz
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {sz === 'A4' ? 'ورق A4 (210×297 مم)' : 'ورق A5 (148×210 مم)'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1.5">خيارات الإظهار في المطبوعات</label>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    disabled={!canPrintSettings}
                    checked={showHeader}
                    onChange={(e) => setShowHeader(e.target.checked)}
                  />
                  <span>الترويسة</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    disabled={!canPrintSettings}
                    checked={showCustomerBalance}
                    onChange={(e) => setShowCustomerBalance(e.target.checked)}
                  />
                  <span>الرصيد المتبقي</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    disabled={!canPrintSettings}
                    checked={showInstallmentTable}
                    onChange={(e) => setShowInstallmentTable(e.target.checked)}
                  />
                  <span>جدول الأقساط</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    disabled={!canPrintSettings}
                    checked={showExchangeRateDetails}
                    onChange={(e) => setShowExchangeRateDetails(e.target.checked)}
                  />
                  <span>سعر الصرف</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    disabled={!canPrintSettings}
                    checked={showSignatures}
                    onChange={(e) => setShowSignatures(e.target.checked)}
                  />
                  <span>التواقيع</span>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">ملاحظة أسفل الفاتورة (الشروط والضمان)</label>
            <input
              disabled={!canPrintSettings}
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-50"
            />
          </div>

          {canPrintSettings && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPrint}
                className="px-5 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {savingPrint ? 'جاري الحفظ...' : 'حفظ إعدادات الطباعة'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* 3. Users & RBAC Permissions Section (Admin Only) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShieldCheck className="w-4 h-4 text-blue-700" />
          <h2 className="text-base font-bold text-slate-900">صلاحيات المدير والمحاسبين والكاشير</h2>
        </div>

        {!canUsers ? (
          <div className="text-xs text-slate-500">
            إدارة الحسابات والصلاحيات متاحة لصلاحية المدير فقط. حسابك الحالي:{' '}
            <strong>{currentUser?.name}</strong> ({currentUser ? getRoleDisplayLabel(currentUser.role) : ''}).
          </div>
        ) : (
          <div className="space-y-6">
            {/* Existing Users */}
            <div className="space-y-4">
              {state.users.map((u) => (
                <div
                  key={u.id}
                  className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        {u.name}{' '}
                        <span className="text-xs font-normal text-slate-500 font-num">
                          (@{u.username})
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        الدور: <strong>{getRoleDisplayLabel(u.role)}</strong>{' '}
                        · رمز الدخول: <strong className="font-num">{u.pin}</strong>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <select
                        value={u.role === 'user' ? 'cashier' : u.role}
                        onChange={(e) => {
                          const role = e.target.value as UserRole;
                          updateUser(u.id, {
                            role,
                            permissions: getPresetPermissionsForRole(role),
                          });
                        }}
                        className="px-2.5 py-1 border border-slate-300 rounded bg-white"
                      >
                        <option value="admin">مدير النظام (كامل الصلاحيات)</option>
                        <option value="accountant">محاسب</option>
                        <option value="cashier">كاشير (يخفي التكلفة والأرباح)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => updateUser(u.id, { active: !u.active })}
                        className={`px-2.5 py-1 rounded border font-medium ${
                          u.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {u.active ? 'نشط' : 'معطل'}
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteUserId(u.id)}
                          className="p-1.5 rounded border border-slate-200 text-red-600 hover:bg-red-50"
                          title="حذف الحساب"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {confirmDeleteUserId === u.id && (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
                      <span className="font-semibold text-red-800">
                        تأكيد حذف حساب المستخدم ({u.name}) نهائياً؟
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            deleteUser(u.id);
                            setConfirmDeleteUserId(null);
                          }}
                          className="px-3 py-1 bg-red-600 text-white rounded font-semibold hover:bg-red-700"
                        >
                          نعم، حذف الحساب
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteUserId(null)}
                          className="px-3 py-1 bg-white border border-slate-300 rounded text-slate-700"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}

                  {u.role !== 'admin' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-xs">
                      {PERMISSION_LABELS.map((perm) => (
                        <label
                          key={perm.key}
                          className="inline-flex items-center gap-2 text-slate-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={u.permissions[perm.key]}
                            onChange={(e) =>
                              updateUser(u.id, {
                                permissions: {
                                  ...u.permissions,
                                  [perm.key]: e.target.checked,
                                },
                              })
                            }
                            className="rounded border-slate-300 text-blue-700"
                          />
                          <span>{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add New User */}
            <form
              onSubmit={handleCreateUser}
              className="border border-slate-200 rounded-lg p-4 space-y-3 text-xs"
            >
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" />
                <span>إضافة حساب جديد (مدير / محاسب / كاشير)</span>
              </div>

              {userFormErrors.general && (
                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 font-semibold">
                  {userFormErrors.general}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
                <div>
                  <input
                    placeholder="الاسم الكامل *"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      setUserFormErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    className={`w-full px-3 py-2 border rounded-lg ${
                      userFormErrors.name ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                    }`}
                  />
                  {userFormErrors.name && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">{userFormErrors.name}</p>
                  )}
                </div>
                <div>
                  <input
                    placeholder="اسم المستخدم (English) *"
                    value={newUsername}
                    onChange={(e) => {
                      setNewUsername(e.target.value);
                      setUserFormErrors((prev) => ({ ...prev, username: undefined }));
                    }}
                    className={`w-full px-3 py-2 border rounded-lg font-num ${
                      userFormErrors.username ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                    }`}
                  />
                  {userFormErrors.username && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">
                      {userFormErrors.username}
                    </p>
                  )}
                </div>
                <div>
                  <input
                    placeholder="رمز الدخول PIN *"
                    value={newPin}
                    onChange={(e) => {
                      setNewPin(sanitizeBarcode(e.target.value));
                      setUserFormErrors((prev) => ({ ...prev, pin: undefined }));
                    }}
                    className={`w-full px-3 py-2 border rounded-lg font-num ${
                      userFormErrors.pin ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                    }`}
                  />
                  {userFormErrors.pin && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">{userFormErrors.pin}</p>
                  )}
                </div>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="cashier">كاشير (يخفي التكلفة والأرباح)</option>
                  <option value="accountant">محاسب</option>
                  <option value="admin">مدير (كامل الصلاحيات)</option>
                </select>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold disabled:opacity-50"
                >
                  {savingUser ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
