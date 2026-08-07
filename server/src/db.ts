import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.name,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4_unicode_ci',
      timezone: 'Z',
      dateStrings: false,
      supportBigNumbers: true,
      bigNumberStrings: false,
      // mysql2 trả DECIMAL về dạng string; ép sang number cho gọn phía ứng dụng.
      decimalNumbers: true,
    });

    // `timezone: 'Z'` chỉ nói cho mysql2 biết cách quy đổi Date của JS sang chuỗi
    // và ngược lại — nó KHÔNG đổi múi giờ của chính MySQL. Nếu không ép ở đây thì
    // NOW() / CURRENT_TIMESTAMP vẫn chạy theo giờ hệ điều hành, trong khi ngày giờ
    // do ứng dụng ghi lại là giờ UTC. Hai chuẩn lẫn lộn trong cùng một cột DATETIME
    // khiến `expires_at > NOW()` sai đúng bằng chênh lệch múi giờ — máy chủ đặt
    // UTC+7 thì gói hết hạn sớm 7 tiếng, và mọi mốc thời gian hiển thị lệch 7 tiếng.
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

/** SELECT trả về nhiều dòng. */
export async function query<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().query<T[]>(sql, params);
  return rows;
}

/** SELECT trả về 1 dòng (hoặc null). */
export async function queryOne<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** INSERT / UPDATE / DELETE. */
export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await getPool().query<ResultSetHeader>(sql, params);
  return result;
}

/**
 * Chạy một khối lệnh trong transaction. Tự rollback nếu callback ném lỗi.
 * Dùng cho mọi thao tác đụng tới số dư điểm.
 */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      /* bỏ qua lỗi rollback, ném lỗi gốc */
    }
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Thêm cột nếu bảng chưa có.
 *
 * `CREATE TABLE IF NOT EXISTS` trong schema.sql không đụng tới bảng đã tồn tại,
 * nên cài đặt cũ sẽ thiếu cột mới. MySQL 8 lại không hỗ trợ `ADD COLUMN IF NOT
 * EXISTS`, vì vậy phải tự tra information_schema.
 */
async function ensureColumn(
  conn: mysql.Connection,
  table: string,
  column: string,
  definition: string,
): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [env.db.name, table, column],
  );
  if (rows.length > 0) return false;

  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[migrate] Đã thêm cột ${table}.${column}`);
  return true;
}

/** Nâng cấp cấu trúc cho những cài đặt đã chạy từ phiên bản trước. */
async function applyMigrations(conn: mysql.Connection): Promise<void> {
  // Thuê bao tháng
  await ensureColumn(conn, 'users', 'subscription_expires_at', 'DATETIME NULL');
  await ensureColumn(conn, 'users', 'monthly_allowance', 'INT NOT NULL DEFAULT 0');
  await ensureColumn(conn, 'users', 'monthly_tokens', 'INT NOT NULL DEFAULT 0');
  await ensureColumn(conn, 'users', 'monthly_period_end', 'DATETIME NULL');

  // Đơn hàng phân loại thuê bao / điểm lẻ
  await ensureColumn(
    conn,
    'orders',
    'order_type',
    "ENUM('subscription','token_package') NOT NULL DEFAULT 'token_package'",
  );
  await ensureColumn(conn, 'orders', 'plan_id', 'INT UNSIGNED NULL');
  await ensureColumn(conn, 'orders', 'subscription_months', 'INT NULL');

  // Nâng gói: phần khấu trừ từ gói cũ
  await ensureColumn(conn, 'orders', 'credit_vnd', 'BIGINT NOT NULL DEFAULT 0');
  await ensureColumn(conn, 'orders', 'is_upgrade', 'TINYINT(1) NOT NULL DEFAULT 0');

  // Đánh dấu đơn đã được giao hàng (cộng điểm / kích hoạt gói).
  // Tách khỏi `status` để hệ thống ngoài chỉ cần đổi status = 'paid', phần giao
  // hàng do server tự làm — xem `fulfillPaidOrders`.
  const addedFulfilled = await ensureColumn(conn, 'orders', 'fulfilled_at', 'DATETIME NULL');
  if (addedFulfilled) {
    // Đơn đã thanh toán từ trước đều đã được xử lý bởi phiên bản cũ. Phải đánh
    // dấu ngay, nếu không bộ đối soát sẽ cộng điểm cho chúng lần thứ hai.
    const backfilled = await conn.query<ResultSetHeader>(
      `UPDATE orders SET fulfilled_at = COALESCE(paid_at, updated_at, created_at) WHERE status = 'paid'`,
    );
    console.log(`[migrate] Đã đánh dấu ${backfilled[0].affectedRows} đơn cũ là đã xử lý.`);
  }

  // Ảnh ghi rõ điểm lấy từ nguồn nào, để hoàn đúng nguồn khi lỗi
  await ensureColumn(conn, 'generations', 'monthly_cost', 'INT NOT NULL DEFAULT 0');
  await ensureColumn(conn, 'generations', 'purchased_cost', 'INT NOT NULL DEFAULT 0');

  // Vị trí của ảnh trong lô, để prompt dặn được bản thứ 2 trở đi. Ảnh cũ mặc
  // định 1/1 — đúng nghĩa "bản duy nhất", nên không cần backfill.
  await ensureColumn(conn, 'generations', 'variant_index', 'INT NOT NULL DEFAULT 1');
  await ensureColumn(conn, 'generations', 'variant_total', 'INT NOT NULL DEFAULT 1');

  // Tab trình duyệt đã tạo ảnh, để mỗi tab chỉ thấy việc của chính nó. Ảnh cũ để
  // NULL — chúng không thuộc tab nào nên không lọt vào danh sách của tab mới nào.
  await ensureColumn(conn, 'generations', 'client_session', 'VARCHAR(64) NULL');

  // Sổ cái tách hai nguồn điểm
  await ensureColumn(conn, 'token_transactions', 'bucket', "ENUM('monthly','purchased') NOT NULL DEFAULT 'purchased'");
  // MODIFY chạy lại vô hại, dùng để bổ sung giá trị enum mới.
  await conn.query(
    `ALTER TABLE token_transactions
       MODIFY COLUMN type ENUM('topup','spend','refund','adjust','grant','expire') NOT NULL`,
  );
}

/** Tạo database nếu chưa có, chạy schema.sql rồi nâng cấp cấu trúc cũ. */
export async function migrate(): Promise<void> {
  const bootstrap = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await bootstrap.changeUser({ database: env.db.name });

    const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    await bootstrap.query(schema);
    await applyMigrations(bootstrap);
  } finally {
    await bootstrap.end();
  }
}

/** Kiểm tra kết nối, ném lỗi có hướng dẫn nếu không nối được. */
export async function assertConnection(): Promise<void> {
  try {
    await query('SELECT 1 AS ok');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Không kết nối được MySQL tại ${env.db.host}:${env.db.port} (database "${env.db.name}").\n` +
        `Kiểm tra lại DB_HOST / DB_USER / DB_PASSWORD trong file .env và chắc chắn MySQL/MariaDB đang chạy.\n` +
        `Chi tiết: ${message}`,
    );
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export type { RowDataPacket, ResultSetHeader, PoolConnection };
