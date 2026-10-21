'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EChartsOption } from 'echarts'
import { useRecordsLive } from '@/hooks/useRecordsLive'
import PageHeader from '@/components/common/PageHeader'
import CountUp from '@/components/common/CountUp'
import ChartCard from '@/components/charts/ChartCard'
import GrowthCurveCharts from '@/components/charts/GrowthCurveCharts'
import { useBabies } from '@/stores/baby'
import {
  buildDailySeries,
  aggregateRange,
  compareRanges,
  RANGE_PRESETS,
  type DayAggregate,
  type ComparisonResult,
} from '@/services/stats'
import { CHART_COLORS, MS_PER_DAY } from '@/constants'
import { formatDuration, formatPercentChange, formatAmount, startOfDay } from '@/utils/format'
import { useChartTheme } from '@/hooks/useChartTheme'
import type {
  Feeding,
  DiaperChange,
  Pumping,
  Sleep,
  GrowthRecord,
  SolidFood,
  Medication,
  Temperature,
} from '@/types'
import s from './StatsView.module.css'

export default function StatsView() {
  const { t } = useTranslation()
  const { activeBabyId, activeBaby } = useBabies()
  const { axisColor, axisLineColor, splitLineColor } = useChartTheme()

  useEffect(() => {
    document.title = `${t('nav.stats')} · ${t('app.name')}`
  }, [t])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const nowTimer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(nowTimer)
  }, [])

  // 时间范围选择
  const [rangeKey, setRangeKey] = useState('today')
  const range = RANGE_PRESETS.find((p) => p.key === rangeKey) ?? RANGE_PRESETS[1]!

  // 概览 tab：对比 / 汇总
  const [activeView, setActiveView] = useState<'summary' | 'trend' | 'compare'>('summary')

  // —— 数据查询（按当前宝宝，全局表缓存跨视图共享）——
  const feedingsResult = useRecordsLive('feedings', activeBabyId)
  const feedings = useMemo(() => feedingsResult ?? [], [feedingsResult])

  const diapersResult = useRecordsLive('diapers', activeBabyId)
  const diapers = useMemo(() => diapersResult ?? [], [diapersResult])

  const pumpingsResult = useRecordsLive('pumpings', activeBabyId)
  const pumpings = useMemo(() => pumpingsResult ?? [], [pumpingsResult])

  const sleepsResult = useRecordsLive('sleeps', activeBabyId)
  const sleeps = useMemo(() => sleepsResult ?? [], [sleepsResult])

  const growthsResult = useRecordsLive('growths', activeBabyId)
  const growths = useMemo(() => growthsResult ?? [], [growthsResult])

  const solidFoodsResult = useRecordsLive('solidFoods', activeBabyId)
  const solidFoods = useMemo(() => solidFoodsResult ?? [], [solidFoodsResult])

  const medicationsResult = useRecordsLive('medications', activeBabyId)
  const medications = useMemo(() => medicationsResult ?? [], [medicationsResult])

  const temperaturesResult = useRecordsLive('temperatures', activeBabyId)
  const temperatures = useMemo(() => temperaturesResult ?? [], [temperaturesResult])

  // “全部”按实际最早记录收窄，避免从 1970 起逐日建桶导致日均失真
  const allDataStart = useMemo(() => {
    if (rangeKey !== 'all') return null
    const stamps = [
      ...feedings.map((f) => f.startTime),
      ...diapers.map((d) => d.time),
      ...pumpings.map((p) => p.startTime),
      ...sleeps.map((s) => s.startTime),
      ...growths.map((g) => g.date),
      ...solidFoods.map((sf) => sf.time),
      ...medications.map((m) => m.time),
      ...temperatures.map((tp) => tp.time),
    ].filter((ts) => Number.isFinite(ts) && ts > 0)
    if (stamps.length === 0) return startOfDay(now) - 30 * MS_PER_DAY
    return startOfDay(Math.min(...stamps))
  }, [rangeKey, feedings, diapers, pumpings, sleeps, growths, solidFoods, medications, temperatures, now])

  const rangeStart = useMemo(() => {
    if (rangeKey === 'all') return allDataStart ?? startOfDay(now) - 30 * MS_PER_DAY
    return range.getRange(now)[0]
  }, [rangeKey, allDataStart, range, now])

  const rangeEnd = useMemo(() => {
    if (rangeKey === 'all') return startOfDay(now) + MS_PER_DAY
    return range.getRange(now)[1]
  }, [rangeKey, range, now])

  // 每日序列（趋势图数据）
  const days = useMemo<DayAggregate[]>(
    () =>
      buildDailySeries(
        feedings,
        diapers,
        pumpings,
        sleeps,
        rangeStart,
        rangeEnd,
        solidFoods,
        medications,
        temperatures,
      ),
    [feedings, diapers, pumpings, sleeps, rangeStart, rangeEnd, solidFoods, medications, temperatures],
  )

  // 当前区间 vs 上一等长区间（对比）
  const previousStart = useMemo(() => rangeStart - (rangeEnd - rangeStart), [rangeStart, rangeEnd])
  const currentAgg = useMemo(
    () =>
      aggregateRange(
        feedings,
        diapers,
        pumpings,
        sleeps,
        rangeStart,
        rangeEnd,
        solidFoods,
        medications,
        temperatures,
      ),
    [feedings, diapers, pumpings, sleeps, rangeStart, rangeEnd, solidFoods, medications, temperatures],
  )
  const previousAgg = useMemo(
    () =>
      aggregateRange(
        feedings,
        diapers,
        pumpings,
        sleeps,
        previousStart,
        rangeStart,
        solidFoods,
        medications,
        temperatures,
      ),
    [feedings, diapers, pumpings, sleeps, previousStart, rangeStart, solidFoods, medications, temperatures],
  )
  const comparisons = useMemo<ComparisonResult[]>(() => compareRanges(currentAgg, previousAgg), [currentAgg, previousAgg])

  // 格式化轴标签
  const xLabels = useMemo(() => days.map((d) => d.date.slice(5).replace('-', '/')), [days])
  const yFormatter = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))

  /** 趋势图 tooltip：显示日期 + 各系列数值（无数据日显示 -），触摸/悬停均可查看 */
  const trendTooltip = (fmt: (v: number) => string) => ({
    trigger: 'axis' as const,
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
  })

  // —— 趋势图配置 ——
  const milkOption = useMemo<EChartsOption>(
    () => ({
      tooltip: trendTooltip((v) => `${Math.round(v)} ml`),
      grid: { left: 44, right: 16, top: 12, bottom: 28 },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: { color: axisColor, fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: axisColor, fontSize: 10, formatter: yFormatter, hideOverlap: true },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: [
        {
          name: t('stats.series.milk'),
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: days.map((d) => d.totalMilkAmount),
          lineStyle: { width: 2.5, color: CHART_COLORS.feedAmount },
          itemStyle: { color: CHART_COLORS.feedAmount },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255,107,53,0.25)' },
                { offset: 1, color: 'rgba(255,107,53,0.02)' },
              ],
            },
          },
        },
      ],
    }),
     
    [xLabels, axisColor, axisLineColor, splitLineColor, days, t],
  )

  const sleepOption = useMemo<EChartsOption>(
    () => ({
      tooltip: trendTooltip((v) => `${v} h`),
      grid: { left: 44, right: 16, top: 12, bottom: 28 },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: { color: axisColor, fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: axisColor, fontSize: 10, hideOverlap: true },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: [
        {
          name: t('stats.series.sleep'),
          type: 'bar',
          barMaxWidth: 22,
          data: days.map((d) => +(d.sleepMs / 3600_000).toFixed(1)),
          itemStyle: { color: CHART_COLORS.sleep, borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
     
    [xLabels, axisColor, axisLineColor, splitLineColor, days, t],
  )

  const diaperOption = useMemo<EChartsOption>(
    () => ({
      tooltip: trendTooltip((v) => t('common.times', { n: Math.round(v) })),
      grid: { left: 44, right: 16, top: 12, bottom: 28 },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: { color: axisColor, fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: axisColor, fontSize: 10, hideOverlap: true },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
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
    }),
     
    [xLabels, axisColor, axisLineColor, splitLineColor, days, t],
  )

  const pumpOption = useMemo<EChartsOption>(
    () => ({
      tooltip: trendTooltip((v) => `${Math.round(v)} ml`),
      grid: { left: 44, right: 16, top: 12, bottom: 28 },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: { color: axisColor, fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: axisColor, fontSize: 10, formatter: yFormatter, hideOverlap: true },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: [
        {
          name: t('stats.series.pump'),
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: days.map((d) => d.pumpAmount),
          lineStyle: { width: 2.5, color: CHART_COLORS.pump },
          itemStyle: { color: CHART_COLORS.pump },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(216,168,200,0.25)' },
                { offset: 1, color: 'rgba(216,168,200,0.02)' },
              ],
            },
          },
        },
      ],
    }),
     
    [xLabels, axisColor, axisLineColor, splitLineColor, days, t],
  )

  const temperatureOption = useMemo<EChartsOption>(
    () => ({
      tooltip: trendTooltip((v) => `${v} ℃`),
      grid: { left: 44, right: 16, top: 12, bottom: 28 },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: { color: axisColor, fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        min: 35,
        max: 40,
        axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => `${v}℃`, hideOverlap: true },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
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
    }),
     
    [xLabels, axisColor, axisLineColor, splitLineColor, days, t],
  )

  // 对比面板格式化
  function formatComparisonValue(c: ComparisonResult, value: number): string {
    if (c.key === 'sleepMs') return formatDuration(value)
    if (
      c.key === 'totalMilkAmount' ||
      c.key === 'breastMilkAmount' ||
      c.key === 'formulaAmount' ||
      c.key === 'pumpAmount'
    ) {
      return `${Math.round(value)} ml`
    }
    return t('common.times', { n: Math.round(value) })
  }

  /** 对比行文案：上一周期 → 当前周期（睡眠时长等长文本换行展示，title 挂完整文案） */
  function compareChangeText(c: ComparisonResult): string {
    return `${formatComparisonValue(c, c.previous)} → ${formatComparisonValue(c, c.current)}`
  }

  const rangeLabel = t(range.label)

  // —— 区间汇总（周报/月报）——
  const summaryDays = Math.max(1, currentAgg.dayCount)
  const rangeGrowthCount = growths.filter((g) => g.date >= rangeStart && g.date < rangeEnd).length

  const summaryItems = useMemo(() => {
    const agg = currentAgg
    const daysCount = summaryDays
    return [
      {
        label: t('stats.summary.feedCount'),
        num: agg.feedCount,
        format: (n: number) => t('common.times', { n: Math.round(n) }),
        sub: t('common.daily', { value: t('common.times', { n: (agg.feedCount / daysCount).toFixed(1) }) }),
      },
      {
        label: t('stats.summary.totalMilk'),
        num: agg.totalMilkAmount,
        format: (n: number) => formatAmount(n),
        sub: t('common.daily', { value: formatAmount(agg.totalMilkAmount / daysCount) }),
      },
      {
        label: t('stats.summary.breastCount'),
        num: agg.breastCount,
        format: (n: number) => t('common.times', { n: Math.round(n) }),
        sub: t('common.daily', { value: t('common.times', { n: (agg.breastCount / daysCount).toFixed(1) }) }),
      },
      {
        label: t('stats.summary.sleepMs'),
        num: agg.sleepMs,
        format: (n: number) => formatDuration(n),
        sub: t('common.daily', { value: formatDuration(agg.sleepMs / daysCount) }),
      },
      {
        label: t('stats.summary.diaper'),
        num: agg.diaperCount,
        format: (n: number) => t('common.times', { n: Math.round(n) }),
        sub: t('common.daily', { value: t('common.times', { n: (agg.diaperCount / daysCount).toFixed(1) }) }),
      },
      {
        label: t('stats.summary.pumpAmount'),
        num: agg.pumpAmount,
        format: (n: number) => formatAmount(n),
        sub: t('common.daily', { value: formatAmount(agg.pumpAmount / daysCount) }),
      },
      {
        label: t('stats.summary.growthRecords'),
        num: rangeGrowthCount,
        format: (n: number) => t('common.records', { n: Math.round(n) }),
        sub: rangeLabel,
      },
      {
        label: t('stats.summary.solidFood'),
        num: agg.solidFoodCount,
        format: (n: number) => t('common.times', { n: Math.round(n) }),
        sub: t('common.daily', { value: t('common.times', { n: (agg.solidFoodCount / daysCount).toFixed(1) }) }),
      },
      {
        label: t('stats.summary.medication'),
        num: agg.medicationCount,
        format: (n: number) => t('common.times', { n: Math.round(n) }),
        sub: t('common.daily', { value: t('common.times', { n: (agg.medicationCount / daysCount).toFixed(1) }) }),
      },
      {
        label: t('stats.summary.temperature'),
        num: agg.temperatureCount,
        format: (n: number) => t('common.times', { n: Math.round(n) }),
        sub: t('common.daily', { value: t('common.times', { n: (agg.temperatureCount / daysCount).toFixed(1) }) }),
      },
    ]
     
  }, [currentAgg, summaryDays, rangeGrowthCount, rangeLabel, t])

  return (
    <div className="page stats-page">
      <PageHeader />

      {/* 时间范围 */}
      <div className={s['range-select-row']}>
        <label className={s['range-select-label']} htmlFor="range-select">
          {t('stats.rangeLabel')}
        </label>
        <select
          id="range-select"
          value={rangeKey}
          className={`form-input ${s['range-select']}`}
          onChange={(e) => setRangeKey(e.target.value)}
        >
          {RANGE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {t(p.label)}
            </option>
          ))}
        </select>
      </div>

      {/* 页面级视图切换：总览 / 趋势 / 对比 */}
      <div className={`${s['overview-tabs']} page-tabs`} role="tablist">
        <button
          className={activeView === 'summary' ? `${s['overview-tab']} ${s.active}` : s['overview-tab']}
          role="tab"
          aria-selected={activeView === 'summary'}
          onClick={() => setActiveView('summary')}
        >
          {t('stats.tabSummary')}
        </button>
        <button
          className={activeView === 'trend' ? `${s['overview-tab']} ${s.active}` : s['overview-tab']}
          role="tab"
          aria-selected={activeView === 'trend'}
          onClick={() => setActiveView('trend')}
        >
          {t('stats.tabTrend')}
        </button>
        <button
          className={activeView === 'compare' ? `${s['overview-tab']} ${s.active}` : s['overview-tab']}
          role="tab"
          aria-selected={activeView === 'compare'}
          onClick={() => setActiveView('compare')}
        >
          {t('stats.tabCompare')}
        </button>
      </div>

      {/* 总览：区间汇总 */}
      {activeView === 'summary' && (
        <div className={`card ${s['overview-card']}`}>
          <span className={s['overview-sub']}>{t('stats.summarySub', { n: summaryDays })}</span>
          <div className={s['summary-grid']}>
            {summaryItems.map((item) => (
              <div key={item.label} className={s['summary-item']}>
                <p className={s['summary-label']}>{item.label}</p>
                <p className={s['summary-value']}>
                  <CountUp value={item.num} format={item.format} />
                </p>
                <p className={s['summary-sub']}>{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 趋势：趋势图 + 成长曲线 */}
      {activeView === 'trend' && (
        <>
          <div className={s['trend-grid']}>
            <ChartCard
              title={t('stats.charts.milkTitle')}
              subtitle={`${rangeLabel} · ${t('stats.charts.milkSub')}`}
              option={milkOption}
            />
            <ChartCard title={t('stats.charts.sleepTitle')} subtitle={rangeLabel} option={sleepOption} />
            <ChartCard
              title={t('stats.charts.diaperTitle')}
              subtitle={`${rangeLabel} · ${t('stats.charts.diaperSub')}`}
              option={diaperOption}
            />
            <ChartCard title={t('stats.charts.pumpTitle')} subtitle={rangeLabel} option={pumpOption} />
            <ChartCard
              title={t('stats.charts.temperatureTitle')}
              subtitle={`${rangeLabel} · ${t('stats.charts.temperatureSub')}`}
              option={temperatureOption}
            />
          </div>

          {/* 成长曲线 */}
          <p className="section-title">{t('stats.growthSection')}</p>
          <GrowthCurveCharts
            babyName={activeBaby?.name ?? ''}
            gender={activeBaby?.gender}
            birthDate={activeBaby?.birthDate}
            records={growths}
          />

          <p className={s['note-text']}>{t('stats.noteText')}</p>
        </>
      )}

      {/* 对比：与上一周期对比 */}
      {activeView === 'compare' && (
        <div className={`card ${s['overview-card']}`}>
          <span className={s['overview-sub']}>{t('stats.compareSub', { range: rangeLabel })}</span>
          <div className={s['compare-grid']}>
            {comparisons.map((c) => (
              <div key={c.key} className={s['compare-item']}>
                <p className={s['compare-label']}>{t(c.label)}</p>
                <p className={s['compare-value']}>
                  <CountUp value={c.current} format={(n) => formatComparisonValue(c, n)} />
                </p>
                <div className={s['compare-change-row']}>
                  <span
                    className={`${s['compare-change']} ${
                      c.change === null ? s.none : c.change >= 0 ? s.up : s.down
                    }`}
                  >
                    {c.change === null ? '—' : formatPercentChange(c.change)}
                  </span>
                  <span className={s['compare-prev']} title={compareChangeText(c)}>
                    {compareChangeText(c)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
