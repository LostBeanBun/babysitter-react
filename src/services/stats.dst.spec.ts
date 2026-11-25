/**
 * buildDailySeries 的夏令时（DST）回归用例（与 Vue 端 stats.dst.spec.ts 同源，调用签名按本仓库适配）。
 *
 * 逐日建桶曾用固定 24h 步长推进，切换日的 23h / 25h 天会让后续桶偏移出本地零点，
 * 记录按 startOfDay 查表落空被静默丢弃。本文件把时区切到 America/New_York
 * （每年 3 月第二个周日拨快、11 月第一个周日拨慢）验证修复。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildDailySeries } from '@/services/stats'
import type { Feeding, Sleep } from '@/types'

const REAL_TZ = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'America/New_York'
})

afterAll(() => {
  if (REAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = REAL_TZ
})

/** 本地时间构造时间戳（"YYYY-MM-DDTHH:mm:ss" 无时区后缀按当前 TZ 解析） */
const at = (local: string) => new Date(local).getTime()

function feed(partial: Partial<Feeding>): Feeding {
  return {
    babyId: 1,
    type: 'bottle_formula',
    startTime: 0,
    amount: 100,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

function sleep(partial: Partial<Sleep>): Sleep {
  return {
    babyId: 1,
    type: 'nap',
    startTime: 0,
    endTime: 0,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

/** 位置参数调用的简写：只关注喂养 / 睡眠 */
function series(feedings: Feeding[], sleeps: Sleep[], start: number, end: number, now: number) {
  return buildDailySeries(feedings, [], [], sleeps, start, end, [], [], [], now)
}

describe('buildDailySeries 夏令时', () => {
  it('秋令时回拨（2025-11-02）后仍按自然日建桶，日期标签连续无重复', () => {
    const days = series([], [], at('2025-10-25T00:00:00'), at('2025-11-09T00:00:00'), at('2025-11-20T12:00:00'))
    expect(days).toHaveLength(15)
    expect(days.map((d) => d.date)).toEqual([
      '2025-10-25',
      '2025-10-26',
      '2025-10-27',
      '2025-10-28',
      '2025-10-29',
      '2025-10-30',
      '2025-10-31',
      '2025-11-01',
      '2025-11-02',
      '2025-11-03',
      '2025-11-04',
      '2025-11-05',
      '2025-11-06',
      '2025-11-07',
      '2025-11-08',
    ])
    // 每桶都是各自自然日的本地零点
    for (const d of days) {
      const local = new Date(d.dayStart)
      expect(local.getHours()).toBe(0)
      expect(local.getMinutes()).toBe(0)
    }
  })

  it('回拨后的记录仍归入对应日期（修复前会被静默丢弃）', () => {
    const days = series(
      [feed({ startTime: at('2025-10-30T09:00:00'), amount: 90 }), feed({ startTime: at('2025-11-04T12:00:00'), amount: 120 })],
      [],
      at('2025-10-25T00:00:00'),
      at('2025-11-09T00:00:00'),
      at('2025-11-20T12:00:00'),
    )
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]))
    expect(byDate['2025-10-30'].feedCount).toBe(1)
    expect(byDate['2025-10-30'].totalMilkAmount).toBe(90)
    expect(byDate['2025-11-04'].feedCount).toBe(1)
    expect(byDate['2025-11-04'].totalMilkAmount).toBe(120)
  })

  it('春令时拨快（2026-03-08）后的记录同样不丢', () => {
    const days = series(
      [feed({ startTime: at('2026-03-10T08:00:00'), amount: 100 })],
      [],
      at('2026-03-01T00:00:00'),
      at('2026-03-15T00:00:00'),
      at('2026-03-20T12:00:00'),
    )
    expect(days).toHaveLength(14)
    expect(days[9].date).toBe('2026-03-10')
    expect(days[9].feedCount).toBe(1)
  })

  it('跨回拨日的睡眠按重叠时长正确分摊（22:00 → 次日 06:00，共 8h）', () => {
    const days = series(
      [],
      [sleep({ startTime: at('2025-11-02T22:00:00'), endTime: at('2025-11-03T06:00:00') })],
      at('2025-11-01T00:00:00'),
      at('2025-11-04T00:00:00'),
      at('2025-11-20T12:00:00'),
    )
    // 11-02 桶实际是 25h（00:00 EDT → 24:00 EST），睡眠占其最后 2h；其余 6h 计入 11-03
    expect(days[0].sleepMs).toBe(0)
    expect(days[1].sleepMs).toBe(2 * 3600_000)
    expect(days[2].sleepMs).toBe(6 * 3600_000)
    expect(days.reduce((sum, d) => sum + d.sleepMs, 0)).toBe(8 * 3600_000)
  })
})
