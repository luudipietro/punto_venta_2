import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface CrudApi<TRead, TInput> {
  list: () => Promise<TRead[]>
  getById: (id: number) => Promise<TRead>
  create: (payload: TInput) => Promise<TRead>
  update: (id: number, payload: TInput) => Promise<TRead>
  remove: (id: number) => Promise<void>
}

/** Generic TanStack Query hook set for a simple catalog entity — mirrors the
 * backend's generic `CrudService[DomainT]` pattern so each entity only needs
 * to plug in its API client, not reimplement loading/cache/invalidation. */
export function createCrudHooks<TRead, TInput>(queryKey: string, api: CrudApi<TRead, TInput>) {
  function useList() {
    return useQuery({ queryKey: [queryKey], queryFn: api.list })
  }

  function useGetById(id: number | undefined) {
    return useQuery({
      queryKey: [queryKey, id],
      queryFn: () => api.getById(id as number),
      enabled: id !== undefined,
    })
  }

  function useCreate() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: api.create,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
    })
  }

  function useUpdate() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: ({ id, payload }: { id: number; payload: TInput }) => api.update(id, payload),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
    })
  }

  function useRemove() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: api.remove,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
    })
  }

  return { useList, useGetById, useCreate, useUpdate, useRemove }
}
