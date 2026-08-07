import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
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

  if (!user) {
    /*
     * Khách vào thẳng trang chủ thì đưa sang trang giới thiệu, không đá vào form
     * đăng nhập: người chưa biết hệ thống làm gì mà đã bị đòi mật khẩu sẽ đóng
     * tab. Các trang bên trong vẫn về thẳng form đăng nhập như cũ vì ai gõ đúng
     * /vi-diem thì đã biết mình đang tìm gì.
     */
    if (location.pathname === '/') return <Navigate to="/gioi-thieu" replace />;
    return <Navigate to="/dang-nhap" state={{ from: location.pathname }} replace />;
  }

  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
};

const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/dang-nhap" element={<LoginPage />} />
    <Route path="/dang-ky" element={<RegisterPage />} />
    {/* Công khai: người quên mật khẩu thì đương nhiên chưa đăng nhập được */}
    <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
    <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
    {/* Công khai: khách phải đọc được điều khoản trước khi tạo tài khoản */}
    <Route path="/chinh-sach" element={<PolicyPage />} />
    {/* Công khai: trang giới thiệu, cũng là nơi khách chưa đăng nhập đáp xuống */}
    <Route path="/gioi-thieu" element={<LandingPage />} />

    <Route
      element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }
    >
      <Route index element={<StudioPage />} />
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
