import { describe, it, expect } from 'vitest'
import { trendTooltip, trendAxes, areaLineSeries } from '@/services/chartOptions'

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
