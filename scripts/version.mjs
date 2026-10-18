#!/usr/bin/env node
/**
 * 版本号工具（两端仓库各持一份，逻辑一致）
 *
 * 唯一来源：package.json#version
 * 展示位置：设置 → 关于（构建时注入 src/constants/version.ts 的 APP_VERSION）
 * 规则：任何改动都必须升版，并在 CHANGELOG.md 顶部登记该版本
 *   patch  修复 bug / 文案 / 样式 / 重构 / 性能 / 依赖升级等向后兼容的小改动
 *   minor  新增功能、界面改版（向后兼容）
 *   major  不兼容变更（IndexedDB 结构、导入导出格式、需要用户手动迁移）
 *
 * 打标签约定：只有功能级更新（minor / major）打 vX.Y.Z 发布标签，patch 不打；
 * 级别由「当前版本 vs 最近的标签」自动判定，因此不需要人工声明，也不会给每个版本都打标签。
 *
 * 用法：
 *   node scripts/version.mjs check          校验（npm run version:check，已挂在 lint 末尾）
 *   node scripts/version.mjs bump <level>   升版 + 生成 CHANGELOG 骨架（npm run version:bump）
 *   node scripts/version.mjs tag            给功能级版本打标签并推送（npm run version:tag）
 *     可选：--force 允许 patch 级/覆盖已有标签 · --no-push 只打本地标签 · --remote <url> 指定推送目标
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PKG_PATH = join(ROOT, 'package.json')
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md')
/** 设置页「关于」的版本文案：必须用 {version} 占位，不得再硬编码版本号 */
const LOCALES = ['src/i18n/locales/zh-CN.ts', 'src/i18n/locales/en-US.ts']
/** 与版本号无关、不影响升版判断的文件 */
const IGNORED = new Set(['CHANGELOG.md', 'package-lock.json', 'next-env.d.ts'])
const SEMVER = /^\d+\.\d+\.\d+$/
const LEVELS = ['patch', 'minor', 'major']
/** 只有功能级更新打 vX.Y.Z 发布标签；patch 修复不打 */
const TAGGED_LEVELS = new Set(['minor', 'major'])
const CHANGELOG_HEADER = `# 更新日志

版本号唯一来源为 \`package.json\`（两端仓库保持同值），每次改动都必须升版并在此登记。
规则：\`major\` 不兼容变更 · \`minor\` 新功能 · \`patch\` 修复与内部调整。
`

const problems = []
const ok = (msg) => console.log(`  ✓ ${msg}`)
const bad = (msg) => {
  problems.push(msg)
  console.log(`  ✗ ${msg}`)
}

const readPkg = () => JSON.parse(readFileSync(PKG_PATH, 'utf8'))

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function isGitRepo() {
  try {
    return git(['rev-parse', '--is-inside-work-tree']) === 'true'
  } catch {
    return false
  }
}

/** 工作区（含已暂存/未暂存/新增未跟踪）与版本号有关的改动文件 */
function changedFiles() {
  try {
    const tracked = git(['diff', 'HEAD', '--name-only']).split('\n')
    const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n')
    return [...new Set([...tracked, ...untracked])].map((f) => f.trim()).filter((f) => f && !IGNORED.has(f))
  } catch {
    return []
  }
}

/** HEAD 提交里的版本号（无 HEAD / 无 package.json 时返回空串） */
function headVersion() {
  try {
    return JSON.parse(git(['show', 'HEAD:package.json'])).version ?? ''
  } catch {
    return ''
  }
}

/** 已跟踪文件的未提交改动（忽略与版本无关的文件） */
function dirtyTrackedFiles() {
  try {
    return git(['diff', 'HEAD', '--name-only'])
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f && !IGNORED.has(f))
  } catch {
    return []
  }
}

/** 解析 x.y.z → [x, y, z]（非法返回 null） */
function parseSemver(value) {
  const matched = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value).trim())
  return matched ? matched.slice(1).map(Number) : null
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/** 当前版本相对上一版本的级别：major / minor / patch */
function bumpLevel(prev, current) {
  if (prev[0] !== current[0]) return 'major'
  if (prev[1] !== current[1]) return 'minor'
  return 'patch'
}

/** HEAD 可达的 vX.Y.Z 标签（语义化升序，最后一个即上一次发布） */
function releaseTags() {
  if (!isGitRepo()) return []
  return git(['tag', '-l', 'v*', '--merged', 'HEAD'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((tag) => ({ tag, ver: parseSemver(tag.slice(1)) }))
    .filter((item) => item.ver)
    .sort((a, b) => compareSemver(a.ver, b.ver))
}

function hasTag(name) {
  try {
    git(['rev-parse', '-q', '--verify', `refs/tags/${name}`])
    return true
  } catch {
    return false
  }
}

/** CHANGELOG 里该版本条目的首条说明，用作标签附注（没有则返回空串） */
function changelogSummary(version) {
  if (!existsSync(CHANGELOG_PATH)) return ''
  const text = readFileSync(CHANGELOG_PATH, 'utf8')
  const at = text.search(new RegExp(`^##\\s*\\[${version.replace(/\./g, '\\.')}\\]`, 'm'))
  if (at < 0) return ''
  for (const line of text.slice(at).split('\n').slice(1)) {
    if (/^##\s*\[/.test(line)) break
    const bullet = line.match(/^\s*[-*]\s+(.+)$/)
    const summary = bullet?.[1].trim()
    if (!summary) continue
    if (summary.length <= 72) return summary
    const head = summary.split(/[；。]/)[0].trim()
    return head.length <= 72 ? head : `${head.slice(0, 71)}…`
  }
  return ''
}

/**
 * 标签推送目标：--remote 参数 > 环境变量 VERSION_TAG_REMOTE > origin
 * GitHub 的 HTTPS 地址自动改写为 SSH（本项目 HTTPS 推送不稳定，SSH 是既有惯例）
 */
function pushTarget(explicit) {
  if (explicit) return explicit
  if (process.env.VERSION_TAG_REMOTE) return process.env.VERSION_TAG_REMOTE
  let url = ''
  try {
    url = git(['remote', 'get-url', 'origin'])
  } catch {
    return 'origin'
  }
  const ssh = url.replace(/^https:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?$/, 'git@$1:$2.git')
  if (ssh !== url && /^https:\/\/[^/]*github\.com\//.test(url)) return ssh
  return url || 'origin'
}

function check() {
  console.log('[version] 校验版本号（唯一来源 package.json#version）')
  const { version } = readPkg()

  if (SEMVER.test(version)) ok(`package.json 版本号 ${version}`)
  else bad(`package.json 的 version「${version}」不是 x.y.z 形式`)

  if (!existsSync(CHANGELOG_PATH)) {
    bad('缺少 CHANGELOG.md（每次改动都要登记版本）')
  } else {
    const top = readFileSync(CHANGELOG_PATH, 'utf8').match(/^##\s*\[([^\]]+)\]/m)?.[1]
    if (top === version) ok(`CHANGELOG.md 顶部条目 ${version}`)
    else bad(`CHANGELOG.md 顶部条目是「${top ?? '无'}」，与 package.json 的 ${version} 不一致`)
  }

  for (const file of LOCALES) {
    const full = join(ROOT, file)
    const line = existsSync(full)
      ? (readFileSync(full, 'utf8').split('\n').find((l) => l.includes('aboutMuted:')) ?? '')
      : ''
    if (!line.includes('{version}')) bad(`${file} 的 settings.aboutMuted 未使用 {version} 占位`)
    else if (/v\d+\.\d+\.\d+/.test(line)) bad(`${file} 的 settings.aboutMuted 硬编码了版本号（改用 {version} + APP_VERSION）`)
    else ok(`${file} 的版本文案使用 {version} 占位`)
  }

  if (!isGitRepo()) {
    console.log('  · 非 git 仓库或缺少 git，跳过「改动是否升版」检查')
  } else {
    const files = changedFiles()
    if (!files.length) {
      ok('工作区无未提交改动，无需升版')
    } else {
      const before = headVersion()
      const sample = `${files.slice(0, 3).join('、')}${files.length > 3 ? ' 等' : ''}`
      if (!before) ok(`工作区 ${files.length} 个文件有改动（${sample}），HEAD 无 package.json，跳过比对`)
      else if (before === version)
        bad(`工作区有 ${files.length} 个文件改动（${sample}），但版本号仍是 ${version}；请运行 npm run version:bump patch|minor|major`)
      else ok(`工作区 ${files.length} 个文件的改动已升版 ${before} → ${version}`)
    }
  }

  if (problems.length) {
    console.error(`\n版本号校验未通过（${problems.length} 项）—— 规则见 README「🏷 版本号」`)
    process.exit(1)
  }

  if (isGitRepo() && SEMVER.test(version)) {
    const prev = releaseTags().at(-1)
    if (prev && TAGGED_LEVELS.has(bumpLevel(prev.ver, version.split('.').map(Number))) && !hasTag(`v${version}`)) {
      console.log(`  · 提示：${version} 是功能级版本，提交后运行 npm run version:tag 打发布标签（上一标签 ${prev.tag}）`)
    }
  }

  console.log('\nVERSION-CHECK-OK\n')
}

function tag(args) {
  const force = args.includes('--force')
  const push = !args.includes('--no-push')
  const dryRun = args.includes('--dry-run')
  const remoteAt = args.indexOf('--remote')
  const explicitRemote = remoteAt >= 0 ? args[remoteAt + 1] : ''

  const fail = (msg) => {
    console.error(`\n[version] 打标签失败：${msg}`)
    process.exit(1)
  }

  const { version } = readPkg()
  const current = parseSemver(version)
  if (!current) fail(`package.json 的 version「${version}」不是 x.y.z 形式`)
  const name = `v${version}`

  const head = headVersion()
  if (!head) fail('HEAD 里没有 package.json，无法打标签')
  else if (head !== version) fail(`HEAD 里的版本号是 ${head}，与工作区的 ${version} 不一致；先提交版本号改动，再打标签`)

  const dirty = dirtyTrackedFiles()
  if (dirty.length && !force) {
    const sample = `${dirty.slice(0, 3).join('、')}${dirty.length > 3 ? ' 等' : ''}`
    fail(`还有 ${dirty.length} 个文件未提交（${sample}）；提交后再打标签，或加 --force`)
  }

  const prev = releaseTags().at(-1)
  const level = prev ? bumpLevel(prev.ver, current) : 'major'
  if (prev && compareSemver(current, prev.ver) <= 0) fail(`当前版本 ${version} 不高于最近的标签 ${prev.tag}，请先升版`)
  if (!TAGGED_LEVELS.has(level) && !force) {
    fail(`相对 ${prev.tag} 只是 ${level} 级改动，按约定只有功能级更新（minor / major）打标签；确需打标签请加 --force`)
  }
  if (hasTag(name) && !force) fail(`标签 ${name} 已存在（要改指向当前提交请加 --force）`)

  const summary = changelogSummary(version)
  const message = summary ? `${name} ${summary}` : name
  const target = pushTarget(explicitRemote)

  if (dryRun) {
    console.log(`[version] 将执行：git tag -a ${name} -m "${message}"${force ? ' -f' : ''}`)
    console.log(`[version] 将执行：${push ? `git push ${target} ${name}` : '（--no-push，不推送）'}`)
    return
  }

  const tagArgs = ['tag', '-a', name, '-m', message]
  if (force) tagArgs.push('-f')
  try {
    execFileSync('git', tagArgs, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    fail((error.stderr ?? '').toString().trim() || error.message)
  }
  console.log(`[version] 已打标签 ${name}（${level} 级，上一标签 ${prev ? prev.tag : '无'}）：${message}`)

  if (!push) {
    console.log(`  · 已跳过推送，需要时执行：git push ${target} ${name}`)
    return
  }
  try {
    execFileSync('git', ['push', target, name], {
      cwd: ROOT,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  } catch (error) {
    console.error(`  ✗ 推送失败：${(error.stderr ?? '').toString().trim() || error.message}`)
    console.error(`    标签已在本地创建，可稍后手动推送：git push ${target} ${name}`)
    process.exit(1)
  }
  console.log(`  ✓ 已推送到 ${target}`)
  console.log('\nVERSION-TAG-OK\n')
}

function bump(level) {
  if (!LEVELS.includes(level)) {
    console.error(`用法：node scripts/version.mjs bump ${LEVELS.join('|')}`)
    process.exit(1)
  }
  const pkg = readPkg()
  const current = pkg.version
  const [major, minor, patch] = current.split('.').map(Number)
  const next =
    level === 'major'
      ? `${major + 1}.0.0`
      : level === 'minor'
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`

  pkg.version = next
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')

  const date = new Date().toISOString().slice(0, 10)
  const section = `## [${next}] - ${date}\n\n### 新增\n\n- \n\n### 修复\n\n- \n`
  if (!existsSync(CHANGELOG_PATH)) {
    writeFileSync(CHANGELOG_PATH, `${CHANGELOG_HEADER}\n${section}`, 'utf8')
  } else {
    const changelog = readFileSync(CHANGELOG_PATH, 'utf8')
    const at = changelog.search(/^##\s*\[/m)
    const updated = at >= 0 ? `${changelog.slice(0, at)}${section}\n${changelog.slice(at)}` : `${changelog.trimEnd()}\n\n${section}`
    writeFileSync(CHANGELOG_PATH, updated, 'utf8')
  }

  console.log(`[version] ${current} → ${next}（${level}）`)
  console.log('  请补全 CHANGELOG.md 顶部条目，然后运行 npm run version:check')
  console.log(
    TAGGED_LEVELS.has(level)
      ? `  本次是功能级更新（${level}）：提交推送后运行 npm run version:tag 打发布标签`
      : '  本次是 patch 级更新：按约定不打发布标签（功能级更新才打）',
  )
}

const [command, ...args] = process.argv.slice(2)
if (command === 'check') check()
else if (command === 'bump') bump(args[0])
else if (command === 'tag') tag(args)
else {
  console.log('用法：node scripts/version.mjs <check | bump patch|minor|major | tag [--force] [--no-push] [--remote <url>]>')
  process.exit(1)
}
