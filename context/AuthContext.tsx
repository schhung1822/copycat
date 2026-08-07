import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setStoredToken } from '../lib/api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; fullName?: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Cập nhật số dư điểm tại chỗ sau khi tạo ảnh / nạp tiền, không cần gọi lại API. */
  setTokenBalance: (balance: number) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch (error) {
      // 401 là bình thường khi chưa đăng nhập; chỉ log các lỗi khác.
      if (!(error instanceof ApiError) || error.status !== 401) console.error(error);
      setUser(null);
      setStoredToken(null);
    }
  }, []);

  useEffect(() => {
    void refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  /**
   * Số dư điểm thay đổi được từ bên ngoài phiên làm việc này: admin cộng/trừ tay,
   * webhook ngân hàng cộng sau khi khách chuyển khoản. Nếu chỉ đọc một lần lúc mở
   * ứng dụng thì huy hiệu điểm trên thanh điều hướng sẽ kẹt ở giá trị cũ và trang
   * Tạo ảnh chặn nhầm dù tài khoản còn tiền. Vì vậy đọc lại mỗi khi người dùng
   * quay lại tab.
   */
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'visible') void refreshUser();
    };

    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ user: User; token: string }>('/auth/login', { email, password });
    setStoredToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; fullName?: string; phone?: string }) => {
      const data = await api.post<{ user: User; token: string }>('/auth/register', input);
      setStoredToken(data.token);
      setUser(data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  }, []);

  const setTokenBalance = useCallback((balance: number) => {
    setUser((current) => (current ? { ...current, tokenBalance: balance } : current));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      setTokenBalance,
      refreshUser,
    }),
    [user, isLoading, login, register, logout, setTokenBalance, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phải nằm trong <AuthProvider>.');
  return context;
}
