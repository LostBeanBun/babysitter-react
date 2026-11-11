/**
 * 提醒调度器：统一管理喂奶/睡眠/用药/疫苗/尿布五类提醒。
 * 所有提醒默认关闭，由用户在设置页自行开启并配置参数。
 * 通知节流状态持久化在 localStorage，避免刷新页面后重复提醒。
 */
import type { Baby, Feeding, Medication, Vaccination, DiaperChange, Sleep } from '@/types'
import { recommendedIntervalMs } from '@/utils/feedingGuide'
import i18n from '@/i18n'

const t = (key: string, options?: Record<string, unknown>): string =>
  String(i18n.t(key, options as never))

export type ReminderType = 'feed' | 'sleep' | 'medication' | 'vaccination' | 'diaper'

export interface ReminderConfig {
  feed: { enabled: boolean; intervalHours: number }
  sleep: { enabled: boolean; time: string; intervalHours: number }
  medication: { enabled: boolean; intervalHours: number }
  vaccination: { enabled: boolean }
  diaper: { enabled: boolean; intervalHours: number }
  /** 免打扰时段：区间内不发送系统通知（页面内提醒条仍可见） */
  quiet: { enabled: boolean; start: string; end: string }
}

export const DEFAULT_REMINDERS: ReminderConfig = {
  feed: { enabled: false, intervalHours: 0 },
  sleep: { enabled: false, time: '20:00', intervalHours: 0 },
  medication: { enabled: false, intervalHours: 8 },
  vaccination: { enabled: false },
  diaper: { enabled: false, intervalHours: 3 },
  quiet: { enabled: false, start: '22:00', end: '07:00' },
}

export type IntervalReminderType = 'feed' | 'sleep' | 'medication' | 'diaper'

/** 各类间隔提醒下限（小时）：喂养/睡眠 0 有特殊语义（按月龄推荐 / 仅定时提醒），用药/尿布至少 1 小时 */
export const INTERVAL_MIN_HOURS: Record<IntervalReminderType, number> = {
  feed: 0,
  sleep: 0,
  medication: 1,
  diaper: 1,
}

/** 间隔输入统一上限（小时）：超过一天的间隔无提醒意义，输入钳制与载入清洗共用 */
export const INTERVAL_MAX_HOURS = 24

/** 间隔边界钳制：空值/非法值回退 min，越界钳到 [min, INTERVAL_MAX_HOURS] */
export function clampIntervalHours(raw: string | number, min = 0): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (Number.isNaN(n)) return min
  return Math.min(Math.max(n, min), INTERVAL_MAX_HOURS)
}

const REMINDER_KEY = 'babysitter.reminders'
const NOTIFIED_KEY = 'babysitter.reminderNotified'
const SNOOZED_KEY = 'babysitter.reminderSnoozed'
const LEGACY_FEED_KEY = 'babysitter.feedReminder'
/** 旧版全局提醒配置的迁移标记：只复制给首个读取配置的宝宝 */
const MIGRATED_KEY = 'babysitter.remindersMigrated'

/**
 * 按宝宝隔离的存储键：`babysitter.reminders.<babyId>`。
 * babyId 为空时退回全局键（无宝宝 / 测试场景），保持旧版行为。
 */
function scopedKey(base: string, babyId?: number | null): string {
  return babyId == null ? base : `${base}.${babyId}`
}

/** 解析一份提醒配置；键不存在或内容损坏时返回 null */
function readConfig(key: string): ReminderConfig | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<
      string,
      { enabled?: boolean; intervalHours?: number; time?: string; start?: string; end?: string }
    >
    const cfg = cloneDefaults()
    ;(Object.keys(DEFAULT_REMINDERS) as (keyof ReminderConfig)[]).forEach((k) => {
      const p = parsed[k]
      if (p && typeof p === 'object') {
        const target = cfg[k] as Record<string, unknown>
        if (typeof p.enabled === 'boolean') target.enabled = p.enabled
        // 免打扰时段：只有开关与起止时间，没有间隔语义
        if (k === 'quiet') {
          if (typeof p.start === 'string') target.start = p.start
          if (typeof p.end === 'string') target.end = p.end
          return
        }
        if (typeof p.intervalHours === 'number' && k !== 'vaccination') {
          // 载入清洗：旧版/手改数据可能越界，统一钳回 [min, 24]
          target.intervalHours = clampIntervalHours(p.intervalHours, INTERVAL_MIN_HOURS[k])
        }
        if (typeof p.time === 'string') target.time = p.time
      }
    })
    return cfg
  } catch {
    return null
  }
}

function isMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === '1'
  } catch {
    return false
  }
}

function markMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, '1')
  } catch {
    /* 存储不可用时忽略 */
  }
}

/**
 * 读取提醒配置（默认全部关闭；兼容旧版喂奶提醒开关）。
 * 配置按宝宝独立存储；旧版全局配置在首次按宝宝读取时复制给该宝宝，其余宝宝使用默认值。
 */
export function loadReminders(babyId?: number | null): ReminderConfig {
  const own = readConfig(scopedKey(REMINDER_KEY, babyId))
  if (own) return own

  if (babyId != null && !isMigrated()) {
    const legacy = readConfig(REMINDER_KEY)
    markMigrated()
    if (legacy) {
      saveReminders(legacy, babyId)
      return legacy
    }
  }

  const cfg = cloneDefaults()
  try {
    if (localStorage.getItem(LEGACY_FEED_KEY) === 'on') cfg.feed.enabled = true
  } catch {
    /* 存储不可用时用默认值 */
  }
  return cfg
}

function cloneDefaults(): ReminderConfig {
  return {
    feed: { ...DEFAULT_REMINDERS.feed },
    sleep: { ...DEFAULT_REMINDERS.sleep },
    medication: { ...DEFAULT_REMINDERS.medication },
    vaccination: { ...DEFAULT_REMINDERS.vaccination },
    diaper: { ...DEFAULT_REMINDERS.diaper },
    quiet: { ...DEFAULT_REMINDERS.quiet },
  }
}

export function saveReminders(cfg: ReminderConfig, babyId?: number | null) {
  localStorage.setItem(scopedKey(REMINDER_KEY, babyId), JSON.stringify(cfg))
}

function loadNotified(babyId?: number | null): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(scopedKey(NOTIFIED_KEY, babyId)) || '{}')
  } catch {
    return {}
  }
}

function lastNotified(type: ReminderType, babyId?: number | null): number {
  return loadNotified(babyId)[type] || 0
}

function markNotified(type: ReminderType, stamp: number, babyId?: number | null) {
  const map = loadNotified(babyId)
  map[type] = stamp
  localStorage.setItem(scopedKey(NOTIFIED_KEY, babyId), JSON.stringify(map))
}

// —— 免打扰时段 ——

/** "HH:MM" → 当天分钟数；非法值返回 null */
function parseMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * 当前是否处于免打扰时段。支持跨零点（如 22:00–07:00）；
 * 起止相同视为未配置（避免整天静音）。
 */
export function isQuietNow(cfg: ReminderConfig, now: number): boolean {
  if (!cfg.quiet?.enabled) return false
  const start = parseMinutes(cfg.quiet.start)
  const end = parseMinutes(cfg.quiet.end)
  if (start == null || end == null || start === end) return false
  const d = new Date(now)
  const minutes = d.getHours() * 60 + d.getMinutes()
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}

// —— 稍后提醒（snooze）——

function loadSnoozes(babyId?: number | null): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(scopedKey(SNOOZED_KEY, babyId)) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}

/** 把某类提醒延后 N 分钟（期间不发送系统通知）；按宝宝隔离 */
export function snoozeReminder(
  type: ReminderType,
  minutes: number,
  now = Date.now(),
  babyId?: number | null,
): void {
  const map = loadSnoozes(babyId)
  map[type] = now + Math.max(1, minutes) * 60_000
  localStorage.setItem(scopedKey(SNOOZED_KEY, babyId), JSON.stringify(map))
}

/** 某类提醒是否仍在稍后窗口内 */
export function isSnoozed(type: ReminderType, now = Date.now(), babyId?: number | null): boolean {
  return (loadSnoozes(babyId)[type] ?? 0) > now
}

export interface ReminderContext {
  now: number
  baby?: Baby | null
  feedings: Feeding[]
  medications: Medication[]
  vaccinations: Vaccination[]
  diapers: DiaperChange[]
  sleeps: Sleep[]
}

export interface ReminderHit {
  type: ReminderType
  title: string
  body: string
  tag: string
  /** 点击通知后的落地页：直接打开对应记录表单 / 筛选 */
  url: string
}

const THROTTLE_MS = 5 * 60_000
const MED_THROTTLE_MS = 30 * 60_000

/** 通知落地页（Next 静态导出路径）：相对应用根路径，兼容子路径部署 */
const LOG_PATH = './log/'

function logUrl(query: string): string {
  return `${LOG_PATH}?${query}`
}

/** 检查当前是否触发任何已开启的提醒（调用方负责通知权限判断与发送） */
export function checkReminders(ctx: ReminderContext): ReminderHit[] {
  const babyId = ctx.baby?.id ?? null
  const cfg = loadReminders(babyId)
  const hits: ReminderHit[] = []
  const now = ctx.now

  // 免打扰时段内不发系统通知（页面内横幅由各页面自行判断，不受影响）
  if (isQuietNow(cfg, now)) return hits

  // 喂奶：距上次喂养超过间隔
  if (cfg.feed.enabled && !isSnoozed('feed', now, babyId) && ctx.feedings.length) {
    const last = [...ctx.feedings].sort((a, b) => b.startTime - a.startTime)[0]
    const since = now - last.startTime
    const threshold =
      cfg.feed.intervalHours > 0 ? cfg.feed.intervalHours * 3600_000 : recommendedIntervalMs(ctx.baby ?? undefined)
    if (since > threshold && now - lastNotified('feed', babyId) > THROTTLE_MS) {
      markNotified('feed', now, babyId)
      hits.push({
        type: 'feed',
        title: t('reminders.feed.title'),
        body: t('reminders.feed.body', { duration: formatMin(since) }),
        tag: 'reminder-feed',
        url: logUrl('timer=feeding'),
      })
    }
  }

  // 睡眠：到达设置的晚间就寝时间（1 小时窗口内，当天仅一次）或距上次睡眠超过间隔
  if (cfg.sleep.enabled && !isSnoozed('sleep', now, babyId)) {
    // 固定时间提醒
    if (cfg.sleep.time) {
      const [h, m] = cfg.sleep.time.split(':').map(Number)
      const target = new Date(now)
      target.setHours(h, m, 0, 0)
      if (now >= target.getTime() && now - target.getTime() <= 3600_000 && lastNotified('sleep', babyId) < target.getTime()) {
        markNotified('sleep', now, babyId)
        hits.push({
          type: 'sleep',
          title: t('reminders.sleep.title'),
          body: t('reminders.sleep.bodyTime', { time: cfg.sleep.time }),
          tag: 'reminder-sleep',
          url: logUrl('timer=sleep'),
        })
      }
    }
    // 间隔提醒（距上次睡眠超过设置间隔）
    if (cfg.sleep.intervalHours > 0 && ctx.sleeps.length) {
      const last = [...ctx.sleeps].sort((a, b) => b.startTime - a.startTime)[0]
      const since = now - last.startTime
      if (since > cfg.sleep.intervalHours * 3600_000 && now - lastNotified('sleep', babyId) > THROTTLE_MS) {
        markNotified('sleep', now, babyId)
        hits.push({
          type: 'sleep',
          title: t('reminders.sleep.title'),
          body: t('reminders.sleep.body', { duration: formatMin(since) }),
          tag: 'reminder-sleep',
          url: logUrl('timer=sleep'),
        })
      }
    }
  }

  // 用药：距最近用药记录超过设置间隔
  if (cfg.medication.enabled && !isSnoozed('medication', now, babyId) && ctx.medications.length) {
    const last = [...ctx.medications].sort((a, b) => b.time - a.time)[0]
    const since = now - last.time
    if (since > cfg.medication.intervalHours * 3600_000 && now - lastNotified('medication', babyId) > MED_THROTTLE_MS) {
      markNotified('medication', now, babyId)
      hits.push({
        type: 'medication',
        title: t('reminders.medication.title'),
        body: t('reminders.medication.body', { name: last.name || t('common.baby') }),
        tag: 'reminder-medication',
        url: logUrl('timer=medication'),
      })
    }
  }

  // 疫苗：今天有待接种（planned）疫苗
  if (cfg.vaccination.enabled && !isSnoozed('vaccination', now, babyId) && ctx.vaccinations.length) {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const due = ctx.vaccinations.find(
      (v) => v.status === 'planned' && v.date >= today.getTime() && v.date < today.getTime() + 86_400_000,
    )
    if (due && lastNotified('vaccination', babyId) < today.getTime()) {
      markNotified('vaccination', now, babyId)
      hits.push({
        type: 'vaccination',
        title: t('reminders.vaccination.title'),
        body: t('reminders.vaccination.body', { name: due.name }),
        tag: 'reminder-vaccination',
        url: logUrl('filter=vaccination'),
      })
    }
  }

  // 尿布：距上次更换超过设置间隔
  if (cfg.diaper.enabled && !isSnoozed('diaper', now, babyId) && ctx.diapers.length) {
    const last = [...ctx.diapers].sort((a, b) => b.time - a.time)[0]
    const since = now - last.time
    if (since > cfg.diaper.intervalHours * 3600_000 && now - lastNotified('diaper', babyId) > THROTTLE_MS) {
      markNotified('diaper', now, babyId)
      hits.push({
        type: 'diaper',
        title: t('reminders.diaper.title'),
        body: t('reminders.diaper.body', { hours: cfg.diaper.intervalHours }),
        tag: 'reminder-diaper',
        url: logUrl('timer=diaper'),
      })
    }
  }

  return hits
}

function formatMin(ms: number): string {
  let totalMin = Math.round(ms / 60_000)
  if (totalMin < 0) totalMin = 0
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return m > 0 ? `${h} ${t('reminders.hour')} ${m} ${t('reminders.minute')}` : `${h} ${t('reminders.hour')}`
  return `${m} ${t('reminders.minute')}`
}