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

/** 画布逻辑宽度（导出时按 SCALE 放大） */
export const REPORT_WIDTH = 720
const PAD = 40
const SCALE = 2
const FONT = '"PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif'

export const REPORT_COLORS = {
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
} as const

const C = REPORT_COLORS

/** 指标卡片：3 列网格，行高 100、卡片高 88 */
const METRIC_COLS = 3
const METRIC_ROW_H = 100
const METRIC_CARD_H = 88
const METRIC_CARD_GAP = 14
const METRICS_TOP = 196
/** 指标区与生长区之间的间距 */
const GROWTH_GAP = 30
/** 生长标题下划线与标题基线的偏移 */
const GROWTH_RULE_OFFSET = 12
const GROWTH_ROW_H = 44
/** 生长区首行相对标题基线的偏移 */
const GROWTH_FIRST_ROW_OFFSET = 42
/** 无生长记录时占位文案占用的高度（与一行生长行对齐） */
const NO_GROWTH_BLOCK_H = 40
/** 生长区与免责声明之间的间距 */
const DISCLAIMER_GAP = 20
/** 免责声明到画布底部预留的高度（含页脚） */
const FOOTER_BLOCK_H = 96
/** 页脚基线距画布底部的距离 */
const FOOTER_BASELINE_OFFSET = 24
/** 百分位徽标相对右边缘的偏移 */
export const GROWTH_BADGE_OFFSET = 88

export interface ReportCardBox {
  metric: ReportMetric
  x: number
  y: number
  w: number
  h: number
}

export interface ReportGrowthBox {
  row: ReportGrowthRow
  /** 行基线 */
  y: number
  /** 百分位徽标文案（P3 / P50 / —） */
  badge: string
  /** 徽标颜色：attention 用暖色提示 */
  color: string
}

export interface ReportLayout {
  width: number
  height: number
  metricsTop: number
  cards: ReportCardBox[]
  growthTop: number
  /** 生长标题下的分隔线 y */
  growthRuleY: number
  /** 生长区首行基线（也是无记录时占位文案的基线） */
  growthRowsTop: number
  growthBoxes: ReportGrowthBox[]
  /** 无生长记录时占位文案的基线 */
  noGrowthY: number
  /** 免责声明首行基线 */
  disclaimerTop: number
  /** 页脚基线 */
  footerY: number
}

/**
 * 纯排版计算：所有坐标与画布高度都由这里决定，drawReport 只负责按结果绘制。
 * 抽出来是为了能在没有 canvas 的环境下直接断言排版（单测覆盖）。
 */
export function buildReportLayout(data: ReportData): ReportLayout {
  const metricRows = Math.max(1, Math.ceil(data.metrics.length / METRIC_COLS))
  const metricsTop = METRICS_TOP
  const metricsH = metricRows * METRIC_ROW_H
  const growthTop = metricsTop + metricsH + GROWTH_GAP
  const growthRowsH = data.growthRows.length ? data.growthRows.length * GROWTH_ROW_H : NO_GROWTH_BLOCK_H
  const disclaimerTop = growthTop + 52 + growthRowsH + DISCLAIMER_GAP
  const height = disclaimerTop + FOOTER_BLOCK_H

  const cardW = (REPORT_WIDTH - PAD * 2 - METRIC_CARD_GAP * (METRIC_COLS - 1)) / METRIC_COLS
  const cards: ReportCardBox[] = data.metrics.map((metric, i) => ({
    metric,
    x: PAD + (i % METRIC_COLS) * (cardW + METRIC_CARD_GAP),
    y: metricsTop + Math.floor(i / METRIC_COLS) * METRIC_ROW_H,
    w: cardW,
    h: METRIC_CARD_H,
  }))

  const growthRowsTop = growthTop + GROWTH_FIRST_ROW_OFFSET
  const growthBoxes: ReportGrowthBox[] = data.growthRows.map((row, i) => ({
    row,
    y: growthRowsTop + i * GROWTH_ROW_H,
    badge: row.percentile == null ? '—' : `P${row.percentile}`,
    color: row.tone === 'attention' ? C.attention : C.normal,
  }))

  return {
    width: REPORT_WIDTH,
    height,
    metricsTop,
    cards,
    growthTop,
    growthRuleY: growthTop + GROWTH_RULE_OFFSET,
    growthRowsTop,
    growthBoxes,
    noGrowthY: growthRowsTop,
    disclaimerTop,
    footerY: height - FOOTER_BASELINE_OFFSET,
  }
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

/**
 * 中文按字符换行（英文单词可能被拆开，但报告以中文为主，可接受）。
 * measure 由调用方提供，便于在无 canvas 环境下单测。
 */
export function wrapTextBy(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    if (measure(line + ch) > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return wrapTextBy(text, maxWidth, (s) => ctx.measureText(s).width)
}

/** 绘制报告，返回画布（便于测试/预览） */
export function drawReport(data: ReportData): HTMLCanvasElement {
  const layout = buildReportLayout(data)

  const canvas = document.createElement('canvas')
  canvas.width = layout.width * SCALE
  canvas.height = layout.height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'

  // 背景
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, layout.width, layout.height)

  // 顶部色带
  const grad = ctx.createLinearGradient(0, 0, layout.width, 108)
  grad.addColorStop(0, '#FF8A5B')
  grad.addColorStop(1, '#FFC58A')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, layout.width, 108)

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
  for (const card of layout.cards) {
    const { metric, x, y, w, h } = card
    ctx.fillStyle = C.card
    ctx.strokeStyle = C.border
    ctx.lineWidth = 1
    roundRect(ctx, x, y, w, h, 14)
    ctx.fill()
    ctx.stroke()

    font(ctx, 400, 12)
    ctx.fillStyle = C.muted
    ctx.fillText(metric.label, x + 14, y + 26)

    font(ctx, 700, 21)
    ctx.fillStyle = C.title
    ctx.fillText(metric.value, x + 14, y + 56)

    if (metric.sub) {
      font(ctx, 400, 11)
      ctx.fillStyle = C.muted
      ctx.fillText(metric.sub, x + 14, y + 75)
    }
  }

  // 生长数据
  font(ctx, 700, 17)
  ctx.fillStyle = C.title
  ctx.fillText(data.growthTitle, PAD, layout.growthTop)
  ctx.strokeStyle = C.border
  ctx.beginPath()
  ctx.moveTo(PAD, layout.growthRuleY)
  ctx.lineTo(layout.width - PAD, layout.growthRuleY)
  ctx.stroke()

  if (layout.growthBoxes.length === 0) {
    font(ctx, 400, 13)
    ctx.fillStyle = C.muted
    ctx.fillText(data.noGrowth, PAD, layout.noGrowthY)
  } else {
    for (const box of layout.growthBoxes) {
      const { row, y, badge, color } = box
      font(ctx, 600, 14)
      ctx.fillStyle = C.text
      ctx.fillText(row.label, PAD, y)

      font(ctx, 700, 15)
      ctx.fillStyle = C.title
      ctx.fillText(row.value, PAD + 180, y)

      font(ctx, 600, 14)
      ctx.fillStyle = color
      ctx.textAlign = 'right'
      ctx.fillText(badge, layout.width - PAD - GROWTH_BADGE_OFFSET, y)
      font(ctx, 400, 12)
      ctx.fillText(row.band, layout.width - PAD, y)
      ctx.textAlign = 'left'
    }
  }

  // 免责声明
  font(ctx, 400, 12)
  ctx.fillStyle = C.muted
  const lines = wrapText(ctx, data.disclaimer, layout.width - PAD * 2)
  lines.forEach((line, i) => ctx.fillText(line, PAD, layout.disclaimerTop + i * 20))

  // 页脚
  font(ctx, 400, 11)
  ctx.fillStyle = C.muted
  ctx.fillText(data.footer, PAD, layout.footerY)

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
