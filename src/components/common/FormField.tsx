'use client'

/**
 * 表单字段公共组件：label + 内联错误 + 任意控件（children）。
 * 自定义控件（如颜色/类型按钮组）直接用本组件包裹；文本输入请用 TextField。
 */
import type { ReactNode } from 'react'
import type { FormErrors } from '@/hooks/useFormErrors'

export interface FormFieldProps {
  label: string
  errors?: FormErrors
  errorKey?: string
  /** label 元素类型：children 为按钮时用 p（避免 label 聚焦行为误触） */
  tag?: 'label' | 'p'
  children: ReactNode
}

export default function FormField({ label, errors, errorKey, tag = 'label', children }: FormFieldProps) {
  const hasError = errorKey != null && !!errors?.has(errorKey)
  const error = errorKey != null ? (errors?.get(errorKey) ?? '') : ''
  const Label = tag

  return (
    <div className={`form-field${hasError ? ' has-error' : ''}`}>
      <Label className="form-label">{label}</Label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
