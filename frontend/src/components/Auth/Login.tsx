import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

import { login } from '../../services/authApi';
import { useAppDispatch, useAppSelector } from '../../store';
import { authFailure, authStart, authSuccess } from '../../store/authSlice';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((state) => state.auth);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dispatch(authStart());

    try {
      const data = await login({ email, password });
      dispatch(authSuccess({ token: data.access_token, user: null }));
      navigate('/', { replace: true });
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? 'Ошибка входа')
        : 'Ошибка входа';
      dispatch(authFailure(message));
    }
  };

  return (
    <div style={containerStyle}>
      <form onSubmit={handleSubmit} style={formStyle}>
        <h2 style={{ margin: 0 }}>Вход</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="password"
          placeholder="Пароль (6-72 символов)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={inputStyle}
          minLength={6}
          maxLength={72}
          required
        />
        {error ? <div style={errorStyle}>{error}</div> : null}
        <button type="submit" style={buttonStyle} disabled={status === 'loading'}>
          {status === 'loading' ? 'Входим...' : 'Войти'}
        </button>
        <Link to="/register" style={linkStyle}>
          Нет аккаунта? Зарегистрироваться
        </Link>
      </form>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: '#0f172a',
  color: '#e5e7eb',
};

const formStyle: React.CSSProperties = {
  width: 360,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  background: '#020617',
  border: '1px solid #1f2937',
  borderRadius: 8,
  padding: 20,
};

const inputStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#e5e7eb',
  padding: '0 10px',
};

const buttonStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 6,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  background: '#7f1d1d',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
};

const linkStyle: React.CSSProperties = {
  color: '#93c5fd',
  fontSize: 14,
  textDecoration: 'none',
};
