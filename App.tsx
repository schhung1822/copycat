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
import { PolicyPage } from './pages/PolicyPage';
import { StudioPage } from './pages/StudioPage';
import { TopUpPage } from './pages/TopUpPage';
import { WalletPage } from './pages/WalletPage';

/** Chặn các trang cần đăng nhập; nhớ đường dẫn cũ để quay lại sau khi đăng nhập. */
const RequireAuth: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({ children, adminOnly }) => {
  const { user, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader label="Đang kiểm tra phiên đăng nhập..." />;
  if (!user) return <Navigate to="/dang-nhap" state={{ from: location.pathname }} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
};

const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/dang-nhap" element={<LoginPage />} />
    <Route path="/dang-ky" element={<RegisterPage />} />
    {/* Công khai: khách phải đọc được điều khoản trước khi tạo tài khoản */}
    <Route path="/chinh-sach" element={<PolicyPage />} />

    <Route
      element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }
    >
      <Route index element={<StudioPage />} />
      <Route path="lich-su" element={<HistoryPage />} />
      <Route path="vi-token" element={<WalletPage />} />
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
