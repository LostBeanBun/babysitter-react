import type { EChartsOption } from 'echarts'

/** 主题轴线颜色（来自 useChartTheme） */
export interface ChartThemeColors {
  axisColor: string
  axisLineColor: string
  splitLineColor: string
}

/** 趋势图 tooltip：显示日期 + 各系列数值（无数据日显示 -），触摸/悬停均可查看 */
export function trendTooltip(fmt: (v: number) => string): NonNullable<EChartsOption['tooltip']> {
  return {
    trigger: 'axis',
    formatter: (params: unknown) => {
      const list = params as Array<{ seriesName: string; marker: string; value?: number | null; axisValue?: string }>
      const first = list.find((p) => typeof p.value === 'number' && !Number.isNaN(p.value))
      if (!first) return ''
      const dateStr = first.axisValue ?? ''
      const lines = list.map((p) => {
        const v = typeof p.value === 'number' ? p.value : null
        return `${p.marker}${p.seriesName}: ${v != null ? fmt(v) : '-'}`
      })
      return `<b>${dateStr}</b><br/>${lines.join('<br/>')}`
    },
  }
}

interface AxesArgs {
  theme: ChartThemeColors
  xLabels: string[]
  yFormatter?: (v: number) => string
  yMin?: number
  yMax?: number
}

/** 趋势图共用的 grid / xAxis / yAxis */
export function trendAxes({ theme, xLabels, yFormatter, yMin, yMax }: AxesArgs): Pick<
  EChartsOption,
  'grid' | 'xAxis' | 'yAxis'
> {
  return {
    grid: { left: 44, right: 16, top: 12, bottom: 28 },
    xAxis: {
      type: 'category',
      data: xLabels,
      axisLabel: { color: theme.axisColor, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: theme.axisLineColor } },
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      axisLabel: {
        color: theme.axisColor,
        fontSize: 10,
        hideOverlap: true,
        ...(yFormatter ? { formatter: yFormatter } : {}),
      },
      splitLine: { lineStyle: { color: theme.splitLineColor } },
    },
  }
}

interface AreaLineArgs {
  name: string
  data: (number | null)[]
  color: string
  /** 渐变区域：[顶部色, 底部色] */
  area: [string, string]
  symbolSize?: number
}

/** 单个系列配置（EChartsOption['series'] 的非数组形式） */
export type SingleSeries = Exclude<EChartsOption['series'], unknown[] | undefined>

/** 带渐变面积的折线系列（奶量/泵出趋势图） */
export function areaLineSeries({ name, data, color, area, symbolSize = 5 }: AreaLineArgs): SingleSeries {
  return {
    name,
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize,
    data,
    lineStyle: { width: 2.5, color },
    itemStyle: { color },
    areaStyle: {
      color: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: area[0] },
          { offset: 1, color: area[1] },
        ],
      },
    },
  }
}
