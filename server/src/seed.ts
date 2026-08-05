import { execute, query, queryOne, type RowDataPacket } from './db.js';
import { env } from './env.js';
import { hashPassword } from './lib/auth.js';

/**
 * Dữ liệu khởi tạo.
 *
 * `api_cost_usd`  = giá vốn mỗi ảnh theo bảng giá Kie.ai.
 * `token_cost`    = số token trừ của khách mỗi ảnh.
 *
 * QUY ƯỚC ĐƠN VỊ: **1 token = 1đ giá vốn nhà cung cấp**, nên
 *
 *     token_cost = api_cost_usd × USD_TO_VND
 *
 * Nhờ vậy hạn mức "500.000đ tiền token theo giá gốc" quy thẳng thành 500.000 token,
 * và gói lẻ bán gấp đôi giá vốn chỉ đơn giản là 2đ cho mỗi token.
 *
 *   Model                    Giá vốn   Token/ảnh   Số ảnh trong hạn mức 1 tháng
 *   GPT Image 2 – 1K         $0.03       840        ~595
 *   GPT Image 2 – 2K         $0.05     1.400        ~357
 *   GPT Image 2 – 4K         $0.08     2.240        ~223
 *   Nano Banana 2 – 1K       $0.04     1.120        ~446
 *   Nano Banana 2 – 2K       $0.06     1.680        ~297
 *   Nano Banana 2 – 4K       $0.09     2.520        ~198
 *   Nano Banana Pro – 1K/2K  $0.09     2.520        ~198
 *   Nano Banana Pro – 4K     $0.12     3.360        ~148
 *
 * Các số trên tính theo USD_TO_VND = 28.000. Đổi tỉ giá trong .env thì phải cập
 * nhật lại token_cost trong trang Quản trị → Bảng giá cho khớp.
 *
 * `provider_model` là slug gửi lên API bên thứ 3, lấy theo tài liệu chính thức
 * (https://docs.kie.ai/llms.txt). Mỗi slug phải có đặc tả tham số tương ứng trong
 * `providers/kie.ts` vì các model dùng tên trường ảnh khác nhau
 * (`image_input` / `image_urls` / `input_urls`).
 */
const MODEL_PRICING = [
  {
    code: 'nano-banana-pro-1k',
    provider: 'kie',
    provider_model: 'nano-banana-pro',
    label: 'Nano Banana Pro — 1K',
    family: 'nano-banana-pro',
    resolution: '1K',
    api_cost_usd: 0.09,
    token_cost: 2520,
    sort_order: 10,
    notes: 'Chất lượng cao nhất, bám sát ảnh mẫu tốt nhất.',
  },
  {
    code: 'nano-banana-pro-2k',
    provider: 'kie',
    provider_model: 'nano-banana-pro',
    label: 'Nano Banana Pro — 2K',
    family: 'nano-banana-pro',
    resolution: '2K',
    api_cost_usd: 0.09,
    token_cost: 2520,
    sort_order: 11,
    notes: 'Cùng giá với bản 1K, nên ưu tiên dùng 2K.',
  },
  {
    code: 'nano-banana-pro-4k',
    provider: 'kie',
    provider_model: 'nano-banana-pro',
    label: 'Nano Banana Pro — 4K',
    family: 'nano-banana-pro',
    resolution: '4K',
    api_cost_usd: 0.12,
    token_cost: 3360,
    sort_order: 12,
    notes: 'Độ phân giải cao nhất, dùng cho ảnh in ấn.',
  },
  {
    code: 'nano-banana-2-1k',
    provider: 'kie',
    provider_model: 'nano-banana-2',
    label: 'Nano Banana 2 — 1K',
    family: 'nano-banana-2',
    resolution: '1K',
    api_cost_usd: 0.04,
    token_cost: 1120,
    sort_order: 20,
    notes: null,
  },
  {
    code: 'nano-banana-2-2k',
    provider: 'kie',
    provider_model: 'nano-banana-2',
    label: 'Nano Banana 2 — 2K',
    family: 'nano-banana-2',
    resolution: '2K',
    api_cost_usd: 0.06,
    token_cost: 1680,
    sort_order: 21,
    notes: null,
  },
  {
    code: 'nano-banana-2-4k',
    provider: 'kie',
    provider_model: 'nano-banana-2',
    label: 'Nano Banana 2 — 4K',
    family: 'nano-banana-2',
    resolution: '4K',
    api_cost_usd: 0.09,
    token_cost: 2520,
    sort_order: 22,
    notes: null,
  },
  {
    code: 'gpt-image-2-1k',
    provider: 'kie',
    provider_model: 'gpt-image-2-image-to-image',
    label: 'GPT Image 2 — 1K',
    family: 'gpt-image-2',
    resolution: '1K',
    api_cost_usd: 0.03,
    token_cost: 840,
    sort_order: 30,
    notes: 'Rẻ nhất, hợp để thử bố cục trước khi chạy bản đẹp.',
  },
  {
    code: 'gpt-image-2-2k',
    provider: 'kie',
    provider_model: 'gpt-image-2-image-to-image',
    label: 'GPT Image 2 — 2K',
    family: 'gpt-image-2',
    resolution: '2K',
    api_cost_usd: 0.05,
    token_cost: 1400,
    sort_order: 31,
    notes: null,
  },
  {
    code: 'gpt-image-2-4k',
    provider: 'kie',
    provider_model: 'gpt-image-2-image-to-image',
    label: 'GPT Image 2 — 4K',
    family: 'gpt-image-2',
    resolution: '4K',
    api_cost_usd: 0.08,
    token_cost: 2240,
    sort_order: 32,
    notes: null,
  },
  {
    // Kie.ai không công bố giá của bản Lite ở tài liệu công khai, nên model này
    // được tạo sẵn nhưng TẮT BÁN. Điền giá vốn và số token thật rồi mới bật.
    code: 'nano-banana-2-lite',
    provider: 'kie',
    provider_model: 'nano-banana-2-lite',
    label: 'Nano Banana 2 Lite',
    family: 'nano-banana-2-lite',
    resolution: '1K',
    api_cost_usd: 0,
    token_cost: 700,
    sort_order: 40,
    is_active: 0,
    notes: 'CHƯA BÁN: cần điền giá vốn và số token thật từ bảng giá Kie.ai trước khi bật. Model này không có tuỳ chọn 2K/4K.',
  },
] as const;

/**
 * GÓI THUÊ BAO THÁNG — khách bắt buộc mua trước khi tạo ảnh.
 *
 * Giá gốc 1.500.000đ/tháng, đã bao gồm chi phí duy trì, nhân sự và hạn mức
 * 500.000 token/tháng (tương đương 500.000đ tiền token theo giá vốn nhà cung cấp).
 * Chu kỳ dài hơn được chiết khấu để khuyến khích trả trước.
 *
 *   Chu kỳ    Giá niêm yết   Thực trả       Quy ra mỗi tháng   Chiết khấu
 *   1 tháng   1.500.000đ     1.500.000đ     1.500.000đ         0%
 *   3 tháng   4.500.000đ     4.275.000đ     1.425.000đ         5%
 *   6 tháng   9.000.000đ     8.100.000đ     1.350.000đ         10%
 *   12 tháng  18.000.000đ    15.300.000đ    1.275.000đ         15%
 *
 * Hạn mức 500.000 token được cấp lại MỖI THÁNG kể cả khi mua chu kỳ dài, và
 * KHÔNG cộng dồn nếu tháng đó dùng không hết.
 */
const MONTHLY_TOKEN_ALLOWANCE = 500_000;

const SUBSCRIPTION_PLANS = [
  {
    code: 'MONTHLY_1',
    name: 'Gói 1 tháng',
    months: 1,
    price_vnd: 1_500_000,
    description: 'Dùng thử trọn vẹn một tháng.',
    is_popular: 0,
    sort_order: 10,
  },
  {
    code: 'MONTHLY_3',
    name: 'Gói 3 tháng',
    months: 3,
    price_vnd: 4_275_000,
    description: 'Tiết kiệm 5% — còn 1.425.000đ/tháng.',
    is_popular: 0,
    sort_order: 20,
  },
  {
    code: 'MONTHLY_6',
    name: 'Gói 6 tháng',
    months: 6,
    price_vnd: 8_100_000,
    description: 'Tiết kiệm 10% — còn 1.350.000đ/tháng.',
    is_popular: 1,
    sort_order: 30,
  },
  {
    code: 'MONTHLY_12',
    name: 'Gói 1 năm',
    months: 12,
    price_vnd: 15_300_000,
    description: 'Tiết kiệm 15% — còn 1.275.000đ/tháng. Ưu đãi tốt nhất.',
    is_popular: 0,
    sort_order: 40,
  },
] as const;

/**
 * GÓI TOKEN LẺ — mua thêm khi đã dùng hết hạn mức tháng.
 *
 * Quy ước: 1 token = 1đ giá vốn nhà cung cấp. Gói lẻ bán đúng **gấp đôi giá vốn**,
 * nên số token nhận được luôn bằng nửa số tiền nạp. Token mua thêm KHÔNG hết hạn
 * theo chu kỳ tháng.
 */
const TOKEN_SELL_MULTIPLIER = 2;

const TOKEN_PACKAGES = [
  {
    code: 'EXTRA_200K',
    name: 'Gói 200.000đ',
    price_vnd: 200_000,
    base_tokens: 200_000 / TOKEN_SELL_MULTIPLIER,
    bonus_tokens: 0,
    description: 'Tương đương 40% hạn mức của một tháng.',
    is_popular: 0,
    sort_order: 10,
  },
  {
    code: 'EXTRA_500K',
    name: 'Gói 500.000đ',
    price_vnd: 500_000,
    base_tokens: 500_000 / TOKEN_SELL_MULTIPLIER,
    bonus_tokens: 0,
    description: 'Tương đương 50% hạn mức của một tháng.',
    is_popular: 1,
    sort_order: 20,
  },
  {
    code: 'EXTRA_1M',
    name: 'Gói 1.000.000đ',
    price_vnd: 1_000_000,
    base_tokens: 1_000_000 / TOKEN_SELL_MULTIPLIER,
    bonus_tokens: 0,
    description: 'Bằng đúng hạn mức của một tháng.',
    is_popular: 0,
    sort_order: 30,
  },
  {
    code: 'EXTRA_2M',
    name: 'Gói 2.000.000đ',
    price_vnd: 2_000_000,
    base_tokens: 2_000_000 / TOKEN_SELL_MULTIPLIER,
    bonus_tokens: 0,
    description: 'Gấp đôi hạn mức tháng, hợp cho đợt chạy chiến dịch lớn.',
    is_popular: 0,
    sort_order: 40,
  },
] as const;

const DEFAULT_SETTINGS: Record<string, string> = {
  site_name: 'Design Copycat AI',
  topup_note: 'Chuyển khoản đúng số tiền và ghi đúng nội dung để hệ thống cộng token tự động.',
  free_tokens_on_signup: '0',
};

/**
 * Nạp dữ liệu mặc định. Dùng INSERT IGNORE nên chạy lại nhiều lần không ghi đè
 * những gì admin đã chỉnh trong bảng điều khiển.
 */
export async function seed(): Promise<void> {
  await repairKnownBadModelSlugs();
  await migratePricingToCostUnits();

  for (const model of MODEL_PRICING) {
    await execute(
      `INSERT IGNORE INTO model_pricing
         (code, provider, provider_model, label, family, resolution, api_cost_usd, token_cost, sort_order, is_active, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        model.code,
        model.provider,
        model.provider_model,
        model.label,
        model.family,
        model.resolution,
        model.api_cost_usd,
        model.token_cost,
        model.sort_order,
        'is_active' in model ? model.is_active : 1,
        model.notes ?? null,
      ],
    );
  }

  for (const pkg of TOKEN_PACKAGES) {
    await execute(
      `INSERT IGNORE INTO token_packages
         (code, name, price_vnd, base_tokens, bonus_tokens, description, is_popular, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pkg.code,
        pkg.name,
        pkg.price_vnd,
        pkg.base_tokens,
        pkg.bonus_tokens,
        pkg.description,
        pkg.is_popular,
        pkg.sort_order,
      ],
    );
  }

  for (const plan of SUBSCRIPTION_PLANS) {
    await execute(
      `INSERT IGNORE INTO subscription_plans
         (code, name, months, price_vnd, monthly_token_allowance, description, is_popular, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plan.code,
        plan.name,
        plan.months,
        plan.price_vnd,
        MONTHLY_TOKEN_ALLOWANCE,
        plan.description,
        plan.is_popular,
        plan.sort_order,
      ],
    );
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await execute('INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, value]);
  }

  await syncAdminRoles();
  await bootstrapAdminAccount();
}

/**
 * Chuyển dữ liệu cũ sang đơn vị token mới (1 token = 1đ giá vốn).
 *
 * Trước đây 1 token ≈ 100đ giá bán, giờ neo vào giá vốn nên mọi con số lệch nhau
 * khoảng 28 lần. Chỉ sửa những dòng vẫn giữ đúng giá trị seed cũ — dòng nào admin
 * đã tự chỉnh thì để nguyên, tránh ghi đè quyết định của người vận hành.
 */
async function migratePricingToCostUnits(): Promise<void> {
  const modelFixes: { code: string; oldCost: number; newCost: number }[] = [
    { code: 'nano-banana-pro-1k', oldCost: 80, newCost: 2520 },
    { code: 'nano-banana-pro-2k', oldCost: 80, newCost: 2520 },
    { code: 'nano-banana-pro-4k', oldCost: 105, newCost: 3360 },
    { code: 'nano-banana-2-1k', oldCost: 40, newCost: 1120 },
    { code: 'nano-banana-2-2k', oldCost: 55, newCost: 1680 },
    { code: 'nano-banana-2-4k', oldCost: 80, newCost: 2520 },
    { code: 'gpt-image-2-1k', oldCost: 30, newCost: 840 },
    { code: 'gpt-image-2-2k', oldCost: 45, newCost: 1400 },
    { code: 'gpt-image-2-4k', oldCost: 70, newCost: 2240 },
    { code: 'nano-banana-2-lite', oldCost: 25, newCost: 700 },
  ];

  let converted = 0;
  for (const fix of modelFixes) {
    const result = await execute('UPDATE model_pricing SET token_cost = ? WHERE code = ? AND token_cost = ?', [
      fix.newCost,
      fix.code,
      fix.oldCost,
    ]);
    converted += result.affectedRows;
  }
  if (converted > 0) {
    console.log(`[seed] Đã quy đổi ${converted} dòng bảng giá sang đơn vị token mới (1 token = 1đ giá vốn).`);
  }

  // Gói token lẻ đời cũ tính theo 100đ/token — sai đơn vị hoàn toàn, ngừng bán.
  const retired = await execute(
    `UPDATE token_packages SET is_active = 0
      WHERE code IN ('STARTER','CREATOR','CREATOR_PLUS','STUDIO','AGENCY') AND is_active = 1`,
  );
  if (retired.affectedRows > 0) {
    console.log(`[seed] Đã ngừng bán ${retired.affectedRows} gói token đời cũ (sai đơn vị token).`);
  }
}

/**
 * Sửa các slug model đã bị ghi sai vào DB ở những lần chạy trước.
 *
 * `INSERT IGNORE` không cập nhật dòng đã tồn tại, nên chỉ sửa trong `MODEL_PRICING`
 * là không đủ. Hàm này chỉ đụng tới đúng giá trị sai đã biết — slug nào admin tự
 * đặt khác đi sẽ được giữ nguyên.
 */
async function repairKnownBadModelSlugs(): Promise<void> {
  const fixes: { wrong: string; correct: string }[] = [
    // Kie.ai không có model tên 'gpt-image-2'; bản image-to-image có slug đầy đủ.
    { wrong: 'gpt-image-2', correct: 'gpt-image-2-image-to-image' },
  ];

  for (const fix of fixes) {
    const result = await execute(
      `UPDATE model_pricing SET provider_model = ? WHERE provider = 'kie' AND provider_model = ?`,
      [fix.correct, fix.wrong],
    );
    if (result.affectedRows > 0) {
      console.log(`[seed] Đã sửa slug model "${fix.wrong}" → "${fix.correct}" (${result.affectedRows} dòng).`);
    }
  }
}

/**
 * Đồng bộ quyền admin theo ADMIN_EMAILS trong .env.
 * Chạy mỗi lần khởi động: thêm email vào .env rồi restart là tài khoản đó lên admin,
 * bỏ ra khỏi .env thì bị hạ xuống user.
 */
export async function syncAdminRoles(): Promise<void> {
  if (env.adminEmails.length > 0) {
    const placeholders = env.adminEmails.map(() => '?').join(',');
    await execute(
      `UPDATE users SET role = 'admin' WHERE LOWER(email) IN (${placeholders}) AND role <> 'admin'`,
      [...env.adminEmails],
    );
    await execute(
      `UPDATE users SET role = 'user' WHERE role = 'admin' AND LOWER(email) NOT IN (${placeholders})`,
      [...env.adminEmails],
    );
  } else {
    await execute(`UPDATE users SET role = 'user' WHERE role = 'admin'`);
  }

  const admins = await query<RowDataPacket & { email: string }>(
    `SELECT email FROM users WHERE role = 'admin' ORDER BY email`,
  );
  if (admins.length > 0) {
    console.log(`[seed] Tài khoản admin hiện tại: ${admins.map((a) => a.email).join(', ')}`);
  }
}

/** Tạo sẵn tài khoản admin nếu .env có khai báo ADMIN_BOOTSTRAP_*. */
async function bootstrapAdminAccount(): Promise<void> {
  const { email, password } = env.adminBootstrap;
  if (!email || !password) return;

  const existing = await queryOne<RowDataPacket & { id: number }>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return;

  const role = env.adminEmails.includes(email) ? 'admin' : 'user';
  await execute('INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)', [
    email,
    await hashPassword(password),
    'Quản trị viên',
    role,
  ]);
  console.log(`[seed] Đã tạo tài khoản ${role}: ${email}`);

  if (role !== 'admin') {
    console.warn(`[seed] ${email} chưa có trong ADMIN_EMAILS nên chỉ là tài khoản thường.`);
  }
}
