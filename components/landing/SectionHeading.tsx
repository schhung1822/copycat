import React from 'react';
import { Reveal } from './Reveal';

/** Nhãn nhỏ phía trên tiêu đề mỗi phần — giữ nhịp đọc giống nhau toàn trang. */
export const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-500">
    <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
    {children}
  </span>
);

/**
 * Cụm tiêu đề dùng chung cho mọi phần của trang giới thiệu.
 *
 * Gom vào một chỗ để cỡ chữ, khoảng cách và bề rộng dòng mô tả đồng nhất —
 * đây là thứ dễ lệch nhất khi mỗi phần tự viết tiêu đề riêng.
 */
export const SectionHeading: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: 'center' | 'left';
}> = ({ eyebrow, title, description, align = 'center' }) => (
  <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
    {eyebrow && (
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
    )}
    <Reveal delay={80}>
      <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-gray-100 sm:text-4xl">{title}</h2>
    </Reveal>
    {description && (
      <Reveal delay={140}>
        <p className="mt-4 text-base leading-relaxed text-gray-400">{description}</p>
      </Reveal>
    )}
  </div>
);
