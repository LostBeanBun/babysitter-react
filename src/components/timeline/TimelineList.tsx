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
import { buildTimelineEntries } from '@/services/timeline'
import type { TimelineEntry } from '@/services/timeline'
import { formatTime } from '@/utils/format'
import s from './TimelineList.module.css'

export type { TimelineEntry, TimelineKind } from '@/services/timeline'

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
  /** 当前选中/交互中的条目 key（`kind-id`，点击后持续高亮，直到选中另一条） */
  selectedKey?: string | null
  /** 过滤后无结果时展示的内容（由调用方提供，便于复用空态文案） */
  empty?: React.ReactNode
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
    selectedKey,
    empty,
    onEdit,
    onDelete,
  } = props

  const entries = useMemo<TimelineEntry[]>(
    () =>
      buildTimelineEntries(
        {
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
        },
        t,
      ),
    [feedings, diapers, pumpings, sleeps, growths, solidFoods, medications, vaccinations, temperatures, milestones, t],
  )

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
    const key = entryKey(e)
    const deleting = deletingKey != null && deletingKey === key
    const selected = selectedKey != null && selectedKey === key
    const classes = [s['tl-item']]
    if (isTimelineItem) classes.push(s['tl-timeline-item'])
    if (deleting) classes.push(s['tl-deleting'])
    if (savedKey === key) classes.push(s['tl-saved'])
    if (selected) classes.push(s['tl-selected'])

    return (
      <div
        key={key}
        className={classes.join(' ')}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onEdit?.(e)}
      >
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
      {entries.length === 0 && empty ? (
        empty
      ) : !grouped ? (
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
