/**
 * 儿保报告分享：优先把 PNG 交给系统分享面板（手机可直接发微信 / 存相册），
 * 不支持分享文件或分享失败时回退到下载。桌面浏览器普遍不支持 files，
 * 因此分享按钮只在 canShareReportPng() 为真时渲染。
 */

import { downloadBlob } from './report'

/** 分享结果：已分享 / 已回退下载 / 用户主动取消 */
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

export interface ReportShareDeps {
  /** 是否支持分享该文件（默认读 navigator.canShare） */
  canShare?: (file: File) => boolean
  /** 分享实现（默认 navigator.share） */
  share?: (data: ShareData) => Promise<void>
  /** 回退下载（默认 report.downloadBlob） */
  download?: (blob: Blob, filename: string) => void
  /** 分享面板标题（可选） */
  title?: string
  /** 分享面板附带文案（可选） */
  text?: string
}

/** 当前环境能否把该文件交给系统分享面板 */
export function canShareFiles(file: File): boolean {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/** 探测当前环境能否分享 PNG（用一张空图探路，不生成真实报告） */
export function canShareReportPng(): boolean {
  if (typeof File === 'undefined' || typeof Blob === 'undefined') return false
  return canShareFiles(new File([new Blob()], 'report.png', { type: 'image/png' }))
}

/** 用户取消分享（AbortError）不算失败，也不应回退下载 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * 分享报告 PNG，失败时回退下载。
 * 返回实际结果，调用方据此决定提示文案（取消时不提示）。
 */
export async function shareOrDownloadReport(
  blob: Blob,
  filename: string,
  deps: ReportShareDeps = {},
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type || 'image/png' })
  const canShare = deps.canShare ?? canShareFiles
  const download = deps.download ?? downloadBlob

  if (!canShare(file)) {
    download(blob, filename)
    return 'downloaded'
  }

  const share = deps.share ?? ((data: ShareData) => navigator.share(data))
  try {
    await share({
      files: [file],
      ...(deps.title ? { title: deps.title } : {}),
      ...(deps.text ? { text: deps.text } : {}),
    })
    return 'shared'
  } catch (error) {
    if (isAbortError(error)) return 'cancelled'
    download(blob, filename)
    return 'downloaded'
  }
}
