'use client'

import { create } from 'zustand'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import i18n from '@/i18n'
import { AVATAR_COLORS } from '@/constants'
import type { Baby } from '@/types'

const ACTIVE_BABY_KEY = 'babysitter.activeBabyId'

interface BabyState {
  activeBabyId: number | null
  setActiveBabyId: (id: number | null) => void
}

export const useBabyStore = create<BabyState>((set) => ({
  // SSR/首帧为空，挂载后由 hydrateActiveBaby 恢复，避免水合不一致
  activeBabyId: null,
  setActiveBabyId: (id) => {
    if (typeof window !== 'undefined') {
      if (id == null) localStorage.removeItem(ACTIVE_BABY_KEY)
      else localStorage.setItem(ACTIVE_BABY_KEY, String(id))
    }
    set({ activeBabyId: id })
  },
}))

/** 从 localStorage 恢复当前宝宝（Providers 挂载时调用） */
export function hydrateActiveBaby(): void {
  if (typeof window === 'undefined') return
  const saved = localStorage.getItem(ACTIVE_BABY_KEY)
  if (!saved) return
  const id = Number(saved)
  if (!Number.isFinite(id)) return
  useBabyStore.setState({ activeBabyId: id })
}

/** 订阅 babies 表，返回列表与当前激活宝宝 */
export function useBabies() {
  const babies = useLiveQuery(() => db.babies.orderBy('createdAt').toArray(), []) ?? []
  const activeBabyId = useBabyStore((s) => s.activeBabyId)
  const setActiveBabyId = useBabyStore((s) => s.setActiveBabyId)

  const activeBaby: Baby | undefined = babies.find((b) => b.id === activeBabyId) ?? babies[0]

  // 未选中或选中的宝宝已不存在时，回退到第一个
  if (babies.length > 0 && babies[0]?.id != null) {
    const valid = activeBabyId != null && babies.some((b) => b.id === activeBabyId)
    if (!valid) {
      const fallback = babies[0]!.id!
      // 在渲染期间不应 setState；用 microtask
      queueMicrotask(() => setActiveBabyId(fallback))
    }
  }

  /** 新增宝宝，自动切换为当前宝宝 */
  async function addBaby(
    name: string,
    gender?: Baby['gender'],
    birthDate?: string,
    birthWeight?: number,
    birthHeight?: number,
    avatar?: string,
  ): Promise<number> {
    const id = await db.babies.add({
      name,
      gender,
      birthDate,
      birthWeight,
      birthHeight,
      avatar,
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      createdAt: Date.now(),
    })
    if (id == null) throw new Error(i18n.t('errors.addBabyFail'))
    setActiveBabyId(id)
    return id
  }

  return {
    babies,
    activeBaby,
    // 列表未就绪时透传 store 中的 id，查询不必等 babies 加载完
    activeBabyId: activeBaby?.id ?? (babies.length === 0 ? activeBabyId : null),
    setActiveBabyId,
    addBaby,
  }
}
