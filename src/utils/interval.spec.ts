import { describe, it, expect } from 'vitest'
import { overlapMs, endOf } from '@/utils/interval'

const HOUR = 3_600_000
/** 2026-01-XX HH:00（本地时区，便于构造跨零点场景） */
const at = (day: number, hour = 0): number => new Date(2026, 0, day, hour).getTime()

describe('overlapMs', () => {
  const windowStart = at(2)
  const windowEnd = at(3)
  const now = at(2, 12)

  it('记录完全落在窗口内时返回完整时长', () => {
    expect(overlapMs(at(2, 8), at(2, 9), windowStart, windowEnd, now)).toBe(HOUR)
  })

  it('跨零点记录只计窗口内重叠部分（22:00→次日 06:00 计 6 小时）', () => {
    expect(overlapMs(at(1, 22), at(2, 6), windowStart, windowEnd, now)).toBe(6 * HOUR)
  })

  it('窗口外的记录返回 0', () => {
    expect(overlapMs(at(1, 8), at(1, 9), windowStart, windowEnd, now)).toBe(0)
    expect(overlapMs(at(3, 8), at(3, 9), windowStart, windowEnd, now)).toBe(0)
  })

  it('记录覆盖整个窗口时按窗口长度截断', () => {
    expect(overlapMs(at(1, 22), at(3, 6), windowStart, windowEnd, now)).toBe(24 * HOUR)
  })

  it('未结束记录按 now 截断', () => {
    expect(overlapMs(at(2, 8), undefined, windowStart, windowEnd, now)).toBe(4 * HOUR)
  })

  it('未结束记录且 now 尚未进入窗口时返回 0', () => {
    expect(overlapMs(at(1, 22), undefined, windowStart, windowEnd, at(1, 23))).toBe(0)
  })

  it('end 早于 start（异常数据）时返回 0', () => {
    expect(overlapMs(at(2, 9), at(2, 8), windowStart, windowEnd, now)).toBe(0)
  })
})

describe('endOf', () => {
  const start = at(2, 22)
  const now = at(3, 12)

  it('优先使用 endTime', () => {
    expect(endOf(start, start + HOUR, 5 * HOUR, now)).toBe(start + HOUR)
  })

  it('仅有 duration 时按 start + duration 还原', () => {
    expect(endOf(start, undefined, 8 * HOUR, now)).toBe(at(3, 6))
  })

  it('duration 为 0 时结束时间等于开始时间（不按 now）', () => {
    expect(endOf(start, undefined, 0, now)).toBe(start)
  })

  it('进行中的记录按 now 截断', () => {
    expect(endOf(start, undefined, undefined, now)).toBe(now)
  })

  it('duration 还原的跨零点记录与 overlapMs 配合只计次日部分', () => {
    const end = endOf(start, undefined, 8 * HOUR, now)
    expect(overlapMs(start, end, at(3), at(4), now)).toBe(6 * HOUR)
  })
})
