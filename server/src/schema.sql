-- =====================================================================
--  DESIGN COPYCAT AI — SƠ ĐỒ CƠ SỞ DỮ LIỆU (MySQL 8 / MariaDB 10.4+)
--  Server tự chạy file này khi khởi động nếu DB_AUTO_MIGRATE=true.
--  Mọi câu lệnh đều idempotent (IF NOT EXISTS) nên chạy lại vô hại.
--  Đơn vị tiền: VND, lưu dạng số nguyên (BIGINT), không có phần thập phân.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. KHÁCH HÀNG
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email           VARCHAR(190)    NOT NULL,
  password_hash   VARCHAR(255)    NOT NULL,
  full_name       VARCHAR(190)    NULL,
  phone           VARCHAR(32)     NULL,
  role            ENUM('user','admin') NOT NULL DEFAULT 'user',
  status          ENUM('active','banned') NOT NULL DEFAULT 'active',
  -- Token MUA THÊM (gói lẻ). Không hết hạn, chỉ dùng khi hạn mức tháng đã cạn.
  token_balance   INT             NOT NULL DEFAULT 0,

  -- --- Thuê bao tháng (ghi đè phẳng vào đây để thao tác trừ token chỉ khoá 1 dòng) ---
  subscription_expires_at DATETIME NULL,
  -- Hạn mức token được cấp mỗi tháng theo gói đang dùng
  monthly_allowance   INT         NOT NULL DEFAULT 0,
  -- Hạn mức còn lại của chu kỳ tháng hiện tại. KHÔNG cộng dồn sang tháng sau.
  monthly_tokens      INT         NOT NULL DEFAULT 0,
  -- Thời điểm kết thúc chu kỳ tháng hiện tại; qua mốc này hạn mức được cấp lại.
  monthly_period_end  DATETIME    NULL,

  -- Số liệu tích luỹ, phục vụ báo cáo nhanh không phải quét bảng ledger.
  total_topup_vnd BIGINT          NOT NULL DEFAULT 0,
  total_tokens_in INT             NOT NULL DEFAULT 0,
  total_tokens_out INT            NOT NULL DEFAULT 0,
  last_login_at   DATETIME        NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 1b. GÓI THUÊ BAO THÁNG
--     Khách bắt buộc mua gói này trước khi được tạo ảnh. Giá gói đã gồm chi phí
--     duy trì, nhân sự và một hạn mức token dùng trong tháng.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(50)  NOT NULL,           -- vd: MONTHLY_1, MONTHLY_12
  name          VARCHAR(120) NOT NULL,
  months        INT          NOT NULL,           -- chu kỳ: 1, 3, 6, 12
  price_vnd     BIGINT       NOT NULL,           -- tổng tiền cho cả chu kỳ
  -- Hạn mức token cấp lại MỖI THÁNG (không cộng dồn sang tháng sau)
  monthly_token_allowance INT NOT NULL,
  description   VARCHAR(255) NULL,
  is_popular    TINYINT(1)   NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order    INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 1c. THUÊ BAO ĐÃ MUA — lịch sử, dùng để đối soát và gia hạn
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  plan_id       INT UNSIGNED    NULL,
  -- Snapshot thông tin gói lúc mua, để đổi bảng giá không làm sai lịch sử
  plan_code     VARCHAR(50)     NULL,
  plan_name     VARCHAR(120)    NOT NULL,
  months        INT             NOT NULL,
  price_vnd     BIGINT          NOT NULL,
  monthly_token_allowance INT   NOT NULL,
  status        ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
  order_id      BIGINT UNSIGNED NULL,
  started_at    DATETIME        NOT NULL,
  expires_at    DATETIME        NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_subs_user (user_id, created_at),
  KEY idx_subs_status (status, expires_at),
  CONSTRAINT fk_subs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. GÓI TOKEN LẺ  (mua thêm khi đã dùng hết hạn mức tháng)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_packages (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(50)  NOT NULL,          -- vd: STARTER, CREATOR
  name          VARCHAR(120) NOT NULL,          -- vd: Trải nghiệm
  price_vnd     BIGINT       NOT NULL,          -- giá nạp
  base_tokens   INT          NOT NULL,          -- token cơ bản (giá nạp / 100)
  bonus_tokens  INT          NOT NULL DEFAULT 0,-- token thưởng thêm
  description   VARCHAR(255) NULL,
  is_popular    TINYINT(1)   NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order    INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_packages_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. BẢNG GIÁ MODEL  (ảnh 1 = giá vốn, ảnh 2 = số token thu của khách)
--    Thêm nhà cung cấp / model mới trong tương lai = thêm 1 dòng ở đây.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_pricing (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(80)  NOT NULL,   -- khoá nội bộ, vd: nano-banana-pro-4k
  provider       VARCHAR(50)  NOT NULL DEFAULT 'kie',   -- adapter xử lý, vd: kie
  provider_model VARCHAR(120) NOT NULL,   -- slug gửi lên API bên thứ 3, vd: nano-banana-pro
  label          VARCHAR(120) NOT NULL,   -- tên hiển thị cho khách
  family         VARCHAR(80)  NOT NULL,   -- nhóm model, vd: nano-banana-pro
  resolution     VARCHAR(16)  NOT NULL,   -- 1K / 2K / 4K
  api_cost_usd   DECIMAL(10,4) NOT NULL,  -- giá vốn/ảnh theo bảng giá nhà cung cấp
  token_cost     INT          NOT NULL,   -- số token trừ của khách mỗi ảnh
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order     INT          NOT NULL DEFAULT 0,
  notes          VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pricing_code (code),
  KEY idx_pricing_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. ĐƠN NẠP TIỀN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(32)     NOT NULL,   -- mã ghi trong nội dung chuyển khoản, vd: NAP7K3Q2M
  user_id         BIGINT UNSIGNED NOT NULL,
  -- subscription = mua/gia hạn gói tháng | token_package = mua thêm token lẻ
  order_type      ENUM('subscription','token_package') NOT NULL DEFAULT 'token_package',
  plan_id         INT UNSIGNED    NULL,
  subscription_months INT         NULL,
  package_id      INT UNSIGNED    NULL,
  -- Snapshot thông tin gói tại thời điểm đặt, để đổi bảng giá không làm sai lịch sử.
  package_code    VARCHAR(50)     NULL,
  package_name    VARCHAR(120)    NOT NULL,
  amount_vnd      BIGINT          NOT NULL,   -- số tiền khách thực trả
  -- Nâng gói: số tiền được khấu trừ từ phần chưa dùng của gói cũ.
  -- Giá niêm yết của gói mới = amount_vnd + credit_vnd.
  credit_vnd      BIGINT          NOT NULL DEFAULT 0,
  is_upgrade      TINYINT(1)      NOT NULL DEFAULT 0,
  base_tokens     INT             NOT NULL,
  bonus_tokens    INT             NOT NULL DEFAULT 0,
  total_tokens    INT             NOT NULL,
  status          ENUM('pending','paid','cancelled','expired') NOT NULL DEFAULT 'pending',
  payment_method  VARCHAR(40)     NOT NULL DEFAULT 'bank_transfer',
  -- Nguồn xác nhận: sepay / casso / manual
  paid_source     VARCHAR(40)     NULL,
  payment_ref     VARCHAR(190)    NULL,       -- mã giao dịch ngân hàng
  paid_amount_vnd BIGINT          NULL,       -- số tiền thực nhận
  paid_at         DATETIME        NULL,
  -- Thời điểm đã GIAO HÀNG (cộng token / kích hoạt gói). Tách khỏi `status` để hệ
  -- thống ngoài chỉ cần đổi status = 'paid', server tự phát hiện và xử lý phần còn
  -- lại. NULL + status='paid' = đơn đang chờ giao hàng.
  fulfilled_at    DATETIME        NULL,
  approved_by     BIGINT UNSIGNED NULL,       -- admin duyệt tay
  note            VARCHAR(500)    NULL,
  expires_at      DATETIME        NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_code (code),
  KEY idx_orders_user (user_id, created_at),
  KEY idx_orders_status (status, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. SỔ CÁI TOKEN — mọi biến động số dư đều phải có 1 dòng ở đây
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_transactions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  -- topup: mua token lẻ | spend: tạo ảnh | refund: hoàn khi lỗi | adjust: admin sửa tay
  -- grant: cấp hạn mức đầu chu kỳ tháng | expire: xoá hạn mức thừa khi sang tháng mới
  type          ENUM('topup','spend','refund','adjust','grant','expire') NOT NULL,
  -- monthly: hạn mức tháng (reset, không cộng dồn) | purchased: token mua thêm (không hết hạn)
  bucket        ENUM('monthly','purchased') NOT NULL DEFAULT 'purchased',
  amount        INT             NOT NULL,   -- dương = cộng, âm = trừ
  balance_after INT             NOT NULL,   -- số dư của đúng nguồn ở cột bucket
  ref_type      VARCHAR(40)     NULL,       -- 'order' | 'generation' | NULL
  ref_id        BIGINT UNSIGNED NULL,
  description   VARCHAR(255)    NULL,
  created_by    BIGINT UNSIGNED NULL,       -- admin thực hiện (nếu là adjust)
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tx_user (user_id, created_at),
  KEY idx_tx_type (type, created_at),
  KEY idx_tx_ref (ref_type, ref_id),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. LỆNH TẠO ẢNH
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generations (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  batch_id         VARCHAR(40)     NULL,     -- gom nhiều ảnh của cùng 1 lần bấm nút
  model_code       VARCHAR(80)     NOT NULL,
  model_label      VARCHAR(120)    NOT NULL,
  provider         VARCHAR(50)     NOT NULL,
  provider_model   VARCHAR(120)    NOT NULL,
  resolution       VARCHAR(16)     NOT NULL,
  aspect_ratio     VARCHAR(16)     NOT NULL,
  prompt           TEXT            NULL,
  -- Ảnh đầu vào đã lưu trên server: {"reference": "...", "products": ["..."]}
  input_images     JSON            NULL,
  token_cost       INT             NOT NULL, -- token đã trừ của khách
  -- Tách rõ token lấy từ nguồn nào, để khi lỗi thì hoàn về đúng nguồn đó
  monthly_cost     INT             NOT NULL DEFAULT 0, -- lấy từ hạn mức tháng
  purchased_cost   INT             NOT NULL DEFAULT 0, -- lấy từ token mua thêm
  api_cost_usd     DECIMAL(10,4)   NOT NULL, -- giá vốn ước tính
  status           ENUM('queued','processing','success','failed','refunded') NOT NULL DEFAULT 'queued',
  provider_task_id VARCHAR(190)    NULL,
  result_url       VARCHAR(1000)   NULL,     -- link gốc từ nhà cung cấp
  result_path      VARCHAR(500)    NULL,     -- đường dẫn file đã tải về server
  error_message    VARCHAR(1000)   NULL,
  duration_ms      INT             NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at     DATETIME        NULL,
  PRIMARY KEY (id),
  KEY idx_gen_user (user_id, created_at),
  KEY idx_gen_status (status, created_at),
  KEY idx_gen_batch (batch_id),
  KEY idx_gen_model (model_code, created_at),
  CONSTRAINT fk_gen_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. NHẬT KÝ WEBHOOK NGÂN HÀNG — chống cộng token trùng
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_events (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider       VARCHAR(40)     NOT NULL,   -- sepay | casso
  external_id    VARCHAR(190)    NOT NULL,   -- id giao dịch phía cổng, dùng để chống trùng
  order_code     VARCHAR(32)     NULL,
  order_id       BIGINT UNSIGNED NULL,
  amount_vnd     BIGINT          NULL,
  content        VARCHAR(500)    NULL,
  status         ENUM('matched','unmatched','duplicate','error') NOT NULL DEFAULT 'unmatched',
  message        VARCHAR(500)    NULL,
  raw_payload    JSON            NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_event_provider_external (provider, external_id),
  KEY idx_event_order (order_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. CẤU HÌNH CHẠY ĐỘNG (admin sửa được không cần restart)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  setting_key   VARCHAR(100) NOT NULL,
  setting_value TEXT         NULL,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
