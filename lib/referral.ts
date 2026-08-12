/**
 * Ghi nhớ mã giới thiệu từ link `…/?ref=MÃ`.
 *
 * Khách bấm link của cộng tác viên thường KHÔNG đăng ký ngay: họ đọc trang giới
 * thiệu, xem bảng giá, đóng tab, vài hôm sau mới quay lại tạo tài khoản. Nếu chỉ
 * đọc `?ref=` đúng lúc bấm nút Đăng ký thì gần như mọi lượt giới thiệu đều mất
 * công — vì vậy mã được cất vào `localStorage` ngay khi khách đáp xuống trang,
 * và sống được `TTL_DAYS` ngày.
 *
 * Mã cũng được gỡ khỏi thanh địa chỉ sau khi cất: để nguyên thì khách copy link
 * đang xem gửi cho bạn bè, và lượt giới thiệu đó bị tính cho nhầm người.
 */

const STORAGE_KEY = 'copycat_referral';

/** Link giới thiệu còn hiệu lực bao lâu kể từ lần bấm gần nhất. */
const TTL_DAYS = 60;

interface StoredReferral {
  code: string;
  savedAt: number;
}

/** Mã do server sinh chỉ gồm chữ in hoa và số — chặn luôn mọi thứ khác. */
const CODE_RE = /^[A-Z0-9]{4,32}$/;

const normalize = (raw: string | null): string | null => {
  const code = raw?.trim().toUpperCase() ?? '';
  return CODE_RE.test(code) ? code : null;
};

/**
 * Đọc `?ref=` trên URL hiện tại, cất lại rồi xoá tham số khỏi thanh địa chỉ.
 * Gọi một lần lúc khởi động ứng dụng.
 */
export function captureReferralFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    const code = normalize(url.searchParams.get('ref'));
    if (!code) return;

    const payload: StoredReferral = { code, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

    // `replaceState` chứ không phải điều hướng: không thêm mục vào lịch sử và
    // không làm React Router tải lại trang đang hiển thị.
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* trình duyệt chặn localStorage — lượt giới thiệu này không ghi nhận được */
  }
}

/** Mã còn hiệu lực để gửi kèm khi đăng ký, hoặc null nếu không có / đã quá hạn. */
export function getStoredReferral(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredReferral>;
    const code = normalize(parsed.code ?? null);
    if (!code) return null;

    const age = Date.now() - Number(parsed.savedAt ?? 0);
    if (!Number.isFinite(age) || age > TTL_DAYS * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

/**
 * Xoá mã sau khi đã đăng ký xong.
 *
 * Người giới thiệu đã được ghi nhận vào tài khoản ở phía server rồi; giữ lại mã
 * chỉ khiến tài khoản tiếp theo tạo trên cùng máy này bị gán nhầm cho họ.
 */
export function clearStoredReferral(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* không đọc được kho thì cũng không có gì để xoá */
  }
}
