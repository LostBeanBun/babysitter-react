'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from '@/stores/toast'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import PageHeader from '@/components/common/PageHeader'
import TimelineList, { type TimelineEntry, type TimelineKind } from '@/components/timeline/TimelineList'
import BaseModal from '@/components/common/BaseModal'
import FeedingForm from '@/components/forms/FeedingForm'
import DiaperForm from '@/components/forms/DiaperForm'
import PumpingForm from '@/components/forms/PumpingForm'
import SleepForm from '@/components/forms/SleepForm'
import GrowthForm from '@/components/forms/GrowthForm'
import SolidFoodForm from '@/components/forms/SolidFoodForm'
import MedicationForm from '@/components/forms/MedicationForm'
import VaccinationForm from '@/components/forms/VaccinationForm'
import TemperatureForm from '@/components/forms/TemperatureForm'
import MilestoneForm from '@/components/forms/MilestoneForm'
import { formatTime, startOfDay } from '@/utils/format'
import { useDeleteUndo } from '@/hooks/useDeleteUndo'
import { useSleepModal } from '@/hooks/useSleepModal'
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
  FeedType,
  BreastSide,
  DiaperType,
  DiaperColor,
  DiaperAmount,
  PumpSide,
  SleepType,
  VaccinationStatus,
  TemperatureMethod,
  MilestoneType,
} from '@/types'
import s from './LogView.module.css'

type EntryKind = Exclude<TimelineKind, never>

type FeedingFormProps = {
  id: number
  type: FeedType
  side?: BreastSide
  startTime: number
  endTime?: number
  duration?: number
  amount?: number
  notes?: string
}
type DiaperFormProps = {
  id: number
  type: DiaperType
  time: number
  color?: DiaperColor
  amount?: DiaperAmount
  notes?: string
}
type PumpingFormProps = {
  id: number
  side: PumpSide
  startTime: number
  endTime?: number
  duration?: number
  amount?: number
  notes?: string
}
type SleepFormProps = { id: number; type: SleepType; startTime: number; endTime: number; notes?: string }
type GrowthFormProps = { id: number; date: number; weight?: number; height?: number; notes?: string }
type SolidFoodFormProps = { id: number; time: number; food: string; amount?: string; notes?: string }
type MedicationFormProps = { id: number; time: number; name: string; dose?: string; notes?: string }
type VaccinationFormProps = {
  id: number
  date: number
  name: string
  dose?: string
  status: VaccinationStatus
  notes?: string
}
type TemperatureFormProps = {
  id: number
  time: number
  value: number
  method?: TemperatureMethod
  notes?: string
}
type MilestoneFormProps = { id: number; time: number; type: MilestoneType; notes?: string }

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
  const { isPending, scheduleDelete } = useDeleteUndo()
  const sleepModal = useSleepModal()
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

  // —— 数据查询（按当前宝宝）——
  const feedings =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Feeding[]
        return db.feedings
          .where('[babyId+startTime]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
          .then((a) => a.filter(Boolean))
      },
      [activeBabyId],
      [] as Feeding[],
    ) ?? []

  const diapers =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as DiaperChange[]
        return db.diapers
          .where('[babyId+time]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
      },
      [activeBabyId],
      [] as DiaperChange[],
    ) ?? []

  const pumpings =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Pumping[]
        return db.pumpings
          .where('[babyId+startTime]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
          .then((a) => a.filter(Boolean))
      },
      [activeBabyId],
      [] as Pumping[],
    ) ?? []

  const sleeps =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Sleep[]
        return db.sleeps
          .where('[babyId+startTime]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
          .then((a) => a.filter(Boolean))
      },
      [activeBabyId],
      [] as Sleep[],
    ) ?? []

  const growths =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as GrowthRecord[]
        return db.growths
          .where('[babyId+date]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
      },
      [activeBabyId],
      [] as GrowthRecord[],
    ) ?? []

  const solidFoods =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as SolidFood[]
        return db.solidFoods
          .where('[babyId+time]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
      },
      [activeBabyId],
      [] as SolidFood[],
    ) ?? []

  const medications =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Medication[]
        return db.medications
          .where('[babyId+time]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
      },
      [activeBabyId],
      [] as Medication[],
    ) ?? []

  const vaccinations =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Vaccination[]
        return db.vaccinations
          .where('[babyId+date]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
      },
      [activeBabyId],
      [] as Vaccination[],
    ) ?? []

  const temperatures =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Temperature[]
        return db.temperatures
          .where('[babyId+time]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
      },
      [activeBabyId],
      [] as Temperature[],
    ) ?? []

  const milestones =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Milestone[]
        return db.milestones
          .where('[babyId+time]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
      },
      [activeBabyId],
      [] as Milestone[],
    ) ?? []

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
    // 记录页只展示实际接种记录（done），planned 待接种计划/提醒不混入时间线
    return keep(
      vaccinations.filter((v) => v.status === 'done' && matchDate(v.date)),
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

  // 弹窗
  const [modalState, setModalState] = useState<{ kind: EntryKind; editing?: TimelineEntry } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TimelineEntry | null>(null)

  // 表单弹窗打开时隐藏悬浮球
  useEffect(() => {
    if (modalState !== null) sleepModal.openModal()
    else sleepModal.closeModal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalState])

  // 悬浮球导航过来时自动打开对应表单（挂载后读 query，避免 useSearchParams 触发 CSR bailout / 水合竞态）
  const lastTimerKindRef = useRef('')
  useEffect(() => {
    const timerParam = new URLSearchParams(window.location.search).get('timer')
    if (timerParam && timerParam !== lastTimerKindRef.current) {
      lastTimerKindRef.current = timerParam
      setModalState({ kind: timerParam as EntryKind })
      router.replace('/log')
    }
  }, [router])

  function onEdit(entry: TimelineEntry) {
    setModalState({ kind: entry.kind, editing: entry })
  }

  function openAdd(kind: EntryKind) {
    setModalState({ kind })
  }

  function onDelete(entry: TimelineEntry) {
    setConfirmDelete(entry)
  }

  async function removeEntry(e: TimelineEntry) {
    if (e.kind === 'feeding') await db.feedings.delete(e.id)
    else if (e.kind === 'diaper') await db.diapers.delete(e.id)
    else if (e.kind === 'pumping') await db.pumpings.delete(e.id)
    else if (e.kind === 'sleep') await db.sleeps.delete(e.id)
    else if (e.kind === 'growth') await db.growths.delete(e.id)
    else if (e.kind === 'solidFood') await db.solidFoods.delete(e.id)
    else if (e.kind === 'medication') await db.medications.delete(e.id)
    else if (e.kind === 'vaccination') await db.vaccinations.delete(e.id)
    else if (e.kind === 'temperature') await db.temperatures.delete(e.id)
    else await db.milestones.delete(e.id)
  }

  async function confirmDeleteAction() {
    const e = confirmDelete
    if (!e) return
    scheduleDelete(e, () => removeEntry(e), t('common.deletedToast'), t('common.undo'))
    setConfirmDelete(null)
  }

  function onStartRecord() {
    setModalState(null)
    toast(t('common.recordStarted'))
  }

  function onSaved() {
    setModalState(null)
    toast(t('common.recordSaved'))
  }

  function onCancelled() {
    setModalState(null)
  }

  const editPayload = useMemo(() => {
    const e = modalState?.editing
    if (!e) return undefined
    if (e.kind === 'feeding') {
      const f = e.raw as Feeding
      return {
        id: e.id,
        type: f.type,
        side: f.side,
        startTime: f.startTime,
        endTime: f.endTime,
        duration: f.duration,
        amount: f.amount,
        notes: f.notes,
      }
    }
    if (e.kind === 'diaper') {
      const d = e.raw as DiaperChange
      return { id: e.id, type: d.type, time: d.time, color: d.color, amount: d.amount, notes: d.notes }
    }
    if (e.kind === 'pumping') {
      const p = e.raw as Pumping
      return {
        id: e.id,
        side: p.side,
        startTime: p.startTime,
        endTime: p.endTime,
        duration: p.duration,
        amount: p.amount,
        notes: p.notes,
      }
    }
    if (e.kind === 'sleep') {
      const sl = e.raw as Sleep
      return { id: e.id, type: sl.type, startTime: sl.startTime, endTime: sl.endTime ?? sl.startTime, notes: sl.notes }
    }
    if (e.kind === 'growth') {
      const g = e.raw as GrowthRecord
      return { id: e.id, date: g.date, weight: g.weight, height: g.height, notes: g.notes }
    }
    if (e.kind === 'solidFood') {
      const sf = e.raw as SolidFood
      return { id: e.id, time: sf.time, food: sf.food, amount: sf.amount, notes: sf.notes }
    }
    if (e.kind === 'medication') {
      const m = e.raw as Medication
      return { id: e.id, time: m.time, name: m.name, dose: m.dose, notes: m.notes }
    }
    if (e.kind === 'vaccination') {
      const v = e.raw as Vaccination
      return { id: e.id, date: v.date, name: v.name, dose: v.dose, status: v.status, notes: v.notes }
    }
    if (e.kind === 'temperature') {
      const tmp = e.raw as Temperature
      return { id: e.id, time: tmp.time, value: tmp.value, method: tmp.method, notes: tmp.notes }
    }
    const ms = e.raw as Milestone
    return { id: e.id, time: ms.time, type: ms.type, notes: ms.notes }
  }, [modalState])

  const currentFilterLabel = t(filters.find((f) => f.key === filter)?.labelKey ?? 'log.filters.all')
  const isEditing = Boolean(modalState?.editing)

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
        {hasAny ? (
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
            grouped
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <div className={s['empty-inline']}>
            <p>{t('log.empty', { type: filter === 'all' ? '' : currentFilterLabel })}</p>
            <p className={s['empty-hint']}>{t('log.emptyHint')}</p>
          </div>
        )}
      </div>

      <BaseModal show={modalState !== null} title={isEditing ? t('log.editTitle') : t('log.addTitle')} onClose={() => setModalState(null)}>
        {modalState?.kind === 'feeding' && (
          <FeedingForm
            editing={modalState.editing ? (editPayload as FeedingFormProps) : undefined}
            onStartRecord={onStartRecord}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
        {modalState?.kind === 'diaper' && (
          <DiaperForm
            editing={modalState.editing ? (editPayload as DiaperFormProps) : undefined}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
        {modalState?.kind === 'pumping' && (
          <PumpingForm
            editing={modalState.editing ? (editPayload as PumpingFormProps) : undefined}
            onStartRecord={onStartRecord}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
        {modalState?.kind === 'sleep' && (
          <SleepForm
            editing={modalState.editing ? (editPayload as SleepFormProps) : undefined}
            onStartRecord={onStartRecord}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
        {modalState?.kind === 'growth' && (
          <GrowthForm
            editing={modalState.editing ? (editPayload as GrowthFormProps) : undefined}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
        {modalState?.kind === 'solidFood' && (
          <SolidFoodForm
            editing={modalState.editing ? (editPayload as SolidFoodFormProps) : undefined}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
        {modalState?.kind === 'medication' && (
          <MedicationForm
            editing={modalState.editing ? (editPayload as MedicationFormProps) : undefined}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
        {modalState?.kind === 'vaccination' && (
          <VaccinationForm
            editing={modalState.editing ? (editPayload as VaccinationFormProps) : undefined}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
        {modalState?.kind === 'temperature' && (
          <TemperatureForm
            editing={modalState.editing ? (editPayload as TemperatureFormProps) : undefined}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
        {modalState?.kind === 'milestone' && (
          <MilestoneForm
            editing={modalState.editing ? (editPayload as MilestoneFormProps) : undefined}
            onSaved={onSaved}
            onCancelled={onCancelled}
          />
        )}
      </BaseModal>

      <BaseModal show={confirmDelete !== null} title={t('common.deleteRecord')} onClose={() => setConfirmDelete(null)}>
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
          <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>
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
