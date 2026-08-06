import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { Alert, Field, inputClass } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

const AuthShell: React.FC<{ title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }> = ({
  title,
  subtitle,
  children,
  footer,
}) => (
  <div className="min-h-screen flex items-center justify-center bg-dark-950 p-4 relative">
    {/* Cho phép đổi chế độ sáng/tối ngay từ màn hình đăng nhập */}
    <div className="absolute top-5 right-5">
      <ThemeToggle />
    </div>

    <div className="w-full max-w-md">
      <div className="flex items-center gap-3 justify-center mb-8">
        <div className="w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center shadow-lg shadow-brand-500/25">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-100 tracking-tight">Design Copycat AI</h1>
      </div>

      <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 shadow-2xl">
        <h2 className="text-2xl font-bold text-gray-100">{title}</h2>
        <p className="text-sm text-gray-500 mt-1 mb-6">{subtitle}</p>
        {children}
      </div>

      <p className="text-center text-sm text-gray-500 mt-6">{footer}</p>
    </div>
  </div>
);

export const LoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to={(location.state as { from?: string })?.from ?? '/'} replace />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate((location.state as { from?: string })?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Đăng nhập"
      subtitle="Đăng nhập để tiếp tục tạo thiết kế."
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link to="/dang-ky" className="text-brand-500 hover:underline font-semibold">
            Đăng ký ngay
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Email">
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ban@example.com"
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Mật khẩu">
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </Field>

        <Button type="submit" isLoading={isSubmitting} className="w-full !rounded-xl">
          Đăng nhập
        </Button>
      </form>
    </AuthShell>
  );
};

export const RegisterPage: React.FC = () => {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (form.password.length < 6) return setError('Mật khẩu phải có ít nhất 6 ký tự.');
    if (form.password !== form.confirm) return setError('Hai mật khẩu không khớp nhau.');

    setIsSubmitting(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        fullName: form.fullName || undefined,
        phone: form.phone || undefined,
      });
      navigate('/nap-tien', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đăng ký thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Tạo tài khoản"
      subtitle="Đăng ký miễn phí, nạp token khi cần tạo ảnh."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link to="/dang-nhap" className="text-brand-500 hover:underline font-semibold">
            Đăng nhập
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Họ và tên">
          <input type="text" className={inputClass} value={form.fullName} onChange={update('fullName')} placeholder="Nguyễn Văn A" />
        </Field>

        <Field label="Email">
          <input
            type="email"
            className={inputClass}
            value={form.email}
            onChange={update('email')}
            placeholder="ban@example.com"
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Số điện thoại">
          <input type="tel" className={inputClass} value={form.phone} onChange={update('phone')} placeholder="0900000000" />
        </Field>

        <Field label="Mật khẩu" hint="Tối thiểu 6 ký tự.">
          <input
            type="password"
            className={inputClass}
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
            required
          />
        </Field>

        <Field label="Nhập lại mật khẩu">
          <input
            type="password"
            className={inputClass}
            value={form.confirm}
            onChange={update('confirm')}
            autoComplete="new-password"
            required
          />
        </Field>

        <Button type="submit" isLoading={isSubmitting} className="w-full !rounded-xl">
          Đăng ký
        </Button>
      </form>
    </AuthShell>
  );
};
