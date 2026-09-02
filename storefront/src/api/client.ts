// Same-origin in production (a host Nginx proxies /api/ to the backend,
// mirroring the admin frontend's setup — see nginx.conf); localhost:8000
// directly in dev, matching `frontend/src/api/client.ts`'s default.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    throw new ApiError(response.statusText || `Request failed with status ${response.status}`, response.status)
  }
  return (await response.json()) as T
}

// GET-only client on purpose — the storefront is entirely read-only, there
// is no login and nothing here ever writes back to the POS.
export const apiClient = {
  get: <T>(path: string) => request<T>(path),
}
