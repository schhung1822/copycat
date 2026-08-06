import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Thư mục gốc của dự án (nơi chứa package.json / .env) */
export const ROOT_DIR = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const str = (key: string, fallback = ''): string => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

const num = (key: string, fallback: number): number => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
};

const bool = (key: string, fallback: boolean): boolean => {
  const value = process.env[key];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const list = (key: string): string[] =>
  str(key)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  isProd: str('NODE_ENV', 'development') === 'production',
  port: num('PORT', 4000),
  /**
   * Địa chỉ lắng nghe. Khi chạy sau nginx trên VPS nên đặt HOST=127.0.0.1 để cổng
   * Node không lộ ra Internet. Mặc định 0.0.0.0 cho tiện lúc chạy thử.
   */
  host: str('HOST', '0.0.0.0'),
  appUrl: str('APP_URL', 'http://localhost:3000'),

  db: {
    host: str('DB_HOST', '127.0.0.1'),
    port: num('DB_PORT', 3306),
    user: str('DB_USER', 'root'),
    password: str('DB_PASSWORD', ''),
    name: str('DB_NAME', 'copycat_ai'),
    autoMigrate: bool('DB_AUTO_MIGRATE', true),
  },

  jwtSecret: str('JWT_SECRET', 'dev-only-insecure-secret'),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '7d'),

  adminEmails: list('ADMIN_EMAILS'),
  adminBootstrap: {
    email: str('ADMIN_BOOTSTRAP_EMAIL').toLowerCase(),
    password: str('ADMIN_BOOTSTRAP_PASSWORD'),
  },

  kie: {
    apiKey: str('KIE_API_KEY'),
    baseUrl: str('KIE_BASE_URL', 'https://api.kie.ai').replace(/\/+$/, ''),
    uploadUrl: str('KIE_UPLOAD_URL', 'https://kieai.redpandaai.co/api/file-base64-upload'),
  },

  usdToVnd: num('USD_TO_VND', 28000),

  /** Thông tin pháp lý & liên hệ, hiển thị ở trang Chính sách. */
  site: {
    companyName: str('COMPANY_NAME'),
    companyAddress: str('COMPANY_ADDRESS'),
    supportEmail: str('SUPPORT_EMAIL'),
    supportPhone: str('SUPPORT_PHONE'),
    policyUpdatedAt: str('POLICY_UPDATED_AT'),
  },

  bank: {
    code: str('BANK_CODE', 'MB'),
    accountNumber: str('BANK_ACCOUNT_NUMBER', ''),
    accountName: str('BANK_ACCOUNT_NAME', ''),
    bankName: str('BANK_NAME', ''),
  },
  orderPrefix: str('ORDER_PREFIX', 'NAP').toUpperCase().replace(/[^A-Z]/g, '') || 'NAP',
  orderExpireMinutes: num('ORDER_EXPIRE_MINUTES', 60),
  /**
   * Chu kỳ quét các đơn được hệ thống ngoài đánh dấu đã thanh toán (giây).
   * Càng nhỏ thì gói được kích hoạt càng nhanh sau khi workflow ghi vào DB.
   */
  orderSyncIntervalSeconds: Math.max(num('ORDER_SYNC_INTERVAL_SECONDS', 20), 5),

  sepayApiKey: str('SEPAY_WEBHOOK_API_KEY'),
  cassoSecureToken: str('CASSO_WEBHOOK_SECURE_TOKEN'),

  storageDir: path.isAbsolute(str('STORAGE_DIR', 'server/storage'))
    ? str('STORAGE_DIR', 'server/storage')
    : path.join(ROOT_DIR, str('STORAGE_DIR', 'server/storage')),
  downloadResults: bool('DOWNLOAD_RESULTS', true),

  maxConcurrentJobs: num('MAX_CONCURRENT_JOBS', 4),
  maxQueuePerUser: num('MAX_QUEUE_PER_USER', 12),
};

/** Cảnh báo các cấu hình còn thiếu / không an toàn khi khởi động. */
export function checkEnv(): void {
  const warnings: string[] = [];

  const placeholderSecrets = ['dev-only-insecure-secret', 'doi_chuoi_nay_thanh_mot_chuoi_ngau_nhien_that_dai'];
  if (placeholderSecrets.includes(env.jwtSecret) || env.jwtSecret.length < 24) {
    warnings.push(
      'JWT_SECRET vẫn là giá trị mẫu hoặc quá ngắn. Sinh chuỗi mới bằng: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }
  if (!env.kie.apiKey) {
    warnings.push('KIE_API_KEY chưa được cấu hình — chức năng tạo ảnh sẽ báo lỗi.');
  }
  if (env.adminEmails.length === 0) {
    warnings.push('ADMIN_EMAILS đang trống — sẽ không có ai vào được bảng điều khiển.');
  }
  if (!env.bank.accountNumber) {
    warnings.push('BANK_ACCOUNT_NUMBER chưa cấu hình — trang nạp tiền sẽ không hiện được mã QR.');
  }
  if (!env.sepayApiKey && !env.cassoSecureToken) {
    warnings.push('Chưa cấu hình SEPAY_WEBHOOK_API_KEY / CASSO_WEBHOOK_SECURE_TOKEN — đơn nạp phải duyệt tay trong trang Admin.');
  }

  for (const warning of warnings) {
    console.warn(`[cấu hình] ${warning}`);
  }
}
