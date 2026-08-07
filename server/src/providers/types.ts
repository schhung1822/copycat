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
   * Ảnh này là bản thứ mấy trong số mấy bản của cùng một lần bấm nút (1-based).
   *
   * Cần cho prompt: bản thứ 2 trở đi phải được dặn rõ là "làm khác đi một chút
   * nhưng vẫn đúng sản phẩm", nếu không model tự do sáng tác và thường trả về
   * ảnh mặc sai sản phẩm. Mặc định 1/1 khi không truyền.
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
   * Kiểm tra tổ hợp tham số trước khi trừ token. Trả về thông báo lỗi cho người
   * dùng, hoặc null nếu hợp lệ. Nhờ bước này khách không bị trừ rồi hoàn token
   * cho những lỗi biết trước là chắc chắn xảy ra.
   */
  validate?(input: ValidateInput): string | null;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
