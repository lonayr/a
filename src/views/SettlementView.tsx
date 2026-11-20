import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  AlertCircle,
  Ban,
  CheckCircle2,
  Printer,
  Search,
  Save,
  RotateCcw,
  Plus,
  ArrowRight,
  UserCheck,
  Truck,
  XCircle,
} from 'lucide-react';
import { PaymentTransaction } from '../types/erp';
import { useERP } from '../context/ERPContext';
import {
  calculateSettlementFX,
  formatCurrency,
  formatIQD,
  formatRatePer100,
  formatUSD,
} from '../utils/currency';
import {
  normalizeArabicDigits,
  parseLocaleNumber,
  sanitizeNumericInput,
} from '../utils/numbers';
import { amountToArabicTafqeet } from '../utils/arabicWords';

export function SettlementView() {
  const {
    state,
    settlementTarget,
    clearSettlementTarget,
    recordSettlement,
    cancelPaymentTransaction,
    getCustomerBalances,
    getSupplierBalances,
    openPrintPreview,
    hasPermission,
    goBack,
    notify,
    setHasUnsavedChanges,
  } = useERP();

  const canReceive = hasPermission('canReceivePayments');
  const canPaySuppliers = hasPermission('canPaySuppliers');
  const canOverride = hasPermission('canOverrideFXDiff');

  const [partyType, setPartyType] = useState<'customer' | 'supplier'>(() => {
    if (settlementTarget?.partyType) return settlementTarget.partyType;
    if (canReceive) return 'customer';
    return 'supplier';
  });
  const [partySearch, setPartySearch] = useState('');
  const [selectedPartyId, setSelectedPartyId] = useState<string>(
    settlementTarget?.partyId || state.customers[0]?.id || ''
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(
    settlementTarget?.invoiceId || ''
  );
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string>(
    settlementTarget?.installmentId || ''
  );

  const [paidUSD, setPaidUSD] = useState<string>('0');
  const [paidIQD, setPaidIQD] = useState<string>('0');
  const [ratePer100, setRatePer100] = useState<string>(
    String(Math.round(state.activeExchangeRate * 100))
  );
  const [useManualOverride, setUseManualOverride] = useState(false);
  const [manualSettled, setManualSettled] = useState<string>('');
  const [manualFxDiff, setManualFxDiff] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [lastCreatedVouchers, setLastCreatedVouchers] = useState<PaymentTransaction[]>([]);
  const [formErrors, setFormErrors] = useState<{
    party?: string;
    amount?: string;
    rate?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline Voucher Cancellation Bar
  const [cancellingVoucherId, setCancellingVoucherId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Refs for keyboard Enter progression
  const partySearchRef = useRef<HTMLInputElement | null>(null);
  const paidUSDRef = useRef<HTMLInputElement | null>(null);
  const paidIQDRef = useRef<HTMLInputElement | null>(null);
  const rateRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTimeout(() => {
      if (settlementTarget) paidUSDRef.current?.focus();
      else partySearchRef.current?.focus();
    }, 30);
  }, [settlementTarget]);

  // Apply external settlement target
  useEffect(() => {
    if (!settlementTarget) return;
    setPartyType(settlementTarget.partyType);
    setSelectedPartyId(settlementTarget.partyId);
    setSelectedInvoiceId(settlementTarget.invoiceId || '');
    setSelectedInstallmentId(settlementTarget.installmentId || '');
    setRatePer100(String(Math.round(state.activeExchangeRate * 100)));

    if (settlementTarget.invoiceCurrency) {
      const sug = settlementTarget.suggestedAmount ?? settlementTarget.remainingAmount ?? 0;
      if (settlementTarget.invoiceCurrency === 'USD') {
        setPaidUSD(sug > 0 ? String(sug) : '0');
        setPaidIQD('0');
      } else {
        setPaidUSD('0');
        setPaidIQD(sug > 0 ? String(Math.round(sug)) : '0');
      }
    }
    setUseManualOverride(false);
    setManualSettled('');
    setManualFxDiff('');
    setNotes('');
    clearSettlementTarget();
  }, [settlementTarget, state.activeExchangeRate, clearSettlementTarget]);

  useEffect(() => {
    setRatePer100(String(Math.round(state.activeExchangeRate * 100)));
  }, [state.activeExchangeRate]);

  // Filtered parties
  const filteredCustomers = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    return state.customers.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [state.customers, partySearch]);

  const filteredSuppliers = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    return state.suppliers.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
    );
  }, [state.suppliers, partySearch]);

  // Ensure selectedPartyId stays valid
  useEffect(() => {
    if (partyType === 'customer') {
      const exists = state.customers.some((c) => c.id === selectedPartyId);
      if (!exists) {
        setSelectedPartyId(state.customers[0]?.id || '');
        setSelectedInvoiceId('');
        setSelectedInstallmentId('');
      }
    } else {
      const exists = state.suppliers.some((s) => s.id === selectedPartyId);
      if (!exists) {
        setSelectedPartyId(state.suppliers[0]?.id || '');
        setSelectedInvoiceId('');
        setSelectedInstallmentId('');
      }
    }
  }, [partyType, selectedPartyId, state.customers, state.suppliers]);

  const selectedCustomer = useMemo(
    () =>
      partyType === 'customer'
        ? state.customers.find((c) => c.id === selectedPartyId) || null
        : null,
    [partyType, state.customers, selectedPartyId]
  );

  const selectedSupplier = useMemo(
    () =>
      partyType === 'supplier'
        ? state.suppliers.find((s) => s.id === selectedPartyId) || null
        : null,
    [partyType, state.suppliers, selectedPartyId]
  );

  const partyBalances = useMemo(() => {
    if (!selectedPartyId) return { usd: 0, iqd: 0 };
    return partyType === 'customer'
      ? getCustomerBalances(selectedPartyId)
      : getSupplierBalances(selectedPartyId);
  }, [partyType, selectedPartyId, getCustomerBalances, getSupplierBalances]);

  const openSales = useMemo(() => {
    if (partyType !== 'customer' || !selectedPartyId) return [];
    return state.sales
      .filter(
        (s) => s.status !== 'cancelled' && s.customerId === selectedPartyId && s.remainingAmount > 0
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [partyType, selectedPartyId, state.sales]);

  const openPurchases = useMemo(() => {
    if (partyType !== 'supplier' || !selectedPartyId) return [];
    return state.purchases
      .filter(
        (p) =>
          p.status !== 'cancelled' && p.supplierId === selectedPartyId && p.remainingAmount > 0
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [partyType, selectedPartyId, state.purchases]);

  const selectedSale = useMemo(
    () =>
      partyType === 'customer' && selectedInvoiceId
        ? openSales.find((s) => s.id === selectedInvoiceId) || null
        : null,
    [partyType, selectedInvoiceId, openSales]
  );

  const selectedPurchase = useMemo(
    () =>
      partyType === 'supplier' && selectedInvoiceId
        ? openPurchases.find((p) => p.id === selectedInvoiceId) || null
        : null,
    [partyType, selectedInvoiceId, openPurchases]
  );

  const activeInvoiceMeta = useMemo(() => {
    if (selectedSale) {
      return {
        id: selectedSale.id,
        number: selectedSale.invoiceNumber,
        currency: selectedSale.currency,
        exchangeRate: selectedSale.exchangeRateAtSale,
        remaining: selectedSale.remainingAmount,
      };
    }
    if (selectedPurchase) {
      return {
        id: selectedPurchase.id,
        number: selectedPurchase.invoiceNumber,
        currency: selectedPurchase.currency,
        exchangeRate: selectedPurchase.exchangeRateAtPurchase,
        remaining: selectedPurchase.remainingAmount,
      };
    }
    return null;
  }, [selectedSale, selectedPurchase]);

  const parsedRatePer1USD = useMemo(() => {
    const val = parseLocaleNumber(ratePer100);
    return val > 0 ? val / 100 : state.activeExchangeRate;
  }, [ratePer100, state.activeExchangeRate]);

  const numericUSD = Math.max(0, parseLocaleNumber(paidUSD));
  const numericIQD = Math.max(0, Math.round(parseLocaleNumber(paidIQD)));

  useEffect(() => {
    const dirty = numericUSD > 0 || numericIQD > 0 || notes.trim() !== '';
    setHasUnsavedChanges(dirty);
    return () => setHasUnsavedChanges(false);
  }, [numericUSD, numericIQD, notes, setHasUnsavedChanges]);

  const fxPreview = useMemo(() => {
    if (!activeInvoiceMeta) return null;
    return calculateSettlementFX({
      partyType,
      invoiceCurrency: activeInvoiceMeta.currency,
      invoiceExchangeRate: activeInvoiceMeta.exchangeRate,
      paymentExchangeRate: parsedRatePer1USD,
      paidUSD: numericUSD,
      paidIQD: numericIQD,
      manualSettledAmount:
        useManualOverride && manualSettled !== '' ? parseLocaleNumber(manualSettled) : null,
      manualFxDiffIQD:
        useManualOverride && manualFxDiff !== '' ? parseLocaleNumber(manualFxDiff) : null,
    });
  }, [
    activeInvoiceMeta,
    partyType,
    parsedRatePer1USD,
    numericUSD,
    numericIQD,
    useManualOverride,
    manualSettled,
    manualFxDiff,
  ]);

  const combinedEquivalent = useMemo(() => {
    const totalInUSD = Number((numericUSD + numericIQD / parsedRatePer1USD).toFixed(2));
    const totalInIQD = Math.round(numericUSD * parsedRatePer1USD + numericIQD);
    return { totalInUSD, totalInIQD };
  }, [numericUSD, numericIQD, parsedRatePer1USD]);

  const remainingAfterPayment = useMemo(() => {
    if (activeInvoiceMeta && fxPreview) {
      const rem = Math.max(0, activeInvoiceMeta.remaining - fxPreview.settledInInvoiceCurrency);
      return activeInvoiceMeta.currency === 'USD'
        ? formatUSD(Number(rem.toFixed(2)))
        : formatIQD(Math.round(rem));
    }
    const remUsd = Math.max(0, Number((partyBalances.usd - combinedEquivalent.totalInUSD).toFixed(2)));
    const remIqd = Math.max(0, Math.round(partyBalances.iqd - combinedEquivalent.totalInIQD));
    if (partyBalances.usd > 0 && partyBalances.iqd === 0) return formatUSD(remUsd);
    if (partyBalances.iqd > 0 && partyBalances.usd === 0) return formatIQD(remIqd);
    return `${formatUSD(Math.max(0, partyBalances.usd - numericUSD))} · ${formatIQD(
      Math.max(0, partyBalances.iqd - numericIQD)
    )}`;
  }, [activeInvoiceMeta, fxPreview, partyBalances, combinedEquivalent, numericUSD, numericIQD]);

  const fillRemainingUSD = () => {
    if (activeInvoiceMeta) {
      const needUSD =
        activeInvoiceMeta.currency === 'USD'
          ? activeInvoiceMeta.remaining
          : Number((activeInvoiceMeta.remaining / parsedRatePer1USD).toFixed(2));
      setPaidUSD(String(needUSD));
      setPaidIQD('0');
    } else {
      const totalNeedUSD = Number(
        (partyBalances.usd + partyBalances.iqd / parsedRatePer1USD).toFixed(2)
      );
      setPaidUSD(String(totalNeedUSD));
      setPaidIQD('0');
    }
    paidUSDRef.current?.focus();
  };

  const fillRemainingIQD = () => {
    if (activeInvoiceMeta) {
      const needIQD =
        activeInvoiceMeta.currency === 'IQD'
          ? activeInvoiceMeta.remaining
          : Math.round(activeInvoiceMeta.remaining * parsedRatePer1USD);
      setPaidUSD('0');
      setPaidIQD(String(needIQD));
    } else {
      const totalNeedIQD = Math.round(
        partyBalances.usd * parsedRatePer1USD + partyBalances.iqd
      );
      setPaidUSD('0');
      setPaidIQD(String(totalNeedIQD));
    }
    paidIQDRef.current?.focus();
  };

  const selectParty = (id: string) => {
    setSelectedPartyId(id);
    setSelectedInvoiceId('');
    setSelectedInstallmentId('');
    setUseManualOverride(false);
    setManualSettled('');
    setManualFxDiff('');
    setFormErrors((prev) => ({ ...prev, party: undefined }));
  };

  const selectInvoiceOption = (invId: string) => {
    setSelectedInvoiceId(invId);
    setSelectedInstallmentId('');
    setUseManualOverride(false);
    setManualSettled('');
    setManualFxDiff('');
    if (!invId) return;

    if (partyType === 'customer') {
      const s = openSales.find((x) => x.id === invId);
      if (s) {
        if (s.currency === 'USD') {
          setPaidUSD(String(s.remainingAmount));
          setPaidIQD('0');
        } else {
          setPaidUSD('0');
          setPaidIQD(String(Math.round(s.remainingAmount)));
        }
      }
    } else {
      const p = openPurchases.find((x) => x.id === invId);
      if (p) {
        if (p.currency === 'USD') {
          setPaidUSD(String(p.remainingAmount));
          setPaidIQD('0');
        } else {
          setPaidUSD('0');
          setPaidIQD(String(Math.round(p.remainingAmount)));
        }
      }
    }
  };

  const clearVoucherInputs = useCallback(() => {
    setPaidUSD('0');
    setPaidIQD('0');
    setSelectedInvoiceId('');
    setSelectedInstallmentId('');
    setUseManualOverride(false);
    setManualSettled('');
    setManualFxDiff('');
    setNotes('');
    setFormErrors({});
    paidUSDRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (openPrintAfter: boolean) => {
      if (isSubmitting) return;
      const errs: { party?: string; amount?: string; rate?: string } = {};
      if (!selectedPartyId) {
        errs.party = partyType === 'customer' ? 'يرجى اختيار الزبون أولاً.' : 'يرجى اختيار المورد أولاً.';
      }
      if (numericUSD <= 0 && numericIQD <= 0) {
        errs.amount = 'يرجى إدخال مبلغ بالدولار أو بالدينار (أكبر من صفر).';
      }
      if (parseLocaleNumber(ratePer100) <= 0) {
        errs.rate = 'سعر الصرف يجب أن يكون أكبر من صفر.';
      }
      if (Object.keys(errs).length > 0) {
        setFormErrors(errs);
        notify(errs.party || errs.amount || errs.rate || 'يرجى استكمال الحقول الإلزامية.', 'error');
        return;
      }

      setIsSubmitting(true);
      const res = recordSettlement({
        partyType,
        partyId: selectedPartyId,
        invoiceId: selectedInvoiceId || undefined,
        paidUSD: numericUSD,
        paidIQD: numericIQD,
        paymentExchangeRate: parsedRatePer1USD,
        manualSettledAmount:
          activeInvoiceMeta && useManualOverride && manualSettled !== ''
            ? parseLocaleNumber(manualSettled)
            : null,
        manualFxDiffIQD:
          activeInvoiceMeta && useManualOverride && manualFxDiff !== ''
            ? parseLocaleNumber(manualFxDiff)
            : null,
        installmentId: selectedInstallmentId || undefined,
        notes: notes.trim() || undefined,
      });
      setIsSubmitting(false);

      if (!res.ok) {
        notify(res.error || 'تعذر تسجيل عملية التسديد.', 'error');
        return;
      }

      const created = res.payments || (res.payment ? [res.payment] : []);
      setHasUnsavedChanges(false);
      setFormErrors({});
      setLastCreatedVouchers(created);
      clearVoucherInputs();

      if (openPrintAfter && created[0]) {
        openPrintPreview({ kind: 'payment', data: created[0] });
      }
    },
    [
      isSubmitting,
      selectedPartyId,
      partyType,
      numericUSD,
      numericIQD,
      ratePer100,
      notify,
      recordSettlement,
      selectedInvoiceId,
      parsedRatePer1USD,
      activeInvoiceMeta,
      useManualOverride,
      manualSettled,
      manualFxDiff,
      selectedInstallmentId,
      notes,
      setHasUnsavedChanges,
      clearVoucherInputs,
      openPrintPreview,
    ]
  );

  // Global F9 save shortcut (never save on Enter)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        handleSubmit(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSubmit]);

  const partyVouchers = useMemo(() => {
    return state.payments.filter(
      (p) => p.partyType === partyType && (!selectedPartyId || p.partyId === selectedPartyId)
    );
  }, [state.payments, partyType, selectedPartyId]);

  const cancellingVoucher = useMemo(
    () =>
      cancellingVoucherId
        ? state.payments.find((p) => p.id === cancellingVoucherId) || null
        : null,
    [cancellingVoucherId, state.payments]
  );

  const handleConfirmCancelVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingVoucherId || isCancelling) return;
    if (!cancelReason.trim()) {
      setCancelError('يرجى كتابة سبب إلغاء السند (حقل إلزامي).');
      return;
    }
    setIsCancelling(true);
    const res = cancelPaymentTransaction(cancellingVoucherId, cancelReason);
    setIsCancelling(false);
    if (!res.ok) {
      setCancelError(res.error || 'تعذر إلغاء السند.');
      return;
    }
    setCancellingVoucherId(null);
    setCancelReason('');
    setCancelError('');
  };

  const partyNameDisplay =
    partyType === 'customer'
      ? selectedCustomer?.name || 'غير محدد'
      : selectedSupplier?.name || 'غير محدد';

  const hasPermissionForMode = partyType === 'customer' ? canReceive : canPaySuppliers;

  return (
    <div className="space-y-4">
      {/* 1. COMPACT CLASSIC VOUCHER HEADER */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Voucher Type Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setPartyType('customer');
                setPartySearch('');
                setLastCreatedVouchers([]);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 font-bold rounded-md transition-colors whitespace-nowrap ${
                partyType === 'customer'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>سند قبض (من زبون)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPartyType('supplier');
                setPartySearch('');
                setLastCreatedVouchers([]);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 font-bold rounded-md transition-colors whitespace-nowrap ${
                partyType === 'supplier'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>سند صرف (لمورد)</span>
            </button>
          </div>

          {/* Quick Fill Buttons */}
          {hasPermissionForMode && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={fillRemainingUSD}
                className="h-8 px-3 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                كامل المبلغ ($)
              </button>
              <button
                type="button"
                onClick={fillRemainingIQD}
                className="h-8 px-3 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                كامل المبلغ (د.ع)
              </button>
              <button
                type="button"
                onClick={clearVoucherInputs}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"
              >
                تصفير
              </button>
            </div>
          )}
        </div>

        {/* Party Search + Selector Row */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-4 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              ref={partySearchRef}
              type="text"
              value={partySearch}
              onChange={(e) => setPartySearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (partyType === 'customer' && filteredCustomers[0]) {
                    selectParty(filteredCustomers[0].id);
                  } else if (partyType === 'supplier' && filteredSuppliers[0]) {
                    selectParty(filteredSuppliers[0].id);
                  }
                  paidUSDRef.current?.focus();
                  paidUSDRef.current?.select();
                } else if (e.key === 'Escape') {
                  setPartySearch('');
                }
              }}
              placeholder={
                partyType === 'customer'
                  ? 'ابحث عن زبون بالاسم أو الهاتف...'
                  : 'ابحث عن مورد أو شركة...'
              }
              className="w-full h-9 pr-8 pl-3 border border-slate-300 rounded-lg bg-white text-xs"
            />
          </div>

          <div className="md:col-span-4">
            <select
              value={selectedPartyId}
              onChange={(e) => selectParty(e.target.value)}
              className={`w-full h-9 px-3 border rounded-lg bg-white font-bold text-slate-900 ${
                formErrors.party ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
              }`}
            >
              <option value="">
                {partyType === 'customer' ? 'اختر الزبون...' : 'اختر المورد...'}
              </option>
              {partyType === 'customer'
                ? filteredCustomers.map((c) => {
                    const bal = getCustomerBalances(c.id);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone || c.code}) — {bal.usd > 0 ? `$${bal.usd} ` : ''}
                        {bal.iqd > 0 ? `${bal.iqd.toLocaleString()} د.ع` : ''}
                        {bal.usd === 0 && bal.iqd === 0 ? 'خالص' : ''}
                      </option>
                    );
                  })
                : filteredSuppliers.map((s) => {
                    const bal = getSupplierBalances(s.id);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.company || s.code}) — {bal.usd > 0 ? `$${bal.usd} ` : ''}
                        {bal.iqd > 0 ? `${bal.iqd.toLocaleString()} د.ع` : ''}
                        {bal.usd === 0 && bal.iqd === 0 ? 'مسدد' : ''}
                      </option>
                    );
                  })}
            </select>
          </div>

          <div className="md:col-span-4">
            <select
              value={selectedInvoiceId}
              onChange={(e) => selectInvoiceOption(e.target.value)}
              className="w-full h-9 px-3 border border-slate-300 rounded-lg bg-white font-semibold text-slate-800"
            >
              <option value="">تسديد عام على الحساب (توزيع آلي على الأقدم)</option>
              {partyType === 'customer'
                ? openSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      فاتورة {s.invoiceNumber} — متبقي{' '}
                      {formatCurrency(s.remainingAmount, s.currency)}
                    </option>
                  ))
                : openPurchases.map((p) => (
                    <option key={p.id} value={p.id}>
                      توريد {p.invoiceNumber} — متبقي{' '}
                      {formatCurrency(p.remainingAmount, p.currency)}
                    </option>
                  ))}
            </select>
          </div>
        </div>

        {/* Specific Installment Selector if selected sale has installments */}
        {selectedSale && selectedSale.installments.some((i) => i.status !== 'paid') && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-600">تخصيص قسط معين (اختياري):</span>
            <select
              value={selectedInstallmentId}
              onChange={(e) => {
                const instId = e.target.value;
                setSelectedInstallmentId(instId);
                const inst = selectedSale.installments.find((i) => i.id === instId);
                if (inst) {
                  const left = inst.amount - inst.paidAmount;
                  if (selectedSale.currency === 'USD') {
                    setPaidUSD(String(Number(left.toFixed(2))));
                    setPaidIQD('0');
                  } else {
                    setPaidUSD('0');
                    setPaidIQD(String(Math.round(left)));
                  }
                }
              }}
              className="h-8 px-3 border border-slate-300 rounded-lg bg-white text-xs font-num"
            >
              <option value="">توزيع تلقائي على أقساط الفاتورة</option>
              {selectedSale.installments
                .filter((i) => i.status !== 'paid')
                .map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    قسط #{inst.index} — استحقاق {inst.dueDate} — متبقي{' '}
                    {formatCurrency(inst.amount - inst.paidAmount, selectedSale.currency)}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Created Vouchers Confirmation */}
      {lastCreatedVouchers.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              تم اعتماد{' '}
              <strong className="font-num">
                {lastCreatedVouchers.map((v) => v.voucherNumber).join('، ')}
              </strong>{' '}
              لصالح <strong>{lastCreatedVouchers[0].partyName}</strong> وتحديث الأرصدة فوراً.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastCreatedVouchers.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => openPrintPreview({ kind: 'payment', data: v })}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>
                  {lastCreatedVouchers.length > 1 ? `طباعة ${v.voucherNumber}` : 'طباعة السند'}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setLastCreatedVouchers([])}
              className="text-slate-600 hover:text-slate-900 px-2"
            >
              إخفاء
            </button>
          </div>
        </div>
      )}

      {!hasPermissionForMode ? (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            {partyType === 'customer'
              ? 'ليس لديك صلاحية استلام وقبض المدفوعات من الزبائن.'
              : 'ليس لديك صلاحية تسديد مستحقات الموردين.'}
          </span>
        </div>
      ) : (
        <>
          {/* 2. CLASSIC VOUCHER KEYBOARD ENTRY TABLE */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3 text-right font-bold">الجهة المستهدفة</th>
                    <th className="py-3 px-3 text-left font-bold w-40">
                      {partyType === 'customer' ? 'المستلم بالدولار ($)' : 'المدفوع بالدولار ($)'}
                    </th>
                    <th className="py-3 px-3 text-left font-bold w-44">
                      {partyType === 'customer' ? 'المستلم بالدينار (د.ع)' : 'المدفوع بالدينار (د.ع)'}
                    </th>
                    <th className="py-3 px-3 text-center font-bold w-32">سعر الصرف (100$)</th>
                    <th className="py-3 px-3 text-right font-bold">ملاحظات السند</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/60">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 text-sm">{partyNameDisplay}</div>
                      <div className="text-[11px] text-slate-500">
                        {activeInvoiceMeta
                          ? `عن الفاتورة ${activeInvoiceMeta.number} (${activeInvoiceMeta.currency})`
                          : 'توزيع آلي على الرصيد المفتوح'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <input
                        ref={paidUSDRef}
                        type="text"
                        inputMode="decimal"
                        value={paidUSD}
                        onChange={(e) => {
                          setPaidUSD(sanitizeNumericInput(e.target.value, true));
                          if (formErrors.amount)
                            setFormErrors((prev) => ({ ...prev, amount: undefined }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            paidIQDRef.current?.focus();
                            paidIQDRef.current?.select();
                          } else if (e.key === 'Escape') {
                            setPaidUSD('0');
                          }
                        }}
                        className={`w-full h-10 px-3 border rounded-lg bg-white font-num font-bold text-base text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 ${
                          formErrors.amount ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                        }`}
                      />
                    </td>
                    <td className="py-3 px-3">
                      <input
                        ref={paidIQDRef}
                        type="text"
                        inputMode="numeric"
                        value={paidIQD}
                        onChange={(e) => {
                          setPaidIQD(sanitizeNumericInput(e.target.value, false));
                          if (formErrors.amount)
                            setFormErrors((prev) => ({ ...prev, amount: undefined }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            rateRef.current?.focus();
                            rateRef.current?.select();
                          } else if (e.key === 'Escape') {
                            setPaidIQD('0');
                          }
                        }}
                        className={`w-full h-10 px-3 border rounded-lg bg-white font-num font-bold text-base text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                          formErrors.amount ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                        }`}
                      />
                    </td>
                    <td className="py-3 px-3">
                      <input
                        ref={rateRef}
                        type="text"
                        inputMode="numeric"
                        value={ratePer100}
                        onChange={(e) => {
                          setRatePer100(sanitizeNumericInput(e.target.value, false));
                          if (formErrors.rate)
                            setFormErrors((prev) => ({ ...prev, rate: undefined }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            notesRef.current?.focus();
                          }
                        }}
                        className={`w-full h-10 px-2.5 border rounded-lg bg-white font-num font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-800 ${
                          formErrors.rate ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                        }`}
                      />
                    </td>
                    <td className="py-3 px-3">
                      <input
                        ref={notesRef}
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            paidUSDRef.current?.focus();
                          }
                        }}
                        placeholder={
                          partyType === 'customer'
                            ? 'دفعة على الحساب / تسديد قسط...'
                            : 'تسديد دفعة للمورد...'
                        }
                        className="w-full h-10 px-3 border border-slate-300 rounded-lg bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {(formErrors.party || formErrors.amount || formErrors.rate) && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-xs font-bold text-red-700">
                {formErrors.party || formErrors.amount || formErrors.rate}
              </div>
            )}

            {/* Tafqeet + FX Details + Manual Override */}
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 space-y-2.5 text-xs">
              {(numericUSD > 0 || numericIQD > 0) && (
                <div className="flex flex-wrap items-center gap-3 text-emerald-900">
                  <span className="font-semibold text-emerald-800">المبلغ كتابةً:</span>
                  {numericUSD > 0 && (
                    <span className="font-bold">• {amountToArabicTafqeet(numericUSD, 'USD')}</span>
                  )}
                  {numericIQD > 0 && (
                    <span className="font-bold">• {amountToArabicTafqeet(numericIQD, 'IQD')}</span>
                  )}
                </div>
              )}

              {fxPreview ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2 text-slate-600">
                    <ArrowLeftRight className="w-4 h-4 text-blue-700" />
                    <span>{fxPreview.explanation}</span>
                  </div>
                  <div className="font-num font-bold text-slate-900">
                    المخصوم: {formatCurrency(fxPreview.settledInInvoiceCurrency, activeInvoiceMeta!.currency)}
                    {' · '}
                    <span
                      className={
                        fxPreview.fxDiffIQD >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }
                    >
                      فرق الصرف: {fxPreview.fxDiffIQD >= 0 ? '+' : ''}
                      {formatIQD(fxPreview.fxDiffIQD)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600">
                  <span>
                    المعادل التقريبي بالسعر الحالي ({formatRatePer100(parsedRatePer1USD)}):
                  </span>
                  <span className="font-num font-bold text-slate-900">
                    {formatUSD(combinedEquivalent.totalInUSD)} /{' '}
                    <span className="text-blue-800">{formatIQD(combinedEquivalent.totalInIQD)}</span>
                  </span>
                </div>
              )}

              {activeInvoiceMeta && canOverride && (
                <div className="pt-1 border-t border-slate-200 space-y-2">
                  <label className="inline-flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useManualOverride}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseManualOverride(checked);
                        if (checked && fxPreview) {
                          setManualSettled(String(fxPreview.autoSettledInInvoiceCurrency));
                          setManualFxDiff(String(fxPreview.fxDiffIQD));
                        }
                      }}
                      className="rounded border-slate-300 text-blue-700"
                    />
                    <span>تعديل يدوي لمبلغ التسوية أو فرق الصرف على هذه الفاتورة</span>
                  </label>

                  {useManualOverride && (
                    <div className="grid grid-cols-2 gap-3 p-3 border border-amber-200 bg-amber-50/50 rounded-lg max-w-lg">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          المبلغ المخصوم يدوياً ({activeInvoiceMeta.currency})
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={manualSettled}
                          onChange={(e) => setManualSettled(sanitizeNumericInput(e.target.value, true))}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md font-num bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          فرق الصرف يدوياً (د.ع)
                        </label>
                        <input
                          type="text"
                          inputMode="text"
                          value={manualFxDiff}
                          onChange={(e) => setManualFxDiff(normalizeArabicDigits(e.target.value))}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded-md font-num bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 3. LARGE BOTTOM TOTALS BAR */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <div className="text-xs font-semibold text-slate-500">المستحق الحالي ($)</div>
              <div className="font-num font-extrabold text-xl text-red-700 mt-1">
                {formatUSD(partyBalances.usd)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <div className="text-xs font-semibold text-slate-500">المستحق الحالي (د.ع)</div>
              <div className="font-num font-extrabold text-xl text-red-700 mt-1">
                {formatIQD(partyBalances.iqd)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
              <div className="text-xs font-bold text-emerald-800">المسدد الآن</div>
              <div className="font-num font-extrabold text-lg text-emerald-700 mt-1">
                {formatUSD(numericUSD)} + {formatIQD(numericIQD)}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
              <div className="text-xs font-bold text-amber-900">المتبقي بعد التسديد</div>
              <div className="font-num font-extrabold text-xl text-slate-900 mt-1">
                {remainingAfterPayment}
              </div>
            </div>
          </div>

          {/* 4. STICKY BOTTOM SHORTCUT ACTION BAR */}
          <div className="sticky bottom-2 z-20 bg-white border border-slate-300 shadow-sm rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting || !selectedPartyId || (numericUSD <= 0 && numericIQD <= 0)}
                onClick={() => handleSubmit(false)}
                className="h-10 px-4 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ السند (F9)'}</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting || !selectedPartyId || (numericUSD <= 0 && numericIQD <= 0)}
                onClick={() => handleSubmit(true)}
                className="h-10 px-4 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>حفظ وطباعة</span>
              </button>

              <button
                type="button"
                onClick={clearVoucherInputs}
                className="h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-800 font-bold hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>سند جديد</span>
              </button>

              <button
                type="button"
                onClick={clearVoucherInputs}
                className="h-10 px-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold hover:bg-red-100 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>مسح</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => goBack()}
              className="h-10 px-4 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 inline-flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              <span>خروج</span>
            </button>
          </div>
        </>
      )}

      {/* Inline Voucher Cancellation Bar */}
      {cancellingVoucher && (
        <form
          onSubmit={handleConfirmCancelVoucher}
          className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-red-900">
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                إلغاء السند المالي{' '}
                <span className="font-num">{cancellingVoucher.voucherNumber}</span> وإصدار قيد عكسي
                وإعادة الرصيد للفاتورة
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCancellingVoucherId(null);
                setCancelReason('');
                setCancelError('');
              }}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              تراجع
            </button>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[240px]">
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value);
                  if (cancelError) setCancelError('');
                }}
                placeholder="اكتب سبب إلغاء السند الإلزامي (يُحفظ في سجل التدقيق)..."
                className={`w-full h-9 px-3 text-xs rounded-lg border bg-white ${
                  cancelError ? 'border-red-500 bg-red-50/40' : 'border-red-300'
                }`}
              />
              {cancelError && (
                <div className="text-[11px] font-semibold text-red-700 mt-1">{cancelError}</div>
              )}
            </div>
            <button
              type="submit"
              disabled={isCancelling}
              className="h-9 px-4 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
            >
              {isCancelling ? 'جاري التنفيذ...' : 'تأكيد إلغاء السند وإصدار سند عكسي'}
            </button>
          </div>
        </form>
      )}

      {/* Recent Vouchers Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            سندات {partyType === 'customer' ? 'القبض' : 'الصرف'} الخاصة بـ {partyNameDisplay}
          </h3>
          <span className="text-xs text-slate-500 font-num">{partyVouchers.length} سند</span>
        </div>

        {partyVouchers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            لا توجد سندات مسجلة لهذا الطرف حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-right">رقم السند</th>
                  <th className="py-2.5 px-4 text-right">التاريخ</th>
                  <th className="py-2.5 px-4 text-right">عن الفاتورة</th>
                  <th className="py-2.5 px-4 text-left">دولار ($)</th>
                  <th className="py-2.5 px-4 text-left">دينار (د.ع)</th>
                  <th className="py-2.5 px-4 text-left">المحتسب بالفاتورة</th>
                  <th className="py-2.5 px-4 text-left">فرق الصرف</th>
                  <th className="py-2.5 px-4 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partyVouchers.map((p) => {
                  const isCancelled = p.status === 'cancelled';
                  return (
                    <tr
                      key={p.id}
                      className={
                        p.isReversal
                          ? 'bg-amber-50/40'
                          : isCancelled
                            ? 'bg-red-50/40 text-slate-500'
                            : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-2.5 px-4 font-num font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className={isCancelled ? 'line-through text-slate-500' : ''}>
                            {p.voucherNumber}
                          </span>
                          {p.isReversal && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-sans font-bold">
                              سند عكسي
                            </span>
                          )}
                          {isCancelled && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-sans font-bold">
                              ملغى
                            </span>
                          )}
                        </div>
                        {isCancelled && p.cancellationReason && (
                          <div className="text-[10px] font-sans text-red-700 mt-0.5">
                            السبب: {p.cancellationReason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-num text-slate-600">
                        {new Date(p.date).toLocaleString('ar-IQ')}
                      </td>
                      <td className="py-2.5 px-4 font-num text-slate-700">
                        {p.invoiceNumber || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-left font-num">{formatUSD(p.paidUSD)}</td>
                      <td className="py-2.5 px-4 text-left font-num">{formatIQD(p.paidIQD)}</td>
                      <td className="py-2.5 px-4 text-left font-num font-semibold">
                        {formatCurrency(p.settledInInvoiceCurrency, p.invoiceCurrency)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-left font-num font-semibold ${
                          p.fxDiffIQD >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {p.fxDiffIQD >= 0 ? '+' : ''}
                        {formatIQD(p.fxDiffIQD)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openPrintPreview({ kind: 'payment', data: p })}
                            className="p-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                            title="طباعة السند"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {!isCancelled && !p.isReversal && hasPermission('canDeleteRecords') && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingVoucherId(p.id);
                                setCancelReason('');
                                setCancelError('');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 text-[11px] font-semibold whitespace-nowrap"
                              title="إلغاء السند وإصدار سند عكسي"
                            >
                              <Ban className="w-3 h-3" />
                              <span>إلغاء</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
