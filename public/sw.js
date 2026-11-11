/* 简易 Service Worker：静态站点离线缓存（App Shell）
 * 规则：
 * - 导航（document/RSC）一律 network-first，失败再回退缓存首页
 * - 仅 cache-first 静态资源（/_next/static、图片、字体等）
 * - 不缓存 RSC/flight（text/x-component）与带 RSC 头的请求，避免劫持客户端路由
 */
const CACHE = 'babysitter-v4'
const SHELL = ['/', '/log/', '/stats/', '/settings/', '/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined),
  )
})

// 新版本由页面提示用户确认后，通过 postMessage 触发激活（对齐 Vue 版 prompt 策略）
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

/** 归一化 hash：空 / # / #/ 都视为首页，避免仅哈希差异触发多余导航 */
function normalizeHash(hash) {
  return hash === '' || hash === '#' || hash === '#/' ? '' : hash
}

/** 两个地址是否指向同一页面（忽略仅哈希差异） */
function samePage(a, b) {
  const x = new URL(a)
  const y = new URL(b)
  return (
    x.origin === y.origin &&
    x.pathname === y.pathname &&
    x.search === y.search &&
    normalizeHash(x.hash) === normalizeHash(y.hash)
  )
}

/* 提醒通知点击：聚焦已打开的窗口并跳到通知指定页面（缺省首页）；没有窗口则新开 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // 相对应用根路径解析，兼容部署在子路径
  const scope = new URL(self.registration.scope)
  const target = new URL(event.notification.data?.url || './', scope).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const client = clients.find((c) => {
        const url = new URL(c.url)
        return url.origin === scope.origin && url.pathname.startsWith(scope.pathname)
      })
      if (!client) return self.clients.openWindow(target)

      await client.focus()
      if (!samePage(client.url, target)) {
        try {
          await client.navigate(target)
        } catch {
          // 部分浏览器不允许 navigate，聚焦即可
        }
      }
      return undefined
    }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|gif|svg|webp|ico)$/.test(url.pathname)
  )
}

function isRscRequest(request, url) {
  if (request.headers.get('RSC') === '1') return true
  if (request.headers.get('Next-Router-State-Tree')) return true
  if (url.pathname.endsWith('.txt')) return true
  return false
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // 客户端路由 / RSC：交给浏览器，避免缓存污染
  if (isRscRequest(request, url)) return

  // 导航：network-first，离线回退 shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => {
          const cached = await caches.match(request)
          if (cached) return cached
          const shell = await caches.match('/')
          if (shell) return shell
          return Response.error()
        }),
    )
    return
  }

  // 静态资源：cache-first，miss 再网络
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  // 其余同源 GET：network-first（可写入缓存供离线）
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  )
})
