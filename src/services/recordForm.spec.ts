import { describe, it, expect } from 'vitest'
import { buildRecordEditPayload } from '@/services/recordForm'
import type { TimelineEntry } from '@/services/timeline'
import type { GrowthRecord } from '@/types'

function growthEntry(raw: GrowthRecord, id = raw.id ?? 0): TimelineEntry {
  return {
    id,
    kind: 'growth',
    time: raw.date,
    icon: '📏',
    color: '#8FBF9F',
    kindColor: '#8FBF9F',
    title: '成长记录',
    detail: '',
    raw,
  }
}

/** 成长记录回填载荷（TimelineRaw 是联合类型，按 kind 断言） */
function growthPayload(editing: TimelineEntry) {
  return buildRecordEditPayload(editing) as (GrowthRecord & { id: number }) | undefined
}

describe('buildRecordEditPayload', () => {
  it('无编辑条目 → undefined', () => {
    expect(buildRecordEditPayload(undefined)).toBeUndefined()
  })

  it('成长记录完整透传：头围不丢（回归：逐字段挑选曾漏 headCircumference）', () => {
    const raw: GrowthRecord = {
      id: 7,
      babyId: 1,
      date: new Date('2026-10-01T00:00:00').getTime(),
      weight: 5.2,
      height: 58,
      headCircumference: 39.5,
      notes: '儿保体检',
      createdAt: 1,
      updatedAt: 1,
    }
    const payload = growthPayload(growthEntry(raw))
    expect(payload).toEqual({ ...raw, id: 7 })
    expect(payload?.headCircumference).toBe(39.5)
    expect(payload?.notes).toBe('儿保体检')
  })

  it('id 以条目为准（raw 里的 id 不参与回填）', () => {
    const raw: GrowthRecord = { id: 99, babyId: 1, date: 1, weight: 5, createdAt: 1, updatedAt: 1 }
    expect(buildRecordEditPayload(growthEntry(raw, 7))?.id).toBe(7)
  })

  it('未设置的可选字段保持 undefined，不会凭空补值', () => {
    const raw: GrowthRecord = { id: 1, babyId: 1, date: 1, createdAt: 1, updatedAt: 1 }
    const payload = growthPayload(growthEntry(raw))
    expect(payload?.weight).toBeUndefined()
    expect(payload?.height).toBeUndefined()
    expect(payload?.headCircumference).toBeUndefined()
  })
})
