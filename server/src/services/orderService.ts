import crypto from 'node:crypto';
import { execute, query, queryOne, withTransaction, type PoolConnection, type ResultSetHeader, type RowDataPacket } from '../db.js';
import { env } from '../env.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { applyLedger } from './tokenService.js';

export interface PackageRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  price_vnd: number;
  base_tokens: number;
  bonus_tokens: number;
  description: string | null;
  is_popular: number;
  is_active: number;
  sort_order: number;
}

export interface OrderRow extends RowDataPacket {
  id: number;
  code: string;
  user_id: number;
  package_id: number | null;
  package_code: string | null;
  package_name: string;
  amount_vnd: number;
  base_tokens: number;
  bonus_tokens: number;
  total_tokens: number;
  status: 'pending' | 'paid' | 'cancelled' | 'expired';
  payment_method: string;
  paid_source: string | null;
  payment_ref: string | null;
  paid_amount_vnd: number | null;
  paid_at: Date | null;
  approved_by: number | null;
  note: string | null;
  expires_at: Date | null;
  created_at: Date;
}

/** Bỏ các ký tự dễ nhìn nhầm (0/O, 1/I) để khách gõ nội dung chuyển khoản không sai. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return `${env.orderPrefix}${out}`;
}

/**
 * Dò tất cả mã đơn có thể có trong nội dung chuyển khoản.
 *
 * Ngân hàng hay chèn dấu cách và ký tự lạ nên phải bỏ hết ký tự không phải
 * chữ-số trước khi dò. Hệ quả: chữ đứng ngay sau mã có thể bị hút vào và tạo ra
 * một mã "trông đúng nhưng sai" (vd "NAP7K3Q2 thieu" → NAP7K3Q2T). Vì vậy hàm
 * này trả về danh sách ứng viên, còn `resolveOrderCode` mới là nơi quyết định —
 * chỉ mã thật sự tồn tại trong DB mới được dùng.
 */
export function extractOrderCodes(content: string): string[] {
  const normalized = content.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pattern = new RegExp(`${env.orderPrefix}[${CODE_ALPHABET}]{6}`, 'g');
  return [...new Set(normalized.match(pattern) ?? [])];
}

/**
 * Chọn ra mã đơn thật trong số các ứng viên.
 * Ưu tiên đơn đang chờ thanh toán; nếu không có thì lấy đơn bất kỳ đang tồn tại
 * (để webhook ghi nhận được là "đơn này đã thanh toán rồi" thay vì "không khớp").
 */
export async function resolveOrderCode(candidates: string[]): Promise<string | null> {
  if (candidates.length === 0) return null;

  const placeholders = candidates.map(() => '?').join(',');
  const rows = await query<RowDataPacket & { code: string; status: OrderRow['status'] }>(
    `SELECT code, status FROM orders WHERE code IN (${placeholders})
      ORDER BY (status = 'pending') DESC, (status = 'expired') DESC, id DESC LIMIT 1`,
    candidates,
  );
  return rows[0]?.code ?? null;
}

/** Link ảnh QR VietQR đã điền sẵn số tiền và nội dung chuyển khoản. */
export function buildVietQrUrl(order: Pick<OrderRow, 'code' | 'amount_vnd'>): string | null {
  if (!env.bank.code || !env.bank.accountNumber) return null;

  const params = new URLSearchParams({
    amount: String(order.amount_vnd),
    addInfo: order.code,
    accountName: env.bank.accountName,
  });
  return `https://img.vietqr.io/image/${env.bank.code}-${env.bank.accountNumber}-compact2.png?${params.toString()}`;
}

export const bankInfo = () => ({
  bankCode: env.bank.code,
  bankName: env.bank.bankName || env.bank.code,
  accountNumber: env.bank.accountNumber,
  accountName: env.bank.accountName,
  configured: Boolean(env.bank.accountNumber),
});

export async function listActivePackages(): Promise<PackageRow[]> {
  return query<PackageRow>('SELECT * FROM token_packages WHERE is_active = 1 ORDER BY sort_order, price_vnd');
}

/** Tạo đơn nạp ở trạng thái chờ chuyển khoản. */
export async function createOrder(userId: number, packageId: number): Promise<OrderRow> {
  const pkg = await queryOne<PackageRow>('SELECT * FROM token_packages WHERE id = ? AND is_active = 1', [packageId]);
  if (!pkg) throw badRequest('Gói nạp không tồn tại hoặc đã ngừng bán.');

  const pending = await queryOne<RowDataPacket & { total: number }>(
    `SELECT COUNT(*) AS total FROM orders WHERE user_id = ? AND status = 'pending'`,
    [userId],
  );
  if ((pending?.total ?? 0) >= 5) {
    throw conflict('Bạn đang có quá nhiều đơn chờ thanh toán. Vui lòng hoàn tất hoặc huỷ bớt.', 'too_many_pending');
  }

  // Rất khó trùng, nhưng vẫn thử lại vài lần cho chắc.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    try {
      const result = await execute(
        `INSERT INTO orders
           (code, user_id, package_id, package_code, package_name, amount_vnd,
            base_tokens, bonus_tokens, total_tokens, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [
          code,
          userId,
          pkg.id,
          pkg.code,
          pkg.name,
          pkg.price_vnd,
          pkg.base_tokens,
          pkg.bonus_tokens,
          pkg.base_tokens + pkg.bonus_tokens,
          env.orderExpireMinutes,
        ],
      );
      const order = await queryOne<OrderRow>('SELECT * FROM orders WHERE id = ?', [result.insertId]);
      if (!order) throw new Error('Tạo đơn thất bại.');
      return order;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('ER_DUP_ENTRY')) throw error;
    }
  }

  throw new Error('Không sinh được mã đơn duy nhất, vui lòng thử lại.');
}

export interface MarkPaidInput {
  /** sepay | casso | manual */
  source: string;
  paymentRef?: string | null;
  paidAmountVnd?: number | null;
  approvedBy?: number | null;
  note?: string | null;
}

export type MarkPaidOutcome =
  | { ok: true; order: OrderRow; tokensCredited: number }
  | { ok: false; reason: 'already_paid' | 'not_pending' | 'amount_mismatch'; order: OrderRow; message: string };

/**
 * Xác nhận đơn đã thanh toán và cộng token.
 *
 * An toàn khi gọi lại nhiều lần: dòng đơn bị khoá FOR UPDATE và chỉ đơn ở trạng
 * thái `pending` mới được cộng token, nên webhook bắn trùng hay admin bấm duyệt
 * hai lần cũng không cộng token hai lần.
 */
export async function markOrderPaid(orderCode: string, input: MarkPaidInput): Promise<MarkPaidOutcome> {
  return withTransaction(async (conn: PoolConnection) => {
    const [rows] = await conn.query<OrderRow[]>('SELECT * FROM orders WHERE code = ? FOR UPDATE', [orderCode]);
    const order = rows[0];
    if (!order) throw notFound(`Không tìm thấy đơn ${orderCode}.`);

    if (order.status === 'paid') {
      return { ok: false, reason: 'already_paid', order, message: `Đơn ${orderCode} đã được thanh toán trước đó.` };
    }
    // Đơn hết hạn vẫn được cộng token: khách chuyển tiền muộn thì tiền vẫn về tài khoản,
    // từ chối ở đây sẽ thành thu tiền mà không giao hàng. Chỉ đơn bị huỷ mới bị chặn.
    if (order.status !== 'pending' && order.status !== 'expired') {
      return {
        ok: false,
        reason: 'not_pending',
        order,
        message: `Đơn ${orderCode} đang ở trạng thái "${order.status}", không thể xác nhận.`,
      };
    }

    // Chuyển thiếu tiền thì không tự cộng token — để admin xử lý tay.
    const paidAmount = input.paidAmountVnd ?? order.amount_vnd;
    if (input.source !== 'manual' && paidAmount < order.amount_vnd) {
      return {
        ok: false,
        reason: 'amount_mismatch',
        order,
        message: `Số tiền nhận được (${paidAmount.toLocaleString('vi-VN')}đ) nhỏ hơn giá trị đơn (${order.amount_vnd.toLocaleString('vi-VN')}đ).`,
      };
    }

    await conn.query(
      `UPDATE orders
          SET status = 'paid', paid_source = ?, payment_ref = ?, paid_amount_vnd = ?,
              paid_at = NOW(), approved_by = ?, note = COALESCE(?, note)
        WHERE id = ?`,
      [input.source, input.paymentRef ?? null, paidAmount, input.approvedBy ?? null, input.note ?? null, order.id],
    );

    await applyLedger(conn, {
      userId: order.user_id,
      amount: order.total_tokens,
      type: 'topup',
      refType: 'order',
      refId: order.id,
      description: `Nạp gói ${order.package_name} · đơn ${order.code}`,
      createdBy: input.approvedBy ?? null,
    });

    await conn.query('UPDATE users SET total_topup_vnd = total_topup_vnd + ? WHERE id = ?', [
      order.amount_vnd,
      order.user_id,
    ]);

    const [updated] = await conn.query<OrderRow[]>('SELECT * FROM orders WHERE id = ?', [order.id]);
    return { ok: true, order: updated[0], tokensCredited: order.total_tokens };
  });
}

export async function cancelOrder(userId: number, orderId: number): Promise<void> {
  const result = await execute(`UPDATE orders SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'`, [
    orderId,
    userId,
  ]);
  if (result.affectedRows === 0) throw badRequest('Chỉ huỷ được đơn đang chờ thanh toán.');
}

/** Đánh dấu hết hạn cho các đơn quá thời gian mà chưa thanh toán. */
export async function expireStaleOrders(): Promise<number> {
  const result: ResultSetHeader = await execute(
    `UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()`,
  );
  return result.affectedRows;
}

export function serializeOrder(order: OrderRow) {
  return {
    id: order.id,
    code: order.code,
    packageName: order.package_name,
    amountVnd: order.amount_vnd,
    baseTokens: order.base_tokens,
    bonusTokens: order.bonus_tokens,
    totalTokens: order.total_tokens,
    status: order.status,
    paidSource: order.paid_source,
    paymentRef: order.payment_ref,
    paidAt: order.paid_at,
    expiresAt: order.expires_at,
    createdAt: order.created_at,
    note: order.note,
    // Đơn quá hạn vẫn giữ mã QR: khách chuyển muộn thì webhook vẫn cộng token được.
    qrUrl: order.status === 'pending' || order.status === 'expired' ? buildVietQrUrl(order) : null,
    transferContent: order.code,
  };
}
