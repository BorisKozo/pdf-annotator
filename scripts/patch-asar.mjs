/**
 * patch-asar.mjs
 *
 * Updates the app.asar inside dist/win-unpacked without re-running electron-builder
 * (which frequently fails on Windows due to Defender locking locale files).
 *
 * Usage:  npm run patch-asar
 *
 * Requirements: the app must already be packaged (dist/win-unpacked must exist)
 *               and the code must already be built (out/ must be current).
 */

import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = fileURLToPath(new URL('..', import.meta.url))
const asar = join(root, 'dist', 'win-unpacked', 'resources', 'app.asar')
const tmp  = join(tmpdir(), 'pdf-annotator-asar-patch')

if (!existsSync(asar)) {
  console.error('app.asar not found — run npm run package first to do the initial build.')
  process.exit(1)
}

console.log('Extracting asar...')
if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
execSync(`npx asar extract "${asar}" "${tmp}"`, { stdio: 'inherit' })

console.log('Copying fresh out/ ...')
cpSync(join(root, 'out'), join(tmp, 'out'), { recursive: true })

console.log('Repacking asar...')
execSync(`npx asar pack "${tmp}" "${asar}"`, { stdio: 'inherit' })

rmSync(tmp, { recursive: true, force: true })
console.log('Done — asar updated.')
