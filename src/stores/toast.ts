'use client'

import { create } from 'zustand'

export interface ToastItem {
  id: number
  message: string
  type?: 'success' | 'error' | 'info'
  /** 可选操作按钮文案（如「撤销」） */
  actionLabel?: string
  /** 操作按钮回调（执行后自动关闭该 toast） */
  onAction?: () => void
  /** 自动关闭时长 ms，0 表示常驻（需手动关闭） */
  duration?: number
}

export interface ToastOptions {
  actionLabel?: string
  onAction?: () => void
  duration?: number
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, type?: ToastItem['type'], opts?: ToastOptions) => void
  remove: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type = 'info', opts) => {
    const id = nextId++
    const duration = opts?.duration ?? 3200
    set((s) => ({
      toasts: [...s.toasts, { id, message, type, actionLabel: opts?.actionLabel, onAction: opts?.onAction, duration }],
    }))
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function toast(message: string, type?: ToastItem['type'], opts?: ToastOptions) {
  useToastStore.getState().push(message, type, opts)
}
