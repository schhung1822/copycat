import { Router } from 'express';
import { query, queryOne, type RowDataPacket } from '../db.js';
import { readAccountState } from '../services/subscriptionService.js';
import { requireAuth } from '../lib/auth.js';
import { asyncHandler, notFound } from '../lib/errors.js';
import { parsePaging, requireInt, requireString, requireStringArray } from '../lib/validate.js';
import {
  createGenerations,
  redoGeneration,
  serializeGeneration,
  type GenerationRow,
} from '../services/generationService.js';

export const generationRouter = Router();

generationRouter.use(requireAuth);

/**
 * Tạo một lô ảnh.
 *
 * Client gửi ảnh mẫu + ảnh sản phẩm dạng data URI. Server lưu mỗi ảnh đúng một
 * lần rồi nhân bản thành `referenceImages.length × quantityPerReference` lệnh vẽ,
 * nên payload không phình lên khi tạo nhiều ảnh.
 */
generationRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const result = await createGenerations(req.user!.id, {
      modelCode: requireString(req.body, 'modelCode', { label: 'Model' }),
      aspectRatio: requireString(req.body, 'aspectRatio', { label: 'Tỉ lệ ảnh' }),
      prompt: typeof req.body.prompt === 'string' ? req.body.prompt : '',
      referenceImages: requireStringArray(req.body, 'referenceImages', { max: 8, label: 'Ảnh mẫu' }),
      productImages: requireStringArray(req.body, 'productImages', { max: 3, label: 'Ảnh sản phẩm' }),
      quantityPerReference: requireInt(req.body, 'quantityPerReference', { min: 1, max: 4, label: 'Số lượng' }),
    });

    const rows = await query<GenerationRow>(
      `SELECT * FROM generations WHERE id IN (${result.generationIds.map(() => '?').join(',')}) ORDER BY id DESC`,
      result.generationIds,
    );

    res.status(202).json({
      batchId: result.batchId,
      tokenCost: result.tokenCost,
      tokenBalance: result.balance,
      generations: rows.map(serializeGeneration),
    });
  }),
);

/** Lịch sử ảnh của người dùng. */
generationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit, offset, page } = parsePaging(req.query as Record<string, unknown>, 24);

    // Nhận nhiều trạng thái phân tách bằng dấu phẩy, vd ?status=queued,processing
    // để trang tạo ảnh lấy đúng những ảnh còn đang chạy.
    const allowed = ['queued', 'processing', 'success', 'failed', 'refunded'];
    const statuses = String(req.query.status ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => allowed.includes(value));

    const filters = ['user_id = ?'];
    const params: unknown[] = [req.user!.id];
    if (statuses.length > 0) {
      filters.push(`status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    const where = `WHERE ${filters.join(' AND ')}`;

    const rows = await query<GenerationRow>(`SELECT * FROM generations ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      offset,
    ]);
    const total = await queryOne<RowDataPacket & { total: number }>(
      `SELECT COUNT(*) AS total FROM generations ${where}`,
      params,
    );

    res.json({ generations: rows.map(serializeGeneration), page, limit, total: total?.total ?? 0 });
  }),
);

/**
 * Tra trạng thái nhiều ảnh cùng lúc — client dùng để cập nhật lưới kết quả
 * mà không phải gọi một request cho mỗi ảnh.
 */
generationRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
    const ids = raw
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 50);

    /*
     * PHẢI trả về tổng dùng được (hạn mức tháng + token đã mua), không phải cột
     * users.token_balance — cột đó chỉ là phần token MUA THÊM.
     *
     * Giao diện gọi endpoint này 3 giây một lần trong lúc vẽ ảnh và ghi đè số dư
     * đang hiển thị bằng giá trị trả về. Trả nhầm cột khiến khách nào tiêu bằng
     * hạn mức tháng (token_balance = 0) thấy số dư tụt về 0 ngay khi bắt đầu tạo
     * ảnh, kèm theo nút bấm đổi thành "Hết hạn mức".
     */
    if (ids.length === 0) {
      const state = await readAccountState(req.user!.id);
      res.json({ generations: [], tokenBalance: state.availableTokens });
      return;
    }

    const rows = await query<GenerationRow>(
      `SELECT * FROM generations WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      [req.user!.id, ...ids],
    );
    const state = await readAccountState(req.user!.id);

    res.json({ generations: rows.map(serializeGeneration), tokenBalance: state.availableTokens });
  }),
);

generationRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await queryOne<GenerationRow>('SELECT * FROM generations WHERE id = ? AND user_id = ?', [
      Number(req.params.id),
      req.user!.id,
    ]);
    if (!row) throw notFound('Không tìm thấy ảnh.');
    res.json({ generation: serializeGeneration(row) });
  }),
);

/** Vẽ lại với prompt mới, dùng lại ảnh đầu vào cũ. Trừ token như một ảnh mới. */
generationRouter.post(
  '/:id/redo',
  asyncHandler(async (req, res) => {
    const result = await redoGeneration(
      req.user!.id,
      Number(req.params.id),
      typeof req.body.prompt === 'string' ? req.body.prompt : '',
    );

    const row = await queryOne<GenerationRow>('SELECT * FROM generations WHERE id = ?', [result.generationId]);
    res.status(202).json({
      generation: row ? serializeGeneration(row) : null,
      tokenCost: result.tokenCost,
      tokenBalance: result.balance,
    });
  }),
);
