import { createCrudApi } from '@/api/base'

export interface Expense {
  id: number
  branch_id: number
  payment_method_id: number
  amount: number
  description: string
  date: string
}

export interface ExpenseInput {
  branch_id: number
  payment_method_id: number
  amount: number
  description: string
  date: string
}

export const expenseApi = createCrudApi<Expense, ExpenseInput>('expenses')
