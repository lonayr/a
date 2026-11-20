import { ArrowRight, ChevronLeft, Home } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { NavSection } from '../types/erp';

const NAV_BREADCRUMB_LABELS: Record<NavSection, string> = {
  dashboard: 'لوحة المعلومات اليومية',
  pos: 'فاتورة بيع جديدة (نقطة البيع)',
  sales: 'سجل المبيعات والأقساط',
  purchase: 'فاتورة شراء جديدة',
  invoices: 'صندوق وارد الفواتير',
  inventory: 'إدارة المخزون والمنتجات',
  customers: 'الزبائن والذمم',
  suppliers: 'الموردون والمشتريات',
  settlement: 'التسديد واستلام المبالغ',
  cashbox: 'الصندوق والحركة النقدية',
  exchange: 'سعر صرف الدولار',
  print: 'إعدادات الطباعة',
  backup: 'النسخ الاحتياطية JSON',
  ledger: 'سجل العمليات المرتب',
  reports: 'التقارير المالية',
  audit: 'سجل التدقيق والمراقبة',
  developer: 'صلاحيات المبرمج والتفعيل',
  settings: 'الصلاحيات والإعدادات',
};

export function PageHeaderBar() {
  const { activeNav, canGoBack, goBack, setActiveNav, subPageTitle } = useERP();

  const handleBack = () => {
    if (canGoBack) {
      goBack();
    } else if (activeNav !== 'dashboard') {
      setActiveNav('dashboard');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200/80 no-print">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
        <button
          type="button"
          onClick={() => setActiveNav('dashboard')}
          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium whitespace-nowrap"
        >
          <Home className="w-3.5 h-3.5" />
          <span>الكفيل</span>
        </button>

        <ChevronLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />

        <span
          className={`truncate ${
            subPageTitle ? 'text-slate-600 font-medium' : 'text-slate-900 font-bold'
          }`}
        >
          {NAV_BREADCRUMB_LABELS[activeNav]}
        </span>

        {subPageTitle && (
          <>
            <ChevronLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-900 font-bold truncate">{subPageTitle}</span>
          </>
        )}
      </nav>

      {(canGoBack || activeNav !== 'dashboard') && (
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          <span>رجوع</span>
        </button>
      )}
    </div>
  );
}
