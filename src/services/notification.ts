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
}

/** 通知图标（与 PWA manifest 一致；离线时浏览器会回退到默认图标） */
const ICON = '/icons/icon-192.png'

function notificationOptions(n: ReminderNotification): NotificationOptions {
  return {
    body: n.body,
    tag: n.tag,
    icon: ICON,
    badge: ICON,
    // Service Worker 的 notificationclick 读取该地址：相对应用根路径，兼容子路径部署
    data: { url: './' },
  }
}

/** 是否已获得系统通知权限（不支持 Notification 的浏览器一律视为否） */
export function canNotify(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
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
