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
 * Dùng cho mọi thao tác đụng tới số dư token.
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

/** Tạo database nếu chưa có rồi chạy schema.sql. */
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
