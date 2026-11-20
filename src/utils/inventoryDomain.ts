import {
  CurrencyCode,
  InventoryItem,
  PaymentTransaction,
  PurchaseInvoice,
  PurchaseType,
  StoreSettings,
  Supplier,
} from '../types/erp';
import { calculateSettlementFX, convertAmount } from './currency';
import { sanitizeBarcode } from './numbers';

export interface PurchaseInputLine {
  itemId?: string;
  sku?: string;
  name: string;
  brand?: string;
  model?: string;
  specs?: string;
  quantity: number;
  unitCost: number;
  sellPrice?: number;
  installmentPrice?: number;
  isNewItem?: boolean;
  imeiList?: string[];
}

export interface PurchaseInvoiceCreatePayload {
  supplierId: string;
  purchaseType: PurchaseType;
  currency: CurrencyCode;
  invoiceNumber?: string;
  date?: string;
  invoiceExchangeRate?: number;
  discount?: number;
  items: PurchaseInputLine[];
  paidUSD: number;
  paidIQD: number;
  paymentExchangeRate: number;
  notes?: string;
  sourceInboxId?: string;
}

/**
 * Normalizes Arabic & Latin strings so near-duplicate product names can be flagged.
 */
export function normalizeProductName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Arabic diacritics & tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * Finds existing inventory items whose names are identical or very similar to a candidate name.
 */
export function findSimilarInventoryItems(
  candidateName: string,
  inventory: InventoryItem[]
): InventoryItem[] {
  const normQuery = normalizeProductName(candidateName);
  if (normQuery.length < 2) return [];

  const queryTokens = normQuery.split(' ').filter((t) => t.length >= 2);
  const matches: { item: InventoryItem; score: number }[] = [];

  for (const it of inventory) {
    const full = `${it.brand} ${it.model}`.trim();
    const normItem = normalizeProductName(full);
    if (!normItem) continue;

    if (normItem === normQuery) {
      matches.push({ item: it, score: 100 });
      continue;
    }

    if (
      normQuery.length >= 4 &&
      (normItem.includes(normQuery) || normQuery.includes(normItem))
    ) {
      matches.push({ item: it, score: 85 });
      continue;
    }

    const dist = levenshtein(normQuery, normItem);
    const maxLen = Math.max(normQuery.length, normItem.length);
    if (maxLen >= 4 && dist <= Math.max(2, Math.floor(maxLen * 0.25))) {
      matches.push({ item: it, score: 80 - dist });
      continue;
    }

    if (queryTokens.length > 0) {
      const itemTokens = normItem.split(' ').filter((t) => t.length >= 2);
      const overlap = queryTokens.filter((qt) =>
        itemTokens.some((itTok) => itTok === qt || (qt.length >= 3 && itTok.includes(qt)))
      ).length;
      const ratio = overlap / Math.max(queryTokens.length, itemTokens.length || 1);
      if (overlap >= 2 || ratio >= 0.65) {
        matches.push({ item: it, score: Math.round(ratio * 70) });
      }
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((m) => m.item);
}

/**
 * Editable metadata fields on an existing product.
 * Quantity and Cost fields are intentionally EXCLUDED and cannot be overwritten here.
 */
export type EditableProductMetadataPatch = Partial<
  Pick<
    InventoryItem,
    | 'sku'
    | 'brand'
    | 'model'
    | 'storage'
    | 'color'
    | 'minStock'
    | 'sellCurrency'
    | 'cashPrice'
    | 'installmentPrice'
    | 'notes'
  >
>;

export function applyInventoryMetadataUpdate(
  inventory: InventoryItem[],
  id: string,
  patch: Partial<InventoryItem>,
  nowIso: string
): { ok: boolean; error?: string; existing?: InventoryItem; updatedItem?: InventoryItem } {
  const existing = inventory.find((it) => it.id === id);
  if (!existing) return { ok: false, error: 'المنتج غير موجود.' };

  const nextSku = patch.sku !== undefined ? sanitizeBarcode(patch.sku) : existing.sku;
  if (!nextSku) {
    return { ok: false, error: 'الباركود / الكود (SKU) حقل إلزامي.' };
  }
  const duplicate = inventory.find(
    (it) => it.id !== id && it.sku.trim().toLowerCase() === nextSku.toLowerCase()
  );
  if (duplicate) {
    return {
      ok: false,
      error: `الباركود (${nextSku}) مستخدم مسبقاً للمنتج: ${duplicate.brand} ${duplicate.model}.`,
    };
  }

  // Strictly preserve quantity, costCurrency, costPrice, imeiList — never allow direct overwrite
  const updatedItem: InventoryItem = {
    ...existing,
    sku: nextSku,
    brand: patch.brand !== undefined ? patch.brand : existing.brand,
    model: patch.model !== undefined ? patch.model : existing.model,
    storage: patch.storage !== undefined ? patch.storage : existing.storage,
    color: patch.color !== undefined ? patch.color : existing.color,
    minStock: patch.minStock !== undefined ? Math.max(0, Math.round(patch.minStock)) : existing.minStock,
    sellCurrency: patch.sellCurrency !== undefined ? patch.sellCurrency : existing.sellCurrency,
    cashPrice: patch.cashPrice !== undefined ? Math.max(0, patch.cashPrice) : existing.cashPrice,
    installmentPrice:
      patch.installmentPrice !== undefined
        ? Math.max(0, patch.installmentPrice)
        : existing.installmentPrice,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    quantity: existing.quantity,
    costCurrency: existing.costCurrency,
    costPrice: existing.costPrice,
    imeiList: existing.imeiList,
    updatedAt: nowIso,
  };

  return { ok: true, existing, updatedItem };
}

export function executeStockAdjustment(params: {
  inventory: InventoryItem[];
  itemId: string;
  newQuantity: number;
  reason: string;
  allowNegativeStock: boolean;
  nowIso: string;
}): {
  ok: boolean;
  error?: string;
  existing?: InventoryItem;
  updatedItem?: InventoryItem;
  previousQty?: number;
  newQty?: number;
} {
  const { inventory, itemId, newQuantity, reason, allowNegativeStock, nowIso } = params;
  const cleanReason = reason.trim();
  if (!cleanReason) {
    return { ok: false, error: 'يرجى كتابة سبب تسوية المخزون (إلزامي).' };
  }
  if (!Number.isFinite(newQuantity)) {
    return { ok: false, error: 'الكمية الجديدة غير صالحة.' };
  }
  const cleanQty = Math.round(newQuantity);
  if (!allowNegativeStock && cleanQty < 0) {
    return { ok: false, error: 'لا يمكن تسجيل كمية سالبة حسب إعدادات المخزون.' };
  }

  const existing = inventory.find((it) => it.id === itemId);
  if (!existing) {
    return { ok: false, error: 'المادة غير موجودة في المخزون.' };
  }
  if (cleanQty === existing.quantity) {
    return { ok: false, error: 'الكمية الجديدة مطابقة للكمية الحالية في المخزون.' };
  }

  const updatedItem: InventoryItem = {
    ...existing,
    quantity: cleanQty,
    updatedAt: nowIso,
  };

  return {
    ok: true,
    existing,
    updatedItem,
    previousQty: existing.quantity,
    newQty: cleanQty,
  };
}

export function processPurchaseInvoiceCreation(params: {
  inventory: InventoryItem[];
  suppliers: Supplier[];
  purchases: PurchaseInvoice[];
  payments: PaymentTransaction[];
  activeExchangeRate: number;
  storeSettings: StoreSettings;
  currentUserName: string;
  input: PurchaseInvoiceCreatePayload;
  nowIso: string;
  uniqueIdFn: (prefix: string) => string;
  nextSequenceCodeFn: (
    prefix: string,
    existing: string[],
    startAt?: number,
    separator?: string
  ) => string;
}): {
  ok: boolean;
  error?: string;
  purchase?: PurchaseInvoice;
  workingInventory?: InventoryItem[];
  newPayments?: PaymentTransaction[];
} {
  const {
    inventory,
    suppliers,
    purchases,
    payments,
    activeExchangeRate,
    storeSettings,
    currentUserName,
    input,
    nowIso,
    uniqueIdFn,
    nextSequenceCodeFn,
  } = params;

  const isOpeningBalance = input.purchaseType === 'opening_balance';
  const supplier = isOpeningBalance
    ? undefined
    : suppliers.find((s) => s.id === input.supplierId);

  if (!isOpeningBalance && !supplier) {
    return { ok: false, error: 'يرجى اختيار المورد أولاً.' };
  }
  if (!input.items.length) {
    return { ok: false, error: 'يرجى إضافة صنف واحد على الأقل لفاتورة الشراء.' };
  }

  for (const line of input.items) {
    if (!line.name || !line.name.trim()) {
      return { ok: false, error: 'اسم المادة إلزامي لكل سطر في الفاتورة.' };
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      return { ok: false, error: `الكمية يجب أن تكون أكبر من صفر للصنف: ${line.name}` };
    }
    if (!Number.isFinite(line.unitCost) || line.unitCost <= 0) {
      return { ok: false, error: `سعر الشراء يجب أن يكون أكبر من صفر للصنف: ${line.name}` };
    }
  }

  const purDateIso = input.date || nowIso;
  const invoiceNumber =
    input.invoiceNumber?.trim() ||
    nextSequenceCodeFn(
      isOpeningBalance ? 'OB' : 'P',
      purchases.map((p) => p.invoiceNumber),
      2001,
      ''
    );

  const dupPurchase = purchases.find((p) => {
    if (p.status === 'cancelled') return false;
    if (p.invoiceNumber.trim().toLowerCase() !== invoiceNumber.toLowerCase()) return false;
    if (isOpeningBalance) return p.purchaseType === 'opening_balance';
    return p.supplierId === input.supplierId;
  });

  if (dupPurchase) {
    return {
      ok: false,
      error: isOpeningBalance
        ? `رقم فاتورة الرصيد الافتتاحي (${invoiceNumber}) مسجل مسبقاً.`
        : `رقم الفاتورة (${invoiceNumber}) مسجل مسبقاً لنفس المورد (${supplier?.name || ''}). يرجى استخدام رقم فاتورة مختلف.`,
    };
  }

  const lockedRate =
    input.invoiceExchangeRate && input.invoiceExchangeRate > 0
      ? input.invoiceExchangeRate
      : activeExchangeRate;
  const costMethod = storeSettings.costCalculationMethod;

  const workingInventory = inventory.map((item) => ({
    ...item,
    imeiList: [...item.imeiList],
  }));

  const purchaseLines = [];

  for (let idx = 0; idx < input.items.length; idx++) {
    const line = input.items[idx];
    const cleanSku = sanitizeBarcode(line.sku || '');
    const cleanName = line.name.trim();

    let inv: InventoryItem | undefined;

    if (!line.isNewItem) {
      inv = line.itemId ? workingInventory.find((i) => i.id === line.itemId) : undefined;
      if (!inv && cleanSku) {
        inv = workingInventory.find((i) => i.sku.toLowerCase() === cleanSku.toLowerCase());
      }
      if (!inv && cleanName) {
        inv = workingInventory.find(
          (i) => `${i.brand} ${i.model}`.trim().toLowerCase() === cleanName.toLowerCase()
        );
      }
    } else if (cleanSku) {
      // Strictly reject duplicate barcode when explicitly creating a new item
      const duplicateSkuItem = workingInventory.find(
        (i) => i.sku.trim().toLowerCase() === cleanSku.toLowerCase()
      );
      if (duplicateSkuItem) {
        return {
          ok: false,
          error: `الباركود (${cleanSku}) مستخدم مسبقاً للمادة: ${duplicateSkuItem.brand} ${duplicateSkuItem.model}. لا يمكن تكرار الباركود.`,
        };
      }
    }

    const sellPrice =
      line.sellPrice && line.sellPrice > 0
        ? line.sellPrice
        : inv
        ? convertAmount(inv.cashPrice, inv.sellCurrency, input.currency, lockedRate)
        : input.currency === 'USD'
        ? Number((line.unitCost * 1.15).toFixed(2))
        : Math.round(line.unitCost * 1.15);

    const resolvedInstallment =
      line.installmentPrice && line.installmentPrice > 0
        ? line.installmentPrice
        : input.currency === 'USD'
        ? Number((sellPrice * 1.1).toFixed(2))
        : Math.round(sellPrice * 1.1);

    if (inv) {
      const oldQty = inv.quantity;
      const newTotalQty = oldQty + line.quantity;

      if (costMethod === 'weighted_avg' && oldQty > 0) {
        const oldCostInPurCurrency = convertAmount(
          inv.costPrice,
          inv.costCurrency,
          input.currency,
          lockedRate
        );
        const weightedRaw =
          (oldQty * oldCostInPurCurrency + line.quantity * line.unitCost) /
          Math.max(1, newTotalQty);
        inv.costPrice =
          input.currency === 'USD'
            ? Number(weightedRaw.toFixed(2))
            : Math.round(weightedRaw);
      } else {
        inv.costPrice = line.unitCost;
      }
      inv.costCurrency = input.currency;
      inv.quantity = newTotalQty;

      if (line.sellPrice && line.sellPrice > 0) {
        inv.sellCurrency = input.currency;
        inv.cashPrice = line.sellPrice;
        inv.installmentPrice = resolvedInstallment;
      }
      if (line.imeiList && line.imeiList.length > 0) {
        inv.imeiList.push(...line.imeiList);
      }
      inv.updatedAt = nowIso;
    } else {
      // Creating a brand-new InventoryItem solely inside Purchase Invoice creation
      if (cleanSku) {
        const duplicateSkuItem = workingInventory.find(
          (w) => w.sku.trim().toLowerCase() === cleanSku.toLowerCase()
        );
        if (duplicateSkuItem) {
          return {
            ok: false,
            error: `الباركود (${cleanSku}) مستخدم مسبقاً للمادة: ${duplicateSkuItem.brand} ${duplicateSkuItem.model}. لا يمكن تكرار الباركود.`,
          };
        }
      }

      const newId = `itm-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
      let generatedSku = cleanSku || `B${Math.floor(100000 + Math.random() * 900000)}`;
      while (workingInventory.some((w) => w.sku.toLowerCase() === generatedSku.toLowerCase())) {
        generatedSku = `B${Math.floor(100000 + Math.random() * 900000)}`;
      }

      const itemBrand = line.brand !== undefined ? line.brand.trim() : cleanName;
      const itemModel = line.model !== undefined ? line.model.trim() : '';

      const createdItem: InventoryItem = {
        id: newId,
        sku: generatedSku,
        brand: itemBrand || cleanName,
        model: itemModel,
        storage: line.specs?.trim() || 'قياسي',
        color: '',
        imeiList: line.imeiList || [],
        quantity: line.quantity,
        minStock: 2,
        costCurrency: input.currency,
        costPrice: line.unitCost,
        sellCurrency: input.currency,
        cashPrice: sellPrice,
        installmentPrice: resolvedInstallment,
        updatedAt: nowIso,
      };
      workingInventory.unshift(createdItem);
      inv = createdItem;
    }

    const lineTotal =
      input.currency === 'USD'
        ? Number((line.unitCost * line.quantity).toFixed(2))
        : Math.round(line.unitCost * line.quantity);

    purchaseLines.push({
      itemId: inv.id,
      sku: inv.sku,
      brand: inv.brand,
      model: inv.model,
      specs: line.specs?.trim() || inv.storage || 'قياسي',
      imeiList: line.imeiList || [],
      quantity: line.quantity,
      unitCost: line.unitCost,
      sellPrice,
      installmentPrice: resolvedInstallment,
      lineTotal,
    });
  }

  const subtotal = purchaseLines.reduce((s, l) => s + l.lineTotal, 0);
  const discount = isOpeningBalance ? 0 : Math.max(0, input.discount || 0);
  if (!isOpeningBalance && discount > subtotal + (input.currency === 'USD' ? 0.01 : 0)) {
    return { ok: false, error: 'خصم المورد لا يمكن أن يتجاوز المجموع الأولي للفاتورة.' };
  }
  const total =
    input.currency === 'USD'
      ? Number(Math.max(0, subtotal - discount).toFixed(2))
      : Math.max(0, Math.round(subtotal - discount));
  const payRate = input.paymentExchangeRate > 0 ? input.paymentExchangeRate : lockedRate;

  let paidUSD = isOpeningBalance ? 0 : Math.max(0, input.paidUSD || 0);
  let paidIQD = isOpeningBalance ? 0 : Math.max(0, Math.round(input.paidIQD || 0));
  if (input.purchaseType === 'cash' && paidUSD === 0 && paidIQD === 0) {
    if (input.currency === 'USD') paidUSD = total;
    else paidIQD = total;
  }

  const fxCalc = calculateSettlementFX({
    partyType: 'supplier',
    invoiceCurrency: input.currency,
    invoiceExchangeRate: lockedRate,
    paymentExchangeRate: payRate,
    paidUSD,
    paidIQD,
  });

  const paidTotal = isOpeningBalance
    ? 0
    : input.purchaseType === 'cash'
    ? total
    : Math.min(total, fxCalc.settledInInvoiceCurrency);

  const remainingAmount = isOpeningBalance
    ? 0
    : input.currency === 'USD'
    ? Number(Math.max(0, total - paidTotal).toFixed(2))
    : Math.max(0, Math.round(total - paidTotal));

  const purchaseId = uniqueIdFn('pur');
  const newPurchase: PurchaseInvoice = {
    id: purchaseId,
    invoiceNumber,
    date: purDateIso,
    supplierId: supplier?.id || '',
    supplierName: supplier?.name || 'رصيد افتتاحي للمخزن',
    purchaseType: input.purchaseType,
    currency: input.currency,
    exchangeRateAtPurchase: lockedRate,
    items: purchaseLines,
    subtotal,
    discount,
    total,
    paidUSD,
    paidIQD,
    paidTotal,
    remainingAmount,
    notes: input.notes,
    createdBy: currentUserName,
    status: 'active',
    sourceInboxId: input.sourceInboxId,
  };

  const newPayments: PaymentTransaction[] = [];
  if (!isOpeningBalance && supplier && (paidTotal > 0 || paidUSD > 0 || paidIQD > 0)) {
    const voucherNumber = nextSequenceCodeFn(
      'PV',
      payments
        .filter((p) => p.partyType === 'supplier' && !p.isReversal)
        .map((p) => p.voucherNumber),
      4001
    );
    newPayments.push({
      id: uniqueIdFn('pay'),
      voucherNumber,
      date: purDateIso,
      partyType: 'supplier',
      partyId: supplier.id,
      partyName: supplier.name,
      category: input.purchaseType === 'cash' ? 'purchase_cash' : 'supplier_payment',
      invoiceId: purchaseId,
      invoiceNumber,
      invoiceCurrency: input.currency,
      invoiceExchangeRate: lockedRate,
      paidUSD,
      paidIQD,
      paymentExchangeRate: payRate,
      settledInInvoiceCurrency: paidTotal,
      autoCalculatedSettled: fxCalc.autoSettledInInvoiceCurrency,
      fxDiffIQD: fxCalc.fxDiffIQD,
      fxDiffUSD: fxCalc.fxDiffUSD,
      isManualOverride: false,
      notes: `دفعة شراء فاتورة ${invoiceNumber}`,
      createdBy: currentUserName,
      status: 'active',
    });
  }

  return {
    ok: true,
    purchase: newPurchase,
    workingInventory,
    newPayments,
  };
}
