import { expenseApi } from '@/api/expense'
import { createCrudHooks } from '@/hooks/createCrudHooks'

export const {
  useList: useExpenses,
  useGetById: useExpense,
  useCreate: useCreateExpense,
  useUpdate: useUpdateExpense,
  useRemove: useDeleteExpense,
} = createCrudHooks('expenses', expenseApi)
