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
  createdAt: string;

  /** Đang có gói dịch vụ còn hiệu lực hay không — quyết định có được tạo ảnh */
  isSubscribed: boolean;
  subscriptionExpiresAt: string | null;
  /** Hạn mức token được cấp mỗi tháng theo gói */
  monthlyAllowance: number;
  /** Hạn mức còn lại của chu kỳ tháng hiện tại (không cộng dồn sang tháng sau) */
  monthlyTokens: number;
  /** Thời điểm hạn mức được cấp lại */
  monthlyPeriodEnd: string | null;
  /** Token mua thêm từ gói lẻ — không hết hạn */
  purchasedTokens: number;
  /** Tổng dùng được ngay = monthlyTokens + purchasedTokens */
  tokenBalance: number;
}

export interface SubscriptionPlan {
  id: number;
  code: string;
  name: string;
  months: number;
  priceVnd: number;
  pricePerMonthVnd: number;
  monthlyTokenAllowance: number;
  description: string | null;
  isPopular: boolean;
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

export interface UpgradeOption {
  planId: number;
  name: string;
  months: number;
  monthlyTokenAllowance: number;
  /** Giá niêm yết của gói mới */
  listPriceVnd: number;
  /** Phần khấu trừ từ gói hiện tại */
  creditVnd: number;
  /** Số tiền thực phải trả */
  payableVnd: number;
  remainingDays: number;
  totalDays: number;
}

export interface UpgradeInfo {
  currentPlan: { planId: number | null; name: string; priceVnd: number; expiresAt: string } | null;
  options: UpgradeOption[];
}

export interface BankInfo {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  configured: boolean;
}

export interface SiteInfo {
  companyName: string;
  companyAddress: string;
  supportEmail: string;
  supportPhone: string;
  policyUpdatedAt: string;
  /** Số phút đơn hàng còn hiệu lực, dùng trong trang Chính sách */
  orderExpireMinutes: number;
}

export interface Catalog {
  plans: SubscriptionPlan[];
  models: ModelOption[];
  packages: TokenPackage[];
  bank: BankInfo;
  site: SiteInfo;
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
  orderType: 'subscription' | 'token_package';
  subscriptionMonths: number | null;
  isUpgrade: boolean;
  /** Nâng gói: số tiền được khấu trừ từ phần chưa dùng của gói cũ */
  creditVnd: number;
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
  type: 'topup' | 'spend' | 'refund' | 'adjust' | 'grant' | 'expire';
  bucket: 'monthly' | 'purchased';
  amount: number;
  balanceAfter: number;
  description: string | null;
  refType: string | null;
  refId: number | null;
  createdAt: string;
}

export interface WalletSummary {
  tokenBalance: number;
  monthlyTokens: number;
  monthlyAllowance: number;
  monthlyPeriodEnd: string | null;
  purchasedTokens: number;
  isSubscribed: boolean;
  subscriptionExpiresAt: string | null;
  subscriptionName: string | null;
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
    subscriptionRevenue: number;
    extraTokenRevenue: number;
  };
  subscribers: {
    active: number;
    expiringIn7Days: number;
    monthlyTokensRemaining: number;
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
  /** Tổng dùng được ngay = monthlyTokens + purchasedTokens */
  tokenBalance: number;
  /** Token mua thêm — không hết hạn */
  purchasedTokens: number;
  /** Hạn mức tháng còn lại */
  monthlyTokens: number;
  /** Hạn mức được cấp mỗi tháng theo gói */
  monthlyAllowance: number;
  monthlyPeriodEnd: string | null;
  subscriptionExpiresAt: string | null;
  /** Tên gói của thuê bao gần nhất, null nếu chưa mua gói nào */
  planName: string | null;
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

// Tab "Webhook ngân hàng" đã bỏ khỏi bảng điều khiển nên không còn kiểu PaymentEvent
// ở frontend. Webhook vẫn chạy và vẫn ghi bảng `payment_events`; khi cần tra cứu một
// giao dịch thất lạc thì gọi thẳng `GET /api/admin/payment-events` (xem README mục 6).
