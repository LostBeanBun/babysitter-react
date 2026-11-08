import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canNotify,
  getNotifyStatus,
  isIosNonStandalone,
  requestNotifyPermission,
  showReminderNotification,
} from './notification'

const hit = { title: '该喂奶了', body: '距上次喂奶已 4 小时', tag: 'feed' }

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** 覆盖 navigator 只读属性（jsdom 默认值不便于模拟 iOS） */
const navigatorStubs: string[] = []
function stubNavigator(overrides: Record<string, unknown>) {
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(navigator, key, { configurable: true, value })
    navigatorStubs.push(key)
  }
}

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static instances: FakeNotification[] = []
  static requestPermission: () => Promise<NotificationPermission> = async () => 'granted'
  onclick: (() => void) | null = null
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this)
  }
  close() {}
}

function stubNotification(permission: NotificationPermission = 'granted') {
  FakeNotification.permission = permission
  FakeNotification.instances = []
  FakeNotification.requestPermission = vi.fn(async () => permission)
  vi.stubGlobal('Notification', FakeNotification)
  return FakeNotification
}

function stubServiceWorker(reg: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn().mockResolvedValue(reg) },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  for (const key of navigatorStubs.splice(0)) Reflect.deleteProperty(navigator, key)
})

describe('canNotify', () => {
  it('未授权 / 不支持时返回 false', () => {
    expect(canNotify()).toBe(false)
    stubNotification()
    FakeNotification.permission = 'denied'
    expect(canNotify()).toBe(false)
    FakeNotification.permission = 'default'
    expect(canNotify()).toBe(false)
  })

  it('已授权时返回 true', () => {
    stubNotification()
    expect(canNotify()).toBe(true)
  })
})

describe('isIosNonStandalone', () => {
  it('桌面浏览器返回 false', () => {
    stubNavigator({ userAgent: DESKTOP_UA, maxTouchPoints: 0 })
    expect(isIosNonStandalone()).toBe(false)
  })

  it('iPhone 未添加到主屏幕返回 true', () => {
    stubNavigator({ userAgent: IPHONE_UA, maxTouchPoints: 5 })
    expect(isIosNonStandalone()).toBe(true)
  })

  it('iPhone 已添加到主屏幕返回 false', () => {
    stubNavigator({ userAgent: IPHONE_UA, maxTouchPoints: 5, standalone: true })
    expect(isIosNonStandalone()).toBe(false)
  })

  it('iPadOS 桌面版 UA 靠触点数识别', () => {
    stubNavigator({ userAgent: IPAD_UA, maxTouchPoints: 2 })
    expect(isIosNonStandalone()).toBe(true)
    stubNavigator({ userAgent: IPAD_UA, maxTouchPoints: 0 })
    expect(isIosNonStandalone()).toBe(false)
  })
})

describe('getNotifyStatus', () => {
  it('不支持 Notification 时返回 unsupported', () => {
    stubNavigator({ userAgent: DESKTOP_UA, maxTouchPoints: 0 })
    expect(getNotifyStatus()).toBe('unsupported')
  })

  it('返回浏览器权限状态', () => {
    stubNavigator({ userAgent: DESKTOP_UA, maxTouchPoints: 0 })
    for (const permission of ['granted', 'default', 'denied'] as const) {
      stubNotification(permission)
      expect(getNotifyStatus()).toBe(permission)
    }
  })

  it('iOS 非独立模式优先返回 ios-install', () => {
    stubNavigator({ userAgent: IPHONE_UA, maxTouchPoints: 5 })
    stubNotification('granted')
    expect(getNotifyStatus()).toBe('ios-install')
  })

  it('iOS 独立模式按浏览器权限返回', () => {
    stubNavigator({ userAgent: IPHONE_UA, maxTouchPoints: 5, standalone: true })
    stubNotification('denied')
    expect(getNotifyStatus()).toBe('denied')
  })
})

describe('requestNotifyPermission', () => {
  it('default 时发起系统询问并返回结果', async () => {
    stubNavigator({ userAgent: DESKTOP_UA, maxTouchPoints: 0 })
    const notification = stubNotification('default')
    notification.requestPermission = vi.fn(async (): Promise<NotificationPermission> => 'granted')

    await expect(requestNotifyPermission()).resolves.toBe('granted')
    expect(notification.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('已授权 / 已拒绝时不重复询问', async () => {
    stubNavigator({ userAgent: DESKTOP_UA, maxTouchPoints: 0 })
    const notification = stubNotification('granted')
    await expect(requestNotifyPermission()).resolves.toBe('granted')
    expect(notification.requestPermission).not.toHaveBeenCalled()

    notification.permission = 'denied'
    await expect(requestNotifyPermission()).resolves.toBe('denied')
    expect(notification.requestPermission).not.toHaveBeenCalled()
  })

  it('不支持或 iOS 未安装时直接返回状态', async () => {
    stubNavigator({ userAgent: DESKTOP_UA, maxTouchPoints: 0 })
    await expect(requestNotifyPermission()).resolves.toBe('unsupported')

    stubNavigator({ userAgent: IPHONE_UA, maxTouchPoints: 5 })
    stubNotification('default')
    await expect(requestNotifyPermission()).resolves.toBe('ios-install')
  })
})

describe('showReminderNotification', () => {
  it('有活跃 Service Worker 时走 showNotification（移动端必需）', async () => {
    stubNotification()
    const showNotification = vi.fn().mockResolvedValue(undefined)
    stubServiceWorker({ active: {}, showNotification })

    await showReminderNotification(hit)

    expect(FakeNotification.instances).toHaveLength(0)
    expect(showNotification).toHaveBeenCalledTimes(1)
    const [title, options] = showNotification.mock.calls[0] as [string, NotificationOptions]
    expect(title).toBe(hit.title)
    expect(options.body).toBe(hit.body)
    expect(options.tag).toBe(hit.tag)
    expect(options.data).toEqual({ url: './' })
  })

  it('没有 Service Worker 时回退构造函数', async () => {
    stubNotification()
    stubServiceWorker(undefined)

    await showReminderNotification(hit)

    expect(FakeNotification.instances).toHaveLength(1)
    expect(FakeNotification.instances[0].title).toBe(hit.title)
    expect(FakeNotification.instances[0].options?.tag).toBe(hit.tag)
  })

  it('showNotification 失败时回退构造函数', async () => {
    stubNotification()
    stubServiceWorker({ active: {}, showNotification: vi.fn().mockRejectedValue(new Error('boom')) })

    await showReminderNotification(hit)

    expect(FakeNotification.instances).toHaveLength(1)
  })

  it('SW 与构造函数都不可用时不抛错', async () => {
    vi.stubGlobal(
      'Notification',
      class {
        static permission: NotificationPermission = 'granted'
        constructor() {
          throw new Error('Illegal constructor')
        }
      },
    )
    stubServiceWorker({ active: {}, showNotification: vi.fn().mockRejectedValue(new Error('boom')) })

    await expect(showReminderNotification(hit)).resolves.toBeUndefined()
  })
})

