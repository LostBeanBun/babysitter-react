'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { init } from 'echarts/core'
import type { ECharts, EChartsOption } from 'echarts'
import './echartsSetup'
import { useChartTheme } from '@/hooks/useChartTheme'
import s from './ChartCard.module.css'

export interface ChartCardProps {
  title: string
  subtitle?: string
  /** ECharts 配置对象 */
  option: EChartsOption
  height?: string
  /** 无数据占位：显式传入时优先生效；缺省时自动检测 series 是否含有有效数据 */
  empty?: boolean
  /** 标题右侧操作区（原 Vue title-action 插槽） */
  titleAction?: React.ReactNode
}

/** 判断单个 series 是否存在有效数据点（null/undefined/0 均视为无数据） */
function seriesHasData(scn: unknown): boolean {
  const data = (scn as { data?: unknown } | null)?.data
  if (!Array.isArray(data) || data.length === 0) return false
  return data.some((v) => {
    if (v === null || v === undefined) return false
    if (typeof v === 'number') return v !== 0
    if (Array.isArray(v)) return v.length > 1 && v[1] !== null && v[1] !== undefined && v[1] !== 0
    return true
  })
}

export default function ChartCard({ title, subtitle, option, height, empty, titleAction }: ChartCardProps) {
  const { t } = useTranslation()
  const { tooltipColors } = useChartTheme()

  const chartElRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ECharts | null>(null)
  const hideTimerRef = useRef<number | undefined>(undefined)

  const style = useMemo(() => ({ height: height ?? '260px' }), [height])

  /** 图表是否处于无数据状态（渲染占位而非空图表） */
  const isEmpty = useMemo(() => {
    if (empty === true) return true
    const series = option.series
    if (!Array.isArray(series) || series.length === 0) return true
    return !series.some(seriesHasData)
  }, [option, empty])

  const { backgroundColor, borderColor, textColor } = tooltipColors

  /** 统一 tooltip 样式（避免数组类型兼容问题，仅处理对象形式） */
  const mergedOption = useMemo<EChartsOption>(() => {
    const base = option
    const hasTooltip = base.tooltip !== undefined
    return {
      ...base,
      tooltip: hasTooltip
        ? {
            trigger: 'axis',
            backgroundColor,
            borderColor,
            borderWidth: 1,
            textStyle: { color: textColor, fontSize: 12 },
            confine: true,
            ...(typeof base.tooltip === 'object' && !Array.isArray(base.tooltip) ? base.tooltip : {}),
          }
        : base.tooltip,
    }
  }, [option, backgroundColor, borderColor, textColor])

  // init on mount / dispose on unmount
  useEffect(() => {
    if (isEmpty) return
    const el = chartElRef.current
    if (!el) return
    const chart = init(el)
    chartRef.current = chart
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      window.clearTimeout(hideTimerRef.current)
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [isEmpty])

  // setOption on option change
  useEffect(() => {
    if (isEmpty) return
    chartRef.current?.setOption(mergedOption)
  }, [isEmpty, mergedOption])

  useEffect(
    () => () => {
      window.clearTimeout(hideTimerRef.current)
    },
    [],
  )

  /**
   * 移动端手指松开后延时隐藏 tooltip：
   * echarts 在触屏上 tap 会固定显示 tooltip，不会自动消失。
   * 这里在 touchend 后延时 500ms 主动 hideTip，形成「松开即消失」的默认体验。
   */
  function onTouchEnd() {
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      chartRef.current?.dispatchAction({ type: 'hideTip' })
    }, 500)
  }

  return (
    <div className={`${s['chart-card']} card`}>
      <div className={s['chart-head']}>
        <div className={s['chart-title-row']}>
          <h3 className={s['chart-title']}>{title}</h3>
          {titleAction}
        </div>
        {subtitle && <p className={s['chart-sub']}>{subtitle}</p>}
      </div>
      {isEmpty ? (
        <div className={s['chart-empty']} style={style}>
          <p className={s['chart-empty-text']}>{t('stats.noData')}</p>
        </div>
      ) : (
        <div className={s['chart-wrap']} onTouchEnd={onTouchEnd}>
          <div ref={chartElRef} style={style} />
        </div>
      )}
    </div>
  )
}
