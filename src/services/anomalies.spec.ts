import { describe, expect, it } from 'vitest'
import {
  ANOMALY_THRESHOLD,
  BASELINE_DAYS,
  RECENT_DAYS,
  TEMPERATURE_WATCH,
  buildAnomalyHints,
} from '@/services/anomalies'
import { MS_PER_HOUR } from '@/constants'
import type { DiaperChange, Feeding, Sleep, Temperature } from '@/types'

/** 基准时间：2026-01-10 12:00（本地时区） */
const NOW = new Date(2026, 0, 10, 12, 0).getTime()

/** 第 day 天（1 月 1 日为 1）的 hour 点 */
function at(day: number, hour = 10): number {
  return new Date(2026, 0, day, hour, 0, 0, 0).getTime()
}

function feeding(startTime: number): Feeding {
  return { babyId: 1, type: 'bottle_formula', startTime, amount: 100, createdAt: 0, updatedAt: 0 }
}

function diaper(time: number): DiaperChange {
  return { babyId: 1, type: 'wet', time, createdAt: 0, updatedAt: 0 }
}

function sleep(startTime: number, hours: number): Sleep {
  return {
    babyId: 1,
    type: 'nap',
    startTime,
    endTime: startTime + hours * MS_PER_HOUR,
    createdAt: 0,
    updatedAt: 0,
  }
}

function temperature(time: number, value: number): Temperature {
  return { babyId: 1, time, value, createdAt: 0, updatedAt: 0 }
}

/** 近 3 个完整自然日 = 1/7、1/8、1/9；基线 = 12/31 ~ 1/6（共 7 天） */
const RECENT_DAYS_LIST = [7, 8, 9]
const BASELINE_DAYS_LIST = [0, 1, 2, 3, 4, 5, 6]

function emptyInput() {
  return { now: NOW, feedings: [], diapers: [], sleeps: [], temperatures: [] }
}

describe('buildAnomalyHints - 窗口与基线', () => {
  it('无记录时返回空数组', () => {
    expect(buildAnomalyHints(emptyInput())).toEqual([])
  })

  it('基线日均过低时不提示（避免少量记录被放大）', () => {
    // 基线仅 2 次/天，近 3 天 1 次/天：降幅 50%，但基线不足 3 次不提示
    const feedings = [
      ...BASELINE_DAYS_LIST.flatMap((d) => [at(d, 8), at(d, 20)]),
      ...RECENT_DAYS_LIST.map((d) => at(d, 8)),
    ].map(feeding)
    expect(buildAnomalyHints({ ...emptyInput(), feedings }).some((h) => h.key === 'feedDrop')).toBe(false)
  })

  it('今天未过完不会误判：今天没有记录也不影响结论', () => {
    const feedings = [
      ...BASELINE_DAYS_LIST.flatMap((d) => [at(d, 8), at(d, 11), at(d, 15), at(d, 19)]),
      ...RECENT_DAYS_LIST.flatMap((d) => [at(d, 8), at(d, 19)]),
    ].map(feeding)
    const hints = buildAnomalyHints({ ...emptyInput(), feedings })
    expect(hints.find((h) => h.key === 'feedDrop')?.change).toBeCloseTo(-0.5, 5)
  })
})

describe('buildAnomalyHints - 喂养与尿布', () => {
  it('喂养日均下降 ≥ 30% 时提示', () => {
    const feedings = [
      ...BASELINE_DAYS_LIST.flatMap((d) => [at(d, 8), at(d, 11), at(d, 15), at(d, 19)]),
      ...RECENT_DAYS_LIST.flatMap((d) => [at(d, 8), at(d, 19)]),
    ].map(feeding)
    const hint = buildAnomalyHints({ ...emptyInput(), feedings }).find((h) => h.key === 'feedDrop')

    expect(hint).toBeDefined()
    expect(hint?.tone).toBe('watch')
    expect(hint?.recent).toBe(2)
    expect(hint?.baseline).toBe(4)
  })

  it('降幅未达阈值时不提示', () => {
    const feedings = [
      ...BASELINE_DAYS_LIST.flatMap((d) => [at(d, 8), at(d, 11), at(d, 15), at(d, 19)]),
      ...RECENT_DAYS_LIST.flatMap((d) => [at(d, 8), at(d, 11), at(d, 15), at(d, 18)]),
    ].map(feeding)
    // 近 3 天 4 次/天，与基线持平
    expect(buildAnomalyHints({ ...emptyInput(), feedings }).some((h) => h.key === 'feedDrop')).toBe(false)
  })

  it('尿布日均下降 ≥ 30% 时提示', () => {
    const diapers = [
      ...BASELINE_DAYS_LIST.flatMap((d) => [at(d, 7), at(d, 10), at(d, 13), at(d, 16), at(d, 20)]),
      ...RECENT_DAYS_LIST.flatMap((d) => [at(d, 8), at(d, 18)]),
    ].map(diaper)
    const hint = buildAnomalyHints({ ...emptyInput(), diapers }).find((h) => h.key === 'diaperDrop')

    expect(hint?.recent).toBe(2)
    expect(hint?.baseline).toBe(5)
  })
})

describe('buildAnomalyHints - 睡眠', () => {
  it('睡眠日均减少 ≥ 30% 时提示', () => {
    const sleeps = [
      ...BASELINE_DAYS_LIST.map((d) => sleep(at(d, 10), 8)),
      ...RECENT_DAYS_LIST.map((d) => sleep(at(d, 10), 4)),
    ]
    const hint = buildAnomalyHints({ ...emptyInput(), sleeps }).find((h) => h.key === 'sleepDown')

    expect(hint).toBeDefined()
    expect(hint?.tone).toBe('watch')
    expect(hint?.recent).toBe(4 * MS_PER_HOUR)
  })

  it('睡眠日均增加 ≥ 30% 时只作提示（info）', () => {
    const sleeps = [
      ...BASELINE_DAYS_LIST.map((d) => sleep(at(d, 10), 4)),
      ...RECENT_DAYS_LIST.map((d) => sleep(at(d, 10), 8)),
    ]
    const hint = buildAnomalyHints({ ...emptyInput(), sleeps }).find((h) => h.key === 'sleepUp')

    expect(hint?.tone).toBe('info')
  })

  it('跨窗口边界的睡眠按时长裁剪，不重复计入', () => {
    // 一段 1/6 23:00 ~ 1/7 05:00 的睡眠：基线窗口只计 1 小时，近 3 天窗口计 5 小时。
    // 若不裁剪（两边都记 6 小时），涨幅会从 48% 降到 30% 以下，提示会消失。
    const sleeps = [
      ...BASELINE_DAYS_LIST.map((d) => sleep(at(d, 10), 3)),
      ...RECENT_DAYS_LIST.map((d) => sleep(at(d, 10), 3)),
      sleep(at(6, 23), 6),
    ]
    const hint = buildAnomalyHints({ ...emptyInput(), sleeps }).find((h) => h.key === 'sleepUp')

    expect(hint).toBeDefined()
    expect(hint?.recent).toBeCloseTo((14 * MS_PER_HOUR) / 3, 5)
    expect(hint?.baseline).toBeCloseTo((22 * MS_PER_HOUR) / 7, 5)
  })
})

describe('buildAnomalyHints - 体温', () => {
  it('近 24 小时体温达到阈值时取最高读数', () => {
    const temperatures = [
      temperature(NOW - 2 * MS_PER_HOUR, 37.8),
      temperature(NOW - MS_PER_HOUR, 38.4),
      temperature(NOW - 30 * MS_PER_HOUR, 39.5),
    ]
    const hint = buildAnomalyHints({ ...emptyInput(), temperatures }).find((h) => h.key === 'temperature')

    expect(hint?.recent).toBe(38.4)
    expect(hint?.tone).toBe('watch')
  })

  it('低于阈值或超出 24 小时窗口时不提示', () => {
    const temperatures = [temperature(NOW - MS_PER_HOUR, TEMPERATURE_WATCH - 0.1)]
    expect(buildAnomalyHints({ ...emptyInput(), temperatures })).toEqual([])

    const old = [temperature(NOW - 25 * MS_PER_HOUR, 39)]
    expect(buildAnomalyHints({ ...emptyInput(), temperatures: old })).toEqual([])
  })

  it('体温提示排在其它提示之前', () => {
    const feedings = [
      ...BASELINE_DAYS_LIST.flatMap((d) => [at(d, 8), at(d, 11), at(d, 15), at(d, 19)]),
      ...RECENT_DAYS_LIST.map((d) => at(d, 8)),
    ].map(feeding)
    const hints = buildAnomalyHints({
      ...emptyInput(),
      feedings,
      temperatures: [temperature(NOW - MS_PER_HOUR, 38)],
    })

    expect(hints[0].key).toBe('temperature')
    expect(hints.map((h) => h.key)).toContain('feedDrop')
  })
})

describe('常量', () => {
  it('窗口与阈值保持稳定', () => {
    expect(RECENT_DAYS).toBe(3)
    expect(BASELINE_DAYS).toBe(7)
    expect(ANOMALY_THRESHOLD).toBe(0.3)
    expect(TEMPERATURE_WATCH).toBe(37.5)
  })
})
