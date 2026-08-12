/**
 * Sao chép văn bản vào bộ nhớ tạm — chạy được cả trên HTTP thuần.
 *
 * `navigator.clipboard` chỉ tồn tại ở **ngữ cảnh bảo mật** (https hoặc
 * localhost). Site chạy HTTP thuần — trường hợp hoàn toàn bình thường trước khi
 * cài SSL, xem mục 1b của README — thì cả đối tượng đó là `undefined`, gọi vào
 * là ném `TypeError` ngay. Chỉ bắt lỗi rồi im lặng là nút bấm trông như hỏng.
 *
 * Vì vậy luôn có đường lui bằng `document.execCommand('copy')`: đã bị đánh dấu
 * lỗi thời nhưng vẫn là cách duy nhất còn chạy trên HTTP, và mọi trình duyệt còn
 * dùng ngày nay đều hỗ trợ.
 */

/**
 * Đường lui: bôi đen một ô nhập rồi ra lệnh chép.
 *
 * `target` là ô đang hiển thị sẵn văn bản (nếu có) — dùng lại nó thì khách nhìn
 * thấy đoạn chữ được bôi đen, và khi cả cách này cũng thất bại thì họ chỉ việc
 * bấm Ctrl+C. Không có ô nào thì dựng tạm một `<textarea>` ẩn.
 */
function legacyCopy(text: string, target?: HTMLInputElement | HTMLTextAreaElement | null): boolean {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  let temporary: HTMLTextAreaElement | null = null;

  if (!target) {
    temporary = document.createElement('textarea');
    temporary.value = text;
    temporary.setAttribute('readonly', '');
    // Phải nằm trong tài liệu và KHÔNG bị `display:none` thì mới bôi đen được.
    // Cố định ở góc trên bên trái để trang không bị cuộn giật khi focus vào nó.
    temporary.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;';
    document.body.appendChild(temporary);
  }

  const field = target ?? temporary!;

  try {
    field.focus({ preventScroll: true });
    field.select();
    // Safari trên iOS bỏ qua `select()` với ô chỉ đọc, phải chỉ rõ khoảng chọn.
    field.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    if (temporary) {
      temporary.remove();
      // Chỉ trả lại tiêu điểm khi vừa dựng ô tạm. Nếu dùng ô có sẵn trên trang
      // thì cố ý GIỮ NGUYÊN vùng bôi đen: đó chính là thứ cứu vãn tình huống
      // chép hỏng — khách bấm Ctrl+C là xong.
      previouslyFocused?.focus?.();
    }
  }
}

/** Trả về true nếu đã chép được. */
export async function copyText(
  text: string,
  target?: HTMLInputElement | HTMLTextAreaElement | null,
): Promise<boolean> {
  try {
    // `?.` chứ không phải `try` không: trên HTTP thuần thì `navigator.clipboard`
    // là undefined chứ không phải một hàm ném lỗi.
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* trình duyệt từ chối quyền hoặc tab không có tiêu điểm — thử cách cũ */
  }

  return legacyCopy(text, target);
}
