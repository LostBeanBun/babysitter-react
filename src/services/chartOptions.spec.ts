import { describe, it, expect } from 'vitest'
import {
  trendTooltip,
  trendAxes,
  areaLineSeries,
  milkTrendOption,
  sleepTrendOption,
  diaperTrendOption,
  pumpTrendOption,
  temperatureTrendOption,
} from '@/services/chartOptions'
import type { DayAggregate } from '@/services/stats'

interface TooltipShape {
  trigger?: string
  formatter: (params: unknown) => string
}
interface AxesShape {
  grid: { left: number; right: number; top: number; bottom: number }
  xAxis: {
    type: string
    data: unknown[]
    axisLabel: { color: string }
    axisLine: { lineStyle: { color: string } }
  }
  yAxis: {
    min?: number
    max?: number
    axisLabel: { color: string; formatter?: (v: number) => string }
    splitLine: { lineStyle: { color: string } }
  }
}
interface SeriesShape {
  type: string
  smooth: boolean
  name: string
  data: unknown[]
  symbolSize: number
  lineStyle: { color: string }
  areaStyle: { color: { colorStops: Array<{ offset: number; color: string }> } }
}

describe('trendTooltip', () => {
  const fmt = (v: number) => `${v}ml`
  const tooltip = trendTooltip(fmt) as unknown as TooltipShape

  it('axis 触发，格式化日期与各系列值', () => {
    expect(tooltip.trigger).toBe('axis')
    const out = tooltip.formatter([
      { seriesName: '奶量', marker: '●', value: 500, axisValue: '10-01' },
      { seriesName: '泵出', marker: '■', value: null, axisValue: '10-01' },
    ])
    expect(out).toContain('<b>10-01</b>')
    expect(out).toContain('●奶量: 500ml')
    expect(out).toContain('■泵出: -')
  })

  it('全部无值返回空串', () => {
    expect(tooltip.formatter([{ seriesName: 'x', marker: '', value: null }])).toBe('')
    expect(tooltip.formatter([])).toBe('')
  })
})

describe('trendAxes', () => {
  const theme = { axisColor: '#333', axisLineColor: '#666', splitLineColor: '#eee' }

  it('应用主题色、标签与 yFormatter', () => {
    const axes = trendAxes({
      theme,
      xLabels: ['10-01', '10-02'],
      yFormatter: (v) => `${v}ml`,
      yMin: 0,
      yMax: 1000,
    }) as unknown as AxesShape
    expect(axes.grid).toMatchObject({ left: 44, right: 16, top: 12, bottom: 28 })
    expect(axes.xAxis.type).toBe('category')
    expect(axes.xAxis.data).toEqual(['10-01', '10-02'])
    expect(axes.xAxis.axisLabel.color).toBe('#333')
    expect(axes.xAxis.axisLine.lineStyle.color).toBe('#666')
    expect(axes.yAxis.min).toBe(0)
    expect(axes.yAxis.max).toBe(1000)
    expect(axes.yAxis.axisLabel.formatter).toBeTypeOf('function')
    expect(axes.yAxis.splitLine.lineStyle.color).toBe('#eee')
  })

  it('无 yFormatter 不注入 formatter', () => {
    const { yAxis } = trendAxes({ theme, xLabels: [] }) as unknown as Pick<AxesShape, 'yAxis'>
    expect(yAxis.axisLabel).not.toHaveProperty('formatter')
  })
})

describe('areaLineSeries', () => {
  it('折线 + 渐变面积，数据原样透传', () => {
    const data = [100, null, 300]
    const series = areaLineSeries({
      name: '奶量',
      data,
      color: '#8FB9D8',
      area: ['rgba(143,185,216,0.4)', 'rgba(143,185,216,0)'],
    }) as unknown as SeriesShape
    expect(series.type).toBe('line')
    expect(series.smooth).toBe(true)
    expect(series.name).toBe('奶量')
    expect(series.data).toEqual(data)
    expect(series.lineStyle.color).toBe('#8FB9D8')
    expect(series.symbolSize).toBe(5)
    const stops = series.areaStyle.color.colorStops
    expect(stops[0]).toEqual({ offset: 0, color: 'rgba(143,185,216,0.4)' })
    expect(stops[1]).toEqual({ offset: 1, color: 'rgba(143,185,216,0)' })
  })

  it('可覆盖 symbolSize', () => {
    const series = areaLineSeries({
      name: 'x',
      data: [1],
      color: '#fff',
      area: ['#fff', '#fff'],
      symbolSize: 8,
    }) as unknown as Pick<SeriesShape, 'symbolSize'>
    expect(series.symbolSize).toBe(8)
  })
})

describe('趋势图 builder', () => {
  const theme = { axisColor: '#333', axisLineColor: '#666', splitLineColor: '#eee' }
  const t = (key: string) => key
  const day = (partial: Partial<DayAggregate>): DayAggregate => ({
    date: '2025-11-01',
    dayStart: 0,
    bottleAmount: 0,
    breastMilkAmount: 0,
    formulaAmount: 0,
    totalMilkAmount: 0,
    breastCount: 0,
    bottleCount: 0,
    feedCount: 0,
    sleepMs: 0,
    diaperCount: 0,
    wetCount: 0,
    dirtyCount: 0,
    pumpAmount: 0,
    pumpCount: 0,
    pumpMs: 0,
    solidFoodCount: 0,
    medicationCount: 0,
    temperatureCount: 0,
    temperatureAvg: 0,
    ...partial,
  })
  const days = [
    day({ totalMilkAmount: 500, sleepMs: 8 * 3600_000, wetCount: 4, dirtyCount: 2, pumpAmount: 300, temperatureCount: 1, temperatureAvg: 37.2 }),
    day({ totalMilkAmount: 600, sleepMs: 9 * 3600_000, wetCount: 5, dirtyCount: 1, pumpAmount: 0, temperatureCount: 0 }),
  ]
  const args = { days, xLabels: ['11/01', '11/02'], theme, t }
  type Opt = { tooltip: unknown; series: Array<{ name: string; data: unknown[]; type?: string; markLine?: { data: Array<{ yAxis: number }> } }> }

  it('奶量趋势：单系列、总奶量数据', () => {
    const opt = milkTrendOption(args) as Opt
    expect(opt.series).toHaveLength(1)
    expect(opt.series[0].name).toBe('stats.series.milk')
    expect(opt.series[0].data).toEqual([500, 600])
  })

  it('睡眠趋势：柱状、小时换算', () => {
    const opt = sleepTrendOption(args) as Opt
    expect(opt.series[0].type).toBe('bar')
    expect(opt.series[0].data).toEqual([8, 9])
  })

  it('纸尿裤趋势：双系列堆叠', () => {
    const opt = diaperTrendOption(args) as Opt
    expect(opt.series).toHaveLength(2)
    expect(opt.series.map((s) => s.name)).toEqual(['stats.series.wet', 'stats.series.dirty'])
    expect(opt.series[0].data).toEqual([4, 5])
    expect(opt.series[1].data).toEqual([2, 1])
  })

  it('吸奶趋势：单系列、吸奶量数据', () => {
    const opt = pumpTrendOption(args) as Opt
    expect(opt.series[0].name).toBe('stats.series.pump')
    expect(opt.series[0].data).toEqual([300, 0])
  })

  it('体温趋势：无记录日断点 + 37.3 参考线', () => {
    const opt = temperatureTrendOption(args) as Opt
    expect(opt.series[0].data).toEqual([37.2, null])
    expect(opt.series[0].markLine?.data).toEqual([{ yAxis: 37.3 }])
  })
})
