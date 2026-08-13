import { createCrudApi } from '@/api/base'

export interface Size {
  id: number
  label: string
}

export interface SizeInput {
  label: string
}

export const sizeApi = createCrudApi<Size, SizeInput>('sizes')
