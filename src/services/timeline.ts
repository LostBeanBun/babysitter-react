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
  RecordKind,
} from '@/types'
import {
  FEED_TYPE_LABELS,
  DIAPER_TYPE_LABELS,
  DIAPER_COLOR_LABELS,
  DIAPER_AMOUNT_LABELS,
  PUMP_SIDE_LABELS,
  TEMP_METHOD_LABELS,
  MILESTONE_TYPE_LABELS,
  MILESTONE_TYPE_LIST,
} from '@/constants'
import { formatTime, formatDuration, formatAmount, formatDate } from '@/utils/format'

/** 翻译函数（组件注入 useTranslation 的 t，单测注入 i18n.t） */
export type TimelineTranslate = (key: string, options?: Record<string, unknown>) => string

export type TimelineKind = RecordKind

/**
 * 各记录类型的统一主色（时间轴节点 / 图标标识）。
 * 取值与 Vue 端 constants/index.ts 的 KIND_META.color 保持一致。
 */
export const KIND_COLORS: Record<TimelineKind, string> = {
  feeding: '#E8906C',
  diaper: '#9A8FC8',
  pumping: '#D8A8C8',
  sleep: '#8FAED8',
  growth: '#8FBF9F',
  solidFood: '#D8905A',
  medication: '#D86A8A',
  vaccination: '#6AB0D8',
  temperature: '#E8A45A',
  milestone: '#E8B86A',
}

export type TimelineRaw =
  | Feeding
  | DiaperChange
  | Pumping
  | Sleep
  | GrowthRecord
  | SolidFood
  | Medication
  | Vaccination
  | Temperature
  | Milestone

export interface TimelineEntry {
  id: number
  kind: TimelineKind
  time: number
  icon: string
  color: string
  /** 类型统一主色（时间轴节点颜色） */
  kindColor: string
  title: string
  detail: string
  duration?: number
  /** 自定义时间显示（如疫苗用日期） */
  timeLabel?: string
  raw: TimelineRaw
}

/** 构建时间轴条目所需的记录数据 */
export interface TimelineData {
  feedings: Feeding[]
  diapers: DiaperChange[]
  pumpings: Pumping[]
  sleeps: Sleep[]
  growths?: GrowthRecord[]
  solidFoods?: SolidFood[]
  medications?: Medication[]
  vaccinations?: Vaccination[]
  temperatures?: Temperature[]
  milestones?: Milestone[]
}

/** 将各表记录合并为时间轴条目，按时间倒序返回 */
export function buildTimelineEntries(data: TimelineData, t: TimelineTranslate): TimelineEntry[] {
  const list: TimelineEntry[] = []

  for (const f of data.feedings) {
    const color = f.type === 'breast' ? '#F2A28C' : f.type === 'bottle_formula' ? '#C4A8E0' : '#8FB9D8'
    const detailParts: string[] = []
    if (f.amount != null) detailParts.push(formatAmount(f.amount))
    if (f.duration) detailParts.push(formatDuration(f.duration))
    const detail = detailParts.length ? detailParts.join(' · ') : t('common.recorded')
    const sideLabel = f.type === 'breast' && f.side ? ' (' + t('feed.sides.' + f.side) + ')' : ''
    const feedTitle = FEED_TYPE_LABELS[f.type] ? t(FEED_TYPE_LABELS[f.type]) : f.type
    list.push({
      id: f.id!,
      kind: 'feeding',
      time: f.startTime,
      icon: f.type === 'breast' ? '🤱' : '🍼',
      color,
      kindColor: KIND_COLORS.feeding,
      title: feedTitle + sideLabel,
      detail,
      duration: f.duration,
      raw: f,
    })
  }

  for (const d of data.diapers) {
    const detailParts: string[] = [DIAPER_TYPE_LABELS[d.type] ? t(DIAPER_TYPE_LABELS[d.type]) : d.type]
    if (d.color) detailParts.push(DIAPER_COLOR_LABELS[d.color] ? t(DIAPER_COLOR_LABELS[d.color]) : d.color)
    if (d.amount) detailParts.push(DIAPER_AMOUNT_LABELS[d.amount] ? t(DIAPER_AMOUNT_LABELS[d.amount]) : d.amount)
    list.push({
      id: d.id!,
      kind: 'diaper',
      time: d.time,
      icon: d.type === 'wet' ? '💧' : d.type === 'dirty' ? '💩' : '🧷',
      color: '#9A8FC8',
      kindColor: KIND_COLORS.diaper,
      title: DIAPER_TYPE_LABELS[d.type] ? t(DIAPER_TYPE_LABELS[d.type]) : d.type,
      detail: detailParts.slice(1).join(' · ') || t('common.changed'),
      raw: d,
    })
  }

  for (const p of data.pumpings) {
    const detailParts: string[] = []
    if (p.amount != null) detailParts.push(`${formatAmount(p.amount)}`)
    if (p.duration) detailParts.push(formatDuration(p.duration))
    const pumpSideLabel = PUMP_SIDE_LABELS[p.side] ? t(PUMP_SIDE_LABELS[p.side]) : p.side
    list.push({
      id: p.id!,
      kind: 'pumping',
      time: p.startTime,
      icon: '🎀',
      color: '#D8A8C8',
      kindColor: KIND_COLORS.pumping,
      title: t('timeline.pumpTitle', { side: pumpSideLabel }),
      detail: detailParts.join(' · ') || t('common.recorded'),
      duration: p.duration,
      raw: p,
    })
  }

  for (const s of data.sleeps) {
    const dur = (s.endTime ?? s.startTime) - s.startTime
    list.push({
      id: s.id!,
      kind: 'sleep',
      time: s.startTime,
      icon: '😴',
      color: '#8FAED8',
      kindColor: KIND_COLORS.sleep,
      title: t('timeline.sleepTitle'),
      detail: `${formatTime(s.startTime)} - ${formatTime(s.endTime ?? s.startTime)}${dur > 0 ? ` · ${formatDuration(dur)}` : ''}`,
      duration: dur,
      raw: s,
    })
  }

  for (const g of data.growths ?? []) {
    const detailParts: string[] = []
    if (g.weight != null) detailParts.push(t('timeline.weight', { value: g.weight }))
    if (g.height != null) detailParts.push(t('timeline.height', { value: g.height }))
    if (g.headCircumference != null) detailParts.push(t('timeline.headCircumference', { value: g.headCircumference }))
    list.push({
      id: g.id!,
      kind: 'growth',
      time: g.date,
      icon: '📏',
      color: '#8FBF9F',
      kindColor: KIND_COLORS.growth,
      title: t('growth.title'),
      detail: detailParts.join(' · ') || t('common.recorded'),
      timeLabel: formatDate(g.date),
      raw: g,
    })
  }

  for (const sf of data.solidFoods ?? []) {
    const detailParts: string[] = [sf.food]
    if (sf.amount) detailParts.push(sf.amount)
    list.push({
      id: sf.id!,
      kind: 'solidFood',
      time: sf.time,
      icon: '🍎',
      color: '#D8905A',
      kindColor: KIND_COLORS.solidFood,
      title: t('timeline.solidFood'),
      detail: detailParts.join(' · '),
      raw: sf,
    })
  }

  for (const m of data.medications ?? []) {
    const detailParts: string[] = [m.name]
    if (m.dose) detailParts.push(m.dose)
    list.push({
      id: m.id!,
      kind: 'medication',
      time: m.time,
      icon: '💊',
      color: '#D86A8A',
      kindColor: KIND_COLORS.medication,
      title: t('timeline.medication'),
      detail: detailParts.join(' · '),
      raw: m,
    })
  }

  for (const v of data.vaccinations ?? []) {
    const detailParts: string[] = [v.name]
    if (v.dose) detailParts.push(v.dose)
    detailParts.push(v.status === 'done' ? t('timeline.vaccinationDone') : t('timeline.vaccinationPlanned'))
    list.push({
      id: v.id!,
      kind: 'vaccination',
      time: v.date,
      icon: '💉',
      color: v.status === 'done' ? '#6AB0D8' : '#D8A45A',
      kindColor: KIND_COLORS.vaccination,
      title: t('timeline.vaccination'),
      detail: detailParts.join(' · '),
      timeLabel: formatDate(v.date),
      raw: v,
    })
  }

  for (const tmp of data.temperatures ?? []) {
    const detailParts: string[] = [t('timeline.temperatureValue', { value: tmp.value })]
    if (tmp.method) detailParts.push(TEMP_METHOD_LABELS[tmp.method] ? t(TEMP_METHOD_LABELS[tmp.method]) : tmp.method)
    list.push({
      id: tmp.id!,
      kind: 'temperature',
      time: tmp.time,
      icon: '🌡️',
      color: '#E8A45A',
      kindColor: KIND_COLORS.temperature,
      title: t('timeline.temperature'),
      detail: detailParts.join(' · '),
      raw: tmp,
    })
  }

  for (const ms of data.milestones ?? []) {
    const item = MILESTONE_TYPE_LIST.find((x) => x.value === ms.type)
    const milestoneTitle = MILESTONE_TYPE_LABELS[ms.type] ? t(MILESTONE_TYPE_LABELS[ms.type]) : ms.type
    list.push({
      id: ms.id!,
      kind: 'milestone',
      time: ms.time,
      icon: item?.icon ?? '🌟',
      color: item?.color ?? '#E8B86A',
      kindColor: KIND_COLORS.milestone,
      title: milestoneTitle,
      detail: ms.notes?.trim() || t('common.recorded'),
      raw: ms,
    })
  }

  return list.sort((a, b) => b.time - a.time)
}
