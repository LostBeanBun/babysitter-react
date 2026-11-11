/**
 * Service Worker `notificationclick` 测试（两端同一份）
 *
 * 用 node:vm 载入真实的 SW 源文件（Vue: public/push-sw.js，React: public/sw.js），
 * 只 mock `self` / `clients` / `registration.scope`，验证点击通知后的行为：
 * 聚焦同源窗口、按通知 data.url 导航到目标页（缺省首页）、无窗口时新开、跨源窗口不算命中。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const CANDIDATES = ['public/push-sw.js', 'public/sw.js']
const swPath = CANDIDATES.map((p) => join(process.cwd(), p)).find((p) => existsSync(p))
if (!swPath) throw new Error('Service Worker 源文件不存在（public/push-sw.js 或 public/sw.js）')
const source = readFileSync(swPath, 'utf8')

interface ClientMock {
  url: string
  focus: ReturnType<typeof vi.fn>
  navigate: ReturnType<typeof vi.fn>
}

function makeClient(url: string, navigateError = false): ClientMock {
  return {
    url,
    focus: vi.fn(async () => undefined),
    navigate: vi.fn(async () => {
      if (navigateError) throw new Error('navigate not allowed')
    }),
  }
}

function loadWorker(clients: ClientMock[], scope = 'https://example.com/app/') {
  const listeners: Record<string, (event: unknown) => void> = {}
  const openWindow = vi.fn(async () => null)
  const self = {
    location: new URL(scope),
    registration: { scope },
    clients: {
      matchAll: vi.fn(async () => clients),
      openWindow,
      claim: vi.fn(),
    },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners[type] = fn
    },
    skipWaiting: vi.fn(),
  }
  runInNewContext(source, { self, URL, console })
  return { listeners, openWindow }
}

async function click(
  worker: ReturnType<typeof loadWorker>,
  data: { url?: string } = { url: './' },
) {
  let pending: Promise<unknown> | undefined
  const event = {
    notification: { close: vi.fn(), data },
    waitUntil: (p: Promise<unknown>) => {
      pending = p
    },
  }
  worker.listeners.notificationclick?.(event)
  await pending
  return event
}

describe('Service Worker notificationclick', () => {
  it('聚焦已打开的同源窗口；已在首页时不重复导航', async () => {
    const client = makeClient('https://example.com/app/')
    const worker = loadWorker([client])

    const event = await click(worker)

    expect(event.notification.close).toHaveBeenCalledTimes(1)
    expect(client.focus).toHaveBeenCalledTimes(1)
    expect(client.navigate).not.toHaveBeenCalled()
    expect(worker.openWindow).not.toHaveBeenCalled()
  })

  it('窗口在其他页面时聚焦并导航回首页', async () => {
    const client = makeClient('https://example.com/app/stats/')
    const worker = loadWorker([client])

    await click(worker)

    expect(client.focus).toHaveBeenCalledTimes(1)
    expect(client.navigate).toHaveBeenCalledWith('https://example.com/app/')
    expect(worker.openWindow).not.toHaveBeenCalled()
  })

  it('首页带 #/ 哈希时同样视为首页', async () => {
    const client = makeClient('https://example.com/app/#/')
    const worker = loadWorker([client])

    await click(worker)

    expect(client.focus).toHaveBeenCalledTimes(1)
    expect(client.navigate).not.toHaveBeenCalled()
  })

  it('通知带落地页时导航到对应页面（hash 路由）', async () => {
    const client = makeClient('https://example.com/app/')
    const worker = loadWorker([client])

    await click(worker, { url: './#/log?timer=feeding' })

    expect(client.focus).toHaveBeenCalledTimes(1)
    expect(client.navigate).toHaveBeenCalledWith('https://example.com/app/#/log?timer=feeding')
  })

  it('通知带落地页时导航到对应页面（普通路径）', async () => {
    const client = makeClient('https://example.com/app/#/log')
    const worker = loadWorker([client])

    await click(worker, { url: './log/?timer=diaper' })

    expect(client.navigate).toHaveBeenCalledWith('https://example.com/app/log/?timer=diaper')
  })

  it('已停在目标页时不重复导航', async () => {
    const client = makeClient('https://example.com/app/#/log?timer=feeding')
    const worker = loadWorker([client])

    await click(worker, { url: './#/log?timer=feeding' })

    expect(client.focus).toHaveBeenCalledTimes(1)
    expect(client.navigate).not.toHaveBeenCalled()
  })

  it('没有同源窗口时新开应用首页', async () => {
    const worker = loadWorker([makeClient('https://other.example.com/app/')])

    await click(worker)

    expect(worker.openWindow).toHaveBeenCalledWith('https://example.com/app/')
  })

  it('子路径部署时按 registration.scope 解析相对地址', async () => {
    const worker = loadWorker([], 'https://example.com/babysitter/')

    await click(worker)

    expect(worker.openWindow).toHaveBeenCalledWith('https://example.com/babysitter/')
  })

  it('浏览器拒绝 navigate 时仍完成聚焦且不抛错', async () => {
    const client = makeClient('https://example.com/app/log/', true)
    const worker = loadWorker([client])

    await expect(click(worker)).resolves.toBeDefined()

    expect(client.focus).toHaveBeenCalledTimes(1)
    expect(client.navigate).toHaveBeenCalledTimes(1)
  })
})
