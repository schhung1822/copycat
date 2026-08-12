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

  /*
   * --- Tiếp thị liên kết ---
   * Vai trò affiliate tách khỏi `role`: quyền admin suy ra từ ADMIN_EMAILS trong
   * .env, còn affiliate do admin cấp trong trang quản trị, và một người có thể
   * vừa là admin vừa là affiliate.
   */
  isAffiliate: boolean;
  affiliateCode: string | null;

  /*
   * --- Di sản gói tháng ---
   * Gói tháng đã ngừng bán. Các trường dưới đây chỉ còn khác 0 với những khách
   * mua gói từ trước (hoặc được admin cấp tay) và đang trong thời hạn — giao
   * diện phải xử lý được cả hai trường hợp cho tới khi gói cuối cùng hết hạn.
   */
  isSubscribed: boolean;
  subscriptionExpiresAt: string | null;
  /** Hạn mức điểm được cấp mỗi tháng theo gói */
  monthlyAllowance: number;
  /** Hạn mức còn lại của chu kỳ tháng hiện tại (không cộng dồn sang tháng sau) */
  monthlyTokens: number;
  /** Thời điểm hạn mức được cấp lại */
  monthlyPeriodEnd: string | null;

  /** Điểm đã mua — không hết hạn. Đây là nguồn điểm duy nhất của khách mới. */
  purchasedTokens: number;
  /** Tổng dùng được ngay = monthlyTokens + purchasedTokens */
  tokenBalance: number;
}

export interface ModelOption {
  code: string;
  label: string;
  family: string;
  resolution: string;
  tokenCost: number;
  /** Model admin chọn làm mốc quy số điểm ra số ảnh trên thẻ gói điểm */
  isEstimateReference: boolean;
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
  tokens: {
    /** Điểm đã bán ra qua các đơn đã thanh toán */
    sold: number;
    /** Đã tiêu ròng, đọc từ sổ cái và đã trừ phần hoàn cho ảnh lỗi */
    used: number;
    usedToday: number;
    usedLast30Days: number;
    /** Phần tiêu từ nguồn điểm khách bỏ tiền mua, không tính hạn mức tháng cũ */
    usedPurchased: number;
    /** Đã hoàn lại vì ảnh lỗi */
    refunded: number;
  };
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
    /** `users` = số khách đang có ảnh chạy, để biết trần chung có bị một người chiếm hết không */
    queue: { pending: number; running: number; users: number };
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
  isAffiliate: boolean;
  affiliateCode: string | null;
  /** Email người đã giới thiệu khách này, null nếu khách tự tìm đến. */
  referrerEmail: string | null;
  /** Tổng dùng được ngay = monthlyTokens + purchasedTokens */
  tokenBalance: number;
  /** Điểm mua thêm — không hết hạn */
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
  /** Model làm mốc quy số điểm ra số ảnh trên thẻ gói điểm — chỉ một model được bật */
  isEstimateReference: boolean;
  sortOrder: number;
  notes: string | null;
}

export interface AdminPlan {
  id: number;
  code: string;
  name: string;
  months: number;
  priceVnd: number;
  pricePerMonthVnd: number;
  /** 0 = gói không tặng điểm hàng tháng (gói miễn phí), khách chỉ dùng điểm mua thêm */
  monthlyTokenAllowance: number;
  /** Hạn mức quy ra tiền vốn — 1 điểm = 1đ giá vốn */
  allowanceCostVnd: number;
  description: string | null;
  isPopular: boolean;
  /** Tắt = không bán trên trang bảng giá, nhưng admin vẫn cấp tay được */
  isActive: boolean;
  sortOrder: number;
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

// ---------------------------------------------------------------------------
//  Tiếp thị liên kết
// ---------------------------------------------------------------------------

export type CommissionStatus = 'pending' | 'paid' | 'cancelled';

/**
 * Một khoản hoa hồng, chụp lại toàn bộ cách tính tại thời điểm ghi nhận:
 *
 *     lợi nhuận = doanh thu − giá vốn điểm đã bán − chi phí cố định
 *     hoa hồng  = lợi nhuận × commissionPercent
 *
 * Nhờ chụp lại mà admin đổi tỉ lệ về sau không làm sai lệch các khoản đã chốt.
 */
export interface AffiliateCommission {
  id: number;
  orderCode: string;
  revenueVnd: number;
  tokenCostVnd: number;
  fixedCostVnd: number;
  profitVnd: number;
  commissionPercent: number;
  commissionVnd: number;
  status: CommissionStatus;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
  /** Email khách đã che bớt (trang của cộng tác viên) */
  customer: string;
}

export interface AffiliateStats {
  referrals: number;
  payingReferrals: number;
  orders: number;
  revenueVnd: number;
  profitVnd: number;
  commissionVnd: number;
  pendingVnd: number;
  /** Số khoản đang chờ — đơn không có lãi cho hoa hồng 0đ nên tiền và số lượng không suy ra nhau. */
  pendingCount: number;
  paidVnd: number;
}

export interface AffiliateSummary {
  isAffiliate: boolean;
  /** Chương trình có đang chạy không — admin tắt được ở trang quản trị. */
  enabled: boolean;
  commissionPercent: number;
  code: string | null;
  referralLink: string | null;
  stats: AffiliateStats;
}

export interface AffiliateReferral {
  id: number;
  customer: string;
  joinedAt: string;
  revenueVnd: number;
  commissionVnd: number;
}

export interface AffiliateSettings {
  enabled: boolean;
  commissionPercent: number;
  /** Chi phí cố định trừ thẳng mỗi đơn (phí cổng thanh toán, phí xử lý...) */
  fixedCostVnd: number;
  /** Chi phí cố định phân bổ theo % doanh thu (hạ tầng, nhân sự, marketing...) */
  fixedCostPercent: number;
}

/** Ví dụ tính trên một gói điểm đang bán, do server tính để khớp đúng công thức thật. */
export interface AffiliateExample {
  packageName: string;
  tokens: number;
  revenueVnd: number;
  tokenCostVnd: number;
  fixedCostVnd: number;
  profitVnd: number;
  commissionPercent: number;
  commissionVnd: number;
}

export interface AdminAffiliate {
  id: number;
  email: string;
  fullName: string | null;
  status: 'active' | 'banned';
  code: string | null;
  referralLink: string | null;
  createdAt: string;
  stats: AffiliateStats;
}

export interface AdminCommission extends Omit<AffiliateCommission, 'customer'> {
  affiliate: { id: number; email: string };
  customer: { id: number; email: string };
}

// Tab "Webhook ngân hàng" đã bỏ khỏi bảng điều khiển nên không còn kiểu PaymentEvent
// ở frontend. Webhook vẫn chạy và vẫn ghi bảng `payment_events`; khi cần tra cứu một
// giao dịch thất lạc thì gọi thẳng `GET /api/admin/payment-events` (xem README mục 6).
