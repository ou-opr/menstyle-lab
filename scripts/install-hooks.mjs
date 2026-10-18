#!/usr/bin/env node
// 零依赖的本地 hook 安装器。
// 做法：git config core.hooksPath .githooks —— 这是一种「配置指向目录」的方案，
// 不需要把文件复制进 .git/hooks，能随仓库分发，改 hook 立即生效。
//
// 用法：
//   node scripts/install-hooks.mjs             安装/刷新
//   node scripts/install-hooks.mjs --uninstall 卸载（core.hooksPath 置空）
//
// 跳过一次检查：SKIP_TESTS=1 git push

import { spawnSync } from 'node:child_process'
import { accessSync, chmodSync, constants, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOKS_DIR_NAME = '.githooks'
const HOOK_NAME = 'pre-push'
const KEY = 'core.hooksPath'

const uninstall = process.argv.includes('--uninstall')

function git(args, opts = {}) {
  return spawnSync('git', args, { encoding: 'utf8', cwd: opts.cwd, ...opts })
}

function fail(msg) {
  console.error(`[hooks] ✖ ${msg}`)
  process.exit(1)
}

// 1. 定位仓库根
const toplevel = git(['rev-parse', '--show-toplevel'])
if (toplevel.error) fail(`无法执行 git：${toplevel.error.message}`)
if (toplevel.status !== 0) fail('当前目录不在 git 仓库内（git rev-parse --show-toplevel 失败）')
const repoRoot = toplevel.stdout.trim().replace(/[\\/]+$/, '')
const repoName = repoRoot.split(/[\\/]/).pop()

const scriptPath = relative(repoRoot, fileURLToPath(import.meta.url))

// 2. 卸载分支
if (uninstall) {
  const current = git(['config', '--get', KEY], { cwd: repoRoot })
  if (current.status !== 0) {
    console.log(`[hooks] ${KEY} 本来就是空的，无需卸载。`)
    console.log(`[hooks] 已确认未启用任何自定义 hook 路径。`)
    process.exit(0)
  }
  const unset = git(['config', '--unset', KEY], { cwd: repoRoot })
  if (unset.status !== 0) fail(`git config --unset ${KEY} 失败：${unset.stderr.trim()}`)
  console.log(`[hooks] 已卸载：${KEY} 已清空（原值 ${current.stdout.trim()}）。`)
  console.log(`[hooks] git 回到使用 .git/hooks/ 的默认行为，${HOOKS_DIR_NAME}/${HOOK_NAME} 不再被调用。`)
  console.log(`[hooks] 重新启用：node ${scriptPath}`)
  process.exit(0)
}

// 3. 安装前检查 hook 文件本身
const hooksDir = join(repoRoot, HOOKS_DIR_NAME)
const hookPath = join(hooksDir, HOOK_NAME)

if (!existsSync(hooksDir)) fail(`找不到 ${HOOKS_DIR_NAME}/ 目录（预期在 ${repoRoot}）`)
if (!existsSync(hookPath)) fail(`找不到 ${HOOKS_DIR_NAME}/${HOOK_NAME} 文件`)

// 可执行位：POSIX 上要求 +x；Windows 上 chmod 基本无意义，失败不算错误。
let execNote = ''
if (process.platform === 'win32') {
  execNote = 'Windows 无 POSIX 可执行位，跳过 chmod（git 直接按 sh 解释执行）'
} else {
  try {
    accessSync(hookPath, constants.X_OK)
    execNote = '可执行位已就绪'
  } catch {
    try {
      chmodSync(hookPath, 0o755)
      execNote = '已补上可执行位 0755'
    } catch (err) {
      execNote = `补可执行位失败但继续（${err.code ?? err.message}）`
    }
  }
}

// 4. 写配置（幂等：同值重复写不会报错，也不会产生额外 git 状态）
const set = git(['config', KEY, HOOKS_DIR_NAME], { cwd: repoRoot })
if (set.status !== 0) fail(`git config ${KEY} 失败：${set.stderr.trim()}`)

const readBack = git(['config', '--get', KEY], { cwd: repoRoot })
const effective = readBack.status === 0 ? readBack.stdout.trim() : '(空)'

console.log(`[hooks] ✔ 已启用：${KEY} = ${effective}（仓库 ${repoName}）`)
console.log(`[hooks]   hook 文件：${HOOKS_DIR_NAME}/${HOOK_NAME}（${execNote}）`)
console.log(`[hooks]   行为：git push 前运行 npm test（离线回归网），失败则阻止推送`)
console.log(`[hooks]   跳过一次：SKIP_TESTS=1 git push`)
console.log(`[hooks]              PowerShell: $env:SKIP_TESTS=1; git push`)
console.log(`[hooks]   卸载：node ${scriptPath} --uninstall`)
