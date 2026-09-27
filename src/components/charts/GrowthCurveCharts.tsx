'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EChartsOption } from 'echarts'
import ChartCard from '@/components/charts/ChartCard'
import BaseModal from '@/components/common/BaseModal'
import { whoData, ageInMonths, type WhoField, type WhoPercentileKey } from '@/constants/whoGrowth'
import { estimatePercentile } from '@/utils/growthPercentile'
import { useChartTheme } from '@/hooks/useChartTheme'
import { CHART_COLORS } from '@/constants'
import { startOfDay } from '@/utils/format'
import type { BabyGender, GrowthRecord } from '@/types'
import s from './GrowthCurveCharts.module.css'

export interface GrowthCurveChartsProps {
  babyName: string
  gender?: BabyGender
  /** 出生日期 YYYY-MM-DD（缺失时不渲染成长曲线） */
  birthDate?: string
  /** 该宝宝的全部成长记录 */
  records: GrowthRecord[]
}

/** 空态图表配置 */
const emptyOption: EChartsOption = {
  grid: { top: 40 },
  xAxis: { type: 'value', axisLabel: { show: false } },
  yAxis: { type: 'value', axisLabel: { show: false } },
  series: [],
}

export default function GrowthCurveCharts({ babyName, gender, birthDate, records }: GrowthCurveChartsProps) {
  const { t } = useTranslation()
  const { axisColor, axisLineColor, splitLineColor, whoColors } = useChartTheme()

  /** WHO 生长曲线说明弹窗 */
  const [growthInfoOpen, setGrowthInfoOpen] = useState(false)

  const whoPoints = useMemo(() => whoData(gender), [gender])

  /** 按日合并：同一天多次测量取当天最后一条，曲线图以「日」为单位展示 */
  const growthRecords = useMemo(() => {
    const byDay = new Map<number, GrowthRecord>()
    const sorted = [...records].sort((a, b) => a.date - b.date)
    sorted.forEach((g) => byDay.set(startOfDay(g.date), g))
    return [...byDay.values()].sort((a, b) => a.date - b.date)
  }, [records])

  /** 有出生日期才能换算月龄/绘制参考线 */
  const hasBirthDate = Boolean(birthDate)

  /** 出生日 0 点时间戳（时间轴原点） */
  const birthTs = useMemo(() => (birthDate ? new Date(birthDate + 'T00:00:00').getTime() : 0), [birthDate])

  /** 月龄 → 日历日期时间戳（出生日 + n 个自然月，处理月末溢出） */
  function monthToTs(month: number): number {
    const d = new Date(birthTs)
    const m = d.getMonth() + Math.floor(month)
    const y = d.getFullYear() + Math.floor(m / 12)
    const mm = ((m % 12) + 12) % 12
    const day = Math.min(d.getDate(), new Date(y, mm + 1, 0).getDate())
    return new Date(y, mm, day).getTime()
  }

  const weightPoints = useMemo(
    () => growthRecords.filter((g) => g.weight != null).map((g) => ({ ts: g.date, value: g.weight! })),
    [growthRecords],
  )
  const heightPoints = useMemo(
    () => growthRecords.filter((g) => g.height != null).map((g) => ({ ts: g.date, value: g.height! })),
    [growthRecords],
  )
  const hcPoints = useMemo(
    () =>
      growthRecords
        .filter((g) => g.headCircumference != null)
        .map((g) => ({ ts: g.date, value: g.headCircumference! })),
    [growthRecords],
  )

  /** 图表覆盖的最大月龄（至少 24 月） */
  const growthXMax = useMemo(() => {
    const months = [...weightPoints, ...heightPoints, ...hcPoints].map((p) => ageInMonths(birthDate!, p.ts))
    return Math.max(24, Math.ceil(Math.max(3, ...months)))
  }, [birthDate, weightPoints, heightPoints, hcPoints])

  const hasGrowthData = weightPoints.length > 0 || heightPoints.length > 0 || hcPoints.length > 0

  /** 时间轴范围：出生日 → max(参考曲线最大日期, 最后记录日期) */
  const growthXMin = birthTs
  const growthXMaxTs = Math.max(
    monthToTs(growthXMax),
    ...weightPoints.map((p) => p.ts),
    ...heightPoints.map((p) => p.ts),
    ...hcPoints.map((p) => p.ts),
  )

  /** WHO 参考线数据（x 为月龄对应的日历日期时间戳） */
  function whoSeries(field: WhoField, key: WhoPercentileKey): [number, number][] {
    return whoPoints.filter((p) => p.month <= growthXMax).map((p) => [monthToTs(p.month), p[field][key]])
  }

  /** 时间轴标签：M/D（跨年显示 YY/M/D，保持标签紧凑避免重叠） */
  const tsAxisLabel = (v: number) => {
    const d = new Date(v)
    const birth = new Date(birthTs)
    if (d.getFullYear() !== birth.getFullYear()) {
      return `${String(d.getFullYear()).slice(2)}/${d.getMonth() + 1}/${d.getDate()}`
    }
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  /** 最新一条记录的百分位信息（无出生日期或无记录时为 null） */
  function latestPercentile(field: WhoField, points: { ts: number; value: number }[]): number | null {
    if (!birthDate || points.length === 0) return null
    const last = points[points.length - 1]
    const month = ageInMonths(birthDate, last.ts)
    return estimatePercentile(whoPoints, month, field, last.value)
  }

  /** 图副标题：宝宝名 + 最新记录百分位（如「小糯米 · 最新 8.9kg ≈ P60」） */
  function growthSubtitle(field: WhoField, points: { ts: number; value: number }[]): string {
    const p = latestPercentile(field, points)
    if (p != null && points.length > 0) {
      const unit = field === 'weight' ? 'kg' : 'cm'
      const value = `${points[points.length - 1].value.toFixed(1)}${unit}`
      return `${babyName} · ${t('stats.growthLatestPercentile', { value, p })}`
    }
    return t('stats.growthSub', { name: babyName })
  }

  /** 趋势图 tooltip：显示日期 + 各系列数值，用户数据行附加估算百分位 */
  const growthTooltip = (unit: string, field: WhoField, label: string) => ({
    trigger: 'axis' as const,
    formatter: (params: unknown) => {
      const list = params as Array<{ seriesName: string; marker: string; value?: [number, number] }>
      const first = list.find((p) => Array.isArray(p.value))
      if (!first?.value) return ''
      const d = new Date(first.value[0])
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const month = birthDate ? ageInMonths(birthDate, first.value[0]) : null
      const lines = list.map((p) => {
        const v = Array.isArray(p.value) ? p.value[1] : null
        let line = `${p.marker}${p.seriesName}: ${v != null ? Number(v).toFixed(1) : '-'} ${unit}`
        if (v != null && month != null && p.seriesName === label) {
          line += ` ≈ P${estimatePercentile(whoPoints, month, field, v)}`
        }
        return line
      })
      return `<b>${dateStr}</b><br/>${lines.join('<br/>')}`
    },
  })

  /** WHO 参考线颜色（P15/P85 更浅，突出 P3-P97 区间；暗色下整体加深避免刺眼） */
  const WHO_LINE_COLORS = useMemo<Record<WhoPercentileKey, string>>(
    () => ({
      p97: whoColors.mid,
      p85: whoColors.soft,
      p50: whoColors.strong,
      p15: whoColors.soft,
      p3: whoColors.mid,
    }),
    [whoColors],
  )

  function growthSeries(
    field: WhoField,
    data: { ts: number; value: number }[],
    mainColor: string,
    label: string,
  ): EChartsOption['series'] {
    const keys: WhoPercentileKey[] = ['p97', 'p85', 'p50', 'p15', 'p3']
    const series: NonNullable<EChartsOption['series']> = keys.map((k) => ({
      name: k.toUpperCase(),
      type: 'line',
      data: whoSeries(field, k),
      symbol: 'none',
      smooth: 0.4,
      lineStyle: { width: 1, color: WHO_LINE_COLORS[k], type: 'dashed' },
      itemStyle: { color: WHO_LINE_COLORS[k] },
    }))
    series.push({
      name: label,
      type: 'line',
      data: data.map((p) => [p.ts, p.value]),
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2.5, color: mainColor },
      itemStyle: { color: mainColor },
    })
    return series
  }

  const weightOption = useMemo<EChartsOption>(
    () => ({
      grid: { left: 44, right: 16, top: 34, bottom: 30 },
      legend: {
        top: 4,
        left: 'center',
        itemWidth: 14,
        itemHeight: 8,
        itemGap: 12,
        textStyle: { fontSize: 10, color: axisColor },
      },
      xAxis: {
        type: 'value',
        min: growthXMin,
        max: growthXMaxTs,
        axisLabel: { color: axisColor, fontSize: 10, formatter: tsAxisLabel, hideOverlap: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => `${v}kg`, hideOverlap: true },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      tooltip: growthTooltip('kg', 'weight', t('stats.babyWeight')),
      series: growthSeries('weight', weightPoints, CHART_COLORS.feedAmount, t('stats.babyWeight')),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axisColor, axisLineColor, splitLineColor, growthXMin, growthXMaxTs, weightPoints, t, WHO_LINE_COLORS],
  )

  const heightOption = useMemo<EChartsOption>(
    () => ({
      grid: { left: 44, right: 16, top: 34, bottom: 30 },
      legend: {
        top: 4,
        left: 'center',
        itemWidth: 14,
        itemHeight: 8,
        itemGap: 12,
        textStyle: { fontSize: 10, color: axisColor },
      },
      xAxis: {
        type: 'value',
        min: growthXMin,
        max: growthXMaxTs,
        axisLabel: { color: axisColor, fontSize: 10, formatter: tsAxisLabel, hideOverlap: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => `${v}cm`, hideOverlap: true },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      tooltip: growthTooltip('cm', 'length', t('stats.babyHeight')),
      series: growthSeries('length', heightPoints, CHART_COLORS.sleep, t('stats.babyHeight')),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axisColor, axisLineColor, splitLineColor, growthXMin, growthXMaxTs, heightPoints, t, WHO_LINE_COLORS],
  )

  const hcOption = useMemo<EChartsOption>(
    () => ({
      grid: { left: 44, right: 16, top: 34, bottom: 30 },
      legend: {
        top: 4,
        left: 'center',
        itemWidth: 14,
        itemHeight: 8,
        itemGap: 12,
        textStyle: { fontSize: 10, color: axisColor },
      },
      xAxis: {
        type: 'value',
        min: growthXMin,
        max: growthXMaxTs,
        axisLabel: { color: axisColor, fontSize: 10, formatter: tsAxisLabel, hideOverlap: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: { color: axisColor, fontSize: 10, formatter: (v: number) => `${v}cm`, hideOverlap: true },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      tooltip: growthTooltip('cm', 'hc', t('stats.babyHead')),
      series: growthSeries('hc', hcPoints, '#6AB0D8', t('stats.babyHead')),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axisColor, axisLineColor, splitLineColor, growthXMin, growthXMaxTs, hcPoints, t, WHO_LINE_COLORS],
  )

  const weightSubtitle = growthSubtitle('weight', weightPoints)
  const heightSubtitle = growthSubtitle('length', heightPoints)
  const hcSubtitle = growthSubtitle('hc', hcPoints)

  const infoBtn = (
    <button
      type="button"
      className={s['growth-info-btn']}
      aria-label={t('stats.whoInfoTitle')}
      onClick={() => setGrowthInfoOpen(true)}
    >
      ?
    </button>
  )

  return (
    <div className="growth-curve-charts">
      {hasBirthDate ? (
        <>
          {weightPoints.length > 0 ? (
            <ChartCard
              title={t('stats.growthTitle')}
              subtitle={weightSubtitle}
              option={weightOption}
              titleAction={infoBtn}
            />
          ) : (
            hasGrowthData && (
              <ChartCard title={t('stats.growthTitle')} subtitle={t('stats.growthEmpty')} option={emptyOption} />
            )
          )}

          {heightPoints.length > 0 ? (
            <ChartCard
              title={t('stats.heightTitle')}
              subtitle={heightSubtitle}
              option={heightOption}
              titleAction={infoBtn}
            />
          ) : (
            hasGrowthData && (
              <ChartCard title={t('stats.heightTitle')} subtitle={t('stats.heightEmpty')} option={emptyOption} />
            )
          )}

          {hcPoints.length > 0 ? (
            <ChartCard
              title={t('stats.hcTitle')}
              subtitle={hcSubtitle}
              option={hcOption}
              titleAction={infoBtn}
            />
          ) : (
            hasGrowthData && (
              <ChartCard title={t('stats.hcTitle')} subtitle={t('stats.hcEmpty')} option={emptyOption} />
            )
          )}

          {!hasGrowthData && <div className={`card ${s['empty-inline']}`}>{t('stats.growthEmptyBoth')}</div>}
        </>
      ) : (
        <div className={`card ${s['empty-inline']}`}>{t('stats.growthCta', { name: babyName || t('common.baby') })}</div>
      )}

      <BaseModal show={growthInfoOpen} title={t('stats.whoInfoTitle')} onClose={() => setGrowthInfoOpen(false)}>
        <div className={s['who-info']}>
          <p className={s['who-intro']}>{t('stats.whoIntro')}</p>
          <ul className={s['who-list']}>
            <li>
              <b>P3</b>
              <span>{t('stats.whoP3')}</span>
            </li>
            <li>
              <b>P15</b>
              <span>{t('stats.whoP15')}</span>
            </li>
            <li>
              <b>P50</b>
              <span>{t('stats.whoP50')}</span>
            </li>
            <li>
              <b>P85</b>
              <span>{t('stats.whoP85')}</span>
            </li>
            <li>
              <b>P97</b>
              <span>{t('stats.whoP97')}</span>
            </li>
          </ul>
          <p className={s['who-range']}>{t('stats.whoRange')}</p>
        </div>
      </BaseModal>
    </div>
  )
}
