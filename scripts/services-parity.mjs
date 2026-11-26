#!/usr/bin/env node
/**
 * 双端共享代码一致性校验（两端仓库各持一份，逻辑一致）
 *
 * 对比当前仓库与兄弟仓库（默认 ../babysitter / ../babysitter-next，可用 PARITY_REPO 覆盖）：
 *   - identical 列表中的文件必须逐字节一致（两端同一份实现）
 *   - allowed 列表中的文件允许存在差异，但必须写明原因；一旦收敛为一致，
 *     该登记会报「已过期」，提醒把它移到 identical（防止假差异长期挂账）
 *   - src/services/*.ts 必须出现在上述任一列表中（新增服务需显式分类）
 *
 * 兄弟仓库不存在时跳过（单仓库 clone / CI 不阻塞）。
 * 用法：npm run services:parity（已挂在 npm run lint 末尾）
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST_PATH = join(ROOT, 'scripts', 'services-parity.json')
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

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`缺少 ${MANIFEST_PATH}`)
  }
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const identical = Array.isArray(raw.identical) ? raw.identical : []
  const allowed = Array.isArray(raw.allowed) ? raw.allowed : []
  return { identical, allowed }
}

/** 两端文件差异行数（仅用于报告） */
function diffLines(a, b) {
  const left = a.split('\n')
  const right = b.split('\n')
  const set = new Set(right)
  const removed = left.filter((line) => !set.has(line)).length
  const setLeft = new Set(left)
  const added = right.filter((line) => !setLeft.has(line)).length
  return added + removed
}

function main() {
  const side = currentSide()
  const sibling = siblingRoot()
  console.log('[services] 校验双端共享代码一致性')

  if (!side) {
    console.log('  · 仓库目录名不是 babysitter / babysitter-next，跳过双端校验（可用 PARITY_REPO 指定兄弟仓库）')
    console.log('\nSERVICES-PARITY-SKIPPED\n')
    return
  }
  if (!sibling || !existsSync(join(sibling, 'package.json'))) {
    console.log(`  · 未找到兄弟仓库（${sibling || '未知路径'}），跳过双端校验`)
    console.log('\nSERVICES-PARITY-SKIPPED\n')
    return
  }

  const { identical, allowed } = readManifest()
  const otherSide = side === 'vue' ? 'react' : 'vue'
  ok(`对比 ${basename(ROOT)}（${side}）↔ ${basename(sibling)}（${otherSide}）`)

  const covered = new Set()

  // 1. 必须逐字节一致的文件
  let sameCount = 0
  for (const file of identical) {
    covered.add(file)
    const mine = join(ROOT, file)
    const theirs = join(sibling, file)
    if (!existsSync(mine)) {
      bad(`${file} 在 ${side} 端缺失（identical 列表登记）`)
      continue
    }
    if (!existsSync(theirs)) {
      bad(`${file} 在 ${otherSide} 端缺失（identical 列表登记）`)
      continue
    }
    const a = readFileSync(mine, 'utf8')
    const b = readFileSync(theirs, 'utf8')
    if (a === b) {
      sameCount++
      continue
    }
    bad(`${file} 两端不一致（约 ${diffLines(a, b)} 行差异）—— 共享实现请同步两端`)
  }
  if (sameCount === identical.length && identical.length > 0) ok(`${identical.length} 个共享文件逐字节一致`)

  // 2. 已登记允许差异的文件
  let allowedCount = 0
  for (const item of allowed) {
    const file = item.file
    if (!file) {
      bad('scripts/services-parity.json 的 allowed 条目缺少 file')
      continue
    }
    covered.add(file)
    if (!item.reason || !String(item.reason).trim()) {
      bad(`${file} 的 allowed 条目缺少 reason（需说明为何两端不同）`)
    }
    const mine = join(ROOT, file)
    const theirs = join(sibling, file)
    if (!existsSync(mine) || !existsSync(theirs)) {
      bad(`${file} 在某一端缺失，但被登记为允许差异（请改为 identical 或删除登记）`)
      continue
    }
    const a = readFileSync(mine, 'utf8')
    const b = readFileSync(theirs, 'utf8')
    if (a === b) {
      bad(`${file} 两端已一致，allowed 登记过期 —— 请移到 identical 列表并删除该登记`)
      continue
    }
    allowedCount++
  }
  if (allowedCount > 0) ok(`${allowedCount} 个文件存在已登记差异（见 services-parity.json 的 reason）`)

  // 3. 服务层新增文件必须分类
  const servicesDir = join(ROOT, 'src', 'services')
  if (existsSync(servicesDir)) {
    for (const name of readdirSync(servicesDir).sort()) {
      if (!name.endsWith('.ts')) continue
      const file = `src/services/${name}`
      if (covered.has(file)) continue
      // 只在本端存在的文件无需分类（另一端没有可比的实现）
      if (!existsSync(join(sibling, file))) continue
      bad(`${file} 未登记：请在 scripts/services-parity.json 的 identical / allowed 中选择其一`)
    }
  }

  if (problems.length) {
    console.error(
      `\n双端共享代码校验未通过（${problems.length} 项）—— 共享实现请两端同步；确需差异请在 scripts/services-parity.json 登记原因`,
    )
    process.exit(1)
  }
  console.log('\nSERVICES-PARITY-OK\n')
}

main()
