'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BaseModal from '@/components/common/BaseModal'
import { toast } from '@/stores/toast'
import { copyText } from '@/utils/clipboard'
import s from './HandoffModal.module.css'

export interface HandoffModalProps {
  show: boolean
  text: string
  onClose: () => void
}

/** 交接摘要弹窗：预览、复制文本、系统分享（不支持时降级复制） */
export default function HandoffModal({ show, text, onClose }: HandoffModalProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function handleCopy() {
    if (busy) return
    setBusy(true)
    const ok = await copyText(text)
    setBusy(false)
    toast(ok ? t('common.copied') : t('care.copyFail'), ok ? 'success' : 'error')
  }

  async function handleShare() {
    if (busy || !canShare) return
    setBusy(true)
    try {
      await navigator.share({ title: t('care.shareTitle'), text })
    } catch (e) {
      // 用户主动取消分享时静默退出，不降级复制
      if ((e as Error)?.name !== 'AbortError') {
        const ok = await copyText(text)
        toast(ok ? t('common.copied') : t('care.shareFail'), ok ? 'success' : 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <BaseModal
      show={show}
      title={t('care.handoff')}
      onClose={onClose}
      panelClassName={s.panel}
    >
      <pre className={s.text} tabIndex={0}>
        {text}
      </pre>
      <div className={s.actions}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={handleCopy}>
          {t('care.copy')}
        </button>
        {canShare && (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={handleShare}>
            {t('care.share')}
          </button>
        )}
      </div>
    </BaseModal>
  )
}
