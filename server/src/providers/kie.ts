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

/*
 * Thông báo cho KHÁCH cố ý không nhắc tên nhà cung cấp và không lộ chi tiết kỹ
 * thuật: khách mua dịch vụ của bạn, việc bạn gọi API của ai là chuyện nội bộ.
 * Toàn bộ chi tiết để gỡ lỗi được in ra log của server cho quản trị viên.
 */
const USER_MESSAGE = {
  system: 'Hệ thống tạm thời chưa tạo được ảnh. Vui lòng thử lại sau ít phút.',
  config: 'Hệ thống chưa sẵn sàng tạo ảnh. Vui lòng liên hệ quản trị viên.',
  timeout: 'Ảnh xử lý quá lâu nên đã dừng lại. Vui lòng thử lại.',
} as const;

/** Ghi chi tiết kỹ thuật ra log rồi ném lỗi với câu ngắn gọn cho khách. */
function providerFailure(logDetail: string, userMessage: string = USER_MESSAGE.system, code = 'provider_error'): never {
  console.error(`[kie] ${logDetail}`);
  throw new AppError(502, userMessage, code);
}

function throwAuthFailed(url: string, detail: string): never {
  console.error(
    `\n[kie] API KEY BỊ TỪ CHỐI khi gọi ${url}\n` +
      `  Phản hồi: ${detail}\n` +
      '  Kiểm tra KIE_API_KEY trong file .env — key sai, đã bị thu hồi, hoặc bị dán thiếu ký tự.\n' +
      '  Thử trực tiếp bằng lệnh:\n' +
      `      KEY=$(grep -E '^KIE_API_KEY=' .env | cut -d= -f2- | tr -d "\\"'\\r ")\n` +
      `      curl -s -X POST ${url} \\\n` +
      '        -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\\n' +
      `        -d '{"base64Data":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=","uploadPath":"images"}'\n`,
  );
  throw new AppError(502, USER_MESSAGE.config, 'provider_auth');
}

async function requestJson(url: string, init: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await res.text();

  if (res.status === 401 || res.status === 403) throwAuthFailed(url, text.slice(0, 300));

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    if (!res.ok) providerFailure(`HTTP ${res.status} tại ${url}: ${text.slice(0, 300)}`);
    providerFailure(`Phản hồi không phải JSON tại ${url}: ${text.slice(0, 300)}`);
  }

  // Endpoint upload trả HTTP 200 nhưng nhét code 401 vào thân phản hồi, nên kiểm
  // tra mã HTTP thôi là lọt. Thiếu nhánh này thì lỗi sai key hiện ra dưới dạng
  // "Không upload được ảnh" chung chung, rất khó đoán nguyên nhân.
  if (data?.code === 401 || data?.code === 403) throwAuthFailed(url, String(data?.msg ?? text).slice(0, 300));

  if (!res.ok) {
    providerFailure(`HTTP ${res.status} tại ${url}: ${data?.msg ?? text.slice(0, 300)}`);
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
    providerFailure(`Upload ảnh thất bại: ${data.msg ?? 'lỗi không rõ'}`);
  }

  const fileUrl: unknown =
    data.data?.downloadUrl ?? data.data?.fileUrl ?? data.data?.url ?? data.downloadUrl ?? data.url ?? data.fileUrl;

  if (typeof fileUrl !== 'string' || !/^https?:\/\//.test(fileUrl)) {
    providerFailure(`Upload xong nhưng không có URL hợp lệ: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return fileUrl;
}

/*
 * =============================================================================
 *  PROMPT GỬI LÊN MODEL
 * =============================================================================
 *
 * Viết bằng tiếng Anh vì các model ảnh đều được huấn luyện chủ yếu trên tiếng
 * Anh và bám chỉ dẫn tiếng Anh chặt hơn hẳn. Riêng phần khách nhập được giữ
 * NGUYÊN VĂN (thường là tiếng Việt) — dịch máy dễ làm sai ý khách, và các model
 * này đều đọc được tiếng Việt khi đã có khung tiếng Anh dẫn dắt.
 *
 * Cấu trúc prompt sinh ra để chữa đúng ba lỗi hay gặp:
 *
 *   1. Ảnh ra vẫn mặc sản phẩm của ẢNH MẪU.
 *      → Phải nói thẳng "xoá sản phẩm trong ảnh mẫu đi", chứ chỉ nói "dùng sản
 *        phẩm này" thì model coi ảnh mẫu là gợi ý và giữ nguyên đồ cũ. Thêm một
 *        bước tự kiểm ở cuối để model soát lại trước khi trả ảnh.
 *
 *   2. Tạo nhiều ảnh một lượt thì ảnh thứ 2 trở đi lệch sản phẩm.
 *      → Mỗi ảnh là một lệnh gọi API độc lập, model không biết nó đang làm bản
 *        thứ mấy nên tự do "sáng tác cho khác đi", và thứ nó đổi đầu tiên lại là
 *        sản phẩm. Vì vậy phải nói rõ đây là bản thứ k/n VÀ liệt kê đích danh
 *        những thứ ĐƯỢC phép đổi — sản phẩm không nằm trong danh sách đó.
 *
 *   3. Khách nhập mô tả thêm rồi model bỏ luôn ràng buộc gốc.
 *      → Ghi rõ thứ tự ưu tiên: nhận diện sản phẩm > mô tả của khách > bám ảnh
 *        mẫu. Nhờ vậy khách đổi được bối cảnh, tư thế, màu nền... nhưng không
 *        bao giờ đổi được chính món hàng.
 *
 * Các bước được đánh số và tách khối vì model bám theo danh sách có thứ tự tốt
 * hơn nhiều so với một đoạn văn xuôi dài.
 */

/** "Image 2" hoặc "Images 2–4", tuỳ số ảnh sản phẩm khách gửi. */
const productImageRange = (productCount: number, firstIndex: number): string =>
  productCount > 1 ? `Images ${firstIndex}–${firstIndex + productCount - 1}` : `Image ${firstIndex}`;

/**
 * Dặn riêng cho từng bản trong lô.
 *
 * Bản đầu bám ảnh mẫu sát nhất. Từ bản thứ hai, liệt kê ĐÍCH DANH những thứ được
 * phép khác đi — danh sách đóng như vậy an toàn hơn hẳn câu chung chung kiểu
 * "hãy làm khác đi", vốn là thứ khiến model tự ý đổi luôn sản phẩm.
 */
function variantBlock(index: number, total: number): string {
  if (total <= 1) return '';

  if (index <= 1) {
    return `VARIATION 1 of ${total} — stay as close to the reference design as possible.`;
  }

  return [
    `VARIATION ${index} of ${total} — this image must look noticeably different from the other variations,`,
    'but ONLY in these secondary details: camera angle and pose of the product within the same style,',
    'arrangement of the product pieces, background scenery detail and texture, position and accent colour',
    'of the decorative graphic blocks, minor typography layout shifts.',
    'Everything in STEP 4 and the HARD RULES stays exactly the same: same physical item, same colours,',
    'same graphics, same logos. Never vary the product itself.',
  ].join(' ');
}

/** Khối mô tả của khách, kèm ranh giới rõ ràng về thứ được phép ghi đè. */
function userBlock(userPrompt: string, hasReference: boolean): string {
  if (!userPrompt) {
    return hasReference
      ? 'USER INSTRUCTIONS: none. Follow the steps above exactly.'
      : 'USER INSTRUCTIONS: none. Place the product in a clean, well-lit commercial studio scene.';
  }

  return [
    'USER INSTRUCTIONS — written by the customer, usually in Vietnamese. Follow them whatever the language.',
    hasReference
      ? 'They MAY override the reference design: scene, background, model pose, setting, colours of the design, text.'
      : 'They define the scene.',
    'They MAY NOT override product identity: the product must stay the exact item from the product image(s).',
    '"""',
    userPrompt,
    '"""',
  ].join('\n');
}

/**
 * Ghép các khối lại, bỏ khối rỗng và ngăn cách bằng một dòng trắng.
 *
 * Dòng trắng giữa các khối không phải để cho đẹp: nó là ranh giới giúp model
 * hiểu "HARD RULES" là một cụm tách bạch chứ không phải phần đuôi của STEP 4.
 * Trong một khối thì các dòng nối liền nhau nên câu vẫn liền mạch.
 */
const joinBlocks = (blocks: (string | string[])[]): string =>
  blocks
    .map((block) => (Array.isArray(block) ? block.join('\n') : block))
    .filter((block) => block.trim() !== '')
    .join('\n\n');

function buildPrompt(request: GenerateRequest): string {
  const userPrompt = request.prompt.trim();
  const productCount = Math.max(request.productImages.length, 1);
  const index = Math.max(request.variantIndex ?? 1, 1);
  const total = Math.max(request.variantTotal ?? 1, 1);

  // Không có ảnh mẫu: chỉ còn nhiệm vụ giữ đúng sản phẩm và dựng bối cảnh.
  if (!request.referenceImage) {
    const products = productImageRange(productCount, 1);

    return joinBlocks([
      'TASK: create one finished, professional advertising image of the product shown in the input image(s).',
      [
        `PRODUCT: ${products}${productCount > 1 ? ' show the same product set from different angles, or its separate pieces.' : '.'}`,
        'The product in your output must be the exact same physical item: identical silhouette and cut,',
        'identical colours and where each colour sits, identical material and texture, identical prints,',
        'graphics, logos, lettering, trims and proportions. Do not redesign, recolour, simplify or replace it.',
      ],
      variantBlock(index, total),
      userBlock(userPrompt, false),
      'Output a single finished image — no collage, no side-by-side comparison, no before/after panel.',
    ]);
  }

  const products = productImageRange(productCount, 2);

  return joinBlocks([
    'TASK: rebuild the reference advertisement design, but selling a different product.',

    [
      'INPUT IMAGES, in the order given:',
      '• Image 1 — REFERENCE DESIGN. Use it for layout and styling only, never for the product.',
      `• ${products} — TARGET PRODUCT. The only product allowed to appear in your output.` +
        (productCount > 1 ? ' They show the same product set from different angles, or its separate pieces.' : ''),
    ],

    [
      'STEP 1 · IDENTIFY',
      'Find the hero product being advertised in Image 1 — the object the whole design is built around.',
      `Then study the product in ${products}: its exact type, cut, colours, material, prints, logos and proportions.`,
    ],

    [
      'STEP 2 · REPLACE',
      'Remove the hero product of Image 1 from the scene completely and put the TARGET PRODUCT in its place.',
      'Match the reference product’s position, scale, rotation, camera angle, perspective, cropping and lighting',
      'direction so the swap looks native to the design. If the target product’s real shape does not fit that',
      'silhouette, keep the target product’s real shape and adapt the layout around it — never distort the product',
      'to fit the reference outline.',
    ],

    [
      'STEP 3 · KEEP THE DESIGN',
      'Everything that is not the product stays as in Image 1: canvas layout and grid, background and scenery,',
      'colour grading, lighting mood, typography style, text blocks, logos, badges, decorative shapes, borders,',
      'margins and overall composition.',
    ],

    [
      'STEP 4 · KEEP THE PRODUCT EXACT — highest priority',
      `The product in your output must be recognisably the SAME physical item as in ${products}:`,
      'identical silhouette and cut, identical colours and where each colour sits, identical fabric or material',
      'and texture, identical prints, graphics, logos, lettering, stripes, trims, stitching, buttons, zips and',
      'proportions. Do not restyle it, recolour it, simplify it, "improve" it, or blend it with the product from',
      'Image 1.',
    ],

    [
      'HARD RULES',
      '1. The product from Image 1 must not appear anywhere in the output — not partially, not in the background,',
      '   not as a second item next to the target product.',
      `2. Never invent a product that is not in ${products}.`,
      '3. Reproduce reference text exactly and legibly. If a text block cannot be reproduced accurately, render it',
      '   as a clean typographic block rather than fake or garbled letters.',
      '4. Output a single finished advertising image — no collage, no side-by-side comparison, no before/after',
      '   panel, no visible thumbnail of the input images.',
    ],

    variantBlock(index, total),
    userBlock(userPrompt, true),

    [
      'PRIORITY when instructions conflict: (1) product identity in STEP 4, (2) the user instructions,',
      '(3) fidelity to the reference design.',
    ],

    [
      `FINAL CHECK before you output: is the product in your image the one from ${products}, with the same colours,`,
      'same cut and same graphics? Is the product from Image 1 fully gone? If not, redo the swap.',
    ],
  ]);
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
      providerFailure('Chưa cấu hình KIE_API_KEY trong file .env.', USER_MESSAGE.config, 'provider_not_configured');
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
      prompt: buildPrompt(request),
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
      providerFailure(`Tạo task bị từ chối: ${createData.msg ?? JSON.stringify(createData)}`);
    }

    const taskId: string | undefined = createData.data?.taskId;
    if (!taskId) providerFailure('Tạo task thành công nhưng không có taskId.');
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
        providerFailure(`Tra trạng thái task ${taskId} thất bại: ${pollData.msg ?? 'lỗi không rõ'}`);
      }

      const status: string = pollData.data?.status ?? pollData.data?.state ?? '';

      if (status === 'success') {
        const url = extractResultUrl(pollData.data);
        if (!url) providerFailure(`Task ${taskId} báo success nhưng không có URL ảnh.`);
        return { url, taskId };
      }

      if (status === 'fail' || status === 'failed' || status === 'error') {
        const reason = pollData.data?.failReason ?? pollData.data?.error ?? 'không rõ nguyên nhân';
        throw new AppError(502, `Tạo ảnh thất bại: ${reason}`, 'provider_failed');
      }
    }

    providerFailure(`Task ${taskId} quá 6 phút chưa xong.`, USER_MESSAGE.timeout, 'provider_timeout');
  },
};
