import { badRequest } from './errors.js';

type Body = Record<string, unknown>;

export function requireString(body: Body, field: string, opts: { min?: number; max?: number; label?: string } = {}): string {
  const label = opts.label ?? field;
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') throw badRequest(`Thiếu thông tin: ${label}.`);

  const trimmed = value.trim();
  if (opts.min && trimmed.length < opts.min) throw badRequest(`${label} phải có ít nhất ${opts.min} ký tự.`);
  if (opts.max && trimmed.length > opts.max) throw badRequest(`${label} không được dài quá ${opts.max} ký tự.`);
  return trimmed;
}

export function optionalString(body: Body, field: string, max = 190): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw badRequest(`Trường ${field} phải là chuỗi.`);
  return value.trim().slice(0, max);
}

export function requireInt(body: Body, field: string, opts: { min?: number; max?: number; label?: string } = {}): number {
  const label = opts.label ?? field;
  const value = Number(body[field]);
  if (!Number.isFinite(value) || !Number.isInteger(value)) throw badRequest(`${label} phải là số nguyên.`);
  if (opts.min !== undefined && value < opts.min) throw badRequest(`${label} phải lớn hơn hoặc bằng ${opts.min}.`);
  if (opts.max !== undefined && value > opts.max) throw badRequest(`${label} phải nhỏ hơn hoặc bằng ${opts.max}.`);
  return value;
}

export function requireStringArray(body: Body, field: string, opts: { max?: number; label?: string } = {}): string[] {
  const label = opts.label ?? field;
  const value = body[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw badRequest(`${label} phải là danh sách.`);
  if (opts.max && value.length > opts.max) throw badRequest(`${label} tối đa ${opts.max} phần tử.`);

  return value.map((item) => {
    if (typeof item !== 'string' || item.trim() === '') throw badRequest(`${label} chứa phần tử không hợp lệ.`);
    return item;
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function requireEmail(body: Body, field = 'email'): string {
  const value = requireString(body, field, { label: 'Email', max: 190 }).toLowerCase();
  if (!EMAIL_RE.test(value)) throw badRequest('Email không hợp lệ.');
  return value;
}

/** Đọc tham số phân trang từ query string. */
export function parsePaging(query: Record<string, unknown>, defaultLimit = 24, maxLimit = 100) {
  const limit = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), maxLimit);
  const page = Math.max(Number(query.page) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}
