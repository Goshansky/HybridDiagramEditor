import { api } from './api';

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await api.put('/users/password', payload);
}
