import { describe, it, expect } from 'vitest'
import { buildTimelineEntries, KIND_COLORS } from '@/services/timeline'
import type { TimelineData, TimelineTranslate } from '@/services/timeline'
import type {
  Feeding,
  DiaperChange,
  Pumping,
  Sleep,
  GrowthRecord,
  SolidFood,
  Medication,
  Vaccination,
  Temperature,
  Milestone,
} from '@/types'
import i18n from '@/i18n'
import { formatAmount, formatDuration, formatDate, formatTime } from '@/utils/format'

/** 与组件内一致：注入 i18n 的 t */
const t: TimelineTranslate = (key, options) => String(i18n.t(key, options as never))
const T0 = 1_700_000_000_000

const feed = (p: Partial<Feeding>): Feeding => ({
  id: 1,
  babyId: 1,
  type: 'bottle_formula',
  startTime: T0,
  amount: 100,
  createdAt: 0,
  updatedAt: 0,
  ...p,
})
const diaper = (p: Partial<DiaperChange>): DiaperChange => ({
  id: 2,
  babyId: 1,
  type: 'wet',
  time: T0,
  createdAt: 0,
  updatedAt: 0,
  ...p,
})
const pumping = (p: Partial<Pumping>): Pumping => ({
  id: 3,
  babyId: 1,
  side: 'left',
  startTime: T0,
  amount: 80,
  duration: 15 * 60_000,
  createdAt: 0,
  updatedAt: 0,
  ...p,
})
const sleep = (p: Partial<Sleep>): Sleep => ({
  id: 4,
  babyId: 1,
  type: 'nap',
  startTime: T0,
  endTime: T0 + 3600_000,
  createdAt: 0,
  updatedAt: 0,
  ...p,
})
const growth = (p: Partial<GrowthRecord>): GrowthRecord => ({
  id: 5,
  babyId: 1,
  date: T0,
  weight: 6.5,
  height: 62,
  headCircumference: 41,
  createdAt: 0,
  updatedAt: 0,
  ...p,
})
const solidFood = (p: Partial<SolidFood>): SolidFood => ({
  id: 6,
  babyId: 1,
  time: T0,
  food: '米糊',
  createdAt: 0,
  updatedAt: 0,
  ...p,
})
const medication = (p: Partial<Medication>): Medication => ({
  id: 7,
  babyId: 1,
  time: T0,
  name: '维生素D',
  createdAt: 0,
  updatedAt: 0,
  ...p,
})
const vaccination = (p: Partial<Vaccination>): Vaccination => ({
  id: 8,
  babyId: 1,
  date: T0,
  name: '卡介苗',
  status: 'done',
  createdAt: 0,
  updatedAt: 0,
  ...p,
})
const temperature = (p: Partial<Temperature>): Temperature => ({
  id: 9,
  babyId: 1,
  time: T0,
  value: 37.5,
  createdAt: 0,
  updatedAt: 0,
  ...p,
})
const milestone = (p: Partial<Milestone>): Milestone => ({
  id: 10,
  babyId: 1,
  time: T0,
  type: 'roll',
  createdAt: 0,
  updatedAt: 0,
  ...p,
})

const empty: TimelineData = {
  feedings: [],
  diapers: [],
  pumpings: [],
  sleeps: [],
}

describe('buildTimelineEntries', () => {
  it('空数据返回空数组', () => {
    expect(buildTimelineEntries(empty, t)).toEqual([])
  })

  it('合并所有表并按时间倒序，raw 保持引用', () => {
    const f1 = feed({ id: 11, startTime: T0 - 3600_000 })
    const f2 = feed({ id: 12, startTime: T0 + 3600_000 })
    const d1 = diaper({ id: 13, time: T0 })
    const entries = buildTimelineEntries({ ...empty, feedings: [f1, f2], diapers: [d1] }, t)
    expect(entries.map((e) => e.id)).toEqual([12, 13, 11])
    expect(entries.find((e) => e.id === 12)!.raw).toBe(f2)
    expect(entries).toHaveLength(3)
  })

  it('kindColor 取自 KIND_COLORS，10 种记录类型均有颜色', () => {
    const entries = buildTimelineEntries(
      {
        ...empty,
        feedings: [feed({})],
        diapers: [diaper({})],
        pumpings: [pumping({})],
        sleeps: [sleep({})],
        growths: [growth({})],
        solidFoods: [solidFood({})],
        medications: [medication({})],
        vaccinations: [vaccination({})],
        temperatures: [temperature({})],
        milestones: [milestone({})],
      },
      t,
    )
    expect(entries).toHaveLength(10)
    expect(Object.keys(KIND_COLORS)).toHaveLength(10)
    for (const e of entries) {
      expect(e.kindColor).toBe(KIND_COLORS[e.kind])
      expect(e.color).toBeTruthy()
    }
    // 与 Vue 端 KIND_META 同值，避免两端时间轴节点颜色漂移
    expect(KIND_COLORS.feeding).toBe('#E8906C')
    expect(KIND_COLORS.diaper).toBe('#9A8FC8')
  })

  it('feeding：图标/奶量/时长/亲喂侧别', () => {
    const [entry] = buildTimelineEntries(
      {
        ...empty,
        feedings: [feed({ type: 'breast', side: 'left', amount: undefined, duration: 10 * 60_000 })],
      },
      t,
    )
    expect(entry.kind).toBe('feeding')
    expect(entry.icon).toBe('🤱')
    expect(entry.title).toBe(`${t('feed.types.breast')} (${t('feed.sides.left')})`)
    expect(entry.detail).toBe(formatDuration(10 * 60_000))
    expect(entry.duration).toBe(10 * 60_000)

    const [bottle] = buildTimelineEntries(
      { ...empty, feedings: [feed({ type: 'bottle_formula', amount: 120, duration: undefined })] },
      t,
    )
    expect(bottle.icon).toBe('🍼')
    expect(bottle.detail).toBe(formatAmount(120))
  })

  it('feeding 无数据时 detail 为 common.recorded', () => {
    const [entry] = buildTimelineEntries(
      { ...empty, feedings: [feed({ amount: undefined, duration: undefined })] },
      t,
    )
    expect(entry.detail).toBe(t('common.recorded'))
  })

  it('diaper：图标与附加颜色/量', () => {
    const [entry] = buildTimelineEntries(
      { ...empty, diapers: [diaper({ type: 'both', color: 'green', amount: 'large' })] },
      t,
    )
    expect(entry.icon).toBe('🧷')
    expect(entry.detail).toBe([t('diaper.colors.green'), t('diaper.amounts.large')].join(' · '))
  })

  it('pumping：标题含侧别，detail 含量与时长', () => {
    const [entry] = buildTimelineEntries(
      { ...empty, pumpings: [pumping({ side: 'right', amount: 90, duration: 20 * 60_000 })] },
      t,
    )
    expect(entry.title).toBe(t('timeline.pumpTitle', { side: t('pump.sides.right') }))
    expect(entry.detail).toBe([formatAmount(90), formatDuration(20 * 60_000)].join(' · '))
  })

  it('sleep：统一图标与标题、时间区间、无时长时不带时长段', () => {
    const start = T0
    const end = T0 + 2 * 3600_000
    const [entry] = buildTimelineEntries(
      { ...empty, sleeps: [sleep({ type: 'night', startTime: start, endTime: end })] },
      t,
    )
    expect(entry.title).toBe(t('timeline.sleepTitle'))
    expect(entry.icon).toBe('😴')
    expect(entry.detail).toBe(
      `${formatTime(start)} - ${formatTime(end)} · ${formatDuration(2 * 3600_000)}`,
    )

    const [running] = buildTimelineEntries({ ...empty, sleeps: [sleep({ endTime: undefined })] }, t)
    expect(running.duration).toBe(0)
    expect(running.detail).not.toContain(formatDuration(0))
  })

  it('growth：detail 含三项数据，timeLabel 为日期', () => {
    const [entry] = buildTimelineEntries({ ...empty, growths: [growth({})] }, t)
    expect(entry.detail).toBe(
      [
        t('timeline.weight', { value: 6.5 }),
        t('timeline.height', { value: 62 }),
        t('timeline.headCircumference', { value: 41 }),
      ].join(' · '),
    )
    expect(entry.timeLabel).toBe(formatDate(T0))
  })

  it('vaccination：done/planned 文案与时间色区分，timeLabel 为日期', () => {
    const [done] = buildTimelineEntries(
      { ...empty, vaccinations: [vaccination({ status: 'done', name: '卡介苗' })] },
      t,
    )
    expect(done.detail).toContain(t('timeline.vaccinationDone'))
    expect(done.timeLabel).toBe(formatDate(T0))

    const [planned] = buildTimelineEntries(
      { ...empty, vaccinations: [vaccination({ id: 20, status: 'planned' })] },
      t,
    )
    expect(planned.detail).toContain(t('timeline.vaccinationPlanned'))
    expect(planned.color).not.toBe(done.color)
  })

  it('milestone：detail 用备注或 common.recorded', () => {
    const [withNotes] = buildTimelineEntries(
      { ...empty, milestones: [milestone({ notes: '第一次微笑' })] },
      t,
    )
    expect(withNotes.detail).toBe('第一次微笑')

    const [noNotes] = buildTimelineEntries({ ...empty, milestones: [milestone({})] }, t)
    expect(noNotes.detail).toBe(t('common.recorded'))
  })
})
