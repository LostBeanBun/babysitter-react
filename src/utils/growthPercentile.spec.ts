import { describe, it, expect } from 'vitest'
import { estimatePercentile, normCdf } from '@/utils/growthPercentile'
import { WHO_BOY, interpolateWho } from '@/constants/whoGrowth'

describe('normCdf', () => {
  it('标准正态 CDF 基本性质', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 5)
    expect(normCdf(1.0364)).toBeCloseTo(0.85, 2)
    expect(normCdf(-1.0364)).toBeCloseTo(0.15, 2)
    expect(normCdf(1.8808)).toBeCloseTo(0.97, 2)
    expect(normCdf(100)).toBe(1)
    expect(normCdf(-100)).toBe(0)
  })
})

describe('estimatePercentile', () => {
  it('P50 锚点值应估算为约 50', () => {
    const p = estimatePercentile(WHO_BOY, 0, 'weight', interpolateWho(WHO_BOY, 0, 'weight', 'p50'))
    expect(p).toBeGreaterThanOrEqual(45)
    expect(p).toBeLessThanOrEqual(55)
  })

  it('P3 锚点值应估算为约 3', () => {
    const p = estimatePercentile(WHO_BOY, 6, 'weight', interpolateWho(WHO_BOY, 6, 'weight', 'p3'))
    expect(p).toBeGreaterThanOrEqual(1)
    expect(p).toBeLessThanOrEqual(8)
  })

  it('P97 锚点值应估算为约 97', () => {
    const p = estimatePercentile(WHO_BOY, 12, 'length', interpolateWho(WHO_BOY, 12, 'length', 'p97'))
    expect(p).toBeGreaterThanOrEqual(92)
    expect(p).toBeLessThanOrEqual(99)
  })

  it('P50 与 P15 之间的值应落在 15-50 区间', () => {
    const p15 = interpolateWho(WHO_BOY, 3, 'weight', 'p15')
    const p50 = interpolateWho(WHO_BOY, 3, 'weight', 'p50')
    const mid = (p15 + p50) / 2
    const p = estimatePercentile(WHO_BOY, 3, 'weight', mid)
    expect(p).toBeGreaterThan(15)
    expect(p).toBeLessThan(50)
  })

  it('低于 P3 的值应 clamp 到 1 且接近下限', () => {
    const p3 = interpolateWho(WHO_BOY, 0, 'weight', 'p3')
    const p = estimatePercentile(WHO_BOY, 0, 'weight', p3 - 0.5)
    expect(p).toBeGreaterThanOrEqual(1)
    expect(p).toBeLessThan(3)
  })

  it('高于 P97 的值应 clamp 到 99 且接近上限', () => {
    const p97 = interpolateWho(WHO_BOY, 0, 'weight', 'p97')
    const p = estimatePercentile(WHO_BOY, 0, 'weight', p97 + 0.5)
    expect(p).toBeGreaterThan(97)
    expect(p).toBeLessThanOrEqual(99)
  })

  it('分数月龄也能正确插值（插值点应介于整数月龄结果之间）', () => {
    const month6 = estimatePercentile(WHO_BOY, 6, 'weight', 8)
    const month7 = estimatePercentile(WHO_BOY, 7, 'weight', 8)
    const month65 = estimatePercentile(WHO_BOY, 6.5, 'weight', 8)
    expect(month65).toBeGreaterThanOrEqual(Math.min(month6, month7))
    expect(month65).toBeLessThanOrEqual(Math.max(month6, month7))
  })

  it('空数据集返回保守值 50', () => {
    expect(estimatePercentile([], 6, 'weight', 8)).toBe(50)
  })

  it('头围字段独立计算', () => {
    const hc50 = interpolateWho(WHO_BOY, 6, 'hc', 'p50')
    const p = estimatePercentile(WHO_BOY, 6, 'hc', hc50)
    expect(p).toBeGreaterThanOrEqual(45)
    expect(p).toBeLessThanOrEqual(55)
  })
})
