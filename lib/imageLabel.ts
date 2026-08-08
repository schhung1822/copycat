/**
 * Dán nhãn vai trò lên ảnh trước khi gửi đi tạo.
 *
 * VÌ SAO PHẢI LÀM. Prompt nói rõ "ảnh 1 là ảnh cần làm theo, ảnh 2 chứa sản
 * phẩm", nhưng model chỉ nhận được một mảng ảnh và phải tự đoán ảnh nào là ảnh
 * nào. Khi ảnh sản phẩm khách tải lên cũng là ảnh chụp có bối cảnh — người mẫu
 * mặc đồ, quần áo treo trong shop — hai đầu vào trông cùng thể loại và model
 * đoán sai: nó chép bối cảnh của ảnh sản phẩm rồi mặc lại đồ của ảnh mẫu.
 *
 * Đo trên một cặp ảnh thật đã gây lỗi (Nano Banana 2, có mô tả của khách):
 *
 *     ảnh thường            8 lần → 5 lần đảo vai (62,5%)
 *     dán nhãn cả hai ảnh  15 lần → 0 lần đảo vai
 *     dán nhãn mỗi ảnh SP   8 lần → 2 lần đảo vai (25%)
 *
 * Nên phải dán CẢ HAI. Dán mỗi ảnh sản phẩm không đủ: model vẫn cần biết chắc
 * ảnh còn lại là ảnh phải chép.
 *
 * Đổi tên file khi upload thì vô ích — model nhận pixel chứ không nhận tên file
 * hay URL.
 *
 * Việc này làm ở trình duyệt bằng canvas nên không cần thư viện xử lý ảnh nào.
 * Ảnh đã dán nhãn cũng chính là ảnh được lưu lại, nhờ vậy nút "Vẽ lại" dùng lại
 * đúng thứ model đã thấy lần đầu.
 */

/** Chiều cao thanh nhãn theo phần trăm chiều cao ảnh. */
const BAR_RATIO = 0.055;
const BAR_MIN_PX = 40;

/**
 * Màu nền thanh nhãn.
 *
 * Xanh mòng két đậm: bão hoà và gần như không xuất hiện thành một dải ngang kín
 * ở đỉnh một tấm ảnh thời trang. Nhờ vậy khi model lỡ vẽ lại thanh này vào kết
 * quả (khoảng 13% số lần), máy chủ nhận ra và cắt bỏ được — xem `labelGuard.ts`
 * ở phía server, nơi dùng đúng hằng số này.
 */
export const LABEL_BAR_COLOR = '#0B7A75';

export const LABEL_REFERENCE = 'IMAGE 1 - REFERENCE SCENE';
export const LABEL_PRODUCT = 'IMAGE 2 - PRODUCT ONLY';

/**
 * Vẽ thêm một dải nhãn lên đầu ảnh và trả về data URI mới.
 *
 * Trình duyệt cũ hoặc ảnh hỏng thì trả lại nguyên ảnh gốc: mất nhãn chỉ làm tăng
 * tỉ lệ đảo vai, còn ném lỗi ở đây sẽ chặn khách tạo ảnh — đánh đổi rõ ràng.
 */
export async function withRoleLabel(dataUri: string, text: string): Promise<string> {
  try {
    const image = await loadImage(dataUri);
    const barHeight = Math.round(Math.max(BAR_MIN_PX, image.naturalHeight * BAR_RATIO));

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight + barHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUri;

    ctx.fillStyle = LABEL_BAR_COLOR;
    ctx.fillRect(0, 0, canvas.width, barHeight);
    ctx.drawImage(image, 0, barHeight);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(barHeight * 0.5)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, barHeight / 2);

    // JPEG cho nhẹ; chất lượng 0.92 đủ để không thấy nhiễu nén trên ảnh sản phẩm.
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return dataUri;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('không đọc được ảnh'));
    image.src = src;
  });
}
