import type { PoolConnection, ResultSetHeader, RowDataPacket } from '../db.js';
import { withTransaction } from '../db.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';

export type LedgerType = 'topup' | 'spend' | 'refund' | 'adjust';

interface LedgerInput {
  userId: number;
  /** Dương = cộng token, âm = trừ token. */
  amount: number;
  type: LedgerType;
  refType?: 'order' | 'generation' | null;
  refId?: number | null;
  description?: string | null;
  createdBy?: number | null;
}

/**
 * Ghi một biến động token vào sổ cái và cập nhật số dư trong cùng transaction.
 *
 * Bắt buộc gọi bên trong một transaction đang mở (`conn`): dòng users được khoá
 * bằng SELECT ... FOR UPDATE nên hai request tạo ảnh song song không thể cùng
 * đọc một số dư cũ rồi trừ đè lên nhau.
 */
export interface LedgerResult {
  balanceAfter: number;
  ledgerId: number;
}

export async function applyLedger(conn: PoolConnection, input: LedgerInput): Promise<LedgerResult> {
  const { userId, amount, type, refType = null, refId = null, description = null, createdBy = null } = input;

  if (!Number.isInteger(amount) || amount === 0) {
    throw badRequest('Số token không hợp lệ.');
  }

  const [rows] = await conn.query<(RowDataPacket & { token_balance: number })[]>(
    'SELECT token_balance FROM users WHERE id = ? FOR UPDATE',
    [userId],
  );
  const current = rows[0];
  if (!current) throw notFound('Không tìm thấy tài khoản.');

  const balanceAfter = current.token_balance + amount;
  if (balanceAfter < 0) {
    throw new AppError(
      402,
      `Không đủ token. Số dư hiện tại ${current.token_balance}, cần ${Math.abs(amount)}.`,
      'insufficient_tokens',
      { balance: current.token_balance, required: Math.abs(amount) },
    );
  }

  // Hoàn token là đảo ngược một lần chi, nên trừ ngược vào total_tokens_out
  // thay vì cộng vào total_tokens_in — nếu không, thống kê "đã sử dụng" và
  // "đã nhận" đều bị thổi phồng mỗi lần có ảnh lỗi.
  const tokensIn = amount > 0 && type !== 'refund' ? amount : 0;
  const tokensOut = amount < 0 ? -amount : type === 'refund' ? -amount : 0;

  await conn.query(
    `UPDATE users
        SET token_balance = ?,
            total_tokens_in  = total_tokens_in  + ?,
            total_tokens_out = GREATEST(total_tokens_out + ?, 0)
      WHERE id = ?`,
    [balanceAfter, tokensIn, tokensOut, userId],
  );

  const [inserted] = await conn.query<ResultSetHeader>(
    `INSERT INTO token_transactions
       (user_id, type, amount, balance_after, ref_type, ref_id, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, amount, balanceAfter, refType, refId, description, createdBy],
  );

  return { balanceAfter, ledgerId: inserted.insertId };
}

/** Tiện ích khi chỉ cần một thao tác token đơn lẻ, tự mở transaction. */
export const applyLedgerStandalone = (input: LedgerInput): Promise<LedgerResult> =>
  withTransaction((conn) => applyLedger(conn, input));

export interface LedgerRow extends RowDataPacket {
  id: number;
  type: LedgerType;
  amount: number;
  balance_after: number;
  ref_type: string | null;
  ref_id: number | null;
  description: string | null;
  created_at: Date;
}
