import { api } from './api';

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface UserResponse {
  id: number;
  email: string;
  created_at: string;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
}

export async function register(payload: RegisterRequest): Promise<UserResponse> {
  const response = await api.post<UserResponse>('/auth/register', payload);
  return response.data;
}

export async function login(payload: RegisterRequest): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/login', payload);
  return response.data;
}
