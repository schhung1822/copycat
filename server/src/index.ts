import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { assertConnection, closePool, migrate } from './db.js';
import { checkEnv, env, ROOT_DIR } from './env.js';
import { attachUser } from './lib/auth.js';
import { errorHandler } from './lib/errors.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';
import { generationRouter } from './routes/generation.routes.js';
import { orderRouter } from './routes/order.routes.js';
import { walletRouter } from './routes/wallet.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { seed } from './seed.js';
import { recoverStaleGenerations } from './services/generationService.js';
import { expireStaleOrders } from './services/orderService.js';
import { ensureStorage } from './services/storageService.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Ảnh gửi lên dưới dạng base64 nên body có thể khá lớn.
app.use(express.json({ limit: '40mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Webhook đứng trước attachUser: cổng thanh toán xác thực bằng header riêng.
app.use('/api/webhooks', webhookRouter);

app.use(attachUser);
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/orders', orderRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/generations', generationRouter);
app.use('/api/admin', adminRouter);

// Ảnh đầu vào và ảnh kết quả đã tải về server.
app.use(
  '/files',
  // fallthrough mặc định: ảnh không tồn tại rơi xuống handler 404 JSON ở cuối,
  // thay vì ném lỗi và bị ghi nhận nhầm thành lỗi hệ thống.
  express.static(env.storageDir, { maxAge: '30d', immutable: true }),
);

// Khi đã `npm run build`, server phục vụ luôn bản web tĩnh (chạy 1 tiến trình duy nhất).
const distDir = path.join(ROOT_DIR, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api|files).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: `Không tìm thấy đường dẫn ${req.method} ${req.path}`, code: 'not_found' });
});

app.use(errorHandler);

async function start(): Promise<void> {
  checkEnv();

  if (env.db.autoMigrate) {
    await migrate();
    console.log('[khởi động] Đã kiểm tra / tạo xong cấu trúc cơ sở dữ liệu.');
  }
  await assertConnection();
  await seed();
  await ensureStorage();
  await recoverStaleGenerations();

  // Dọn các đơn nạp quá hạn mỗi 5 phút.
  const cleanupTimer = setInterval(() => {
    void expireStaleOrders().catch((error) => console.error('[dọn đơn hết hạn]', error));
  }, 5 * 60 * 1000);
  cleanupTimer.unref();

  const server = app.listen(env.port, () => {
    console.log(`[khởi động] API đang chạy tại http://localhost:${env.port}`);
    if (!fs.existsSync(distDir)) {
      console.log('[khởi động] Chạy `npm run dev` ở terminal khác để mở giao diện tại http://localhost:3000');
    }
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[tắt] Nhận tín hiệu ${signal}, đang đóng kết nối...`);
    server.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('\n[khởi động thất bại]', error instanceof Error ? error.message : error);
  process.exit(1);
});
