'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FeedType, BreastSide } from '@/types'
import { FEED_TYPE_LIST, BREAST_SIDE_LIST } from '@/constants'
import { toDateTimeLocal, fromDateTimeLocal, formatDuration } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { toast } from '@/stores/toast'
import { useActiveTimer } from '@/hooks/useActiveTimer'
import { useFormErrors } from '@/hooks/useFormErrors'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import s from './FeedingForm.module.css'

export interface FeedingFormProps {
  editing?: {
    id: number
    type: FeedType
    side?: BreastSide
    startTime: number
    endTime?: number
    duration?: number
    amount?: number
    notes?: string
  }
  onSaved?: () => void
  onCancelled?: () => void
  onStartRecord?: () => void
}

export default function FeedingForm({ editing, onSaved, onCancelled, onStartRecord }: FeedingFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const { getByKind, start: startTimer, reset: resetTimer } = useActiveTimer()
  const err = useFormErrors()

  const [type, setType] = useState<FeedType>(editing?.type ?? 'breast')
  const [side, setSide] = useState<BreastSide>(editing?.side ?? 'left')
  const [amount, setAmount] = useState(editing?.amount != null ? String(editing.amount) : '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [startTime, setStartTime] = useState(() => toDateTimeLocal(editing?.startTime ?? Date.now()))
  const [endTime, setEndTime] = useState(editing?.endTime ? toDateTimeLocal(editing.endTime) : '')

  const isBreast = type === 'breast'
  const activeEntry = getByKind('feeding')
  const isRecording = !!activeEntry
  const isEditing = !!editing && !isRecording

  const durStart = fromDateTimeLocal(startTime)
  const durEnd = endTime ? fromDateTimeLocal(endTime) : undefined
  const durationText = durStart && durEnd && durEnd > durStart ? formatDuration(durEnd - durStart) : null

  const submitLabel = isRecording
    ? t('feed.endRecord')
    : isEditing
      ? t('common.saveEdit')
      : isBreast
        ? t('feed.startRecord')
        : t('common.save')

  /** 瓶喂用单时间点；亲喂或计时中用开始/结束区间 */
  const showTimePair = isBreast || isRecording

  useEffect(() => {
    const entry = getByKind('feeding')
    if (!entry) return
    let stale = false
    void db.feedings.get(entry.recordId).then((record) => {
      if (!record || stale) return
      setType(record.type)
      setSide(record.side ?? 'left')
      setAmount(record.amount != null ? String(record.amount) : '')
      setNotes(record.notes ?? '')
      setStartTime(toDateTimeLocal(record.startTime))
      setEndTime('')
    })
    return () => {
      stale = true
    }
  }, [getByKind])

  /** 瓶喂奶量必填；合法返回数值，非法标记字段错误返回 null */
  function parseAmount(): number | null {
    const amt = amount ? Number(amount) : NaN
    if (!amount || isNaN(amt) || amt <= 0) {
      err.set('amount', t('feed.invalidAmount'))
      return null
    }
    return amt
  }

  async function submit() {
    err.clearAll()
    try {
      const start = fromDateTimeLocal(startTime)
      if (start == null) {
        err.set('startTime', t('feed.invalidStart'))
        return
      }
      const end = endTime ? fromDateTimeLocal(endTime) : undefined

      // 计时中：结束记录，结束时间写回（空则取当前时间）
      if (isRecording && activeEntry) {
        const endTs = end ?? Date.now()
        if (endTs <= start) {
          err.set('endTime', t('feed.invalidOrder'))
          return
        }
        await db.feedings.update(activeEntry.recordId, {
          endTime: endTs,
          duration: endTs - start,
          updatedAt: Date.now(),
        })
        resetTimer(activeEntry.id)
        onSaved?.()
        return
      }

      // 编辑
      if (isEditing && editing) {
        if (isBreast) {
          if (end != null && end <= start) {
            err.set('endTime', t('feed.invalidOrder'))
            return
          }
          await db.feedings.update(editing.id, {
            type,
            side,
            startTime: start,
            endTime: end,
            duration: end && end > start ? end - start : undefined,
            amount: undefined,
            notes: notes || undefined,
            updatedAt: Date.now(),
          })
        } else {
          const amt = parseAmount()
          if (amt == null) return
          await db.feedings.update(editing.id, {
            type,
            side: undefined,
            startTime: start,
            endTime: undefined,
            duration: undefined,
            amount: amt,
            notes: notes || undefined,
            updatedAt: Date.now(),
          })
        }
        onSaved?.()
        return
      }

      if (isBreast) {
        // 亲喂：结束时间已填 → 直接保存；空 → 从输入开始时间启动计时
        if (activeBabyId == null) throw new Error(t('errors.noBaby'))
        const now = Date.now()
        if (end != null) {
          if (end <= start) {
            err.set('endTime', t('feed.invalidOrder'))
            return
          }
          const id = await db.feedings.add({
            babyId: activeBabyId,
            type,
            side,
            startTime: start,
            endTime: end,
            duration: end - start,
            amount: undefined,
            notes: notes || undefined,
            createdAt: now,
            updatedAt: now,
          })
          if (id == null) throw new Error(t('errors.addFeedFail'))
          onSaved?.()
          return
        }
        const id = await db.feedings.add({
          babyId: activeBabyId,
          type,
          side,
          startTime: start,
          endTime: undefined,
          duration: undefined,
          amount: undefined,
          notes: notes || undefined,
          createdAt: now,
          updatedAt: now,
        })
        if (id == null) throw new Error(t('errors.addFeedFail'))
        startTimer('feeding', id, start)
        onStartRecord?.()
        return
      }

      // 瓶喂：单时间点直接保存，不启动计时
      const amt = parseAmount()
      if (amt == null) return
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.feedings.add({
        babyId: activeBabyId,
        type,
        side: undefined,
        startTime: start,
        endTime: undefined,
        duration: undefined,
        amount: amt,
        notes: notes || undefined,
        createdAt: now,
        updatedAt: now,
      })
      if (id == null) throw new Error(t('errors.addFeedFail'))
      onSaved?.()
    } catch {
      toast(t('errors.generic'))
    }
  }

  return (
    <div className="feeding-form">
      <p className="form-label">{t('feed.typeLabel')}</p>
      <div className={s['type-grid']}>
        {FEED_TYPE_LIST.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={type === opt.value ? `${s['type-btn']} ${s.selected}` : s['type-btn']}
            style={
              type === opt.value ? { background: opt.color + '22', borderColor: opt.color, color: opt.color } : undefined
            }
            disabled={isRecording}
            onClick={() => setType(opt.value)}
          >
            <span className={s['type-icon']}>{opt.icon}</span>
            <span className={s['type-label']}>{t(opt.label)}</span>
          </button>
        ))}
      </div>

      {isBreast && (
        <div className={s['side-row']}>
          {BREAST_SIDE_LIST.map((sd) => (
            <button
              key={sd.value}
              type="button"
              className={side === sd.value ? `${s['side-btn']} ${s.selected}` : s['side-btn']}
              disabled={isRecording}
              onClick={() => setSide(sd.value)}
            >
              <span>{sd.icon}</span>
              <span>{t(sd.label)}</span>
            </button>
          ))}
        </div>
      )}

      {!isBreast && (
        <div className={`form-field${err.has('amount') ? ' has-error' : ''}`}>
          <label className="form-label">{t('feed.amountLabel')}</label>
          <input
            value={amount}
            type="number"
            min={0}
            step={5}
            placeholder={t('feed.amountPlaceholder')}
            className="form-input"
            inputMode="decimal"
            disabled={isRecording}
            onChange={(e) => {
              setAmount(e.target.value)
              err.clear('amount')
            }}
          />
          {err.get('amount') && <p className="field-error">{err.get('amount')}</p>}
        </div>
      )}

      {showTimePair ? (
        <div className={s['time-row']}>
          <div className={`form-field${err.has('startTime') ? ' has-error' : ''}`}>
            <label className="form-label">{t('feed.startLabel')}</label>
            <input
              value={startTime}
              type="datetime-local"
              step="1"
              placeholder={t('common.selectDateTime')}
              className="form-input"
              disabled={isRecording}
              onChange={(e) => {
                setStartTime(e.target.value)
                err.clear('startTime')
              }}
            />
            {err.get('startTime') && <p className="field-error">{err.get('startTime')}</p>}
          </div>
          <div className={`form-field${err.has('endTime') ? ' has-error' : ''}`}>
            <label className="form-label">{t('feed.endLabel')}</label>
            <input
              value={endTime}
              type="datetime-local"
              step="1"
              placeholder={t('common.selectDateTime')}
              className="form-input"
              onChange={(e) => {
                setEndTime(e.target.value)
                err.clear('endTime')
              }}
            />
            {err.get('endTime') && <p className="field-error">{err.get('endTime')}</p>}
          </div>
        </div>
      ) : (
        <div className={`form-field${err.has('startTime') ? ' has-error' : ''}`}>
          <label className="form-label">{t('feed.timeLabel')}</label>
          <input
            value={startTime}
            type="datetime-local"
            step="1"
            placeholder={t('common.selectDateTime')}
            className="form-input"
            onChange={(e) => {
              setStartTime(e.target.value)
              err.clear('startTime')
            }}
          />
          {err.get('startTime') && <p className="field-error">{err.get('startTime')}</p>}
        </div>
      )}

      {showTimePair && durationText && <p className={s['duration-hint']}>{durationText}</p>}

      <FormNotes value={notes} label={t('feed.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={isEditing} submitLabel={submitLabel} onCancelled={onCancelled} onSave={submit} />
    </div>
  )
}
