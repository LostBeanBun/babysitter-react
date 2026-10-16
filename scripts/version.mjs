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
 * 用法：
 *   node scripts/version.mjs check          校验（npm run version:check，已挂在 lint 末尾）
 *   node scripts/version.mjs bump <level>   升版 + 生成 CHANGELOG 骨架（npm run version:bump）
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
  console.log('\nVERSION-CHECK-OK\n')
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
}

const [command, arg] = process.argv.slice(2)
if (command === 'check') check()
else if (command === 'bump') bump(arg)
else {
  console.log('用法：node scripts/version.mjs <check | bump patch|minor|major>')
  process.exit(1)
}
