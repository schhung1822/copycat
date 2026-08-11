import React from 'react';
import { Link } from 'react-router-dom';
import { LandingLogo } from './LandingLogo';

/** Nhóm liên kết ở chân trang. Mục dùng thẻ <a> là neo trong trang. */
const COLUMNS: { title: string; links: { label: string; to?: string; href?: string }[] }[] = [
  {
    title: 'Sản phẩm',
    links: [
      { label: 'Quy trình', href: '#quy-trinh' },
      { label: 'Tính năng', href: '#tinh-nang' },
      { label: 'Model AI', href: '#model' },
      { label: 'Bảng giá', href: '#bang-gia' },
    ],
  },
  {
    title: 'Tài khoản',
    links: [
      { label: 'Đăng ký', to: '/dang-ky' },
      { label: 'Đăng nhập', to: '/dang-nhap' },
      { label: 'Mua điểm', to: '/nap-tien' },
      { label: 'Ví điểm', to: '/vi-diem' },
    ],
  },
  {
    title: 'Hỗ trợ',
    links: [
      { label: 'Câu hỏi thường gặp', href: '#cau-hoi' },
      { label: 'Chính sách & Điều khoản', to: '/chinh-sach' },
      { label: 'Hoàn điểm & hoàn tiền', to: '/chinh-sach#hoan-tra' },
      { label: 'Liên hệ', to: '/chinh-sach#lien-he' },
    ],
  },
];

const linkClass = 'text-sm text-gray-500 transition-colors hover:text-gray-200';

export const LandingFooter: React.FC = () => (
  <footer className="border-t border-dark-800 bg-dark-900/60">
    <div className="mx-auto max-w-[1280px] px-4 py-12 sm:px-6 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-[1.4fr_2fr]">
        <div>
          <LandingLogo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-500">
            Công cụ dựng ảnh sản phẩm bằng AI cho người bán hàng Việt Nam: mượn bố cục của thiết kế đẹp, thay bằng sản
            phẩm của chính bạn.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">{column.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link to={link.to} className={linkClass}>
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className={linkClass}>
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-dark-800 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-600">© {new Date().getFullYear()}© Bản quyền thuộc về & cung cấp bởi Nextgency</p>
        <p className="text-xs text-gray-600">
          Ảnh do AI tạo ra — người dùng chịu trách nhiệm về nội dung mình tải lên và đăng tải.
        </p>
      </div>
    </div>
  </footer>
);
