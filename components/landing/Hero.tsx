import React from 'react';
import { Link } from 'react-router-dom';
import { APP_HOME } from '../../lib/routes';
import { HeroShowcase } from './HeroShowcase';
import { Reveal } from './Reveal';

/**
 * Hai lợi ích chính, đặt ngay dưới tiêu đề.
 *
 * Tách khỏi thẻ <h1> chứ không nhồi cả ba dòng vào tiêu đề: một tiêu đề ba dòng
 * đọc như câu khẩu hiệu bị đứt hơi, và về mặt cấu trúc trang thì <h1> nên nói
 * đúng MỘT thông điệp. Hai dòng này là lý do mua, nên vẫn để cỡ chữ lớn và đậm.
 */
const BENEFITS = ['Không cần thuê mẫu, không cần studio', 'Nhanh nhất - Tăng 90% hiệu suất bán hàng'];

/** Ba lời hứa ngắn ngay dưới nút bấm — thứ khách quyết định mua hay không. */
const PROMISES = [
  'Giữ nguyên bố cục ảnh mẫu',
  'Chuyển khoản QR, kích hoạt tự động',
  'Ảnh lỗi hoàn điểm ngay',
];

export const Hero: React.FC<{ isLoggedIn: boolean }> = ({ isLoggedIn }) => (
  <section className="relative overflow-hidden pb-14 pt-24 sm:pb-24 sm:pt-28 lg:pt-32">
    {/* Lưới mờ làm nền, mờ dần về phía dưới nhờ mask trong CSS */}
    <div className="lp-grid pointer-events-none absolute inset-0 -z-10" aria-hidden />

    <div className="mx-auto grid max-w-[1280px] items-center gap-10 px-4 sm:gap-14 sm:px-6 lg:grid-cols-2 lg:gap-10">
      <div className="text-center lg:text-left">
        <Reveal>
          {/* Danh sách model dài hơn bề ngang máy hẹp nên phải cho xuống dòng
              thay vì để một dòng duy nhất đẩy tràn ra ngoài. */}
          <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl border border-dark-700 bg-dark-900/80 px-3 py-1.5 text-[11px] text-gray-400 backdrop-blur sm:rounded-full sm:text-xs">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="lp-ping-ring absolute inset-0 rounded-full bg-brand-500" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-brand-500" />
            </span>
            Nano Banana Pro · Nano Banana 2 · GPT Image 2
          </span>
        </Reveal>

        <Reveal delay={90}>
          <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.1] tracking-tight text-gray-100 sm:mt-6 sm:text-5xl lg:text-[3.4rem]">
            TẠO ẢNH ĐẸP
            <br />
            <span className="lp-gradient-text">CHÂN THỰC 100%</span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <ul className="mx-auto mt-5 w-fit max-w-xl space-y-2 sm:mt-6 sm:space-y-2.5 lg:mx-0">
            {BENEFITS.map((benefit) => (
              <li
                key={benefit}
                /* Căn trái từ mobile: hai dòng lợi ích dài, căn giữa thì dòng
                   thứ hai xuống hàng lệch trục, đọc rời rạc. */
                className="flex items-center gap-2.5 text-left text-base font-bold text-gray-200 sm:text-xl"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-500">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={230}>
          <div className="mt-7 flex flex-col items-stretch justify-center gap-2.5 sm:mt-8 sm:flex-row sm:gap-3 lg:justify-start">
            <Link
              to={isLoggedIn ? APP_HOME : '/dang-ky'}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-brand-500/30 transition-all hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-brand-500/45"
            >
              {isLoggedIn ? 'Vào tạo ảnh' : 'Tạo ảnh đầu tiên'}
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
          <ul className="mx-auto mt-6 flex w-fit flex-col items-start gap-1.5 sm:mx-0 sm:mt-8 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-5 sm:gap-y-2 lg:justify-start">
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
