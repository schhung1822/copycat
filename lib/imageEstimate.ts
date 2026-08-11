import type { ModelOption } from '../types';

/**
 * Quy số điểm ra số ảnh — dùng CHUNG cho trang giới thiệu và trang Mua điểm.
 *
 * Gom về một chỗ vì hai trang cùng bán một thứ cho cùng một người: khách xem giá
 * ở trang giới thiệu rồi bấm vào mua, thấy hai con số khác nhau cho cùng một gói
 * là mất tin ngay. Trước đây mỗi trang tự chọn model mốc và tự làm tròn theo cách
 * riêng nên cùng gói 499.000đ mà một bên ghi 140 ảnh, một bên ghi số khác.
 */

/**
 * Mốc dự phòng khi admin chưa chọn model nào.
 *
 * GPT Image 2 ở 2K: mức chất lượng đa số khách dùng thật, không phải bản rẻ nhất
 * (số đẹp nhưng chẳng ai chọn) cũng không phải bản đắt nhất (số bé đến mức trông
 * như đắt vô lý). Bình thường `seed.ts` đã bật sẵn cờ cho model này nên nhánh dự
 * phòng ở đây hiếm khi chạy.
 */
export const FALLBACK_REFERENCE = { family: 'gpt-image-2', resolution: '2K' };

const cheapestOf = (models: ModelOption[]): ModelOption | null =>
  models.reduce<ModelOption | null>(
    (cheapest, model) => (model.tokenCost > 0 && (!cheapest || model.tokenCost < cheapest.tokenCost) ? model : cheapest),
    null,
  );

/**
 * Tìm model mốc trong bảng giá đang bán.
 *
 * Ưu tiên tuyệt đối model admin đã đánh dấu ở Quản trị → Bảng giá, cột "Mốc quy
 * đổi". Số điểm mỗi ảnh cũng đọc thẳng từ bảng đó, nên sửa "Điểm thu" trong trang
 * Quản trị là số ảnh trên thẻ gói đổi theo ngay ở lần tải trang sau.
 *
 * Ba mức lùi phòng khi chưa ai đánh dấu hoặc model mốc bị tắt bán: đúng model mặc
 * định, rồi rẻ nhất cùng độ phân giải, rồi rẻ nhất toàn bảng. Trả về `null` khi
 * bảng giá trống — nơi gọi phải ẩn hẳn phần số ảnh thay vì hiện số 0.
 */
export function pickReferenceModel(models: ModelOption[] | undefined): ModelOption | null {
  if (!models || models.length === 0) return null;

  return (
    models.find((model) => model.isEstimateReference && model.tokenCost > 0) ??
    models.find(
      (model) =>
        model.family === FALLBACK_REFERENCE.family &&
        model.resolution === FALLBACK_REFERENCE.resolution &&
        model.tokenCost > 0,
    ) ??
    cheapestOf(models.filter((model) => model.resolution === FALLBACK_REFERENCE.resolution)) ??
    cheapestOf(models)
  );
}

/**
 * Số ảnh tạo được từ một số điểm, làm tròn XUỐNG cho gọn mắt.
 *
 * Luôn làm tròn xuống chứ không làm tròn gần nhất: làm tròn lên là hứa nhiều ảnh
 * hơn số điểm thật sự cho phép (vd 357 ảnh mà ghi 400), khách tạo tới ảnh thứ 358
 * là hết điểm và có cơ sở khiếu nại.
 *
 * Bước làm tròn nhỏ dần theo độ lớn: số càng bé thì sai lệch do làm tròn càng
 * chiếm tỉ lệ lớn. Làm tròn 35 ảnh xuống 30 là mất 14%, trong khi 357 xuống 350
 * chỉ mất 2%.
 */
export function roundedImageCount(tokens: number, costPerImage: number): number {
  if (costPerImage <= 0) return 0;

  const exact = Math.floor(tokens / costPerImage);
  if (exact >= 100) return Math.floor(exact / 10) * 10;
  if (exact >= 20) return Math.floor(exact / 5) * 5;
  return exact;
}

/** "GPT Image 2 — 2K" -> "GPT Image 2", để ghép vào câu chú thích. */
export const modelShortName = (model: ModelOption | null): string => model?.label.split('—')[0].trim() ?? '';
