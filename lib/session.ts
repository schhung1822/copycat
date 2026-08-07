/**
 * Định danh riêng cho từng tab trình duyệt.
 *
 * Khách hay mở vài tab để chạy song song mấy bộ ảnh khác nhau — tab này áo, tab
 * kia giày, mỗi tab một ảnh mẫu và một mô tả riêng. Các tab phải hoàn toàn độc
 * lập: không tab nào được ghi đè cấu hình của tab khác, và tải lại trang thì mỗi
 * tab chỉ nạp lại đúng những ảnh do chính nó tạo.
 *
 * Chìa khoá là `sessionStorage`: khác `localStorage` ở chỗ MỖI TAB có một kho
 * riêng, và kho đó sống qua các lần tải lại trang nhưng mất khi đóng tab. Đúng
 * bằng vòng đời của "phiên làm việc trong một tab".
 */

const STORAGE_KEY = 'copycat-tab-session';

/**
 * Id dự phòng khi trình duyệt chặn sessionStorage (chế độ riêng tư, chặn cookie
 * bên thứ ba...). Giữ ở cấp module nên trong một lần tải trang mọi lời gọi vẫn
 * trả về cùng một giá trị; đổi lại, tải lại trang sẽ sinh id mới và tab mất dấu
 * các ảnh đang chạy — chấp nhận được, vì đây đã là trường hợp hiếm.
 */
let inMemoryId: string | null = null;

/** `crypto.randomUUID` chỉ có ở ngữ cảnh bảo mật (https / localhost). */
const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export function getTabSessionId(): string {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const id = newId();
    sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    if (!inMemoryId) inMemoryId = newId();
    return inMemoryId;
  }
}

/**
 * Đọc/ghi cấu hình bàn làm việc của riêng tab hiện tại.
 *
 * Ghi vào cả hai kho, mỗi kho một vai:
 *   - `sessionStorage` giữ trạng thái SỐNG của tab này. Nhờ vậy hai tab chỉnh
 *     cấu hình khác nhau không giẫm lên nhau, và F5 thì tab nào về đúng tab nấy.
 *   - `localStorage` chỉ giữ "lần dùng gần nhất" để TAB MỚI mở ra không phải
 *     chọn lại từ đầu. Các tab có ghi đè giá trị này của nhau cũng vô hại, vì nó
 *     chỉ được đọc đúng một lần lúc mở tab mới.
 */
export function readTabSettings<T>(key: string): Partial<T> {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const raw = store.getItem(key);
      if (raw) return JSON.parse(raw) as Partial<T>;
    } catch {
      /* kho bị chặn hoặc dữ liệu hỏng — thử kho tiếp theo */
    }
  }
  return {};
}

export function writeTabSettings(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  for (const store of [sessionStorage, localStorage]) {
    try {
      store.setItem(key, raw);
    } catch {
      /* trình duyệt chặn — bỏ qua, cấu hình vẫn đúng trong phiên hiện tại */
    }
  }
}
