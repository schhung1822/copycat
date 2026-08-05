// ---------------------------------------------------------------------------
//  Kiểu dữ liệu dùng chung ở frontend.
//  Các interface *Dto* khớp đúng với JSON server trả về.
// ---------------------------------------------------------------------------

/** Ảnh người dùng chọn ở trình duyệt, đã resize & nén trước khi gửi lên server. */
export interface ImageState {
  file: File | null;
  previewUrl: string | null;
  base64: string | null;
  mimeType: string | null;
  width?: number;
  height?: number;
}

export interface User {
  id: number;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  tokenBalance: number;
  createdAt: string;
}

export interface ModelOption {
  code: string;
  label: string;
  family: string;
  resolution: string;
  tokenCost: number;
  notes: string | null;
}

export interface TokenPackage {
  id: number;
  code: string;
  name: string;
  priceVnd: number;
  baseTokens: number;
  bonusTokens: number;
  totalTokens: number;
  pricePerToken: number;
  bonusPercent: number;
  description: string | null;
  isPopular: boolean;
}

export interface BankInfo {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  configured: boolean;
}

export interface Catalog {
  models: ModelOption[];
  packages: TokenPackage[];
  bank: BankInfo;
}

export type GenerationStatus = 'queued' | 'processing' | 'success' | 'failed' | 'refunded';

export interface Generation {
  id: number;
  batchId: string | null;
  modelCode: string;
  modelLabel: string;
  resolution: string;
  aspectRatio: string;
  prompt: string | null;
  tokenCost: number;
  status: GenerationStatus;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
  imageUrl: string | null;
  referenceUrl: string | null;
  productUrls: string[];
}

export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired';

export interface Order {
  id: number;
  code: string;
  packageName: string;
  amountVnd: number;
  baseTokens: number;
  bonusTokens: number;
  totalTokens: number;
  status: OrderStatus;
  paidSource: string | null;
  paymentRef: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  note: string | null;
  qrUrl: string | null;
  transferContent: string;
}

export interface TokenTransaction {
  id: number;
  type: 'topup' | 'spend' | 'refund' | 'adjust';
  amount: number;
  balanceAfter: number;
  description: string | null;
  refType: string | null;
  refId: number | null;
  createdAt: string;
}

export interface WalletSummary {
  tokenBalance: number;
  totalTopupVnd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalImages: number;
  successImages: number;
}

// ---------------------------------------------------------------------------
//  Admin
// ---------------------------------------------------------------------------

export interface AdminOverview {
  revenue: {
    total: number;
    today: number;
    last7Days: number;
    last30Days: number;
    paidOrders: number;
    pendingOrders: number;
    averageOrderValue: number;
  };
  users: {
    total: number;
    newToday: number;
    new30Days: number;
    outstandingTokens: number;
    outstandingLiabilityVnd: number;
  };
  tokens: { sold: number; spent: number };
  generations: {
    total: number;
    success: number;
    failed: number;
    today: number;
    successRate: number;
    avgDurationSec: number;
  };
  cost: {
    apiCostUsd: number;
    apiCostVnd: number;
    grossProfitVnd: number;
    grossMarginPercent: number;
    usdToVnd: number;
  };
  system: {
    queue: { pending: number; running: number };
    providers: { name: string; configured: boolean }[];
    adminEmails: string[];
    downloadResults: boolean;
  };
}

export interface DailyPoint {
  day: string;
  revenueVnd: number;
  orders: number;
  newUsers: number;
  images: number;
  successImages: number;
  tokensSpent: number;
  apiCostVnd: number;
}

export interface AdminUser {
  id: number;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'banned';
  tokenBalance: number;
  totalTopupVnd: number;
  tokensIn: number;
  tokensOut: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminOrder extends Order {
  user: { id: number; email: string; fullName: string | null };
}

export interface AdminModelPricing {
  id: number;
  code: string;
  provider: string;
  providerModel: string;
  label: string;
  family: string;
  resolution: string;
  apiCostUsd: number;
  apiCostVnd: number;
  tokenCost: number;
  sellPriceVnd: number;
  marginPercent: number;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
}

export interface AdminPackage {
  id: number;
  code: string;
  name: string;
  priceVnd: number;
  baseTokens: number;
  bonusTokens: number;
  totalTokens: number;
  pricePerToken: number;
  description: string | null;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface ModelReport {
  modelCode: string;
  modelLabel: string;
  provider: string;
  total: number;
  success: number;
  tokensSpent: number;
  tokenValueVnd: number;
  apiCostVnd: number;
  marginPercent: number;
}

export interface PaymentEvent {
  id: number;
  provider: string;
  externalId: string;
  orderCode: string | null;
  amountVnd: number;
  content: string | null;
  status: 'matched' | 'unmatched' | 'duplicate' | 'error';
  message: string | null;
  createdAt: string;
}
