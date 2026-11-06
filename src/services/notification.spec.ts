import { afterEach, describe, expect, it, vi } from 'vitest'
import { canNotify, showReminderNotification } from './notification'

const hit = { title: '该喂奶了', body: '距上次喂奶已 4 小时', tag: 'feed' }

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static instances: FakeNotification[] = []
  onclick: (() => void) | null = null
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this)
  }
  close() {}
}

function stubNotification() {
  FakeNotification.permission = 'granted'
  FakeNotification.instances = []
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

