'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import s from './BaseModal.module.css'

export interface BaseModalProps {
  show: boolean
  title?: string
  onClose?: () => void
  children?: React.ReactNode
}

export default function BaseModal({ show, title, onClose, children }: BaseModalProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [render, setRender] = useState(false)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (show) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 进出场动画需要同步切换渲染状态
      setRender(true)
      const raf = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(raf)
    }
    setEntered(false)
    const timer = window.setTimeout(() => setRender(false), 200)
    return () => window.clearTimeout(timer)
  }, [show])

  useEffect(() => {
    if (!show) return
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeydown)
    const raf = requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKeydown)
      cancelAnimationFrame(raf)
    }
  }, [show, onClose])

  if (!render || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`modal-mask ${entered ? s['mask-in'] : s['mask-out']}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panelRef}
        className={`modal-panel ${s['modal-panel']}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {title && (
          <div className={s['modal-header']}>
            <h3 className={s['modal-title']}>{title}</h3>
            <button className={s['modal-close']} aria-label={t('common.close')} onClick={() => onClose?.()}>
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
