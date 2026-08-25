import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

/** Bespoke mutation, not `createCrudHooks` — login isn't a CRUD list. */
export function useLogin() {
  const login = useAuthStore((s) => s.login)
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => login(data.access_token, data.user),
  })
}
