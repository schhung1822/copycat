import crypto from 'node:crypto';
import { execute, query, queryOne, withTransaction, type PoolConnection, type ResultSetHeader, type RowDataPacket } from '../db.js';
import { env } from '../env.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { activateSubscription, type PlanRow } from './subscriptionService.js';
import { creditPurchasedTokens } from './tokenService.js';

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
  order_type: 'subscription' | 'token_package';
  plan_id: number | null;
  subscription_months: number | null;
  package_id: number | null;
  package_code: string | null;
  package_name: string;
  amount_vnd: number;
  credit_vnd: number;
  is_upgrade: number;
  base_tokens: number;
  bonus_tokens: number;
  total_tokens: number;
  status: 'pending' | 'paid' | 'cancelled' | 'expired';
  payment_method: string;
  paid_source: string | null;
  payment_ref: string | null;
  paid_amount_vnd: number | null;
  paid_at: Date | null;
  fulfilled_at: Date | null;
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

/**
 * Tạo đơn mua điểm ở trạng thái chờ chuyển khoản.
 *
 * Đây là loại đơn DUY NHẤT khách còn tạo được — gói tháng đã ngừng bán. Đơn
 * `subscription` chỉ còn tồn tại ở dạng dữ liệu cũ; xem `fulfillOrder`.
 */
export async function createOrder(userId: number, packageId: number): Promise<OrderRow> {
  const pkg = await queryOne<PackageRow>('SELECT * FROM token_packages WHERE id = ? AND is_active = 1', [packageId]);
  if (!pkg) throw badRequest('Gói điểm không tồn tại hoặc đã ngừng bán.');

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
           (code, user_id, order_type, package_id, package_code,
            package_name, amount_vnd, base_tokens, bonus_tokens, total_tokens, expires_at)
         VALUES (?, ?, 'token_package', ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
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
  | { ok: true; order: OrderRow; tokensCredited: number; subscriptionExpiresAt: Date | null }
  | { ok: false; reason: 'already_paid' | 'not_pending' | 'amount_mismatch'; order: OrderRow; message: string };

/**
 * Xác nhận đơn đã thanh toán và cộng điểm.
 *
 * An toàn khi gọi lại nhiều lần: dòng đơn bị khoá FOR UPDATE và chỉ đơn ở trạng
 * thái `pending` mới được cộng điểm, nên webhook bắn trùng hay admin bấm duyệt
 * hai lần cũng không cộng điểm hai lần.
 */
export async function markOrderPaid(orderCode: string, input: MarkPaidInput): Promise<MarkPaidOutcome> {
  return withTransaction(async (conn: PoolConnection) => {
    const [rows] = await conn.query<OrderRow[]>('SELECT * FROM orders WHERE code = ? FOR UPDATE', [orderCode]);
    const order = rows[0];
    if (!order) throw notFound(`Không tìm thấy đơn ${orderCode}.`);

    if (order.status === 'paid') {
      return { ok: false, reason: 'already_paid', order, message: `Đơn ${orderCode} đã được thanh toán trước đó.` };
    }
    // Đơn hết hạn vẫn được cộng điểm: khách chuyển tiền muộn thì tiền vẫn về tài khoản,
    // từ chối ở đây sẽ thành thu tiền mà không giao hàng. Chỉ đơn bị huỷ mới bị chặn.
    if (order.status !== 'pending' && order.status !== 'expired') {
      return {
        ok: false,
        reason: 'not_pending',
        order,
        message: `Đơn ${orderCode} đang ở trạng thái "${order.status}", không thể xác nhận.`,
      };
    }

    // Chuyển thiếu tiền thì không tự cộng điểm — để admin xử lý tay.
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

    const { subscriptionExpiresAt } = await fulfillOrder(conn, order, input.approvedBy ?? null);

    const [updated] = await conn.query<OrderRow[]>('SELECT * FROM orders WHERE id = ?', [order.id]);
    return { ok: true, order: updated[0], tokensCredited: order.total_tokens, subscriptionExpiresAt };
  });
}

/**
 * "Giao hàng" cho một đơn đã thanh toán: cộng điểm vào ví khách.
 *
 * Tách riêng khỏi `markOrderPaid` để cả hai đường vào đều dùng chung một bản
 * nghiệp vụ: đường trong ứng dụng (webhook, admin duyệt) và đường đối soát cho
 * các đơn bị hệ thống ngoài đổi `status` thẳng trong database.
 *
 * NHÁNH `subscription` LÀ DÀNH CHO ĐƠN CŨ, không phải chức năng đang bán. Gói
 * tháng đã ngừng bán nhưng vẫn có thể còn đơn `pending` sinh ra trước đó mà
 * khách chuyển khoản muộn — từ chối giao là thu tiền mà không giao hàng. Chỉ
 * xoá nhánh này khi bảng `orders` không còn đơn subscription nào chưa giao.
 *
 * Bắt buộc gọi trong transaction đã khoá dòng đơn bằng FOR UPDATE.
 */
async function fulfillOrder(
  conn: PoolConnection,
  order: OrderRow,
  approvedBy: number | null,
): Promise<{ subscriptionExpiresAt: Date | null }> {
  let subscriptionExpiresAt: Date | null = null;

  if (order.order_type === 'subscription') {
    // Gói tháng không cộng điểm vào ví; hạn mức được cấp theo chu kỳ tháng.
    const [planRows] = await conn.query<PlanRow[]>('SELECT * FROM subscription_plans WHERE id = ?', [order.plan_id]);
    const plan = planRows[0];
    const activated = await activateSubscription(
      conn,
      order.user_id,
      {
        id: order.plan_id,
        code: order.package_code,
        // Tên gói sạch ("Gói 1 năm"), không lấy tên đơn ("Nâng lên Gói 1 năm").
        name: plan?.name ?? order.package_name,
        months: order.subscription_months ?? plan?.months ?? 1,
        /*
         * GIÁ NIÊM YẾT của gói, không phải số tiền khách trả.
         *
         * Với đơn nâng gói, amount_vnd đã bị trừ phần khấu trừ. Lưu số đã trừ vào
         * thuê bao sẽ làm hỏng hai thứ ở lần nâng sau: khách bị tính khấu trừ trên
         * giá thấp hơn thực tế, và gói cao nhất vẫn hiện ra như một lựa chọn để
         * "nâng lên chính nó" vì giá niêm yết luôn lớn hơn số đã trả.
         *
         * amount_vnd + credit_vnd = giá niêm yết (credit_vnd = 0 với đơn thường).
         */
        priceVnd: order.amount_vnd + order.credit_vnd,
        // Gói bị xoá khỏi bảng giá thì vẫn dùng được hạn mức mặc định 500.000.
        allowance: plan?.monthly_token_allowance ?? 500_000,
      },
      order.id,
      // Nâng gói: gói mới tính giờ từ bây giờ, không nối tiếp hạn cũ.
      { restart: Boolean(order.is_upgrade) },
    );
    subscriptionExpiresAt = activated.expiresAt;
  } else {
    await creditPurchasedTokens(conn, {
      userId: order.user_id,
      amount: order.total_tokens,
      type: 'topup',
      refType: 'order',
      refId: order.id,
      description: `Mua thêm điểm · gói ${order.package_name} · đơn ${order.code}`,
      createdBy: approvedBy,
    });
  }

  await conn.query('UPDATE users SET total_topup_vnd = total_topup_vnd + ? WHERE id = ?', [
    order.amount_vnd,
    order.user_id,
  ]);
  await conn.query('UPDATE orders SET fulfilled_at = NOW() WHERE id = ?', [order.id]);

  return { subscriptionExpiresAt };
}

/** Đảm bảo chỉ một lượt đối soát chạy tại một thời điểm. */
let reconciling = false;

/**
 * Quét các đơn đã `paid` nhưng chưa được giao hàng rồi xử lý chúng.
 *
 * Đây là đường vào cho hệ thống ngoài: workflow của bạn chỉ cần
 *
 *     UPDATE orders SET status = 'paid' WHERE code = 'NAPXXXXXX';
 *
 * là xong. Server sẽ tự phát hiện, kích hoạt gói hoặc cộng điểm, ghi sổ cái và
 * đánh dấu `fulfilled_at`. Không cần workflow biết gì về nghiệp vụ điểm.
 *
 * An toàn tuyệt đối với việc gọi trùng: mỗi đơn được khoá FOR UPDATE và chỉ xử lý
 * khi `fulfilled_at` vẫn còn NULL, nên chạy song song hay chạy lại đều không cộng
 * điểm hai lần.
 */
export async function fulfillPaidOrders(): Promise<number> {
  if (reconciling) return 0;
  reconciling = true;

  try {
    const pending = await query<OrderRow>(
      `SELECT id FROM orders WHERE status = 'paid' AND fulfilled_at IS NULL ORDER BY id LIMIT 200`,
    );

    let done = 0;
    for (const row of pending) {
      try {
        const processed = await withTransaction(async (conn) => {
          const [locked] = await conn.query<OrderRow[]>('SELECT * FROM orders WHERE id = ? FOR UPDATE', [row.id]);
          const order = locked[0];
          // Kiểm tra lại bên trong khoá: một tiến trình khác có thể vừa xử lý xong.
          if (!order || order.status !== 'paid' || order.fulfilled_at) return false;

          // Hệ thống ngoài thường chỉ đổi mỗi `status`, bù các trường còn thiếu để
          // báo cáo doanh thu theo ngày không bị sót đơn.
          await conn.query(
            `UPDATE orders
                SET paid_at = COALESCE(paid_at, NOW()),
                    paid_source = COALESCE(paid_source, 'external'),
                    paid_amount_vnd = COALESCE(paid_amount_vnd, amount_vnd)
              WHERE id = ?`,
            [order.id],
          );

          await fulfillOrder(conn, order, null);
          return true;
        });

        if (processed) {
          done += 1;
          console.log(`[đối soát] Đã xử lý đơn #${row.id} do hệ thống ngoài đánh dấu đã thanh toán.`);
        }
      } catch (error) {
        // Một đơn lỗi không được làm chết cả lượt quét.
        console.error(`[đối soát] Không xử lý được đơn #${row.id}:`, error);
      }
    }

    return done;
  } finally {
    reconciling = false;
  }
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
    orderType: order.order_type,
    subscriptionMonths: order.subscription_months,
    isUpgrade: Boolean(order.is_upgrade),
    creditVnd: order.credit_vnd,
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
    // Đơn quá hạn vẫn giữ mã QR: khách chuyển muộn thì webhook vẫn cộng điểm được.
    qrUrl: order.status === 'pending' || order.status === 'expired' ? buildVietQrUrl(order) : null,
    transferContent: order.code,
  };
}
