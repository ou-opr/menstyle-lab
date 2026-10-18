import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

export const DEFAULT_SOURCE = resolve(projectRoot, 'dist-single', 'index.html')
export const DEFAULT_TARGET = resolve(projectRoot, '..', '型格穿搭实验室-双击打开.html')
export const SIZE_BUDGET_BYTES = 6000 * 1000

export function validateRelease({ source = DEFAULT_SOURCE, sizeBudgetBytes = SIZE_BUDGET_BYTES } = {}) {
  if (!existsSync(source)) {
    return { ok: false, reason: `源文件不存在：${source}` }
  }
  const size = statSync(source).size
  if (size === 0) {
    return { ok: false, reason: `源文件为空（0 字节）：${source}` }
  }
  if (size > sizeBudgetBytes) {
    return {
      ok: false,
      reason: `源文件超出体积预算：${size} bytes > ${sizeBudgetBytes} bytes（${(size / 1e3).toFixed(1)} kB > ${(sizeBudgetBytes / 1e3).toFixed(1)} kB）`,
    }
  }
  const content = readFileSync(source)
  const sha256 = createHash('sha256').update(content).digest('hex')
  if (content.toString('utf8').replace(/^\uFEFF/, '').trim() === '') {
    return { ok: false, reason: `源文件为空（仅 BOM/空白）：${source}` }
  }
  return { ok: true, source, size, sizeBudgetBytes, sha256 }
}

export function release({ source = DEFAULT_SOURCE, target = DEFAULT_TARGET, sizeBudgetBytes = SIZE_BUDGET_BYTES } = {}) {
  const check = validateRelease({ source, sizeBudgetBytes })
  if (!check.ok) {
    console.error(`[release] 校验失败：${check.reason}`)
    process.exit(1)
  }
  copyFileSync(source, target)
  const targetSize = statSync(target).size
  const targetSha256 = createHash('sha256').update(readFileSync(target)).digest('hex')
  console.log(`[release] 源文件：${source}`)
  console.log(`[release] 源大小：${check.size} bytes（${(check.size / 1e3).toFixed(1)} kB），SHA-256：${check.sha256}`)
  console.log(`[release] 目标文件：${target}`)
  console.log(`[release] 目标大小：${targetSize} bytes（${(targetSize / 1e3).toFixed(1)} kB），SHA-256：${targetSha256}`)
  console.log(`[release] 体积预算：${sizeBudgetBytes} bytes（${(sizeBudgetBytes / 1e3).toFixed(1)} kB），校验通过`)
}

const isMain = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
if (isMain) {
  release()
}
