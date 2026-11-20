export type CurrencyCode = 'USD' | 'IQD';
export type DisplayCurrencyMode = 'ORIGINAL' | 'USD' | 'IQD';

export type UserRole = 'admin' | 'accountant' | 'cashier' | 'user';

export interface UserPermissions {
  canSellCash: boolean;
  canSellInstallment: boolean;
  canManageInventory: boolean;
  canEditCostPrices: boolean;
  canViewProfitsAndFX: boolean;
  canReceivePayments: boolean;
  canPaySuppliers: boolean;
  canChangeExchangeRate: boolean;
  canOverrideFXDiff: boolean;
  canDeleteRecords: boolean;
  canManagePrintSettings: boolean;
  canExportData: boolean;
  canRestoreBackup: boolean;
  canManageUsers: boolean;
  canApproveInboxInvoices: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  username: string;
  pin: string;
  role: UserRole;
  active: boolean;
  permissions: UserPermissions;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  imeiList: string[];
  quantity: number;
  minStock: number;
  costCurrency: CurrencyCode;
  costPrice: number;
  sellCurrency: CurrencyCode;
  cashPrice: number;
  installmentPrice: number;
  notes?: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  nationalId?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  notes?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  company: string;
  phone: string;
  address: string;
  notes?: string;
  createdAt: string;
}

export interface SaleLineItem {
  itemId: string;
  sku?: string;
  brand: string;
  model: string;
  specs: string;
  imei?: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  costCurrency: CurrencyCode;
  lineTotal: number;
}

export interface InstallmentScheduleItem {
  id: string;
  index: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'pending' | 'partial' | 'paid';
  lastPaidDate?: string;
}

export type SaleType = 'cash' | 'credit' | 'installment';

export interface SaleInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  saleType: SaleType;
  currency: CurrencyCode;
  exchangeRateAtSale: number; // IQD per 1 USD
  items: SaleLineItem[];
  subtotal: number;
  discount: number;
  discountType?: 'amount' | 'percent';
  discountInput?: number;
  total: number;
  downPaymentUSD: number;
  downPaymentIQD: number;
  downPaymentInInvoiceCurrency: number;
  paidTotal: number;
  remainingAmount: number;
  installmentCount: number;
  installments: InstallmentScheduleItem[];
  notes?: string;
  createdBy: string;
  status?: 'active' | 'cancelled';
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
}

export interface PurchaseLineItem {
  itemId: string;
  sku?: string;
  brand: string;
  model: string;
  specs: string;
  imeiList: string[];
  quantity: number;
  unitCost: number;
  sellPrice?: number;
  installmentPrice?: number;
  lineTotal: number;
}

export type PurchaseType = 'cash' | 'credit' | 'opening_balance';

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  purchaseType: PurchaseType;
  currency: CurrencyCode;
  exchangeRateAtPurchase: number; // IQD per 1 USD
  items: PurchaseLineItem[];
  subtotal?: number;
  discount?: number;
  total: number;
  paidUSD: number;
  paidIQD: number;
  paidTotal: number;
  remainingAmount: number;
  notes?: string;
  createdBy: string;
  status?: 'active' | 'cancelled';
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  sourceInboxId?: string;
}

export type OperationCategory =
  | 'cash_sale'
  | 'down_payment'
  | 'installment_receipt'
  | 'credit_receipt'
  | 'purchase_cash'
  | 'supplier_payment'
  | 'reversal';

export interface PaymentTransaction {
  id: string;
  voucherNumber: string;
  date: string;
  partyType: 'customer' | 'supplier';
  partyId: string;
  partyName: string;
  category: OperationCategory;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceCurrency: CurrencyCode;
  invoiceExchangeRate: number;
  paidUSD: number;
  paidIQD: number;
  paymentExchangeRate: number;
  settledInInvoiceCurrency: number;
  autoCalculatedSettled: number;
  fxDiffIQD: number; // Positive = FX Gain, Negative = FX Loss
  fxDiffUSD: number;
  isManualOverride: boolean;
  installmentId?: string;
  notes?: string;
  createdBy: string;
  status?: 'active' | 'cancelled';
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  isReversal?: boolean;
  reversalOfId?: string;
}

export interface ExchangeRateLog {
  id: string;
  date: string;
  previousRate: number;
  newRate: number;
  source: 'manual_update' | 'auto_conversion' | 'settlement';
  reference?: string;
  note: string;
  userName: string;
}

export type CostCalculationMethod = 'weighted_avg' | 'last_price';

export interface StoreSettings {
  allowNegativeStock: boolean;
  costCalculationMethod: CostCalculationMethod;
}

export type AuditEntityType =
  | 'sale'
  | 'purchase'
  | 'payment'
  | 'inventory'
  | 'customer'
  | 'supplier'
  | 'exchange'
  | 'settings'
  | 'audit'
  | 'inbox'
  | 'user'
  | 'system';

export interface AuditLogEntry {
  id: string;
  date: string;
  userId: string;
  userName: string;
  action: string;
  actionLabel: string;
  entityType: AuditEntityType;
  entityId?: string;
  reference?: string;
  beforeValue?: string;
  afterValue?: string;
  reason?: string;
  note?: string;
}

export type PaperSize = 'A4' | 'A5';

export interface PrintSettings {
  storeName: string;
  storeTagline: string;
  phone: string;
  address: string;
  defaultPaperSize: PaperSize;
  showHeader: boolean;
  showCustomerBalance: boolean;
  showInstallmentTable: boolean;
  showExchangeRateDetails: boolean;
  showSignatures: boolean;
  footerNote: string;
}

export interface ERPState {
  version: string;
  lastSavedAt: string;
  activeExchangeRate: number; // IQD per 1 USD (e.g. 1500 means 150,000 IQD per 100 USD)
  developerMode: 'trial' | 'permanent';
  developerPin: string;
  expiryDate: string;
  users: AppUser[];
  inventory: InventoryItem[];
  customers: Customer[];
  suppliers: Supplier[];
  sales: SaleInvoice[];
  purchases: PurchaseInvoice[];
  payments: PaymentTransaction[];
  exchangeLogs: ExchangeRateLog[];
  auditLogs?: AuditLogEntry[];
  inboxInvoices?: InboxInvoice[];
  storeSettings?: StoreSettings;
  printSettings: PrintSettings;
}

export type InboxInvoiceStatus = 'pending_review' | 'approved' | 'rejected';
export type InboxExtractionStatus = 'queued' | 'reading' | 'ready' | 'failed';
export type InboxMatchStatus = 'matched' | 'uncertain' | 'new';

export interface InboxPageFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  hash: string;
  thumbnailUrl: string;
  inlineDataUrl?: string;
}

export interface InboxReviewLine {
  id: string;
  rawName: string;
  rawSku?: string;
  specs: string;
  quantity: number;
  unitCost: number;
  sellPrice: number;
  installmentPrice?: number;
  matchedItemId?: string;
  matchStatus: InboxMatchStatus;
  candidateItemIds: string[];
  createAsNew?: boolean;
  newSku?: string;
  newName?: string;
}

export interface InboxExtractedSnapshot {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: CurrencyCode;
  discount: number;
  declaredTotal: number;
  notes: string;
  items: {
    name: string;
    sku: string;
    specs: string;
    quantity: number;
    unitCost: number;
    sellPrice: number;
  }[];
}

export interface InboxInvoice {
  id: string;
  files: InboxPageFile[];
  combinedHash: string;
  thumbnailUrl: string;
  status: InboxInvoiceStatus;
  extractionStatus: InboxExtractionStatus;
  extractionError?: string;
  uploadedAt: string;
  uploadedById: string;
  uploadedByName: string;
  reviewedAt?: string;
  reviewedByName?: string;
  hasDraftEdits?: boolean;
  approvedAt?: string;
  approvedByName?: string;
  linkedPurchaseId?: string;
  linkedPurchaseNumber?: string;
  rejectedAt?: string;
  rejectedByName?: string;
  rejectionReason?: string;
  duplicateWarningOfId?: string;
  supplierId: string;
  supplierNameRead: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: CurrencyCode;
  purchaseType: PurchaseType;
  declaredTotal: number;
  discount: number;
  paidUSD: number;
  paidIQD: number;
  notes: string;
  lines: InboxReviewLine[];
  extractedSnapshot?: InboxExtractedSnapshot;
}

export type NavSection =
  | 'dashboard'
  | 'pos'
  | 'sales'
  | 'purchase'
  | 'invoices'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'settlement'
  | 'cashbox'
  | 'exchange'
  | 'print'
  | 'backup'
  | 'ledger'
  | 'reports'
  | 'audit'
  | 'developer'
  | 'settings';

export interface SettlementTarget {
  partyType: 'customer' | 'supplier';
  partyId: string;
  partyName?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceCurrency?: CurrencyCode;
  invoiceExchangeRate?: number;
  remainingAmount?: number;
  installmentId?: string;
  suggestedAmount?: number;
}

export interface ProductFormContext {
  mode: 'edit';
  itemId: string;
  returnTo?: NavSection;
}

export interface PartyFormContext {
  mode: 'new' | 'edit';
  partyId?: string;
  returnTo?: NavSection;
}

export type PrintablePayload =
  | { kind: 'sale'; data: SaleInvoice }
  | { kind: 'purchase'; data: PurchaseInvoice }
  | { kind: 'payment'; data: PaymentTransaction }
  | {
      kind: 'statement';
      title: string;
      subtitle: string;
      partyType: 'customer' | 'supplier' | 'general';
      columns: string[];
      rows: (string | number)[][];
      summaryLines: { label: string; value: string }[];
      rawData: unknown;
    };
