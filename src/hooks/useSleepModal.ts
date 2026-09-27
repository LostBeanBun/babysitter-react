'use client'

import { create } from 'zustand'

interface SleepModalState {
  open: boolean
  openModal: () => void
  closeModal: () => void
}

export const useSleepModalStore = create<SleepModalState>((set) => ({
  open: false,
  openModal: () => set({ open: true }),
  closeModal: () => set({ open: false }),
}))

export function useSleepModal() {
  return useSleepModalStore()
}
