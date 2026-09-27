'use client'

/**
 * 表单操作按钮公共组件：统一「取消 / 保存」按钮。
 */
import { useTranslation } from 'react-i18next'
import s from './FormActions.module.css'

export interface FormActionsProps {
  editing?: boolean
  submitLabel?: string
  onCancelled?: () => void
  onSave?: () => void
}

export default function FormActions({ editing, submitLabel, onCancelled, onSave }: FormActionsProps) {
  const { t } = useTranslation()

  return (
    <div className={s['form-actions']}>
      <button type="button" className="btn btn-outline" onClick={onCancelled}>
        {t('common.cancel')}
      </button>
      <button type="button" className="btn btn-primary" onClick={onSave}>
        {submitLabel ?? (editing ? t('common.saveEdit') : t('common.save'))}
      </button>
    </div>
  )
}
