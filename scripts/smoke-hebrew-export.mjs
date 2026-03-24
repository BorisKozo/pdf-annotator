/**
 * Verifies pdf-lib can embed bundled font and draw Hebrew text.
 * Run: node scripts/smoke-hebrew-export.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fontPath = join(
  root,
  'src',
  'renderer',
  'public',
  'fonts',
  'NotoSansHebrew-VF.ttf',
)

const fontBytes = await readFile(fontPath)
const doc = await PDFDocument.create()
doc.registerFontkit(fontkit)
const page = doc.addPage([400, 400])
const font = await doc.embedFont(fontBytes, { subset: false })
page.drawText('Hello שלום', {
  x: 40,
  y: 300,
  size: 28,
  font,
})
const outPath = join(root, 'out', '_smoke-hebrew.pdf')
await writeFile(outPath, await doc.save())
console.log('OK wrote', outPath)
