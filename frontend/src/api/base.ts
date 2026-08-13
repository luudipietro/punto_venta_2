import { apiClient } from '@/api/client'

/** Standard GET-list/GET-by-id/POST/PUT/DELETE set, mirroring the backend's
 * generic `SqlAlchemyRepository[ModelT]` pattern for simple catalog entities
 * (category, brand, color, size, branch, payment method). */
export function createCrudApi<TRead, TInput>(resource: string) {
  return {
    list: () => apiClient.get<TRead[]>(`/${resource}`),
    getById: (id: number) => apiClient.get<TRead>(`/${resource}/${id}`),
    create: (payload: TInput) => apiClient.post<TRead>(`/${resource}`, payload),
    update: (id: number, payload: TInput) => apiClient.put<TRead>(`/${resource}/${id}`, payload),
    remove: (id: number) => apiClient.delete(`/${resource}/${id}`),
  }
}
