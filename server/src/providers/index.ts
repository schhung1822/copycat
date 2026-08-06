import { AppError } from '../lib/errors.js';
import { kieProvider } from './kie.js';
import type { ImageProvider } from './types.js';

/** Danh bạ nhà cung cấp. Thêm adapter mới thì khai báo thêm ở đây. */
const PROVIDERS: Record<string, ImageProvider> = {
  [kieProvider.name]: kieProvider,
};

export function getProvider(name: string): ImageProvider {
  const provider = PROVIDERS[name];
  if (!provider) {
    // Sai cấu hình bảng giá — chi tiết ra log, khách chỉ thấy câu chung.
    console.error(`[provider] Bảng giá trỏ tới nhà cung cấp "${name}" nhưng chưa có adapter nào tên đó.`);
    throw new AppError(500, 'Hệ thống chưa sẵn sàng tạo ảnh. Vui lòng liên hệ quản trị viên.', 'unknown_provider');
  }
  return provider;
}

export const listProviders = (): string[] => Object.keys(PROVIDERS);

export const providerStatus = (): { name: string; configured: boolean }[] =>
  Object.values(PROVIDERS).map((provider) => ({ name: provider.name, configured: provider.isConfigured() }));

export type { ImageProvider, GenerateRequest, GenerateResult, ValidateInput } from './types.js';
export { KNOWN_KIE_MODELS } from './kie.js';
