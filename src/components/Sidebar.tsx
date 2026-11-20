import {
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  ReceiptText,
  Smartphone,
  Users,
  Truck,
  HandCoins,
  Wallet,
  ArrowLeftRight,
  Printer,
  Download,
  ArrowDownUp,
  BarChart3,
  ClipboardList,
  ShieldCheck,
  Settings,
  LogOut,
  Shield,
  User,
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { getRoleDisplayLabel } from '../data/seedData';
import { NavSection } from '../types/erp';

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'لوحة المعلومات اليومية', icon: LayoutDashboard },
  { id: 'pos', label: 'فاتورة بيع (نقطة البيع)', icon: ShoppingCart },
  { id: 'sales', label: 'سجل المبيعات والأقساط', icon: ReceiptText },
  { id: 'purchase', label: 'فاتورة شراء جديدة', icon: ShoppingBag },
  { id: 'inventory', label: 'إدارة المخزون', icon: Smartphone },
  { id: 'customers', label: 'الزبائن', icon: Users },
  { id: 'suppliers', label: 'الموردون', icon: Truck },
  { id: 'settlement', label: 'التسديد والقبض', icon: HandCoins },
  { id: 'cashbox', label: 'الصندوق والحركة النقدية', icon: Wallet },
  { id: 'exchange', label: 'سعر صرف الدولار', icon: ArrowLeftRight },
  { id: 'print', label: 'الطباعة والتحكم بها', icon: Printer },
  { id: 'backup', label: 'النسخ الاحتياطية JSON', icon: Download },
  { id: 'ledger', label: 'سجل العمليات المرتب', icon: ArrowDownUp },
  { id: 'reports', label: 'التقارير المالية المنفصلة', icon: BarChart3 },
  { id: 'audit', label: 'سجل التدقيق والمراقبة', icon: ClipboardList },
  { id: 'developer', label: 'صلاحيات المبرمج والتفعيل', icon: ShieldCheck },
  { id: 'settings', label: 'الصلاحيات والإعدادات', icon: Settings },
];

export function Sidebar() {
  const { state, activeNav, setActiveNav, currentUser, logout } = useERP();

  return (
    <aside className="w-68 shrink-0 bg-white border-l border-slate-200 flex flex-col justify-between min-h-screen no-print">
      <div>
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="text-base font-bold text-slate-900 truncate">
            {state.printSettings.storeName}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            برنامج الكفيل لإدارة المبيعات والمخزون
          </div>
        </div>

        <nav className="p-3 space-y-1 max-h-[calc(100vh-140px)] overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {currentUser && (
        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-2.5">
            {currentUser.role === 'admin' ? (
              <Shield className="w-4 h-4 text-blue-700 shrink-0" />
            ) : (
              <User className="w-4 h-4 text-slate-600 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 truncate">{currentUser.name}</div>
              <div className="text-[11px] text-slate-500">
                {getRoleDisplayLabel(currentUser.role)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تبديل الحساب / خروج</span>
          </button>
        </div>
      )}
    </aside>
  );
}
