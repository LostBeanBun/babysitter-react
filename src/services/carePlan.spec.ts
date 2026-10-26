import { describe, it, expect } from 'vitest'
import { buildCarePlan, wakeWindowMs } from '@/services/carePlan'
import type { Baby, DiaperChange, Feeding, Medication, Sleep, Vaccination } from '@/types'

const NOW = new Date(2026, 2, 15, 12, 0).getTime()
const HOUR = 3600_000
const BASE = { babyId: 1, createdAt: 0, updatedAt: 0 }

const baby: Baby = {
  id: 1,
  name: '测试宝宝',
  birthDate: '2026-01-15',
  avatarColor: '#fff',
  createdAt: 0,
}

function feeding(partial: Partial<Feeding> & { startTime: number }): Feeding {
  return { ...BASE, type: 'bottle_formula', ...partial }
}

function sleep(partial: Partial<Sleep> & { startTime: number; endTime?: number }): Sleep {
  return { ...BASE, type: 'nap', ...partial }
}

function diaper(partial: Partial<DiaperChange> & { time: number }): DiaperChange {
  return { ...BASE, type: 'wet', ...partial }
}

function medication(partial: Partial<Medication> & { time: number; name: string }): Medication {
  return { ...BASE, ...partial }
}

function vaccination(
  partial: Partial<Vaccination> & { date: number; name: string },
): Vaccination {
  return { ...BASE, status: 'planned', ...partial }
}

function build(overrides: Partial<Parameters<typeof buildCarePlan>[0]> = {}) {
  return buildCarePlan({
    baby: overrides.baby ?? baby,
    now: overrides.now ?? NOW,
    feedings: overrides.feedings ?? [],
    diapers: overrides.diapers ?? [],
    sleeps: overrides.sleeps ?? [],
    medications: overrides.medications ?? [],
    vaccinations: overrides.vaccinations ?? [],
    activeFeedingStart: overrides.activeFeedingStart,
    activeSleepStart: overrides.activeSleepStart,
    diaperIntervalMs: overrides.diaperIntervalMs,
  })
}

describe('buildCarePlan', () => {
  it('无记录时给出月龄参考，不产生下次时间', () => {
    const plan = build()
    expect(plan.hasRecords).toBe(false)
    expect(plan.feeding.nextAt).toBeNull()
    expect(plan.feeding.intervalMs).toBe(3 * HOUR)
    expect(plan.sleep.awakeMs).toBeNull()
    expect(plan.sleep.wakeMinMs).toBe(1 * HOUR)
    expect(plan.sleep.wakeMaxMs).toBe(1.5 * HOUR)
    expect(plan.todo.vaccine).toBeNull()
  })

  it('按上次喂养结束时间计算下次参考', () => {
    const plan = build({
      feedings: [feeding({ startTime: NOW - 4 * HOUR, endTime: NOW - 2 * HOUR, amount: 120 })],
    })
    expect(plan.feeding.lastAt).toBe(NOW - 2 * HOUR)
    expect(plan.feeding.nextAt).toBe(NOW + 1 * HOUR)
    expect(plan.feeding.overdue).toBe(false)
    expect(plan.feeding.amount).toBe(120)
  })

  it('超过参考间隔时标记 overdue', () => {
    const plan = build({
      feedings: [feeding({ startTime: NOW - 5 * HOUR, endTime: NOW - 4 * HOUR })],
    })
    expect(plan.feeding.nextAt).toBe(NOW - 1 * HOUR)
    expect(plan.feeding.overdue).toBe(true)
  })

  it('正在喂养时暂停下次参考', () => {
    const plan = build({
      feedings: [feeding({ startTime: NOW - 4 * HOUR, endTime: NOW - 2 * HOUR })],
      activeFeedingStart: NOW - 10 * 60_000,
    })
    expect(plan.feeding.activeSince).toBe(NOW - 10 * 60_000)
    expect(plan.feeding.nextAt).toBeNull()
    expect(plan.feeding.overdue).toBe(false)
  })

  it('计算清醒时长；正在睡时不显示清醒时长', () => {
    const plan = build({ sleeps: [sleep({ startTime: NOW - 3 * HOUR, endTime: NOW - 1.5 * HOUR })] })
    expect(plan.sleep.lastEndAt).toBe(NOW - 1.5 * HOUR)
    expect(plan.sleep.awakeMs).toBe(1.5 * HOUR)

    const active = build({
      sleeps: [sleep({ startTime: NOW - 3 * HOUR, endTime: NOW - 1.5 * HOUR })],
      activeSleepStart: NOW - 20 * 60_000,
    })
    expect(active.sleep.activeSince).toBe(NOW - 20 * 60_000)
    expect(active.sleep.awakeMs).toBeNull()
  })

  it('清醒时长超过月龄窗口上限时标记 overAwake', () => {
    // 2 月龄窗口上限 1.5 小时，清醒 2 小时应为 true，1 小时为 false
    const over = build({ sleeps: [sleep({ startTime: NOW - 4 * HOUR, endTime: NOW - 2 * HOUR })] })
    expect(over.sleep.awakeMs).toBe(2 * HOUR)
    expect(over.sleep.overAwake).toBe(true)

    const within = build({
      sleeps: [sleep({ startTime: NOW - 3.5 * HOUR, endTime: NOW - 1 * HOUR })],
    })
    expect(within.sleep.awakeMs).toBe(1 * HOUR)
    expect(within.sleep.overAwake).toBe(false)
  })

  it('换尿布超过参考间隔时标记 overdue（默认 3 小时）', () => {
    const overdue = build({
      diapers: [
        diaper({ time: NOW - 3.5 * HOUR }),
        diaper({ time: NOW - 5 * HOUR }), // 取最近一条
      ],
    })
    expect(overdue.diaper.lastAt).toBe(NOW - 3.5 * HOUR)
    expect(overdue.diaper.overdue).toBe(true)

    const within = build({ diapers: [diaper({ time: NOW - 2.5 * HOUR })] })
    expect(within.diaper.overdue).toBe(false)
    expect(within.diaper.lastAt).toBe(NOW - 2.5 * HOUR)
  })

  it('换尿布间隔优先用提醒设置传入的毫秒值，无记录时不标记', () => {
    // 自定义 1.5 小时间隔：2 小时前换过 → overdue
    const custom = build({
      diapers: [diaper({ time: NOW - 2 * HOUR })],
      diaperIntervalMs: 1.5 * HOUR,
    })
    expect(custom.diaper.overdue).toBe(true)

    const none = build({})
    expect(none.diaper.lastAt).toBeNull()
    expect(none.diaper.overdue).toBe(false)
  })

  it('待办优先取 14 天内最近的计划疫苗，并统计今日用药', () => {
    const plan = build({
      vaccinations: [
        vaccination({ date: NOW + 2 * 24 * HOUR, name: '远期' }),
        vaccination({ date: NOW, name: '今天' }),
        vaccination({ date: NOW - 15 * 24 * HOUR, name: '过期' }),
        vaccination({ date: NOW + 24 * HOUR, name: '已接种', status: 'done' }),
      ],
      medications: [
        medication({ time: NOW - 30 * HOUR, name: '昨天' }),
        medication({ time: NOW - 2 * HOUR, name: '今天' }),
      ],
    })
    expect(plan.todo.vaccine?.name).toBe('今天')
    expect(plan.todo.vaccineCount).toBe(2)
    expect(plan.todo.medicationCount).toBe(1)
    expect(plan.todo.lastMedication?.name).toBe('今天')
  })
})

describe('wakeWindowMs', () => {
  it('按月龄返回清醒窗口', () => {
    expect(wakeWindowMs(baby, NOW)).toEqual({ minMs: 1 * HOUR, maxMs: 1.5 * HOUR })
    expect(wakeWindowMs(undefined, NOW)).toEqual({ minMs: 0.75 * HOUR, maxMs: 1 * HOUR })
  })
})
