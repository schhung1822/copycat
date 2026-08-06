import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Alert, Badge, Card, EmptyState, Field, TableWrap, inputClass } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError, qs } from '../../lib/api';
import { formatDateTime, formatNumber, formatVnd, STATUS_LABEL } from '../../lib/format';
import type { AdminUser } from '../../types';

export const UsersTab: React.FC = () => {
  const { refreshUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<AdminUser | null>(null);

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
                <th className="text-left font-bold py-2">Vai trò</th>
                <th className="text-right font-bold py-2">Số dư</th>
                <th className="text-right font-bold py-2">Đã nạp</th>
                <th className="text-right font-bold py-2">Đã dùng</th>
                <th className="text-left font-bold py-2 pl-4">Trạng thái</th>
                <th className="text-left font-bold py-2">Đăng nhập cuối</th>
                <th className="text-right font-bold py-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-dark-850 last:border-0">
                  <td className="py-2.5">
                    <p className="text-gray-300 text-xs">{user.email}</p>
                    <p className="text-[10px] text-gray-600">
                      {user.fullName || 'Chưa đặt tên'}
                      {user.phone ? ` · ${user.phone}` : ''}
                    </p>
                  </td>
                  <td className="py-2.5">
                    {user.role === 'admin' ? (
                      <span className="text-[10px] font-bold text-brand-500 uppercase">Admin</span>
                    ) : (
                      <span className="text-[10px] text-gray-600 uppercase">Khách</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-brand-500 font-semibold">{formatNumber(user.tokenBalance)}</td>
                  <td className="py-2.5 text-right text-gray-300">{formatVnd(user.totalTopupVnd)}</td>
                  <td className="py-2.5 text-right text-gray-500">{formatNumber(user.tokensOut)}</td>
                  <td className="py-2.5 pl-4">
                    <Badge status={user.status}>{STATUS_LABEL[user.status]}</Badge>
                  </td>
                  <td className="py-2.5 text-[11px] text-gray-500 whitespace-nowrap">
                    {formatDateTime(user.lastLoginAt)}
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => setAdjustTarget(user)}
                      className="text-xs text-gray-400 hover:text-gray-100 px-2 transition-colors"
                    >
                      Sửa token
                    </button>
                    <button
                      onClick={() => toggleBan(user)}
                      className={`text-xs px-2 transition-colors ${
                        user.status === 'active' ? 'text-gray-500 hover:text-red-400' : 'text-green-500 hover:text-green-400'
                      }`}
                    >
                      {user.status === 'active' ? 'Khoá' : 'Mở'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <p className="text-[11px] text-gray-600">
        Quyền admin được điều khiển bằng biến <code>ADMIN_EMAILS</code> trong file <code>.env</code>, không sửa được từ
        giao diện. Thêm email vào đó rồi khởi động lại server.
      </p>

      {adjustTarget && (
        <AdjustTokenModal
          user={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onDone={async (text) => {
            setAdjustTarget(null);
            setMessage({ tone: 'success', text });
            // Admin thường tự cộng token cho chính mình để kiểm thử; đọc lại phiên
            // hiện tại để huy hiệu token cập nhật ngay, không phải tải lại trang.
            await Promise.all([load(), refreshUser()]);
          }}
        />
      )}
    </div>
  );
};

const AdjustTokenModal: React.FC<{
  user: AdminUser;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}> = ({ user, onClose, onDone }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value === 0) return setError('Nhập số nguyên khác 0 (số âm để trừ token).');
    if (!reason.trim()) return setError('Vui lòng nhập lý do — lý do sẽ hiện trong sao kê của khách.');

    setError(null);
    setIsSaving(true);
    try {
      const data = await api.post<{ tokenBalance: number }>(`/admin/users/${user.id}/tokens`, {
        amount: value,
        reason: reason.trim(),
      });
      await onDone(
        `Đã ${value > 0 ? 'cộng' : 'trừ'} ${formatNumber(Math.abs(value))} token cho ${user.email}. Số dư mới: ${formatNumber(data.tokenBalance)}.`,
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
        <h3 className="text-lg font-bold text-gray-100">Điều chỉnh token</h3>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          {user.email} · số dư hiện tại {formatNumber(user.tokenBalance)} token
        </p>

        <form onSubmit={submit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="Số token" hint="Nhập số dương để cộng, số âm để trừ. VD: 500 hoặc -200.">
            <input
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500"
              inputMode="numeric"
              autoFocus
            />
          </Field>

          <Field label="Lý do" hint="Sẽ hiển thị trong sao kê token của khách.">
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
