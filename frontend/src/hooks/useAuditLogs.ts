import { useQuery } from '@tanstack/react-query'
import { auditLogApi, type AuditLogFilters } from '@/api/auditLog'

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => auditLogApi.list(filters),
  })
}
