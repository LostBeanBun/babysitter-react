/** 快捷记录排序：按历史使用次数从多到少，次数相同保持默认顺序 */
import type { RecordKind } from '@/types'

const USAGE_KEY = 'babysitter.quickUsage'

export function loadQuickUsage(): Partial<Record<RecordKind, number>> {
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Record<RecordKind, number>> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k as RecordKind] = v
    }
    return out
  } catch {
    return {}
  }
}

/** 记录一次快捷入口使用（用于下次打开时排序） */
export function recordQuickUse(kind: RecordKind): void {
  const usage = loadQuickUsage()
  usage[kind] = (usage[kind] ?? 0) + 1
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage))
  } catch {
    /* 存储满/禁用时排序退化为默认顺序 */
  }
}

/** 稳定排序：常用类型在前，未使用过的保持默认顺序 */
export function sortQuickKinds(kinds: readonly RecordKind[]): RecordKind[] {
  const usage = loadQuickUsage()
  return [...kinds].sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0))
}
