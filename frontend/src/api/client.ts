import { useAuthStore } from '@/stores/authStore'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/** Reads the store's current state directly (not the hook) — this file is
 * plain functions, not a component. */
function authHeader(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface FastApiValidationDetail {
  loc: unknown[]
  msg: string
  type: string
}

/** Normalizes both domain-error responses (`{detail: string}`) and FastAPI's
 * own Pydantic validation errors (`{detail: [{loc, msg, type}]}`) into a
 * single readable message. */
async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string | FastApiValidationDetail[] }
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.detail)) {
      return data.detail.map((entry) => entry.msg).join('; ')
    }
  } catch {
    // response body wasn't JSON — fall through to statusText
  }
  return response.statusText || `Request failed with status ${response.status}`
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...authHeader(),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 401) {
    // Clears the session — the route guard reacts on the next render and
    // redirects to /login, no manual navigation needed here.
    useAuthStore.getState().logout()
  }

  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Uploads a file as multipart/form-data — unlike `request()`, this must not
 * set a Content-Type header itself, since the browser needs to add the
 * multipart boundary when it serializes the FormData body. */
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeader(),
    body: formData,
  })

  if (response.status === 401) {
    useAuthStore.getState().logout()
  }

  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status)
  }
  return (await response.json()) as T
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: File) => uploadFile<T>(path, file),
}
