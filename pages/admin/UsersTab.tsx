import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { PasswordInput } from '../../components/PasswordInput';
import { Alert, Badge, Card, EmptyState, Field, TableWrap, inputClass, selectClass } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError, qs } from '../../lib/api';
import { formatDateTime, formatNumber, formatVnd, STATUS_LABEL } from '../../lib/format';
import type { AdminUser } from '../../types';

/**
 * ISO của server → chuỗi cho <input type="datetime-local">.
 *
 * Input này chỉ nhận đúng dạng `YYYY-MM-DDTHH:mm` **theo giờ máy của admin**, nên
 * phải tự bù chênh lệch múi giờ; dùng thẳng `toISOString()` sẽ hiện sai giờ đúng
 * bằng offset của máy.
 */
function toLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Chuỗi của datetime-local (giờ máy admin) → ISO để gửi lên server, '' → null. */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const UsersTab: React.FC = () => {
  const { user: me, refreshUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AdminUser | null>(null);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    const data = await api.get<{ users: AdminUser[] }>(`/admin/users${qs({ search, limit: 50 })}`);
    setUsers(data.users);
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleBan = async (user: AdminUser) => {
    const nextStatus = user.status === 'active' ? 'banned' : 'active';
    if (!confirm(`${nextStatus === 'banned' ? 'Khoá' : 'Mở khoá'} tài khoản ${user.email}?`)) return;

    try {
      await api.patch(`/admin/users/${user.id}`, { status: nextStatus });
      await load();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof ApiError ? err.message : 'Thao tác thất bại.' });
    }
  };

  /** Dùng chung cho cả hai hộp thoại: đóng, báo thành công, tải lại dữ liệu. */
  const afterChange = async (text: string) => {
    setEditTarget(null);
    setAdjustTarget(null);
    setMessage({ tone: 'success', text });
    // Admin hay thao tác lên chính tài khoản mình để kiểm thử; đọc lại phiên hiện
    // tại để huy hiệu điểm trên thanh điều hướng khớp ngay, không phải tải lại trang.
    await Promise.all([load(), refreshUser()]);
  };

  return (
    <div className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="flex items-center gap-3">
        <input
          className={`${inputClass} max-w-sm !py-2`}
          placeholder="Tìm theo email, tên hoặc số điện thoại..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-gray-600">{users.length} tài khoản</span>
      </div>

      <Card className="p-4">
        {users.length === 0 ? (
          <EmptyState title="Không tìm thấy tài khoản nào." />
        ) : (
          <TableWrap>
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                <th className="text-left font-bold py-2">Khách hàng</th>
                <th className="text-left font-bold py-2">Gói dịch vụ</th>
                <th className="text-right font-bold py-2">Hạn mức tháng</th>
                <th className="text-right font-bold py-2">Mua thêm</th>
                <th className="text-right font-bold py-2">Đã nạp</th>
                <th className="text-left font-bold py-2 pl-4">Trạng thái</th>
                <th className="text-right font-bold py-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const expired = user.subscriptionExpiresAt
                  ? new Date(user.subscriptionExpiresAt).getTime() <= Date.now()
                  : true;

                return (
                  <tr key={user.id} className="border-b border-dark-850 last:border-0 align-top">
                    <td className="py-2.5">
                      <p className="text-gray-300 text-xs">
                        {user.email}
                        {user.role === 'admin' && (
                          <span className="ml-1.5 text-[9px] font-bold text-brand-500 uppercase">Admin</span>
                        )}
                      </p>
                      <p className="text-[10px] text-gray-600">
                        {user.fullName || 'Chưa đặt tên'}
                        {user.phone ? ` · ${user.phone}` : ''}
                      </p>
                    </td>

                    <td className="py-2.5">
                      {user.planName ? (
                        <>
                          <p className={`text-xs ${expired ? 'text-gray-600' : 'text-gray-300'}`}>{user.planName}</p>
                          <p className={`text-[10px] ${expired ? 'text-red-400' : 'text-gray-600'}`}>
                            {expired ? 'Hết hạn ' : 'Đến '}
                            {formatDateTime(user.subscriptionExpiresAt)}
                          </p>
                        </>
                      ) : (
                        <span className="text-[10px] text-gray-600">Chưa mua gói</span>
                      )}
                    </td>

                    <td className="py-2.5 text-right whitespace-nowrap">
                      <span className="text-brand-500 font-semibold">{formatNumber(user.monthlyTokens)}</span>
                      <span className="text-gray-600"> / {formatNumber(user.monthlyAllowance)}</span>
                      {user.monthlyPeriodEnd && (
                        <p className="text-[10px] text-gray-600">
                          Cấp lại {formatDateTime(user.monthlyPeriodEnd)}
                        </p>
                      )}
                    </td>

                    <td className="py-2.5 text-right text-gray-300">{formatNumber(user.purchasedTokens)}</td>
                    <td className="py-2.5 text-right text-gray-300">{formatVnd(user.totalTopupVnd)}</td>

                    <td className="py-2.5 pl-4">
                      <Badge status={user.status}>{STATUS_LABEL[user.status]}</Badge>
                      <p className="text-[10px] text-gray-600 mt-1 whitespace-nowrap">
                        {formatDateTime(user.lastLoginAt)}
                      </p>
                    </td>

                    <td className="py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditTarget(user)}
                        className="text-xs text-gray-400 hover:text-gray-100 px-2 transition-colors"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => setAdjustTarget(user)}
                        className="text-xs text-gray-400 hover:text-gray-100 px-2 transition-colors"
                      >
                        Điểm
                      </button>
                      <button
                        onClick={() => toggleBan(user)}
                        // Tự khoá mình là mất quyền vào bảng điều khiển, server cũng
                        // chặn — ẩn nút luôn để khỏi bấm rồi nhận lỗi.
                        disabled={user.id === me?.id && user.status === 'active'}
                        className={`text-xs px-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                          user.status === 'active'
                            ? 'text-gray-500 hover:text-red-400'
                            : 'text-green-500 hover:text-green-400'
                        }`}
                        title={user.id === me?.id && user.status === 'active' ? 'Không thể tự khoá tài khoản của bạn' : ''}
                      >
                        {user.status === 'active' ? 'Khoá' : 'Mở'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <p className="text-[11px] text-gray-600">
        Quyền admin được điều khiển bằng biến <code>ADMIN_EMAILS</code> trong file <code>.env</code>, không sửa được từ
        giao diện. Thêm email vào đó rồi khởi động lại server.
      </p>

      {editTarget && <EditUserModal user={editTarget} onClose={() => setEditTarget(null)} onDone={afterChange} />}
      {adjustTarget && (
        <AdjustTokenModal user={adjustTarget} onClose={() => setAdjustTarget(null)} onDone={afterChange} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

/** Sửa hồ sơ, trạng thái, thời hạn gói và hạn mức của một khách hàng. */
const EditUserModal: React.FC<{
  user: AdminUser;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}> = ({ user, onClose, onDone }) => {
  const [form, setForm] = useState({
    fullName: user.fullName ?? '',
    phone: user.phone ?? '',
    email: user.email,
    status: user.status,
    subscriptionExpiresAt: toLocalInput(user.subscriptionExpiresAt),
    monthlyAllowance: String(user.monthlyAllowance),
    monthlyPeriodEnd: toLocalInput(user.monthlyPeriodEnd),
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: e.target.value })),
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const allowance = Number(form.monthlyAllowance);
    if (!Number.isInteger(allowance) || allowance < 0) return setError('Hạn mức tháng phải là số nguyên không âm.');
    if (password && password.length < 8) return setError('Mật khẩu mới phải có ít nhất 8 ký tự.');

    setError(null);
    setIsSaving(true);
    try {
      await api.patch(`/admin/users/${user.id}`, {
        fullName: form.fullName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim(),
        status: form.status,
        subscriptionExpiresAt: fromLocalInput(form.subscriptionExpiresAt),
        monthlyAllowance: allowance,
        monthlyPeriodEnd: fromLocalInput(form.monthlyPeriodEnd),
      });

      // Đổi mật khẩu là lời gọi riêng, chạy sau khi hồ sơ đã lưu xong: nếu gộp
      // chung mà nửa chừng lỗi thì admin không biết phần nào đã vào.
      if (password) await api.post(`/admin/users/${user.id}/password`, { password });

      await onDone(
        `Đã cập nhật ${form.email.trim()}${password ? ' và đặt lại mật khẩu' : ''}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lưu thất bại.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h3 className="text-lg font-bold text-gray-100">Sửa thông tin khách hàng</h3>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          #{user.id} · tham gia {formatDateTime(user.createdAt)}
        </p>

        <form onSubmit={submit} className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Họ tên">
              <input className={inputClass} placeholder="Chưa đặt tên" {...field('fullName')} />
            </Field>
            <Field label="Số điện thoại">
              <input className={inputClass} placeholder="09xx xxx xxx" {...field('phone')} />
            </Field>
            <Field
              label="Email"
              hint={
                user.role === 'admin'
                  ? 'Tài khoản admin — quyền gắn với email trong ADMIN_EMAILS nên phải sửa ở .env rồi khởi động lại.'
                  : 'Cũng là tên đăng nhập của khách.'
              }
            >
              <input
                className={inputClass}
                type="email"
                // Server chặn hẳn việc đổi email của tài khoản admin; khoá luôn ở đây
                // để khỏi gõ xong mới nhận lỗi.
                readOnly={user.role === 'admin'}
                {...field('email')}
              />
            </Field>
            <Field label="Trạng thái" hint="Tài khoản bị khoá không đăng nhập được.">
              <select className={selectClass} {...field('status')}>
                <option value="active">Đang hoạt động</option>
                <option value="banned">Đã khoá</option>
              </select>
            </Field>
          </div>

          <div className="border-t border-dark-800 pt-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Gói dịch vụ &amp; hạn mức</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Gói hết hạn lúc" hint="Để trống nghĩa là chưa có gói. Đẩy về tương lai để gia hạn tay.">
                <input className={inputClass} type="datetime-local" {...field('subscriptionExpiresAt')} />
              </Field>
              <Field label="Hạn mức mỗi tháng" hint="Số điểm được cấp lại đầu mỗi chu kỳ tháng.">
                <input className={inputClass} inputMode="numeric" {...field('monthlyAllowance')} />
              </Field>
              <Field label="Cấp lại hạn mức lúc" hint="Qua mốc này hạn mức tự đầy lại. Để trống sẽ cấp lại ở lần thao tác điểm kế tiếp.">
                <input className={inputClass} type="datetime-local" {...field('monthlyPeriodEnd')} />
              </Field>
              <div className="text-[11px] text-gray-600 self-end pb-2">
                Hạn mức còn lại hiện tại: <strong className="text-gray-400">{formatNumber(user.monthlyTokens)}</strong>{' '}
                điểm. Cộng/trừ số này ở nút <strong className="text-gray-400">Điểm</strong> để có dòng ghi trong sổ cái.
                Hạ hạn mức tháng xuống thấp hơn số còn lại sẽ kéo số còn lại xuống theo.
              </div>
            </div>
          </div>

          <div className="border-t border-dark-800 pt-5">
            <Field
              label="Đặt lại mật khẩu"
              hint="Bỏ trống nếu không đổi. Đặt xong nhớ báo mật khẩu mới cho khách — hệ thống không gửi email."
            >
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ít nhất 8 ký tự"
                autoComplete="new-password"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="submit" isLoading={isSaving} className="!rounded-xl">
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------

const AdjustTokenModal: React.FC<{
  user: AdminUser;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}> = ({ user, onClose, onDone }) => {
  const [bucket, setBucket] = useState<'purchased' | 'monthly'>('purchased');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isMonthly = bucket === 'monthly';
  const currentBalance = isMonthly ? user.monthlyTokens : user.purchasedTokens;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value === 0) return setError('Nhập số nguyên khác 0 (số âm để trừ điểm).');
    if (!reason.trim()) return setError('Vui lòng nhập lý do — lý do sẽ hiện trong sao kê của khách.');

    setError(null);
    setIsSaving(true);
    try {
      const data = await api.post<{ balanceAfter: number }>(`/admin/users/${user.id}/tokens`, {
        amount: value,
        reason: reason.trim(),
        bucket,
      });
      await onDone(
        `Đã ${value > 0 ? 'cộng' : 'trừ'} ${formatNumber(Math.abs(value))} điểm ` +
          `(${isMonthly ? 'hạn mức tháng' : 'điểm mua thêm'}) cho ${user.email}. ` +
          `Còn lại: ${formatNumber(data.balanceAfter)}.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác thất bại.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-100">Điều chỉnh điểm</h3>
        <p className="text-sm text-gray-500 mt-1 mb-5">{user.email}</p>

        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <Field
            label="Nguồn điểm"
            hint={
              isMonthly
                ? `Hạn mức tháng bị xoá khi sang chu kỳ mới. Không cộng vượt quá ${formatNumber(user.monthlyAllowance)} điểm của gói.`
                : 'Điểm mua thêm không hết hạn. Dùng cho đền bù, khuyến mãi.'
            }
          >
            <select
              className={selectClass}
              value={bucket}
              onChange={(e) => setBucket(e.target.value as 'purchased' | 'monthly')}
            >
              <option value="purchased">Điểm mua thêm — không hết hạn</option>
              <option value="monthly">Hạn mức tháng — reset mỗi chu kỳ</option>
            </select>
          </Field>

          <Field label="Số điểm" hint={`Đang có ${formatNumber(currentBalance)}. Số dương để cộng, số âm để trừ.`}>
            <input
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
              inputMode="numeric"
              autoFocus
            />
          </Field>

          <Field label="Lý do" hint="Sẽ hiển thị trong sao kê điểm của khách.">
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Đền bù ảnh lỗi / khuyến mãi..."
            />
          </Field>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="submit" isLoading={isSaving} className="!rounded-xl">
              Xác nhận
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
