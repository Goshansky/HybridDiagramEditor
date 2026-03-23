import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface UserInfo {
  id: number;
  email: string;
  created_at: string;
}

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

export interface AuthState {
  token: string | null;
  user: UserInfo | null;
  status: AuthStatus;
  error: string | null;
}

const initialState: AuthState = {
  token: localStorage.getItem('auth_token'),
  user: null,
  status: localStorage.getItem('auth_token') ? 'authenticated' : 'idle',
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    authStart(state) {
      state.status = 'loading';
      state.error = null;
    },
    authSuccess(
      state,
      action: PayloadAction<{ token: string; user: UserInfo | null }>,
    ) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.status = 'authenticated';
      state.error = null;
      localStorage.setItem('auth_token', action.payload.token);
    },
    setAuthUser(state, action: PayloadAction<UserInfo>) {
      state.user = action.payload;
    },
    authFailure(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
      state.token = null;
      state.user = null;
      localStorage.removeItem('auth_token');
    },
    logout(state) {
      state.status = 'idle';
      state.error = null;
      state.token = null;
      state.user = null;
      localStorage.removeItem('auth_token');
    },
  },
});

export const { authStart, authSuccess, setAuthUser, authFailure, logout } =
  authSlice.actions;
export const authReducer = authSlice.reducer;
