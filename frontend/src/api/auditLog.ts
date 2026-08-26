import { apiClient } from '@/api/client'

export interface AuditLog {
  id: number
  actor_user_id: number | null
  actor_username: string
  action: string
  entity_type: string
  entity_id: number
  branch_id: number | null
  summary: string
  created_at: string
}

export interface AuditLogFilters {
  startDate?: string
  endDate?: string
  branchId?: number | null
  action?: string
}

export const auditLogApi = {
  list: (filters: AuditLogFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.startDate) params.set('start_date', filters.startDate)
    if (filters.endDate) params.set('end_date', filters.endDate)
    if (filters.branchId != null) params.set('branch_id', String(filters.branchId))
    if (filters.action) params.set('action', filters.action)
    const query = params.toString()
    return apiClient.get<AuditLog[]>(`/audit-logs${query ? `?${query}` : ''}`)
  },
}
