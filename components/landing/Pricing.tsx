import React from 'react';
import { Link } from 'react-router-dom';
import { formatNumber, formatVnd } from '../../lib/format';
import { modelShortName, pickReferenceModel, roundedImageCount } from '../../lib/imageEstimate';
import type { ModelOption, TokenPackage } from '../../types';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

/**
 * Bảng giá dự phòng.
 *
 * Trang giới thiệu phải hiện được giá kể cả khi API bảng giá chưa sẵn sàng —
 * một trang bán hàng mà chỗ giá trống thì coi như hỏng. Số ở đây khớp với dữ
 * liệu khởi tạo trong `server/src/seed.ts`; giá thật luôn được API ghi đè.
 */
const FALLBACK_PACKAGES: TokenPackage[] = [
  { id: 1, code: 'EXTRA_99', name: 'Gói 99.000đ', priceVnd: 99_000, baseTokens: 50_000, bonusTokens: 0, totalTokens: 50_000, pricePerToken: 1.98, bonusPercent: 0, description: 'Mua nhanh để dùng thử.', isPopular: false },
  { id: 2, code: 'EXTRA_199', name: 'Gói 199.000đ', priceVnd: 199_000, baseTokens: 100_000, bonusTokens: 0, totalTokens: 100_000, pricePerToken: 1.99, bonusPercent: 0, description: 'Hợp cho nhu cầu vài chục ảnh mỗi tháng.', isPopular: false },
  { id: 3, code: 'EXTRA_499', name: 'Gói 499.000đ', priceVnd: 499_000, baseTokens: 250_000, bonusTokens: 0, totalTokens: 250_000, pricePerToken: 2, bonusPercent: 0, description: 'Lựa chọn phổ biến nhất cho shop bán hàng.', isPopular: true },
  { id: 4, code: 'EXTRA_999', name: 'Gói 999.000đ', priceVnd: 999_000, baseTokens: 500_000, bonusTokens: 0, totalTokens: 500_000, pricePerToken: 2, bonusPercent: 0, description: 'Đủ dùng cho cả một chiến dịch.', isPopular: false },
  { id: 5, code: 'EXTRA_1999', name: 'Gói 1.999.000đ', priceVnd: 1_999_000, baseTokens: 1_000_000, bonusTokens: 0, totalTokens: 1_000_000, pricePerToken: 2, bonusPercent: 0, description: 'Cho đội chạy nội dung số lượng lớn.', isPopular: false },
];

/** Quyền lợi giống nhau ở mọi gói — khác nhau chỉ ở số điểm nhận được. */
const INCLUDED = [
  'Không phí duy trì, không thuê bao tháng',
  'Điểm không hết hạn — mua rồi dùng dần',
  'Toàn bộ model đang bán, không khoá bản cao cấp',
  'Xuất ảnh tới 4K, 11 tỉ lệ khung hình',
  'Tạo tối đa 4 phương án cho mỗi ảnh mẫu, mỗi lượt',
  'Ảnh lỗi được hoàn điểm tự động',
];

export const Pricing: React.FC<{ packages?: TokenPackage[]; models?: ModelOption[] }> = ({ packages, models }) => {
  const packageList = packages && packages.length > 0 ? packages : FALLBACK_PACKAGES;

  // Model mốc và cách làm tròn nằm ở lib/imageEstimate để trang này và trang Mua
  // điểm luôn ra cùng một con số cho cùng một gói.
  const referenceModel = pickReferenceModel(models);

  return (
    <section id="bang-gia" className="scroll-mt-20 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <SectionHeading
          eyebrow="Bảng giá"
          title={
            <>
              Mua điểm là <span className="lp-gradient-text">dùng được ngay</span>
            </>
          }
          description="Không phí duy trì, không cam kết thời hạn. Bạn chỉ trả tiền cho số ảnh thực sự tạo ra, và số điểm đã mua không bao giờ hết hạn."
        />

        {/*
          Flex-wrap chứ không phải grid: bảng giá có 5 gói mà mỗi hàng 4 cột, nên
          gói cuối luôn đứng lẻ một mình. Grid ghim nó vào cột đầu bên trái trông
          như lỗi bố cục; flex + justify-center đưa nó về giữa hàng dưới.

          Bề rộng trừ đi phần khoảng cách: gap-4 = 1rem, 4 cột có 3 khoảng nên mỗi
          thẻ nhường 0,75rem; 2 cột có 1 khoảng nên nhường 0,5rem.
        */}
        <div className="mt-10 flex flex-wrap justify-center gap-4 sm:mt-14">
          {packageList.map((pkg, index) => {
            const images = referenceModel ? roundedImageCount(pkg.totalTokens, referenceModel.tokenCost) : 0;

            return (
              <Reveal
                key={pkg.code}
                delay={index * 80}
                className={`relative flex w-full flex-col rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 sm:w-[calc(50%-0.5rem)] sm:p-6 lg:w-[calc(25%-0.75rem)] ${
                  pkg.isPopular
                    ? 'border-brand-500 bg-dark-900 shadow-2xl shadow-brand-500/10'
                    : 'border-dark-800 bg-dark-900 hover:border-dark-700'
                }`}
              >
                {pkg.isPopular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Được chọn nhiều nhất
                  </span>
                )}

                <p className="text-3xl font-bold tracking-tight text-gray-100">{formatVnd(pkg.priceVnd)}</p>

                {/*
                  Số to LUÔN là tổng điểm nhận được, phần thưởng ghi rõ là "đã
                  gồm". Để "(+50.000 thưởng)" ngay sau tổng thì đọc ra thành cộng
                  thêm một lần nữa — hứa gấp đôi phần thưởng thật.
                */}
                <p className="mt-4 rounded-lg bg-dark-850 px-3 py-2 text-xs text-gray-400">
                  <span className="font-bold text-brand-500">{formatNumber(pkg.totalTokens)}</span> điểm
                  {pkg.bonusTokens > 0 && (
                    <span className="mt-0.5 block text-[11px] text-green-400">
                      Đã gồm {formatNumber(pkg.bonusTokens)} điểm thưởng
                    </span>
                  )}
                </p>

                {images > 0 && (
                  <p className="mt-2 text-xs text-gray-500">Tạo được khoảng {formatNumber(images)} ảnh</p>
                )}

                {pkg.description && <p className="mt-2 text-xs leading-relaxed text-gray-600">{pkg.description}</p>}

                <Link
                  to="/dang-ky"
                  className={`mt-5 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-colors ${
                    pkg.isPopular
                      ? 'bg-brand-500 text-white hover:bg-brand-600'
                      : 'border border-dark-700 text-gray-200 hover:border-brand-500/40 hover:bg-dark-850'
                  }`}
                >
                  Mua điểm
                </Link>
              </Reveal>
            );
          })}
        </div>

        {referenceModel && (
          <Reveal delay={120}>
            <p className="mt-4 text-center text-[11px] text-gray-600">
              {/* Số điểm đọc từ bảng giá chứ không gõ tay — gõ tay là sớm muộn
                  cũng lệch với con số thật khi admin chỉnh bảng giá. */}
              Số ảnh tính theo <strong className="text-gray-500">{modelShortName(referenceModel)}</strong> ở{' '}
              {referenceModel.resolution} ({formatNumber(referenceModel.tokenCost)} điểm/ảnh). Chọn ảnh 1K được nhiều
              hơn, chọn 4K thì ít hơn.
            </p>
          </Reveal>
        )}

        <Reveal delay={140} className="mt-6 rounded-2xl border border-dark-800 bg-dark-900 p-5 sm:p-6">
          <h3 className="text-sm font-bold text-gray-100">Gói nào cũng có đủ</h3>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-gray-400">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-8 text-center text-xs text-gray-500">
            Thanh toán bằng chuyển khoản ngân hàng qua mã QR, điểm cộng tự động. Xem chi tiết ở{' '}
            <Link to="/chinh-sach" className="font-semibold text-brand-500 underline-offset-2 hover:underline">
              Chính sách &amp; Điều khoản
            </Link>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
};
