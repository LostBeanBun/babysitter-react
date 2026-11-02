'use client'

import { useTranslation } from 'react-i18next'
import BaseModal from './BaseModal'
import FeedingForm, { type FeedingFormProps } from '../forms/FeedingForm'
import DiaperForm, { type DiaperFormProps } from '../forms/DiaperForm'
import PumpingForm, { type PumpingFormProps } from '../forms/PumpingForm'
import SleepForm, { type SleepFormProps } from '../forms/SleepForm'
import GrowthForm, { type GrowthFormProps } from '../forms/GrowthForm'
import SolidFoodForm, { type SolidFoodFormProps } from '../forms/SolidFoodForm'
import MedicationForm, { type MedicationFormProps } from '../forms/MedicationForm'
import VaccinationForm, { type VaccinationFormProps } from '../forms/VaccinationForm'
import TemperatureForm, { type TemperatureFormProps } from '../forms/TemperatureForm'
import MilestoneForm, { type MilestoneFormProps } from '../forms/MilestoneForm'
import { buildRecordEditPayload } from '@/services/recordForm'
import type { RecordModalState } from '@/hooks/useRecordModal'

export interface RecordFormModalProps {
  state: RecordModalState | null
  onClose: () => void
  onSaved: () => void
  onCancelled: () => void
  onStartRecord: () => void
}

/** 记录表单弹窗：按 state.kind 渲染对应表单（与 Vue 端 RecordFormModal 对应） */
export default function RecordFormModal({
  state,
  onClose,
  onSaved,
  onCancelled,
  onStartRecord,
}: RecordFormModalProps) {
  const { t } = useTranslation()
  const payload = buildRecordEditPayload(state?.editing)

  return (
    <BaseModal
      show={state !== null}
      title={state?.editing ? t('log.editTitle') : t('log.addTitle')}
      onClose={onClose}
    >
      {state?.kind === 'feeding' && (
        <FeedingForm
          editing={payload as FeedingFormProps['editing']}
          onStartRecord={onStartRecord}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
      {state?.kind === 'diaper' && (
        <DiaperForm
          editing={payload as DiaperFormProps['editing']}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
      {state?.kind === 'pumping' && (
        <PumpingForm
          editing={payload as PumpingFormProps['editing']}
          onStartRecord={onStartRecord}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
      {state?.kind === 'sleep' && (
        <SleepForm
          editing={payload as SleepFormProps['editing']}
          onStartRecord={onStartRecord}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
      {state?.kind === 'growth' && (
        <GrowthForm
          editing={payload as GrowthFormProps['editing']}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
      {state?.kind === 'solidFood' && (
        <SolidFoodForm
          editing={payload as SolidFoodFormProps['editing']}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
      {state?.kind === 'medication' && (
        <MedicationForm
          editing={payload as MedicationFormProps['editing']}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
      {state?.kind === 'vaccination' && (
        <VaccinationForm
          editing={payload as VaccinationFormProps['editing']}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
      {state?.kind === 'temperature' && (
        <TemperatureForm
          editing={payload as TemperatureFormProps['editing']}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
      {state?.kind === 'milestone' && (
        <MilestoneForm
          editing={payload as MilestoneFormProps['editing']}
          onSaved={onSaved}
          onCancelled={onCancelled}
        />
      )}
    </BaseModal>
  )
}
