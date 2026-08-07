import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Logo bản cho trang giới thiệu: giữ đúng biểu tượng và màu của <Layout> nhưng
 * to hơn, luôn hiện tên đầy đủ và thêm một vòng sáng mờ phía sau.
 */
export const LandingLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <Link to="/gioi-thieu" className={`flex shrink-0 items-center gap-2.5 ${className}`}>
    <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 shadow-lg shadow-brand-500/30">
      <span className="absolute inset-0 rounded-xl bg-brand-500/40 blur-md" aria-hidden />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="relative h-5 w-5 text-white"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
        />
      </svg>
    </span>
    {/*
      Ẩn tên dưới 380px: ở bề ngang đó, giữ cả tên lẫn nút kêu gọi thì một trong
      hai bị tràn ra ngoài. Biểu tượng đã đủ để nhận ra thương hiệu và vẫn bấm về
      đầu trang được.
    */}
    <span className="hidden text-[15px] font-bold tracking-tight text-gray-100 min-[380px]:block">
      Design Copycat AI
    </span>
  </Link>
);
