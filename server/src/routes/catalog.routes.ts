import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../lib/errors.js';
import type { ModelPricingRow } from '../services/generationService.js';
import { bankInfo, listActivePackages } from '../services/orderService.js';

export const catalogRouter = Router();

/**
 * Bảng giá công khai: model đang bán + gói nạp + thông tin chuyển khoản.
 * Không cần đăng nhập để khách xem giá trước khi tạo tài khoản.
 */
catalogRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const models = await query<ModelPricingRow>(
      'SELECT * FROM model_pricing WHERE is_active = 1 ORDER BY sort_order, code',
    );
    const packages = await listActivePackages();

    res.json({
      models: models.map((model) => ({
        code: model.code,
        label: model.label,
        family: model.family,
        resolution: model.resolution,
        tokenCost: model.token_cost,
        notes: model.notes,
      })),
      packages: packages.map((pkg) => ({
        id: pkg.id,
        code: pkg.code,
        name: pkg.name,
        priceVnd: pkg.price_vnd,
        baseTokens: pkg.base_tokens,
        bonusTokens: pkg.bonus_tokens,
        totalTokens: pkg.base_tokens + pkg.bonus_tokens,
        // Giá thực tế mỗi token, dùng để khách so sánh các gói.
        pricePerToken: Math.round((pkg.price_vnd / (pkg.base_tokens + pkg.bonus_tokens)) * 10) / 10,
        bonusPercent: pkg.base_tokens > 0 ? Math.round((pkg.bonus_tokens / pkg.base_tokens) * 1000) / 10 : 0,
        description: pkg.description,
        isPopular: Boolean(pkg.is_popular),
      })),
      bank: bankInfo(),
    });
  }),
);
