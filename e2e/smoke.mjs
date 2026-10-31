#!/usr/bin/env node
/**
 * 真实浏览器回归冒烟（两端仓库各持一份，逻辑一致）
 *
 * 覆盖 AGENTS.md「回归核查」要求的固定清单：
 *   今日照护卡布局（标题在图标下方、水平居中、不裁切）· 提醒横幅点击直达弹窗
 *   今日 / 记录 / 统计 / 设置 四页浅色 + 深色巡检 · 统计图表渲染
 *   prefers-reduced-motion: reduce 下布局与静态兜底 · 全程无 console / pageerror
 *
 * 用法（先起 dev server）：
 *   npm run smoke                      # 默认 APP=vue，http://127.0.0.1:5173
 *   APP=react npm run smoke            # http://localhost:3000
 *   BASE_URL=http://127.0.0.1:4173 APP=vue npm run smoke   # 也可指向 preview / 线上
 *   HEADED=1 npm run smoke             # 有头模式，便于观察
 *   CHROME_PATH=/path/to/chrome npm run smoke
 *
 * 截图与结果写入 e2e/.artifacts/<APP>/（已 gitignore）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP = (process.env.APP ?? 'vue').toLowerCase()
const IS_REACT = APP === 'react'
const BASE_URL = process.env.BASE_URL ?? (IS_REACT ? 'http://localhost:3000' : 'http://127.0.0.1:5173')
const OUT_DIR = join(ROOT, 'e2e', '.artifacts', APP)
const HEADED = process.env.HEADED === '1'
const ROUTES = IS_REACT
  ? { home: '/', log: '/log', stats: '/stats', settings: '/settings' }
  : { home: '/', log: '/#/log', stats: '/#/stats', settings: '/#/settings' }
/** 与 src/db 的 store 名称保持一致；缺失时会先让应用重建库 */
const STORES = [
  'babies',
  'feedings',
  'diapers',
  'pumpings',
  'sleeps',
  'growths',
  'solidFoods',
  'medications',
  'vaccinations',
  'temperatures',
  'milestones',
]
const CARE_SECTION = 'section[aria-labelledby="care-title"]'
const NOISE = [/WebSocket/i, /Download the React DevTools/i, /\[HMR\]/i, /\[Fast Refresh\]/i, /favicon/i, /preload.*was not used/i]

const results = []
const errors = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const localDate = (ts) => {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 种入一份可复现的数据：2 月龄宝宝 + 4h 前喂养 / 2h 前睡眠 / 4h 前尿布 + 跨零点睡眠（昨 20:00 → 今 01:00） */
async function seed(page, now) {
  await page.goto(`${BASE_URL}${ROUTES.home}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const missing = await page.evaluate(async (stores) => {
    const open = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('babysitter')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    const db = await open()
    const absent = stores.filter((name) => !db.objectStoreNames.contains(name))
    db.close()
    return absent
  }, STORES)

  if (missing.length) {
    // 应用还没建库（或库版本过旧）：删库后让应用按自己的 schema 重建
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.deleteDatabase('babysitter')
          req.onsuccess = req.onerror = req.onblocked = () => resolve()
        }),
    )
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
  }

  const birthDate = localDate(now - 60 * 86400_000)
  await page.evaluate(
    async ({ now, birthDate }) => {
      const open = () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('babysitter')
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
      const db = await open()
      const stores = Array.from(db.objectStoreNames)
      const tx = db.transaction(stores, 'readwrite')
      for (const name of stores) tx.objectStore(name).clear()
      const put = (name, value) => tx.objectStore(name).put(value)

      put('babies', {
        id: 1,
        name: '小糯米',
        gender: 'girl',
        birthDate,
        avatar: '👶',
        avatarColor: '#F2A28C',
        createdAt: now,
      })
      const feedStart = Math.floor((now - 4 * 3600_000) / 60000) * 60000
      put('feedings', {
        id: 1,
        babyId: 1,
        type: 'bottle_formula',
        startTime: feedStart,
        endTime: feedStart + 20 * 60_000,
        amount: 120,
        createdAt: now,
        updatedAt: now,
      })
      put('sleeps', {
        id: 1,
        babyId: 1,
        type: 'nap',
        startTime: now - 2 * 3600_000,
        endTime: now - 1.5 * 3600_000,
        duration: 30 * 60_000,
        createdAt: now,
        updatedAt: now,
      })
      // 跨零点睡眠：昨天 20:00 → 今天 01:00，今日部分应为 1 小时（1.9.4 回归点）
      const today = new Date(now)
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      put('sleeps', {
        id: 2,
        babyId: 1,
        type: 'nap',
        startTime: todayStart - 4 * 3600_000,
        endTime: todayStart + 3600_000,
        duration: 5 * 3600_000,
        createdAt: now,
        updatedAt: now,
      })
      put('diapers', { id: 1, babyId: 1, type: 'wet', time: now - 4 * 3600_000, createdAt: now, updatedAt: now })

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
      db.close()

      localStorage.setItem('babysitter.activeBabyId', '1')
      localStorage.setItem('babysitter.locale', 'zh-CN')
      localStorage.setItem('babysitter.theme', 'light')
      localStorage.setItem(
        'babysitter.reminders',
        JSON.stringify({
          feed: { enabled: true, intervalHours: 3 },
          sleep: { enabled: true, time: '20:00', intervalHours: 1 },
          medication: { enabled: false, intervalHours: 8 },
          vaccination: { enabled: false },
          diaper: { enabled: true, intervalHours: 3 },
          quiet: { enabled: false, start: '22:00', end: '07:00' },
        }),
      )
      localStorage.setItem('active_records', '[]')
    },
    { now, birthDate },
  )

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector(CARE_SECTION, { timeout: 20000 })
  await page.waitForTimeout(400)
}

/** 屏蔽 Next.js 开发浮层等与页面无关的遮罩 */
async function settle(page) {
  await page.waitForTimeout(400)
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
}

/** 照护卡三行的几何与样式：标题必须在图标下方且水平居中 */
async function readCareLayout(page) {
  return page.locator(CARE_SECTION).evaluate((section) => {
    const rows = Array.from(section.querySelectorAll('[class*="care-row"]'))
    return rows.map((row) => {
      const icon = row.querySelector('[class*="care-icon"]')
      const label = row.querySelector('[class*="care-label"]')
      const value = row.querySelector('[class*="care-value"]')
      const hint = row.querySelector('[class*="care-hint"]')
      if (!icon || !label || !value) return { label: label?.textContent?.trim() ?? '', incomplete: true }
      const ir = icon.getBoundingClientRect()
      const lr = label.getBoundingClientRect()
      const style = getComputedStyle(label)
      return {
        label: label.textContent.trim(),
        hint: hint?.textContent?.trim() ?? '',
        underIcon: lr.top >= ir.bottom - 1,
        centered: Math.abs(lr.left + lr.width / 2 - (ir.left + ir.width / 2)) <= 1.5,
        clipped: label.scrollWidth > label.clientWidth + 1,
        fontSize: style.fontSize,
        valueVisible: value.getBoundingClientRect().width > 0,
      }
    })
  })
}

/** 四页巡检：文案无 undefined / NaN / [object Object]，统计页切到「趋势」后应有图表 */
async function sweep(page, theme) {
  const pages = {}
  for (const [name, route] of Object.entries(ROUTES)) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' })
    await settle(page)
    // 哈希路由只改 hash 不会整页刷新，懒加载路由组件需要额外等待
    await page.waitForTimeout(600)
    if (name === 'stats') {
      const trend = page.getByText('趋势', { exact: true }).first()
      if (await trend.count()) {
        await trend.click()
        await page.waitForTimeout(1200)
      }
      await page
        .locator('canvas')
        .first()
        .waitFor({ state: 'attached', timeout: 8000 })
        .catch(() => {})
    }
    pages[name] = await page.evaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, ' ').trim()
      return {
        length: text.length,
        broken: /undefined|NaN|\[object Object\]/.test(text),
        canvases: document.querySelectorAll('canvas').length,
      }
    })
    await page.screenshot({ path: join(OUT_DIR, `${theme}-${name}.png`), fullPage: true })
  }
  return pages
}

async function closeDialog(page) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  if (await page.locator('[role="dialog"]').count()) {
    await page.goto(`${BASE_URL}${ROUTES.home}`, { waitUntil: 'networkidle' })
    await page.waitForSelector(CARE_SECTION, { timeout: 20000 })
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  const launch = existsSync(chromePath)
    ? { executablePath: chromePath, headless: !HEADED }
    : { channel: 'chrome', headless: !HEADED }
  const browser = await chromium.launch(launch)
  const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!NOISE.some((pattern) => pattern.test(text))) errors.push(`console: ${text}`)
  })

  const now = Date.now()
  console.log(`[smoke] ${APP} → ${BASE_URL}`)

  await seed(page, now)
  const rows = await readCareLayout(page)
  check('照护卡三行齐全', rows.length === 3, `实际 ${rows.length} 行：${rows.map((row) => row.label).join(' / ')}`)
  check('照护卡标题在图标下方', rows.length > 0 && rows.every((row) => row.underIcon))
  check('照护卡标题水平居中（±1.5px）', rows.length > 0 && rows.every((row) => row.centered))
  check('照护卡标题未被裁切', rows.length > 0 && rows.every((row) => !row.clipped))
  check('照护卡数值可见', rows.length > 0 && rows.every((row) => row.valueVisible), `标题字号 ${rows[0]?.fontSize ?? '-'}`)
  // 1.9.4 回归点：跨零点睡眠必须计入今日（昨 20:00 → 今 01:00 应算 1 小时，修复前为 0）
  const sleepRow = rows.find((row) => row.label.includes('睡眠'))
  check(
    '今日睡眠计入跨零点部分',
    Boolean(sleepRow && sleepRow.hint.includes('1小时')),
    sleepRow?.hint ?? '未找到睡眠行',
  )
  await page.screenshot({ path: join(OUT_DIR, 'light-home.png'), fullPage: true })

  // 提醒横幅 → 点击直达「添加记录」弹窗（1.9.0 回归点）
  const banners = page.locator('[class*="reminder-banner"]')
  const bannerCount = await banners.count()
  check('首页提醒横幅已渲染', bannerCount > 0, `${bannerCount} 条`)
  let opened = 0
  for (let i = 0; i < Math.min(bannerCount, 3); i++) {
    const banner = banners.nth(i)
    if (!(await banner.isVisible())) continue
    await banner.click()
    await page.waitForTimeout(500)
    if (await page.locator('[role="dialog"]').count()) opened++
    await closeDialog(page)
  }
  check('横幅点击直达表单', bannerCount === 0 || opened > 0, `${opened}/${Math.min(bannerCount, 3)} 条弹出弹窗`)

  // 深色
  await page.evaluate(() => localStorage.setItem('babysitter.theme', 'dark'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector(CARE_SECTION, { timeout: 20000 })
  await settle(page)
  const darkRows = await readCareLayout(page)
  check('深色下照护卡布局不变', darkRows.length === 3 && darkRows.every((row) => row.underIcon && row.centered))
  const darkPages = await sweep(page, 'dark')

  // 浅色四页
  await page.evaluate(() => localStorage.setItem('babysitter.theme', 'light'))
  await page.goto(`${BASE_URL}${ROUTES.home}`, { waitUntil: 'networkidle' })
  await page.waitForSelector(CARE_SECTION, { timeout: 20000 })
  const lightPages = await sweep(page, 'light')

  for (const [theme, pages] of [
    ['浅色', lightPages],
    ['深色', darkPages],
  ]) {
    const broken = Object.entries(pages).filter(([, info]) => info.broken || info.length < 20)
    check(`${theme}四页文案正常`, broken.length === 0, broken.map(([name]) => name).join(' / ') || '今日 / 记录 / 统计 / 设置')
    check(`${theme}统计图表已渲染`, pages.stats.canvases > 0, `${pages.stats.canvases} 个 canvas`)
  }

  // 小结跟随时间范围（1.10.0 回归点）：默认近 7 天，切换范围后标题同步变化
  await page.goto(`${BASE_URL}${ROUTES.stats}`, { waitUntil: 'networkidle' })
  await settle(page)
  await page.waitForTimeout(600)
  const defaultRange = await page.locator('#range-select').inputValue()
  check('统计页默认时间范围为近7天', defaultRange === '7d', defaultRange)
  const readInsightTitle = async () => {
    const el = page.locator('[class*="insight-title"]').first()
    if (!(await el.count())) return ''
    return (await el.innerText()).replace(/\s+/g, ' ').trim()
  }
  const weekTitle = await readInsightTitle()
  check('小结标题跟随默认范围（近7天）', weekTitle.includes('近7天'), weekTitle)
  await page.selectOption('#range-select', '30d')
  await page.waitForTimeout(800)
  const monthTitle = await readInsightTitle()
  check('切换范围后小结跟随变更（近30天）', monthTitle.includes('近30天'), monthTitle)
  const insightItems = await page.locator('[class*="insight-item"]').allInnerTexts()
  const staleItem = insightItems.find((text) => /前\s*7\s*天/.test(text))
  check(
    '小结条目不再写死「前 7 天」',
    insightItems.length > 0 && !staleItem,
    staleItem || insightItems[0]?.trim() || '无条目',
  )
  await page.screenshot({ path: join(OUT_DIR, 'light-stats-30d.png'), fullPage: true })

  // 备份提醒可关闭且不立刻重现（1.11.0 回归点）：关闭后静默 1 天，设置页可永久关闭
  await page.evaluate(() => {
    localStorage.removeItem('babysitter.backupSnoozeUntil')
    localStorage.removeItem('babysitter.backupRemindEnabled')
    localStorage.removeItem('babysitter.lastBackupAt')
  })
  await page.goto(`${BASE_URL}${ROUTES.home}`, { waitUntil: 'networkidle' })
  await page.waitForSelector(CARE_SECTION, { timeout: 20000 })
  await settle(page)
  const backupBanner = page.locator('[class*="reminder-banner--backup"]').first()
  check('备份提醒条默认显示', await backupBanner.isVisible())
  await backupBanner.locator('[class*="rb-close"]').click()
  await page.waitForTimeout(500)
  check('关闭后备份提醒条消失', !(await backupBanner.isVisible()))
  const snoozeUntil = await page.evaluate(() => Number(localStorage.getItem('babysitter.backupSnoozeUntil')))
  check(
    '关闭写入 1 天静默截止时间',
    snoozeUntil > Date.now() + 20 * 3600_000,
    snoozeUntil ? new Date(snoozeUntil).toLocaleString() : '未写入',
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector(CARE_SECTION, { timeout: 20000 })
  await settle(page)
  check('刷新后备份提醒仍不出现', !(await backupBanner.isVisible()))

  // 设置页「首页备份提醒」开关：关闭后永久不提示，重新打开恢复
  await page.goto(`${BASE_URL}${ROUTES.settings}`, { waitUntil: 'networkidle' })
  await settle(page)
  const backupSwitch = page.locator('[class*="backup-remind"] [role="switch"]').first()
  check('设置页有「首页备份提醒」开关', (await backupSwitch.count()) === 1)
  await backupSwitch.click()
  await page.waitForTimeout(300)
  const remindOff = await page.evaluate(() => localStorage.getItem('babysitter.backupRemindEnabled'))
  check('关闭开关写入永久关闭', remindOff === '0', String(remindOff))
  // 清掉静默期，单独验证开关本身生效
  await page.evaluate(() => localStorage.removeItem('babysitter.backupSnoozeUntil'))
  await page.goto(`${BASE_URL}${ROUTES.home}`, { waitUntil: 'networkidle' })
  await page.waitForSelector(CARE_SECTION, { timeout: 20000 })
  await settle(page)
  check('永久关闭后不再提示备份', !(await backupBanner.isVisible()))
  await page.goto(`${BASE_URL}${ROUTES.settings}`, { waitUntil: 'networkidle' })
  await settle(page)
  await page.locator('[class*="backup-remind"] [role="switch"]').first().click()
  await page.waitForTimeout(300)
  const remindOn = await page.evaluate(() => localStorage.getItem('babysitter.backupRemindEnabled'))
  check('重新打开开关后恢复提醒', remindOn === '1', String(remindOn))
  await page.goto(`${BASE_URL}${ROUTES.home}`, { waitUntil: 'networkidle' })
  await page.waitForSelector(CARE_SECTION, { timeout: 20000 })
  await settle(page)
  check('重新打开后备份提醒条恢复显示', await backupBanner.isVisible())

  // CSV 导出含宝宝信息行与头像列（1.12.0 回归点）
  await page.goto(`${BASE_URL}${ROUTES.settings}`, { waitUntil: 'networkidle' })
  await settle(page)
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: /导出全部宝宝记录/ }).click(),
  ])
  const csvText = readFileSync(await csvDownload.path(), 'utf8').replace(/^\ufeff/, '')
  const csvLines = csvText.split('\r\n')
  check(
    'CSV 表头含头像 / 头像色列',
    /头像/.test(csvLines[0]) && /头像色/.test(csvLines[0]),
    csvLines[0],
  )
  check(
    'CSV 含宝宝信息行（姓名 + 出生日期）',
    csvLines[1].includes('宝宝') && csvLines[1].includes('小糯米'),
    csvLines[1],
  )

  // prefers-reduced-motion: reduce —— 动画被压到 0.01ms 时布局仍成立
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${BASE_URL}${ROUTES.home}`, { waitUntil: 'networkidle' })
  await page.waitForSelector(CARE_SECTION, { timeout: 20000 })
  await settle(page)
  const reduceRows = await readCareLayout(page)
  const transition = await page
    .locator(`${CARE_SECTION} [class*="care-row"]`)
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration)
  check('reduce 下照护卡布局不变', reduceRows.length === 3 && reduceRows.every((row) => row.underIcon && row.centered))
  check('reduce 下动画被压缩', /^(0s|0\.0*1m?s|1e-05s)$/.test(transition.replace('0.00001s', '1e-05s')), transition)
  await page.screenshot({ path: join(OUT_DIR, 'reduce-home.png'), fullPage: true })
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  check('全程无 console / pageerror', errors.length === 0, errors.slice(0, 3).join(' | '))

  await browser.close()

  const failed = results.filter((result) => !result.pass)
  writeFileSync(
    join(OUT_DIR, 'results.json'),
    JSON.stringify({ app: APP, baseUrl: BASE_URL, at: new Date().toISOString(), results, errors }, null, 2),
  )
  console.log(`\n[smoke] ${results.length - failed.length}/${results.length} 通过，截图见 ${OUT_DIR}`)
  if (failed.length) {
    console.error(`[smoke] 失败：${failed.map((result) => result.name).join('、')}`)
    process.exit(1)
  }
  console.log('[smoke] SMOKE-OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
