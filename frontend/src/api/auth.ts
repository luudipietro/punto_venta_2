import { apiClient } from '@/api/client'
import type { AuthUser } from '@/stores/authStore'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: AuthUser
}

export const authApi = {
  login: (payload: LoginRequest) => apiClient.post<LoginResponse>('/auth/login', payload),
  me: () => apiClient.get<AuthUser>('/auth/me'),
}
