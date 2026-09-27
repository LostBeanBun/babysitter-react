import s from './StatCard.module.css'

export interface StatCardProps {
  label: string
  value: string
  icon?: string
  color?: string
  sub?: string | Array<string | undefined>
  highlightFirst?: boolean
}

export default function StatCard({ label, value, icon, color, sub, highlightFirst }: StatCardProps) {
  return (
    <div className={s['stat-card']}>
      {icon && (
        <div
          className={s['stat-icon']}
          style={{ background: (color ?? '#fdf0ea') + '26', color: color ?? 'var(--primary)' }}
        >
          {icon}
        </div>
      )}
      <div className={s['stat-body']}>
        <p className={s['stat-value']} style={color ? { color } : undefined}>
          {value}
        </p>
        <p className={s['stat-label']}>{label}</p>
        {sub ? (
          Array.isArray(sub) ? (
            <p className={s['stat-sub']}>
              {sub.map((line, i) => (
                <span
                  key={i}
                  className={highlightFirst && i === 0 ? `${s['stat-sub-line']} ${s['hl-warn']}` : s['stat-sub-line']}
                  style={line ? undefined : { display: 'none' }}
                >
                  {line}
                </span>
              ))}
            </p>
          ) : (
            <p className={s['stat-sub']}>{sub}</p>
          )
        ) : null}
      </div>
    </div>
  )
}
