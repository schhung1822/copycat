import React from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatNumber } from '../lib/format';
import { APP_HOME } from '../lib/routes';
import { ThemeToggle } from './ThemeToggle';

const navItems = [
  { to: APP_HOME, label: 'Tạo ảnh' },
  { to: '/lich-su', label: 'Lịch sử' },
  { to: '/vi-diem', label: 'Ví điểm' },
  { to: '/nap-tien', label: 'Gói dịch vụ' },
];

// Bấm logo trong ứng dụng về bàn làm việc, không về trang bán hàng: khách đã
// đăng nhập rồi thì "nhà" của họ là chỗ tạo ảnh.
const Logo: React.FC = () => (
  <Link to={APP_HOME} className="flex items-center gap-2.5 shrink-0">
    <div className="w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center shadow-lg shadow-brand-500/20">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
        />
      </svg>
    </div>
    <span className="font-bold text-gray-100 tracking-tight hidden sm:block">Design Copycat AI</span>
  </Link>
);

export const Layout: React.FC = () => {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/dang-nhap');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-sm transition-colors ${
      isActive ? 'bg-dark-800 text-gray-100 font-semibold' : 'text-gray-400 hover:text-gray-100 hover:bg-dark-850'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-dark-950">
      <header className="h-14 border-b border-dark-800 bg-dark-900/95 backdrop-blur sticky top-0 z-40 flex items-center px-4 gap-2">
        <Logo />

        <nav className="flex items-center gap-1 ml-4 overflow-x-auto custom-scrollbar">
          {/* Không cần `end`: từ khi bàn làm việc rời khỏi "/", không đường dẫn
              nào trong thanh này còn là tiền tố của đường dẫn khác. */}
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/quan-tri" className={linkClass}>
              <span className="text-brand-500">●</span> Quản trị
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user?.isSubscribed ? (
            <Link
              to="/nap-tien"
              className="flex items-center gap-2 bg-dark-850 hover:bg-dark-800 border border-dark-700 rounded-full pl-3 pr-2 py-1.5 transition-colors group"
              title={
                `Hạn mức tháng: ${formatNumber(user.monthlyTokens)} điểm\n` +
                `Đã mua thêm: ${formatNumber(user.purchasedTokens)} điểm`
              }
            >
              <span className="text-sm font-bold text-brand-500">{formatNumber(user.tokenBalance)}</span>
              <span className="text-[10px] uppercase text-gray-500 tracking-wider hidden sm:inline">điểm</span>
              <span className="w-5 h-5 rounded-full bg-brand-500/15 text-brand-500 flex items-center justify-center text-sm leading-none group-hover:bg-brand-500 group-hover:text-white transition-colors">
                +
              </span>
            </Link>
          ) : (
            <Link
              to="/nap-tien"
              className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-full px-4 py-2 transition-colors"
            >
              Đăng ký gói
            </Link>
          )}

          <ThemeToggle />

          <div className="relative group">
            <button className="w-8 h-8 rounded-full bg-dark-800 border border-dark-700 text-gray-300 text-xs font-bold hover:border-gray-500 transition-colors">
              {(user?.fullName ?? user?.email ?? '?').charAt(0).toUpperCase()}
            </button>
            <div className="absolute right-0 top-full pt-2 hidden group-hover:block z-50">
              <div className="bg-dark-850 border border-dark-700 rounded-xl shadow-2xl w-56 py-2">
                <div className="px-4 py-2 border-b border-dark-800">
                  <p className="text-sm text-gray-100 truncate">{user?.fullName || 'Chưa đặt tên'}</p>
                  <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
                </div>
                <Link to="/tai-khoan" className="block px-4 py-2 text-sm text-gray-300 hover:bg-dark-800">
                  Thông tin tài khoản
                </Link>
                <Link to="/vi-diem" className="block px-4 py-2 text-sm text-gray-300 hover:bg-dark-800">
                  Sao kê điểm
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-dark-800"
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <Outlet />
      </main>
    </div>
  );
};
