'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useBabies } from '@/stores/baby'
import { useRecordsLive } from '@/hooks/useRecordsLive'
import { useDeleteUndo } from '@/hooks/useDeleteUndo'
import { buildAnomalyHints, type AnomalyHint } from '@/services/anomalies'
import { formatDuration } from '@/utils/format'
import s from './AnomalyCard.module.css'

export interface AnomalyCardProps {
  now: number
}

function keep<T extends { id?: number }>(
  items: T[],
  kind: string,
  isPending: (target: { kind: string; id: number }) => boolean,
): T[] {
  return items.filter((x) => !isPending({ kind, id: x.id! }))
}

const ICONS: Record<AnomalyHint['key'], string> = {
  temperature: '🌡️',
  feedDrop: '🍼',
  diaperDrop: '🧷',
  sleepDown: '😴',
  sleepUp: '😴',
}

/** 值得留意：近 3 天与前 7 天的记录对比 + 近 24 小时体温（描述性提示，无数据时整卡隐藏） */
export default function AnomalyCard({ now }: AnomalyCardProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { activeBabyId } = useBabies()
  const { isPending } = useDeleteUndo()

  const feedingsResult = useRecordsLive('feedings', activeBabyId)
  const diapersResult = useRecordsLive('diapers', activeBabyId)
  const sleepsResult = useRecordsLive('sleeps', activeBabyId)
  const temperaturesResult = useRecordsLive('temperatures', activeBabyId)

  const feedings = useMemo(
    () => keep(feedingsResult ?? [], 'feeding', isPending),
    [feedingsResult, isPending],
  )
  const diapers = useMemo(
    () => keep(diapersResult ?? [], 'diaper', isPending),
    [diapersResult, isPending],
  )
  const sleeps = useMemo(() => keep(sleepsResult ?? [], 'sleep', isPending), [sleepsResult, isPending])
  const temperatures = useMemo(
    () => keep(temperaturesResult ?? [], 'temperature', isPending),
    [temperaturesResult, isPending],
  )

  const hints = useMemo(
    () => buildAnomalyHints({ now, feedings, diapers, sleeps, temperatures }),
    [now, feedings, diapers, sleeps, temperatures],
  )

  if (hints.length === 0) return null

  function percent(h: AnomalyHint): number {
    return Math.round(Math.abs(h.change) * 100)
  }

  function textOf(h: AnomalyHint): string {
    switch (h.key) {
      case 'feedDrop':
        return t('anomaly.feedDrop', { recent: h.recent.toFixed(1), percent: percent(h) })
      case 'diaperDrop':
        return t('anomaly.diaperDrop', { recent: h.recent.toFixed(1), percent: percent(h) })
      case 'sleepDown':
        return t('anomaly.sleepDown', { recent: formatDuration(h.recent), percent: percent(h) })
      case 'sleepUp':
        return t('anomaly.sleepUp', { recent: formatDuration(h.recent), percent: percent(h) })
      default:
        return t('anomaly.temperature', { value: h.recent.toFixed(1) })
    }
  }

  return (
    <section className={s['anomaly-card']} aria-labelledby="anomaly-title">
      <div className={s['anomaly-head']}>
        <div className={s['anomaly-heading']}>
          <h3 id="anomaly-title" className={s['anomaly-title']}>
            {t('anomaly.title')}
          </h3>
          <p className={s['anomaly-sub']}>{t('anomaly.subtitle')}</p>
        </div>
        <button type="button" className={s['anomaly-link']} onClick={() => router.push('/stats')}>
          {t('anomaly.viewStats')}
        </button>
      </div>

      <ul className={s['anomaly-list']}>
        {hints.map((h) => (
          <li key={h.key} className={`${s['anomaly-row']} ${s[`anomaly-row--${h.tone}`] ?? ''}`}>
            <span className={s['anomaly-icon']} aria-hidden="true">
              {ICONS[h.key]}
            </span>
            <span className={s['anomaly-text']}>{textOf(h)}</span>
          </li>
        ))}
      </ul>

      <p className={s['anomaly-note']}>{t('anomaly.note')}</p>
    </section>
  )
}
