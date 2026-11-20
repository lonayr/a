import {
  CurrencyCode,
  InboxExtractedSnapshot,
  InboxInvoice,
  InboxReviewLine,
  InventoryItem,
  PurchaseInvoice,
  Supplier,
} from '../types/erp';
import { formatCurrency } from './currency';
import { sanitizeBarcode } from './numbers';
import { normalizeProductName } from './inventoryDomain';

function tokenizeWords(text: string): string[] {
  return normalizeProductName(text)
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function similarityScore(a: string, b: string): number {
  const na = normalizeProductName(a);
  const nb = normalizeProductName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.88;

  const wa = new Set(tokenizeWords(na));
  const wb = new Set(tokenizeWords(nb));
  if (wa.size === 0 || wb.size === 0) return 0;

  let overlap = 0;
  wa.forEach((w) => {
    if (wb.has(w)) overlap += 1;
  });
  return overlap / Math.max(wa.size, wb.size);
}

export function matchSupplierByName(rawName: string, suppliers: Supplier[]): string {
  const clean = normalizeProductName(rawName);
  if (!clean) return '';

  let bestId = '';
  let bestScore = 0;
  for (const s of suppliers) {
    const s1 = similarityScore(clean, s.name);
    const s2 = s.company ? similarityScore(clean, s.company) : 0;
    const score = Math.max(s1, s2);
    if (score > bestScore) {
      bestScore = score;
      bestId = s.id;
    }
  }
  return bestScore >= 0.45 ? bestId : '';
}

export function matchInventoryLine(
  rawName: string,
  rawSku: string | undefined,
  inventory: InventoryItem[]
): {
  matchStatus: 'matched' | 'uncertain' | 'new';
  matchedItemId?: string;
  candidateItemIds: string[];
} {
  const cleanSku = sanitizeBarcode(rawSku || '').toLowerCase();
  if (cleanSku) {
    const exactSku = inventory.find((i) => i.sku.trim().toLowerCase() === cleanSku);
    if (exactSku) {
      return {
        matchStatus: 'matched',
        matchedItemId: exactSku.id,
        candidateItemIds: [exactSku.id],
      };
    }
  }

  const scored = inventory
    .map((item) => {
      const fullName = `${item.brand} ${item.model} ${item.storage}`.trim();
      const score = Math.max(
        similarityScore(rawName, fullName),
        similarityScore(rawName, `${item.brand} ${item.model}`)
      );
      return { item, score };
    })
    .filter((x) => x.score >= 0.3)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0 && scored[0].score >= 0.85) {
    return {
      matchStatus: 'matched',
      matchedItemId: scored[0].item.id,
      candidateItemIds: scored.slice(0, 3).map((s) => s.item.id),
    };
  }

  if (scored.length > 0) {
    return {
      matchStatus: 'uncertain',
      candidateItemIds: scored.slice(0, 3).map((s) => s.item.id),
    };
  }

  return {
    matchStatus: 'new',
    candidateItemIds: [],
  };
}

export interface InboxReviewValidationResult {
  canApprove: boolean;
  blockingErrors: string[];
  warnings: string[];
  subtotal: number;
  netTotal: number;
  totalDiff: number;
  hasTotalMismatch: boolean;
  isDuplicateInvoiceNumber: boolean;
  hasDuplicateLines: boolean;
  hasSellBelowCost: boolean;
  hasZeroOrInvalidLine: boolean;
  duplicateLineIds: Set<string>;
  sellBelowCostLineIds: Set<string>;
  zeroInvalidLineIds: Set<string>;
  unresolvedLineIds: Set<string>;
}

export function validateInboxReview(params: {
  inbox: InboxInvoice;
  inventory: InventoryItem[];
  purchases: PurchaseInvoice[];
}): InboxReviewValidationResult {
  const { inbox, inventory, purchases } = params;
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (inbox.status === 'approved') {
    blockingErrors.push(
      `تم اعتماد هذه الفاتورة مسبقاً برقم (${inbox.linkedPurchaseNumber || inbox.invoiceNumber}) ولا يمكن اعتماد نفس الصورة مرتين.`
    );
  }
  if (inbox.status === 'rejected') {
    blockingErrors.push('هذه الفاتورة مرفوضة ولا يمكن اعتمادها مباشرة.');
  }

  if (inbox.duplicateWarningOfId) {
    warnings.push('تنبيه: هذه الصورة مطابقة أو مشابهة جداً لصورة فاتورة مرفوعة مسبقاً في صندوق الوارد.');
  }

  const isOpening = inbox.purchaseType === 'opening_balance';
  if (!isOpening && !inbox.supplierId) {
    blockingErrors.push('يرجى اختيار المورد أو تحديد النوع كرصيد افتتاحي.');
  }
  if (!inbox.invoiceNumber.trim()) {
    blockingErrors.push('رقم الفاتورة حقل إلزامي.');
  }

  const dupPurchase = purchases.find((p) => {
    if (p.status === 'cancelled') return false;
    if (p.invoiceNumber.trim().toLowerCase() !== inbox.invoiceNumber.trim().toLowerCase()) {
      return false;
    }
    if (isOpening) return p.purchaseType === 'opening_balance';
    return p.supplierId === inbox.supplierId;
  });

  if (dupPurchase) {
    blockingErrors.push(
      isOpening
        ? `رقم فاتورة الرصيد الافتتاحي (${inbox.invoiceNumber.trim()}) مكرر.`
        : `رقم الفاتورة (${inbox.invoiceNumber.trim()}) مسجل مسبقاً لنفس المورد.`
    );
  }

  if (inbox.lines.length === 0) {
    blockingErrors.push('يجب وجود صنف واحد على الأقل للاعتماد.');
  }

  const duplicateLineIds = new Set<string>();
  const sellBelowCostLineIds = new Set<string>();
  const zeroInvalidLineIds = new Set<string>();
  const unresolvedLineIds = new Set<string>();

  const seenItemIds = new Set<string>();
  const seenSkus = new Set<string>();

  let subtotal = 0;

  for (const line of inbox.lines) {
    const qty = Number(line.quantity) || 0;
    const cost = Number(line.unitCost) || 0;
    const sell = Number(line.sellPrice) || 0;

    if (qty <= 0 || cost <= 0) {
      zeroInvalidLineIds.add(line.id);
    }

    if (sell > 0 && cost > 0 && sell < cost) {
      sellBelowCostLineIds.add(line.id);
    }

    if (line.createAsNew) {
      const cleanNewName = (line.newName ?? line.rawName).trim();
      const cleanNewSku = sanitizeBarcode(line.newSku || line.rawSku || '');
      if (!cleanNewName || !cleanNewSku) {
        unresolvedLineIds.add(line.id);
      } else {
        const skuConflict = inventory.find(
          (i) => i.sku.trim().toLowerCase() === cleanNewSku.toLowerCase()
        );
        if (skuConflict) {
          blockingErrors.push(
            `الباركود (${cleanNewSku}) للصنف الجديد "${cleanNewName}" مستخدم مسبقاً للمادة (${skuConflict.brand} ${skuConflict.model}).`
          );
          unresolvedLineIds.add(line.id);
        }
        if (seenSkus.has(cleanNewSku.toLowerCase())) {
          duplicateLineIds.add(line.id);
        }
        seenSkus.add(cleanNewSku.toLowerCase());
      }
    } else if (line.matchedItemId) {
      if (seenItemIds.has(line.matchedItemId)) {
        duplicateLineIds.add(line.id);
      }
      seenItemIds.add(line.matchedItemId);
    } else {
      unresolvedLineIds.add(line.id);
    }

    subtotal += Math.max(0, qty) * Math.max(0, cost);
  }

  if (zeroInvalidLineIds.size > 0) {
    blockingErrors.push('توجد أصناف بكمية أو سعر شراء صفر/غير صالح.');
  }
  if (unresolvedLineIds.size > 0) {
    blockingErrors.push('توجد أصناف غير مربوطة بمادة من المخزن ولم يتم تعيينها كمادة جديدة.');
  }
  if (duplicateLineIds.size > 0) {
    warnings.push('تحذير: يوجد صنف أو باركود مكرر في أكثر من سطر داخل الفاتورة.');
  }
  if (sellBelowCostLineIds.size > 0) {
    warnings.push('تحذير: يوجد صنف سعر بيعه أقل من سعر الشراء.');
  }

  const discount = Math.max(0, Number(inbox.discount) || 0);
  if (discount > subtotal + (inbox.currency === 'USD' ? 0.01 : 0)) {
    blockingErrors.push('الخصم أكبر من المجموع الأولي للفاتورة.');
  }

  const rawNet = Math.max(0, subtotal - Math.min(subtotal, discount));
  const netTotal = inbox.currency === 'USD' ? Number(rawNet.toFixed(2)) : Math.round(rawNet);

  const declared = Math.max(0, Number(inbox.declaredTotal) || 0);
  const diff = Math.abs(netTotal - declared);
  const tolerance = inbox.currency === 'USD' ? 0.05 : 250;
  const hasTotalMismatch = declared > 0 && diff > tolerance;

  if (hasTotalMismatch) {
    warnings.push(
      `تحذير: مجموع الأسطر الصافي (${formatCurrency(netTotal, inbox.currency)}) يختلف عن إجمالي الفاتورة المقروء (${formatCurrency(declared, inbox.currency)}) بفارق ${formatCurrency(diff, inbox.currency)}.`
    );
  }

  return {
    canApprove: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    subtotal: inbox.currency === 'USD' ? Number(subtotal.toFixed(2)) : Math.round(subtotal),
    netTotal,
    totalDiff: inbox.currency === 'USD' ? Number(diff.toFixed(2)) : Math.round(diff),
    hasTotalMismatch,
    isDuplicateInvoiceNumber: Boolean(dupPurchase),
    hasDuplicateLines: duplicateLineIds.size > 0,
    hasSellBelowCost: sellBelowCostLineIds.size > 0,
    hasZeroOrInvalidLine: zeroInvalidLineIds.size > 0,
    duplicateLineIds,
    sellBelowCostLineIds,
    zeroInvalidLineIds,
    unresolvedLineIds,
  };
}

export function buildExtractedDiffSummary(
  inbox: InboxInvoice,
  suppliers: Supplier[]
): { before: string; after: string; changesText: string } {
  const snap: InboxExtractedSnapshot | undefined = inbox.extractedSnapshot;
  const selectedSupplierName =
    inbox.purchaseType === 'opening_balance'
      ? 'رصيد افتتاحي'
      : suppliers.find((s) => s.id === inbox.supplierId)?.name || inbox.supplierNameRead || '-';

  const calcNet = inbox.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0) - (inbox.discount || 0);
  const afterSummary = `${selectedSupplierName} · رقم: ${inbox.invoiceNumber} · ${inbox.lines.length} أصناف · الصافي: ${formatCurrency(Math.max(0, calcNet), inbox.currency)}`;

  if (!snap) {
    return {
      before: 'إدخال/قراءة أولية',
      after: afterSummary,
      changesText: 'اعتماد القيم الحالية',
    };
  }

  const changes: string[] = [];
  if ((snap.invoiceNumber || '') !== inbox.invoiceNumber.trim()) {
    changes.push(`رقم الفاتورة: "${snap.invoiceNumber || '-'}" ← "${inbox.invoiceNumber.trim()}"`);
  }
  if ((snap.supplierName || '') !== selectedSupplierName) {
    changes.push(`المورد: "${snap.supplierName || '-'}" ← "${selectedSupplierName}"`);
  }
  if (snap.currency !== inbox.currency) {
    changes.push(`العملة: ${snap.currency} ← ${inbox.currency}`);
  }
  if (Math.abs((snap.discount || 0) - (inbox.discount || 0)) > 0.01) {
    changes.push(`الخصم: ${snap.discount || 0} ← ${inbox.discount || 0}`);
  }
  if (snap.items.length !== inbox.lines.length) {
    changes.push(`عدد الأصناف: ${snap.items.length} ← ${inbox.lines.length}`);
  } else {
    inbox.lines.forEach((line, idx) => {
      const orig = snap.items[idx];
      if (!orig) return;
      if (orig.quantity !== line.quantity || orig.unitCost !== line.unitCost) {
        changes.push(
          `${line.rawName || `سطر ${idx + 1}`}: (${orig.quantity}×${orig.unitCost}) ← (${line.quantity}×${line.unitCost})`
        );
      }
    });
  }

  const beforeSummary = `${snap.supplierName || '-'} · رقم: ${snap.invoiceNumber || '-'} · ${snap.items.length} أصناف · المقروء: ${formatCurrency(snap.declaredTotal || 0, snap.currency)}`;
  return {
    before: beforeSummary,
    after: afterSummary,
    changesText: changes.length > 0 ? changes.join(' | ') : 'دون تعديلات جوهرية على القيم المقروءة',
  };
}

export interface InboxAlertNotification {
  id: string;
  inboxId: string;
  kind: 'new_ready' | 'failed' | 'stale_over_day';
  title: string;
  subtitle: string;
  createdAt: string;
}

export function computeInboxNotifications(
  inboxInvoices: InboxInvoice[],
  nowMs = Date.now()
): InboxAlertNotification[] {
  const alerts: InboxAlertNotification[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;

  for (const inv of inboxInvoices) {
    if (inv.status !== 'pending_review') continue;

    const refLabel =
      inv.invoiceNumber || inv.supplierNameRead || inv.files[0]?.name || 'فاتورة مصورة';
    const ageMs = nowMs - new Date(inv.uploadedAt).getTime();

    if (inv.extractionStatus === 'failed') {
      alerts.push({
        id: `notif-fail-${inv.id}`,
        inboxId: inv.id,
        kind: 'failed',
        title: `فشل قراءة فاتورة: ${refLabel}`,
        subtitle: inv.extractionError || 'يرجى المراجعة أو إعادة القراءة.',
        createdAt: inv.uploadedAt,
      });
    } else if (inv.extractionStatus === 'ready') {
      alerts.push({
        id: `notif-ready-${inv.id}`,
        inboxId: inv.id,
        kind: 'new_ready',
        title: `فاتورة جديدة بانتظار المراجعة: ${refLabel}`,
        subtitle: `تمت قراءة ${inv.lines.length} أصناف — رُفعت بواسطة ${inv.uploadedByName}`,
        createdAt: inv.uploadedAt,
      });
    }

    if (ageMs >= DAY_MS) {
      const days = Math.max(1, Math.floor(ageMs / DAY_MS));
      alerts.push({
        id: `notif-stale-${inv.id}`,
        inboxId: inv.id,
        kind: 'stale_over_day',
        title: `فاتورة قيد المراجعة منذ ${days} يوم: ${refLabel}`,
        subtitle: 'لم تُعتمد أو تُرفض بعد — يرجى استكمال المراجعة.',
        createdAt: inv.uploadedAt,
      });
    }
  }

  return alerts;
}
