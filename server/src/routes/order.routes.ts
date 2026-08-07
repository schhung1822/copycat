import { Router } from 'express';
import { query, queryOne, type RowDataPacket } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { parsePaging, requireInt } from '../lib/validate.js';
import {
  bankInfo,
  cancelOrder,
  createOrder,
  createSubscriptionOrder,
  createUpgradeOrder,
  expireStaleOrders,
  serializeOrder,
  type OrderRow,
} from '../services/orderService.js';
import {
  getActiveSubscription,
  listUpgradeOptions,
  readAccountState,
  requireSubscription,
} from '../services/subscriptionService.js';

export const orderRouter = Router();

orderRouter.use(requireAuth);

/** Danh sách đơn nạp của chính người dùng. */
orderRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    await expireStaleOrders();
    const { limit, offset, page } = parsePaging(req.query as Record<string, unknown>, 20);

    const orders = await query<OrderRow>('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?', [
      req.user!.id,
      limit,
      offset,
    ]);
    const total = await queryOne<RowDataPacket & { total: number }>(
      'SELECT COUNT(*) AS total FROM orders WHERE user_id = ?',
      [req.user!.id],
    );

    res.json({ orders: orders.map(serializeOrder), page, limit, total: total?.total ?? 0 });
  }),
);

/**
 * Tạo đơn mua thêm điểm lẻ.
 *
 * Chỉ dành cho khách đã có gói dịch vụ — điểm lẻ là phần mua thêm khi dùng hết
 * hạn mức tháng, không phải đường vòng để dùng dịch vụ mà không đăng ký gói.
 */
orderRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const state = await readAccountState(req.user!.id);
    requireSubscription(state);

    const packageId = requireInt(req.body, 'packageId', { min: 1, label: 'Gói điểm' });
    const order = await createOrder(req.user!.id, packageId);
    res.status(201).json({ order: serializeOrder(order), bank: bankInfo() });
  }),
);

/** Tạo đơn mua hoặc gia hạn gói dịch vụ theo tháng. */
orderRouter.post(
  '/subscription',
  asyncHandler(async (req, res) => {
    const planId = requireInt(req.body, 'planId', { min: 1, label: 'Gói dịch vụ' });
    const order = await createSubscriptionOrder(req.user!.id, planId);
    res.status(201).json({ order: serializeOrder(order), bank: bankInfo() });
  }),
);

/**
 * Các gói có thể nâng lên, kèm số tiền phải bù cho từng gói.
 * Trả về mảng rỗng nếu khách chưa có gói hoặc đang dùng gói cao nhất.
 */
orderRouter.get(
  '/upgrade-options',
  asyncHandler(async (req, res) => {
    const current = await getActiveSubscription(req.user!.id);
    const options = await listUpgradeOptions(req.user!.id);

    res.json({
      currentPlan: current
        ? {
            planId: current.plan_id,
            name: current.plan_name,
            priceVnd: current.price_vnd,
            expiresAt: current.expires_at,
          }
        : null,
      options: options.map((quote) => ({
        planId: quote.plan.id,
        name: quote.plan.name,
        months: quote.plan.months,
        monthlyTokenAllowance: quote.plan.monthly_token_allowance,
        listPriceVnd: quote.listPriceVnd,
        creditVnd: quote.creditVnd,
        payableVnd: quote.payableVnd,
        remainingDays: quote.remainingDays,
        totalDays: quote.totalDays,
      })),
    });
  }),
);

/** Tạo đơn nâng lên gói cao hơn. Số tiền đã trừ phần chưa dùng của gói hiện tại. */
orderRouter.post(
  '/upgrade',
  asyncHandler(async (req, res) => {
    const planId = requireInt(req.body, 'planId', { min: 1, label: 'Gói dịch vụ' });
    const order = await createUpgradeOrder(req.user!.id, planId);
    res.status(201).json({ order: serializeOrder(order), bank: bankInfo() });
  }),
);

/** Xem chi tiết một đơn — client gọi lặp lại để biết webhook đã cộng điểm chưa. */
orderRouter.get(
  '/:code',
  asyncHandler(async (req, res) => {
    await expireStaleOrders();
    const order = await queryOne<OrderRow>('SELECT * FROM orders WHERE code = ? AND user_id = ?', [
      req.params.code,
      req.user!.id,
    ]);
    if (!order) throw notFound('Không tìm thấy đơn nạp.');

    res.json({ order: serializeOrder(order), bank: bankInfo(), tokenBalance: req.user!.token_balance });
  }),
);

orderRouter.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    await cancelOrder(req.user!.id, Number(req.params.id));
    res.json({ ok: true });
  }),
);
