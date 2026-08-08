import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/**
 * Gỡ thanh nhãn vai trò nếu model lỡ vẽ nó vào ảnh kết quả.
 *
 * Ảnh đầu vào được dán một dải nhãn ở đỉnh để model không nhầm ảnh mẫu với ảnh
 * sản phẩm (xem `lib/imageLabel.ts`). Cách này xoá sạch lỗi đảo vai, nhưng đổi
 * lại khoảng 13% số lần model chép luôn dải nhãn đó sang kết quả.
 *
 * CẮT chứ không vẽ lại. Vẽ lại tốn thêm một lượt gọi nhà cung cấp và bắt khách
 * chờ thêm lượt nữa, trong khi thứ cần bỏ chỉ là một dải đặc màu nằm gọn ở đỉnh
 * ảnh. Cắt cho kết quả y hệt, tức thì và không tốn đồng nào.
 *
 * Không cắt được thì trả lại ảnh gốc. Thà giao một tấm ảnh có dải nhãn — nhìn
 * là thấy ngay và bấm Vẽ lại được — còn hơn làm hỏng ảnh vì cắt nhầm.
 */

/** Phải khớp `LABEL_BAR_COLOR` bên `lib/imageLabel.ts`. */
const BAR_RGB = { r: 0x0b, g: 0x7a, b: 0x75 };

/** Chỉ dò trong phần đỉnh ảnh; dải nhãn không bao giờ nằm quá sâu. */
const SEARCH_RATIO = 0.14;
/** Khoảng cách màu tối đa vẫn coi là màu nhãn. Nới tay vì model tô lại hơi lệch màu. */
const COLOR_TOLERANCE = 90;
/**
 * Tỉ lệ pixel trùng màu nhãn trên một hàng để coi hàng đó thuộc dải nhãn.
 *
 * Đặt thấp vì những hàng cắt ngang CHỮ TRẮNG chỉ còn khoảng 67–85% pixel màu
 * nhãn. Đo trên ảnh thật: trong dải luôn ≥ 67%, ngay dưới dải rớt xuống ≤ 6% —
 * khoảng trống rất rộng nên 0.35 tách sạch mà không sợ nhận nhầm.
 */
const ROW_HIT_RATIO = 0.35;
/** Số hàng liên tiếp không khớp thì coi như đã hết dải nhãn. */
const MISS_STREAK = 6;
/** Dải mỏng hơn mức này gần như chắc chắn là dò nhầm, bỏ qua cho an toàn. */
const MIN_BAR_RATIO = 0.012;

interface RawImage {
  width: number;
  height: number;
  /** RGBA, 4 byte mỗi pixel */
  data: Buffer | Uint8Array;
}

const isPng = (buffer: Buffer): boolean =>
  buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;

const isJpeg = (buffer: Buffer): boolean => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8;

function decode(buffer: Buffer): RawImage | null {
  try {
    if (isPng(buffer)) return PNG.sync.read(buffer);
    if (isJpeg(buffer)) return jpeg.decode(buffer, { useTArray: true });
  } catch {
    /* ảnh lạ hoặc hỏng — coi như không dò được */
  }
  return null;
}

function encode(image: RawImage, asJpeg: boolean): Buffer | null {
  try {
    if (asJpeg) return Buffer.from(jpeg.encode({ ...image, data: Buffer.from(image.data) }, 92).data);
    const png = new PNG({ width: image.width, height: image.height });
    Buffer.from(image.data).copy(png.data);
    return PNG.sync.write(png);
  } catch {
    return null;
  }
}

/** Số hàng pixel tính từ đỉnh thuộc về dải nhãn; 0 nghĩa là không có nhãn. */
function measureBar(image: RawImage): number {
  const limit = Math.floor(image.height * SEARCH_RATIO);
  // Lấy mẫu thưa theo chiều ngang cho nhanh; dải nhãn luôn kín cả bề rộng.
  const step = Math.max(1, Math.floor(image.width / 60));

  const isBarRow = (y: number): boolean => {
    let hit = 0;
    let seen = 0;
    for (let x = 0; x < image.width; x += step) {
      const i = (y * image.width + x) * 4;
      const dr = image.data[i] - BAR_RGB.r;
      const dg = image.data[i + 1] - BAR_RGB.g;
      const db = image.data[i + 2] - BAR_RGB.b;
      if (Math.sqrt(dr * dr + dg * dg + db * db) <= COLOR_TOLERANCE) hit += 1;
      seen += 1;
    }
    return seen > 0 && hit / seen >= ROW_HIT_RATIO;
  };

  // Dải nhãn luôn bắt đầu ngay hàng đầu tiên; không thì đây không phải dải nhãn.
  if (!isBarRow(0)) return 0;

  /*
   * Đi tiếp qua vài hàng lỡ không khớp thay vì dừng ngay hàng đầu tiên trượt.
   * Hàng cắt ngang chữ trắng có lúc rớt dưới ngưỡng, mà dừng ở đó thì chỉ cắt
   * được phần trên của dải và chữ vẫn nằm lại trong ảnh giao cho khách.
   */
  let lastBarRow = 0;
  let misses = 0;
  for (let y = 1; y < limit; y += 1) {
    if (isBarRow(y)) {
      lastBarRow = y;
      misses = 0;
    } else if ((misses += 1) > MISS_STREAK) {
      break;
    }
  }

  return lastBarRow + 1;
}

function cropTop(image: RawImage, rows: number): RawImage {
  const width = image.width;
  const height = image.height - rows;
  const out = Buffer.alloc(width * height * 4);
  Buffer.from(image.data).copy(out, 0, rows * width * 4);
  return { width, height, data: out };
}

/**
 * Trả về ảnh đã cắt dải nhãn, hoặc chính buffer ban đầu nếu không có gì để cắt.
 */
export function stripRoleLabel(buffer: Buffer): { buffer: Buffer; cropped: boolean } {
  const image = decode(buffer);
  if (!image) return { buffer, cropped: false };

  const rows = measureBar(image);
  if (rows === 0 || rows < image.height * MIN_BAR_RATIO) return { buffer, cropped: false };
  // Dò ra gần hết ảnh thì chắc chắn sai — có thể là ảnh nền một màu.
  if (rows > image.height * SEARCH_RATIO * 0.95) return { buffer, cropped: false };

  const encoded = encode(cropTop(image, rows), isJpeg(buffer));
  if (!encoded) return { buffer, cropped: false };

  return { buffer: encoded, cropped: true };
}
