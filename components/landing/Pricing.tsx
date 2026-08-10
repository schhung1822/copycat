import React from 'react';
import { Link } from 'react-router-dom';
import { formatNumber, formatVnd } from '../../lib/format';
import type { SubscriptionPlan, TokenPackage } from '../../types';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

/**
 * Bảng giá dự phòng.
 *
 * Trang giới thiệu phải hiện được giá kể cả khi API bảng giá chưa sẵn sàng —
 * một trang bán hàng mà chỗ giá trống thì coi như hỏng. Số ở đây khớp với dữ
 * liệu khởi tạo trong `server/src/seed.ts`; giá thật luôn được API ghi đè.
 */
const FALLBACK_PLANS: SubscriptionPlan[] = [
  { id: 1, code: 'MONTHLY_1', name: 'Gói 1 tháng', months: 1, priceVnd: 1_500_000, pricePerMonthVnd: 1_500_000, monthlyTokenAllowance: 500_000, description: 'Dùng thử trọn vẹn một tháng.', isPopular: false },
  { id: 2, code: 'MONTHLY_3', name: 'Gói 3 tháng', months: 3, priceVnd: 4_275_000, pricePerMonthVnd: 1_425_000, monthlyTokenAllowance: 500_000, description: 'Tiết kiệm 5% — còn 1.425.000đ/tháng.', isPopular: false },
  { id: 3, code: 'MONTHLY_6', name: 'Gói 6 tháng', months: 6, priceVnd: 8_100_000, pricePerMonthVnd: 1_350_000, monthlyTokenAllowance: 500_000, description: 'Tiết kiệm 10% — còn 1.350.000đ/tháng.', isPopular: true },
  { id: 4, code: 'MONTHLY_12', name: 'Gói 1 năm', months: 12, priceVnd: 15_300_000, pricePerMonthVnd: 1_275_000, monthlyTokenAllowance: 500_000, description: 'Tiết kiệm 15% — ưu đãi tốt nhất.', isPopular: false },
];

const FALLBACK_PACKAGES: TokenPackage[] = [
  { id: 1, code: 'EXTRA_99', name: 'Gói 99.000đ', priceVnd: 99_000, baseTokens: 50_000, bonusTokens: 0, totalTokens: 50_000, pricePerToken: 1.98, bonusPercent: 0, description: null, isPopular: false },
  { id: 2, code: 'EXTRA_199', name: 'Gói 199.000đ', priceVnd: 199_000, baseTokens: 100_000, bonusTokens: 0, totalTokens: 100_000, pricePerToken: 1.99, bonusPercent: 0, description: null, isPopular: false },
  { id: 3, code: 'EXTRA_499', name: 'Gói 499.000đ', priceVnd: 499_000, baseTokens: 250_000, bonusTokens: 0, totalTokens: 250_000, pricePerToken: 2, bonusPercent: 0, description: null, isPopular: true },
  { id: 4, code: 'EXTRA_999', name: 'Gói 999.000đ', priceVnd: 999_000, baseTokens: 500_000, bonusTokens: 0, totalTokens: 500_000, pricePerToken: 2, bonusPercent: 0, description: null, isPopular: false },
  { id: 5, code: 'EXTRA_1999', name: 'Gói 1.999.000đ', priceVnd: 1_999_000, baseTokens: 1_000_000, bonusTokens: 0, totalTokens: 1_000_000, pricePerToken: 2, bonusPercent: 0, description: null, isPopular: false },
];

/** Quyền lợi giống nhau ở mọi chu kỳ — khác nhau chỉ ở giá mỗi tháng. */
const INCLUDED = [
  'Toàn bộ model đang bán, không khoá bản cao cấp',
  'Xuất ảnh tới 4K, 11 tỉ lệ khung hình',
  'Tạo tối đa 4 phương án cho mỗi ảnh mẫu, mỗi lượt',
  'Lịch sử ảnh và sao kê điểm đầy đủ',
  'Ảnh lỗi được hoàn điểm tự động',
];

export const Pricing: React.FC<{ plans?: SubscriptionPlan[]; packages?: TokenPackage[] }> = ({ plans, packages }) => {
  const allPlans = plans && plans.length > 0 ? plans : FALLBACK_PLANS;
  /*
   * Gói 0đ (gói miễn phí) không hiện ở trang giới thiệu: nó do admin cấp tay cho
   * từng khách chứ không bán, mà đứng cạnh các gói trả tiền thì luôn được gắn nhãn
   * "-100%" và hút hết lượt bấm của người mới vào.
   *
   * Vẫn giữ lại nếu bảng giá KHÔNG còn gói trả tiền nào — khu bảng giá trống trơn
   * còn tệ hơn.
   */
  const paidPlans = allPlans.filter((plan) => plan.priceVnd > 0);
  const planList = paidPlans.length > 0 ? paidPlans : allPlans;
  const packageList = packages && packages.length > 0 ? packages : FALLBACK_PACKAGES;

  /*
   * Mức tiết kiệm tính so với gói ngắn nhất đang bán, không viết cứng 1.500.000đ:
   * admin đổi giá gốc trong trang Quản trị thì phần trăm ở đây tự đúng theo.
   */
  const baseline = planList.reduce(
    (max, plan) => Math.max(max, plan.pricePerMonthVnd),
    planList[0]?.pricePerMonthVnd ?? 0,
  );

  return (
    <section id="bang-gia" className="scroll-mt-20 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <SectionHeading
          eyebrow="Bảng giá"
          title="Một mức thuê bao, trả trước càng dài càng rẻ"
          description="Mỗi tháng bạn nhận 500.000 điểm dùng cho mọi model. Hạn mức được cấp lại đầu mỗi chu kỳ tháng và không cộng dồn sang tháng sau."
        />

        <div className="mt-10 grid sm:mt-14 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {planList.map((plan, index) => {
            const savedPercent = baseline > 0 ? Math.round((1 - plan.pricePerMonthVnd / baseline) * 100) : 0;

            return (
              <Reveal
                key={plan.code}
                delay={index * 90}
                className={`relative flex flex-col rounded-2xl border p-5 transition-all sm:p-6 duration-300 hover:-translate-y-1 ${
                  plan.isPopular
                    ? 'border-brand-500 bg-dark-900 shadow-2xl shadow-brand-500/10'
                    : 'border-dark-800 bg-dark-900 hover:border-dark-700'
                }`}
              >
                {plan.isPopular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Được chọn nhiều nhất
                  </span>
                )}

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-100">{plan.name}</h3>
                  {savedPercent > 0 && (
                    <span className="rounded-md bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">
                      -{savedPercent}%
                    </span>
                  )}
                </div>

                <p className="mt-4 text-3xl font-bold tracking-tight text-gray-100">
                  {formatVnd(plan.pricePerMonthVnd)}
                  <span className="text-sm font-medium text-gray-500">/tháng</span>
                </p>

                <p className="mt-1.5 text-xs text-gray-500">
                  {plan.months > 1 ? `Trả trước ${formatVnd(plan.priceVnd)} cho ${plan.months} tháng` : 'Thanh toán theo từng tháng'}
                </p>

                <p className="mt-5 rounded-lg bg-dark-850 px-3 py-2 text-xs text-gray-400">
                  <span className="font-bold text-brand-500">{formatNumber(plan.monthlyTokenAllowance)}</span> điểm mỗi
                  tháng
                </p>

                <Link
                  to="/dang-ky"
                  className={`mt-5 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-colors ${
                    plan.isPopular
                      ? 'bg-brand-500 text-white hover:bg-brand-600'
                      : 'border border-dark-700 text-gray-200 hover:border-brand-500/40 hover:bg-dark-850'
                  }`}
                >
                  Bắt đầu
                </Link>
              </Reveal>
            );
          })}
        </div>

        {/* Quyền lợi chung + gói điểm lẻ */}
        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          <Reveal className="rounded-2xl border border-dark-800 bg-dark-900 p-5 sm:p-6 lg:col-span-3">
            <h3 className="text-sm font-bold text-gray-100">Gói nào cũng có đủ</h3>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
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

          <Reveal delay={100} className="rounded-2xl border border-dark-800 bg-dark-900 p-5 sm:p-6 lg:col-span-2">
            <h3 className="text-sm font-bold text-gray-100">Dùng hết hạn mức giữa tháng?</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              Mua thêm điểm lẻ, cộng vào ví ngay sau khi chuyển khoản. Điểm mua thêm{' '}
              <span className="font-semibold text-gray-300">không hết hạn</span> theo chu kỳ tháng.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {packageList.map((pkg) => (
                <span
                  key={pkg.code}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    pkg.isPopular
                      ? 'border-brand-500/40 bg-brand-500/10 text-gray-200'
                      : 'border-dark-700 bg-dark-850 text-gray-400'
                  }`}
                >
                  <span className="font-bold text-gray-200">{formatVnd(pkg.priceVnd)}</span>
                  <span className="mx-1 text-gray-600">·</span>
                  {formatNumber(pkg.totalTokens)} điểm
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={120}>
          <p className="mt-8 text-center text-xs text-gray-500">
            Thanh toán bằng chuyển khoản ngân hàng qua mã QR. Xem chi tiết ở{' '}
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
