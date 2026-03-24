import { api } from './api';
import type { UserResponse } from './authApi';

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await api.put('/users/password', payload);
}

export async function getCurrentUser(): Promise<UserResponse> {
  const response = await api.get<UserResponse>('/users/me');
  return response.data;
}
