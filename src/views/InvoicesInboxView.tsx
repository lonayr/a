import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileImage,
  FileText,
  Inbox,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CurrencyCode,
  InboxInvoice,
  InboxInvoiceStatus,
  InboxPageFile,
  InboxReviewLine,
  PurchaseType,
} from '../types/erp';
import { useERP } from '../context/ERPContext';
import { formatCurrency } from '../utils/currency';
import { parseLocaleNumber, sanitizeBarcode, sanitizeNumericInput } from '../utils/numbers';
import { loadOriginalFileData } from '../utils/fileVault';
import { validateInboxReview } from '../utils/invoiceInboxDomain';
import { findSimilarInventoryItems } from '../utils/inventoryDomain';

const STATUS_BADGE: Record<
  InboxInvoiceStatus,
  { label: string; cls: string }
> = {
  pending_review: {
    label: 'قيد المراجعة',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  approved: {
    label: 'مضافة لفواتير الشراء',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  rejected: {
    label: 'مرفوضة / ملغاة',
    cls: 'bg-red-50 text-red-700 border-red-200',
  },
};

function InteractivePageViewer({
  files,
  title,
}: {
  files: InboxPageFile[];
  title?: string;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loadedUrls, setLoadedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setPageIndex(0);
    setZoom(1);
    setRotation(0);
  }, [files]);

  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      const next: Record<string, string> = {};
      for (const f of files) {
        const url = await loadOriginalFileData(f.id, f.inlineDataUrl || f.thumbnailUrl);
        if (url) next[f.id] = url;
      }
      if (active) setLoadedUrls(next);
    };
    void loadAll();
    return () => {
      active = false;
    };
  }, [files]);

  const currentFile = files[pageIndex] || files[0];
  const currentUrl = currentFile
    ? loadedUrls[currentFile.id] || currentFile.inlineDataUrl || currentFile.thumbnailUrl
    : '';
  const isPdf = currentFile?.mimeType === 'application/pdf';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-slate-800 min-w-0">
          <FileImage className="w-4 h-4 text-slate-600 shrink-0" />
          <span className="truncate">{title || currentFile?.name || 'صورة الفاتورة الأصلية'}</span>
          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold whitespace-nowrap">
            محفوظة دائماً
          </span>
        </div>

        <div className="flex items-center gap-1">
          {!isPdf && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                title="تصغير"
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 font-num font-bold text-[11px] text-slate-700">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                title="تكبير"
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                title="تدوير يسار 90°"
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                title="تدوير يمين 90°"
                className="p-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setRotation(0);
                }}
                className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-[11px] font-semibold"
              >
                إعادة ضبط
              </button>
            </>
          )}
        </div>
      </div>

      {files.length > 1 && (
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] font-semibold text-slate-500">الصفحات:</span>
          {files.map((f, idx) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setPageIndex(idx)}
              className={`px-2.5 py-1 rounded-md font-num font-bold border ${
                idx === pageIndex
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              صفحة {idx + 1}
            </button>
          ))}
        </div>
      )}

      <div className="bg-slate-100 min-h-[420px] max-h-[680px] overflow-auto flex items-center justify-center p-4">
        {!currentUrl ? (
          <div className="text-xs text-slate-500">جاري تحميل الملف الأصلي...</div>
        ) : isPdf ? (
          <iframe
            src={currentUrl}
            title={currentFile.name}
            className="w-full h-[600px] bg-white border border-slate-200 rounded-lg"
          />
        ) : (
          <img
            src={currentUrl}
            alt={currentFile?.name || 'صورة الفاتورة'}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
            className="max-w-full rounded-lg shadow-sm border border-slate-200 transition-transform duration-150"
          />
        )}
      </div>
    </div>
  );
}

export function InvoicesInboxView() {
  const {
    state,
    inboxInvoices,
    inboxPendingCount,
    activeInboxReviewId,
    activeInboxViewerId,
    openInboxReview,
    openInboxImageViewer,
    clearActiveInboxSelection,
    uploadFilesToInbox,
    retryInboxExtraction,
    saveInboxReviewDraft,
    approveInboxInvoice,
    rejectInboxInvoice,
    hasPermission,
    setSubPageTitle,
    setHasUnsavedChanges,
    openSupplierForm,
    notify,
  } = useERP();

  // Filters in inbox list
  const [statusFilter, setStatusFilter] = useState<'all' | InboxInvoiceStatus>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Full-page mode resolution: 'review' | 'viewer' | 'list'
  const activeReviewInvoice = useMemo(
    () => (activeInboxReviewId ? inboxInvoices.find((i) => i.id === activeInboxReviewId) || null : null),
    [activeInboxReviewId, inboxInvoices]
  );

  const activeViewerInvoice = useMemo(
    () => (activeInboxViewerId ? inboxInvoices.find((i) => i.id === activeInboxViewerId) || null : null),
    [activeInboxViewerId, inboxInvoices]
  );

  // Local editable draft state while in Review Page
  const [draft, setDraft] = useState<InboxInvoice | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showRejectBar, setShowRejectBar] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [inlineNewLineId, setInlineNewLineId] = useState<string | null>(null);
  const [inlineNewName, setInlineNewName] = useState('');
  const [inlineNewSku, setInlineNewSku] = useState('');
  const [inlineNewError, setInlineNewError] = useState('');

  // Sync draft when opening a review invoice or when background extraction completes for it
  useEffect(() => {
    if (!activeReviewInvoice) {
      setDraft(null);
      setDraftDirty(false);
      setShowRejectBar(false);
      setRejectReason('');
      setRejectError('');
      setInlineNewLineId(null);
      return;
    }
    setDraft((prev) => {
      if (!prev || prev.id !== activeReviewInvoice.id) {
        setDraftDirty(false);
        setShowRejectBar(false);
        setRejectReason('');
        setRejectError('');
        setInlineNewLineId(null);
        return activeReviewInvoice;
      }
      // If background reading just finished and user hasn't edited yet, refresh draft from extraction
      if (
        prev.extractionStatus !== activeReviewInvoice.extractionStatus ||
        prev.status !== activeReviewInvoice.status
      ) {
        return activeReviewInvoice;
      }
      return prev;
    });
  }, [activeReviewInvoice]);

  useEffect(() => {
    if (activeReviewInvoice) {
      setSubPageTitle(
        `مراجعة فاتورة واردة: ${draft?.invoiceNumber || activeReviewInvoice.files[0]?.name || ''}`
      );
      setHasUnsavedChanges(draftDirty);
    } else if (activeViewerInvoice) {
      setSubPageTitle(
        `معاينة الصورة الأصلية: ${activeViewerInvoice.invoiceNumber || activeViewerInvoice.files[0]?.name || ''}`
      );
      setHasUnsavedChanges(false);
    } else {
      setSubPageTitle(null);
      setHasUnsavedChanges(false);
    }
  }, [activeReviewInvoice, activeViewerInvoice, draft?.invoiceNumber, draftDirty, setSubPageTitle, setHasUnsavedChanges]);

  useEffect(() => {
    return () => {
      setSubPageTitle(null);
      setHasUnsavedChanges(false);
    };
  }, [setSubPageTitle, setHasUnsavedChanges]);

  // Support Ctrl+V clipboard paste upload when in Inbox List mode
  const handleFilesSelected = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;
      setIsUploading(true);
      try {
        await uploadFilesToInbox(files);
      } finally {
        setIsUploading(false);
      }
    },
    [uploadFilesToInbox]
  );

  useEffect(() => {
    if (activeReviewInvoice || activeViewerInvoice) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && (f.type.startsWith('image/') || f.type === 'application/pdf')) {
            pastedFiles.push(f);
          }
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        void handleFilesSelected(pastedFiles);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [activeReviewInvoice, activeViewerInvoice, handleFilesSelected]);

  const filteredInbox = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inboxInvoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (supplierFilter !== 'all') {
        if (inv.supplierId !== supplierFilter) return false;
      }
      if (dateFrom && inv.uploadedAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && inv.uploadedAt.slice(0, 10) > dateTo) return false;
      if (q) {
        const supName =
          state.suppliers.find((s) => s.id === inv.supplierId)?.name || inv.supplierNameRead || '';
        const match =
          (inv.invoiceNumber || '').toLowerCase().includes(q) ||
          supName.toLowerCase().includes(q) ||
          inv.uploadedByName.toLowerCase().includes(q) ||
          inv.files.some((f) => f.name.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [inboxInvoices, statusFilter, supplierFilter, dateFrom, dateTo, searchQuery, state.suppliers]);

  const generateUniqueSku = useCallback(() => {
    let candidate = `B${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = new Set(state.inventory.map((i) => i.sku.toLowerCase()));
    while (existing.has(candidate.toLowerCase())) {
      candidate = `B${Math.floor(100000 + Math.random() * 900000)}`;
    }
    return candidate;
  }, [state.inventory]);

  const updateDraft = (patch: Partial<InboxInvoice>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDraftDirty(true);
  };

  const updateDraftLine = (lineId: string, patch: Partial<InboxReviewLine>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            lines: prev.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
          }
        : prev
    );
    setDraftDirty(true);
  };

  // ==================== VIEW MODE 2: FULL-PAGE IMAGE VIEWER ====================
  if (activeViewerInvoice) {
    const statusInfo = STATUS_BADGE[activeViewerInvoice.status];
    const supName =
      activeViewerInvoice.purchaseType === 'opening_balance'
        ? 'رصيد افتتاحي'
        : state.suppliers.find((s) => s.id === activeViewerInvoice.supplierId)?.name ||
          activeViewerInvoice.supplierNameRead ||
          'غير محدد';

    return (
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-2.5 py-1 rounded-lg border font-bold ${statusInfo.cls}`}>
              {statusInfo.label}
            </span>
            <div>
              <div className="font-bold text-sm text-slate-900">
                فاتورة رقم: <span className="font-num">{activeViewerInvoice.invoiceNumber || '-'}</span> · {supName}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-num">
                رُفعت بتاريخ {new Date(activeViewerInvoice.uploadedAt).toLocaleString('ar-IQ')} بواسطة{' '}
                {activeViewerInvoice.uploadedByName}
                {activeViewerInvoice.linkedPurchaseNumber &&
                  ` · فاتورة الشراء المرتبطة: ${activeViewerInvoice.linkedPurchaseNumber}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeViewerInvoice.status === 'pending_review' && (
              <button
                type="button"
                onClick={() => openInboxReview(activeViewerInvoice.id)}
                className="h-9 px-3.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 inline-flex items-center gap-1.5"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>فتح صفحة المراجعة</span>
              </button>
            )}
            <button
              type="button"
              onClick={clearActiveInboxSelection}
              className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة لصندوق الفواتير</span>
            </button>
          </div>
        </div>

        <InteractivePageViewer files={activeViewerInvoice.files} />
      </div>
    );
  }

  // ==================== VIEW MODE 3: FULL-PAGE REVIEW & APPROVAL ====================
  if (activeReviewInvoice && draft) {
    const canApprove = hasPermission('canApproveInboxInvoices');
    const isReadOnly = draft.status !== 'pending_review';
    const validation = validateInboxReview({
      inbox: draft,
      inventory: state.inventory,
      purchases: state.purchases,
    });
    const statusInfo = STATUS_BADGE[draft.status];

    const handleSaveDraft = () => {
      const res = saveInboxReviewDraft(draft.id, draft, true);
      if (res.ok) {
        setDraftDirty(false);
      }
    };

    const handleApprove = () => {
      if (isApproving || !canApprove) return;
      if (!validation.canApprove) {
        notify(validation.blockingErrors[0] || 'تحقق من أخطاء المراجعة.', 'error');
        return;
      }
      setIsApproving(true);
      try {
        const res = approveInboxInvoice(draft.id, draft);
        if (!res.ok) {
          notify(res.error || 'تعذر اعتماد الفاتورة.', 'error');
          return;
        }
        setDraftDirty(false);
        clearActiveInboxSelection();
      } finally {
        setIsApproving(false);
      }
    };

    const handleConfirmReject = (e: React.FormEvent) => {
      e.preventDefault();
      if (!rejectReason.trim()) {
        setRejectError('يرجى كتابة سبب الرفض الإلزامي.');
        return;
      }
      const res = rejectInboxInvoice(draft.id, rejectReason);
      if (!res.ok) {
        setRejectError(res.error || 'تعذر رفض الفاتورة.');
        return;
      }
      setDraftDirty(false);
      setShowRejectBar(false);
      clearActiveInboxSelection();
    };

    const openInlineNewItem = (line: InboxReviewLine) => {
      setInlineNewLineId(line.id);
      setInlineNewName(line.newName || line.rawName || '');
      setInlineNewSku(line.newSku || sanitizeBarcode(line.rawSku || '') || generateUniqueSku());
      setInlineNewError('');
    };

    const confirmInlineNewItem = (lineId: string) => {
      const cleanName = inlineNewName.trim();
      const cleanSku = sanitizeBarcode(inlineNewSku);
      if (!cleanName) {
        setInlineNewError('اسم المادة الجديدة إلزامي.');
        return;
      }
      if (!cleanSku) {
        setInlineNewError('باركود المادة الجديدة إلزامي.');
        return;
      }
      const dupInv = state.inventory.find(
        (i) => i.sku.trim().toLowerCase() === cleanSku.toLowerCase()
      );
      if (dupInv) {
        setInlineNewError(`الباركود مستخدم مسبقاً للمادة: ${dupInv.brand} ${dupInv.model}`);
        return;
      }
      updateDraftLine(lineId, {
        createAsNew: true,
        matchedItemId: undefined,
        matchStatus: 'new',
        newName: cleanName,
        newSku: cleanSku,
        rawName: cleanName,
        rawSku: cleanSku,
      });
      setInlineNewLineId(null);
      setInlineNewError('');
    };

    const addEmptyLine = () => {
      const newLine: InboxReviewLine = {
        id: `iln-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        rawName: '',
        rawSku: '',
        specs: '',
        quantity: 1,
        unitCost: 0,
        sellPrice: 0,
        matchStatus: 'new',
        candidateItemIds: [],
      };
      updateDraft({ lines: [...draft.lines, newLine] });
    };

    const similarInlineItems =
      inlineNewLineId && inlineNewName.trim().length >= 2
        ? findSimilarInventoryItems(inlineNewName, state.inventory)
        : [];

    return (
      <div className="space-y-4">
        {/* Top Review Status Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-2.5 py-1 rounded-lg border font-bold ${statusInfo.cls}`}>
              {statusInfo.label}
            </span>
            <div>
              <div className="font-bold text-sm text-slate-900">
                مراجعة واعتماد فاتورة واردة
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                رُفعت بواسطة: <strong>{draft.uploadedByName}</strong> ·{' '}
                <span className="font-num">{new Date(draft.uploadedAt).toLocaleString('ar-IQ')}</span>
                {draft.reviewedByName && ` · آخر مراجعة: ${draft.reviewedByName}`}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {draft.status === 'pending_review' && (
              <button
                type="button"
                onClick={() => void retryInboxExtraction(draft.id)}
                disabled={draft.extractionStatus === 'reading'}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    draft.extractionStatus === 'reading' ? 'animate-spin' : ''
                  }`}
                />
                <span>إعادة القراءة</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (draftDirty && !isReadOnly) {
                  saveInboxReviewDraft(draft.id, draft, false);
                  setDraftDirty(false);
                }
                clearActiveInboxSelection();
              }}
              className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة لصندوق الفواتير</span>
            </button>
          </div>
        </div>

        {/* Extraction Status Banners */}
        {draft.extractionStatus === 'reading' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-blue-900 font-semibold">
            <RefreshCw className="w-4 h-4 text-blue-700 animate-spin shrink-0" />
            <span>جاري قراءة بيانات الفاتورة من الصورة في الخلفية... يمكنك إكمال العمل أو الانتظار لحظات.</span>
          </div>
        )}

        {draft.extractionStatus === 'failed' && (
          <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-red-900">
            <div className="flex items-center gap-2 font-semibold">
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                فشل قراءة الصورة تلقائياً: {draft.extractionError || 'الصورة غير واضحة'}. يمكنك الإدخال يدوياً بجانب الصورة أو إعادة القراءة.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void retryInboxExtraction(draft.id)}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
            >
              إعادة القراءة الآن
            </button>
          </div>
        )}

        {draft.duplicateWarningOfId && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              تنبيه: هذه الصورة مطابقة أو مشابهة جداً لصورة فاتورة أخرى مرفوعة مسبقاً في صندوق الوارد — يرجى التحقق قبل الاعتماد لتجنب التكرار.
            </span>
          </div>
        )}

        {isReadOnly && (
          <div
            className={`rounded-xl px-4 py-3 border text-xs font-bold flex items-center gap-2 ${
              draft.status === 'approved'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {draft.status === 'approved' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  تم اعتماد هذه الفاتورة وإضافتها لفواتير الشراء برقم ({draft.linkedPurchaseNumber}) بواسطة{' '}
                  {draft.approvedByName}. لا يمكن اعتماد نفس الصورة مرتين.
                </span>
              </>
            ) : (
              <>
                <Ban className="w-4 h-4 text-red-700 shrink-0" />
                <span>
                  هذه الفاتورة مرفوضة بواسطة {draft.rejectedByName} — السبب: {draft.rejectionReason}
                </span>
              </>
            )}
          </div>
        )}

        {/* Split Layout: Original Image Left/Right + Extracted Invoice Table */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Original Image Panel */}
          <div className="xl:col-span-5 xl:sticky xl:top-3 space-y-3">
            <InteractivePageViewer files={draft.files} />
          </div>

          {/* Review & Edit Panel */}
          <div className="xl:col-span-7 space-y-4">
            {/* Invoice Header Fields */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
              <div className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
                بيانات رأس الفاتورة المستخرجة
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    نوع التوريد
                  </label>
                  <select
                    disabled={isReadOnly}
                    value={draft.purchaseType}
                    onChange={(e) =>
                      updateDraft({ purchaseType: e.target.value as PurchaseType })
                    }
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-semibold"
                  >
                    <option value="credit">آجل (ذمم مورد)</option>
                    <option value="cash">نقدي (دفع من الصندوق)</option>
                    <option value="opening_balance">رصيد افتتاحي (بدون دين/صرف)</option>
                  </select>
                </div>

                {draft.purchaseType !== 'opening_balance' && (
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">
                        المورد *{' '}
                        {draft.supplierNameRead && (
                          <span className="text-[10px] text-slate-500 font-normal">
                            (المقروء من الصورة: {draft.supplierNameRead})
                          </span>
                        )}
                      </label>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            saveInboxReviewDraft(draft.id, draft, false);
                            openSupplierForm({ mode: 'new', returnTo: 'invoices' });
                          }}
                          className="text-[11px] font-bold text-blue-700 hover:underline"
                        >
                          + إضافة مورد جديد
                        </button>
                      )}
                    </div>
                    <select
                      disabled={isReadOnly}
                      value={draft.supplierId}
                      onChange={(e) => updateDraft({ supplierId: e.target.value })}
                      className={`w-full h-9 px-2.5 border rounded-lg bg-white font-semibold ${
                        !draft.supplierId ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                      }`}
                    >
                      <option value="">-- اختر المورد --</option>
                      {state.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.company ? `(${s.company})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">رقم الفاتورة *</label>
                  <input
                    disabled={isReadOnly}
                    value={draft.invoiceNumber}
                    onChange={(e) => updateDraft({ invoiceNumber: e.target.value })}
                    className={`w-full h-9 px-2.5 border rounded-lg font-num font-bold ${
                      !draft.invoiceNumber.trim() || validation.isDuplicateInvoiceNumber
                        ? 'border-red-500 bg-red-50/40'
                        : 'border-slate-300 bg-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">تاريخ الفاتورة</label>
                  <input
                    disabled={isReadOnly}
                    type="date"
                    value={draft.invoiceDate}
                    onChange={(e) => updateDraft({ invoiceDate: e.target.value })}
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-num bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">العملة</label>
                  <select
                    disabled={isReadOnly}
                    value={draft.currency}
                    onChange={(e) =>
                      updateDraft({ currency: e.target.value as CurrencyCode })
                    }
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-bold"
                  >
                    <option value="IQD">دينار عراقي (IQD)</option>
                    <option value="USD">دولار أمريكي (USD)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    الإجمالي المكتوب في الفاتورة
                  </label>
                  <input
                    disabled={isReadOnly}
                    type="text"
                    inputMode="decimal"
                    value={String(draft.declaredTotal)}
                    onChange={(e) =>
                      updateDraft({
                        declaredTotal: parseLocaleNumber(
                          sanitizeNumericInput(e.target.value, draft.currency === 'USD')
                        ),
                      })
                    }
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-num font-bold bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الخصم</label>
                  <input
                    disabled={isReadOnly || draft.purchaseType === 'opening_balance'}
                    type="text"
                    inputMode="decimal"
                    value={String(draft.discount)}
                    onChange={(e) =>
                      updateDraft({
                        discount: parseLocaleNumber(
                          sanitizeNumericInput(e.target.value, draft.currency === 'USD')
                        ),
                      })
                    }
                    className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-num font-bold bg-white"
                  />
                </div>

                {draft.purchaseType !== 'opening_balance' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      المدفوع حالياً ({draft.currency === 'USD' ? '$' : 'د.ع'})
                    </label>
                    <input
                      disabled={isReadOnly}
                      type="text"
                      inputMode="decimal"
                      value={String(draft.currency === 'USD' ? draft.paidUSD : draft.paidIQD)}
                      onChange={(e) => {
                        const val = parseLocaleNumber(
                          sanitizeNumericInput(e.target.value, draft.currency === 'USD')
                        );
                        updateDraft(
                          draft.currency === 'USD' ? { paidUSD: val } : { paidIQD: Math.round(val) }
                        );
                      }}
                      className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-num font-bold bg-white"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Validation & Warnings Box */}
            {(validation.blockingErrors.length > 0 || validation.warnings.length > 0) && !isReadOnly && (
              <div className="space-y-2 text-xs">
                {validation.blockingErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-300 rounded-xl p-3 space-y-1 text-red-900">
                    <div className="font-bold flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>أخطاء تمنع الاعتماد حتى تصحيحها:</span>
                    </div>
                    <ul className="list-disc pr-5 space-y-0.5">
                      {validation.blockingErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {validation.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-1 text-amber-950">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>تنبيهات المراجعة:</span>
                    </div>
                    <ul className="list-disc pr-5 space-y-0.5">
                      {validation.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Extracted Items & Inventory Matching Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden text-xs">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-sm text-slate-900">
                  جدول الأصناف المستخرج ({draft.lines.length})
                </span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={addEmptyLine}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة سطر</span>
                  </button>
                )}
              </div>

              {draft.lines.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  لا توجد أصناف مستخرجة حالياً — يمكنك إضافة أصناف يدوياً أو انتظار انتهاء القراءة.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {draft.lines.map((line, idx) => {
                    const isZeroBad = validation.zeroInvalidLineIds.has(line.id);
                    const isBelowCost = validation.sellBelowCostLineIds.has(line.id);
                    const isDupLine = validation.duplicateLineIds.has(line.id);
                    const isUnresolved = validation.unresolvedLineIds.has(line.id);
                    const candidateItems = line.candidateItemIds
                      .map((id) => state.inventory.find((x) => x.id === id))
                      .filter(Boolean);
                    const lineTotal =
                      draft.currency === 'USD'
                        ? Number((line.quantity * line.unitCost).toFixed(2))
                        : Math.round(line.quantity * line.unitCost);

                    return (
                      <div
                        key={line.id}
                        className={`p-3 space-y-2.5 ${
                          isZeroBad || isUnresolved
                            ? 'bg-red-50/40'
                            : isBelowCost || isDupLine
                            ? 'bg-amber-50/40'
                            : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-num font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <input
                              disabled={isReadOnly}
                              value={line.rawName}
                              onChange={(e) => updateDraftLine(line.id, { rawName: e.target.value })}
                              placeholder="اسم المادة في الفاتورة..."
                              className="flex-1 min-w-[180px] h-8 px-2.5 border border-slate-300 rounded-lg font-bold text-slate-900 bg-white"
                            />
                          </div>

                          <div className="flex items-center gap-1.5">
                            {line.createAsNew ? (
                              <span className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-800 font-bold text-[11px]">
                                جديد (باركود: {line.newSku})
                              </span>
                            ) : line.matchStatus === 'matched' && line.matchedItemId ? (
                              <span className="px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 font-bold text-[11px]">
                                مطابق بالمخزن
                              </span>
                            ) : line.matchStatus === 'uncertain' ? (
                              <span className="px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800 font-bold text-[11px]">
                                محتمل ({candidateItems.length} اقتراحات)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-100 text-slate-700 font-bold text-[11px]">
                                جديد / غير مربوط
                              </span>
                            )}

                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraft({
                                    lines: draft.lines.filter((x) => x.id !== line.id),
                                  })
                                }
                                title="حذف السطر"
                                className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Candidate Suggestions (up to 3) + Inventory Selector + Add New Button */}
                        {!isReadOnly && (
                          <div className="flex flex-wrap items-center gap-2 pr-8">
                            {candidateItems.length > 0 && !line.createAsNew && (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[11px] text-slate-500">اقتراحات:</span>
                                {candidateItems.map((cand) => {
                                  if (!cand) return null;
                                  const isPicked = line.matchedItemId === cand.id;
                                  return (
                                    <button
                                      key={cand.id}
                                      type="button"
                                      onClick={() =>
                                        updateDraftLine(line.id, {
                                          matchedItemId: cand.id,
                                          createAsNew: false,
                                          matchStatus: 'matched',
                                          sellPrice: line.sellPrice > 0 ? line.sellPrice : cand.cashPrice,
                                        })
                                      }
                                      className={`px-2 py-1 rounded border text-[11px] font-semibold ${
                                        isPicked
                                          ? 'bg-emerald-600 border-emerald-600 text-white'
                                          : 'bg-white border-amber-300 text-amber-900 hover:bg-amber-50'
                                      }`}
                                    >
                                      {cand.brand} {cand.model} ({cand.sku})
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <select
                              value={line.createAsNew ? '__NEW__' : line.matchedItemId || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__NEW__') {
                                  openInlineNewItem(line);
                                } else {
                                  const inv = state.inventory.find((x) => x.id === val);
                                  updateDraftLine(line.id, {
                                    matchedItemId: val || undefined,
                                    createAsNew: false,
                                    matchStatus: val ? 'matched' : 'new',
                                    sellPrice:
                                      line.sellPrice > 0 ? line.sellPrice : inv?.cashPrice || 0,
                                  });
                                }
                              }}
                              className={`h-8 px-2 border rounded-lg bg-white text-[11px] font-semibold max-w-[260px] ${
                                isUnresolved ? 'border-red-500 bg-red-50/40' : 'border-slate-300'
                              }`}
                            >
                              <option value="">-- ربط بمادة من المخزن --</option>
                              {state.inventory.map((inv) => (
                                <option key={inv.id} value={inv.id}>
                                  {inv.brand} {inv.model} ({inv.sku})
                                </option>
                              ))}
                              <option value="__NEW__">+ إضافة كمادة جديدة عند الاعتماد</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => openInlineNewItem(line)}
                              className="h-8 px-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 font-bold hover:bg-blue-100 inline-flex items-center gap-1 text-[11px]"
                            >
                              <PackagePlus className="w-3.5 h-3.5" />
                              <span>{line.createAsNew ? 'تعديل بيانات المادة الجديدة' : 'إضافة كمادة جديدة'}</span>
                            </button>
                          </div>
                        )}

                        {/* Inline Add New Item Form inside Review Row (NO Modals!) */}
                        {!isReadOnly && inlineNewLineId === line.id && (
                          <div className="mr-8 p-3 rounded-lg bg-blue-50/60 border border-blue-200 space-y-2">
                            <div className="flex items-center justify-between font-bold text-blue-900">
                              <span>تعريف مادة جديدة داخل المراجعة (تُضاف للمخزن عند الاعتماد فقط)</span>
                              <button
                                type="button"
                                onClick={() => setInlineNewLineId(null)}
                                className="text-slate-500 hover:text-slate-900"
                              >
                                إغلاق
                              </button>
                            </div>
                            {similarInlineItems.length > 0 && (
                              <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-950 flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-[11px]">مواد مشابهة بالمخزن:</span>
                                {similarInlineItems.map((sim) => (
                                  <button
                                    key={sim.id}
                                    type="button"
                                    onClick={() => {
                                      updateDraftLine(line.id, {
                                        matchedItemId: sim.id,
                                        createAsNew: false,
                                        matchStatus: 'matched',
                                        sellPrice:
                                          line.sellPrice > 0 ? line.sellPrice : sim.cashPrice,
                                      });
                                      setInlineNewLineId(null);
                                    }}
                                    className="px-2 py-0.5 rounded bg-white border border-amber-300 text-[11px] font-semibold hover:bg-amber-100"
                                  >
                                    ربط بـ: {sim.brand} {sim.model} ({sim.sku})
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                  اسم المادة *
                                </label>
                                <input
                                  value={inlineNewName}
                                  onChange={(e) => {
                                    setInlineNewName(e.target.value);
                                    setInlineNewError('');
                                  }}
                                  className="w-full h-8 px-2.5 border border-slate-300 rounded bg-white"
                                />
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[11px] font-bold text-slate-700">
                                    باركود المادة *
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setInlineNewSku(generateUniqueSku())}
                                    className="text-[11px] font-bold text-blue-700 hover:underline"
                                  >
                                    توليد باركود
                                  </button>
                                </div>
                                <input
                                  value={inlineNewSku}
                                  onChange={(e) => {
                                    setInlineNewSku(sanitizeBarcode(e.target.value));
                                    setInlineNewError('');
                                  }}
                                  className="w-full h-8 px-2.5 border border-slate-300 rounded font-num bg-white"
                                />
                              </div>
                            </div>
                            {inlineNewError && (
                              <div className="text-[11px] font-bold text-red-700">{inlineNewError}</div>
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => confirmInlineNewItem(line.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700"
                              >
                                تأكيد المادة الجديدة في هذا السطر
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Quantity, Unit Cost, Sell Price, Row Total */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pr-8">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              الكمية *
                            </label>
                            <input
                              disabled={isReadOnly}
                              type="text"
                              inputMode="numeric"
                              value={String(line.quantity)}
                              onChange={(e) =>
                                updateDraftLine(line.id, {
                                  quantity: Math.round(
                                    parseLocaleNumber(sanitizeNumericInput(e.target.value, false))
                                  ),
                                })
                              }
                              className={`w-full h-8 px-2 border rounded font-num font-bold text-center ${
                                line.quantity <= 0 ? 'border-red-500 bg-red-50/40' : 'border-slate-300 bg-white'
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              سعر الشراء *
                            </label>
                            <input
                              disabled={isReadOnly}
                              type="text"
                              inputMode="decimal"
                              value={String(line.unitCost)}
                              onChange={(e) =>
                                updateDraftLine(line.id, {
                                  unitCost: parseLocaleNumber(
                                    sanitizeNumericInput(e.target.value, draft.currency === 'USD')
                                  ),
                                })
                              }
                              className={`w-full h-8 px-2 border rounded font-num font-bold text-center ${
                                line.unitCost <= 0 ? 'border-red-500 bg-red-50/40' : 'border-slate-300 bg-white'
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              سعر البيع
                            </label>
                            <input
                              disabled={isReadOnly}
                              type="text"
                              inputMode="decimal"
                              value={String(line.sellPrice)}
                              onChange={(e) =>
                                updateDraftLine(line.id, {
                                  sellPrice: parseLocaleNumber(
                                    sanitizeNumericInput(e.target.value, draft.currency === 'USD')
                                  ),
                                })
                              }
                              className={`w-full h-8 px-2 border rounded font-num font-bold text-center ${
                                isBelowCost ? 'border-amber-500 bg-amber-50/40' : 'border-slate-300 bg-white'
                              }`}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              مجموع السطر
                            </label>
                            <div className="h-8 px-2 border border-slate-200 rounded bg-slate-50 flex items-center justify-center font-num font-extrabold text-slate-900">
                              {formatCurrency(lineTotal, draft.currency)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Totals Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">مجموع الأسطر</div>
                <div className="font-num font-bold text-base text-slate-900">
                  {formatCurrency(validation.subtotal, draft.currency)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-[11px] text-emerald-800 font-semibold">الصافي المحسوب</div>
                <div className="font-num font-extrabold text-base text-emerald-700">
                  {formatCurrency(validation.netTotal, draft.currency)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">المكتوب في الفاتورة</div>
                <div className="font-num font-bold text-base text-slate-900">
                  {formatCurrency(draft.declaredTotal, draft.currency)}
                </div>
              </div>
              <div
                className={`p-2.5 rounded-lg border ${
                  validation.hasTotalMismatch
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="text-[11px] text-slate-600">الفارق</div>
                <div
                  className={`font-num font-extrabold text-base ${
                    validation.hasTotalMismatch ? 'text-amber-800' : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(validation.totalDiff, draft.currency)}
                </div>
              </div>
            </div>

            {/* Inline Rejection Reason Bar (No Modals) */}
            {!isReadOnly && showRejectBar && canApprove && (
              <form
                onSubmit={handleConfirmReject}
                className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between font-bold text-red-900">
                  <span>رفض الفاتورة وإبقاؤها مع الصورة الأصلية في السجل</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRejectBar(false);
                      setRejectError('');
                    }}
                    className="text-slate-600 hover:text-slate-900"
                  >
                    إلغاء
                  </button>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-[240px]">
                    <input
                      value={rejectReason}
                      onChange={(e) => {
                        setRejectReason(e.target.value);
                        setRejectError('');
                      }}
                      placeholder="اكتب سبب رفض الفاتورة (إلزامي)..."
                      className={`w-full h-9 px-3 border rounded-lg bg-white ${
                        rejectError ? 'border-red-500 bg-red-50/40' : 'border-red-300'
                      }`}
                    />
                    {rejectError && (
                      <div className="text-[11px] font-bold text-red-700 mt-1">{rejectError}</div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="h-9 px-4 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700"
                  >
                    تأكيد الرفض
                  </button>
                </div>
              </form>
            )}

            {/* Approval / Draft / Reject Actions */}
            {!isReadOnly && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                {!canApprove && (
                  <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-2 font-semibold">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      صلاحية الاعتماد والرفض متاحة للمحاسب أو المدير فقط — يمكنك حفظ المراجعة كمسودة الآن.
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="h-10 px-4 rounded-lg border border-slate-300 bg-white text-slate-800 font-bold hover:bg-slate-50 inline-flex items-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      <span>حفظ المراجعة كمسودة</span>
                    </button>

                    {canApprove && (
                      <button
                        type="button"
                        disabled={isApproving || !validation.canApprove}
                        onClick={handleApprove}
                        className="h-10 px-5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {isApproving ? 'جاري الاعتماد...' : 'اعتماد وإضافة لفواتير الشراء'}
                        </span>
                      </button>
                    )}
                  </div>

                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => setShowRejectBar((v) => !v)}
                      className="h-10 px-4 rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold hover:bg-red-100 inline-flex items-center gap-1.5"
                    >
                      <Ban className="w-4 h-4" />
                      <span>رفض الفاتورة</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== VIEW MODE 1: INVOICE INBOX TABLE & UPLOAD ====================
  const approvedCount = inboxInvoices.filter((i) => i.status === 'approved').length;
  const rejectedCount = inboxInvoices.filter((i) => i.status === 'rejected').length;

  return (
    <div className="space-y-4">
      {/* Top Header + Upload Dropzone */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Inbox className="w-5 h-5 text-slate-800" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                صندوق وارد الفواتير (استيراد الصور والملفات)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ارفع صور الفواتير أو ملفات PDF لتُقرأ في الخلفية، ولا يدخل المخزون أو الصندوق إلا بعد المراجعة والاعتماد.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-num">
              قيد المراجعة: {inboxPendingCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-num">
              مضافة: {approvedCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 font-num">
              مرفوضة: {rejectedCount}
            </span>
          </div>
        </div>

        {/* Upload Dropzone (File Picker / Drag & Drop / Ctrl+V Paste / Multi-Page / PDF) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.length) {
              void handleFilesSelected(e.dataTransfer.files);
            }
          }}
          className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
            isDragging
              ? 'border-emerald-500 bg-emerald-50/50'
              : 'border-slate-300 bg-slate-50/70 hover:border-slate-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void handleFilesSelected(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <div className="flex flex-col items-center gap-2 text-xs">
            <Upload className="w-7 h-7 text-slate-500" />
            <div className="font-bold text-slate-800 text-sm">
              اسحب صور الفواتير أو ملفات PDF وأفلتها هنا، أو اضغط Ctrl+V للصق صورة
            </div>
            <p className="text-slate-500">
              يدعم رفع عدة صفحات في فاتورة واحدة — تبدأ القراءة في الخلفية فوراً وتكمل عملك دون انتظار.
            </p>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 h-9 px-4 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>{isUploading ? 'جاري الحفظ...' : 'اختيار صور أو PDF للفاتورة'}</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs pt-1">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برقم الفاتورة، اسم المورد، أو من رفعها..."
              className="w-full h-9 pr-9 pl-3 border border-slate-300 rounded-lg bg-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | InboxInvoiceStatus)}
            className="h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-semibold"
          >
            <option value="all">كل الحالات</option>
            <option value="pending_review">قيد المراجعة</option>
            <option value="approved">مضافة لفواتير الشراء</option>
            <option value="rejected">مرفوضة / ملغاة</option>
          </select>

          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="h-9 px-2.5 border border-slate-300 rounded-lg bg-white font-semibold"
          >
            <option value="all">كل الموردين</option>
            {state.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="من تاريخ"
              className="w-1/2 h-9 px-2 border border-slate-300 rounded-lg font-num bg-white"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="إلى تاريخ"
              className="w-1/2 h-9 px-2 border border-slate-300 rounded-lg font-num bg-white"
            />
          </div>
        </div>
      </div>

      {/* Inbox Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredInbox.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 space-y-2">
            <FileImage className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-700">لا توجد فواتير مرفوعة مطابقة للبحث</div>
            <div>ارفع صورة فاتورة من الصندوق أعلاه أو من صفحة فاتورة الشراء.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 text-center w-20">الصورة</th>
                  <th className="py-2.5 px-3 text-right">المورد</th>
                  <th className="py-2.5 px-3 text-right">رقم الفاتورة</th>
                  <th className="py-2.5 px-3 text-right">تاريخ الفاتورة</th>
                  <th className="py-2.5 px-3 text-left">الإجمالي</th>
                  <th className="py-2.5 px-3 text-right">تاريخ الرفع</th>
                  <th className="py-2.5 px-3 text-right">من رفعها</th>
                  <th className="py-2.5 px-3 text-right">الحالة</th>
                  <th className="py-2.5 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInbox.map((inv) => {
                  const st = STATUS_BADGE[inv.status];
                  const supLabel =
                    inv.purchaseType === 'opening_balance'
                      ? 'رصيد افتتاحي'
                      : state.suppliers.find((s) => s.id === inv.supplierId)?.name ||
                        inv.supplierNameRead ||
                        'قيد التحديد';
                  const computedTotal =
                    inv.lines.length > 0
                      ? Math.max(
                          0,
                          inv.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0) -
                            (inv.discount || 0)
                        )
                      : inv.declaredTotal;

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => openInboxImageViewer(inv.id)}
                          title="فتح الصورة بحجم كامل مع تكبير وتدوير"
                          className="relative inline-flex items-center justify-center w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden hover:border-slate-400"
                        >
                          {inv.thumbnailUrl ? (
                            <img
                              src={inv.thumbnailUrl}
                              alt="معاينة"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <FileText className="w-5 h-5 text-slate-500" />
                          )}
                          {inv.files.length > 1 && (
                            <span className="absolute bottom-0 left-0 px-1 bg-slate-900/80 text-white text-[9px] font-num font-bold">
                              {inv.files.length}
                            </span>
                          )}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <div>{supLabel}</div>
                        {inv.duplicateWarningOfId && (
                          <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                            تنبيه: صورة مشابهة مرفوعة مسبقاً
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-num font-bold text-slate-800">
                        {inv.invoiceNumber || '-'}
                      </td>

                      <td className="py-2.5 px-3 font-num text-slate-600">
                        {inv.invoiceDate || '-'}
                      </td>

                      <td className="py-2.5 px-3 text-left font-num font-bold text-slate-900">
                        {computedTotal > 0 ? formatCurrency(computedTotal, inv.currency) : '-'}
                      </td>

                      <td className="py-2.5 px-3 font-num text-slate-600">
                        {new Date(inv.uploadedAt).toLocaleString('ar-IQ')}
                      </td>

                      <td className="py-2.5 px-3 font-semibold text-slate-700">
                        {inv.uploadedByName}
                      </td>

                      <td className="py-2.5 px-3 space-y-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border text-[11px] font-bold ${st.cls}`}
                        >
                          {st.label}
                        </span>
                        {inv.status === 'pending_review' && (
                          <div className="text-[10px] font-semibold">
                            {inv.extractionStatus === 'reading' ? (
                              <span className="text-blue-700 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> جاري القراءة بالخلفية...
                              </span>
                            ) : inv.extractionStatus === 'failed' ? (
                              <span className="text-red-600">فشل القراءة (مراجعة يدوية)</span>
                            ) : (
                              <span className="text-emerald-700">
                                جاهزة ({inv.lines.length} أصناف)
                              </span>
                            )}
                          </div>
                        )}
                        {inv.status === 'approved' && inv.linkedPurchaseNumber && (
                          <div className="text-[10px] text-emerald-700 font-num font-semibold">
                            فاتورة شراء: {inv.linkedPurchaseNumber}
                          </div>
                        )}
                        {inv.status === 'rejected' && inv.rejectionReason && (
                          <div className="text-[10px] text-red-700">
                            السبب: {inv.rejectionReason}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {inv.status === 'pending_review' && (
                            <button
                              type="button"
                              onClick={() => openInboxReview(inv.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              <span>مراجعة</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openInboxImageViewer(inv.id)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-100 inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>الصورة</span>
                          </button>
                          {inv.status === 'pending_review' && inv.extractionStatus === 'failed' && (
                            <button
                              type="button"
                              onClick={() => void retryInboxExtraction(inv.id)}
                              title="إعادة القراءة"
                              className="p-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
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
