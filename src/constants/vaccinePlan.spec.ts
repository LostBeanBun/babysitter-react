import { describe, expect, it } from 'vitest'
import {
  planDateFromBirth,
} from '@/constants/vaccinePlan'

describe('planDateFromBirth', () => {
  it('计算出生当天的疫苗日期（0 月龄）', () => {
    expect(planDateFromBirth('2025-01-15', 0)).toBe('2025-01-15')
  })

  it('计算跨年的月龄', () => {
    expect(planDateFromBirth('2025-01-15', 12)).toBe('2026-01-15')
  })

  it('月末溢出时钳制到当月最后一天', () => {
    // 1 月 31 日 + 1 个月 → 2 月 28 日（非闰年）
    expect(planDateFromBirth('2025-01-31', 1)).toBe('2025-02-28')
  })

  it('闰年 2 月 29 日 + 12 个月保持 2 月 29 日', () => {
    expect(planDateFromBirth('2024-02-29', 12)).toBe('2025-02-28')
  })
})