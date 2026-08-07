import React from 'react';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

/**
 * Biểu tượng vẽ bằng SVG inline thay vì cài thư viện icon: dự án chưa có
 * dependency icon nào, thêm hẳn một gói chỉ vì tám cái hình là không đáng.
 */
const Icon: React.FC<{ path: string }> = ({ path }) => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

const FEATURES = [
  {
    title: 'Bám sát bố cục ảnh mẫu',
    body: 'Góc máy, ánh sáng, khoảng trắng, vị trí chữ — giữ đúng cái làm nên vẻ đẹp của ảnh gốc, chỉ thay sản phẩm.',
    icon: 'M4 6a2 2 0 012-2h5v16H6a2 2 0 01-2-2V6zm9-2h5a2 2 0 012 2v12a2 2 0 01-2 2h-5V4z',
    span: 'lg:col-span-2',
  },
  {
    title: 'Ba dòng model, chín mức chất lượng',
    body: 'Nano Banana Pro bám mẫu tốt nhất, Nano Banana 2 cân bằng, GPT Image 2 mạnh về chữ và layout quảng cáo.',
    icon: 'M12 3l2.4 5.5L20 10l-4.2 3.8L17 20l-5-2.9L7 20l1.2-6.2L4 10l5.6-1.5L12 3z',
  },
  {
    title: 'Tạo hàng loạt trong một lượt',
    body: 'Nhiều ảnh mẫu × tối đa 4 phương án mỗi ảnh. Chạy nền, không phải ngồi chờ từng tấm một.',
    icon: 'M8 4h11a1 1 0 011 1v11M5 8h11a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V9a1 1 0 011-1z',
  },
  {
    title: 'Làm nét & Tái tạo sản phẩm',
    body: 'Tăng cường độ sắc nét cho ảnh mờ nhòe, hoặc yêu cầu hệ thống vẽ lại sản phẩm sang một định dạng hoàn toàn mới theo nhu cầu.',
    icon: 'M4 8V5a1 1 0 011-1h3m8 0h3a1 1 0 011 1v3m0 8v3a1 1 0 01-1 1h-3m-8 0H5a1 1 0 01-1-1v-3',
  },
  {
    title: 'Ảnh lỗi tự hoàn điểm',
    body: 'Nhà cung cấp trả về lỗi thì hệ thống hoàn lại đúng số điểm đã trừ, không cần nhắn tin khiếu nại.',
    icon: 'M4 4v6h6M20 20v-6h-6M4.6 15a8 8 0 0014-3M19.4 9A8 8 0 005 12',
  },
  {
    title: 'Lịch sử lưu đủ, tải lại bất cứ lúc nào',
    body: 'Xem lại toàn bộ ảnh đã tạo cùng ghi chú và thông số đã dùng, tải về hoặc chạy lại với ghi chú mới.',
    icon: 'M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    title: 'Ví điểm minh bạch từng lượt',
    body: 'Mỗi lần tạo ảnh đều có dòng sao kê riêng: model nào, hết bao nhiêu điểm, trừ từ hạn mức tháng hay điểm mua thêm.',
    icon: 'M3 8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm13 4h2',
    span: 'lg:col-span-2',
  },
];

/**
 * Lưới tính năng kiểu "bento": vài ô rộng gấp đôi để mắt có điểm dừng thay vì
 * tám ô đều tăm tắp. Ô rộng dành cho hai tính năng bán hàng mạnh nhất.
 */
export const Features: React.FC = () => (
  <section id="tinh-nang" className="scroll-mt-20 border-y border-dark-800 bg-dark-900/40 py-14 sm:py-20 lg:py-28">
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
      <SectionHeading
        eyebrow="Tính năng"
        title="Đủ thứ cần thiết để dựng ảnh bán hàng"
        description="Không phải một hộp chat chung chung. Từng chức năng ở đây sinh ra cho đúng một việc: ra ảnh sản phẩm dùng được."
      />

      <div className="mt-10 grid sm:mt-14 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal
            key={feature.title}
            delay={(index % 3) * 90}
            className={`group relative overflow-hidden rounded-2xl border border-dark-800 bg-dark-900 p-5 transition-all sm:p-6 duration-300 hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-2xl hover:shadow-black/15 ${
              feature.span ?? ''
            }`}
          >
            {/* Ánh sáng mờ hiện ra khi rê chuột, chỉ để trang trí */}
            <span
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-500/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />

            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 transition-transform duration-300 group-hover:scale-110">
              <Icon path={feature.icon} />
            </span>

            <h3 className="relative mt-4 text-base font-bold text-gray-100">{feature.title}</h3>
            <p className="relative mt-2 text-sm leading-relaxed text-gray-400">{feature.body}</p>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);
