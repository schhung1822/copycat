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
    throw new AppError(500, `Chưa hỗ trợ nhà cung cấp "${name}".`, 'unknown_provider');
  }
  return provider;
}

export const listProviders = (): string[] => Object.keys(PROVIDERS);

export const providerStatus = (): { name: string; configured: boolean }[] =>
  Object.values(PROVIDERS).map((provider) => ({ name: provider.name, configured: provider.isConfigured() }));

export type { ImageProvider, GenerateRequest, GenerateResult, ValidateInput } from './types.js';
export { KNOWN_KIE_MODELS } from './kie.js';
