import { env } from '../env.js';
import { AppError } from '../lib/errors.js';
import type { GenerateRequest, GenerateResult, ImageProvider, ValidateInput } from './types.js';

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 6 * 60 * 1_000; // bỏ cuộc sau 6 phút
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Đặc tả tham số của từng model trên Kie.ai.
 *
 * Mỗi model nhận ảnh đầu vào bằng MỘT TÊN THAM SỐ KHÁC NHAU và không phải model
 * nào cũng có `resolution` hay `output_format`. Gửi sai tên là bị từ chối ngay.
 * Nguồn: https://docs.kie.ai/llms.txt → các trang /market/...
 *
 * Thêm model mới của Kie.ai: thêm một dòng ở đây theo đúng trang tài liệu của nó,
 * rồi thêm dòng tương ứng trong bảng giá ở trang Quản trị.
 */
interface KieModelSpec {
  /** Tên trường chứa danh sách URL ảnh đầu vào */
  imageParam: 'image_input' | 'image_urls' | 'input_urls';
  maxImages: number;
  /** Model bắt buộc phải có ảnh đầu vào (không dùng để sinh ảnh từ chữ) */
  imagesRequired: boolean;
  aspectRatios: string[];
  /** null = model không có tham số resolution, không được gửi lên */
  resolutions: string[] | null;
  /** null = model không có tham số output_format */
  outputFormat: string | null;
  /** Ràng buộc riêng giữa các tham số. Trả về thông báo lỗi, hoặc null nếu hợp lệ. */
  restrict?: (resolution: string, aspectRatio: string) => string | null;
}

const GOOGLE_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'];
const NANO_BANANA_2_RATIOS = [...GOOGLE_RATIOS, '1:4', '4:1', '1:8', '8:1'];
const GPT_IMAGE_2_RATIOS = [
  'auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5',
  '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '21:9', '9:21',
];

const MODEL_SPECS: Record<string, KieModelSpec> = {
  // https://docs.kie.ai/market/google/pro-image-to-image
  'nano-banana-pro': {
    imageParam: 'image_input',
    maxImages: 8,
    imagesRequired: false,
    aspectRatios: GOOGLE_RATIOS,
    resolutions: ['1K', '2K', '4K'],
    outputFormat: 'png',
  },
  // https://docs.kie.ai/market/google/nanobanana2
  'nano-banana-2': {
    imageParam: 'image_input',
    maxImages: 14,
    imagesRequired: false,
    aspectRatios: NANO_BANANA_2_RATIOS,
    resolutions: ['1K', '2K', '4K'],
    outputFormat: 'png',
  },
  // https://docs.kie.ai/market/google/nano-banana-2-lite — không có resolution / output_format
  'nano-banana-2-lite': {
    imageParam: 'image_urls',
    maxImages: 10,
    imagesRequired: false,
    aspectRatios: NANO_BANANA_2_RATIOS,
    resolutions: null,
    outputFormat: null,
  },
  // https://docs.kie.ai/market/google/nano-banana-edit — bản Nano Banana đời đầu
  'google/nano-banana-edit': {
    imageParam: 'image_urls',
    maxImages: 10,
    imagesRequired: true,
    aspectRatios: GOOGLE_RATIOS,
    resolutions: null,
    outputFormat: 'png',
  },
  // https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image
  'gpt-image-2-image-to-image': {
    imageParam: 'input_urls',
    maxImages: 16,
    imagesRequired: true,
    aspectRatios: GPT_IMAGE_2_RATIOS,
    resolutions: ['1K', '2K', '4K'],
    outputFormat: null,
    restrict: (resolution, aspectRatio) => {
      if (resolution !== '1K' && (aspectRatio === '5:4' || aspectRatio === '4:5')) {
        return 'GPT Image 2 chỉ tạo được tỉ lệ 5:4 và 4:5 ở chất lượng 1K. Hãy chọn 1K hoặc đổi tỉ lệ khác.';
      }
      if (resolution === '4K' && aspectRatio === '1:1') {
        return 'GPT Image 2 không xuất được ảnh 4K ở tỉ lệ 1:1. Hãy chọn 2K hoặc đổi tỉ lệ khác.';
      }
      if (resolution !== '1K' && aspectRatio === 'auto') {
        return 'GPT Image 2 với tỉ lệ "Tự động" chỉ tạo được ảnh 1K. Hãy chọn một tỉ lệ cụ thể để dùng 2K/4K.';
      }
      return null;
    },
  },
};

/** Dùng cho model admin tự thêm mà chưa khai báo ở trên — theo dạng phổ biến nhất của Kie.ai. */
const DEFAULT_SPEC: KieModelSpec = {
  imageParam: 'image_input',
  maxImages: 8,
  imagesRequired: false,
  aspectRatios: GOOGLE_RATIOS,
  resolutions: ['1K', '2K', '4K'],
  outputFormat: 'png',
};

const specFor = (providerModel: string): KieModelSpec => MODEL_SPECS[providerModel] ?? DEFAULT_SPEC;

export const KNOWN_KIE_MODELS = Object.keys(MODEL_SPECS);

// ---------------------------------------------------------------------------

const authHeaders = () => ({
  Authorization: `Bearer ${env.kie.apiKey.trim()}`,
  'Content-Type': 'application/json',
});

/** Câu báo cho khách khi key bị từ chối — chi tiết kỹ thuật in ra log cho quản trị viên. */
const AUTH_FAILED_MESSAGE =
  'Hệ thống chưa kết nối được với nhà cung cấp AI. Vui lòng báo quản trị viên kiểm tra lại API key.';

function throwAuthFailed(url: string, detail: string): never {
  console.error(
    `\n[Kie.ai] API KEY BỊ TỪ CHỐI khi gọi ${url}\n` +
      `  Phản hồi: ${detail}\n` +
      '  Kiểm tra KIE_API_KEY trong file .env — key sai, đã bị thu hồi, hoặc bị dán thiếu ký tự.\n' +
      '  Thử trực tiếp bằng lệnh:\n' +
      `      KEY=$(grep -E '^KIE_API_KEY=' .env | cut -d= -f2-)\n` +
      `      curl -s -X POST ${url} \\\n` +
      '        -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\\n' +
      `        -d '{"base64Data":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=","uploadPath":"images"}'\n`,
  );
  throw new AppError(502, AUTH_FAILED_MESSAGE, 'provider_auth');
}

async function requestJson(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await res.text();

  if (res.status === 401 || res.status === 403) throwAuthFailed(url, text.slice(0, 300));

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    if (!res.ok) throw new AppError(502, `Kie.ai trả về lỗi HTTP ${res.status}: ${text.slice(0, 300)}`, 'provider_error');
    throw new AppError(502, `Kie.ai trả về dữ liệu không hợp lệ: ${text.slice(0, 300)}`, 'provider_error');
  }

  // Endpoint upload trả HTTP 200 nhưng nhét code 401 vào thân phản hồi, nên kiểm
  // tra mã HTTP thôi là lọt. Thiếu nhánh này thì lỗi sai key hiện ra dưới dạng
  // "Không upload được ảnh" chung chung, rất khó đoán nguyên nhân.
  if (data?.code === 401 || data?.code === 403) throwAuthFailed(url, String(data?.msg ?? text).slice(0, 300));

  if (!res.ok) {
    throw new AppError(502, `Kie.ai lỗi (${res.status}): ${data?.msg ?? text.slice(0, 300)}`, 'provider_error');
  }
  return data;
}

/** Kie.ai yêu cầu ảnh đầu vào là URL public, nên phải upload base64 lên trước. */
async function uploadImage(dataUri: string): Promise<string> {
  const data = await requestJson(env.kie.uploadUrl, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ base64Data: dataUri, uploadPath: 'images' }),
  });

  if (data.success === false && data.code !== 200) {
    throw new AppError(502, `Không upload được ảnh lên Kie.ai: ${data.msg ?? 'lỗi không rõ'}`, 'provider_error');
  }

  const fileUrl: unknown =
    data.data?.downloadUrl ?? data.data?.fileUrl ?? data.data?.url ?? data.downloadUrl ?? data.url ?? data.fileUrl;

  if (typeof fileUrl !== 'string' || !/^https?:\/\//.test(fileUrl)) {
    throw new AppError(502, 'Kie.ai nhận ảnh nhưng không trả về URL hợp lệ.', 'provider_error');
  }
  return fileUrl;
}

function buildPrompt(userPrompt: string, hasReference: boolean): string {
  if (!hasReference) {
    return [
      'Generate a high-quality professional marketing image featuring the provided product(s).',
      userPrompt || 'Place the products in a clean, well-lit commercial scene.',
    ].join('\n\n');
  }

  return [
    'Generate a high-quality professional marketing image.',
    'INPUTS:',
    '- The FIRST image provided is the REFERENCE STYLE (composition, lighting, colour, mood).',
    '- The SUBSEQUENT images are the PRODUCTS that must appear in the result.',
    'TASK:',
    'Create a new image that features the provided PRODUCT(S) while closely mimicking the style and layout of the REFERENCE image. Keep the products true to their original shape, colour, label and branding.',
    'DETAILS:',
    userPrompt || 'Integrate the products naturally into the scene defined by the reference style.',
  ].join('\n');
}

/** Bóc URL ảnh ra khỏi các kiểu response khác nhau mà Kie.ai từng trả về. */
function extractResultUrl(taskData: any): string | null {
  let result: unknown = taskData?.images ?? taskData?.result ?? taskData?.output ?? taskData?.imageUrl;

  if (!result && typeof taskData?.resultJson === 'string') {
    try {
      const parsed = JSON.parse(taskData.resultJson);
      result = parsed.resultUrls ?? parsed.images ?? parsed.url;
    } catch {
      /* bỏ qua, xử lý ở dưới */
    }
  }

  if (Array.isArray(result)) result = result[0];
  if (result && typeof result === 'object' && 'url' in result) result = (result as { url: unknown }).url;

  return typeof result === 'string' && result.length > 0 ? result : null;
}

export const kieProvider: ImageProvider = {
  name: 'kie',

  isConfigured: () => Boolean(env.kie.apiKey),

  /**
   * Kiểm tra tổ hợp tham số TRƯỚC khi trừ token, để khách không bị trừ rồi hoàn
   * cho một lỗi mà ta biết chắc từ đầu là sẽ xảy ra.
   */
  validate({ providerModel, resolution, aspectRatio, imageCount }: ValidateInput): string | null {
    const spec = specFor(providerModel);

    if (spec.imagesRequired && imageCount === 0) {
      return 'Model này bắt buộc phải có ảnh đầu vào.';
    }
    if (imageCount > spec.maxImages) {
      return `Model này nhận tối đa ${spec.maxImages} ảnh đầu vào, bạn đang gửi ${imageCount} ảnh.`;
    }
    if (!spec.aspectRatios.includes(aspectRatio)) {
      return `Model này không hỗ trợ tỉ lệ ${aspectRatio}. Các tỉ lệ hợp lệ: ${spec.aspectRatios.join(', ')}.`;
    }
    if (spec.resolutions && !spec.resolutions.includes(resolution)) {
      return `Model này không hỗ trợ chất lượng ${resolution}. Chỉ nhận: ${spec.resolutions.join(', ')}.`;
    }

    return spec.restrict?.(resolution, aspectRatio) ?? null;
  },

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (!env.kie.apiKey) {
      throw new AppError(503, 'Hệ thống chưa cấu hình KIE_API_KEY.', 'provider_not_configured');
    }

    const spec = specFor(request.providerModel);

    // 1. Upload ảnh đầu vào (ảnh mẫu trước, ảnh sản phẩm sau — thứ tự này khớp với prompt)
    const sources = [request.referenceImage, ...request.productImages]
      .filter((image): image is string => Boolean(image))
      .slice(0, spec.maxImages);

    const imageUrls: string[] = [];
    for (const source of sources) imageUrls.push(await uploadImage(source));

    // 2. Dựng payload đúng theo đặc tả của model
    const aspectRatio = spec.aspectRatios.includes(request.aspectRatio)
      ? request.aspectRatio
      : spec.aspectRatios.includes('auto')
        ? 'auto'
        : '1:1';

    const input: Record<string, unknown> = {
      prompt: buildPrompt(request.prompt, Boolean(request.referenceImage)),
      aspect_ratio: aspectRatio,
    };
    if (imageUrls.length > 0) input[spec.imageParam] = imageUrls;
    if (spec.resolutions) input.resolution = request.resolution;
    if (spec.outputFormat) input.output_format = spec.outputFormat;

    const createData = await requestJson(`${env.kie.baseUrl}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model: request.providerModel, input }),
    });

    if (createData.code !== 200) {
      throw new AppError(502, `Kie.ai từ chối yêu cầu: ${createData.msg ?? JSON.stringify(createData)}`, 'provider_error');
    }

    const taskId: string | undefined = createData.data?.taskId;
    if (!taskId) throw new AppError(502, 'Kie.ai không trả về mã task.', 'provider_error');
    await request.onTaskCreated?.(taskId);

    // 3. Chờ kết quả
    const deadline = Date.now() + MAX_POLL_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollData = await requestJson(
        `${env.kie.baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { method: 'GET', headers: authHeaders() },
      );
      if (pollData.code !== 200) {
        throw new AppError(502, `Không tra được trạng thái task: ${pollData.msg ?? 'lỗi không rõ'}`, 'provider_error');
      }

      const status: string = pollData.data?.status ?? pollData.data?.state ?? '';

      if (status === 'success') {
        const url = extractResultUrl(pollData.data);
        if (!url) throw new AppError(502, 'Kie.ai báo thành công nhưng không có ảnh trả về.', 'provider_error');
        return { url, taskId };
      }

      if (status === 'fail' || status === 'failed' || status === 'error') {
        const reason = pollData.data?.failReason ?? pollData.data?.error ?? 'không rõ nguyên nhân';
        throw new AppError(502, `Tạo ảnh thất bại: ${reason}`, 'provider_failed');
      }
    }

    throw new AppError(504, 'Quá thời gian chờ kết quả từ Kie.ai (6 phút).', 'provider_timeout');
  },
};
