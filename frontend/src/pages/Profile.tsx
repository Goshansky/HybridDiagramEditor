import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

import { getCurrentUser, changePassword } from '../services/userApi';
import { useAppDispatch, useAppSelector } from '../store';
import { setAuthUser } from '../store/authSlice';

export const Profile: React.FC = () => {
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
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Профиль</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/" style={linkButtonStyle}>
            Редактор
          </Link>
          <Link to="/projects" style={linkButtonStyle}>
            Проекты
          </Link>
        </div>
      </div>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Данные пользователя</h2>
        <div style={rowStyle}>
          <span style={keyStyle}>Email:</span>
          <span>{authUser?.email ?? '...'}</span>
        </div>
        <div style={rowStyle}>
          <span style={keyStyle}>Дата регистрации:</span>
          <span>{authUser ? new Date(authUser.created_at).toLocaleString() : '...'}</span>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitleStyle}>Смена пароля</h2>
        <form onSubmit={handleChangePassword} style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
          <input
            type="password"
            placeholder="Старый пароль"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            minLength={6}
            maxLength={72}
            required
            style={inputStyle}
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
          />
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Сохраняем...' : 'Изменить пароль'}
          </button>
        </form>
      </section>

      {statusMessage ? <div style={statusStyle}>{statusMessage}</div> : null}
    </div>
  );
};

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  padding: 16,
  background: '#0f172a',
  color: '#e5e7eb',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
};

const cardStyle: React.CSSProperties = {
  background: '#020617',
  border: '1px solid #1f2937',
  borderRadius: 8,
  padding: 14,
  marginBottom: 12,
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
  color: '#94a3b8',
  minWidth: 150,
};

const inputStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '8px 10px',
};

const buttonStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#1d4ed8',
  color: '#fff',
  borderRadius: 6,
  padding: '8px 12px',
  cursor: 'pointer',
};

const linkButtonStyle: React.CSSProperties = {
  border: '1px solid #334155',
  background: '#020617',
  color: '#e5e7eb',
  borderRadius: 6,
  padding: '7px 10px',
  textDecoration: 'none',
  fontSize: 13,
};

const statusStyle: React.CSSProperties = {
  marginTop: 10,
  color: '#93c5fd',
  fontSize: 13,
};
