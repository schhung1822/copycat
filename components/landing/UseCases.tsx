import React from 'react';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

const CASES = [
  {
    who: 'Chủ shop online',
    pain: 'Mỗi lần nhập hàng mới lại phải thuê chụp, chờ hai ba ngày mới có ảnh đăng.',
    gain: 'Chụp sản phẩm bằng điện thoại, mượn bố cục của shop nước ngoài, có ảnh đăng trong buổi sáng.',
  },
  {
    who: 'Người chạy quảng cáo',
    pain: 'Cần chục biến thể hình ảnh để test nhưng designer chỉ kịp làm hai ba cái.',
    gain: 'Một ảnh mẫu chạy ra bốn phương án một lượt, đủ nguyên liệu để test A/B cả tuần.',
  },
  {
    who: 'Agency & freelancer',
    pain: 'Khách đưa link tham khảo rồi bảo "làm giống vậy nhưng cho sản phẩm của tôi".',
    gain: 'Dựng bản demo ngay trong buổi họp, chốt hướng với khách trước khi bỏ công làm bản chính.',
  },
  {
    who: 'Thương hiệu nhỏ',
    pain: 'Ảnh mỗi kênh mỗi kiểu, nhìn vào không ra một bộ nhận diện nào.',
    gain: 'Dùng chung một ảnh mẫu cho cả dòng sản phẩm, ảnh ra đồng bộ từ website tới sàn.',
  },
];

/**
 * Phần "dành cho ai".
 *
 * Viết theo cặp vấn đề → kết quả thay vì liệt kê ngành nghề: khách nhận ra mình
 * qua tình huống đang gặp nhanh hơn nhiều so với qua cái nhãn nghề nghiệp.
 */
export const UseCases: React.FC = () => (
  <section className="border-y border-dark-800 bg-dark-900/40 py-14 sm:py-20 lg:py-28">
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <SectionHeading
        eyebrow="Dành cho ai"
        title="Nếu bạn từng ước có ảnh đẹp mà không phải chờ designer"
        description="Hệ thống được dựng cho người bán hàng ở Việt Nam: nhanh, rẻ hơn thuê chụp, và không đòi hỏi kỹ năng đồ hoạ."
      />

      <div className="mt-10 grid sm:mt-14 gap-4 sm:grid-cols-2">
        {CASES.map((item, index) => (
          <Reveal
            key={item.who}
            delay={(index % 2) * 100}
            className="group rounded-2xl border border-dark-800 bg-dark-900 p-5 transition-all sm:p-6 duration-300 hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-xl hover:shadow-black/10"
          >
            <h3 className="text-base font-bold text-gray-100">{item.who}</h3>

            <p className="mt-4 flex gap-3 text-sm leading-relaxed text-gray-500">
              <span className="mt-1 h-4 w-4 shrink-0 rounded-full bg-dark-800 text-center text-[10px] font-bold leading-4 text-gray-500">
                !
              </span>
              {item.pain}
            </p>

            <p className="mt-3 flex gap-3 text-sm leading-relaxed text-gray-300">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {item.gain}
            </p>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);
