import React from 'react';
import { formatNumber } from '../../lib/format';
import type { ModelOption } from '../../types';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

/**
 * Mô tả bán hàng cho từng dòng model.
 *
 * Chỉ giữ phần chữ ở đây; số điểm luôn lấy từ bảng giá thật (`models`) để trang
 * giới thiệu không bao giờ báo giá lệch với trang tạo ảnh sau khi admin chỉnh giá.
 *
 * Thứ tự trong mảng là thứ tự hiện trên trang: đặt bản mạnh nhất trước.
 */
const FAMILY_COPY: { family: string; name: string; tagline: string; best: string; highlight?: boolean }[] = [
  {
    family: 'gpt-image-2',
    name: 'GPT Image 2',
    tagline: 'Xử lý chữ và bố cục quảng cáo tốt, lại là mức giá dễ chịu nhất.',
    best: 'Banner nhiều chữ, thử bố cục trước khi chạy bản đẹp',
  },
  {
    family: 'nano-banana-2',
    name: 'Nano Banana 2',
    tagline: 'Cân bằng giữa độ đẹp và tốc độ, an toàn cho phần lớn nhu cầu hằng ngày.',
    best: 'Ảnh đăng mạng xã hội mỗi ngày',
    highlight: true,
  },
  {
    family: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    tagline: 'Bám sát ảnh mẫu nhất, giữ đúng chi tiết và màu sản phẩm.',
    best: 'Ảnh đăng chính thức, ảnh sản phẩm lên sàn',
  },
];

/** Hạn mức tháng dùng để ước lượng "tạo được bao nhiêu ảnh". */
const MONTHLY_ALLOWANCE = 500_000;

/** Bảng giá dự phòng, dùng khi không gọi được API — trang vẫn phải đọc được. */
const FALLBACK: ModelOption[] = [
  { code: 'nano-banana-pro-1k', label: '', family: 'nano-banana-pro', resolution: '1K', tokenCost: 2520, isEstimateReference: false, notes: null },
  { code: 'nano-banana-pro-2k', label: '', family: 'nano-banana-pro', resolution: '2K', tokenCost: 2520, isEstimateReference: false, notes: null },
  { code: 'nano-banana-pro-4k', label: '', family: 'nano-banana-pro', resolution: '4K', tokenCost: 3360, isEstimateReference: false, notes: null },
  { code: 'nano-banana-2-1k', label: '', family: 'nano-banana-2', resolution: '1K', tokenCost: 1120, isEstimateReference: false, notes: null },
  { code: 'nano-banana-2-2k', label: '', family: 'nano-banana-2', resolution: '2K', tokenCost: 1680, isEstimateReference: false, notes: null },
  { code: 'nano-banana-2-4k', label: '', family: 'nano-banana-2', resolution: '4K', tokenCost: 2520, isEstimateReference: false, notes: null },
  { code: 'gpt-image-2-1k', label: '', family: 'gpt-image-2', resolution: '1K', tokenCost: 840, isEstimateReference: false, notes: null },
  { code: 'gpt-image-2-2k', label: '', family: 'gpt-image-2', resolution: '2K', tokenCost: 1400, isEstimateReference: true, notes: null },
  { code: 'gpt-image-2-4k', label: '', family: 'gpt-image-2', resolution: '4K', tokenCost: 2240, isEstimateReference: false, notes: null },
];

const RESOLUTION_ORDER = ['1K', '2K', '4K'];

export const Models: React.FC<{ models?: ModelOption[] }> = ({ models }) => {
  const source = models && models.length > 0 ? models : FALLBACK;

  const cards = FAMILY_COPY.map((copy) => {
    const tiers = source
      .filter((model) => model.family === copy.family)
      .sort((a, b) => RESOLUTION_ORDER.indexOf(a.resolution) - RESOLUTION_ORDER.indexOf(b.resolution));
    return { ...copy, tiers };
  }).filter((card) => card.tiers.length > 0);

  return (
    <section id="model" className="scroll-mt-20 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <SectionHeading
          eyebrow="Model AI"
          title="Chọn model theo việc, không phải theo lời quảng cáo"
          description="Điểm trừ theo đúng model và độ phân giải bạn chọn, hiện rõ trước khi bấm tạo. Cột bên phải là số ảnh ước tính nếu dùng trọn hạn mức 500.000 điểm một tháng."
        />

        <div className="mt-10 grid sm:mt-14 gap-5 lg:grid-cols-3">
          {cards.map((card, index) => (
            <Reveal
              key={card.family}
              delay={index * 110}
              className={`group relative flex flex-col rounded-2xl border p-5 transition-all sm:p-6 duration-300 hover:-translate-y-1 ${
                card.highlight
                  ? 'border-brand-500/40 bg-dark-900 shadow-xl shadow-brand-500/5'
                  : 'border-dark-800 bg-dark-900 hover:border-dark-700'
              }`}
            >
              {card.highlight && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-brand-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Phổ biến nhất
                </span>
              )}

              <h3 className="text-lg font-bold text-gray-100">{card.name}</h3>
              <p className="mt-2 min-h-[3rem] text-sm leading-relaxed text-gray-400">{card.tagline}</p>

              <div className="mt-5 space-y-1.5">
                {card.tiers.map((tier) => (
                  <div
                    key={tier.code}
                    className="flex items-center justify-between rounded-lg bg-dark-850 px-3 py-2 text-sm transition-colors group-hover:bg-dark-800"
                  >
                    <span className="font-semibold text-gray-200">{tier.resolution}</span>
                    <span className="text-xs text-gray-500">
                      <span className="font-semibold text-gray-300">{formatNumber(tier.tokenCost)}</span> điểm
                      <span className="mx-1.5 text-gray-600">·</span>~
                      {formatNumber(Math.floor(MONTHLY_ALLOWANCE / Math.max(tier.tokenCost, 1)))} ảnh
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-5 border-t border-dark-800 pt-4 text-xs leading-relaxed text-gray-500">
                <span className="font-bold text-gray-400">Hợp nhất với: </span>
                {card.best}
              </p>
            </Reveal>
          ))}
        </div>

        {/* <Reveal delay={140}>
          <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-gray-500">
            Quy ước điểm rất đơn giản: <span className="font-semibold text-gray-400">1 điểm = 1đ giá vốn</span> trả cho
            nhà cung cấp mô hình. Bạn luôn thấy đúng chi phí thật của mỗi tấm ảnh.
          </p>
        </Reveal> */}
      </div>
    </section>
  );
};
