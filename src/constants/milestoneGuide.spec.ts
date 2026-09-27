import { describe, it, expect } from 'vitest'
import { MILESTONE_GUIDE, milestoneGuideForAge, milestoneGuideRange } from '@/constants/milestoneGuide'

describe('milestoneGuide', () => {
  it('包含 6 个月龄段', () => {
    expect(MILESTONE_GUIDE.length).toBe(6)
  })

  it('milestoneGuideForAge 命中对应区间', () => {
    expect(milestoneGuideForAge(1)?.labelKey).toBe('milestone.guide.1_3')
    expect(milestoneGuideForAge(3)?.labelKey).toBe('milestone.guide.1_3')
    expect(milestoneGuideForAge(6)?.labelKey).toBe('milestone.guide.4_6')
    expect(milestoneGuideForAge(9)?.labelKey).toBe('milestone.guide.7_9')
    expect(milestoneGuideForAge(12)?.labelKey).toBe('milestone.guide.10_12')
    expect(milestoneGuideForAge(18)?.labelKey).toBe('milestone.guide.13_18')
    expect(milestoneGuideForAge(24)?.labelKey).toBe('milestone.guide.19_24')
  })

  it('milestoneGuideForAge 边界外返回 undefined', () => {
    expect(milestoneGuideForAge(0)).toBeUndefined()
    expect(milestoneGuideForAge(25)).toBeUndefined()
    expect(milestoneGuideForAge(100)).toBeUndefined()
  })

  it('milestoneGuideRange 生成月龄范围', () => {
    expect(milestoneGuideRange(MILESTONE_GUIDE[0])).toBe('1-3')
    expect(milestoneGuideRange(MILESTONE_GUIDE[3])).toBe('10-12')
  })
})