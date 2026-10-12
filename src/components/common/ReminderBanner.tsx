'use client'

import s from './ReminderBanner.module.css'

/** 提醒条内容芯片（如一条待种疫苗：名称 · 剂次 + 距接种日徽标） */
export interface ReminderChip {
  key: number | string
  label: string
  badge?: string
}

export interface ReminderBannerProps {
  icon: string
  title: string
  /** 副文案（单行说明，如推荐喂奶间隔） */
  sub?: string
  /** 内容芯片列表（如待种疫苗项），点击芯片触发 onSelect */
  chips?: ReminderChip[]
  variant?: 'feed' | 'vaccine'
  dismissLabel: string
  /** 整条点击（仅 vaccine 变体响应，如打开编辑） */
  onClick?: () => void
  onDismiss?: () => void
  onSelect?: (key: number | string) => void
}

/**
 * 今日提醒条（喂奶/疫苗共用）：图标 + 标题 + 副文/芯片 + 关闭按钮。
 * variant 仅决定配色与整条点击行为（vaccine 整条可点）。
 */
export default function ReminderBanner({
  icon,
  title,
  sub,
  chips,
  variant = 'feed',
  dismissLabel,
  onClick,
  onDismiss,
  onSelect,
}: ReminderBannerProps) {
  return (
    <div
      className={`${s['reminder-banner']} ${s[`reminder-banner--${variant}`]}`}
      onClick={variant === 'vaccine' ? onClick : undefined}
    >
      <span className={s['rb-icon']}>{icon}</span>
      <div className={s['rb-text']}>
        <p className={s['rb-title']}>{title}</p>
        {sub && <p className={s['rb-sub']}>{sub}</p>}
        {chips && chips.length > 0 && (
          <p className={s['rb-sub']}>
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                className={s['rb-chip']}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect?.(c.key)
                }}
              >
                {c.label}
                {c.badge && <span className={s['rb-badge']}> {c.badge}</span>}
              </button>
            ))}
          </p>
        )}
      </div>
      <button
        type="button"
        className={s['rb-close']}
        aria-label={dismissLabel}
        title={dismissLabel}
        onClick={(e) => {
          e.stopPropagation()
          onDismiss?.()
        }}
      >
        ✕
      </button>
    </div>
  )
}
