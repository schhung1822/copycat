import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Logo bản cho trang giới thiệu: giữ đúng biểu tượng và màu của <Layout> nhưng
 * to hơn, luôn hiện tên đầy đủ và thêm một vòng sáng mờ phía sau.
 */
export const LandingLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <Link to="/" className={`flex shrink-0 items-center gap-2.5 ${className}`}>
    <span className="relative flex h-9 w-9 items-center justify-center">
      <span className="absolute inset-0 rounded-xl bg-brand-500/30 blur-md" aria-hidden />
      <img
        src="/img/logo_copycat.webp"
        alt=""
        className="relative h-9 w-9 rounded-xl object-cover shadow-lg shadow-brand-500/25"
      />
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
