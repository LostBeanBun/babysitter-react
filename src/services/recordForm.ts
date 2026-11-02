import type { TimelineEntry, TimelineRaw } from '@/services/timeline'

/** 编辑回填载荷：原始记录 + 条目 id */
export type RecordEditPayload = TimelineRaw & { id: number }

/**
 * 编辑回填：原始记录完整透传（避免遗漏字段，如头围），id 以条目为准。
 * 表单组件只需按自己的 props.editing 结构断言，不必逐字段挑选。
 */
export function buildRecordEditPayload(editing?: TimelineEntry): RecordEditPayload | undefined {
  if (!editing) return undefined
  return { ...editing.raw, id: editing.id } as RecordEditPayload
}
