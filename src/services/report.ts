/**
 * 儿保报告 PNG 导出：用 Canvas 2D 直接绘制，避免引入 html2canvas 等重依赖。
 * 报告只呈现「记录到的数据 + WHO 百分位估算」，不做诊断结论。
 */

export interface ReportMetric {
  label: string
  value: string
  sub?: string
}

export interface ReportGrowthRow {
  label: string
  value: string
  /** 估算百分位（1-99），无出生日期/记录时为 null */
  percentile: number | null
  /** 百分位区间文案（偏低 / 正常 / 偏高…） */
  band: string
  tone: 'normal' | 'attention'
}

export interface ReportData {
  title: string
  babyLine: string
  rangeLine: string
  generatedLine: string
  metrics: ReportMetric[]
  growthTitle: string
  growthRows: ReportGrowthRow[]
  noGrowth: string
  disclaimer: string
  footer: string
}

const W = 720
const PAD = 40
const SCALE = 2
const FONT = '"PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif'

const C = {
  bg: '#FFF9F2',
  card: '#FFFFFF',
  border: '#F0E3D6',
  title: '#3D2C22',
  text: '#4A382C',
  muted: '#A08D7C',
  primary: '#FF7A45',
  normal: '#3E8E6B',
  attention: '#C07A3A',
  white: '#FFFFFF',
}

function font(ctx: CanvasRenderingContext2D, weight: number, size: number) {
  ctx.font = `${weight} ${size}px ${FONT}`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** 中文按字符换行（英文单词可能被拆开，但报告以中文为主，可接受） */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

/** 绘制报告，返回画布（便于测试/预览） */
export function drawReport(data: ReportData): HTMLCanvasElement {
  const metricCols = 3
  const metricRows = Math.max(1, Math.ceil(data.metrics.length / metricCols))
  const metricsTop = 196
  const metricsH = metricRows * 100
  const growthTop = metricsTop + metricsH + 30
  const growthRowsH = data.growthRows.length ? data.growthRows.length * 44 : 40
  const footerTop = growthTop + 52 + growthRowsH + 20
  const H = footerTop + 96

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'

  // 背景
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)

  // 顶部色带
  const grad = ctx.createLinearGradient(0, 0, W, 108)
  grad.addColorStop(0, '#FF8A5B')
  grad.addColorStop(1, '#FFC58A')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, 108)

  // 标题
  ctx.fillStyle = C.white
  font(ctx, 700, 28)
  ctx.fillText(data.title, PAD, 54)
  font(ctx, 400, 13)
  ctx.globalAlpha = 0.92
  ctx.fillText(data.generatedLine, PAD, 82)
  ctx.globalAlpha = 1

  // 宝宝 / 区间
  font(ctx, 600, 17)
  ctx.fillStyle = C.title
  ctx.fillText(data.babyLine, PAD, 146)
  font(ctx, 400, 13)
  ctx.fillStyle = C.muted
  ctx.fillText(data.rangeLine, PAD, 170)

  // 指标卡片
  const gap = 14
  const cardW = (W - PAD * 2 - gap * (metricCols - 1)) / metricCols
  data.metrics.forEach((m, i) => {
    const col = i % metricCols
    const row = Math.floor(i / metricCols)
    const x = PAD + col * (cardW + gap)
    const y = metricsTop + row * 100
    ctx.fillStyle = C.card
    ctx.strokeStyle = C.border
    ctx.lineWidth = 1
    roundRect(ctx, x, y, cardW, 88, 14)
    ctx.fill()
    ctx.stroke()

    font(ctx, 400, 12)
    ctx.fillStyle = C.muted
    ctx.fillText(m.label, x + 14, y + 26)

    font(ctx, 700, 21)
    ctx.fillStyle = C.title
    ctx.fillText(m.value, x + 14, y + 56)

    if (m.sub) {
      font(ctx, 400, 11)
      ctx.fillStyle = C.muted
      ctx.fillText(m.sub, x + 14, y + 75)
    }
  })

  // 生长数据
  font(ctx, 700, 17)
  ctx.fillStyle = C.title
  ctx.fillText(data.growthTitle, PAD, growthTop)
  ctx.strokeStyle = C.border
  ctx.beginPath()
  ctx.moveTo(PAD, growthTop + 12)
  ctx.lineTo(W - PAD, growthTop + 12)
  ctx.stroke()

  if (data.growthRows.length === 0) {
    font(ctx, 400, 13)
    ctx.fillStyle = C.muted
    ctx.fillText(data.noGrowth, PAD, growthTop + 42)
  } else {
    data.growthRows.forEach((row, i) => {
      const y = growthTop + 42 + i * 44
      font(ctx, 600, 14)
      ctx.fillStyle = C.text
      ctx.fillText(row.label, PAD, y)

      font(ctx, 700, 15)
      ctx.fillStyle = C.title
      ctx.fillText(row.value, PAD + 180, y)

      const badge = row.percentile == null ? '—' : `P${row.percentile}`
      font(ctx, 600, 14)
      ctx.fillStyle = row.tone === 'attention' ? C.attention : C.normal
      ctx.textAlign = 'right'
      ctx.fillText(badge, W - PAD - 88, y)
      font(ctx, 400, 12)
      ctx.fillText(row.band, W - PAD, y)
      ctx.textAlign = 'left'
    })
  }

  // 免责声明
  font(ctx, 400, 12)
  ctx.fillStyle = C.muted
  const lines = wrapText(ctx, data.disclaimer, W - PAD * 2)
  lines.forEach((line, i) => ctx.fillText(line, PAD, footerTop + i * 20))

  // 页脚
  font(ctx, 400, 11)
  ctx.fillStyle = C.muted
  ctx.fillText(data.footer, PAD, H - 24)

  return canvas
}

/** 生成 PNG 并触发下载 */
export async function exportReportPng(data: ReportData, filename: string): Promise<void> {
  const canvas = drawReport(data)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('report png export failed')

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
