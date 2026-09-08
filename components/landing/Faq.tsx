import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

const QUESTIONS = [
  {
    q: 'Ảnh tạo ra có giống hệt ảnh mẫu không?',
    a: 'Hệ thống học lại bố cục, ánh sáng và phong cách của ảnh mẫu rồi dựng lại với sản phẩm của bạn — nên giống về cách trình bày, không phải sao chép nguyên ảnh. Sản phẩm trong ảnh luôn là sản phẩm bạn tải lên.',
  },
  {
    q: 'Tôi không biết dùng phần mềm thiết kế thì có làm được không?',
    a: 'Được. Bạn chỉ cần tải hai ảnh lên và bấm tạo. Phần ghi chú thêm là tuỳ chọn, viết bằng tiếng Việt bình thường như đang nhờ người khác làm giúp.',
  },
  {
    q: 'Điểm là gì và tính thế nào?',
    a: 'Điểm là đơn vị đo mức sử dụng: 1 điểm tương ứng 1đ chi phí gốc trả cho nhà cung cấp mô hình. Mỗi ảnh trừ một số điểm cố định theo model và độ phân giải, hiện rõ trước khi bạn bấm tạo.',
  },
  {
    q: 'Có phải đóng phí hàng tháng không?',
    a: 'Không. Bạn chỉ mua điểm, mua xong là dùng được ngay — không có phí duy trì, không cam kết thời hạn, không tự động gia hạn. Hết điểm thì mua thêm, không mua cũng không mất gì.',
  },
  {
    q: 'Điểm đã mua có hết hạn không?',
    a: 'Không. Điểm nằm trong ví cho tới khi bạn dùng hết, dù bạn nghỉ vài tháng không tạo ảnh.',
  },
  {
    q: 'Ảnh bị lỗi thì có mất điểm không?',
    a: 'Không. Khi nhà cung cấp trả về lỗi, hệ thống tự hoàn lại đúng số điểm đã trừ và ghi rõ trong sao kê ví. Bạn không phải liên hệ để đòi lại.',
  },
  {
    q: 'Thanh toán bằng cách nào?',
    a: 'Chuyển khoản ngân hàng theo mã QR hiện sẵn trên trang Mua điểm. Chuyển đúng số tiền và đúng nội dung thì hệ thống cộng điểm tự động, không cần gửi ảnh chụp biên lai.',
  },
  {
    q: 'Đăng ảnh lên Facebook, TikTok có bị gắn nhãn AI không?',
    a: 'Mọi ảnh đều được xoá sạch metadata trước khi giao cho bạn: EXIF, XMP, thẻ Content Credentials (C2PA) và chú thích của nhà cung cấp — đúng những thứ Facebook, Instagram, Threads và TikTok đọc để tự gắn nhãn "Thông tin AI" lên bài đăng. Hệ thống cắt thẳng phần metadata chứ không nén lại ảnh, nên chất lượng giữ nguyên từng điểm ảnh. Riêng watermark chìm thì không gỡ được — đọc phần "Công cụ này không làm được gì" ngay bên dưới.',
  },
  {
    q: 'Ảnh tạo ra tôi có được dùng để bán hàng không?',
    a: 'Có. Bạn chịu trách nhiệm về ảnh mẫu và ảnh sản phẩm mình tải lên, và không dùng hệ thống để làm giả thương hiệu hay sản phẩm của người khác. Chi tiết nằm trong phần Nội dung & bản quyền của Chính sách.',
  },
];

/**
 * Những thứ hệ thống KHÔNG làm được.
 *
 * Nói trước ba giới hạn mà khách hay hiểu nhầm, thay vì để họ mua điểm xong mới
 * phát hiện. Cả ba đều là giới hạn vật lý của kỹ thuật, không phải thứ sẽ sửa
 * được ở bản sau, nên viết thẳng chứ không hứa hẹn.
 */
const LIMITS = [
  {
    title: 'Không gỡ được watermark chìm',
    body: 'Xoá metadata không đụng tới watermark chìm. Ảnh từ các model của Google mang sẵn SynthID — dấu nhúng thẳng vào điểm ảnh chứ không nằm trong metadata. Chưa công cụ nào gỡ được, nên đem đi kiểm tra bằng bộ dò của Google thì ảnh vẫn truy ra được là do AI tạo.',
    icon: 'M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M6.4 6.5C4 8 2.5 10.4 2.5 12c0 2.4 4 7 9.5 7 1.5 0 2.9-.3 4.1-.9M9.8 5.2A9.4 9.4 0 0112 5c5.5 0 9.5 4.6 9.5 7 0 1-.7 2.4-1.9 3.6',
  },
  {
    title: 'Không biến ảnh AI thành ảnh chụp máy',
    body: 'Chúng tôi xoá metadata chứ không viết metadata giả — mà kể cả có viết thì cũng chỉ là metadata. Nó không qua được phân tích pháp chứng: bảng lượng tử của file JPEG, phần dữ liệu riêng của từng hãng máy ảnh và dấu nhiễu cảm biến đều không khớp với bất kỳ chiếc máy ảnh thật nào.',
    icon: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  },
  {
    title: 'Phóng to không tạo thêm chi tiết',
    body: 'Làm nét không dựng ra được chi tiết vốn không có trong ảnh gốc. Thứ làm mắt đọc thành nét chỉ là tương phản được đắp lại ở đường biên, nên ảnh vốn nhỏ và mờ thì phóng to xong vẫn là ảnh mờ — chỉ mờ ở kích thước lớn hơn.',
    icon: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  },
];

/** Biểu tượng vẽ inline, cùng nét với lưới tính năng để hai phần nhìn liền mạch. */
const LimitIcon: React.FC<{ path: string }> = ({ path }) => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

/**
 * Hỏi đáp dạng gập mở.
 *
 * Chỉ mở một câu tại một thời điểm: đóng câu trước lại khi mở câu mới, để danh
 * sách không phình ra thành một bức tường chữ.
 *
 * Dùng <button> thật thay vì <details> vì cần điều khiển được hiệu ứng trượt —
 * <details> đóng/mở tức thì, không cho phép chuyển tiếp chiều cao.
 */
export const Faq: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="cau-hoi" className="scroll-mt-20 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <SectionHeading
          eyebrow="Câu hỏi thường gặp"
          title="Những thắc mắc hay gặp nhất"
          description="Chưa thấy câu bạn cần? Đọc thêm ở trang Chính sách & Điều khoản, mọi con số nghiệp vụ đều ghi rõ ở đó."
        />

        <div className="mt-9 space-y-2.5 sm:mt-12">
          {QUESTIONS.map((item, index) => {
            const isOpen = openIndex === index;

            return (
              <Reveal
                key={item.q}
                delay={index * 50}
                className={`overflow-hidden rounded-2xl border transition-colors duration-300 ${
                  isOpen ? 'border-brand-500/30 bg-dark-900' : 'border-dark-800 bg-dark-900/60 hover:border-dark-700'
                }`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:gap-4 sm:px-5 sm:py-4"
                >
                  <span className="flex-1 text-sm font-semibold text-gray-100 sm:text-base">{item.q}</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                      isOpen ? 'rotate-45 border-brand-500 bg-brand-500 text-white' : 'border-dark-700 text-gray-400'
                    }`}
                    aria-hidden
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>

                {/*
                  Trượt bằng grid-template-rows 0fr → 1fr: cách duy nhất chuyển
                  tiếp mượt tới chiều cao "tự động" mà không phải đo bằng JS.
                */}
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-4 pb-4 text-sm leading-relaxed text-gray-400 sm:px-5 sm:pb-5">{item.a}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/*
          Phần "không làm được" cố ý KHÔNG gập lại như các câu hỏi phía trên:
          nói thẳng thì phải để đọc được ngay, giấu sau một cú bấm là tự phủ nhận
          chính mình. Viền hổ phách nhạt để tách khỏi khối hỏi đáp mà không biến
          thành một ô cảnh báo đỏ choé.
        */}
        <div className="mt-16 border-t border-dark-800 pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading
            eyebrow="Nói thẳng"
            title="Công cụ này không làm được gì"
            description="Ba thứ khách hay hiểu nhầm. Đây là giới hạn của chính kỹ thuật, không phải thứ chúng tôi sẽ làm được ở bản sau — nên nói trước để bạn khỏi mua điểm rồi mới thất vọng."
          />

          <div className="mt-9 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {LIMITS.map((limit, index) => (
              <Reveal
                key={limit.title}
                delay={index * 90}
                className="rounded-2xl border border-amber-400/20 bg-dark-900/60 p-5 sm:p-6"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400">
                  <LimitIcon path={limit.icon} />
                </span>
                <h3 className="mt-4 text-base font-bold text-gray-100">{limit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{limit.body}</p>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={100}>
          <p className="mt-12 text-center text-sm text-gray-500">
            <Link to="/chinh-sach" className="font-semibold text-brand-500 underline-offset-2 hover:underline">
              Xem toàn bộ Chính sách &amp; Điều khoản
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
};
