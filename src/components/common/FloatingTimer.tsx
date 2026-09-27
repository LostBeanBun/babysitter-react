'use client'

/**
 * 悬浮记录球（多球模式）：每个活跃记录显示一个独立球。
 * - 点击：onOpen(timerId) 打开对应表单
 * - 纵向堆叠，独立拖拽
 * - 最多显示 3 个球
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActiveTimer } from '@/hooks/useActiveTimer'
import { useSleepModal } from '@/hooks/useSleepModal'
import { formatTime } from '@/utils/format'
import s from './FloatingTimer.module.css'

export interface FloatingTimerProps {
  active: boolean
  onOpen: (timerId: string) => void
}

const CONFIG: Record<string, { icon: string; labelKey: string; color: string; bg: string }> = {
  feeding: { icon: '🍼', labelKey: 'floatingTimer.kindFeeding', color: '#e8906c', bg: 'rgba(232, 144, 108, 0.12)' },
  sleep: { icon: '😴', labelKey: 'floatingTimer.kindSleep', color: '#7c6de8', bg: 'rgba(124, 109, 232, 0.12)' },
  pumping: { icon: '🎀', labelKey: 'floatingTimer.kindPumping', color: '#e86c9f', bg: 'rgba(232, 108, 159, 0.12)' },
}

const POS_KEY = 'floating_balls_pos'
const HEADER_BOTTOM = 70
const TABBAR_TOP_MARGIN = 96
const BALL_GAP = 8

interface BallState {
  posX: number
  posY: number
  dragStartX: number
  dragStartY: number
  startDragX: number
  startDragY: number
  moved: boolean
}

function getBallWidth(): number {
  if (typeof window === 'undefined') return 130
  return window.innerWidth <= 375 ? 105 : 130
}

function loadPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(POS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function savePositions(map: Record<string, { x: number; y: number }>) {
  localStorage.setItem(POS_KEY, JSON.stringify(map))
}

export default function FloatingTimer({ active, onOpen }: FloatingTimerProps) {
  const { t } = useTranslation()
  const activeTimer = useActiveTimer()
  const { open: sleepModalOpen } = useSleepModal()

  const records = activeTimer.records
  const statesRef = useRef<Map<string, BallState>>(new Map())
  const draggingIdRef = useRef<string | null>(null)
  const [, setTick] = useState(0)
  // 球位置依赖 window/localStorage，仅客户端挂载后渲染，避免 SSR 水合不一致
  const [mounted, setMounted] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Portal/浮层挂载门控，避免 SSR 水合不一致
  useEffect(() => setMounted(true), [])

  function getBallState(id: string): BallState {
    const existing = statesRef.current.get(id)
    if (existing) return existing
    const saved = loadPositions()[id]
    const bw = getBallWidth()
    const idx = records.findIndex((r) => r.id === id)
    const created: BallState = {
      posX: saved?.x ?? window.innerWidth - bw - 12,
      posY: saved?.y ?? HEADER_BOTTOM + Math.max(idx, 0) * (56 + BALL_GAP),
      dragStartX: 0,
      dragStartY: 0,
      startDragX: 0,
      startDragY: 0,
      moved: false,
    }
    statesRef.current.set(id, created)
    return created
  }

  function clampPos(state: BallState) {
    const maxY = window.innerHeight - TABBAR_TOP_MARGIN
    const bw = getBallWidth()
    state.posY = Math.min(Math.max(state.posY, HEADER_BOTTOM), maxY)
    state.posX = Math.min(Math.max(state.posX, 12), window.innerWidth - bw - 12)
  }

  function saveBallPos(id: string, state: BallState) {
    clampPos(state)
    const map = loadPositions()
    map[id] = { x: state.posX, y: state.posY }
    savePositions(map)
  }

  // 清理不存在的 ball state，并对当前记录 clamp 位置
  useEffect(() => {
    const ids = new Set(records.map((r) => r.id))
    for (const key of Array.from(statesRef.current.keys())) {
      if (!ids.has(key)) statesRef.current.delete(key)
    }
    for (const rec of records) {
      clampPos(getBallState(rec.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records])

  // —— 统一拖拽逻辑（Pointer Events 覆盖鼠标 + 触摸） ——
  function dragStart(id: string, clientX: number, clientY: number) {
    draggingIdRef.current = id
    const state = getBallState(id)
    state.moved = false
    state.dragStartX = clientX
    state.dragStartY = clientY
    state.startDragX = state.posX
    state.startDragY = state.posY
  }

  function dragMove(clientX: number, clientY: number) {
    const id = draggingIdRef.current
    if (!id) return
    const state = getBallState(id)
    const dx = clientX - state.dragStartX
    const dy = clientY - state.dragStartY
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) state.moved = true
    if (state.moved) {
      state.posX = state.startDragX + dx
      state.posY = state.startDragY + dy
      clampPos(state)
      setTick((v) => v + 1)
    }
  }

  function dragEnd() {
    const id = draggingIdRef.current
    if (id) {
      saveBallPos(id, getBallState(id))
      draggingIdRef.current = null
    }
  }

  function onPointerDown(id: string, e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragStart(id, e.clientX, e.clientY)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingIdRef.current) return
    dragMove(e.clientX, e.clientY)
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingIdRef.current) return
    dragEnd()
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  function handleOpen(id: string) {
    if (!getBallState(id).moved) onOpen(id)
  }

  if (!mounted || !active || sleepModalOpen) return null

  return (
    <>
      {/* eslint-disable-next-line react-hooks/refs -- 拖拽位置存在 ref 中，渲染时需读取 */}
      {records.map((rec) => {
        const state = getBallState(rec.id)
        const config = CONFIG[rec.kind]
        return (
          <div
            key={rec.id}
            className={s['floating-ball']}
            style={
              {
                top: state.posY + 'px',
                left: state.posX + 'px',
                '--ball-color': config?.color ?? '#e8906c',
                '--ball-bg': config?.bg ?? 'rgba(232,144,108,0.12)',
              } as React.CSSProperties
            }
            onPointerDown={(e) => onPointerDown(rec.id, e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={() => handleOpen(rec.id)}
          >
            <span className={s['fb-icon']}>{config?.icon ?? '⏱️'}</span>
            <div className={s['fb-body']}>
              <span className={s['fb-label']}>{config ? t(config.labelKey) : rec.kind}</span>
              <span className={s['fb-time']}>{formatTime(rec.startTime)}</span>
            </div>
            <div className={s['fb-pulse']} />
          </div>
        )
      })}
    </>
  )
}
