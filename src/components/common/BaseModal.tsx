'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import s from './BaseModal.module.css'

export interface BaseModalProps {
  show: boolean
  title?: string
  onClose?: () => void
  /** 可选的面板附加类名（用于个别弹窗覆盖玻璃底色） */
  panelClassName?: string
  children?: React.ReactNode
}

// —— body 滚动锁（计数器：确认框叠在表单上时只在全部关闭后恢复） ——
let scrollLockCount = 0
let prevBodyOverflow = ''

function lockBodyScroll() {
  if (scrollLockCount++ === 0) {
    prevBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}

function unlockBodyScroll() {
  if (--scrollLockCount === 0) document.body.style.overflow = prevBodyOverflow
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function BaseModal({
  show,
  title,
  onClose,
  panelClassName,
  children,
}: BaseModalProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [render, setRender] = useState(false)
  const [entered, setEntered] = useState(false)

  // onClose 经 ref 透传：keydown 监听只随 show 变化重建，避免父组件每次渲染都重绑监听并把焦点抢回面板
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

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
    const prevFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lockBodyScroll()

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      // Tab 焦点陷阱：焦点限制在弹窗面板内循环
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeydown)
    const raf = requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKeydown)
      cancelAnimationFrame(raf)
      unlockBodyScroll()
      // 归还焦点给打开弹窗前的元素
      prevFocused?.focus()
    }
  }, [show])

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
        className={`modal-panel ${s['modal-panel']} ${panelClassName ?? ''}`}
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
