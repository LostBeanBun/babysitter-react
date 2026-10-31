import { describe, it, expect } from 'vitest'
import { ageInMonths, interpolateWho, whoData, WHO_BOY, WHO_GIRL } from '@/constants/whoGrowth'

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

describe('interpolateWho', () => {
  it('空数组 → 0', () => {
    expect(interpolateWho([], 3, 'weight', 'p50')).toBe(0)
  })

  it('恰在整数锚点返回该点值', () => {
    expect(interpolateWho(WHO_BOY, 0, 'weight', 'p50')).toBe(WHO_BOY[0].weight.p50)
    expect(interpolateWho(WHO_BOY, 12, 'weight', 'p50')).toBe(WHO_BOY[12].weight.p50)
  })

  it('两点之间线性插值', () => {
    const a = WHO_BOY[0].weight.p50
    const b = WHO_BOY[1].weight.p50
    const mid = interpolateWho(WHO_BOY, 0.5, 'weight', 'p50')
    expect(mid).toBeCloseTo((a + b) / 2, 5)
  })

  it('月龄越界 clamp 两端', () => {
    expect(interpolateWho(WHO_BOY, -5, 'weight', 'p50')).toBe(WHO_BOY[0].weight.p50)
    expect(interpolateWho(WHO_BOY, 99, 'weight', 'p50')).toBe(WHO_BOY[24].weight.p50)
  })

  it('length / hc 字段均可插值', () => {
    expect(interpolateWho(WHO_GIRL, 0, 'length', 'p50')).toBe(WHO_GIRL[0].length.p50)
    expect(interpolateWho(WHO_GIRL, 12, 'hc', 'p50')).toBe(WHO_GIRL[12].hc.p50)
  })
})

describe('whoData', () => {
  it('boy → WHO_BOY', () => {
    expect(whoData('boy')).toBe(WHO_BOY)
  })
  it('girl → WHO_GIRL', () => {
    expect(whoData('girl')).toBe(WHO_GIRL)
  })
  it('undefined → WHO_GIRL（保守默认）', () => {
    expect(whoData(undefined)).toBe(WHO_GIRL)
  })
})

describe('WHO 数据集', () => {
  it('覆盖 0-24 月龄且逐月递增', () => {
    for (const data of [WHO_BOY, WHO_GIRL]) {
      expect(data).toHaveLength(25)
      expect(data[0].month).toBe(0)
      expect(data[24].month).toBe(24)
      for (let i = 1; i < data.length; i++) {
        expect(data[i].weight.p50).toBeGreaterThan(data[i - 1].weight.p50)
        expect(data[i].length.p50).toBeGreaterThan(data[i - 1].length.p50)
        expect(data[i].hc.p50).toBeGreaterThan(data[i - 1].hc.p50)
      }
    }
  })

  it('各百分位单调：p3 < p15 < p50 < p85 < p97', () => {
    for (const data of [WHO_BOY, WHO_GIRL]) {
      for (const point of data) {
        for (const field of ['weight', 'length', 'hc'] as const) {
          const p = point[field]
          expect(p.p3).toBeLessThan(p.p15)
          expect(p.p15).toBeLessThan(p.p50)
          expect(p.p50).toBeLessThan(p.p85)
          expect(p.p85).toBeLessThan(p.p97)
        }
      }
    }
  })
})
