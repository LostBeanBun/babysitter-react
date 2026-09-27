'use client'

/**
 * 提醒参数公共组件：统一「间隔（数值输入）」与「时间（time 输入）」两种展开参数。
 * 由 SettingsView 中的提醒配置在开启后渲染，消除多类提醒重复的展开模板。
 */
import { useEffect, useRef } from 'react'
import s from './ReminderParam.module.css'

export interface ReminderParamProps {
  mode: 'interval' | 'time'
  label: string
  value: number | string
  min?: number
  step?: number
  placeholder?: string
  hint?: string
  onValueChange?: (v: number | string) => void
  onChange?: () => void
}

export default function ReminderParam({
  mode,
  label,
  value,
  min,
  step,
  placeholder,
  hint,
  onValueChange,
  onChange,
}: ReminderParamProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    onValueChange?.(mode === 'interval' ? (raw === '' ? '' : Number(raw)) : raw)
  }

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    function handleChange() {
      onChange?.()
    }
    el.addEventListener('change', handleChange)
    return () => el.removeEventListener('change', handleChange)
  }, [onChange])

  if (mode === 'interval') {
    return (
      <>
        <label className={s['reminder-param-label']}>{label}</label>
        <input
          ref={inputRef}
          value={value}
          type="number"
          min={min}
          step={step}
          placeholder={placeholder}
          className={`form-input ${s['reminder-param-input']}`}
          inputMode="decimal"
          onChange={handleInput}
        />
        {hint && <p className={s['reminder-param-hint']}>{hint}</p>}
      </>
    )
  }

  return (
    <>
      <label className={s['reminder-param-label']}>{label}</label>
      <input
        ref={inputRef}
        value={value}
        type="time"
        placeholder={placeholder}
        className={`form-input ${s['reminder-param-input']}`}
        onChange={handleInput}
      />
    </>
  )
}
