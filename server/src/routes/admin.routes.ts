import { Router } from 'express';
import { execute, query, queryOne, withTransaction, type RowDataPacket } from '../db.js';
import { env } from '../env.js';
import { requireAdmin } from '../lib/auth.js';
import { asyncHandler, badRequest, notFound } from '../lib/errors.js';
import { optionalString, parsePaging, requireInt, requireString } from '../lib/validate.js';
import { providerStatus } from '../providers/index.js';
import { queueStatus, serializeGeneration, type GenerationRow, type ModelPricingRow } from '../services/generationService.js';
import { markOrderPaid, serializeOrder, type OrderRow, type PackageRow } from '../services/orderService.js';
import { applyLedger } from '../services/tokenService.js';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

const num = (value: unknown): number => Number(value ?? 0) || 0;

// ---------------------------------------------------------------------------
//  BẢNG ĐIỀU KHIỂN & BÁO CÁO
// ---------------------------------------------------------------------------

/**
 * Chỉ số tổng quan.
 *
 * Doanh thu  = tổng tiền các đơn đã thanh toán.
 * Chi phí vốn = tổng api_cost_usd của các ảnh tạo thành công, quy đổi theo USD_TO_VND.
 * Biên lợi nhuận gộp = (doanh thu − chi phí vốn) / doanh thu.
 */
adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const revenue = await queryOne<RowDataPacket & Record<string, number>>(
      `SELECT
         COALESCE(SUM(amount_vnd), 0)                                                     AS total,
         COALESCE(SUM(CASE WHEN DATE(paid_at) = CURDATE() THEN amount_vnd END), 0)        AS today,
         COALESCE(SUM(CASE WHEN paid_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)  THEN amount_vnd END), 0) AS last7,
         COALESCE(SUM(CASE WHEN paid_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount_vnd END), 0) AS last30,
         COUNT(*)                                                                          AS paid_orders,
         COALESCE(SUM(total_tokens), 0)                                                    AS tokens_sold
       FROM orders WHERE status = 'paid'`,
    );

    const pendingOrders = await queryOne<RowDataPacket & { total: number }>(
      `SELECT COUNT(*) AS total FROM orders WHERE status = 'pending'`,
    );

    const users = await queryOne<RowDataPacket & Record<string, number>>(
      `SELECT
         COUNT(*)                                                                    AS total,
         COALESCE(SUM(DATE(created_at) = CURDATE()), 0)                              AS new_today,
         COALESCE(SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)), 0)            AS new_30d,
         COALESCE(SUM(token_balance), 0)                                             AS outstanding_tokens
       FROM users`,
    );

    const generations = await queryOne<RowDataPacket & Record<string, number>>(
      `SELECT
         COUNT(*)                                                                       AS total,
         COALESCE(SUM(status = 'success'), 0)                                           AS success,
         COALESCE(SUM(status IN ('failed','refunded')), 0)                              AS failed,
         COALESCE(SUM(CASE WHEN status = 'success' THEN token_cost END), 0)             AS tokens_spent,
         COALESCE(SUM(CASE WHEN status = 'success' THEN api_cost_usd END), 0)           AS api_cost_usd,
         COALESCE(SUM(DATE(created_at) = CURDATE()), 0)                                 AS today,
         COALESCE(AVG(CASE WHEN status = 'success' THEN duration_ms END), 0)            AS avg_duration_ms
       FROM generations`,
    );

    const totalRevenue = num(revenue?.total);
    const apiCostVnd = num(generations?.api_cost_usd) * env.usdToVnd;

    res.json({
      revenue: {
        total: totalRevenue,
        today: num(revenue?.today),
        last7Days: num(revenue?.last7),
        last30Days: num(revenue?.last30),
        paidOrders: num(revenue?.paid_orders),
        pendingOrders: num(pendingOrders?.total),
        averageOrderValue: num(revenue?.paid_orders) > 0 ? Math.round(totalRevenue / num(revenue?.paid_orders)) : 0,
      },
      users: {
        total: num(users?.total),
        newToday: num(users?.new_today),
        new30Days: num(users?.new_30d),
        // Token khách đã mua nhưng chưa dùng — đây là nghĩa vụ phải phục vụ.
        outstandingTokens: num(users?.outstanding_tokens),
        outstandingLiabilityVnd: Math.round(num(users?.outstanding_tokens) * 100),
      },
      tokens: {
        sold: num(revenue?.tokens_sold),
        spent: num(generations?.tokens_spent),
      },
      generations: {
        total: num(generations?.total),
        success: num(generations?.success),
        failed: num(generations?.failed),
        today: num(generations?.today),
        successRate: num(generations?.total) > 0 ? Math.round((num(generations?.success) / num(generations?.total)) * 1000) / 10 : 0,
        avgDurationSec: Math.round(num(generations?.avg_duration_ms) / 100) / 10,
      },
      cost: {
        apiCostUsd: Math.round(num(generations?.api_cost_usd) * 10000) / 10000,
        apiCostVnd: Math.round(apiCostVnd),
        grossProfitVnd: Math.round(totalRevenue - apiCostVnd),
        grossMarginPercent: totalRevenue > 0 ? Math.round(((totalRevenue - apiCostVnd) / totalRevenue) * 1000) / 10 : 0,
        usdToVnd: env.usdToVnd,
      },
      system: {
        queue: queueStatus(),
        providers: providerStatus(),
        adminEmails: env.adminEmails,
        downloadResults: env.downloadResults,
      },
    });
  }),
);

/** Chuỗi số liệu theo ngày để vẽ biểu đồ. */
adminRouter.get(
  '/reports/daily',
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 180);

    const revenue = await query<RowDataPacket & { day: string; revenue: number; orders: number }>(
      `SELECT DATE(paid_at) AS day, SUM(amount_vnd) AS revenue, COUNT(*) AS orders
         FROM orders
        WHERE status = 'paid' AND paid_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(paid_at)`,
      [days],
    );

    const images = await query<RowDataPacket & { day: string; total: number; success: number; tokens: number; cost: number }>(
      `SELECT DATE(created_at) AS day,
              COUNT(*) AS total,
              SUM(status = 'success') AS success,
              SUM(CASE WHEN status = 'success' THEN token_cost END) AS tokens,
              SUM(CASE WHEN status = 'success' THEN api_cost_usd END) AS cost
         FROM generations
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)`,
      [days],
    );

    const signups = await query<RowDataPacket & { day: string; total: number }>(
      `SELECT DATE(created_at) AS day, COUNT(*) AS total
         FROM users
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)`,
      [days],
    );

    const key = (value: unknown) => new Date(value as string).toISOString().slice(0, 10);
    const revenueMap = new Map(revenue.map((row) => [key(row.day), row]));
    const imageMap = new Map(images.map((row) => [key(row.day), row]));
    const signupMap = new Map(signups.map((row) => [key(row.day), row]));

    // Bù các ngày không có dữ liệu để biểu đồ không bị đứt đoạn.
    const series: unknown[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);
      const day = date.toISOString().slice(0, 10);

      const apiCostUsd = num(imageMap.get(day)?.cost);
      series.push({
        day,
        revenueVnd: num(revenueMap.get(day)?.revenue),
        orders: num(revenueMap.get(day)?.orders),
        newUsers: num(signupMap.get(day)?.total),
        images: num(imageMap.get(day)?.total),
        successImages: num(imageMap.get(day)?.success),
        tokensSpent: num(imageMap.get(day)?.tokens),
        apiCostVnd: Math.round(apiCostUsd * env.usdToVnd),
      });
    }

    res.json({ days, series });
  }),
);

/** Thống kê theo từng model — biết model nào đang được dùng và lãi bao nhiêu. */
adminRouter.get(
  '/reports/models',
  asyncHandler(async (_req, res) => {
    const rows = await query<RowDataPacket & Record<string, any>>(
      `SELECT g.model_code, g.model_label, g.provider,
              COUNT(*)                                                        AS total,
              SUM(g.status = 'success')                                       AS success,
              COALESCE(SUM(CASE WHEN g.status = 'success' THEN g.token_cost END), 0)   AS tokens,
              COALESCE(SUM(CASE WHEN g.status = 'success' THEN g.api_cost_usd END), 0) AS cost_usd
         FROM generations g
        GROUP BY g.model_code, g.model_label, g.provider
        ORDER BY total DESC`,
    );

    res.json({
      models: rows.map((row) => {
        // Token quy ra tiền theo mệnh giá 100đ/token để so với chi phí vốn.
        const tokenValueVnd = num(row.tokens) * 100;
        const costVnd = num(row.cost_usd) * env.usdToVnd;
        return {
          modelCode: row.model_code,
          modelLabel: row.model_label,
          provider: row.provider,
          total: num(row.total),
          success: num(row.success),
          tokensSpent: num(row.tokens),
          tokenValueVnd: Math.round(tokenValueVnd),
          apiCostVnd: Math.round(costVnd),
          marginPercent: tokenValueVnd > 0 ? Math.round(((tokenValueVnd - costVnd) / tokenValueVnd) * 1000) / 10 : 0,
        };
      }),
    });
  }),
);

/** Khách hàng chi nhiều nhất. */
adminRouter.get(
  '/reports/top-users',
  asyncHandler(async (_req, res) => {
    const rows = await query<RowDataPacket & Record<string, any>>(
      `SELECT u.id, u.email, u.full_name, u.total_topup_vnd, u.token_balance, u.total_tokens_out,
              (SELECT COUNT(*) FROM generations g WHERE g.user_id = u.id AND g.status = 'success') AS images
         FROM users u
        ORDER BY u.total_topup_vnd DESC, u.total_tokens_out DESC
        LIMIT 20`,
    );

    res.json({
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        totalTopupVnd: num(row.total_topup_vnd),
        tokenBalance: num(row.token_balance),
        tokensSpent: num(row.total_tokens_out),
        images: num(row.images),
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
//  QUẢN LÝ KHÁCH HÀNG
// ---------------------------------------------------------------------------

adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePaging(req.query as Record<string, unknown>, 25);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where = search ? 'WHERE email LIKE ? OR full_name LIKE ? OR phone LIKE ?' : '';
    const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

    const rows = await query<RowDataPacket & Record<string, any>>(
      `SELECT id, email, full_name, phone, role, status, token_balance, total_topup_vnd,
              total_tokens_in, total_tokens_out, last_login_at, created_at
         FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const total = await queryOne<RowDataPacket & { total: number }>(
      `SELECT COUNT(*) AS total FROM users ${where}`,
      params,
    );

    res.json({
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        phone: row.phone,
        role: row.role,
        status: row.status,
        tokenBalance: num(row.token_balance),
        totalTopupVnd: num(row.total_topup_vnd),
        tokensIn: num(row.total_tokens_in),
        tokensOut: num(row.total_tokens_out),
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
      })),
      page,
      limit,
      total: total?.total ?? 0,
    });
  }),
);

/** Khoá / mở khoá tài khoản. Quyền admin điều khiển bằng .env nên không sửa ở đây. */
adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const status = requireString(req.body, 'status', { label: 'Trạng thái' });
    if (!['active', 'banned'].includes(status)) throw badRequest('Trạng thái chỉ nhận "active" hoặc "banned".');

    const result = await execute('UPDATE users SET status = ? WHERE id = ?', [status, Number(req.params.id)]);
    if (result.affectedRows === 0) throw notFound('Không tìm thấy tài khoản.');
    res.json({ ok: true });
  }),
);

/** Cộng / trừ token thủ công (đền bù, khuyến mãi, thu hồi). */
adminRouter.post(
  '/users/:id/tokens',
  asyncHandler(async (req, res) => {
    const amount = requireInt(req.body, 'amount', { label: 'Số token' });
    if (amount === 0) throw badRequest('Số token phải khác 0.');
    const reason = requireString(req.body, 'reason', { label: 'Lý do', max: 200 });

    const balance = await withTransaction((conn) =>
      applyLedger(conn, {
        userId: Number(req.params.id),
        amount,
        type: 'adjust',
        description: `[Admin] ${reason}`,
        createdBy: req.user!.id,
      }),
    );

    res.json({ ok: true, tokenBalance: balance.balanceAfter });
  }),
);

// ---------------------------------------------------------------------------
//  QUẢN LÝ ĐƠN NẠP
// ---------------------------------------------------------------------------

adminRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePaging(req.query as Record<string, unknown>, 25);
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const filters: string[] = [];
    const params: unknown[] = [];
    if (['pending', 'paid', 'cancelled', 'expired'].includes(status)) {
      filters.push('o.status = ?');
      params.push(status);
    }
    if (search) {
      filters.push('(o.code LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const rows = await query<OrderRow & { email: string; full_name: string | null }>(
      `SELECT o.*, u.email, u.full_name
         FROM orders o JOIN users u ON u.id = o.user_id
         ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const total = await queryOne<RowDataPacket & { total: number }>(
      `SELECT COUNT(*) AS total FROM orders o JOIN users u ON u.id = o.user_id ${where}`,
      params,
    );

    res.json({
      orders: rows.map((row) => ({
        ...serializeOrder(row),
        user: { id: row.user_id, email: row.email, fullName: row.full_name },
      })),
      page,
      limit,
      total: total?.total ?? 0,
    });
  }),
);

/** Duyệt tay đơn nạp — dùng khi khách chuyển khoản sai nội dung. */
adminRouter.post(
  '/orders/:code/approve',
  asyncHandler(async (req, res) => {
    const outcome = await markOrderPaid(req.params.code, {
      source: 'manual',
      paymentRef: optionalString(req.body, 'paymentRef'),
      approvedBy: req.user!.id,
      note: optionalString(req.body, 'note', 500),
    });

    if (!outcome.ok) throw badRequest(outcome.message, outcome.reason);
    res.json({ ok: true, order: serializeOrder(outcome.order), tokensCredited: outcome.tokensCredited });
  }),
);

adminRouter.post(
  '/orders/:code/cancel',
  asyncHandler(async (req, res) => {
    const result = await execute(`UPDATE orders SET status = 'cancelled' WHERE code = ? AND status = 'pending'`, [
      req.params.code,
    ]);
    if (result.affectedRows === 0) throw badRequest('Chỉ huỷ được đơn đang chờ thanh toán.');
    res.json({ ok: true });
  }),
);

/** Nhật ký webhook ngân hàng — tra khi khách báo đã chuyển mà chưa nhận token. */
adminRouter.get(
  '/payment-events',
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePaging(req.query as Record<string, unknown>, 25);
    const rows = await query<RowDataPacket & Record<string, any>>(
      'SELECT * FROM payment_events ORDER BY id DESC LIMIT ? OFFSET ?',
      [limit, offset],
    );

    res.json({
      events: rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        externalId: row.external_id,
        orderCode: row.order_code,
        amountVnd: num(row.amount_vnd),
        content: row.content,
        status: row.status,
        message: row.message,
        createdAt: row.created_at,
      })),
      page,
      limit,
    });
  }),
);

// ---------------------------------------------------------------------------
//  BẢNG GIÁ MODEL
// ---------------------------------------------------------------------------

adminRouter.get(
  '/pricing',
  asyncHandler(async (_req, res) => {
    const rows = await query<ModelPricingRow>('SELECT * FROM model_pricing ORDER BY sort_order, code');
    res.json({
      models: rows.map((row) => ({
        id: row.id,
        code: row.code,
        provider: row.provider,
        providerModel: row.provider_model,
        label: row.label,
        family: row.family,
        resolution: row.resolution,
        apiCostUsd: Number(row.api_cost_usd),
        apiCostVnd: Math.round(Number(row.api_cost_usd) * env.usdToVnd),
        tokenCost: row.token_cost,
        // Giá bán danh nghĩa = số token × 100đ.
        sellPriceVnd: row.token_cost * 100,
        marginPercent:
          row.token_cost > 0
            ? Math.round(((row.token_cost * 100 - Number(row.api_cost_usd) * env.usdToVnd) / (row.token_cost * 100)) * 1000) / 10
            : 0,
        isActive: Boolean(row.is_active),
        sortOrder: row.sort_order,
        notes: row.notes,
      })),
      usdToVnd: env.usdToVnd,
    });
  }),
);

/** Thêm model mới (nhà cung cấp khác, model mới ra mắt...). */
adminRouter.post(
  '/pricing',
  asyncHandler(async (req, res) => {
    const result = await execute(
      `INSERT INTO model_pricing
         (code, provider, provider_model, label, family, resolution, api_cost_usd, token_cost, sort_order, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(req.body, 'code', { label: 'Mã model', max: 80 }),
        requireString(req.body, 'provider', { label: 'Nhà cung cấp', max: 50 }),
        requireString(req.body, 'providerModel', { label: 'Slug model', max: 120 }),
        requireString(req.body, 'label', { label: 'Tên hiển thị', max: 120 }),
        requireString(req.body, 'family', { label: 'Nhóm model', max: 80 }),
        requireString(req.body, 'resolution', { label: 'Độ phân giải', max: 16 }),
        Number(req.body.apiCostUsd) || 0,
        requireInt(req.body, 'tokenCost', { min: 1, label: 'Số token' }),
        Number(req.body.sortOrder) || 0,
        optionalString(req.body, 'notes', 255),
      ],
    );
    res.status(201).json({ ok: true, id: result.insertId });
  }),
);

adminRouter.patch(
  '/pricing/:id',
  asyncHandler(async (req, res) => {
    const allowed: Record<string, string> = {
      providerModel: 'provider_model',
      provider: 'provider',
      label: 'label',
      resolution: 'resolution',
      apiCostUsd: 'api_cost_usd',
      tokenCost: 'token_cost',
      isActive: 'is_active',
      sortOrder: 'sort_order',
      notes: 'notes',
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(allowed)) {
      if (req.body[key] === undefined) continue;
      sets.push(`${column} = ?`);
      params.push(key === 'isActive' ? (req.body[key] ? 1 : 0) : req.body[key]);
    }
    if (sets.length === 0) throw badRequest('Không có trường nào để cập nhật.');

    params.push(Number(req.params.id));
    const result = await execute(`UPDATE model_pricing SET ${sets.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) throw notFound('Không tìm thấy model.');
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
//  GÓI NẠP
// ---------------------------------------------------------------------------

adminRouter.get(
  '/packages',
  asyncHandler(async (_req, res) => {
    const rows = await query<PackageRow>('SELECT * FROM token_packages ORDER BY sort_order, price_vnd');
    res.json({
      packages: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        priceVnd: row.price_vnd,
        baseTokens: row.base_tokens,
        bonusTokens: row.bonus_tokens,
        totalTokens: row.base_tokens + row.bonus_tokens,
        pricePerToken: Math.round((row.price_vnd / (row.base_tokens + row.bonus_tokens)) * 10) / 10,
        description: row.description,
        isPopular: Boolean(row.is_popular),
        isActive: Boolean(row.is_active),
        sortOrder: row.sort_order,
      })),
    });
  }),
);

adminRouter.patch(
  '/packages/:id',
  asyncHandler(async (req, res) => {
    const allowed: Record<string, string> = {
      name: 'name',
      priceVnd: 'price_vnd',
      baseTokens: 'base_tokens',
      bonusTokens: 'bonus_tokens',
      description: 'description',
      isPopular: 'is_popular',
      isActive: 'is_active',
      sortOrder: 'sort_order',
    };

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of Object.entries(allowed)) {
      if (req.body[key] === undefined) continue;
      sets.push(`${column} = ?`);
      params.push(['isPopular', 'isActive'].includes(key) ? (req.body[key] ? 1 : 0) : req.body[key]);
    }
    if (sets.length === 0) throw badRequest('Không có trường nào để cập nhật.');

    params.push(Number(req.params.id));
    const result = await execute(`UPDATE token_packages SET ${sets.join(', ')} WHERE id = ?`, params);
    if (result.affectedRows === 0) throw notFound('Không tìm thấy gói nạp.');
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/packages',
  asyncHandler(async (req, res) => {
    const result = await execute(
      `INSERT INTO token_packages (code, name, price_vnd, base_tokens, bonus_tokens, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        requireString(req.body, 'code', { label: 'Mã gói', max: 50 }).toUpperCase(),
        requireString(req.body, 'name', { label: 'Tên gói', max: 120 }),
        requireInt(req.body, 'priceVnd', { min: 1000, label: 'Giá nạp' }),
        requireInt(req.body, 'baseTokens', { min: 1, label: 'Token cơ bản' }),
        Number(req.body.bonusTokens) || 0,
        optionalString(req.body, 'description', 255),
        Number(req.body.sortOrder) || 0,
      ],
    );
    res.status(201).json({ ok: true, id: result.insertId });
  }),
);

// ---------------------------------------------------------------------------
//  ẢNH ĐÃ TẠO (toàn hệ thống)
// ---------------------------------------------------------------------------

adminRouter.get(
  '/generations',
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePaging(req.query as Record<string, unknown>, 24);
    const status = typeof req.query.status === 'string' ? req.query.status : '';

    const where = ['queued', 'processing', 'success', 'failed', 'refunded'].includes(status) ? 'WHERE g.status = ?' : '';
    const params = where ? [status] : [];

    const rows = await query<GenerationRow & { email: string }>(
      `SELECT g.*, u.email FROM generations g JOIN users u ON u.id = g.user_id
       ${where} ORDER BY g.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    res.json({
      generations: rows.map((row) => ({ ...serializeGeneration(row), userEmail: row.email })),
      page,
      limit,
    });
  }),
);
