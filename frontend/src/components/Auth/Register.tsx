import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

import { login, register } from '../../services/authApi';
import { useAppDispatch, useAppSelector } from '../../store';
import { authFailure, authStart, authSuccess } from '../../store/authSlice';
import styles from './Auth.module.css';

export const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((state) => state.auth);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dispatch(authStart());

    try {
      await register({ email, password });
      const tokenData = await login({ email, password });
      dispatch(authSuccess({ token: tokenData.access_token, user: null }));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? 'Ошибка регистрации')
        : 'Ошибка регистрации';
      dispatch(authFailure(message));
    }
  };

  return (
    <div className={styles.page}>
      <form onSubmit={handleSubmit} className={styles.card}>
        <h2 className={styles.title}>Регистрация</h2>
        <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={styles.input}
            autoComplete="email"
            required
        />
        <input
            type="password"
            placeholder="Пароль (6-72 символов)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={styles.input}
            autoComplete="new-password"
            minLength={6}
            maxLength={72}
            required
        />
        {error ? <div className={styles.error}>{error}</div> : null}
        <button type="submit" className={styles.button} disabled={status === 'loading'}>
          {status === 'loading' ? 'Создаем...' : 'Создать аккаунт'}
        </button>
        <span>
          Уже есть аккаунт? <Link to="/login" className={styles.link}>Войти</Link>
        </span>
      </form>
    </div>
  );
};
