import { createCrudApi } from '@/api/base'

export interface Color {
  id: number
  name: string
  hex_code: string
}

export interface ColorInput {
  name: string
  hex_code: string
}

export const colorApi = createCrudApi<Color, ColorInput>('colors')
