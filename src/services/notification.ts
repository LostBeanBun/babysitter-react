/**
 * 系统通知发送（两端同一份实现）
 *
 * 移动端 Chrome / Android WebView 不允许 `new Notification()`（会抛 Illegal constructor），
 * 必须通过 Service Worker 的 `registration.showNotification()`；桌面端无 SW 时再回退构造函数。
 * 通知只是提醒的补充，任何失败都静默处理，不影响记录与页面内提醒条。
 */

/** 提醒通知内容（由 reminderScheduler 生成） */
export interface ReminderNotification {
  title: string
  body: string
  tag: string
  /** 点击通知后要打开的页面（相对应用根路径；缺省回首页） */
  url?: string
}

/**
 * 通知可用状态（设置页展示用）：
 * granted / default / denied 对应浏览器权限，unsupported 表示浏览器不支持，
 * ios-install 表示 iOS/iPadOS 未「添加到主屏幕」（该模式下 Safari 不提供通知权限）。
 */
export type NotifyStatus = NotificationPermission | 'unsupported' | 'ios-install'

/** 通知图标（与 PWA manifest 一致；离线时浏览器会回退到默认图标） */
const ICON = '/icons/icon-192.png'

function notificationOptions(n: ReminderNotification): NotificationOptions {
  return {
    body: n.body,
    tag: n.tag,
    icon: ICON,
    badge: ICON,
    // Service Worker 的 notificationclick 读取该地址：相对应用根路径，兼容子路径部署
    data: { url: n.url ?? './' },
  }
}

/** 是否已获得系统通知权限（不支持 Notification 的浏览器一律视为否） */
export function canNotify(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/**
 * 是否运行在 iOS/iPadOS 的非独立模式（未「添加到主屏幕」）。
 * iPadOS 13+ 的 Safari 默认上报桌面版 UA，需要用触点数区分。
 */
export function isIosNonStandalone(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (!isIos) return false
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches === true)
  return !standalone
}

/** 当前通知可用状态：iOS 非独立模式优先给出安装引导，其次才看浏览器权限 */
export function getNotifyStatus(): NotifyStatus {
  if (isIosNonStandalone()) return 'ios-install'
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/**
 * 请求通知权限：仅在浏览器权限为 default 时弹出系统询问；
 * 已拒绝 / 不支持 / iOS 未安装时直接返回当前状态，不抛错。
 */
export async function requestNotifyPermission(): Promise<NotifyStatus> {
  const status = getNotifyStatus()
  if (status !== 'default') return status
  try {
    return await Notification.requestPermission()
  } catch {
    return getNotifyStatus()
  }
}

/**
 * 发送系统通知：优先 Service Worker（移动端必需，且页面退到后台后仍可点开），
 * 无可用 SW 时回退 `new Notification`。
 */
export async function showReminderNotification(n: ReminderNotification): Promise<void> {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg?.active) {
        await reg.showNotification(n.title, notificationOptions(n))
        return
      }
    } catch {
      // 继续走构造函数回退
    }
  }
  try {
    const fallback = new Notification(n.title, notificationOptions(n))
    fallback.onclick = () => {
      window.focus()
      fallback.close()
    }
  } catch {
    // 移动端不支持构造函数时静默
  }
}
