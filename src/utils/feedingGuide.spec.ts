import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  recommendedIntervalMs,
  recommendedIntervalLabel,
  avgFeedingIntervalMs,
  sinceLastFeedingMs,
} from '@/utils/feedingGuide'
import type { Baby } from '@/types'

vi.mock('@/i18n', () => ({
  default: {
    t: (key: string, opts?: Record<string, unknown>) =>
      opts?.h != null ? `${key}:${opts.h}` : key,
    language: 'zh-CN',
    changeLanguage: async () => {},
    on: () => {},
    off: () => {},
  },
}))

function baby(birthDate?: string): Baby | undefined {
  if (!birthDate) return undefined
  return {
    id: 1,
    name: '测试',
    gender: 'girl',
    birthDate,
    avatarColor: '#fff',
    createdAt: 0,
  }
}

/** 以固定 now 反推出生日期，得到目标月龄（约 30.44 天/月） */
function birthDateForMonths(months: number, now: number): string {
  const birth = now - months * 30.44 * 24 * 3600_000
  const d = new Date(birth)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('recommendedIntervalMs', () => {
  const now = new Date(2026, 6, 1, 12, 0).getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const H = 3600_000

  it('无 baby → 2.5h', () => {
    expect(recommendedIntervalMs()).toBe(2.5 * H)
    expect(recommendedIntervalMs(undefined)).toBe(2.5 * H)
  })

  it('无 birthDate → 2.5h', () => {
    expect(recommendedIntervalMs(baby(undefined))).toBe(2.5 * H)
  })

  it('月龄边界分段 0/1/3/6/9/12', () => {
    const cases: [number, number][] = [
      [0, 2.5],
      [0.9, 2.5],
      [1, 3],
      [2.9, 3],
      [3, 3.5],
      [5.9, 3.5],
      [6, 4],
      [8.9, 4],
      [9, 4.5],
      [11.9, 4.5],
      [12, 5],
      [18, 5],
    ]
    for (const [months, expectH] of cases) {
      const b = baby(birthDateForMonths(months, now))
      expect(recommendedIntervalMs(b), `months=${months}`).toBe(expectH * H)
    }
  })

  it('非法 birthDate → NaN 月龄落到 5h（记录当前行为）', () => {
    expect(recommendedIntervalMs(baby('abc'))).toBe(5 * H)
  })
})

describe('recommendedIntervalLabel', () => {
  it('返回含插值的文案', () => {
    const label = recommendedIntervalLabel()
    expect(label).toContain('feed.aboutHours')
    expect(label).toContain('2.5')
  })
})

describe('avgFeedingIntervalMs', () => {
  it('空/1 个 → null', () => {
    expect(avgFeedingIntervalMs([])).toBeNull()
    expect(avgFeedingIntervalMs([1000])).toBeNull()
  })

  it('2 个点求 gap', () => {
    expect(avgFeedingIntervalMs([3000, 1000])).toBe(2000)
  })

  it('乱序输入先排序取最近点', () => {
    expect(avgFeedingIntervalMs([1000, 3000, 2000])).toBe(1000)
  })

  it('count=3 只取最近 4 个点', () => {
    // 5 个点：1000..5000，取最近 4 个 → gaps 平均
    const times = [1000, 2000, 3000, 4000, 5000]
    // sorted desc: 5000,4000,3000,2000,1000 → slice(0,4) → 5000,4000,3000,2000 → gaps 1000*3 avg 1000
    expect(avgFeedingIntervalMs(times, 3)).toBe(1000)
  })

  it('相同时间 gap=0', () => {
    expect(avgFeedingIntervalMs([5000, 5000])).toBe(0)
  })
})

describe('sinceLastFeedingMs', () => {
  it('正常差值', () => {
    expect(sinceLastFeedingMs(1000, 4000)).toBe(3000)
  })
  it('负数 clamp 为 0', () => {
    expect(sinceLastFeedingMs(5000, 4000)).toBe(0)
  })
})
