// Same-origin in production (a host Nginx proxies /api/ to the backend,
// mirroring the admin frontend's setup — see nginx.conf); localhost:8000
// directly in dev, matching `frontend/src/api/client.ts`'s default.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export function getMediaUrl(path?: string | null): string {
  if (!path) return ''

  // Las imágenes que ya tienen URL absoluta se mantienen igual.
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  // Las rutas relativas se resuelven contra el backend configurado.
  const base = API_BASE_URL.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

   // Si la ruta ya comienza con la base, no la agregamos otra vez.
  if (base && (normalizedPath === base || normalizedPath.startsWith(`${base}/`))) {
    return normalizedPath
  }


  return `${base}${normalizedPath}`
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  if (!response.ok) {
    throw new ApiError(response.statusText || `Request failed with status ${response.status}`, response.status)
  }
  return (await response.json()) as T
}

// No auth headers anywhere — the storefront is entirely public, there is no
// login and nothing here ever writes back to the POS's own data (the
// `/storefront/cart/preview` POST below is a pure computation, not a write).
export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
}
