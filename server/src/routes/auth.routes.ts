import { Router } from 'express';
import { execute, queryOne, type RowDataPacket } from '../db.js';
import { env } from '../env.js';
import {
  AUTH_COOKIE,
  hashPassword,
  isAdminEmail,
  requireAuth,
  signToken,
  verifyPassword,
  type AuthUser,
} from '../lib/auth.js';
import { asyncHandler, conflict, forbidden, unauthorized } from '../lib/errors.js';
import { optionalString, requireEmail, requireString } from '../lib/validate.js';
import { readAccountState, type AccountState } from '../services/subscriptionService.js';

export const authRouter = Router();

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProd,
  maxAge: COOKIE_MAX_AGE_MS,
  path: '/',
};

type PublicUser = AuthUser & { state: AccountState };

const publicUser = (user: PublicUser) => ({
  id: user.id,
  email: user.email,
  fullName: user.full_name,
  phone: user.phone,
  role: user.role,
  createdAt: user.created_at,

  // Thuê bao và hạn mức — giao diện dựa vào đây để mở/khoá chức năng tạo ảnh.
  isSubscribed: user.state.isSubscribed,
  subscriptionExpiresAt: user.state.subscriptionExpiresAt,
  monthlyAllowance: user.state.monthlyAllowance,
  monthlyTokens: user.state.monthlyTokens,
  monthlyPeriodEnd: user.state.monthlyPeriodEnd,
  purchasedTokens: user.state.purchasedTokens,
  tokenBalance: user.state.availableTokens,
});

async function loadPublicUser(userId: number): Promise<PublicUser> {
  const user = await queryOne<AuthUser>(
    `SELECT id, email, full_name, phone, role, status, token_balance, created_at FROM users WHERE id = ?`,
    [userId],
  );
  if (!user) throw unauthorized();
  user.role = isAdminEmail(user.email) ? 'admin' : 'user';
  return Object.assign(user, { state: await readAccountState(userId) });
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const email = requireEmail(req.body);
    const password = requireString(req.body, 'password', { label: 'Mật khẩu', min: 6, max: 100 });
    const fullName = optionalString(req.body, 'fullName');
    const phone = optionalString(req.body, 'phone', 32);

    const existing = await queryOne<RowDataPacket & { id: number }>('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) throw conflict('Email này đã được đăng ký.', 'email_taken');

    const role = isAdminEmail(email) ? 'admin' : 'user';
    const freeTokens = Number(
      (await queryOne<RowDataPacket & { setting_value: string }>(
        "SELECT setting_value FROM settings WHERE setting_key = 'free_tokens_on_signup'",
      ))?.setting_value ?? 0,
    );

    const result = await execute(
      'INSERT INTO users (email, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, ?)',
      [email, await hashPassword(password), fullName, phone, role],
    );

    // Token tặng khi đăng ký (mặc định 0, admin bật trong bảng settings).
    if (Number.isFinite(freeTokens) && freeTokens > 0) {
      const { creditPurchasedStandalone } = await import('../services/tokenService.js');
      await creditPurchasedStandalone({
        userId: result.insertId,
        amount: Math.trunc(freeTokens),
        type: 'adjust',
        description: 'Token tặng khi đăng ký tài khoản',
      });
    }

    const user = await loadPublicUser(result.insertId);
    const token = signToken(user.id);
    res.cookie(AUTH_COOKIE, token, cookieOptions);
    res.status(201).json({ user: publicUser(user), token });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = requireEmail(req.body);
    const password = requireString(req.body, 'password', { label: 'Mật khẩu' });

    const row = await queryOne<AuthUser & { password_hash: string }>('SELECT * FROM users WHERE email = ?', [email]);
    // Thông điệp giống nhau cho cả hai trường hợp để không lộ email nào đã tồn tại.
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw unauthorized('Email hoặc mật khẩu không đúng.');
    }
    if (row.status === 'banned') throw forbidden('Tài khoản của bạn đã bị khoá.');

    await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [row.id]);

    const user = await loadPublicUser(row.id);
    const token = signToken(user.id);
    res.cookie(AUTH_COOKIE, token, cookieOptions);
    res.json({ user: publicUser(user), token });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(await loadPublicUser(req.user!.id)) });
  }),
);

authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const fullName = optionalString(req.body, 'fullName');
    const phone = optionalString(req.body, 'phone', 32);

    await execute('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [fullName, phone, req.user!.id]);
    res.json({ user: publicUser(await loadPublicUser(req.user!.id)) });
  }),
);

authRouter.post(
  '/me/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const currentPassword = requireString(req.body, 'currentPassword', { label: 'Mật khẩu hiện tại' });
    const newPassword = requireString(req.body, 'newPassword', { label: 'Mật khẩu mới', min: 6, max: 100 });

    const row = await queryOne<RowDataPacket & { password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = ?',
      [req.user!.id],
    );
    if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
      throw unauthorized('Mật khẩu hiện tại không đúng.');
    }

    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(newPassword), req.user!.id]);
    res.json({ ok: true });
  }),
);
