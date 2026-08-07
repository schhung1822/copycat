import React from 'react';
import { Link } from 'react-router-dom';
import { HeroShowcase } from './HeroShowcase';
import { Reveal } from './Reveal';

/** Ba lời hứa ngắn ngay dưới nút bấm — thứ khách quyết định mua hay không. */
const PROMISES = [
  'Giữ nguyên bố cục ảnh mẫu',
  'Chuyển khoản QR, kích hoạt tự động',
  'Ảnh lỗi hoàn token ngay',
];

export const Hero: React.FC<{ isLoggedIn: boolean }> = ({ isLoggedIn }) => (
  <section className="relative overflow-hidden pb-20 pt-28 sm:pb-28 sm:pt-32">
    {/* Lưới mờ làm nền, mờ dần về phía dưới nhờ mask trong CSS */}
    <div className="lp-grid pointer-events-none absolute inset-0 -z-10" aria-hidden />

    <div className="mx-auto grid max-w-[1280px] items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-10">
      <div className="text-center lg:text-left">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-dark-700 bg-dark-900/80 px-3 py-1.5 text-xs text-gray-400 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="lp-ping-ring absolute inset-0 rounded-full bg-brand-500" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-brand-500" />
            </span>
            Nano Banana Pro · Nano Banana 2 · GPT Image 2
          </span>
        </Reveal>

        <Reveal delay={90}>
          <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-gray-100 sm:text-5xl lg:text-[3.4rem]">
            Thấy một thiết kế đẹp?
            <br />
            <span className="lp-gradient-text">Đưa sản phẩm của bạn vào đó.</span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-400 sm:text-lg lg:mx-0">
            Design Copycat AI học lại bố cục, ánh sáng và phong cách của ảnh mẫu bạn đưa vào, rồi dựng lại y như vậy với
            chính sản phẩm của bạn. Không cần biết Photoshop, không cần thuê designer cho từng chiến dịch.
          </p>
        </Reveal>

        <Reveal delay={230}>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row lg:justify-start">
            <Link
              to={isLoggedIn ? '/' : '/dang-ky'}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-brand-500/30 transition-all hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-brand-500/45"
            >
              {isLoggedIn ? 'Vào xưởng ảnh' : 'Tạo ảnh đầu tiên'}
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-5-6l6 6-6 6" />
              </svg>
            </Link>

            <a
              href="#quy-trinh"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-dark-700 bg-dark-900/60 px-7 py-3.5 text-sm font-bold text-gray-200 backdrop-blur transition-colors hover:border-dark-600 hover:bg-dark-850"
            >
              Xem cách hoạt động
            </a>
          </div>
        </Reveal>

        <Reveal delay={300}>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 lg:justify-start">
            {PROMISES.map((promise) => (
              <li key={promise} className="flex items-center gap-1.5 text-xs text-gray-500">
                <svg className="h-4 w-4 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {promise}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <Reveal delay={200} anim="zoom" className="lg:pl-4">
        <HeroShowcase />
      </Reveal>
    </div>
  </section>
);
