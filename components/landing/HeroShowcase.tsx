import React from 'react';

/**
 * Ảnh minh hoạ ở đầu trang: hai ảnh đầu vào → một bài đăng Facebook trên điện thoại.
 *
 * Đây là lời hứa của sản phẩm kể bằng hình: mượn bố cục của ảnh mẫu (`mau.webp`),
 * thay bằng sản phẩm của khách (`ao.webp`), ra thành ảnh đăng bán được (`kq.webp`).
 * Đặt kết quả trong khung điện thoại kèm giao diện Facebook để người xem thấy
 * ngay ảnh đó dùng vào việc gì, thay vì chỉ là một tấm ảnh đẹp trôi nổi.
 *
 * Ảnh nằm trong `public/img/` nên tham chiếu bằng đường dẫn tuyệt đối từ gốc web.
 */

const IMAGES = {
  reference: { src: '/img/mau.webp', alt: 'Ảnh mẫu: poster quảng cáo áo thun thể thao' },
  product: { src: '/img/ao.webp', alt: 'Ảnh sản phẩm: bộ áo và quần thể thao chụp trên nền trắng' },
  result: { src: '/img/kq.webp', alt: 'Ảnh kết quả: bộ sản phẩm được dựng lại theo đúng bố cục của poster mẫu' },
};

/** Thẻ ảnh đầu vào ở cột trái. */
const InputCard: React.FC<{ label: string; badge: string; src: string; alt: string }> = ({
  label,
  badge,
  src,
  alt,
}) => (
  <div className="flex-1 rounded-2xl border border-dark-700 bg-dark-900 p-2 shadow-xl shadow-black/10 sm:flex-none">
    <div className="mb-1.5 flex items-center justify-between px-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <span className="rounded bg-dark-800 px-1.5 py-0.5 text-[9px] font-semibold text-gray-400">{badge}</span>
    </div>
    <img src={src} alt={alt} loading="eager" className="aspect-square w-full rounded-xl object-cover" />
  </div>
);

/**
 * Giao diện bài đăng Facebook trong khung điện thoại.
 *
 * Màu ở đây cố tình viết cứng theo bảng màu Facebook chứ KHÔNG dùng biến theme
 * của trang: đây là hình chụp một màn hình điện thoại, nó phải trông y như thật
 * dù trang đang ở chế độ sáng hay tối. Nếu để nó đổi màu theo trang thì người
 * xem không còn nhận ra đó là Facebook nữa.
 */
const FacebookPost: React.FC = () => (
  <div className="flex h-full flex-col bg-white text-[#050505]">
    {/* Thanh trạng thái điện thoại */}
    <div className="flex items-center justify-between px-4 pb-1 pt-2 text-[10px] font-semibold text-[#050505]">
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M1 11h2v4H1zm4-3h2v7H5zm4-3h2v10H9zm4-3h2v13h-2z" />
        </svg>
        <svg className="h-2.5 w-3.5" viewBox="0 0 24 12" fill="currentColor" aria-hidden>
          <rect x="0.5" y="1" width="19" height="10" rx="2.5" fill="none" stroke="currentColor" />
          <rect x="2" y="2.5" width="14" height="7" rx="1.2" />
          <rect x="21" y="4" width="2" height="4" rx="1" />
        </svg>
      </span>
    </div>

    {/* Thanh trên của ứng dụng */}
    <div className="flex items-center justify-between border-b border-[#E4E6EB] px-3 pb-2 pt-1">
      <span className="text-base font-extrabold tracking-tight text-[#1877F2]">facebook</span>
      <span className="flex gap-1.5">
        {[0, 1].map((dot) => (
          <span key={dot} className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E4E6EB]">
            <svg className="h-2.5 w-2.5 text-[#050505]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" d={dot === 0 ? 'M12 5v14M5 12h14' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </span>
        ))}
      </span>
    </div>

    {/* Đầu bài đăng */}
    <div className="flex items-center gap-2 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#050505] text-[11px] font-bold text-white">
        V
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold leading-tight">Veroww Mens Fashion</p>
        <p className="flex items-center gap-1 text-[9px] leading-tight text-[#65676B]">
          Được tài trợ
          <span>·</span>
          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.2 0 2.3 1.9 2.8 4.5H9.2C9.7 5.9 10.8 4 12 4zM8.8 10.5h6.4a16 16 0 010 3H8.8a16 16 0 010-3zM12 20c-1.2 0-2.3-1.9-2.8-4.5h5.6C14.3 18.1 13.2 20 12 20z" />
          </svg>
        </p>
      </div>
      <svg className="h-4 w-4 shrink-0 text-[#65676B]" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <circle cx="5" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="19" cy="12" r="1.8" />
      </svg>
    </div>

    {/* Nội dung bài đăng */}
    <p className="px-3 pb-2 text-[11px] leading-snug">
      Bộ thể thao nam mới về — chất mát, form rộng thoải mái.{' '}
      <span className="text-[#65676B]">Freeship đơn từ 299k 🔥</span>
    </p>

    {/* Ảnh kết quả do hệ thống tạo ra */}
    <img src={IMAGES.result.src} alt={IMAGES.result.alt} loading="eager" className="aspect-square w-full object-cover" />

    {/* Thanh liên kết kiểu quảng cáo */}
    <div className="flex items-center gap-2 bg-[#F0F2F5] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[8px] uppercase tracking-wide text-[#65676B]">verowwwear.com</p>
        <p className="truncate text-[11px] font-semibold leading-tight">Sports T-Shirt Set — Premium</p>
      </div>
      <span className="shrink-0 rounded-md bg-[#E4E6EB] px-2.5 py-1 text-[10px] font-semibold">Mua ngay</span>
    </div>

    {/* Lượt tương tác */}
    <div className="flex items-center justify-between border-b border-[#E4E6EB] px-3 py-1.5 text-[9px] text-[#65676B]">
      <span className="flex items-center gap-1">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#1877F2] text-[7px] text-white">
          👍
        </span>
        <span className="-ml-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#F3425F] text-[7px] text-white">
          ❤️
        </span>
        <span className="ml-0.5">1,2K</span>
      </span>
      <span>86 bình luận · 41 lượt chia sẻ</span>
    </div>

    {/* Hàng nút cuối bài */}
    <div className="flex items-center justify-around px-2 py-1.5 text-[10px] font-semibold text-[#65676B]">
      {['Thích', 'Bình luận', 'Chia sẻ'].map((action) => (
        <span key={action}>{action}</span>
      ))}
    </div>
  </div>
);

export const HeroShowcase: React.FC = () => (
  <div className="relative mx-auto w-full max-w-md lg:max-w-none">
    {/* Vệt màu trôi phía sau, chỉ để tạo chiều sâu */}
    <div className="pointer-events-none absolute -inset-10 -z-10" aria-hidden>
      <div className="lp-blob absolute left-0 top-4 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" />
      <div
        className="lp-blob absolute bottom-0 right-4 h-64 w-64 rounded-full bg-orange-400/20 blur-3xl"
        style={{ animationDelay: '-7s' }}
      />
    </div>

    {/*
      Điện thoại quá cao để đứng cạnh hai ảnh vuông trên màn hình hẹp, nên dưới
      breakpoint sm thì xếp dọc: hai ảnh đầu vào nằm ngang ở trên, mũi tên quay
      xuống, điện thoại ở dưới.
    */}
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-3">
      <div className="flex w-full gap-3 sm:w-[8.5rem] sm:flex-col md:w-[9.5rem]">
        <InputCard label="Ảnh mẫu" badge="Layout" {...IMAGES.reference} />
        <InputCard label="Sản phẩm" badge="Của bạn" {...IMAGES.product} />
      </div>

      {/* Mũi tên nối hai bên */}
      <div className="flex shrink-0 flex-col items-center gap-1.5" aria-hidden>
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-brand-500/40 bg-brand-500/10">
          <span className="lp-ping-ring absolute inset-0 rounded-full border border-brand-500/50" />
          <svg
            className="h-4 w-4 rotate-90 text-brand-500 sm:rotate-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-5-6l6 6-6 6" />
          </svg>
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">AI</span>
      </div>

      {/* Khung điện thoại chứa bài đăng */}
      <div className="w-[15rem] shrink-0 sm:w-[14rem] md:w-[15.5rem]">
        <div className="rounded-[2rem] border border-dark-700 bg-[#0b0b0d] p-2 shadow-2xl shadow-black/30">
          <div className="relative overflow-hidden rounded-[1.6rem] bg-white">
            {/* Tai thỏ */}
            <span
              className="absolute left-1/2 top-1.5 z-10 h-3.5 w-16 -translate-x-1/2 rounded-full bg-[#0b0b0d]"
              aria-hidden
            />
            <FacebookPost />
          </div>
        </div>
      </div>
    </div>

    {/* Thẻ nổi quanh cụm ảnh */}
    <div className="lp-float absolute -left-3 -top-7 hidden rounded-xl border border-dark-700 bg-dark-900/95 px-3 py-2 shadow-xl backdrop-blur lg:block">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">Giữ nguyên</p>
      <p className="text-sm font-bold text-gray-100">Bố cục ảnh mẫu</p>
    </div>

    <div
      className="lp-float absolute -bottom-7 -right-2 hidden rounded-xl border border-dark-700 bg-dark-900/95 px-3 py-2 shadow-xl backdrop-blur lg:block"
      style={{ animationDelay: '-3s' }}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="lp-ping-ring absolute inset-0 rounded-full bg-green-400" />
          <span className="relative h-2 w-2 rounded-full bg-green-400" />
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Đăng được ngay</p>
          <p className="text-sm font-bold text-gray-100">Không cần chỉnh thêm</p>
        </div>
      </div>
    </div>
  </div>
);
