import { describe, it, expect } from 'vitest'
import {
  buildReportLayout,
  wrapTextBy,
  REPORT_COLORS,
  REPORT_WIDTH,
  GROWTH_BADGE_OFFSET,
  type ReportData,
  type ReportGrowthRow,
  type ReportMetric,
} from '@/services/report'

const PAD = 40

function metric(label: string): ReportMetric {
  return { label, value: '1 次', sub: '日均 0.1 次' }
}

function growthRow(percentile: number | null, tone: ReportGrowthRow['tone'] = 'normal'): ReportGrowthRow {
  return { label: '体重', value: '6.4 kg', percentile, band: '正常', tone }
}

function data(overrides: Partial<ReportData> = {}): ReportData {
  return {
    title: '宝宝儿保报告',
    babyLine: '小糯米 · 1 个月',
    rangeLine: '近7天 · 2026-10-24 ~ 2026-10-31',
    generatedLine: '生成于 2026-10-31',
    metrics: [metric('总奶量'), metric('喂养次数'), metric('睡眠时长')],
    growthTitle: '生长发育（WHO 百分位估算）',
    growthRows: [],
    noGrowth: '暂无成长记录',
    disclaimer: '百分位基于 WHO 生长标准估算，仅用于记录参考。',
    footer: '由「宝宝日记」本地生成 · 数据未上传',
    ...overrides,
  }
}

describe('buildReportLayout', () => {
  it('画布宽度固定 720，高度随生长行数增长', () => {
    const empty = buildReportLayout(data())
    const one = buildReportLayout(data({ growthRows: [growthRow(50)] }))
    const two = buildReportLayout(data({ growthRows: [growthRow(50), growthRow(85)] }))

    expect(empty.width).toBe(REPORT_WIDTH)
    expect(one.height).toBeGreaterThan(empty.height)
    // 每多一行生长数据高 44；无记录时占位高度 40，所以只差 4
    expect(two.height - one.height).toBe(44)
    expect(one.height - empty.height).toBe(4)
  })

  it('指标卡片 3 列网格：x 步长 = 卡宽 + 间距，第 4 张换行', () => {
    const layout = buildReportLayout(data({ metrics: [metric('a'), metric('b'), metric('c'), metric('d')] }))
    const [first, second, , fourth] = layout.cards
    const cardW = (REPORT_WIDTH - PAD * 2 - 14 * 2) / 3

    expect(layout.cards).toHaveLength(4)
    expect(first.x).toBe(PAD)
    expect(first.y).toBe(layout.metricsTop)
    expect(first.w).toBeCloseTo(cardW, 5)
    expect(first.h).toBe(88)
    expect(second.x - first.x).toBeCloseTo(cardW + 14, 5)
    expect(fourth.x).toBe(first.x)
    expect(fourth.y - first.y).toBe(100)
  })

  it('指标为空时仍保留一行卡片空间（不塌陷）', () => {
    const none = buildReportLayout(data({ metrics: [] }))
    const three = buildReportLayout(data({ metrics: [metric('a'), metric('b'), metric('c')] }))

    expect(none.cards).toHaveLength(0)
    expect(none.height).toBe(three.height)
  })

  it('7 项指标占 3 行，高度比 3 项多 2 行', () => {
    const seven = buildReportLayout(data({ metrics: Array.from({ length: 7 }, (_, i) => metric(`m${i}`)) }))
    const three = buildReportLayout(data({ metrics: [metric('a'), metric('b'), metric('c')] }))

    expect(seven.height - three.height).toBe(200)
  })

  it('生长行：基线每行 +44，徽标 P{n}，无百分位为「—」', () => {
    const layout = buildReportLayout(
      data({ growthRows: [growthRow(3), growthRow(null), growthRow(97)] }),
    )
    const [a, b, c] = layout.growthBoxes

    expect(layout.growthBoxes).toHaveLength(3)
    expect(a.y).toBe(layout.growthRowsTop)
    expect(b.y - a.y).toBe(44)
    expect(c.y - b.y).toBe(44)
    expect(a.badge).toBe('P3')
    expect(b.badge).toBe('—')
    expect(c.badge).toBe('P97')
  })

  it('生长行配色：attention 用暖色，normal 用绿色', () => {
    const layout = buildReportLayout(
      data({ growthRows: [growthRow(3, 'attention'), growthRow(50, 'normal')] }),
    )
    expect(layout.growthBoxes[0].color).toBe(REPORT_COLORS.attention)
    expect(layout.growthBoxes[1].color).toBe(REPORT_COLORS.normal)
  })

  it('无生长记录：占位文案与首行基线对齐，且不留生长行空间', () => {
    const layout = buildReportLayout(data({ growthRows: [] }))
    expect(layout.growthBoxes).toHaveLength(0)
    expect(layout.noGrowthY).toBe(layout.growthRowsTop)
    expect(layout.noGrowthY).toBe(layout.growthTop + 42)
  })

  it('免责声明基线在生长区块之后，页脚距底部 24', () => {
    const rows = [growthRow(50), growthRow(85)]
    const layout = buildReportLayout(data({ growthRows: rows }))
    expect(layout.disclaimerTop).toBe(layout.growthTop + 52 + rows.length * 44 + 20)
    expect(layout.footerY).toBe(layout.height - 24)
  })

  it('生长标题分隔线在标题基线下方 12', () => {
    const layout = buildReportLayout(data())
    expect(layout.growthRuleY).toBe(layout.growthTop + 12)
  })

  it('徽标右侧预留固定偏移，避免与区间文案重叠', () => {
    expect(GROWTH_BADGE_OFFSET).toBeGreaterThan(0)
    expect(REPORT_WIDTH - PAD - GROWTH_BADGE_OFFSET).toBeLessThan(REPORT_WIDTH - PAD)
  })
})

describe('wrapTextBy', () => {
  const measure = (text: string) => text.length * 10

  it('按宽度折行且不丢字', () => {
    const lines = wrapTextBy('宝宝日记本地生成', 30, measure)
    expect(lines).toEqual(['宝宝日', '记本地', '生成'])
    expect(lines.join('')).toBe('宝宝日记本地生成')
  })

  it('空串 → 空数组', () => {
    expect(wrapTextBy('', 30, measure)).toEqual([])
  })

  it('单字符超过宽度时仍输出该字符（不吞字）', () => {
    expect(wrapTextBy('一二', 5, measure)).toEqual(['一', '二'])
  })

  it('整段放得下时只返回一行', () => {
    expect(wrapTextBy('短文案', 100, measure)).toEqual(['短文案'])
  })
})
