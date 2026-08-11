import { execute, query, queryOne, type RowDataPacket } from './db.js';
import { env } from './env.js';
import { hashPassword } from './lib/auth.js';

/**
 * Dữ liệu khởi tạo.
 *
 * `api_cost_usd`  = giá vốn mỗi ảnh theo bảng giá Kie.ai.
 * `token_cost`    = số điểm trừ của khách mỗi ảnh.
 *
 * QUY ƯỚC ĐƠN VỊ: **1 điểm = 1đ giá vốn nhà cung cấp**, nên
 *
 *     token_cost = api_cost_usd × USD_TO_VND
 *
 * Nhờ vậy hạn mức "500.000đ tiền điểm theo giá gốc" quy thẳng thành 500.000 điểm,
 * và gói lẻ bán gấp đôi giá vốn chỉ đơn giản là 2đ cho mỗi điểm.
 *
 *   Model                    Giá vốn   Điểm/ảnh   Số ảnh trong hạn mức 1 tháng
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
    // được tạo sẵn nhưng TẮT BÁN. Điền giá vốn và số điểm thật rồi mới bật.
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
    notes: 'CHƯA BÁN: cần điền giá vốn và số điểm thật từ bảng giá Kie.ai trước khi bật. Model này không có tuỳ chọn 2K/4K.',
  },
] as const;

/**
 * GÓI THUÊ BAO THÁNG — ĐÃ NGỪNG BÁN.
 *
 * Sản phẩm nay chỉ bán điểm (xem `TOKEN_PACKAGES`): mua điểm là dùng được ngay.
 * Toàn bộ gói ở đây để `is_active = 0` nên không xuất hiện ở bất kỳ đâu trên
 * giao diện khách — chúng chỉ còn để admin cấp tay cho khách VIP trong Quản trị
 * → Khách hàng → nút "Gói", và để những gói đã bán trước đây chạy hết hạn.
 *
 * Giữ nguyên giá cũ trong danh sách này là có chủ đích: đó là giá của các bản
 * ghi `subscriptions` đang tồn tại, sửa đi thì báo cáo doanh thu cũ lệch.
 */
const MONTHLY_TOKEN_ALLOWANCE = 500_000;

const SUBSCRIPTION_PLANS = [
  {
    code: 'FREE',
    name: 'Gói miễn phí',
    months: 12,
    price_vnd: 0,
    monthly_token_allowance: 0,
    description: 'Không được tặng điểm hàng tháng — khách nạp điểm lẻ để dùng.',
    is_popular: 0,
    is_active: 0,
    sort_order: 0,
  },
  {
    code: 'MONTHLY_1',
    name: 'Gói 1 tháng',
    months: 1,
    price_vnd: 1_500_000,
    description: 'Đã ngừng bán — chỉ admin cấp tay.',
    is_popular: 0,
    is_active: 0,
    sort_order: 10,
  },
  {
    code: 'MONTHLY_3',
    name: 'Gói 3 tháng',
    months: 3,
    price_vnd: 4_275_000,
    description: 'Đã ngừng bán — chỉ admin cấp tay.',
    is_popular: 0,
    is_active: 0,
    sort_order: 20,
  },
  {
    code: 'MONTHLY_6',
    name: 'Gói 6 tháng',
    months: 6,
    price_vnd: 8_100_000,
    description: 'Đã ngừng bán — chỉ admin cấp tay.',
    is_popular: 0,
    is_active: 0,
    sort_order: 30,
  },
  {
    code: 'MONTHLY_12',
    name: 'Gói 1 năm',
    months: 12,
    price_vnd: 15_300_000,
    description: 'Đã ngừng bán — chỉ admin cấp tay.',
    is_popular: 0,
    is_active: 0,
    sort_order: 40,
  },
] as const;

/**
 * GÓI ĐIỂM — sản phẩm duy nhất đang bán.
 *
 * Quy tắc: khách nhận được **một nửa** lượng điểm so với số tiền bỏ ra tính theo
 * giá vốn (tức bán gấp đôi giá vốn). Vì 1 điểm = 1đ giá vốn, gói X đồng cho
 * khoảng X/2 điểm. Giá bán làm tròn xuống mốc x99.000đ:
 *
 *   Gói          Điểm nhận     Đơn giá
 *   99.000đ      50.000        1,98đ/điểm
 *   199.000đ     100.000       1,99đ/điểm
 *   499.000đ     250.000       2,00đ/điểm
 *   999.000đ     500.000       2,00đ/điểm
 *   1.999.000đ   1.000.000     2,00đ/điểm
 *
 * Điểm KHÔNG hết hạn — mua bao nhiêu dùng dần bấy nhiêu.
 */
const TOKEN_PACKAGES = [
  {
    code: 'EXTRA_99',
    name: 'Gói 99.000đ',
    price_vnd: 99_000,
    base_tokens: MONTHLY_TOKEN_ALLOWANCE / 10,
    bonus_tokens: 0,
    description: 'Mua nhanh để dùng thử.',
    is_popular: 0,
    sort_order: 5,
  },
  {
    code: 'EXTRA_199',
    name: 'Gói 199.000đ',
    price_vnd: 199_000,
    base_tokens: MONTHLY_TOKEN_ALLOWANCE / 5,
    bonus_tokens: 0,
    description: 'Hợp cho nhu cầu vài chục ảnh mỗi tháng.',
    is_popular: 0,
    sort_order: 10,
  },
  {
    code: 'EXTRA_499',
    name: 'Gói 499.000đ',
    price_vnd: 499_000,
    base_tokens: MONTHLY_TOKEN_ALLOWANCE / 2,
    bonus_tokens: 0,
    description: 'Lựa chọn phổ biến nhất cho shop bán hàng.',
    is_popular: 1,
    sort_order: 20,
  },
  {
    code: 'EXTRA_999',
    name: 'Gói 999.000đ',
    price_vnd: 999_000,
    base_tokens: MONTHLY_TOKEN_ALLOWANCE,
    bonus_tokens: 0,
    description: 'Đủ dùng cho cả một chiến dịch.',
    is_popular: 0,
    sort_order: 30,
  },
  {
    code: 'EXTRA_1999',
    name: 'Gói 1.999.000đ',
    price_vnd: 1_999_000,
    base_tokens: MONTHLY_TOKEN_ALLOWANCE * 2,
    bonus_tokens: 0,
    description: 'Cho đội chạy nội dung số lượng lớn.',
    is_popular: 0,
    sort_order: 40,
  },
] as const;

const DEFAULT_SETTINGS: Record<string, string> = {
  site_name: 'Design Copycat AI',
  topup_note: 'Chuyển khoản đúng số tiền và ghi đúng nội dung để hệ thống cộng điểm tự động.',
  free_tokens_on_signup: '0',
};

/**
 * Nạp dữ liệu mặc định. Dùng INSERT IGNORE nên chạy lại nhiều lần không ghi đè
 * những gì admin đã chỉnh trong bảng điều khiển.
 */
export async function seed(): Promise<void> {
  await repairKnownBadModelSlugs();
  await migratePricingToCostUnits();
  await retireSubscriptionPlans();
  await refreshStalePackageDescriptions();

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
         (code, name, months, price_vnd, monthly_token_allowance, description, is_popular, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plan.code,
        plan.name,
        plan.months,
        plan.price_vnd,
        'monthly_token_allowance' in plan ? plan.monthly_token_allowance : MONTHLY_TOKEN_ALLOWANCE,
        plan.description,
        plan.is_popular,
        'is_active' in plan ? plan.is_active : 1,
        plan.sort_order,
      ],
    );
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await execute('INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, value]);
  }

  await syncAdminRoles();
  await bootstrapAdminAccount();
  await warnUnpricedModels();
}

/**
 * Ngừng bán toàn bộ gói thuê bao tháng. CHẠY ĐÚNG MỘT LẦN.
 *
 * `INSERT IGNORE` ở trên không đụng tới dòng đã tồn tại, nên với database đang
 * chạy thật thì các gói MONTHLY_* vẫn giữ `is_active = 1` từ đời trước. Không có
 * câu này thì chúng biến mất khỏi giao diện khách (do catalog không trả về plans
 * nữa) nhưng vẫn hiện "Đang bán" trong Quản trị → Bảng giá, đọc rất khó hiểu.
 *
 * Cột mốc lưu trong bảng `settings` chứ không chạy lại mỗi lần khởi động: admin
 * vẫn có quyền bật lại một gói trong trang Quản trị, chạy lại vô điều kiện thì
 * lần restart sau lại âm thầm tắt đi.
 *
 * Chỉ tắt cờ bán, KHÔNG xoá dòng: các bản ghi `subscriptions` đã bán tham chiếu
 * tới chúng, và trang Quản trị vẫn cần danh sách này để cấp gói tay cho khách VIP.
 */
const SUBSCRIPTION_RETIRED_KEY = 'subscription_plans_retired_at';

async function retireSubscriptionPlans(): Promise<void> {
  const done = await queryOne<RowDataPacket & { setting_value: string | null }>(
    'SELECT setting_value FROM settings WHERE setting_key = ?',
    [SUBSCRIPTION_RETIRED_KEY],
  );
  if (done) return;

  const result = await execute('UPDATE subscription_plans SET is_active = 0 WHERE is_active = 1');
  await execute('INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, NOW())', [
    SUBSCRIPTION_RETIRED_KEY,
  ]);

  if (result.affectedRows > 0) {
    console.log(`[seed] Đã ngừng bán ${result.affectedRows} gói thuê bao tháng — hệ thống nay chỉ bán điểm.`);
  }
}

/**
 * Thay mô tả gói điểm đời cũ — chúng còn nhắc tới "hạn mức tháng".
 *
 * `INSERT IGNORE` ở trên không đụng tới dòng đã tồn tại, nên khi gói tháng ngừng
 * bán thì mô tả cũ vẫn nằm nguyên trong database và hiện ra trên trang bán hàng:
 * khách đọc "Bằng 1/10 hạn mức một tháng" mà không biết hạn mức tháng là gì.
 *
 * CHỈ sửa dòng còn giữ ĐÚNG NGUYÊN VĂN mô tả cũ. Admin đã tự viết lại thì để
 * nguyên — ghi đè chữ do người vận hành đặt là mất công họ gõ lại.
 */
const LEGACY_PACKAGE_DESCRIPTIONS: Record<string, string> = {
  EXTRA_99: 'Bằng 1/10 hạn mức một tháng — mua nhanh khi sắp cạn.',
  EXTRA_199: 'Bằng 1/5 hạn mức một tháng.',
  EXTRA_499: 'Bằng một nửa hạn mức một tháng.',
  EXTRA_999: 'Bằng đúng hạn mức của một tháng.',
  EXTRA_1999: 'Gấp đôi hạn mức tháng, hợp cho đợt chạy chiến dịch lớn.',
};

async function refreshStalePackageDescriptions(): Promise<void> {
  let updated = 0;

  for (const pkg of TOKEN_PACKAGES) {
    const stale = LEGACY_PACKAGE_DESCRIPTIONS[pkg.code];
    if (!stale) continue;

    const result = await execute('UPDATE token_packages SET description = ? WHERE code = ? AND description = ?', [
      pkg.description,
      pkg.code,
      stale,
    ]);
    updated += result.affectedRows;
  }

  if (updated > 0) {
    console.log(`[seed] Đã thay mô tả của ${updated} gói điểm còn nhắc tới hạn mức tháng.`);
  }
}

/**
 * Chuyển dữ liệu cũ sang đơn vị điểm mới (1 điểm = 1đ giá vốn).
 *
 * Trước đây 1 điểm ≈ 100đ giá bán, giờ neo vào giá vốn nên mọi con số lệch nhau
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
    console.log(`[seed] Đã quy đổi ${converted} dòng bảng giá sang đơn vị điểm mới (1 điểm = 1đ giá vốn).`);
  }

  // Gói điểm lẻ đời cũ tính theo 100đ/điểm — sai đơn vị hoàn toàn, ngừng bán.
  // EXTRA_200K/500K/1M/2M là bộ giá tạm ở bản trước, nay thay bằng bộ neo theo
  // hạn mức tháng (EXTRA_199/499/999/1999).
  const retired = await execute(
    `UPDATE token_packages SET is_active = 0
      WHERE code IN ('STARTER','CREATOR','CREATOR_PLUS','STUDIO','AGENCY',
                     'EXTRA_200K','EXTRA_500K','EXTRA_1M','EXTRA_2M')
        AND is_active = 1`,
  );
  if (retired.affectedRows > 0) {
    console.log(`[seed] Đã ngừng bán ${retired.affectedRows} gói điểm đời cũ.`);
  }

  // Nano Banana 2 Lite từng bị chèn vào DB khi câu INSERT chưa có cột is_active,
  // nên nó mặc định bật bán với giá vốn 0 và số điểm đặt tạm — bán như vậy là
  // bán mù, không biết lãi lỗ. Chỉ tắt khi dòng vẫn giữ nguyên giá trị đặt tạm;
  // nếu admin đã điền giá thật thì tôn trọng quyết định đó.
  const liteOff = await execute(
    `UPDATE model_pricing SET is_active = 0
      WHERE code = 'nano-banana-2-lite' AND api_cost_usd = 0 AND token_cost = 700 AND is_active = 1`,
  );
  if (liteOff.affectedRows > 0) {
    console.log('[seed] Đã tắt bán Nano Banana 2 Lite (chưa có giá vốn thật).');
  }
}

/**
 * Cảnh báo model đang bán mà chưa khai giá vốn.
 *
 * Không có giá vốn thì không tính được lãi lỗ và báo cáo biên lợi nhuận sẽ sai,
 * nên đây luôn là dấu hiệu cấu hình thiếu chứ không phải chủ ý.
 */
async function warnUnpricedModels(): Promise<void> {
  const rows = await query<RowDataPacket & { code: string; label: string }>(
    'SELECT code, label FROM model_pricing WHERE is_active = 1 AND api_cost_usd <= 0',
  );
  for (const row of rows) {
    console.warn(
      `[cấu hình] Model "${row.label}" (${row.code}) đang BÁN nhưng giá vốn = 0. ` +
        'Vào Quản trị → Bảng giá điền giá vốn thật, nếu không báo cáo lợi nhuận sẽ sai.',
    );
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
