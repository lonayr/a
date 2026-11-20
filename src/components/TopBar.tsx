import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Calculator,
  CalendarClock,
  Check,
  Home,
  Inbox,
  LogOut,
  RefreshCw,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Truck,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { formatIQD, formatRatePer100, formatUSD } from '../utils/currency';
import { parseLocaleNumber, sanitizeNumericInput } from '../utils/numbers';
import { NavSection } from '../types/erp';
import { getRoleDisplayLabel } from '../data/seedData';

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'الرئيسية',
  pos: 'فاتورة البيع',
  sales: 'سجل المبيعات',
  purchase: 'فاتورة الشراء',
  invoices: 'الفواتير',
  inventory: 'المواد والمخزون',
  customers: 'الزبائن',
  suppliers: 'الموردون',
  settlement: 'القبض والصرف',
  cashbox: 'الصندوق',
  exchange: 'سعر الصرف',
  print: 'إعدادات الطباعة',
  backup: 'النسخ الاحتياطي',
  ledger: 'سجل العمليات',
  reports: 'التقارير المالية',
  audit: 'سجل التدقيق',
  developer: 'التفعيل والمبرمج',
  settings: 'الإعدادات والصلاحيات',
};

type RibbonGroupId =
  | 'sales'
  | 'purchases'
  | 'invoices'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'cashbox'
  | 'installments'
  | 'reports'
  | 'settings';

interface SubOperationItem {
  id: string;
  label: string;
  nav?: NavSection;
  onClick: () => void;
}

export function TopBar() {
  const {
    state,
    activeNav,
    openTabs,
    closeTab,
    setActiveNav,
    openCustomerForm,
    openSupplierForm,
    openSettlementPage,
    setSalesFilterHint,
    setInventoryLowStockHint,
    displayMode,
    toggleQuickCurrency,
    setDisplayMode,
    updateExchangeRate,
    hasPermission,
    currentUser,
    logout,
    inboxPendingCount,
    inboxNotifications,
    openInboxReview,
    clearActiveInboxSelection,
  } = useERP();

  const [editingRate, setEditingRate] = useState(false);
  const [ratePer100Input, setRatePer100Input] = useState(
    String(Math.round(state.activeExchangeRate * 100))
  );
  const [rateError, setRateError] = useState('');
  const [showConverter, setShowConverter] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [convUsd, setConvUsd] = useState('100');

  const navToGroup = (nav: NavSection): RibbonGroupId => {
    switch (nav) {
      case 'pos':
      case 'sales':
        return 'sales';
      case 'purchase':
        return 'purchases';
      case 'invoices':
        return 'invoices';
      case 'inventory':
        return 'inventory';
      case 'customers':
        return 'customers';
      case 'suppliers':
        return 'suppliers';
      case 'cashbox':
      case 'settlement':
      case 'exchange':
        return 'cashbox';
      case 'reports':
      case 'ledger':
      case 'audit':
        return 'reports';
      case 'settings':
      case 'print':
      case 'backup':
      case 'developer':
        return 'settings';
      default:
        return 'sales';
    }
  };

  const [activeRibbonGroup, setActiveRibbonGroup] = useState<RibbonGroupId>(() =>
    navToGroup(activeNav)
  );

  useEffect(() => {
    setActiveRibbonGroup(navToGroup(activeNav));
  }, [activeNav]);

  const handleSaveRate = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseLocaleNumber(ratePer100Input);
    if (!Number.isFinite(val) || val <= 0) {
      setRateError('يرجى إدخال سعر صرف صالح.');
      return;
    }
    const ok = updateExchangeRate(val / 100);
    if (ok) {
      setRateError('');
      setEditingRate(false);
    }
  };

  const convNumericUsd = parseLocaleNumber(convUsd);
  const convIqdResult = Math.round(convNumericUsd * state.activeExchangeRate);

  const ribbonGroups: {
    id: RibbonGroupId;
    label: string;
    icon: typeof ShoppingCart;
    defaultAction: () => void;
    subOps: SubOperationItem[];
  }[] = [
    {
      id: 'sales',
      label: 'المبيعات',
      icon: ShoppingCart,
      defaultAction: () => {
        setSalesFilterHint('ALL');
        setActiveNav('pos');
      },
      subOps: [
        {
          id: 'pos',
          label: 'فاتورة بيع جديدة',
          nav: 'pos',
          onClick: () => setActiveNav('pos'),
        },
        {
          id: 'sales_list',
          label: 'سجل فواتير المبيعات',
          nav: 'sales',
          onClick: () => {
            setSalesFilterHint('ALL');
            setActiveNav('sales');
          },
        },
        {
          id: 'receipt_cust',
          label: 'سند قبض من زبون',
          nav: 'settlement',
          onClick: () =>
            openSettlementPage({
              partyType: 'customer',
              partyId: state.customers[0]?.id || '',
            }),
        },
      ],
    },
    {
      id: 'purchases',
      label: 'المشتريات',
      icon: ShoppingBag,
      defaultAction: () => setActiveNav('purchase'),
      subOps: [
        {
          id: 'purchase_new',
          label: 'فاتورة شراء جديدة',
          nav: 'purchase',
          onClick: () => setActiveNav('purchase'),
        },
        {
          id: 'purchase_inbox',
          label: 'صندوق الفواتير المصورة',
          nav: 'invoices',
          onClick: () => {
            clearActiveInboxSelection();
            setActiveNav('invoices');
          },
        },
        {
          id: 'supplier_list',
          label: 'سجل المشتريات والموردين',
          nav: 'suppliers',
          onClick: () => setActiveNav('suppliers'),
        },
        {
          id: 'pay_sup',
          label: 'سند صرف لمورد',
          nav: 'settlement',
          onClick: () =>
            openSettlementPage({
              partyType: 'supplier',
              partyId: state.suppliers[0]?.id || '',
            }),
        },
      ],
    },
    {
      id: 'invoices',
      label: 'الفواتير',
      icon: Inbox,
      defaultAction: () => {
        clearActiveInboxSelection();
        setActiveNav('invoices');
      },
      subOps: [
        {
          id: 'inbox_all',
          label: 'صندوق وارد الفواتير (قائمة الصور)',
          nav: 'invoices',
          onClick: () => {
            clearActiveInboxSelection();
            setActiveNav('invoices');
          },
        },
        {
          id: 'inbox_to_purchase',
          label: 'إدخال فاتورة شراء يدوية',
          nav: 'purchase',
          onClick: () => setActiveNav('purchase'),
        },
      ],
    },
    {
      id: 'inventory',
      label: 'المخازن',
      icon: Smartphone,
      defaultAction: () => {
        setInventoryLowStockHint(false);
        setActiveNav('inventory');
      },
      subOps: [
        {
          id: 'inv_list',
          label: 'قائمة المواد والمخزون',
          nav: 'inventory',
          onClick: () => {
            setInventoryLowStockHint(false);
            setActiveNav('inventory');
          },
        },
        {
          id: 'inv_low',
          label: 'نواقص المخزون',
          onClick: () => {
            setInventoryLowStockHint(true);
            setActiveNav('inventory');
          },
        },
      ],
    },
    {
      id: 'customers',
      label: 'الزبائن',
      icon: Users,
      defaultAction: () => setActiveNav('customers'),
      subOps: [
        {
          id: 'cust_list',
          label: 'قائمة الزبائن والذمم',
          nav: 'customers',
          onClick: () => setActiveNav('customers'),
        },
        {
          id: 'cust_new',
          label: 'تسجيل زبون جديد',
          onClick: () => openCustomerForm({ mode: 'new', returnTo: activeNav }),
        },
        {
          id: 'cust_pay',
          label: 'قبض من زبون',
          nav: 'settlement',
          onClick: () =>
            openSettlementPage({
              partyType: 'customer',
              partyId: state.customers[0]?.id || '',
            }),
        },
      ],
    },
    {
      id: 'suppliers',
      label: 'الموردين',
      icon: Truck,
      defaultAction: () => setActiveNav('suppliers'),
      subOps: [
        {
          id: 'sup_list',
          label: 'قائمة الموردين والحسابات',
          nav: 'suppliers',
          onClick: () => setActiveNav('suppliers'),
        },
        {
          id: 'sup_new',
          label: 'إضافة مورد جديد',
          onClick: () => openSupplierForm({ mode: 'new', returnTo: activeNav }),
        },
        {
          id: 'sup_pay',
          label: 'تسديد لمورد',
          nav: 'settlement',
          onClick: () =>
            openSettlementPage({
              partyType: 'supplier',
              partyId: state.suppliers[0]?.id || '',
            }),
        },
      ],
    },
    {
      id: 'cashbox',
      label: 'الصندوق',
      icon: Wallet,
      defaultAction: () => setActiveNav('cashbox'),
      subOps: [
        {
          id: 'cashbox_view',
          label: 'الصندوق والحركة النقدية',
          nav: 'cashbox',
          onClick: () => setActiveNav('cashbox'),
        },
        {
          id: 'vouchers',
          label: 'سند قبض / سند صرف',
          nav: 'settlement',
          onClick: () => setActiveNav('settlement'),
        },
        {
          id: 'fx_view',
          label: 'سعر صرف الدولار والتحويل',
          nav: 'exchange',
          onClick: () => setActiveNav('exchange'),
        },
      ],
    },
    {
      id: 'installments',
      label: 'الأقساط',
      icon: CalendarClock,
      defaultAction: () => {
        setSalesFilterHint('installment');
        setActiveNav('sales');
      },
      subOps: [
        {
          id: 'inst_sales',
          label: 'فواتير وجدول الأقساط',
          onClick: () => {
            setSalesFilterHint('installment');
            setActiveNav('sales');
          },
        },
        {
          id: 'inst_collect',
          label: 'تحصيل قسط (سند قبض)',
          nav: 'settlement',
          onClick: () =>
            openSettlementPage({
              partyType: 'customer',
              partyId: state.customers[0]?.id || '',
            }),
        },
        {
          id: 'inst_due',
          label: 'الأقساط المستحقة والملخص',
          nav: 'dashboard',
          onClick: () => setActiveNav('dashboard'),
        },
      ],
    },
    {
      id: 'reports',
      label: 'التقارير',
      icon: BarChart3,
      defaultAction: () => setActiveNav('reports'),
      subOps: [
        {
          id: 'rep_main',
          label: 'التقارير المالية المنفصلة',
          nav: 'reports',
          onClick: () => setActiveNav('reports'),
        },
        {
          id: 'rep_ledger',
          label: 'سجل العمليات المرتب',
          nav: 'ledger',
          onClick: () => setActiveNav('ledger'),
        },
        {
          id: 'rep_audit',
          label: 'سجل التدقيق والمراقبة',
          nav: 'audit',
          onClick: () => setActiveNav('audit'),
        },
        {
          id: 'rep_dash',
          label: 'لوحة المعلومات اليومية',
          nav: 'dashboard',
          onClick: () => setActiveNav('dashboard'),
        },
      ],
    },
    {
      id: 'settings',
      label: 'الإعدادات',
      icon: Settings,
      defaultAction: () => setActiveNav('settings'),
      subOps: [
        {
          id: 'set_main',
          label: 'الصلاحيات والإعدادات',
          nav: 'settings',
          onClick: () => setActiveNav('settings'),
        },
        {
          id: 'set_print',
          label: 'الطباعة والتحكم بها',
          nav: 'print',
          onClick: () => setActiveNav('print'),
        },
        {
          id: 'set_backup',
          label: 'النسخ الاحتياطية JSON',
          nav: 'backup',
          onClick: () => setActiveNav('backup'),
        },
        {
          id: 'set_dev',
          label: 'صلاحيات المبرمج والتفعيل',
          nav: 'developer',
          onClick: () => setActiveNav('developer'),
        },
      ],
    },
  ];

  const currentGroupObj =
    ribbonGroups.find((g) => g.id === activeRibbonGroup) || ribbonGroups[0];

  return (
    <header className="bg-white border-b border-slate-200 no-print">
      {/* Row 1: Compact Utility Bar (Brand, Display Currency, Rate, User) */}
      <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setActiveNav('dashboard')}
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 whitespace-nowrap"
          >
            <Home className="w-3.5 h-3.5" />
            <span>{state.printSettings.storeName}</span>
          </button>
          <span className="text-xs font-semibold text-slate-600 hidden sm:inline truncate">
            برنامج الكفيل للمبيعات والمخزون · {SECTION_TITLES[activeNav]}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Display Currency Toggle */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setDisplayMode('ORIGINAL')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                displayMode === 'ORIGINAL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الأصل
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('USD')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                displayMode === 'USD'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              دولار ($)
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('IQD')}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                displayMode === 'IQD'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              دينار (د.ع)
            </button>
          </div>

          <button
            type="button"
            onClick={toggleQuickCurrency}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 whitespace-nowrap"
            title="اضغط للتحويل السريع بين عرض الدولار والدينار"
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span>تحويل ($ ↔ د.ع)</span>
          </button>

          {/* Currency Calculator */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowConverter((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Calculator className="w-3 h-3 text-slate-600" />
              <span>حاسبة الصرف</span>
            </button>
            {showConverter && (
              <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 z-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">محول الدولار ↔ الدينار</span>
                  <button
                    type="button"
                    onClick={() => setShowConverter(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">المبلغ بالدولار ($)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={convUsd}
                    onChange={(e) => setConvUsd(sanitizeNumericInput(e.target.value, true))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-num"
                  />
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between">
                  <span className="text-xs text-slate-600">يعادل بالعراقي:</span>
                  <span className="text-sm font-bold text-slate-900 font-num">
                    {formatIQD(convIqdResult)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConvUsd('100')}
                    className="py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 font-num"
                  >
                    {formatUSD(100)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConvUsd('500')}
                    className="py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 font-num"
                  >
                    {formatUSD(500)}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Exchange Rate */}
          {!editingRate ? (
            <button
              type="button"
              onClick={() => {
                if (!hasPermission('canChangeExchangeRate')) return;
                setRatePer100Input(String(Math.round(state.activeExchangeRate * 100)));
                setRateError('');
                setEditingRate(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-800 whitespace-nowrap"
            >
              <RefreshCw className="w-3 h-3 text-slate-500" />
              <span className="font-num font-semibold text-slate-900">
                {formatRatePer100(state.activeExchangeRate)}
              </span>
            </button>
          ) : (
            <form onSubmit={handleSaveRate} className="flex items-center gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={ratePer100Input}
                onChange={(e) => {
                  setRatePer100Input(sanitizeNumericInput(e.target.value, false));
                  setRateError('');
                }}
                className={`w-24 px-2 py-1 text-xs border rounded-md font-num ${
                  rateError ? 'border-red-500 bg-red-50/40' : 'border-blue-500'
                }`}
                autoFocus
              />
              <button type="submit" className="p-1 bg-slate-900 text-white rounded-md">
                <Check className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingRate(false);
                  setRateError('');
                }}
                className="p-1 border border-slate-200 rounded-md text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            </form>
          )}

          {/* Inbox Notifications Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications((v) => !v)}
              className="relative inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              title="إشعارات الفواتير الواردة"
            >
              <Bell className="w-3.5 h-3.5 text-slate-700" />
              <span className="hidden sm:inline">الإشعارات</span>
              {inboxPendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-num font-bold leading-none">
                  {inboxPendingCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute left-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-50 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-900">
                    إشعارات صندوق الفواتير ({inboxNotifications.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {inboxNotifications.length === 0 ? (
                  <div className="py-5 text-center text-xs text-slate-500">
                    لا توجد إشعارات فواتير معلقة حالياً.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {inboxNotifications.map((notif) => (
                      <button
                        key={notif.id}
                        type="button"
                        onClick={() => {
                          setShowNotifications(false);
                          openInboxReview(notif.inboxId);
                        }}
                        className={`w-full text-right p-2.5 rounded-lg border transition-colors ${
                          notif.kind === 'failed'
                            ? 'bg-red-50 border-red-200 hover:bg-red-100/70'
                            : notif.kind === 'stale_over_day'
                            ? 'bg-amber-50 border-amber-200 hover:bg-amber-100/70'
                            : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70'
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900">{notif.title}</div>
                        <div className="text-[11px] text-slate-600 mt-0.5">{notif.subtitle}</div>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowNotifications(false);
                    clearActiveInboxSelection();
                    setActiveNav('invoices');
                  }}
                  className="w-full py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                >
                  فتح صندوق الفواتير بالكامل
                </button>
              </div>
            )}
          </div>

          {/* User + Logout */}
          {currentUser && (
            <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                {currentUser.role === 'admin' ? (
                  <Shield className="w-3.5 h-3.5 text-blue-700" />
                ) : (
                  <User className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>{currentUser.name}</span>
                <span className="text-slate-400">({getRoleDisplayLabel(currentUser.role)})</span>
              </span>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
                title="تبديل الحساب / خروج"
              >
                <LogOut className="w-3 h-3" />
                <span>خروج</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Large Icon Ribbon */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 overflow-x-auto">
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2 min-w-[820px]">
          {ribbonGroups.map((group) => {
            const Icon = group.icon;
            const isSelected = activeRibbonGroup === group.id;
            const showInboxBadge = group.id === 'invoices' && inboxPendingCount > 0;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setActiveRibbonGroup(group.id);
                  group.defaultAction();
                }}
                className={`relative flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-xl border text-xs font-bold transition-colors ${
                  isSelected
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {showInboxBadge && (
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-num font-bold leading-none">
                    {inboxPendingCount}
                  </span>
                )}
                <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-slate-600'}`} />
                <span className="whitespace-nowrap">{group.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 3: Sub-Operations Bar directly under the active Ribbon group */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[11px] font-bold text-slate-500 ml-1">
          عمليات {currentGroupObj.label}:
        </span>
        {currentGroupObj.subOps.map((sub) => {
          const isSubActive = sub.nav && activeNav === sub.nav;
          return (
            <button
              key={sub.id}
              type="button"
              onClick={sub.onClick}
              className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors whitespace-nowrap ${
                isSubActive
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {sub.label}
            </button>
          );
        })}
      </div>

      {/* Row 4: Open Pages Tabs Bar */}
      <div className="px-4 pt-2 bg-slate-100/80 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto">
        {openTabs.map((tabNav) => {
          const isCurrent = activeNav === tabNav;
          return (
            <div
              key={tabNav}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg border-t border-x text-xs font-bold whitespace-nowrap transition-colors ${
                isCurrent
                  ? 'bg-slate-50 border-slate-300 text-slate-900 -mb-px pb-2'
                  : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveNav(tabNav)}
                className="truncate inline-flex items-center gap-1"
              >
                <span>{SECTION_TITLES[tabNav]}</span>
                {tabNav === 'invoices' && inboxPendingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-num font-bold leading-none">
                    {inboxPendingCount}
                  </span>
                )}
              </button>
              {openTabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tabNav);
                  }}
                  title="إغلاق التبويب"
                  className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </header>
  );
}
