import type { EChartsOption } from 'echarts'
import type { DayAggregate } from './stats'
import { CHART_COLORS } from '@/constants'

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

/** 趋势图翻译函数（传入 vue-i18n 的 t 或等价实现，保持服务层框架无关） */
export type TrendT = (key: string, named?: Record<string, unknown>) => string

/** 趋势图 builder 公共参数 */
export interface TrendOptionArgs {
  days: DayAggregate[]
  xLabels: string[]
  theme: ChartThemeColors
  t: TrendT
  yFormatter?: (v: number) => string
}

/** 奶量趋势：总瓶喂奶量折线（渐变面积，品牌主色） */
export function milkTrendOption({ days, xLabels, theme, t, yFormatter }: TrendOptionArgs): EChartsOption {
  return {
    tooltip: trendTooltip((v) => `${Math.round(v)} ml`),
    ...trendAxes({ theme, xLabels, yFormatter }),
    series: [
      areaLineSeries({
        name: t('stats.series.milk'),
        data: days.map((d) => d.totalMilkAmount),
        color: CHART_COLORS.feedAmount,
        area: ['rgba(255,107,53,0.25)', 'rgba(255,107,53,0.02)'],
      }),
    ],
  }
}

/** 睡眠趋势：每日睡眠总时长柱状图（小时） */
export function sleepTrendOption({ days, xLabels, theme, t }: TrendOptionArgs): EChartsOption {
  return {
    tooltip: trendTooltip((v) => `${v} h`),
    ...trendAxes({ theme, xLabels }),
    series: [
      {
        name: t('stats.series.sleep'),
        type: 'bar',
        barMaxWidth: 22,
        data: days.map((d) => +(d.sleepMs / 3600_000).toFixed(1)),
        itemStyle: { color: CHART_COLORS.sleep, borderRadius: [4, 4, 0, 0] },
      },
    ],
  }
}

/** 纸尿裤趋势：尿湿 / 便便堆叠柱状图 */
export function diaperTrendOption({ days, xLabels, theme, t }: TrendOptionArgs): EChartsOption {
  return {
    tooltip: trendTooltip((v) => t('common.times', { n: Math.round(v) })),
    ...trendAxes({ theme, xLabels }),
    series: [
      {
        name: t('stats.series.wet'),
        type: 'bar',
        stack: 'diaper',
        barMaxWidth: 22,
        data: days.map((d) => d.wetCount),
        itemStyle: { color: '#8FB9D8' },
      },
      {
        name: t('stats.series.dirty'),
        type: 'bar',
        stack: 'diaper',
        barMaxWidth: 22,
        data: days.map((d) => d.dirtyCount),
        itemStyle: { color: '#B58B62' },
      },
    ],
  }
}

/** 吸奶趋势：每日吸奶总量折线（渐变面积） */
export function pumpTrendOption({ days, xLabels, theme, t, yFormatter }: TrendOptionArgs): EChartsOption {
  return {
    tooltip: trendTooltip((v) => `${Math.round(v)} ml`),
    ...trendAxes({ theme, xLabels, yFormatter }),
    series: [
      areaLineSeries({
        name: t('stats.series.pump'),
        data: days.map((d) => d.pumpAmount),
        color: CHART_COLORS.pump,
        area: ['rgba(216,168,200,0.25)', 'rgba(216,168,200,0.02)'],
      }),
    ],
  }
}

/** 体温趋势：每日平均体温折线（含 37.3℃ 发热参考线，无记录日为断点） */
export function temperatureTrendOption({ days, xLabels, theme, t }: TrendOptionArgs): EChartsOption {
  return {
    tooltip: trendTooltip((v) => `${v} ℃`),
    ...trendAxes({
      theme,
      xLabels,
      yMin: 35,
      yMax: 40,
      yFormatter: (v) => `${v}℃`,
    }),
    series: [
      {
        name: t('stats.series.temperature'),
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: days.map((d) => (d.temperatureCount > 0 ? +d.temperatureAvg.toFixed(1) : null)),
        connectNulls: false,
        lineStyle: { width: 2.5, color: CHART_COLORS.temperature },
        itemStyle: { color: CHART_COLORS.temperature },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          data: [{ yAxis: 37.3 }],
          lineStyle: { color: '#ff7a45', type: 'dashed', width: 1 },
        },
      },
    ],
  }
}
