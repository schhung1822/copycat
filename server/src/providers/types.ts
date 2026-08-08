/**
 * Lớp trừu tượng cho nhà cung cấp ảnh AI.
 *
 * Muốn thêm nhà cung cấp mới (Replicate, Fal.ai, OpenAI trực tiếp...):
 *   1. Tạo file mới trong thư mục này, export một object thoả `ImageProvider`.
 *   2. Đăng ký nó trong `providers/index.ts`.
 *   3. Thêm dòng vào bảng `model_pricing` với cột `provider` trùng tên adapter.
 * Không cần đụng tới route hay giao diện.
 */

export interface GenerateRequest {
  /** Slug model gửi lên API bên thứ 3, lấy từ cột model_pricing.provider_model */
  providerModel: string;
  prompt: string;
  /** Ảnh mẫu (style) dạng data URI base64 */
  referenceImage: string | null;
  /** Ảnh sản phẩm dạng data URI base64 */
  productImages: string[];
  aspectRatio: string;
  resolution: string;
  /**
   * Ảnh này là bản thứ mấy trong số mấy bản của cùng một ảnh mẫu (1-based).
   *
   * Bản 1 bám sát ảnh mẫu để khách có ngay một bản dùng được; từ bản 2 trở đi là
   * các phương án sáng tạo trên cùng sản phẩm đó.
   *
   * Lưu ý cho người sửa sau: một bản prompt trước đây cũng dùng hai trường này
   * nhưng cho phép bản 2+ đổi cả "dáng sản phẩm", và model đổi luôn chính món
   * hàng của khách. Phạm vi được sáng tạo chỉ gồm bối cảnh — không bao giờ gồm
   * sản phẩm. Mặc định 1/1 khi không truyền.
   */
  variantIndex?: number;
  variantTotal?: number;
  /** Gọi lại ngay khi nhà cung cấp trả về task id, để lưu vào DB phục vụ tra soát */
  onTaskCreated?: (taskId: string) => void | Promise<void>;
}

export interface GenerateResult {
  /** URL ảnh kết quả phía nhà cung cấp */
  url: string;
  taskId: string | null;
}

export interface ValidateInput {
  providerModel: string;
  resolution: string;
  aspectRatio: string;
  /** Tổng số ảnh đầu vào (ảnh mẫu + ảnh sản phẩm) */
  imageCount: number;
}

export interface ImageProvider {
  readonly name: string;
  /** Kiểm tra adapter đã đủ cấu hình (API key...) chưa */
  isConfigured(): boolean;
  /**
   * Kiểm tra tổ hợp tham số trước khi trừ điểm. Trả về thông báo lỗi cho người
   * dùng, hoặc null nếu hợp lệ. Nhờ bước này khách không bị trừ rồi hoàn điểm
   * cho những lỗi biết trước là chắc chắn xảy ra.
   */
  validate?(input: ValidateInput): string | null;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
