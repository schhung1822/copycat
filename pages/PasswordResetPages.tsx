import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { PasswordInput } from '../components/PasswordInput';
import { Alert, Field, inputClass, PageLoader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { APP_HOME } from '../lib/routes';
import { AuthShell } from './AuthPages';

/**
 * Bước 1 — xin liên kết đặt lại mật khẩu.
 *
 * Nhận email HOẶC số điện thoại. Sau khi gửi, màn hình LUÔN hiện cùng một câu
 * xác nhận dù tài khoản có tồn tại hay không: server cố ý không cho biết, vì nếu
 * biết thì trang này thành công cụ dò xem email nào đã đăng ký ở đây. Câu thông
 * báo vì thế phải viết theo kiểu "nếu tài khoản tồn tại thì..." chứ không phải
 * "đã gửi mail rồi".
 */
export const ForgotPasswordPage: React.FC = () => {
  const { user } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={APP_HOME} replace />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await api.post('/auth/forgot-password', { identifier });
      setIsSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không gửi được yêu cầu. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Quên mật khẩu"
      subtitle="Nhập email hoặc số điện thoại bạn đã dùng để đăng ký."
      footer={
        <>
          Nhớ ra mật khẩu rồi?{' '}
          <Link to="/dang-nhap" className="font-semibold text-brand-500 hover:underline">
            Quay lại đăng nhập
          </Link>
        </>
      }
    >
      {isSent ? (
        <div className="space-y-4">
          <Alert tone="success">
            Nếu thông tin bạn nhập khớp với một tài khoản, chúng tôi đã gửi liên kết đặt lại mật khẩu tới email của tài
            khoản đó. Liên kết có hiệu lực trong 15 phút.
          </Alert>

          <p className="text-sm leading-relaxed text-gray-500">
            Chưa thấy mail? Kiểm tra thêm mục Spam / Quảng cáo. Bạn cũng có thể{' '}
            <button
              type="button"
              onClick={() => setIsSent(false)}
              className="font-semibold text-brand-500 hover:underline"
            >
              thử lại với thông tin khác
            </button>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="Email hoặc số điện thoại" hint="Nhập đúng thông tin đã dùng khi tạo tài khoản.">
            <input
              type="text"
              className={inputClass}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="example@gmail.com hoặc 0900000000"
              autoComplete="username"
              required
            />
          </Field>

          <Button type="submit" isLoading={isSubmitting} className="w-full !rounded-xl">
            Gửi liên kết đặt lại
          </Button>
        </form>
      )}
    </AuthShell>
  );
};

/**
 * Bước 2 — đặt mật khẩu mới bằng liên kết trong mail.
 *
 * Kiểm tra token ngay khi mở trang thay vì đợi bấm nút: liên kết hết hạn sau 15
 * phút nên chuyện mở ra một liên kết đã chết là bình thường, bắt người dùng gõ
 * xong hai ô mật khẩu rồi mới báo hỏng là làm mất công họ.
 */
export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [isChecking, setIsChecking] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    void api
      .get<{ valid: boolean }>(`/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((data) => {
        if (!cancelled) setIsValid(data.valid);
      })
      .catch(() => {
        /* lỗi mạng — coi như chưa xác định được, nút gửi vẫn sẽ báo lỗi thật */
        if (!cancelled) setIsValid(true);
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) return setError('Mật khẩu phải có ít nhất 6 ký tự.');
    if (password !== confirm) return setError('Hai mật khẩu không khớp nhau.');

    setIsSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setIsDone(true);
      // Chờ một nhịp cho người dùng đọc kịp thông báo rồi mới chuyển trang.
      setTimeout(() => navigate('/dang-nhap', { replace: true }), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đặt lại được mật khẩu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const footer = (
    <>
      Cần liên kết mới?{' '}
      <Link to="/quen-mat-khau" className="font-semibold text-brand-500 hover:underline">
        Gửi lại
      </Link>
    </>
  );

  if (isChecking) {
    return (
      <AuthShell title="Đặt lại mật khẩu" subtitle="Đang kiểm tra liên kết..." footer={footer}>
        <PageLoader label="Đang kiểm tra liên kết..." />
      </AuthShell>
    );
  }

  if (!token || !isValid) {
    return (
      <AuthShell title="Liên kết không dùng được" subtitle="Liên kết đã hết hạn hoặc đã được dùng." footer={footer}>
        <Alert tone="error">
          Liên kết đặt lại mật khẩu chỉ dùng được một lần và hết hạn sau 15 phút. Hãy yêu cầu gửi lại một liên kết mới.
        </Alert>

        <Link
          to="/quen-mat-khau"
          className="mt-4 block rounded-xl bg-brand-500 px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-brand-600"
        >
          Yêu cầu liên kết mới
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Đặt lại mật khẩu" subtitle="Chọn mật khẩu mới cho tài khoản của bạn." footer={footer}>
      {isDone ? (
        <Alert tone="success">Đã đổi mật khẩu thành công. Đang chuyển tới trang đăng nhập...</Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="Mật khẩu mới" hint="Tối thiểu 6 ký tự.">
            <PasswordInput
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>

          <Field label="Nhập lại mật khẩu mới">
            <PasswordInput
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>

          <Button type="submit" isLoading={isSubmitting} className="w-full !rounded-xl">
            Đổi mật khẩu
          </Button>
        </form>
      )}
    </AuthShell>
  );
};
