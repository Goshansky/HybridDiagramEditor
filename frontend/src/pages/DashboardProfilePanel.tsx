import React, { useEffect, useState } from 'react';
import axios from 'axios';

import { changePassword, getCurrentUser } from '../services/userApi';
import { setAuthUser } from '../store/authSlice';
import { useAppDispatch, useAppSelector } from '../store';
import { UserStats } from './UserStats';

export const DashboardProfilePanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const authUser = useAppSelector((state) => state.auth.user);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadCurrentUser = async (): Promise<void> => {
      try {
        const user = await getCurrentUser();
        if (!mounted) return;
        dispatch(setAuthUser(user));
      } catch (error) {
        if (!mounted) return;
        const message = axios.isAxiosError(error)
          ? (error.response?.data?.detail ?? 'Не удалось загрузить профиль')
          : 'Не удалось загрузить профиль';
        setStatusMessage(message);
      }
    };
    void loadCurrentUser();
    return () => {
      mounted = false;
    };
  }, [dispatch]);

  const handleChangePassword: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setLoading(true);
    setStatusMessage(null);
    try {
      await changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      setOldPassword('');
      setNewPassword('');
      setStatusMessage('Пароль успешно изменен');
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? 'Не удалось изменить пароль')
        : 'Не удалось изменить пароль';
      setStatusMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ color: '#111827' }}>
      <div style={topRowStyle}>
        <section style={{ ...cardStyle, ...infoCardStyle }}>
          <div style={rowStyle}>
            <span style={keyStyle}>Email:</span>
            <span>{authUser?.email ?? '...'}</span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Дата регистрации:</span>
            <span>{authUser ? new Date(authUser.created_at).toLocaleString() : '...'}</span>
          </div>
        </section>

        <section style={{ ...cardStyle, ...passwordCardStyle }}>
          <h2 style={sectionTitleStyle}>Смена пароля</h2>
          <form onSubmit={handleChangePassword} style={{ display: 'grid', gap: 10 }}>
            <input
              type="password"
              placeholder="Старый пароль"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              minLength={6}
              maxLength={72}
              required
              style={inputStyle}
              autoComplete="current-password"
            />
            <input
              type="password"
              placeholder="Новый пароль"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={6}
              maxLength={72}
              required
              style={inputStyle}
              autoComplete="new-password"
            />
            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? 'Сохраняем...' : 'Изменить пароль'}
            </button>
          </form>
        </section>
      </div>

      <UserStats />

      {statusMessage ? <div style={statusStyle}>{statusMessage}</div> : null}
    </div>
  );
};

const topRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 380px',
  gap: 12,
  alignItems: 'stretch',
};

const infoCardStyle: React.CSSProperties = {
  minHeight: 112,
};

const passwordCardStyle: React.CSSProperties = {
  minHeight: 112,
};

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 14,
  marginBottom: 12,
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
};

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 10px 0',
  fontSize: 16,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 6,
  fontSize: 14,
};

const keyStyle: React.CSSProperties = {
  color: '#6b7280',
  minWidth: 150,
};

const inputStyle: React.CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#ffffff',
  color: '#111827',
  borderRadius: 8,
  padding: '8px 10px',
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid #3b82f6',
  background: '#3b82f6',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
};

const statusStyle: React.CSSProperties = {
  marginTop: 10,
  color: '#1d4ed8',
  fontSize: 13,
};
