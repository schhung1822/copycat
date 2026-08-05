import crypto from 'node:crypto';
import { execute, query, queryOne, withTransaction, type ResultSetHeader, type RowDataPacket } from '../db.js';
import { env } from '../env.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { getProvider } from '../providers/index.js';
import { downloadResult, readAsDataUri, saveBase64Image, toPublicUrl } from './storageService.js';
import { applyLedger } from './tokenService.js';

export interface ModelPricingRow extends RowDataPacket {
  id: number;
  code: string;
  provider: string;
  provider_model: string;
  label: string;
  family: string;
  resolution: string;
  api_cost_usd: number;
  token_cost: number;
  is_active: number;
  sort_order: number;
  notes: string | null;
}

export interface GenerationRow extends RowDataPacket {
  id: number;
  user_id: number;
  batch_id: string | null;
  model_code: string;
  model_label: string;
  provider: string;
  provider_model: string;
  resolution: string;
  aspect_ratio: string;
  prompt: string | null;
  input_images: { reference: string | null; products: string[] } | string | null;
  token_cost: number;
  api_cost_usd: number;
  status: 'queued' | 'processing' | 'success' | 'failed' | 'refunded';
  provider_task_id: string | null;
  result_url: string | null;
  result_path: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: Date;
  completed_at: Date | null;
}

/**
 * Danh sách tỉ lệ chung của giao diện. Mỗi model chỉ hỗ trợ một tập con — adapter
 * của nhà cung cấp mới là nơi kiểm tra chính xác (xem `provider.validate`).
 * `auto` để model tự chọn tỉ lệ hợp lý theo ảnh đầu vào.
 */
const VALID_RATIOS = [
  'auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4',
  '9:16', '16:9', '21:9', '2:1', '1:2', '3:1', '1:3', '9:21',
];
const MAX_PRODUCT_IMAGES = 3;
const MAX_REFERENCE_IMAGES = 8;
const MAX_QUANTITY_PER_REFERENCE = 4;

export interface CreateGenerationInput {
  modelCode: string;
  aspectRatio: string;
  prompt: string;
  /** Data URI base64. Mỗi ảnh mẫu sẽ sinh ra `quantityPerReference` ảnh kết quả. */
  referenceImages: string[];
  productImages: string[];
  quantityPerReference: number;
}

export async function getActiveModel(code: string): Promise<ModelPricingRow> {
  const model = await queryOne<ModelPricingRow>('SELECT * FROM model_pricing WHERE code = ?', [code]);
  if (!model) throw badRequest(`Không tìm thấy model "${code}".`, 'unknown_model');
  if (!model.is_active) throw badRequest(`Model "${model.label}" đang tạm ngưng.`, 'model_inactive');
  return model;
}

/**
 * Tạo một loạt lệnh vẽ ảnh.
 *
 * Token bị trừ NGAY tại đây, trong cùng một transaction với việc ghi các dòng
 * `generations`. Nếu nhà cung cấp lỗi về sau, token sẽ được hoàn lại tự động
 * (xem `finishGeneration`), nên khách không bao giờ mất token vì lỗi hệ thống.
 */
export async function createGenerations(
  userId: number,
  input: CreateGenerationInput,
): Promise<{ batchId: string; generationIds: number[]; tokenCost: number; balance: number }> {
  const model = await getActiveModel(input.modelCode);
  const provider = getProvider(model.provider);
  if (!provider.isConfigured()) {
    throw new AppError(503, `Nhà cung cấp "${model.provider}" chưa được cấu hình API key.`, 'provider_not_configured');
  }

  const quantity = Math.min(Math.max(Math.trunc(input.quantityPerReference) || 1, 1), MAX_QUANTITY_PER_REFERENCE);
  const references = input.referenceImages.slice(0, MAX_REFERENCE_IMAGES);
  const products = input.productImages.slice(0, MAX_PRODUCT_IMAGES);

  if (products.length === 0) throw badRequest('Cần ít nhất một ảnh sản phẩm.');

  const aspectRatio = VALID_RATIOS.includes(input.aspectRatio) ? input.aspectRatio : 'auto';
  const jobCount = Math.max(references.length, 1) * quantity;

  // Chặn các tổ hợp model / tỉ lệ / chất lượng mà nhà cung cấp chắc chắn từ chối,
  // trước khi động tới token của khách.
  const rejection = provider.validate?.({
    providerModel: model.provider_model,
    resolution: model.resolution,
    aspectRatio,
    imageCount: references.length > 0 ? products.length + 1 : products.length,
  });
  if (rejection) throw badRequest(rejection, 'unsupported_combination');

  const inQueue = await queryOne<RowDataPacket & { total: number }>(
    `SELECT COUNT(*) AS total FROM generations WHERE user_id = ? AND status IN ('queued','processing')`,
    [userId],
  );
  if ((inQueue?.total ?? 0) + jobCount > env.maxQueuePerUser) {
    throw badRequest(
      `Bạn đang có quá nhiều ảnh trong hàng đợi (tối đa ${env.maxQueuePerUser}). Vui lòng đợi các ảnh hiện tại xong.`,
      'queue_full',
    );
  }

  // Lưu ảnh đầu vào một lần rồi tái sử dụng cho mọi job trong lô.
  const productPaths = await Promise.all(products.map((image) => saveBase64Image(image)));
  const referencePaths = await Promise.all(references.map((image) => saveBase64Image(image)));

  const batchId = crypto.randomUUID();
  const totalCost = model.token_cost * jobCount;
  const prompt = input.prompt.trim().slice(0, 4000);

  const { generationIds, balance } = await withTransaction(async (conn) => {
    const ledger = await applyLedger(conn, {
      userId,
      amount: -totalCost,
      type: 'spend',
      description: `Tạo ${jobCount} ảnh · ${model.label}`,
    });

    const ids: number[] = [];
    const slots = referencePaths.length > 0 ? referencePaths : [null];

    for (const referencePath of slots) {
      for (let i = 0; i < quantity; i += 1) {
        const [result] = await conn.query<ResultSetHeader>(
          `INSERT INTO generations
             (user_id, batch_id, model_code, model_label, provider, provider_model, resolution,
              aspect_ratio, prompt, input_images, token_cost, api_cost_usd, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
          [
            userId,
            batchId,
            model.code,
            model.label,
            model.provider,
            model.provider_model,
            model.resolution,
            aspectRatio,
            prompt,
            JSON.stringify({ reference: referencePath, products: productPaths }),
            model.token_cost,
            model.api_cost_usd,
          ],
        );
        ids.push(result.insertId);
      }
    }

    // Gắn ledger vào ảnh đầu tiên của lô để tra soát ngược được.
    await conn.query('UPDATE token_transactions SET ref_type = ?, ref_id = ? WHERE id = ?', [
      'generation',
      ids[0],
      ledger.ledgerId,
    ]);

    return { generationIds: ids, balance: ledger.balanceAfter };
  });

  for (const id of generationIds) enqueue(id);

  return { batchId, generationIds, tokenCost: totalCost, balance };
}

/** Vẽ lại một ảnh với prompt mới, dùng lại đúng ảnh đầu vào đã lưu. */
export async function redoGeneration(
  userId: number,
  generationId: number,
  newPrompt: string,
): Promise<{ generationId: number; tokenCost: number; balance: number }> {
  const source = await queryOne<GenerationRow>('SELECT * FROM generations WHERE id = ? AND user_id = ?', [
    generationId,
    userId,
  ]);
  if (!source) throw notFound('Không tìm thấy ảnh cần vẽ lại.');

  const model = await getActiveModel(source.model_code);
  const inputImages = parseInputImages(source);
  const prompt = newPrompt.trim().slice(0, 4000);

  // Ảnh cũ có thể được tạo bằng tổ hợp mà bảng giá nay đã đổi, nên vẫn phải kiểm tra lại.
  const rejection = getProvider(model.provider).validate?.({
    providerModel: model.provider_model,
    resolution: model.resolution,
    aspectRatio: source.aspect_ratio,
    imageCount: inputImages.products.length + (inputImages.reference ? 1 : 0),
  });
  if (rejection) throw badRequest(rejection, 'unsupported_combination');

  const { newId, balance } = await withTransaction(async (conn) => {
    const ledger = await applyLedger(conn, {
      userId,
      amount: -model.token_cost,
      type: 'spend',
      description: `Vẽ lại ảnh #${generationId} · ${model.label}`,
    });

    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO generations
         (user_id, batch_id, model_code, model_label, provider, provider_model, resolution,
          aspect_ratio, prompt, input_images, token_cost, api_cost_usd, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
      [
        userId,
        source.batch_id,
        model.code,
        model.label,
        model.provider,
        model.provider_model,
        model.resolution,
        source.aspect_ratio,
        prompt,
        JSON.stringify(inputImages),
        model.token_cost,
        model.api_cost_usd,
      ],
    );

    await conn.query('UPDATE token_transactions SET ref_type = ?, ref_id = ? WHERE id = ?', [
      'generation',
      result.insertId,
      ledger.ledgerId,
    ]);

    return { newId: result.insertId, balance: ledger.balanceAfter };
  });

  enqueue(newId);
  return { generationId: newId, tokenCost: model.token_cost, balance };
}

// ---------------------------------------------------------------------------
//  HÀNG ĐỢI XỬ LÝ
//  Giữ đơn giản: chạy trong tiến trình server, giới hạn số job song song.
//  Khi cần mở rộng nhiều máy chủ, thay khối này bằng BullMQ/Redis là đủ.
// ---------------------------------------------------------------------------

const pending: number[] = [];
let running = 0;

function enqueue(generationId: number): void {
  pending.push(generationId);
  drain();
}

function drain(): void {
  while (running < env.maxConcurrentJobs && pending.length > 0) {
    const id = pending.shift()!;
    running += 1;
    void runGeneration(id)
      .catch((error) => console.error(`[generation ${id}] lỗi ngoài dự kiến`, error))
      .finally(() => {
        running -= 1;
        drain();
      });
  }
}

export const queueStatus = () => ({ pending: pending.length, running });

function parseInputImages(row: GenerationRow): { reference: string | null; products: string[] } {
  const raw = row.input_images;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { reference: parsed?.reference ?? null, products: Array.isArray(parsed?.products) ? parsed.products : [] };
}

async function runGeneration(generationId: number): Promise<void> {
  const row = await queryOne<GenerationRow>('SELECT * FROM generations WHERE id = ?', [generationId]);
  if (!row || row.status !== 'queued') return;

  const startedAt = Date.now();
  await execute("UPDATE generations SET status = 'processing' WHERE id = ?", [generationId]);

  try {
    const inputImages = parseInputImages(row);
    const provider = getProvider(row.provider);

    const result = await provider.generate({
      providerModel: row.provider_model,
      prompt: row.prompt ?? '',
      referenceImage: inputImages.reference ? await readAsDataUri(inputImages.reference) : null,
      productImages: await Promise.all(inputImages.products.map((path) => readAsDataUri(path))),
      aspectRatio: row.aspect_ratio,
      resolution: row.resolution,
      onTaskCreated: async (taskId) => {
        await execute('UPDATE generations SET provider_task_id = ? WHERE id = ?', [taskId, generationId]);
      },
    });

    let resultPath: string | null = null;
    if (env.downloadResults) {
      try {
        resultPath = await downloadResult(result.url);
      } catch (error) {
        // Không tải về được thì vẫn giữ link gốc, khách vẫn xem được ảnh.
        console.warn(`[generation ${generationId}] không tải được ảnh về server:`, error);
      }
    }

    await execute(
      `UPDATE generations
          SET status = 'success', result_url = ?, result_path = ?, duration_ms = ?, completed_at = NOW()
        WHERE id = ?`,
      [result.url, resultPath, Date.now() - startedAt, generationId],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failAndRefund(row, message, Date.now() - startedAt);
  }
}

/** Đánh dấu thất bại và hoàn token cho khách. */
async function failAndRefund(row: GenerationRow, message: string, durationMs: number): Promise<void> {
  try {
    await withTransaction(async (conn) => {
      // Khoá dòng generation để hai luồng không cùng hoàn tiền một job.
      const [current] = await conn.query<GenerationRow[]>('SELECT status FROM generations WHERE id = ? FOR UPDATE', [
        row.id,
      ]);
      if (current[0]?.status === 'refunded') return;

      await conn.query(
        `UPDATE generations
            SET status = 'refunded', error_message = ?, duration_ms = ?, completed_at = NOW()
          WHERE id = ?`,
        [message.slice(0, 1000), durationMs, row.id],
      );

      await applyLedger(conn, {
        userId: row.user_id,
        amount: row.token_cost,
        type: 'refund',
        refType: 'generation',
        refId: row.id,
        description: `Hoàn token do tạo ảnh #${row.id} thất bại`,
      });
    });
  } catch (refundError) {
    console.error(`[generation ${row.id}] hoàn token thất bại`, refundError);
    await execute(`UPDATE generations SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`, [
      message.slice(0, 1000),
      row.id,
    ]);
  }
}

/**
 * Sau khi server restart, các job đang dở dang sẽ không bao giờ chạy tiếp.
 * Hoàn token cho chúng để khách không bị treo tiền.
 */
export async function recoverStaleGenerations(): Promise<void> {
  const stale = await query<GenerationRow>(
    `SELECT * FROM generations WHERE status IN ('queued','processing') ORDER BY id`,
  );
  for (const row of stale) {
    await failAndRefund(row, 'Máy chủ khởi động lại khi ảnh đang xử lý — token đã được hoàn.', 0);
  }
  if (stale.length > 0) {
    console.log(`[khởi động] Đã hoàn token cho ${stale.length} ảnh còn dở dang.`);
  }
}

/** Chuẩn hoá dữ liệu trả về cho client. */
export function serializeGeneration(row: GenerationRow) {
  const inputImages = parseInputImages(row);
  return {
    id: row.id,
    batchId: row.batch_id,
    modelCode: row.model_code,
    modelLabel: row.model_label,
    resolution: row.resolution,
    aspectRatio: row.aspect_ratio,
    prompt: row.prompt,
    tokenCost: row.token_cost,
    status: row.status,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    // Ưu tiên file trên server; link nhà cung cấp chỉ dùng khi tải về thất bại.
    imageUrl: toPublicUrl(row.result_path) ?? row.result_url,
    referenceUrl: toPublicUrl(inputImages.reference),
    productUrls: inputImages.products.map((path) => toPublicUrl(path)).filter((url): url is string => Boolean(url)),
  };
}
