import { execute, query, queryOne, type RowDataPacket } from './db.js';
import { env } from './env.js';
import { hashPassword } from './lib/auth.js';

/**
 * Dữ liệu khởi tạo.
 *
 * `api_cost_usd`  = giá vốn mỗi ảnh theo bảng giá Kie.ai.
 * `token_cost`    = số token trừ của khách, theo bảng định giá đã chốt.
 *
 * Quy đổi: 1 token ≈ 100đ khi mua gói nhỏ nhất.
 *
 *   Model                    Giá vốn   Token thu   Giá bán danh nghĩa
 *   GPT Image 2 – 1K         $0.03     30          3.000đ
 *   GPT Image 2 – 2K         $0.05     45          4.500đ
 *   GPT Image 2 – 4K         $0.08     70          7.000đ
 *   Nano Banana 2 – 1K       $0.04     40          4.000đ
 *   Nano Banana 2 – 2K       $0.06     55          5.500đ
 *   Nano Banana 2 – 4K       $0.09     80          8.000đ
 *   Nano Banana Pro – 1K/2K  $0.09     80          8.000đ
 *   Nano Banana Pro – 4K     $0.12     105         10.500đ
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
    token_cost: 80,
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
    token_cost: 80,
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
    token_cost: 105,
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
    token_cost: 40,
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
    token_cost: 55,
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
    token_cost: 80,
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
    token_cost: 30,
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
    token_cost: 45,
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
    token_cost: 70,
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
    token_cost: 25,
    sort_order: 40,
    is_active: 0,
    notes: 'CHƯA BÁN: cần điền giá vốn và số token thật từ bảng giá Kie.ai trước khi bật. Model này không có tuỳ chọn 2K/4K.',
  },
] as const;

/** Gói nạp tiền — base_tokens = giá nạp / 100, phần còn lại là token thưởng. */
const TOKEN_PACKAGES = [
  {
    code: 'STARTER',
    name: 'Trải nghiệm',
    price_vnd: 49_000,
    base_tokens: 490,
    bonus_tokens: 0,
    description: 'Đủ tạo khoảng 12 ảnh 1K để dùng thử.',
    is_popular: 0,
    sort_order: 10,
  },
  {
    code: 'CREATOR',
    name: 'Creator',
    price_vnd: 99_000,
    base_tokens: 990,
    bonus_tokens: 30,
    description: 'Tặng thêm 3% token.',
    is_popular: 0,
    sort_order: 20,
  },
  {
    code: 'CREATOR_PLUS',
    name: 'Creator Plus',
    price_vnd: 199_000,
    base_tokens: 1_990,
    bonus_tokens: 110,
    description: 'Tặng thêm 5,5% token.',
    is_popular: 1,
    sort_order: 30,
  },
  {
    code: 'STUDIO',
    name: 'Studio',
    price_vnd: 499_000,
    base_tokens: 4_990,
    bonus_tokens: 510,
    description: 'Tặng thêm 10,2% token.',
    is_popular: 0,
    sort_order: 40,
  },
  {
    code: 'AGENCY',
    name: 'Agency',
    price_vnd: 999_000,
    base_tokens: 9_990,
    bonus_tokens: 1_510,
    description: 'Tặng thêm 15,1% token — tối ưu nhất cho agency chạy số lượng lớn.',
    is_popular: 0,
    sort_order: 50,
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

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await execute('INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, value]);
  }

  await syncAdminRoles();
  await bootstrapAdminAccount();
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
