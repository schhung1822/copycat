import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { APP_HOME } from './lib/routes';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { HistoryPage } from './pages/HistoryPage';
import { LandingPage } from './pages/LandingPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages';
import { PolicyPage } from './pages/PolicyPage';
import { StudioPage } from './pages/StudioPage';
import { TopUpPage } from './pages/TopUpPage';
import { WalletPage } from './pages/WalletPage';

/** Chặn các trang cần đăng nhập; nhớ đường dẫn cũ để quay lại sau khi đăng nhập. */
const RequireAuth: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({ children, adminOnly }) => {
  const { user, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader label="Đang kiểm tra phiên đăng nhập..." />;

  /*
   * Không còn ngoại lệ cho "/" như trước: trang chủ nay chính là trang giới
   * thiệu và ai cũng vào được, nên khách chưa đăng nhập không bao giờ chạm tới
   * đoạn này từ trang chủ nữa.
   */
  if (!user) return <Navigate to="/dang-nhap" state={{ from: location.pathname }} replace />;

  // Đã đăng nhập nhưng không phải quản trị viên: trả về bàn làm việc, không phải
  // trang bán hàng — họ là khách đang dùng dịch vụ chứ không phải người đi xem.
  if (adminOnly && !isAdmin) return <Navigate to={APP_HOME} replace />;

  return <>{children}</>;
};

const AppRoutes: React.FC = () => (
  <Routes>
    {/*
      Trang chủ là trang giới thiệu, mở công khai cho mọi người.

      Ai gõ tên miền trần cũng đáp xuống trang bán hàng — kể cả khách đã đăng
      nhập, vì đó cũng là link họ gửi cho người khác. Muốn vào làm việc thì bấm
      nút "Vào tạo ảnh" trên thanh điều hướng.
    */}
    <Route path="/" element={<LandingPage />} />
    {/* Đường dẫn cũ của trang giới thiệu — giữ lại cho link và bookmark đã phát ra */}
    <Route path="/gioi-thieu" element={<Navigate to="/" replace />} />

    <Route path="/dang-nhap" element={<LoginPage />} />
    <Route path="/dang-ky" element={<RegisterPage />} />
    {/* Công khai: người quên mật khẩu thì đương nhiên chưa đăng nhập được */}
    <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
    <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
    {/* Công khai: khách phải đọc được điều khoản trước khi tạo tài khoản */}
    <Route path="/chinh-sach" element={<PolicyPage />} />

    <Route
      element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }
    >
      <Route path="tao-anh" element={<StudioPage />} />
      <Route path="lich-su" element={<HistoryPage />} />
      <Route path="vi-diem" element={<WalletPage />} />
      <Route path="nap-tien" element={<TopUpPage />} />
      <Route path="tai-khoan" element={<AccountPage />} />
      <Route
        path="quan-tri"
        element={
          <RequireAuth adminOnly>
            <AdminPage />
          </RequireAuth>
        }
      />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

const App: React.FC = () => (
  <ThemeProvider>
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  </ThemeProvider>
);

export default App;
