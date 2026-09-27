'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { MILESTONE_TYPE_LIST } from '@/constants'
import { useFormErrors } from '@/hooks/useFormErrors'
import { MILESTONE_GUIDE, milestoneGuideRange } from '@/constants/milestoneGuide'
import type { MilestoneType } from '@/types'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import s from './MilestoneForm.module.css'

export interface MilestoneFormProps {
  editing?: { id: number; time: number; type: MilestoneType; notes?: string }
  onSaved?: () => void
  onCancelled?: () => void
}

export default function MilestoneForm({ editing, onSaved, onCancelled }: MilestoneFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const err = useFormErrors()

  const [type, setType] = useState<MilestoneType>(editing?.type ?? 'roll')
  const [time, setTime] = useState(() => toDateTimeLocal(editing?.time ?? Date.now()))
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [guideOpen, setGuideOpen] = useState(false)

  async function submit() {
    err.clearAll()
    const ts = fromDateTimeLocal(time)
    if (ts == null || isNaN(ts)) {
      err.set('time', t('milestone.invalidTime'))
      return
    }
    if (editing) {
      await db.milestones.update(editing.id, {
        time: ts,
        type,
        notes: notes || undefined,
        updatedAt: Date.now(),
      })
    } else {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.milestones.add({
        babyId: activeBabyId,
        time: ts,
        type,
        notes: notes || undefined,
        createdAt: now,
        updatedAt: now,
      })
      if (id == null) throw new Error(t('errors.addRecordFail'))
    }
    onSaved?.()
  }

  return (
    <div className="milestone-form">
      <div className="form-field">
        <label className="form-label">{t('milestone.typeLabel')}</label>
        <div className={s['milestone-types']}>
          {MILESTONE_TYPE_LIST.map((item) => (
            <button
              key={item.value}
              type="button"
              className={type === item.value ? `${s['milestone-type']} ${s.active}` : s['milestone-type']}
              onClick={() => setType(item.value)}
            >
              <span className={s['milestone-type-icon']}>{item.icon}</span>
              <span className={s['milestone-type-label']}>{t(item.label)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={s['guide-section']}>
        <button type="button" className={s['guide-toggle']} onClick={() => setGuideOpen(!guideOpen)}>
          <span className={s['guide-toggle-icon']}>🌟</span>
          <span className={s['guide-toggle-title']}>{t('stats.milestoneGuideTitle')}</span>
          <span className={guideOpen ? `${s['guide-toggle-arrow']} ${s.open}` : s['guide-toggle-arrow']}>▾</span>
        </button>
        {guideOpen && (
          <div className={s['guide-list']}>
            {MILESTONE_GUIDE.map((item) => (
              <div key={item.labelKey} className={s['guide-item']}>
                <span className={s['guide-item-icon']}>{item.icon}</span>
                <span className={s['guide-item-range']}>{milestoneGuideRange(item)} {t('duration.monthShort')}</span>
                <span className={s['guide-item-text']}>{t(item.labelKey)}</span>
              </div>
            ))}
            <p className={s['guide-note']}>{t('stats.milestoneGuideNote')}</p>
          </div>
        )}
      </div>

      <div className={`form-field${err.has('time') ? ' has-error' : ''}`}>
        <label className="form-label">{t('milestone.timeLabel')}</label>
        <input
          value={time}
          type="datetime-local"
          step="1"
          placeholder={t('common.selectDateTime')}
          className="form-input"
          onChange={(e) => {
            setTime(e.target.value)
            err.clear('time')
          }}
        />
        {err.get('time') && <p className="field-error">{err.get('time')}</p>}
      </div>

      <FormNotes value={notes} label={t('milestone.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} onSave={submit} />
    </div>
  )
}
