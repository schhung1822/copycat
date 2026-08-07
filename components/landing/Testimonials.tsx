import React from 'react';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

/**
 * ⚠️ NỘI DUNG MẪU — PHẢI THAY TRƯỚC KHI ĐƯA TRANG LÊN CHẠY THẬT.
 *
 * Ba lời chứng thực dưới đây do người viết trang dựng ra để canh bố cục, KHÔNG
 * phải đánh giá của khách hàng thật. Đăng nguyên như vậy là quảng cáo sai sự
 * thật với người mua.
 *
 * Cách thay: lấy đánh giá thật (tin nhắn Facebook, Zalo, phản hồi qua email) và
 * xin phép người viết trước khi trích tên. Nếu chưa có đánh giá nào, xoá hẳn
 * phần này khỏi `LandingPage.tsx` — bỏ trống còn hơn là bịa.
 */
const TESTIMONIALS = [
  {
    quote:
      'Trước đây mỗi đợt hàng mới em phải book studio, chờ ba ngày mới có ảnh. Giờ chụp bằng điện thoại rồi cho vào đây, chiều là có ảnh lên sàn.',
    name: 'Nội dung mẫu',
    role: 'Chủ shop thời trang',
  },
  {
    quote:
      'Cái em thích nhất là ra được bốn phương án một lượt. Chạy quảng cáo cần nhiều biến thể để test, tự làm tay thì không kịp.',
    name: 'Nội dung mẫu',
    role: 'Người chạy quảng cáo',
  },
  {
    quote:
      'Khách gửi link tham khảo và bảo làm giống vậy. Bên mình dựng bản demo ngay trong buổi họp, chốt hướng xong mới bắt tay làm bản chính.',
    name: 'Nội dung mẫu',
    role: 'Agency sáng tạo',
  },
];

export const Testimonials: React.FC = () => (
  <section className="border-y border-dark-800 bg-dark-900/40 py-20 sm:py-28">
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <SectionHeading eyebrow="Phản hồi" title="Người dùng nói gì" />

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {TESTIMONIALS.map((item, index) => (
          <Reveal
            key={item.quote}
            delay={index * 110}
            className="flex flex-col rounded-2xl border border-dark-800 bg-dark-900 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/30"
          >
            <svg className="h-7 w-7 text-brand-500/30" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M9.5 5C6.5 6.7 4.8 9.5 4.8 13v6h6.4v-6.4H8.4c0-2 .9-3.6 2.7-4.7L9.5 5zm8.6 0c-3 1.7-4.7 4.5-4.7 8v6h6.4v-6.4H17c0-2 .9-3.6 2.7-4.7L18.1 5z" />
            </svg>

            <p className="mt-4 flex-1 text-sm leading-relaxed text-gray-300">{item.quote}</p>

            <div className="mt-5 flex items-center gap-3 border-t border-dark-800 pt-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-500">
                {item.role.charAt(0)}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-200">{item.name}</p>
                <p className="text-xs text-gray-500">{item.role}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);
