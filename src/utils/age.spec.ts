import { describe, it, expect } from 'vitest'
import { ageInMonths, bucketIndexByMonths, AGE_BUCKET_BOUNDS } from '@/utils/age'

describe('ageInMonths', () => {
  it('同日为 0 月龄', () => {
    expect(ageInMonths('2026-01-01', new Date('2026-01-01T00:00:00').getTime())).toBeCloseTo(0, 5)
  })

  it('约 30.44 天为 1 月龄', () => {
    const birth = new Date('2026-01-01T00:00:00').getTime()
    const later = birth + 30.44 * 24 * 3600_000
    expect(ageInMonths('2026-01-01', later)).toBeCloseTo(1, 5)
  })

  it('分数月龄（半年）', () => {
    const birth = new Date('2026-01-01T00:00:00').getTime()
    const later = birth + 182.64 * 24 * 3600_000 // ~6 months
    expect(ageInMonths('2026-01-01', later)).toBeCloseTo(6, 2)
  })

  it('出生在未来 → 负月龄', () => {
    const birth = new Date('2027-01-01T00:00:00').getTime()
    const now = new Date('2026-01-01T00:00:00').getTime()
    expect(ageInMonths('2027-01-01', now)).toBeLessThan(0)
    expect(birth).toBeGreaterThan(now)
  })

  it('非法出生日期 → NaN（调用方需自行兜底）', () => {
    expect(Number.isNaN(ageInMonths('not-a-date', Date.now()))).toBe(true)
  })
})

describe('bucketIndexByMonths', () => {
  it('分段边界：0 / 1 / 3 / 6 / 9 / 12 月', () => {
    const cases: [number, number][] = [
      [0, 0],
      [0.9, 0],
      [1, 1],
      [2.9, 1],
      [3, 2],
      [5.9, 2],
      [6, 3],
      [8.9, 3],
      [9, 4],
      [11.9, 4],
      [12, 5],
      [24, 5],
    ]
    for (const [months, index] of cases) {
      expect(bucketIndexByMonths(months), `months=${months}`).toBe(index)
    }
  })

  it('负数 / NaN 月龄落到第 0 段（新生儿兜底）', () => {
    expect(bucketIndexByMonths(-1)).toBe(0)
    expect(bucketIndexByMonths(Number.NaN)).toBe(0)
  })

  it('分段数量 = 边界数量 + 1', () => {
    expect(bucketIndexByMonths(Number.MAX_SAFE_INTEGER)).toBe(AGE_BUCKET_BOUNDS.length)
  })
})
