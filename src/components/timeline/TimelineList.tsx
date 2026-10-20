'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import s from './TimelineList.module.css'

export type TimelineKind =
  | 'feeding'
  | 'diaper'
  | 'pumping'
  | 'sleep'
  | 'growth'
  | 'solidFood'
  | 'medication'
  | 'vaccination'
  | 'temperature'
  | 'milestone'

/** 各记录类型的统一主色（时间轴/图标标识） */
const KIND_COLORS: Record<TimelineKind, string> = {
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
  raw:
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
}

export interface TimelineListProps {
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
  /** 是否按天分组显示（默认按时间倒序扁平显示） */
  grouped?: boolean
  /** 正在等待删除确认的条目 key（`kind-id`，与列表 key 一致，用于高亮选中的删除目标） */
  deletingKey?: string | null
  onEdit?: (entry: TimelineEntry) => void
  onDelete?: (entry: TimelineEntry) => void
}

// —— 渐进挂载：首屏只渲染前 N 天分组，其余在滚动接近时再渲染（挂载后不卸载）。 ——
// 长列表（一年可达数千条）一次性渲染 DOM/协调开销大，按天分组天然适合增量渲染：
// 新分组只会在视口下方出现，挂载时机在视口外，不会引起视口内容位移。
const INITIAL_GROUPS = 10
const GROUP_MOUNT_MARGIN = '200px 0px'

export default function TimelineList(props: TimelineListProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'zh-CN'
  const {
    feedings,
    diapers,
    pumpings,
    sleeps,
    growths,
    solidFoods,
    medications,
    vaccinations,
    temperatures,
    milestones,
    grouped,
    deletingKey,
    onEdit,
    onDelete,
  } = props

  const entries = useMemo<TimelineEntry[]>(() => {
    const list: TimelineEntry[] = []

    for (const f of feedings) {
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

    for (const d of diapers) {
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

    for (const p of pumpings) {
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

    for (const sl of sleeps) {
      const dur = (sl.endTime ?? sl.startTime) - sl.startTime
      list.push({
        id: sl.id!,
        kind: 'sleep',
        time: sl.startTime,
        icon: '😴',
        color: '#8FAED8',
        kindColor: KIND_COLORS.sleep,
        title: t('timeline.sleepTitle'),
        detail: `${formatTime(sl.startTime)} - ${formatTime(sl.endTime ?? sl.startTime)}${dur > 0 ? ` · ${formatDuration(dur)}` : ''}`,
        duration: dur,
        raw: sl,
      })
    }

    for (const g of growths ?? []) {
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

    for (const sf of solidFoods ?? []) {
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

    for (const m of medications ?? []) {
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

    for (const v of vaccinations ?? []) {
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

    for (const tmp of temperatures ?? []) {
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

    for (const ms of milestones ?? []) {
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
  }, [feedings, diapers, pumpings, sleeps, growths, solidFoods, medications, vaccinations, temperatures, milestones, t])

  /** 按天分组 */
  const groupedEntries = useMemo(() => {
    if (!grouped) return null
    const groups = new Map<string, TimelineEntry[]>()
    const localeTag = locale.startsWith('zh') ? 'zh-CN' : 'en-US'
    for (const e of entries) {
      const day = new Date(e.time).toLocaleDateString(localeTag, { month: 'long', day: 'numeric', weekday: 'short' })
      if (!groups.has(day)) groups.set(day, [])
      groups.get(day)!.push(e)
    }
    return Array.from(groups.entries())
  }, [grouped, entries, locale])

  /** 滚动接近时追加挂载的天分组（首屏前 N 天由渲染时序号直接判定，无需进 state） */
  const [mountedGroups, setMountedGroups] = useState<Set<string>>(() => new Set())
  const rootRef = useRef<HTMLDivElement | null>(null)

  function isGroupMounted(day: string, idx: number): boolean {
    return idx < INITIAL_GROUPS || mountedGroups.has(day)
  }

  useEffect(() => {
    if (!groupedEntries || !rootRef.current) return
    const io = new IntersectionObserver(
      (observerEntries) => {
        for (const entry of observerEntries) {
          if (!entry.isIntersecting) continue
          const day = (entry.target as HTMLElement).dataset.day
          if (day) {
            setMountedGroups((prev) => {
              if (prev.has(day)) return prev
              const next = new Set(prev)
              next.add(day)
              return next
            })
          }
          io.unobserve(entry.target)
        }
      },
      { rootMargin: GROUP_MOUNT_MARGIN },
    )
    for (const el of rootRef.current.querySelectorAll<HTMLElement>('[data-tl-group]')) io.observe(el)
    return () => io.disconnect()
  }, [groupedEntries])

  // 刚保存：createdAt 在 3s 内的最新一条（保存后回列表轻闪提示；同一时刻批量导入只闪最新一条）
  // 高亮只保持 1.8s：reduce 下用的是静态底色，必须靠计时移除，否则会一直亮着
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const savedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const cutoff = Date.now() - 3000
    let best: TimelineEntry | null = null
    for (const e of entries) {
      const at = e.raw.createdAt
      if (at >= cutoff && (best === null || at > best.raw.createdAt)) best = e
    }
    if (!best) return
    const key = best.kind + '-' + best.id
    if (savedKeyRef.current !== key) {
      savedKeyRef.current = key
      setSavedKey(key)
    }
    const timer = setTimeout(() => {
      savedKeyRef.current = null
      setSavedKey(null)
    }, 1800)
    return () => clearTimeout(timer)
  }, [entries])

  function entryKey(e: TimelineEntry): string {
    return e.kind + '-' + e.id
  }

  function renderEntry(e: TimelineEntry, isTimelineItem = false) {
    const deleting = deletingKey != null && deletingKey === entryKey(e)
    const classes = [s['tl-item']]
    if (isTimelineItem) classes.push(s['tl-timeline-item'])
    if (deleting) classes.push(s['tl-deleting'])
    if (savedKey === entryKey(e)) classes.push(s['tl-saved'])

    return (
      <div key={entryKey(e)} className={classes.join(' ')} onClick={() => onEdit?.(e)}>
        {isTimelineItem ? (
          <div
            className={`${s['tl-icon']} ${s['tl-timeline-node']}`}
            style={{ color: e.kindColor, borderColor: e.kindColor }}
          >
            <span>{e.icon}</span>
          </div>
        ) : (
          <div className={s['tl-icon']} style={{ background: e.color + '22' }}>
            <span>{e.icon}</span>
          </div>
        )}
        <div className={s['tl-body']}>
          <div className={s['tl-title-row']}>
            <span className={s['tl-title']}>{e.title}</span>
            <span className={s['tl-time']}>{e.timeLabel ?? formatTime(e.time)}</span>
          </div>
          <p className={s['tl-detail']}>{e.detail}</p>
        </div>
        <button
          className={s['tl-delete']}
          aria-label={t('timeline.deleted')}
          onClick={(ev) => {
            ev.stopPropagation()
            onDelete?.(e)
          }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="timeline" ref={rootRef}>
      {!grouped ? (
        entries.map((e) => renderEntry(e))
      ) : (
        <>
          {groupedEntries!.map(([day, items], idx) => (
            <div key={day} className={s['tl-group']} data-tl-group="1" data-day={day}>
              <p className={s['tl-day']}>{day}</p>
              {isGroupMounted(day, idx) && items.map((e) => renderEntry(e, true))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
