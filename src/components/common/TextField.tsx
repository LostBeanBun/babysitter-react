'use client'

/**
 * 文本输入公共组件：label + input + 字段级错误一体化（对齐 Vue 同名组件）。
 * - 受控 value / onChange；输入时自动清除该字段错误
 * - suffix：输入框内右侧单位（如 °C）
 * - append：输入框右侧附加元素（如按钮）
 */
import type { ChangeEvent, ReactNode } from 'react'
import type { FormErrors } from '@/hooks/useFormErrors'
import FormField from '@/components/common/FormField'
import s from './TextField.module.css'

export interface TextFieldProps {
  value: string
  onChange: (value: string) => void
  label: string
  errors?: FormErrors
  errorKey?: string
  type?: string
  placeholder?: string
  min?: string | number
  max?: string | number
  step?: string | number
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
  disabled?: boolean
  suffix?: string
  tag?: 'label' | 'p'
  append?: ReactNode
}

export default function TextField({
  value,
  onChange,
  label,
  errors,
  errorKey,
  type = 'text',
  placeholder,
  min,
  max,
  step,
  inputMode,
  disabled,
  suffix,
  tag,
  append,
}: TextFieldProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    if (errorKey != null) errors?.clear(errorKey)
  }

  return (
    <FormField label={label} errors={errors} errorKey={errorKey} tag={tag}>
      <div className={append ? `${s['text-input-row']} ${s['has-append']}` : s['text-input-row']}>
        <input
          value={value}
          type={type}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          inputMode={inputMode}
          disabled={disabled}
          className="form-input"
          onChange={handleChange}
        />
        {suffix && <span className={s['text-input-unit']}>{suffix}</span>}
        {append}
      </div>
    </FormField>
  )
}
