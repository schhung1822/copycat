import type { Request } from 'express';
import { Router } from 'express';
import { execute } from '../db.js';
import { env } from '../env.js';
import { asyncHandler, unauthorized } from '../lib/errors.js';
import { extractOrderCodes, markOrderPaid, resolveOrderCode } from '../services/orderService.js';

export const webhookRouter = Router();

/** Một giao dịch ngân hàng đã được chuẩn hoá từ payload của cổng thanh toán. */
interface BankTransaction {
  externalId: string;
  amountVnd: number;
  content: string;
  reference: string | null;
  /** true nếu là tiền vào tài khoản */
  incoming: boolean;
}

async function handleTransactions(provider: string, transactions: BankTransaction[], raw: unknown) {
  const results: { externalId: string; status: string; message: string }[] = [];

  for (const tx of transactions) {
    if (!tx.incoming || tx.amountVnd <= 0) {
      results.push({ externalId: tx.externalId, status: 'skipped', message: 'Không phải giao dịch tiền vào.' });
      continue;
    }

    // Chỉ nhận mã thật sự có trong DB — tránh cộng nhầm cho một mã "trông giống"
    // sinh ra do chữ dính liền mã trong nội dung chuyển khoản.
    const orderCode = await resolveOrderCode(extractOrderCodes(tx.content));

    // Khoá chống trùng: cặp (provider, external_id) là UNIQUE nên webhook bắn lại
    // cùng một giao dịch sẽ không chèn được dòng mới và bị bỏ qua.
    const inserted = await execute(
      `INSERT IGNORE INTO payment_events (provider, external_id, order_code, amount_vnd, content, status, raw_payload)
       VALUES (?, ?, ?, ?, ?, 'unmatched', ?)`,
      [provider, tx.externalId, orderCode, tx.amountVnd, tx.content.slice(0, 500), JSON.stringify(raw)],
    );

    if (inserted.affectedRows === 0) {
      results.push({ externalId: tx.externalId, status: 'duplicate', message: 'Giao dịch đã xử lý trước đó.' });
      continue;
    }
    const eventId = inserted.insertId;

    if (!orderCode) {
      const message = 'Nội dung chuyển khoản không chứa mã đơn hợp lệ — cần quản trị viên duyệt tay.';
      await execute('UPDATE payment_events SET status = ?, message = ? WHERE id = ?', ['unmatched', message, eventId]);
      results.push({ externalId: tx.externalId, status: 'unmatched', message });
      continue;
    }

    try {
      const outcome = await markOrderPaid(orderCode, {
        source: provider,
        paymentRef: tx.reference ?? tx.externalId,
        paidAmountVnd: tx.amountVnd,
      });

      if (outcome.ok) {
        const message = `Đã cộng ${outcome.tokensCredited} token cho đơn ${orderCode}.`;
        await execute('UPDATE payment_events SET status = ?, message = ?, order_id = ? WHERE id = ?', [
          'matched',
          message,
          outcome.order.id,
          eventId,
        ]);
        results.push({ externalId: tx.externalId, status: 'matched', message });
      } else {
        const status = outcome.reason === 'already_paid' ? 'duplicate' : 'error';
        await execute('UPDATE payment_events SET status = ?, message = ?, order_id = ? WHERE id = ?', [
          status,
          outcome.message,
          outcome.order.id,
          eventId,
        ]);
        results.push({ externalId: tx.externalId, status, message: outcome.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await execute('UPDATE payment_events SET status = ?, message = ? WHERE id = ?', ['error', message, eventId]);
      results.push({ externalId: tx.externalId, status: 'error', message });
    }
  }

  return results;
}

/**
 * SePay — cấu hình webhook trỏ tới {APP_URL}/api/webhooks/sepay
 * và đặt API Key trùng với SEPAY_WEBHOOK_API_KEY trong .env.
 * SePay gửi header: Authorization: Apikey <key>
 */
webhookRouter.post(
  '/sepay',
  asyncHandler(async (req: Request, res) => {
    if (!env.sepayApiKey) throw unauthorized('Webhook SePay chưa được bật.');

    const header = req.headers.authorization ?? '';
    const provided = header.replace(/^Apikey\s+/i, '').replace(/^Bearer\s+/i, '').trim();
    if (provided !== env.sepayApiKey) throw unauthorized('Sai API key webhook.');

    const body = req.body ?? {};
    const transaction: BankTransaction = {
      externalId: String(body.id ?? body.referenceCode ?? `${Date.now()}`),
      amountVnd: Math.round(Number(body.transferAmount ?? 0)),
      content: String(body.content ?? body.description ?? ''),
      reference: body.referenceCode ? String(body.referenceCode) : null,
      incoming: String(body.transferType ?? 'in').toLowerCase() === 'in',
    };

    const results = await handleTransactions('sepay', [transaction], body);
    res.json({ success: true, results });
  }),
);

/**
 * Casso v2 — cấu hình webhook trỏ tới {APP_URL}/api/webhooks/casso
 * và đặt Secure Token trùng với CASSO_WEBHOOK_SECURE_TOKEN trong .env.
 * Casso gửi header: Secure-Token: <token>, payload { error: 0, data: [...] }
 */
webhookRouter.post(
  '/casso',
  asyncHandler(async (req: Request, res) => {
    if (!env.cassoSecureToken) throw unauthorized('Webhook Casso chưa được bật.');

    const provided = String(req.headers['secure-token'] ?? '').trim();
    if (provided !== env.cassoSecureToken) throw unauthorized('Sai secure token webhook.');

    const body = req.body ?? {};
    const items: any[] = Array.isArray(body.data) ? body.data : [];

    const transactions: BankTransaction[] = items.map((item) => ({
      externalId: String(item.id ?? item.tid ?? `${Date.now()}`),
      amountVnd: Math.round(Number(item.amount ?? 0)),
      content: String(item.description ?? ''),
      reference: item.tid ? String(item.tid) : null,
      // Casso chỉ gửi số dương cho tiền vào.
      incoming: Number(item.amount ?? 0) > 0,
    }));

    const results = await handleTransactions('casso', transactions, body);
    res.json({ success: true, results });
  }),
);
