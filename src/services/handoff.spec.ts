import { describe, it, expect } from 'vitest'
import { buildHandoffSummary, formatHandoffText } from '@/services/handoff'
import type {
  Baby,
  DiaperChange,
  Feeding,
  Medication,
  Pumping,
  Sleep,
  Temperature,
  Vaccination,
} from '@/types'

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

function diaper(partial: Partial<DiaperChange> & { time: number }): DiaperChange {
  return { ...BASE, type: 'wet', ...partial }
}

function sleep(partial: Partial<Sleep> & { startTime: number }): Sleep {
  return { ...BASE, type: 'nap', ...partial }
}

function pumping(partial: Partial<Pumping> & { startTime: number }): Pumping {
  return { ...BASE, side: 'both', ...partial }
}

function medication(partial: Partial<Medication> & { time: number; name: string }): Medication {
  return { ...BASE, ...partial }
}

function temperature(partial: Partial<Temperature> & { time: number }): Temperature {
  return { ...BASE, value: 36.8, ...partial }
}

function vaccination(
  partial: Partial<Vaccination> & { date: number; name: string },
): Vaccination {
  return { ...BASE, status: 'planned', ...partial }
}

const summary = buildHandoffSummary({
  baby,
  now: NOW,
  feedings: [
    feeding({ startTime: NOW - 2 * HOUR, amount: 120 }),
    feeding({ startTime: NOW - 30 * HOUR, amount: 80 }),
  ],
  diapers: [
    diaper({ time: NOW - 1 * HOUR, type: 'wet' }),
    diaper({ time: NOW - 2 * HOUR, type: 'dirty' }),
    diaper({ time: NOW - 30 * HOUR, type: 'both' }),
  ],
  sleeps: [
    sleep({ startTime: NOW - 25 * HOUR, endTime: NOW - 23 * HOUR }),
    sleep({ startTime: NOW - 3 * HOUR, endTime: NOW - 2 * HOUR }),
  ],
  pumpings: [
    pumping({ startTime: NOW - 1 * HOUR, amount: 90 }),
    pumping({ startTime: NOW - 30 * HOUR, amount: 50 }),
  ],
  medications: [
    medication({ time: NOW - 2 * HOUR, name: '退烧药', dose: '5ml' }),
    medication({ time: NOW - 30 * HOUR, name: '旧药' }),
  ],
  temperatures: [
    temperature({ time: NOW - 1 * HOUR, value: 36.8 }),
    temperature({ time: NOW - 30 * HOUR, value: 38.2 }),
  ],
  vaccinations: [vaccination({ date: NOW, name: '五联', dose: '第 2 剂' })],
})

describe('buildHandoffSummary', () => {
  it('按最近 24 小时统计数量，最近一次事件取全部记录', () => {
    expect(summary.feedCount).toBe(1)
    expect(summary.feedAmount).toBe(120)
    expect(summary.lastFeeding?.amount).toBe(120)
    expect(summary.diaperCount).toBe(2)
    expect(summary.wetCount).toBe(1)
    expect(summary.dirtyCount).toBe(1)
    expect(summary.lastDiaper?.type).toBe('wet')
    expect(summary.pumpCount).toBe(1)
    expect(summary.pumpAmount).toBe(90)
    expect(summary.medicationCount).toBe(1)
    expect(summary.lastMedication?.name).toBe('退烧药')
    expect(summary.lastTemperature?.value).toBe(36.8)
    expect(summary.nextVaccine?.name).toBe('五联')
  })

  it('跨窗口睡眠按 24 小时边界裁剪，并计算清醒时长与下次喂养', () => {
    expect(summary.sleepMs).toBe(2 * HOUR)
    expect(summary.lastSleep?.endTime).toBe(NOW - 2 * HOUR)
    expect(summary.awakeMs).toBe(2 * HOUR)
    expect(summary.nextFeedAt).toBe(NOW + 1 * HOUR)
  })

  it('正在睡时把当前睡眠计入窗口', () => {
    const active = buildHandoffSummary({
      baby,
      now: NOW,
      feedings: [],
      diapers: [],
      pumpings: [],
      sleeps: [sleep({ startTime: NOW - 3 * HOUR, endTime: NOW - 2 * HOUR })],
      medications: [],
      vaccinations: [],
      temperatures: [],
      activeSleepStart: NOW - 30 * 60_000,
    })
    expect(active.sleepMs).toBe(1.5 * HOUR)
    expect(active.activeSleepStart).toBe(NOW - 30 * 60_000)
    expect(active.awakeMs).toBeNull()
  })
})

describe('formatHandoffText', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key

  it('包含交接标题、喂养与参考段落', () => {
    const text = formatHandoffText(summary, t, '测试宝宝')
    expect(text).toContain('care.handoffTitle')
    expect(text).toContain('care.handoffBaby')
    expect(text).toContain('care.feedingLine')
    expect(text).toContain('care.diaperLine')
    expect(text).toContain('care.reference')
    expect(text).toContain('care.nextFeedLine')
  })

  it('正在睡时只输出一次当前睡眠', () => {
    const active = buildHandoffSummary({
      baby,
      now: NOW,
      feedings: [],
      diapers: [],
      pumpings: [],
      sleeps: [sleep({ startTime: NOW - 3 * HOUR, endTime: NOW - 2 * HOUR })],
      medications: [],
      vaccinations: [],
      temperatures: [],
      activeSleepStart: NOW - 30 * 60_000,
    })
    const text = formatHandoffText(active, t, '测试宝宝')
    expect(text.match(/care\.sleepingLine/g)).toHaveLength(1)
  })

  it('无记录时给出空态文案', () => {
    const empty = buildHandoffSummary({
      baby,
      now: NOW,
      feedings: [],
      diapers: [],
      pumpings: [],
      sleeps: [],
      medications: [],
      vaccinations: [],
      temperatures: [],
    })
    const text = formatHandoffText(empty, t, '测试宝宝')
    expect(text).toContain('care.noData')
    expect(text).toContain('care.disclaimer')
  })
})
