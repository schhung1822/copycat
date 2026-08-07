const vnd = new Intl.NumberFormat('vi-VN');

export const formatVnd = (value: number | null | undefined): string => `${vnd.format(Math.round(Number(value) || 0))}đ`;

export const formatNumber = (value: number | null | undefined): string => vnd.format(Number(value) || 0);

export const formatTokens = (value: number | null | undefined): string => `${vnd.format(Number(value) || 0)} điểm`;

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/** Đếm ngược tới thời điểm hết hạn, dạng "12:34". */
export function countdown(expiresAt: string | Date | null | undefined, now = Date.now()): string | null {
  if (!expiresAt) return null;
  const target = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt.getTime();
  const remaining = target - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const STATUS_LABEL: Record<string, string> = {
  queued: 'Đang chờ',
  processing: 'Đang vẽ',
  success: 'Hoàn tất',
  failed: 'Lỗi',
  refunded: 'Lỗi · đã hoàn điểm',
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  cancelled: 'Đã huỷ',
  expired: 'Hết hạn',
  active: 'Đang hoạt động',
  banned: 'Đã khoá',
};

export const BUCKET_LABEL: Record<string, string> = {
  monthly: 'Hạn mức tháng',
  purchased: 'Điểm mua thêm',
};

export const TX_TYPE_LABEL: Record<string, string> = {
  topup: 'Nạp điểm',
  spend: 'Tạo ảnh',
  refund: 'Hoàn điểm',
  adjust: 'Điều chỉnh',
  grant: 'Cấp hạn mức tháng',
  expire: 'Hết hạn mức tháng',
};
