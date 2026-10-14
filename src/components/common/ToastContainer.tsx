'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useToastStore } from '@/stores/toast'
import s from './ToastContainer.module.css'

export default function ToastContainer() {
  const { t } = useTranslation()
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)
  const remove = useToastStore((state) => state.remove)
  const [mounted, setMounted] = useState(false)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Portal 挂载门控，避免 SSR 水合不一致
  useEffect(() => setMounted(true), [])

  // 离场兜底：animationend 未触发（动画被跳过等）时，超时强制移除
  const exitingKey = toasts
    .filter((item) => item.exiting)
    .map((item) => item.id)
    .join(',')
  useEffect(() => {
    if (!exitingKey) return
    const ids = exitingKey.split(',').map(Number)
    const timer = setTimeout(() => ids.forEach((id) => remove(id)), 600)
    return () => clearTimeout(timer)
  }, [exitingKey, remove])

  if (!mounted || typeof document === 'undefined') return null

  function handleAction(id: number, onAction?: () => void) {
    onAction?.()
    dismiss(id)
  }

  return createPortal(
    <div className={s['toast-container']} role="status" aria-live="polite">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={item.exiting ? `${s.toast} ${s['toast-leaving']}` : s.toast}
          onAnimationEnd={(e) => {
            if (item.exiting && e.target === e.currentTarget) remove(item.id)
          }}
        >
          <span className={s['toast-message']}>{item.message}</span>
          {item.actionLabel && (
            <button type="button" className={s['toast-action']} onClick={() => handleAction(item.id, item.onAction)}>
              {item.actionLabel}
            </button>
          )}
          {item.duration === 0 && (
            <button
              type="button"
              className={s['toast-close']}
              aria-label={t('common.close')}
              onClick={() => dismiss(item.id)}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  )
}
