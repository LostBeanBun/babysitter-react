import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadReminders,
  saveReminders,
  checkReminders,
  clampIntervalHours,
  INTERVAL_MAX_HOURS,
  DEFAULT_REMINDERS,
  type ReminderContext,
} from '@/utils/reminderScheduler'
import type { Feeding, Medication, Vaccination, DiaperChange, Baby } from '@/types'

vi.mock('@/i18n', () => ({ default: { t: (key: string) => key, language: 'zh-CN' } }))

function makeContext(partial: Partial<ReminderContext> = {}): ReminderContext {
  return {
    now: new Date(2026, 0, 1, 12, 0).getTime(),
    baby: undefined,
    feedings: [],
    medications: [],
    vaccinations: [],
    diapers: [],
    sleeps: [],
    ...partial,
  }
}

function feeding(startTime: number): Feeding {
  return { babyId: 1, type: 'bottle_formula', startTime, amount: 100, createdAt: 0, updatedAt: 0 }
}

function medication(time: number, name = '退烧药'): Medication {
  return { babyId: 1, time, name, dose: '5ml', createdAt: 0, updatedAt: 0 }
}

function vaccination(date: number, name = '乙肝疫苗'): Vaccination {
  return { babyId: 1, date, name, dose: '第 1 剂', status: 'planned', createdAt: 0, updatedAt: 0 }
}

function diaper(time: number): DiaperChange {
  return { babyId: 1, type: 'wet', time, createdAt: 0, updatedAt: 0 }
}

function baby(birthDate = '2025-01-01'): Baby {
  return { id: 1, name: '小糯米', gender: 'girl', birthDate, avatarColor: '#FFF', createdAt: 0 }
}

beforeEach(() => {
  localStorage.clear()
})

describe('loadReminders / saveReminders', () => {
  it('默认全部关闭', () => {
    const cfg = loadReminders()
    expect(cfg.feed.enabled).toBe(false)
    expect(cfg.sleep.enabled).toBe(false)
    expect(cfg.medication.enabled).toBe(false)
    expect(cfg.vaccination.enabled).toBe(false)
    expect(cfg.diaper.enabled).toBe(false)
  })

  it('saveReminders 后原样读回', () => {
    const cfg = { ...DEFAULT_REMINDERS, feed: { enabled: true, intervalHours: 3 } }
    saveReminders(cfg)
    const loaded = loadReminders()
    expect(loaded.feed.enabled).toBe(true)
    expect(loaded.feed.intervalHours).toBe(3)
  })

  it('兼容旧版喂奶提醒开关', () => {
    localStorage.setItem('babysitter.feedReminder', 'on')
    expect(loadReminders().feed.enabled).toBe(true)
  })

  it('损坏的配置回退默认', () => {
    localStorage.setItem('babysitter.reminders', 'not-json{')
    const cfg = loadReminders()
    expect(cfg.feed.enabled).toBe(false)
  })

  it('载入清洗：越界间隔钳回 [min, 24]', () => {
    localStorage.setItem(
      'babysitter.reminders',
      JSON.stringify({
        feed: { enabled: true, intervalHours: -5 },
        medication: { enabled: true, intervalHours: 999 },
        diaper: { enabled: true, intervalHours: 0 },
        sleep: { enabled: true, time: '20:00', intervalHours: 100 },
      }),
    )
    const cfg = loadReminders()
    expect(cfg.feed.intervalHours).toBe(0)
    expect(cfg.medication.intervalHours).toBe(INTERVAL_MAX_HOURS)
    expect(cfg.diaper.intervalHours).toBe(1)
    expect(cfg.sleep.intervalHours).toBe(INTERVAL_MAX_HOURS)
  })
})

describe('clampIntervalHours - 间隔输入边界', () => {
  it('空串与非法值回退 min', () => {
    expect(clampIntervalHours('', 1)).toBe(1)
    expect(clampIntervalHours('  ', 0)).toBe(0)
    expect(clampIntervalHours('abc', 1)).toBe(1)
  })

  it('负数钳到 min', () => {
    expect(clampIntervalHours('-3', 0)).toBe(0)
    expect(clampIntervalHours('-3', 1)).toBe(1)
  })

  it('超上限钳到 24', () => {
    expect(clampIntervalHours(999)).toBe(INTERVAL_MAX_HOURS)
    expect(clampIntervalHours('99999', 1)).toBe(INTERVAL_MAX_HOURS)
  })

  it('区间内原值保留（含边界值与小数）', () => {
    expect(clampIntervalHours('2.5', 0)).toBe(2.5)
    expect(clampIntervalHours(0, 0)).toBe(0)
    expect(clampIntervalHours(24, 1)).toBe(24)
    expect(clampIntervalHours(1, 1)).toBe(1)
  })
})

describe('checkReminders - 喂奶', () => {
  it('启用且超间隔且非节流期时触发', () => {
    saveReminders({ ...DEFAULT_REMINDERS, feed: { enabled: true, intervalHours: 3 } })
    const ctx = makeContext({ feedings: [feeding(new Date(2026, 0, 1, 8, 0).getTime())] })
    const hits = checkReminders(ctx)
    expect(hits.some((h) => h.type === 'feed')).toBe(true)
    expect(hits.find((h) => h.type === 'feed')?.tag).toBe('reminder-feed')
  })

  it('未超间隔不触发', () => {
    saveReminders({ ...DEFAULT_REMINDERS, feed: { enabled: true, intervalHours: 3 } })
    const ctx = makeContext({ feedings: [feeding(new Date(2026, 0, 1, 11, 0).getTime())] })
    expect(checkReminders(ctx).length).toBe(0)
  })

  it('节流期内不重复触发（5 分钟）', () => {
    saveReminders({ ...DEFAULT_REMINDERS, feed: { enabled: true, intervalHours: 3 } })
    const ctx = makeContext({ feedings: [feeding(new Date(2026, 0, 1, 8, 0).getTime())] })
    expect(checkReminders(ctx).length).toBe(1)
    expect(checkReminders(ctx).length).toBe(0)
  })

  it('默认关闭时即使超间隔也不触发', () => {
    const ctx = makeContext({ feedings: [feeding(new Date(2026, 0, 1, 8, 0).getTime())] })
    expect(checkReminders(ctx).length).toBe(0)
  })
})

describe('checkReminders - 睡眠', () => {
  it('就寝时间窗口内触发（1 小时）', () => {
    saveReminders({ ...DEFAULT_REMINDERS, sleep: { enabled: true, time: '20:00', intervalHours: 0 } })
    const ctx = makeContext({ now: new Date(2026, 0, 1, 20, 30).getTime() })
    const hits = checkReminders(ctx)
    expect(hits.some((h) => h.type === 'sleep')).toBe(true)
  })

  it('窗口外不触发', () => {
    saveReminders({ ...DEFAULT_REMINDERS, sleep: { enabled: true, time: '20:00', intervalHours: 0 } })
    const ctx = makeContext({ now: new Date(2026, 0, 1, 21, 30).getTime() })
    expect(checkReminders(ctx).length).toBe(0)
  })
})

describe('checkReminders - 用药', () => {
  it('超间隔触发', () => {
    saveReminders({ ...DEFAULT_REMINDERS, medication: { enabled: true, intervalHours: 8 } })
    const ctx = makeContext({ medications: [medication(new Date(2026, 0, 1, 2, 0).getTime())] })
    const hits = checkReminders(ctx)
    expect(hits.some((h) => h.type === 'medication')).toBe(true)
  })
})

describe('checkReminders - 疫苗', () => {
  it('今天有待接种疫苗时触发', () => {
    saveReminders({ ...DEFAULT_REMINDERS, vaccination: { enabled: true } })
    const ctx = makeContext({
      vaccinations: [vaccination(new Date(2026, 0, 1, 9, 0).getTime())],
    })
    const hits = checkReminders(ctx)
    expect(hits.some((h) => h.type === 'vaccination')).toBe(true)
  })

  it('非今日待接种不触发', () => {
    saveReminders({ ...DEFAULT_REMINDERS, vaccination: { enabled: true } })
    const ctx = makeContext({ vaccinations: [vaccination(new Date(2026, 0, 2, 9, 0).getTime())] })
    expect(checkReminders(ctx).length).toBe(0)
  })
})

describe('checkReminders - 尿布', () => {
  it('超间隔触发', () => {
    saveReminders({ ...DEFAULT_REMINDERS, diaper: { enabled: true, intervalHours: 3 } })
    const ctx = makeContext({ diapers: [diaper(new Date(2026, 0, 1, 8, 0).getTime())] })
    const hits = checkReminders(ctx)
    expect(hits.some((h) => h.type === 'diaper')).toBe(true)
  })
})

describe('checkReminders - 综合', () => {
  it('多类提醒可同时触发', () => {
    saveReminders({
      ...DEFAULT_REMINDERS,
      feed: { enabled: true, intervalHours: 3 },
      diaper: { enabled: true, intervalHours: 3 },
    })
    const ctx = makeContext({
      feedings: [feeding(new Date(2026, 0, 1, 8, 0).getTime())],
      diapers: [diaper(new Date(2026, 0, 1, 8, 0).getTime())],
    })
    const hits = checkReminders(ctx)
    expect(hits.map((h) => h.type).sort()).toEqual(['diaper', 'feed'])
  })

  it('喂奶使用月龄建议间隔（intervalHours=0 时）', () => {
    saveReminders({ ...DEFAULT_REMINDERS, feed: { enabled: true, intervalHours: 0 } })
    // 10 月龄宝宝建议间隔较大，8 小时前喂奶应触发
    const ctx = makeContext({
      baby: baby('2025-03-01'),
      feedings: [feeding(new Date(2026, 0, 1, 4, 0).getTime())],
    })
    expect(checkReminders(ctx).some((h) => h.type === 'feed')).toBe(true)
  })
})