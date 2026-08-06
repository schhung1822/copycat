import React, { useState } from 'react';
import { Button } from '../components/Button';
import { Alert, Card, Field, inputClass } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';

export const AccountPage: React.FC = () => {
  const { user, refreshUser } = useAuth();

  const [profile, setProfile] = useState({ fullName: user?.fullName ?? '', phone: user?.phone ?? '' });
  const [profileMessage, setProfileMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordMessage, setPasswordMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileMessage(null);
    setSavingProfile(true);
    try {
      await api.patch('/auth/me', { fullName: profile.fullName, phone: profile.phone });
      await refreshUser();
      setProfileMessage({ tone: 'success', text: 'Đã lưu thông tin.' });
    } catch (err) {
      setProfileMessage({ tone: 'error', text: err instanceof ApiError ? err.message : 'Lưu thất bại.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);

    if (passwords.next.length < 6) {
      return setPasswordMessage({ tone: 'error', text: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }
    if (passwords.next !== passwords.confirm) {
      return setPasswordMessage({ tone: 'error', text: 'Hai mật khẩu mới không khớp nhau.' });
    }

    setSavingPassword(true);
    try {
      await api.post('/auth/me/password', { currentPassword: passwords.current, newPassword: passwords.next });
      setPasswords({ current: '', next: '', confirm: '' });
      setPasswordMessage({ tone: 'success', text: 'Đã đổi mật khẩu.' });
    } catch (err) {
      setPasswordMessage({ tone: 'error', text: err instanceof ApiError ? err.message : 'Đổi mật khẩu thất bại.' });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-100">Thông tin tài khoản</h1>

      <Card className="p-5">
        <div className="flex justify-between text-sm pb-4 mb-4 border-b border-dark-800">
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider font-bold">Email</p>
            <p className="text-gray-100 mt-1">{user?.email}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-xs uppercase tracking-wider font-bold">Tham gia</p>
            <p className="text-gray-300 mt-1">{formatDateTime(user?.createdAt)}</p>
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          {profileMessage && <Alert tone={profileMessage.tone}>{profileMessage.text}</Alert>}

          <Field label="Họ và tên">
            <input
              className={inputClass}
              value={profile.fullName}
              onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
            />
          </Field>

          <Field label="Số điện thoại">
            <input
              className={inputClass}
              value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            />
          </Field>

          <Button type="submit" isLoading={savingProfile} className="!rounded-xl !py-2.5">
            Lưu thay đổi
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold text-gray-100 mb-4">Đổi mật khẩu</h2>
        <form onSubmit={savePassword} className="space-y-4">
          {passwordMessage && <Alert tone={passwordMessage.tone}>{passwordMessage.text}</Alert>}

          <Field label="Mật khẩu hiện tại">
            <input
              type="password"
              className={inputClass}
              value={passwords.current}
              onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
              autoComplete="current-password"
              required
            />
          </Field>

          <Field label="Mật khẩu mới">
            <input
              type="password"
              className={inputClass}
              value={passwords.next}
              onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))}
              autoComplete="new-password"
              required
            />
          </Field>

          <Field label="Nhập lại mật khẩu mới">
            <input
              type="password"
              className={inputClass}
              value={passwords.confirm}
              onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
              autoComplete="new-password"
              required
            />
          </Field>

          <Button type="submit" isLoading={savingPassword} variant="secondary" className="!rounded-xl !py-2.5">
            Đổi mật khẩu
          </Button>
        </form>
      </Card>
    </div>
  );
};
