'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useRecordsLive } from '@/hooks/useRecordsLive'
import { useBabies } from '@/stores/baby'
import PageHeader from '@/components/common/PageHeader'
import TimelineList, { type TimelineEntry, type TimelineKind } from '@/components/timeline/TimelineList'
import BaseModal from '@/components/common/BaseModal'
import RecordFormModal from '@/components/common/RecordFormModal'
import { formatTime, startOfDay } from '@/utils/format'
import { useDeleteUndo } from '@/hooks/useDeleteUndo'
import { useRecordModal } from '@/hooks/useRecordModal'
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
import s from './LogView.module.css'

type EntryKind = Exclude<TimelineKind, never>

const filters = [
  { key: 'all' as const, labelKey: 'log.filters.all' },
  { key: 'feeding' as const, labelKey: 'log.filters.feeding' },
  { key: 'diaper' as const, labelKey: 'log.filters.diaper' },
  { key: 'pumping' as const, labelKey: 'log.filters.pumping' },
  { key: 'sleep' as const, labelKey: 'log.filters.sleep' },
  { key: 'growth' as const, labelKey: 'log.filters.growth' },
  { key: 'solidFood' as const, labelKey: 'log.filters.solidFood' },
  { key: 'medication' as const, labelKey: 'log.filters.medication' },
  { key: 'vaccination' as const, labelKey: 'log.filters.vaccination' },
  { key: 'temperature' as const, labelKey: 'log.filters.temperature' },
  { key: 'milestone' as const, labelKey: 'log.filters.milestone' },
]

type FilterKey = (typeof filters)[number]['key']

export default function LogView() {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const { isPending } = useDeleteUndo()
  const {
    modalState,
    confirmDelete,
    openAdd,
    onEdit: openEdit,
    onDelete: openDelete,
    onStartRecord,
    onSaved,
    onCancelled,
    confirmDeleteAction,
    closeForm,
    closeDelete,
  } = useRecordModal()
  const router = useRouter()

  useEffect(() => {
    document.title = `${t('nav.log')} · ${t('app.name')}`
  }, [t])

  // 类型筛选
  const [filter, setFilter] = useState<FilterKey>('all')

  /** 按日期筛选：null=全部，否则为单日 0 点时间戳 */
  const [dateFilter, setDateFilter] = useState<number | null>(null)
  /** 日期面板展开状态 */
  const [dateOpen, setDateOpen] = useState(false)

  const [todayStart] = useState(() => startOfDay(Date.now()))

  /** 当前日期筛选的显示标签 */
  const dateFilterLabel = useMemo(() => {
    if (!dateFilter) return ''
    if (dateFilter === todayStart) return t('log.dateToday')
    const d = new Date(dateFilter)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }, [dateFilter, todayStart, t])

  function matchDate(ts: number): boolean {
    if (!dateFilter) return true
    return startOfDay(ts) === dateFilter
  }

  const [customDate, setCustomDate] = useState('')

  function clearDateFilter() {
    setDateFilter(null)
    setCustomDate('')
  }

  // —— 数据查询（按当前宝宝，单查询一次读齐 10 张表；首结果返回前为 undefined，展示骨架避免空态闪烁）——
  interface LogData {
    feedings: Feeding[]
    diapers: DiaperChange[]
    pumpings: Pumping[]
    sleeps: Sleep[]
    growths: GrowthRecord[]
    solidFoods: SolidFood[]
    medications: Medication[]
    vaccinations: Vaccination[]
    temperatures: Temperature[]
    milestones: Milestone[]
  }

  const feedingsLive = useRecordsLive('feedings', activeBabyId)
  const diapersLive = useRecordsLive('diapers', activeBabyId)
  const pumpingsLive = useRecordsLive('pumpings', activeBabyId)
  const sleepsLive = useRecordsLive('sleeps', activeBabyId)
  const growthsLive = useRecordsLive('growths', activeBabyId)
  const solidFoodsLive = useRecordsLive('solidFoods', activeBabyId)
  const medicationsLive = useRecordsLive('medications', activeBabyId)
  const vaccinationsLive = useRecordsLive('vaccinations', activeBabyId)
  const temperaturesLive = useRecordsLive('temperatures', activeBabyId)
  const milestonesLive = useRecordsLive('milestones', activeBabyId)

  const logData = useMemo<LogData | null | undefined>(() => {
    if (activeBabyId == null) return null
    const rows = [
      feedingsLive,
      diapersLive,
      pumpingsLive,
      sleepsLive,
      growthsLive,
      solidFoodsLive,
      medicationsLive,
      vaccinationsLive,
      temperaturesLive,
      milestonesLive,
    ]
    if (rows.some((r) => r === undefined)) return undefined
    return {
      feedings: feedingsLive!,
      diapers: diapersLive!,
      pumpings: pumpingsLive!,
      sleeps: sleepsLive!,
      growths: growthsLive!,
      solidFoods: solidFoodsLive!,
      medications: medicationsLive!,
      vaccinations: vaccinationsLive!,
      temperatures: temperaturesLive!,
      milestones: milestonesLive!,
    }
  }, [
    activeBabyId,
    feedingsLive,
    diapersLive,
    pumpingsLive,
    sleepsLive,
    growthsLive,
    solidFoodsLive,
    medicationsLive,
    vaccinationsLive,
    temperaturesLive,
    milestonesLive,
  ])

  /** 查询首结果未返回（undefined）→ 加载中；null 表示当前无宝宝（合法空态） */
  const logsLoading = logData === undefined

  const feedings = useMemo(() => logData?.feedings ?? [], [logData])
  const diapers = useMemo(() => logData?.diapers ?? [], [logData])
  const pumpings = useMemo(() => logData?.pumpings ?? [], [logData])
  const sleeps = useMemo(() => logData?.sleeps ?? [], [logData])
  const growths = useMemo(() => logData?.growths ?? [], [logData])
  const solidFoods = useMemo(() => logData?.solidFoods ?? [], [logData])
  const medications = useMemo(() => logData?.medications ?? [], [logData])
  const vaccinations = useMemo(() => logData?.vaccinations ?? [], [logData])
  const temperatures = useMemo(() => logData?.temperatures ?? [], [logData])
  const milestones = useMemo(() => logData?.milestones ?? [], [logData])

  function keep<T extends { id?: number }>(items: T[], kind: string): T[] {
    return items.filter((x) => !isPending({ kind, id: x.id! }))
  }

  const filteredFeedings = useMemo(() => {
    if (filter !== 'all' && filter !== 'feeding') return []
    return keep(feedings.filter((f) => matchDate(f.startTime)), 'feeding')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, feedings, isPending])

  const filteredDiapers = useMemo(() => {
    if (filter !== 'all' && filter !== 'diaper') return []
    return keep(diapers.filter((d) => matchDate(d.time)), 'diaper')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, diapers, isPending])

  const filteredPumpings = useMemo(() => {
    if (filter !== 'all' && filter !== 'pumping') return []
    return keep(pumpings.filter((p) => matchDate(p.startTime)), 'pumping')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, pumpings, isPending])

  const filteredSleeps = useMemo(() => {
    if (filter !== 'all' && filter !== 'sleep') return []
    return keep(sleeps.filter((sl) => matchDate(sl.startTime)), 'sleep')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, sleeps, isPending])

  const filteredGrowths = useMemo(() => {
    if (filter !== 'all' && filter !== 'growth') return []
    return keep(growths.filter((g) => matchDate(g.date)), 'growth')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, growths, isPending])

  const filteredSolidFoods = useMemo(() => {
    if (filter !== 'all' && filter !== 'solidFood') return []
    return keep(solidFoods.filter((sf) => matchDate(sf.time)), 'solidFood')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, solidFoods, isPending])

  const filteredMedications = useMemo(() => {
    if (filter !== 'all' && filter !== 'medication') return []
    return keep(medications.filter((m) => matchDate(m.time)), 'medication')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, medications, isPending])

  const filteredVaccinations = useMemo(() => {
    if (filter !== 'all' && filter !== 'vaccination') return []
    // 「全部」只展示实际接种记录（done）；疫苗筛选中额外列出「待接种」计划，可逐条修改
    const list = filter === 'vaccination' ? vaccinations : vaccinations.filter((v) => v.status === 'done')
    return keep(
      list.filter((v) => matchDate(v.date)),
      'vaccination',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, vaccinations, isPending])

  const filteredTemperatures = useMemo(() => {
    if (filter !== 'all' && filter !== 'temperature') return []
    return keep(temperatures.filter((tmp) => matchDate(tmp.time)), 'temperature')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, temperatures, isPending])

  const filteredMilestones = useMemo(() => {
    if (filter !== 'all' && filter !== 'milestone') return []
    return keep(
      milestones.filter((ms) => matchDate(ms.time)),
      'milestone',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFilter, milestones, isPending])

  const hasAny =
    filteredFeedings.length +
      filteredDiapers.length +
      filteredPumpings.length +
      filteredSleeps.length +
      filteredGrowths.length +
      filteredSolidFoods.length +
      filteredMedications.length +
      filteredVaccinations.length +
      filteredTemperatures.length +
      filteredMilestones.length >
    0

  /**
   * 列表高亮：点行编辑与点 × 删除都会切到当前记录；交互结束后保留 1s 便于用户看清是哪一条
   * （React 的 set-state-in-effect 规则不允许在 effect 体内同步 setState，故在事件回调里切换）
   */
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function selectEntry(entry: TimelineEntry) {
    clearTimeout(selectedTimer.current)
    setSelectedKey(entry.kind + '-' + entry.id)
  }

  // 关闭表单/删除确认 1s 后取消高亮（计时在回调里 setState，不打断渲染链路）
  useEffect(() => {
    if (modalState !== null || confirmDelete !== null) return
    selectedTimer.current = setTimeout(() => setSelectedKey(null), 1000)
    return () => clearTimeout(selectedTimer.current)
  }, [modalState, confirmDelete])

  function onEdit(entry: TimelineEntry) {
    selectEntry(entry)
    openEdit(entry)
  }

  function onDelete(entry: TimelineEntry) {
    selectEntry(entry)
    openDelete(entry)
  }

  // 悬浮球导航过来时自动打开对应表单（挂载后读 query，避免 useSearchParams 触发 CSR bailout / 水合竞态）
  const lastTimerKindRef = useRef('')
  useEffect(() => {
    const timerParam = new URLSearchParams(window.location.search).get('timer')
    if (timerParam && timerParam !== lastTimerKindRef.current) {
      lastTimerKindRef.current = timerParam
      openAdd(timerParam as EntryKind)
      router.replace('/log')
    }
  }, [openAdd, router])

  // 从疫苗提醒条「全部」入口进入时预设筛选（=疫苗列表，可逐条修改计划）
  const lastFilterParamRef = useRef('')
  useEffect(() => {
    const filterParam = new URLSearchParams(window.location.search).get('filter')
    if (filterParam && filterParam !== lastFilterParamRef.current && filters.some((f) => f.key === filterParam)) {
      lastFilterParamRef.current = filterParam
      setFilter(filterParam as FilterKey)
      router.replace('/log')
    }
  }, [router])

  const currentFilterLabel = t(filters.find((f) => f.key === filter)?.labelKey ?? 'log.filters.all')

  const emptyContent = (
    <div className={s['empty-inline']}>
      <p>{t('log.empty', { type: filter === 'all' ? '' : currentFilterLabel })}</p>
      <p className={s['empty-hint']}>{t('log.emptyHint')}</p>
    </div>
  )

  return (
    <div className="page log-page">
      <PageHeader />

      <div className={s['filter-toolbar']}>
        {!dateOpen ? (
          <>
            <label className={s['filter-select-label']} htmlFor="filter-select">
              {t('log.filterLabel')}
            </label>
            <select
              id="filter-select"
              value={filter}
              className={`form-input ${s['filter-select']}`}
              onChange={(e) => setFilter(e.target.value as FilterKey)}
            >
              {filters.map((f) => (
                <option key={f.key} value={f.key}>
                  {t(f.labelKey)}
                </option>
              ))}
            </select>
            {dateFilter !== null && <span className={s['date-selected-label']}>{dateFilterLabel}</span>}
          </>
        ) : (
          <div className={s['date-wrap']}>
            <div className={s['date-custom']}>
              <input
                value={customDate}
                type="date"
                className={`form-input ${s['date-input']}`}
                aria-label={t('log.dateFilter')}
                title={t('log.dateFilter')}
                onChange={(e) => {
                  setCustomDate(e.target.value)
                  if (!e.target.value) return
                  const ts = new Date(`${e.target.value}T00:00:00`).getTime()
                  if (!isNaN(ts)) setDateFilter(ts)
                }}
              />
              {dateFilter !== null && (
                <button
                  type="button"
                  className={s['date-clear']}
                  aria-label={t('log.dateClear')}
                  title={t('log.dateClear')}
                  onClick={clearDateFilter}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          className={[s['date-toggle'], dateOpen ? s.active : '', dateFilter !== null ? s.filtered : '']
            .filter(Boolean)
            .join(' ')}
          title={t('log.dateFilter')}
          aria-label={t('log.dateFilter')}
          onClick={() => setDateOpen(!dateOpen)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="19" height="19" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
      </div>

      <div className="card">
        {logsLoading ? (
          <div className={s['log-skeleton']} aria-hidden="true">
            <div className={s['sk-group']} />
            <div className={s['sk-row']} />
            <div className={s['sk-row']} />
            <div className={s['sk-row']} />
          </div>
        ) : hasAny ? (
          <TimelineList
            feedings={filteredFeedings}
            diapers={filteredDiapers}
            pumpings={filteredPumpings}
            sleeps={filteredSleeps}
            growths={filteredGrowths}
            solidFoods={filteredSolidFoods}
            medications={filteredMedications}
            vaccinations={filteredVaccinations}
            temperatures={filteredTemperatures}
            milestones={filteredMilestones}
            deletingKey={confirmDelete ? confirmDelete.kind + '-' + confirmDelete.id : null}
            selectedKey={selectedKey}
            grouped
            empty={emptyContent}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          emptyContent
        )}
      </div>

      <RecordFormModal
        state={modalState}
        onClose={closeForm}
        onSaved={onSaved}
        onCancelled={onCancelled}
        onStartRecord={onStartRecord}
      />

      <BaseModal show={confirmDelete !== null} title={t('common.deleteRecord')} onClose={closeDelete}>
        <p className={s['confirm-text']}>{t('log.deleteSimple')}</p>
        {confirmDelete && (
          <div className={s['confirm-record']}>
            <span className={s['confirm-record-icon']} style={{ background: confirmDelete.color + '22' }}>
              {confirmDelete.icon}
            </span>
            <div className={s['confirm-record-body']}>
              <p className={s['confirm-record-title']}>{confirmDelete.title}</p>
              <p className={s['confirm-record-detail']}>{confirmDelete.detail}</p>
              <p className={s['confirm-record-time']}>{confirmDelete.timeLabel ?? formatTime(confirmDelete.time)}</p>
            </div>
          </div>
        )}
        <div className={s['confirm-actions']}>
          <button className="btn btn-outline" onClick={closeDelete}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger-soft" onClick={confirmDeleteAction}>
            {t('log.confirmDelete')}
          </button>
        </div>
      </BaseModal>
    </div>
  )
}
