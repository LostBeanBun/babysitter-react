'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '@/db'
import { useDeleteUndo } from '@/hooks/useDeleteUndo'
import { useSleepModal } from '@/hooks/useSleepModal'
import { toast } from '@/stores/toast'
import type { TimelineEntry } from '@/services/timeline'
import type { RecordKind } from '@/types'

/** 表单弹窗状态：新增（只有 kind）或编辑（带条目） */
export interface RecordModalState {
  kind: RecordKind
  editing?: TimelineEntry
}

/** 各记录类型真实删除（React 端直接操作 Dexie，与 Vue 端 store.remove 等价） */
async function removeEntry(entry: TimelineEntry): Promise<void> {
  switch (entry.kind) {
    case 'feeding':
      return db.feedings.delete(entry.id)
    case 'diaper':
      return db.diapers.delete(entry.id)
    case 'pumping':
      return db.pumpings.delete(entry.id)
    case 'sleep':
      return db.sleeps.delete(entry.id)
    case 'growth':
      return db.growths.delete(entry.id)
    case 'solidFood':
      return db.solidFoods.delete(entry.id)
    case 'medication':
      return db.medications.delete(entry.id)
    case 'vaccination':
      return db.vaccinations.delete(entry.id)
    case 'temperature':
      return db.temperatures.delete(entry.id)
    case 'milestone':
      return db.milestones.delete(entry.id)
  }
}

/**
 * 记录表单弹窗 + 删除确认的公共状态与事件分发（与 Vue 端 useRecordModal 对应）：
 * - modalState：新增/编辑（kind + 编辑条目），打开时自动隐藏睡眠悬浮球
 * - confirmDelete：删除确认 → 3 秒撤销窗口结束后真实删除（按 kind 分发到对应表）
 */
export function useRecordModal() {
  const { t } = useTranslation()
  const { scheduleDelete } = useDeleteUndo()
  const { openModal: openSleepModal, closeModal: closeSleepModal } = useSleepModal()

  const [modalState, setModalState] = useState<RecordModalState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TimelineEntry | null>(null)

  const openAdd = useCallback((kind: RecordKind) => {
    setModalState({ kind })
  }, [])

  const onEdit = useCallback((entry: TimelineEntry) => {
    setModalState({ kind: entry.kind, editing: entry })
  }, [])

  const onDelete = useCallback((entry: TimelineEntry) => {
    setConfirmDelete(entry)
  }, [])

  const closeForm = useCallback(() => setModalState(null), [])
  const closeDelete = useCallback(() => setConfirmDelete(null), [])

  /** 开始记录：保存开始时间，关闭弹窗，悬浮球出现 */
  const onStartRecord = useCallback(() => {
    setModalState(null)
    toast(t('common.recordStarted'))
  }, [t])

  /** 结束记录 / 编辑保存：关闭弹窗 */
  const onSaved = useCallback(() => {
    setModalState(null)
    toast(t('common.recordSaved'))
  }, [t])

  const onCancelled = useCallback(() => setModalState(null), [])

  /** 确认删除：进入撤销窗口，3 秒后执行真实删除 */
  const confirmDeleteAction = useCallback(() => {
    const entry = confirmDelete
    if (!entry) return
    scheduleDelete(entry, () => removeEntry(entry), t('common.deletedToast'), t('common.undo'))
    setConfirmDelete(null)
  }, [confirmDelete, scheduleDelete, t])

  // 表单弹窗打开时隐藏悬浮球
  useEffect(() => {
    if (modalState !== null) openSleepModal()
    else closeSleepModal()
  }, [modalState, openSleepModal, closeSleepModal])

  return {
    modalState,
    confirmDelete,
    openAdd,
    onEdit,
    onDelete,
    onStartRecord,
    onSaved,
    onCancelled,
    confirmDeleteAction,
    closeForm,
    closeDelete,
  }
}
