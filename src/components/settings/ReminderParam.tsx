'use client'

/**
 * 提醒参数公共组件：统一「间隔（数值输入）」与「时间（time 输入）」两种展开参数。
 * 由 SettingsView 中的提醒配置在开启后渲染，消除多类提醒重复的展开模板。
 * 输入期间只改本地草稿，失焦（change）时统一钳制边界后才回写父级，避免
 * 输入中途的空串/半截数字被静默转成 0 击穿 min。
 */
import { useEffect, useRef, useState } from 'react'
import { INTERVAL_MAX_HOURS, clampIntervalHours } from '@/utils/reminderScheduler'
import s from './ReminderParam.module.css'

export interface ReminderParamProps {
  mode: 'interval' | 'time'
  label: string
  value: number | string
  min?: number
  step?: number
  placeholder?: string
  hint?: string
  /** 失焦提交：父级在此回调内同时写状态与持久化（React 状态异步，分两个回调会存到旧值） */
  onCommit: (v: number | string) => void
}

export default function ReminderParam({
  mode,
  label,
  value,
  min,
  step,
  placeholder,
  hint,
  onCommit,
}: ReminderParamProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [draft, setDraft] = useState(String(value))
  const [prevValue, setPrevValue] = useState(value)

  // 父级值变化时在渲染期同步草稿（官方 "adjusting state when a prop changes" 模式）
  if (prevValue !== value) {
    setPrevValue(value)
    setDraft(String(value))
  }

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    /** 失焦/提交时校验并回写：间隔钳制到 [min, 24]（空值/非法值回退 min），时间非法回退原值 */
    function handleChange() {
      if (!el) return
      if (mode === 'interval') {
        const v = clampIntervalHours(el.value, min ?? 0)
        setDraft(String(v))
        onCommit(v)
      } else {
        // 空串合法（关闭固定时间提醒），仅对粘贴等产生的畸形值回退原值
        const v = el.value === '' || /^\d{2}:\d{2}$/.test(el.value) ? el.value : String(value)
        setDraft(v)
        onCommit(v)
      }
    }
    el.addEventListener('change', handleChange)
    return () => el.removeEventListener('change', handleChange)
  }, [mode, min, value, onCommit])

  return (
    <>
      <label className={s['reminder-param-field']}>
        <span className={s['reminder-param-label']}>{label}</span>
        {mode === 'interval' ? (
          <input
            ref={inputRef}
            value={draft}
            type="number"
            min={min}
            max={INTERVAL_MAX_HOURS}
            step={step}
            placeholder={placeholder}
            className={`form-input ${s['reminder-param-input']}`}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <input
            ref={inputRef}
            value={draft}
            type="time"
            placeholder={placeholder}
            className={`form-input ${s['reminder-param-input']}`}
            onChange={(e) => setDraft(e.target.value)}
          />
        )}
      </label>
      {hint && <p className={s['reminder-param-hint']}>{hint}</p>}
    </>
  )
}
