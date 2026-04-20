import { api } from './api';
import type { UserResponse } from './authApi';

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

export interface UserStatsResponse {
  totalDiagrams: number;
  totalVersions: number;
  lastActivityDate: string | null;
}

export type ActivityPeriod = 'day' | 'week' | 'month' | 'year';

export interface VersionActivityItemResponse {
  bucket: string;
  count: number;
}

export interface VersionActivityResponse {
  period: ActivityPeriod;
  granularity: 'hour' | 'day';
  startDate: string;
  endDate: string;
  items: VersionActivityItemResponse[];
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await api.put('/users/password', payload);
}

export async function getCurrentUser(): Promise<UserResponse> {
  const response = await api.get<UserResponse>('/users/me');
  return response.data;
}

export async function getUserStats(): Promise<UserStatsResponse> {
  const response = await api.get<UserStatsResponse>('/users/stats');
  return response.data;
}

export async function getVersionActivity(period: ActivityPeriod): Promise<VersionActivityResponse> {
  const response = await api.get<VersionActivityResponse>('/users/version-activity', {
    params: { period },
  });
  return response.data;
}
