#!/usr/bin/env node
/**
 * 双端文案一致性校验（两端仓库各持一份，逻辑一致）
 *
 * 对比当前仓库与兄弟仓库（默认 ../babysitter / ../babysitter-next，可用 PARITY_REPO 覆盖）：
 *   - 同名 key 的中英文文案必须逐字一致
 *   - key 只存在于单侧时，必须登记在 scripts/i18n-parity.allow.json（附原因）
 *   - 两端的 package.json 版本号必须相同
 *
 * 兄弟仓库不存在时跳过（单仓库 clone / CI 不阻塞）。
 * 用法：npm run i18n:parity（已挂在 npm run lint 末尾）
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ALLOW_PATH = join(ROOT, 'scripts', 'i18n-parity.allow.json')
const LOCALES = ['zh-CN', 'en-US']
const SIDE_BY_DIR = { babysitter: 'vue', 'babysitter-next': 'react' }

const problems = []
const ok = (msg) => console.log(`  ✓ ${msg}`)
const bad = (msg) => {
  problems.push(msg)
  console.log(`  ✗ ${msg}`)
}

/** 当前仓库属于哪一端（vue / react），无法判断时返回空串 */
function currentSide() {
  return SIDE_BY_DIR[basename(ROOT)] ?? ''
}

/** 兄弟仓库根目录：环境变量优先，其次按命名约定推断 */
function siblingRoot() {
  if (process.env.PARITY_REPO) return process.env.PARITY_REPO
  const side = currentSide()
  const name = side === 'vue' ? 'babysitter-next' : side === 'react' ? 'babysitter' : ''
  return name ? join(ROOT, '..', name) : ''
}

/** 读取 locale 文件里的纯字面量对象（去掉注释 / export default / as const） */
function loadLocale(file) {
  const source = readFileSync(file, 'utf8')
    .replace(/^\/\*\*[\s\S]*?\*\/\s*/, '')
    .replace('export default', 'return')
    .replace(/\}\s*as const\s*$/, '}')
  try {
    return new Function(source)()
  } catch (error) {
    throw new Error(`${file} 不是纯字面量对象，无法解析：${error.message}`)
  }
}

/** 展平成 a.b.c → 文案 */
function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') flatten(value, path, out)
    else out[path] = value
  }
  return out
}

function readAllow() {
  if (!existsSync(ALLOW_PATH)) return []
  const raw = JSON.parse(readFileSync(ALLOW_PATH, 'utf8'))
  return Array.isArray(raw.allow) ? raw.allow : []
}

function readVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? ''
  } catch {
    return ''
  }
}

function main() {
  const side = currentSide()
  const sibling = siblingRoot()
  console.log('[i18n] 校验双端文案一致性')

  if (!side) {
    console.log('  · 仓库目录名不是 babysitter / babysitter-next，跳过双端校验（可用 PARITY_REPO 指定兄弟仓库）')
    console.log('\nI18N-PARITY-SKIPPED\n')
    return
  }
  if (!sibling || !existsSync(join(sibling, 'package.json'))) {
    console.log(`  · 未找到兄弟仓库（${sibling || '未知路径'}），跳过双端校验`)
    console.log('\nI18N-PARITY-SKIPPED\n')
    return
  }

  const otherSide = side === 'vue' ? 'react' : 'vue'
  ok(`对比 ${basename(ROOT)}（${side}）↔ ${basename(sibling)}（${otherSide}）`)

  const version = readVersion(ROOT)
  const otherVersion = readVersion(sibling)
  if (version === otherVersion) ok(`两端版本号一致（${version}）`)
  else bad(`版本号不一致：${side} ${version} / ${otherSide} ${otherVersion}`)

  const allow = readAllow()
  const allowKey = (key, onlySide) => allow.some((item) => item.side === onlySide && item.keys?.includes(key))
  const usedAllow = new Set()

  for (const locale of LOCALES) {
    const mine = flatten(loadLocale(join(ROOT, 'src/i18n/locales', `${locale}.ts`)))
    const theirs = flatten(loadLocale(join(sibling, 'src/i18n/locales', `${locale}.ts`)))
    const keys = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].sort()

    const diffs = []
    const onlyMine = []
    const onlyTheirs = []
    for (const key of keys) {
      const a = mine[key]
      const b = theirs[key]
      if (a === undefined) onlyTheirs.push(key)
      else if (b === undefined) onlyMine.push(key)
      else if (a !== b) diffs.push({ key, mine: a, theirs: b })
    }

    for (const key of onlyMine) {
      if (allowKey(key, side)) usedAllow.add(`${side}:${key}`)
      else bad(`${locale} 只有 ${side} 端有 ${key}`)
    }
    for (const key of onlyTheirs) {
      if (allowKey(key, otherSide)) usedAllow.add(`${otherSide}:${key}`)
      else bad(`${locale} 只有 ${otherSide} 端有 ${key}`)
    }
    for (const { key, mine: a, theirs: b } of diffs) {
      bad(`${locale} 文案不一致 ${key}\n      ${side}  : ${JSON.stringify(a)}\n      ${otherSide}: ${JSON.stringify(b)}`)
    }
    const allowed =
      onlyMine.filter((key) => allowKey(key, side)).length + onlyTheirs.filter((key) => allowKey(key, otherSide)).length
    if (!diffs.length && !onlyMine.length && !onlyTheirs.length) ok(`${locale} 文案与 key 完全一致（${keys.length} 项）`)
    else if (!diffs.length && allowed === onlyMine.length + onlyTheirs.length)
      ok(`${locale} 文案一致（${keys.length} 项，${allowed} 项 key 差异已登记）`)
  }

  for (const item of allow) {
    for (const key of item.keys ?? []) {
      if (!usedAllow.has(`${item.side}:${key}`))
        bad(`scripts/i18n-parity.allow.json 的登记已过期（${item.side} ${key} 两端已无差异），请删除`)
    }
  }

  if (problems.length) {
    console.error(
      `\n双端文案校验未通过（${problems.length} 项）—— 改文案时请两端同步，差异原因登记在 scripts/i18n-parity.allow.json`,
    )
    process.exit(1)
  }
  console.log('\nI18N-PARITY-OK\n')
}

main()
