/**
 * Xoá sạch metadata khỏi ảnh kết quả trước khi giao cho khách.
 *
 * VÌ SAO PHẢI LÀM. Các nhà cung cấp đều nhúng dấu vết "ảnh do AI tạo" vào phần
 * metadata của file: C2PA/Content Credentials (OpenAI), IPTC `DigitalSourceType
 * = trainedAlgorithmicMedia`, XMP, EXIF `Software`. Facebook, Instagram,
 * Threads, TikTok và LinkedIn đọc đúng mấy trường này rồi tự gắn nhãn "Thông
 * tin AI" lên bài đăng. Khách bán hàng đăng ảnh sản phẩm thì cái nhãn đó làm
 * giảm tin cậy của bài, nên ta gỡ trước khi trả file về.
 *
 * CẮT CHUNK CHỨ KHÔNG GIẢI MÃ LẠI. Cách nhanh nhất là decode rồi encode lại —
 * nhưng như vậy ảnh 4K phải nén lại một lần nữa và mất chi tiết, trong khi thứ
 * cần bỏ chỉ là mấy đoạn byte nằm ngoài phần dữ liệu ảnh. Ở đây ta đi dọc cấu
 * trúc file và bỏ đúng những đoạn đó, giữ nguyên từng byte pixel. Không giảm
 * chất lượng, không phụ thuộc thư viện nào.
 *
 * GIỮ LẠI HỒ SƠ MÀU (ICC). Đây là dịch vụ ảnh sản phẩm nên màu phải đúng: bỏ
 * ICC thì ảnh chụp ở dải màu rộng sẽ bị lệch màu khi xem trên máy khác. ICC chỉ
 * mô tả màu, không chứa dấu vết AI nào, nên giữ lại là an toàn.
 *
 * KHÔNG ĐỘNG ĐƯỢC VÀO WATERMARK CHÌM. Ảnh của các model Google (Nano Banana)
 * còn mang SynthID — watermark giấu trong chính pixel, không nằm ở metadata nên
 * hàm này không gỡ được. Việc gỡ metadata chỉ tắt phần nhãn tự động mà các nền
 * tảng đang đọc từ file.
 *
 * File lạ hoặc hỏng thì trả lại nguyên buffer ban đầu. Thà giao một tấm ảnh còn
 * metadata còn hơn giao một file vỡ không mở được.
 */

/** Tên đoạn metadata đã gỡ, chỉ dùng để ghi log cho dễ lần khi có sự cố. */
export interface ScrubResult {
  buffer: Buffer;
  removed: string[];
}

const unchanged = (buffer: Buffer): ScrubResult => ({ buffer, removed: [] });

const isPng = (b: Buffer): boolean =>
  b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

const isJpeg = (b: Buffer): boolean => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

const isWebp = (b: Buffer): boolean =>
  b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';

/**
 * Gỡ metadata theo đúng định dạng của file.
 *
 * GIF không được xử lý: nhà cung cấp không trả về GIF, mà cấu trúc khối của nó
 * lại dễ làm hỏng ảnh động nếu cắt nhầm — không đáng đánh đổi.
 */
export function scrubMetadata(buffer: Buffer): ScrubResult {
  try {
    if (isJpeg(buffer)) return scrubJpeg(buffer);
    if (isPng(buffer)) return scrubPng(buffer);
    if (isWebp(buffer)) return scrubWebp(buffer);
  } catch {
    /* file hỏng giữa chừng — giữ nguyên bản gốc */
  }
  return unchanged(buffer);
}

/* ========================= JPEG ========================= */

/**
 * Tên dễ đọc của các segment mang metadata, để log nói rõ đã bỏ thứ gì.
 * Khoảng APP1–APP15 gần như chỉ dùng cho metadata, ngoại lệ được xử lý riêng.
 */
const JPEG_SEGMENT_NAMES: Record<number, string> = {
  0xe1: 'EXIF/XMP (APP1)',
  0xe2: 'FlashPix/MPF (APP2)',
  0xe3: 'Kodak (APP3)',
  0xe5: 'Ricoh (APP5)',
  0xea: 'PhotoStudio (APP10)',
  0xeb: 'C2PA/JUMBF (APP11)',
  0xec: 'Picture Info (APP12)',
  0xed: 'IPTC/Photoshop (APP13)',
  0xee: 'Adobe (APP14)',
  0xfe: 'Comment (COM)',
};

const startsWithAscii = (buffer: Buffer, offset: number, text: string): boolean =>
  buffer.length >= offset + text.length && buffer.toString('ascii', offset, offset + text.length) === text;

/**
 * Segment này có phải metadata cần bỏ không.
 *
 * `payloadAt` trỏ tới byte đầu tiên sau 2 byte độ dài của segment.
 */
function isJpegMetadata(marker: number, buffer: Buffer, payloadAt: number): boolean {
  // Chú thích tự do — nơi nhiều công cụ ghi tên phần mềm đã tạo ảnh.
  if (marker === 0xfe) return true;

  // APP0 thường là JFIF/JFXX, phần khai báo mật độ điểm ảnh mà decoder cần.
  if (marker === 0xe0) return !startsWithAscii(buffer, payloadAt, 'JFIF') && !startsWithAscii(buffer, payloadAt, 'JFXX');

  // APP2 dùng chung cho hồ sơ màu ICC lẫn metadata; chỉ giữ lại ICC.
  if (marker === 0xe2) return !startsWithAscii(buffer, payloadAt, 'ICC_PROFILE');

  // Còn lại APP1–APP15: EXIF, XMP, C2PA, IPTC... đều bỏ được.
  return marker >= 0xe1 && marker <= 0xef;
}

function scrubJpeg(buffer: Buffer): ScrubResult {
  const parts: Buffer[] = [buffer.subarray(0, 2)]; // SOI
  const removed: string[] = [];
  let offset = 2;

  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) return unchanged(buffer); // lệch khung — không mạo hiểm

    const marker = buffer[offset + 1];

    // Byte 0xFF đệm giữa hai segment, được phép xuất hiện nhiều lần liên tiếp.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }

    // Marker đứng một mình, không có phần độ dài đi kèm.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    /*
     * SOS mở đầu dữ liệu ảnh nén, chạy liền tới cuối file và không còn cấu trúc
     * segment để đi tiếp. Sao chép nguyên phần còn lại rồi dừng.
     *
     * Một số máy ảnh nhét thumbnail kèm EXIF vào SAU EOI, nhưng ảnh từ nhà cung
     * cấp thì không, nên chép hết là an toàn nhất.
     */
    if (marker === 0xda || marker === 0xd9) {
      parts.push(buffer.subarray(offset));
      break;
    }

    if (offset + 4 > buffer.length) return unchanged(buffer);
    const length = buffer.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > buffer.length) return unchanged(buffer);

    if (isJpegMetadata(marker, buffer, offset + 4)) {
      removed.push(JPEG_SEGMENT_NAMES[marker] ?? `APP${marker - 0xe0}`);
    } else {
      parts.push(buffer.subarray(offset, end));
    }
    offset = end;
  }

  if (removed.length === 0) return unchanged(buffer);
  return { buffer: Buffer.concat(parts), removed };
}

/* ========================= PNG ========================= */

/**
 * Các chunk được giữ lại — mọi thứ khác bị bỏ.
 *
 * Dùng danh sách cho phép chứ không phải danh sách cấm: C2PA ghi vào chunk
 * `caBX`, các công cụ khác lại tự đặt chunk riêng, nên liệt kê thứ cần bỏ sẽ
 * luôn sót. Danh sách này đã gồm đủ chunk mà bộ giải mã cần để dựng lại ảnh,
 * kể cả ảnh động (acTL/fcTL/fdAT).
 *
 * Bị bỏ: tEXt, zTXt, iTXt (XMP và tham số sinh ảnh), eXIf, tIME, caBX.
 */
const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'bKGD',
  'pHYs',
  'hIST',
  'sPLT',
  'acTL',
  'fcTL',
  'fdAT',
]);

function scrubPng(buffer: Buffer): ScrubResult {
  const parts: Buffer[] = [buffer.subarray(0, 8)]; // chữ ký PNG
  const removed: string[] = [];
  let offset = 8;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    // 4 byte độ dài + 4 byte tên + dữ liệu + 4 byte CRC
    const end = offset + 12 + length;
    if (end > buffer.length) return unchanged(buffer);

    if (PNG_KEEP.has(type)) {
      parts.push(buffer.subarray(offset, end));
    } else {
      removed.push(type);
    }

    offset = end;
    if (type === 'IEND') break;
  }

  if (removed.length === 0) return unchanged(buffer);
  // Chunk được chép nguyên khối nên CRC cũ vẫn đúng, không cần tính lại.
  return { buffer: Buffer.concat(parts), removed };
}

/* ========================= WebP ========================= */

/** Bit báo có chunk EXIF / XMP trong byte cờ của VP8X. */
const VP8X_FLAG_EXIF = 0x08;
const VP8X_FLAG_XMP = 0x04;

function scrubWebp(buffer: Buffer): ScrubResult {
  // Chỉ dạng mở rộng (VP8X) mới chứa được metadata; VP8 / VP8L thì không.
  if (buffer.toString('ascii', 12, 16) !== 'VP8X') return unchanged(buffer);

  const parts: Buffer[] = [];
  const removed: string[] = [];
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const fourCC = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    // Mỗi chunk được đệm cho chẵn byte.
    const end = offset + 8 + size + (size % 2);
    if (end > buffer.length) return unchanged(buffer);

    if (fourCC === 'EXIF' || fourCC === 'XMP ') {
      removed.push(fourCC.trim());
    } else if (fourCC === 'VP8X') {
      /*
       * Byte cờ phải khớp với các chunk thật sự còn lại, nếu không trình giải mã
       * sẽ đi tìm chunk EXIF/XMP đã bị bỏ và coi file là hỏng.
       */
      const header = Buffer.from(buffer.subarray(offset, end));
      header[8] &= ~(VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
      parts.push(header);
    } else {
      parts.push(buffer.subarray(offset, end));
    }

    offset = end;
  }

  if (removed.length === 0) return unchanged(buffer);

  const body = Buffer.concat(parts);
  const out = Buffer.alloc(12 + body.length);
  out.write('RIFF', 0, 'ascii');
  // Trường size của RIFF đếm mọi thứ sau chính nó, tức 'WEBP' cộng phần thân.
  out.writeUInt32LE(4 + body.length, 4);
  out.write('WEBP', 8, 'ascii');
  body.copy(out, 12);

  return { buffer: out, removed };
}
