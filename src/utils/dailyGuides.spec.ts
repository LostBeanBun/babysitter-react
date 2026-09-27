import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dailyGuide } from '@/utils/dailyGuides'
import type { Baby } from '@/types'

vi.mock('@/i18n', () => ({
  default: {
    t: (key: string) => key,
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

function birthDateForMonths(months: number, now: number): string {
  const birth = now - months * 30.44 * 24 * 3600_000
  const d = new Date(birth)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('dailyGuide', () => {
  const now = new Date(2026, 6, 1, 12, 0).getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('无 baby / 无 birthDate → null', () => {
    expect(dailyGuide()).toBeNull()
    expect(dailyGuide(undefined)).toBeNull()
    expect(dailyGuide(baby(undefined))).toBeNull()
  })

  it('月龄分段 0/1/3/6/9/12 → 段 0..5', () => {
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
      [20, 5],
    ]
    for (const [months, idx] of cases) {
      const guide = dailyGuide(baby(birthDateForMonths(months, now)))
      expect(guide, `months=${months}`).not.toBeNull()
      expect(guide!.milk, `milk months=${months}`).toBe(`guides.milk${idx}`)
      expect(guide!.feedCount).toBe(`guides.feed${idx}`)
      expect(guide!.sleep).toBe(`guides.sleep${idx}`)
      expect(guide!.diaper).toBe(`guides.diaper${idx}`)
      expect(guide!.pump).toBe('guides.pump')
    }
  })

  it('非法 birthDate → NaN 落到段 5（记录当前行为）', () => {
    const guide = dailyGuide(baby('not-a-date'))
    expect(guide).not.toBeNull()
    expect(guide!.milk).toBe('guides.milk5')
  })
})
