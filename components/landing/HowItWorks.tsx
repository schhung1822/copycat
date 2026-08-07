import React, { useState } from 'react';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

/**
 * Bốn bước của quy trình.
 *
 * `image` để trống là có chủ ý: ảnh chụp màn hình thật sẽ bổ sung sau. Chừng nào
 * còn trống thì khung bên phải hiện ô giữ chỗ, không làm vỡ bố cục. Khi có ảnh,
 * chỉ cần điền đường dẫn (vd `/anh/buoc-1.png` nếu để trong thư mục `public/`)
 * và sửa `imageAlt` cho đúng nội dung ảnh — không phải sửa gì thêm ở dưới.
 */
const STEPS = [
  {
    tag: 'Bước 1',
    title: 'Tải ảnh mẫu bạn muốn bắt chước',
    body: 'Ảnh chụp màn hình một quảng cáo đẹp, một trang catalogue hay bất kỳ bố cục nào bạn thích. Tải được nhiều ảnh mẫu cùng lúc để so sánh phong cách.',
    image: '/img/b1.webp',
    imageAlt: 'Màn hình tải ảnh mẫu lên hệ thống',
  },
  {
    tag: 'Bước 2',
    title: 'Tải ảnh sản phẩm của bạn',
    body: 'Ảnh chụp bằng điện thoại cũng được. Hệ thống giữ đúng hình dáng, màu sắc và chi tiết sản phẩm khi dựng lại theo bố cục mẫu.',
    image: '/img/b2.webp',
    imageAlt: 'Màn hình tải ảnh sản phẩm lên hệ thống',
  },
  {
    tag: 'Bước 3',
    title: 'Chọn model, độ phân giải và tỉ lệ khung',
    body: 'Mỗi model có thế mạnh riêng và mức điểm khác nhau. Chọn 1K để thử nhanh, 4K khi cần file in. Thêm ghi chú nếu muốn đổi màu nền hay bỏ bớt chữ.',
    image: '/img/b3.webp',
    imageAlt: 'Bảng chọn model, độ phân giải và tỉ lệ khung hình',
  },
  {
    tag: 'Bước 4',
    title: 'Nhận ảnh, tải về hoặc tạo lại',
    body: 'Mỗi ảnh mẫu tạo được tối đa 4 phương án một lượt. Ảnh xong lưu vào Lịch sử, tải về bất cứ lúc nào. Không ưng thì sửa ghi chú và chạy lại.',
    image: '/img/b4.webp',
    imageAlt: 'Lưới ảnh kết quả kèm nút tải về và tạo lại',
  },
];

/** Ô giữ chỗ khi bước đó chưa có ảnh chụp màn hình. */
const ImagePlaceholder: React.FC<{ index: number }> = ({ index }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-dark-700 bg-dark-850 p-6 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-dark-800 text-gray-600">
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm0 10l4.5-4.5 3.5 3.5 3-3L20 16M9 9.5a1 1 0 11-2 0 1 1 0 012 0z"
        />
      </svg>
    </span>
    <p className="text-sm font-semibold text-gray-400">Ảnh minh hoạ bước {index + 1}</p>
    <p className="max-w-[18rem] text-xs leading-relaxed text-gray-600">
      Điền đường dẫn ảnh vào <span className="font-mono text-gray-500">STEPS[{index}].image</span> trong{' '}
      <span className="font-mono text-gray-500">HowItWorks.tsx</span>.
    </p>
  </div>
);

/**
 * Quy trình 4 bước, kèm khung ảnh minh hoạ ở cột phải.
 *
 * Bấm vào một bước thì khung bên phải mờ chuyển sang ảnh của bước đó. Các ảnh
 * đều nằm sẵn trong DOM và chỉ đổi opacity — cách này cho hai ảnh chồng lên nhau
 * trong lúc chuyển nên không có nháy trắng ở giữa, và cũng không phải đo đạc
 * kích thước bằng JS.
 *
 * Dùng bộ vai trò tab/tabpanel thay vì danh sách thường: về mặt tương tác đây
 * đúng là các thẻ tab, nên trình đọc màn hình cần biết bấm vào một mục sẽ đổi
 * nội dung ở nơi khác. Mũi tên lên/xuống chuyển bước như thói quen của tab dọc.
 *
 * Trên điện thoại cột phải xuống dưới cột trái; nét kẻ nối các bước bị ẩn cho gọn.
 */
export const HowItWorks: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;

    event.preventDefault();
    const next = (activeIndex + step + STEPS.length) % STEPS.length;
    setActiveIndex(next);
    document.getElementById(`quy-trinh-tab-${next}`)?.focus();
  };

  return (
    <section id="quy-trinh" className="scroll-mt-20 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <SectionHeading
          eyebrow="Quy trình"
          title={
            <>
              Bốn bước, từ ảnh mẫu tới <br></br><span className="lp-gradient-text">ảnh đăng được ngay</span>
            </>
          }
          description="Không có bảng điều khiển rối rắm, không có thuật ngữ kỹ thuật. Ai bán hàng online cũng làm được trong lần đầu tiên."
        />

        <div className="mt-10 grid sm:mt-14 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-12">
          {/* Cột trái: danh sách bước bấm được */}
          <div className="relative">
            {/* Nét kẻ nối các bước, tự vẽ từ trên xuống khi cuộn tới */}
            <Reveal
              anim="fade"
              className="pointer-events-none absolute left-[1.4rem] top-6 hidden h-[calc(100%-3rem)] w-px sm:block"
            >
              <span
                className="lp-line block h-full w-px bg-gradient-to-b from-brand-500 via-brand-500/40 to-transparent"
                aria-hidden
              />
            </Reveal>

            <div
              role="tablist"
              aria-orientation="vertical"
              aria-label="Các bước trong quy trình"
              onKeyDown={onKeyDown}
              className="space-y-3"
            >
              {STEPS.map((step, index) => {
                const isActive = index === activeIndex;

                return (
                  <Reveal key={step.tag} delay={index * 100} className="relative flex gap-5">
                    <span
                      className={`relative z-10 hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-all duration-300 sm:flex ${
                        isActive
                          ? 'border-brand-500 bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                          : 'border-brand-500/30 bg-dark-900 text-brand-500'
                      }`}
                      aria-hidden
                    >
                      {index + 1}
                    </span>

                    <button
                      id={`quy-trinh-tab-${index}`}
                      role="tab"
                      type="button"
                      aria-selected={isActive}
                      aria-controls={`quy-trinh-panel-${index}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => setActiveIndex(index)}
                      className={`flex-1 rounded-2xl border p-4 text-left transition-all duration-300 sm:p-5 ${
                        isActive
                          ? 'border-brand-500/40 bg-dark-900 shadow-xl shadow-black/10'
                          : 'border-dark-800 bg-dark-900/60 hover:border-dark-700 hover:bg-dark-900'
                      }`}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-500">{step.tag}</span>
                      <h3 className="mt-1.5 text-lg font-bold text-gray-100">{step.title}</h3>

                      {/*
                        Phần mô tả chỉ mở ở bước đang chọn: bốn đoạn chữ mở sẵn
                        cùng lúc thì cột trái dài gấp đôi khung ảnh bên phải và
                        người đọc không biết nên nhìn đâu.
                      */}
                      <div
                        className={`grid transition-all duration-300 ease-out ${
                          isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <p className="pt-2 text-sm leading-relaxed text-gray-400">{step.body}</p>
                        </div>
                      </div>
                    </button>
                  </Reveal>
                );
              })}
            </div>
          </div>

          {/* Cột phải: khung ảnh minh hoạ, dính lại khi cuộn trên màn hình rộng */}
          <Reveal anim="zoom" delay={120} className="lg:sticky lg:top-24">
            <div className="rounded-3xl border border-dark-800 bg-dark-900 p-3 shadow-2xl shadow-black/10">
              {/* Thanh giả lập cửa sổ trình duyệt cho khung ảnh trông có bối cảnh */}
              <div className="flex items-center gap-1.5 px-2 pb-3 pt-1">
                <span className="h-2.5 w-2.5 rounded-full bg-dark-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-dark-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-dark-700" />
                <span className="ml-3 truncate text-[11px] text-gray-600">
                  designcopycat.ai — {STEPS[activeIndex].tag.toLowerCase()}
                </span>
              </div>

              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-dark-850">
                {STEPS.map((step, index) => {
                  const isActive = index === activeIndex;

                  return (
                    <div
                      key={step.tag}
                      id={`quy-trinh-panel-${index}`}
                      role="tabpanel"
                      aria-labelledby={`quy-trinh-tab-${index}`}
                      /* Ẩn khỏi cây trợ năng khi không hiện, nếu không trình đọc
                         màn hình sẽ đọc cả bốn ảnh chồng lên nhau. */
                      aria-hidden={!isActive}
                      className={`absolute inset-0 transition-all duration-500 ease-out ${
                        isActive
                          ? 'z-10 scale-100 opacity-100'
                          : 'pointer-events-none z-0 scale-[1.04] opacity-0'
                      }`}
                    >
                      {step.image ? (
                        <img
                          src={step.image}
                          alt={step.imageAlt}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImagePlaceholder index={index} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Thanh chuyển bước dưới ảnh: vạch dài là bước đang xem */}
              <div className="flex items-center justify-between gap-4 px-2 pb-1 pt-3">
                <p className="truncate text-xs text-gray-500">{STEPS[activeIndex].title}</p>

                <div className="flex shrink-0 items-center gap-1.5">
                  {STEPS.map((step, index) => (
                    <button
                      key={step.tag}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-label={`Xem ${step.tag.toLowerCase()}`}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        index === activeIndex ? 'w-6 bg-brand-500' : 'w-1.5 bg-dark-700 hover:bg-dark-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};
