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

/** 离场幽灵：消失球的最后一帧快照，用于播放缩小淡出 */
interface GhostBall {
  id: string
  kind: string
  startTime: number
  posX: number
  posY: number
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

  const visible = mounted && active && !sleepModalOpen

  // —— 离场幽灵：仅睡眠弹窗打开（记录仍在、v-if 翻转）时保留最后一帧播放缩小淡出；
  //    记录结束/记录清空导致的球消失与 Vue 一致直接移除（Vue <template v-for> 项删除时不播离场） ——
  const [ghosts, setGhosts] = useState<GhostBall[]>([])
  const prevRef = useRef({ visible, records })
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = { visible, records }

    let added: GhostBall[] = []
    if (!visible && prev.visible && sleepModalOpen && records.length > 0) {
      const saved = loadPositions()
      const bw = getBallWidth()
      added = records.map((rec, idx) => {
        const st = statesRef.current.get(rec.id)
        return {
          id: rec.id,
          kind: rec.kind,
          startTime: rec.startTime,
          posX: st?.posX ?? saved[rec.id]?.x ?? window.innerWidth - bw - 12,
          posY: st?.posY ?? saved[rec.id]?.y ?? HEADER_BOTTOM + idx * (56 + BALL_GAP),
        }
      })
    } else if (!prev.visible && visible) {
      // 重新显示：清掉残留幽灵，交给入场动画
      setGhosts([])
    }

    if (added.length > 0) {
      const ids = new Set(added.map((g) => g.id))
      setGhosts((cur) => [...cur.filter((g) => !ids.has(g.id)), ...added])
      // 计时不随依赖变化取消：让每批幽灵都走完离场（卸载后 setState 为空操作）
      setTimeout(() => {
        setGhosts((cur) => cur.filter((g) => !ids.has(g.id)))
      }, 220)
    }
  }, [visible, records, sleepModalOpen])

  // —— 统一拖拽逻辑（Pointer Events 覆盖鼠标 + 触摸） ——
  const moveRafRef = useRef<number | undefined>(undefined)
  const pendingRef = useRef<{ x: number; y: number } | null>(null)

  function dragStart(id: string, clientX: number, clientY: number) {
    draggingIdRef.current = id
    const state = getBallState(id)
    state.moved = false
    state.dragStartX = clientX
    state.dragStartY = clientY
    state.startDragX = state.posX
    state.startDragY = state.posY
  }

  function applyDragMove(clientX: number, clientY: number) {
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

  /** 拖拽移动按帧合并：一次 rAF 至多一次重渲染，避免 pointermove 高频触发 */
  function dragMove(clientX: number, clientY: number) {
    if (!draggingIdRef.current) return
    pendingRef.current = { x: clientX, y: clientY }
    if (moveRafRef.current != null) return
    moveRafRef.current = requestAnimationFrame(() => {
      moveRafRef.current = undefined
      const p = pendingRef.current
      if (p) applyDragMove(p.x, p.y)
    })
  }

  function flushDragMove() {
    if (moveRafRef.current == null) return
    cancelAnimationFrame(moveRafRef.current)
    moveRafRef.current = undefined
    const p = pendingRef.current
    if (p) applyDragMove(p.x, p.y)
  }

  function dragEnd() {
    const id = draggingIdRef.current
    if (id) {
      flushDragMove()
      saveBallPos(id, getBallState(id))
      draggingIdRef.current = null
    }
  }

  // 卸载时取消未执行的拖拽帧
  useEffect(
    () => () => {
      if (moveRafRef.current != null) cancelAnimationFrame(moveRafRef.current)
    },
    [],
  )

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

  if (!mounted) return null

  return (
    <>
      {/* eslint-disable-next-line react-hooks/refs -- 拖拽位置存在 ref 中，渲染时需读取 */}
      {visible && records.map((rec) => {
        const state = getBallState(rec.id)
        const config = CONFIG[rec.kind]
        return (
          <div
            key={rec.id}
            className={draggingIdRef.current === rec.id ? `${s['floating-ball']} ${s.dragging}` : s['floating-ball']}
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

      {/* 离场幽灵：保留消失球的最后一帧位置播放缩小淡出 */}
      {ghosts
        .filter((g) => !visible || !records.some((r) => r.id === g.id))
        .map((g) => {
          const config = CONFIG[g.kind]
          return (
            <div
              key={`ghost-${g.id}`}
              className={`${s['floating-ball']} ${s.leaving}`}
              style={
                {
                  top: g.posY + 'px',
                  left: g.posX + 'px',
                  '--ball-color': config?.color ?? '#e8906c',
                  '--ball-bg': config?.bg ?? 'rgba(232,144,108,0.12)',
                } as React.CSSProperties
              }
            >
              <span className={s['fb-icon']}>{config?.icon ?? '⏱️'}</span>
              <div className={s['fb-body']}>
                <span className={s['fb-label']}>{config ? t(config.labelKey) : g.kind}</span>
                <span className={s['fb-time']}>{formatTime(g.startTime)}</span>
              </div>
              <div className={s['fb-pulse']} />
            </div>
          )
        })}
    </>
  )
}
