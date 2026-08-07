import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Sample {
  /** Nhãn ngành hàng, hiện ở góc trên của mẫu */
  label: string;
  reference: { src: string; alt: string };
  product: { src: string; alt: string };
  result: { src: string; alt: string };
  /** Nội dung bài đăng Facebook bọc quanh ảnh kết quả */
  post: { page: string; caption: string; domain: string; headline: string };
}

const SAMPLES: Sample[] = [
  {
    label: 'Thời trang thể thao',
    reference: { src: '/img/mau.webp', alt: 'Ảnh mẫu: poster quảng cáo áo thun thể thao' },
    product: { src: '/img/ao.webp', alt: 'Ảnh sản phẩm: bộ áo và quần thể thao chụp trên nền trắng' },
    result: {
      src: '/img/kq.webp',
      alt: 'Ảnh kết quả: bộ sản phẩm được dựng lại theo đúng bố cục của poster mẫu',
    },
    post: {
      page: 'Veroww Mens Fashion',
      caption: 'Bộ thể thao nam mới về — chất mát, form rộng thoải mái. Freeship đơn từ 299k 🔥',
      domain: 'verowwwear.com',
      headline: 'Sports T-Shirt Set — Premium',
    },
  },
  {
    label: 'Mỹ phẩm',
    reference: { src: '/img/mau2.webp', alt: 'Ảnh mẫu ngành mỹ phẩm' },
    product: { src: '/img/ao2.webp', alt: 'Ảnh sản phẩm mỹ phẩm' },
    result: { src: '/img/kq2.webp', alt: 'Ảnh kết quả ngành mỹ phẩm' },
    post: {
      page: 'Tên shop của bạn',
      caption: 'Viết nội dung bài đăng mẫu của ngành hàng này vào đây.',
      domain: 'tenshop.com',
      headline: 'Tên sản phẩm — dòng mô tả ngắn',
    },
  },
  {
    label: 'Đồ gia dụng',
    reference: { src: '/img/kq3.webp', alt: 'Ảnh mẫu ngành đồ gia dụng' },
    product: { src: '/img/ao.webp', alt: 'Ảnh sản phẩm đồ gia dụng' },
    result: { src: '/img/mau3.webp', alt: 'Ảnh kết quả ngành đồ gia dụng' },
    post: {
      page: 'Tên shop của bạn',
      caption: 'Viết nội dung bài đăng mẫu của ngành hàng này vào đây.',
      domain: 'tenshop.com',
      headline: 'Tên sản phẩm — dòng mô tả ngắn',
    },
  },
];

const AUTOPLAY_MS = 6_000;
/** Kéo ngang bao nhiêu pixel thì tính là một cú vuốt, dưới mức này coi như bấm nhầm. */
const SWIPE_THRESHOLD_PX = 45;

/** Ô giữ chỗ cho mẫu chưa có ảnh. */
const Placeholder: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-dark-700 bg-dark-850 p-3 text-center">
    <svg className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm0 10l4.5-4.5 3.5 3.5 3-3L20 16M9 9.5a1 1 0 11-2 0 1 1 0 012 0z"
      />
    </svg>
    {label && <span className="text-[10px] leading-tight text-gray-600">{label}</span>}
  </div>
);

/**
 * Ảnh vuông, tự rơi về ô giữ chỗ khi chưa có đường dẫn.
 *
 * `draggable={false}` là bắt buộc: mặc định trình duyệt cho kéo-thả ảnh, thao
 * tác đó nuốt mất cú vuốt bằng chuột nên slider không đổi mẫu.
 */
const SquareImage: React.FC<{ image: { src: string; alt: string }; className?: string; label?: string }> = ({
  image,
  className = '',
  label,
}) =>
  image.src ? (
    <img
      src={image.src}
      alt={image.alt}
      loading="eager"
      draggable={false}
      className={`aspect-square w-full select-none object-cover ${className}`}
    />
  ) : (
    <div className={`aspect-square w-full ${className}`}>
      <Placeholder label={label} />
    </div>
  );

/** Thẻ ảnh đầu vào ở cột trái, có số thứ tự nhỏ để đọc ra trình tự. */
const InputCard: React.FC<{ step: number; label: string; image: { src: string; alt: string } }> = ({
  step,
  label,
  image,
}) => (
  <div className="group/card flex-1 rounded-2xl border border-dark-700/80 bg-dark-900/90 p-1.5 shadow-lg shadow-black/10 backdrop-blur transition-colors duration-300 hover:border-dark-600 sm:flex-none">
    <div className="mb-1.5 flex items-center gap-1.5 px-1 pt-0.5">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-dark-800 text-[9px] font-bold text-gray-400">
        {step}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
    </div>
    <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-white/5">
      <SquareImage image={image} className="transition-transform duration-500 group-hover/card:scale-[1.04]" />
    </div>
  </div>
);

/**
 * Bài đăng Facebook bọc quanh ảnh kết quả.
 *
 * Màu ở đây cố tình viết cứng theo bảng màu Facebook chứ KHÔNG dùng biến theme
 * của trang: người xem phải nhận ra ngay đây là một bài đăng Facebook, dù trang
 * đang ở chế độ sáng hay tối. Để nó đổi màu theo theme là mất luôn ý nghĩa.
 *
 * Phần chú thích bị khoá ở hai dòng (`line-clamp-2`) để mọi mẫu cao bằng nhau —
 * các bài đăng nằm chồng lên nhau trong cùng một ô lưới, lệch chiều cao là
 * khung sẽ giật mỗi lần chuyển mẫu.
 */
const FacebookPost: React.FC<{ sample: Sample }> = ({ sample }) => (
  <div className="overflow-hidden rounded-[1.15rem] bg-white text-[#050505]">
    {/* Đầu bài đăng */}
    <div className="flex items-center gap-2 px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#050505] text-[11px] font-bold text-white">
        {sample.post.page.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold leading-tight">{sample.post.page}</p>
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

    <p className="line-clamp-2 min-h-[2rem] px-3 pb-2 text-[11px] leading-snug">{sample.post.caption}</p>

    {/* Ảnh kết quả do hệ thống tạo ra */}
    <SquareImage image={sample.result} label="Ảnh kết quả" />

    {/* Thanh liên kết kiểu quảng cáo */}
    <div className="flex items-center gap-2 bg-[#F0F2F5] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[8px] uppercase tracking-wide text-[#65676B]">{sample.post.domain}</p>
        <p className="truncate text-[11px] font-semibold leading-tight">{sample.post.headline}</p>
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

/**
 * Cầu nối giữa hai ảnh đầu vào và kết quả.
 *
 * Hướng của nét kẻ phải chạy CÙNG hướng với dòng chảy của cụm, nếu không nó
 * trông như hai vạch lạc lõng: dưới breakpoint sm cụm xếp dọc nên nét kẻ dọc,
 * từ sm trở lên cụm nằm ngang nên nét kẻ chuyển thành ngang.
 */
const AiConnector: React.FC = () => (
  <div className="flex shrink-0 flex-col items-center gap-2 sm:flex-row" aria-hidden>
    <span className="h-5 w-px bg-gradient-to-b from-transparent to-brand-500/50 sm:h-px sm:w-7 sm:bg-gradient-to-r" />

    <span className="relative flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-1.5 backdrop-blur">
      <span className="lp-ping-ring absolute inset-0 rounded-full border border-brand-500/40" />
      <svg className="h-3.5 w-3.5 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l1.9 5.4L19 9.3l-5.1 1.9L12 16.6l-1.9-5.4L5 9.3l5.1-1.9L12 2zm6.5 11l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" />
      </svg>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-500">AI</span>
    </span>

    <span className="h-5 w-px bg-gradient-to-t from-transparent to-brand-500/50 sm:h-px sm:w-7 sm:bg-gradient-to-l" />
  </div>
);

/** Một mẫu: hai ảnh đầu vào → cầu nối AI → bài đăng chứa ảnh kết quả. */
const SampleSlide: React.FC<{ sample: Sample }> = ({ sample }) => (
  <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-3">
    <div className="flex w-full gap-3 sm:w-[8.25rem] sm:flex-col md:w-[9rem]">
      <InputCard step={1} label="Ảnh mẫu" image={sample.reference} />
      <InputCard step={2} label="Sản phẩm" image={sample.product} />
    </div>

    <AiConnector />

    {/*
      Kết quả là nhân vật chính: viền chuyển sắc mảnh + bóng sâu để tách khỏi
      nền. Thêm một vòng viền tối rất nhạt vì ở chế độ sáng, thẻ trắng nằm trên
      nền sáng gần như không còn ranh giới.
    */}
    <div className="w-full max-w-[17rem] shrink-0 sm:w-[14.5rem] md:w-[16rem]">
      <div className="lp-gradient-border rounded-[1.3rem] p-[2px] shadow-2xl shadow-black/25 ring-1 ring-black/5">
        <FacebookPost sample={sample} />
      </div>
    </div>
  </div>
);

export const HeroShowcase: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const total = SAMPLES.length;
  const isPaused = isHovered || isFocused;

  const go = useCallback((delta: number) => setIndex((current) => (current + delta + total) % total), [total]);

  /*
   * Tự chuyển mẫu.
   *
   * Dừng khi người dùng đang rê chuột hoặc đang focus bằng bàn phím: slider tự
   * chạy mất khi khách đang nhìn kỹ một mẫu là kiểu chuyển động khó chịu nhất.
   * Tắt hẳn khi hệ điều hành bật "giảm chuyển động" — lúc đó chỉ còn vuốt tay và
   * phím mũi tên.
   *
   * `index` nằm trong danh sách phụ thuộc để đồng hồ đếm lại từ đầu sau mỗi lần
   * đổi mẫu. Thiếu nó thì vuốt tay xong có thể chỉ một giây sau là bị tự nhảy
   * tiếp, vì đồng hồ cũ vẫn đang chạy dở.
   */
  useEffect(() => {
    if (total < 2 || isPaused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => setIndex((current) => (current + 1) % total), AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [total, isPaused, index]);

  /*
   * Vuốt để đổi mẫu.
   *
   * Dùng Pointer Events chứ không phải Touch Events: một bộ xử lý chạy chung cho
   * cả chạm trên điện thoại lẫn kéo chuột trên máy tính, nên không phải viết hai
   * nhánh. Chỉ ghi lại điểm bắt đầu và điểm kết thúc — không cần theo dõi từng
   * bước di chuyển vì hiệu ứng chuyển mẫu đã do CSS lo.
   *
   * `touch-pan-y` để trình duyệt vẫn cuộn dọc bình thường: thiếu nó thì vuốt lên
   * xuống trong vùng slider sẽ bị nuốt và trang không cuộn được trên điện thoại.
   */
  const startX = useRef<number | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    startX.current = event.clientX;
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const start = startX.current;
    startX.current = null;
    if (start === null) return;

    const distance = event.clientX - start;
    if (Math.abs(distance) >= SWIPE_THRESHOLD_PX) go(distance < 0 ? 1 : -1);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      {/* Vệt màu trôi phía sau, chỉ để tạo chiều sâu */}
      <div className="pointer-events-none absolute -inset-10 -z-10" aria-hidden>
        <div className="lp-blob absolute left-0 top-4 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" />
        <div
          className="lp-blob absolute bottom-0 right-4 h-64 w-64 rounded-full bg-orange-400/20 blur-3xl"
          style={{ animationDelay: '-7s' }}
        />
      </div>

      <div
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          startX.current = null;
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={onKeyDown}
        aria-roledescription="carousel"
        aria-label="Ảnh mẫu và kết quả theo từng ngành hàng — vuốt ngang hoặc dùng phím mũi tên để xem mẫu khác"
        className="touch-pan-y rounded-3xl outline-none ring-brand-500/40 focus-visible:ring-2"
      >
        {/*
          Mọi mẫu nằm chồng trong CÙNG MỘT ô lưới (col/row-start-1) thay vì dùng
          position:absolute. Nhờ vậy khung tự cao bằng mẫu cao nhất, không phải
          đo bằng JS và cũng không sập chiều cao khi chuyển mẫu.
        */}
        <div className="grid">
          {SAMPLES.map((sample, slideIndex) => {
            /*
             * Mẫu nằm trước hay sau mẫu đang xem, tính theo vòng tròn. Dấu của
             * giá trị này quyết định mẫu trượt ra/vào từ phía nào — nhờ vậy cú
             * vuốt sang trái thấy đúng cảm giác nội dung chạy sang trái, thay vì
             * chỉ mờ đi rồi hiện lại.
             */
            let offset = (slideIndex - index + total) % total;
            if (offset > total / 2) offset -= total;
            const isActive = offset === 0;

            return (
              <div
                key={sample.label}
                role="group"
                aria-roledescription="slide"
                aria-label={`${sample.label} — mẫu ${slideIndex + 1} trên ${total}`}
                aria-hidden={!isActive}
                className={`col-start-1 row-start-1 transition-all duration-500 ease-out ${
                  isActive
                    ? 'z-10 translate-x-0 opacity-100'
                    : `pointer-events-none z-0 opacity-0 ${offset < 0 ? '-translate-x-10' : 'translate-x-10'}`
                }`}
              >
                <SampleSlide sample={sample} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
