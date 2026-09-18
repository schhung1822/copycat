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

/**
 * Nhãn cho ảnh sản phẩm thứ `index` (đếm từ 0) trong danh sách khách tải lên.
 *
 * SỐ TRÊN NHÃN PHẢI LÀ VỊ TRÍ THẬT của ảnh trong mảng gửi lên nhà cung cấp.
 * Prompt dặn model "tin dải nhãn hơn mọi thứ khác" (xem `providers/kie.ts`), nên
 * nhãn sai số là tự tay phá đúng cái cơ chế dựng ra để chống đảo vai. Trước đây
 * mọi ảnh sản phẩm đều mang chung một nhãn "IMAGE 2": khách tải hai góc chụp là
 * model nhận được hai tấm cùng xưng Image 2, trong khi prompt gọi chúng là Image
 * 2 và Image 3.
 *
 * Không có ảnh mẫu thì ảnh sản phẩm bắt đầu từ vị trí 1 chứ không phải 2, khớp
 * cách provider xếp mảng: `[ảnh mẫu nếu có, ...ảnh sản phẩm]`.
 *
 * Từ hai ảnh trở lên, nhãn ghi thêm "VIEW n/N" để nói thẳng trên pixel rằng đây
 * là nhiều GÓC CHỤP CỦA CÙNG MỘT MÓN, không phải nhiều món khác nhau — nếu
 * không, model hay dựng ra đúng bằng ấy món trong ảnh kết quả.
 */
export function productLabel(index: number, total: number, hasReference: boolean): string {
  const position = (hasReference ? 2 : 1) + index;
  return total > 1
    ? `IMAGE ${position} - PRODUCT VIEW ${index + 1}/${total}`
    : `IMAGE ${position} - PRODUCT ONLY`;
}

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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    /*
     * Thu nhỏ chữ cho vừa bề ngang ảnh. `fillText` không tự xuống dòng cũng không
     * tự co, mà thanh nhãn cao theo CHIỀU CAO ảnh — nên ảnh hẹp và cao cho ra
     * thanh cao, chữ to, tràn ra ngoài và mất mấy ký tự cuối. Mấy ký tự cuối lại
     * đúng là phần phân biệt "VIEW 1/2" với "VIEW 2/2".
     *
     * Bề rộng chữ tỉ lệ thuận với cỡ chữ nên một lượt quy đổi là đủ, không cần
     * dò dần.
     */
    let fontSize = Math.round(barHeight * 0.5);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    const maxWidth = canvas.width * 0.94;
    const textWidth = ctx.measureText(text).width;
    if (textWidth > maxWidth) {
      fontSize = Math.max(10, Math.floor((fontSize * maxWidth) / textWidth));
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    }

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
