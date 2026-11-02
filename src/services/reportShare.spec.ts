import { describe, it, expect, afterEach, vi } from 'vitest'
import { canShareFiles, canShareReportPng, shareOrDownloadReport } from '@/services/reportShare'

const pngBlob = () => new Blob(['png'], { type: 'image/png' })
const pngFile = () => new File([new Blob()], 'report.png', { type: 'image/png' })

describe('canShareFiles', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('浏览器没有 canShare / share → false', () => {
    vi.stubGlobal('navigator', {})
    expect(canShareFiles(pngFile())).toBe(false)
  })

  it('canShare 判定不支持文件 → false', () => {
    vi.stubGlobal('navigator', { canShare: () => false, share: () => Promise.resolve() })
    expect(canShareFiles(pngFile())).toBe(false)
  })

  it('canShare 判定支持文件 → true', () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: () => Promise.resolve() })
    expect(canShareFiles(pngFile())).toBe(true)
  })

  it('canShare 抛错 → false（不向上抛，避免点按钮就崩）', () => {
    vi.stubGlobal('navigator', {
      canShare: () => {
        throw new Error('boom')
      },
      share: () => Promise.resolve(),
    })
    expect(canShareFiles(pngFile())).toBe(false)
  })
})

describe('canShareReportPng', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('无 navigator.canShare → false（桌面浏览器常见）', () => {
    vi.stubGlobal('navigator', {})
    expect(canShareReportPng()).toBe(false)
  })

  it('支持分享 PNG → true', () => {
    vi.stubGlobal('navigator', { canShare: () => true, share: () => Promise.resolve() })
    expect(canShareReportPng()).toBe(true)
  })
})

describe('shareOrDownloadReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('不支持分享 → 直接下载并返回 downloaded', async () => {
    const download = vi.fn()
    const share = vi.fn()
    const blob = pngBlob()

    const outcome = await shareOrDownloadReport(blob, 'babysitter-report-2026-11-02.png', {
      canShare: () => false,
      share,
      download,
    })

    expect(outcome).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    expect(download).toHaveBeenCalledWith(blob, 'babysitter-report-2026-11-02.png')
  })

  it('支持分享 → 传 PNG File 与标题文案，返回 shared 且不下载', async () => {
    const download = vi.fn()
    const share = vi.fn().mockResolvedValue(undefined)

    const outcome = await shareOrDownloadReport(pngBlob(), 'babysitter-report-2026-11-02.png', {
      canShare: () => true,
      share,
      download,
      title: '宝宝儿保报告',
      text: '由「宝宝日记」本地生成',
    })

    expect(outcome).toBe('shared')
    expect(download).not.toHaveBeenCalled()
    const data = share.mock.calls[0][0] as ShareData
    expect(data.title).toBe('宝宝儿保报告')
    expect(data.text).toBe('由「宝宝日记」本地生成')
    expect(data.files).toHaveLength(1)
    const file = data.files![0]!
    expect(file.name).toBe('babysitter-report-2026-11-02.png')
    expect(file.type).toBe('image/png')
  })

  it('未传 title / text 时不带多余字段', async () => {
    const share = vi.fn().mockResolvedValue(undefined)

    await shareOrDownloadReport(pngBlob(), 'r.png', {
      canShare: () => true,
      share,
      download: vi.fn(),
    })

    const data = share.mock.calls[0][0] as ShareData
    expect('title' in data).toBe(false)
    expect('text' in data).toBe(false)
    expect(data.files).toHaveLength(1)
  })

  it('用户取消（AbortError）→ cancelled，不回退下载也不抛错', async () => {
    const download = vi.fn()
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'))

    const outcome = await shareOrDownloadReport(pngBlob(), 'r.png', {
      canShare: () => true,
      share,
      download,
    })

    expect(outcome).toBe('cancelled')
    expect(download).not.toHaveBeenCalled()
  })

  it('分享抛其他错误 → 回退下载并返回 downloaded', async () => {
    const download = vi.fn()
    const share = vi.fn().mockRejectedValue(new Error('share failed'))
    const blob = pngBlob()

    const outcome = await shareOrDownloadReport(blob, 'r.png', {
      canShare: () => true,
      share,
      download,
    })

    expect(outcome).toBe('downloaded')
    expect(download).toHaveBeenCalledWith(blob, 'r.png')
  })

  it('默认实现读 navigator.canShare / navigator.share', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn()
    vi.stubGlobal('navigator', { canShare: () => true, share })

    const outcome = await shareOrDownloadReport(pngBlob(), 'r.png', { download })

    expect(outcome).toBe('shared')
    expect(share).toHaveBeenCalledTimes(1)
    expect(download).not.toHaveBeenCalled()
  })
})
