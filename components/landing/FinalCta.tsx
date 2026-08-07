import React from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from './Reveal';

/** Lời mời cuối trang — chốt lại cho người đã đọc hết. */
export const FinalCta: React.FC<{ isLoggedIn: boolean }> = ({ isLoggedIn }) => (
  <section className="px-4 py-20 sm:px-6 sm:py-28">
    <Reveal anim="zoom" className="mx-auto max-w-4xl">
      <div className="lp-gradient-border overflow-hidden rounded-3xl p-px shadow-2xl shadow-brand-500/10">
        <div className="relative overflow-hidden rounded-[23px] bg-dark-900 px-6 py-14 text-center sm:px-14">
          {/* Vệt màu trôi phía sau, chỉ trang trí */}
          <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden>
            <div className="lp-blob absolute -left-16 -top-16 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl" />
            <div
              className="lp-blob absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-orange-400/15 blur-3xl"
              style={{ animationDelay: '-9s' }}
            />
          </div>

          <div className="relative">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-gray-100 sm:text-4xl">
              Ảnh mẫu bạn thích đang mở sẵn trong tab kia rồi.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-400">
              Tạo tài khoản, chọn gói và dựng tấm ảnh đầu tiên ngay hôm nay. Chuyển khoản qua QR, hệ thống kích hoạt tự
              động trong vài phút.
            </p>

            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
              <Link
                to={isLoggedIn ? '/' : '/dang-ky'}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-brand-500/30 transition-all hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-brand-500/45"
              >
                {isLoggedIn ? 'Vào xưởng ảnh' : 'Tạo tài khoản miễn phí'}
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
                href="#bang-gia"
                className="inline-flex items-center justify-center rounded-full border border-dark-700 px-8 py-3.5 text-sm font-bold text-gray-200 transition-colors hover:border-dark-600 hover:bg-dark-850"
              >
                Xem lại bảng giá
              </a>
            </div>

            <p className="mt-5 text-xs text-gray-500">Tạo tài khoản không mất phí — chỉ trả tiền khi bạn chọn gói.</p>
          </div>
        </div>
      </div>
    </Reveal>
  </section>
);
