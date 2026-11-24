import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = ['index.html', 'README.md', 'CHANGELOG.md', 'AGENTS.md', 'docs/HANDOFF.md', 'test-data/README.md', 'css/style.css']
const external = new Set()
const failures = []
for (const file of files) {
  const text = await readFile(resolve(root, file), 'utf8')
  const links = [
    ...[...text.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1]),
    ...[...text.matchAll(/\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)].map(match => match[1]),
    ...[...text.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)].map(match => match[1])
  ]
  for (const link of links) {
    if (/^https?:\/\//i.test(link)) { if (!/localhost|127\.0\.0\.1/.test(link)) external.add(link); continue }
    if (/^(?:mailto:|tel:|data:|javascript:)/i.test(link)) continue
    const [path, anchor] = link.split('#')
    if (!path && anchor && file.endsWith('.html')) {
      if (!new RegExp(`\\bid=["']${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(text)) failures.push(`${file}: missing #${anchor}`)
      continue
    }
    if (!path) continue
    const target = decodeURIComponent(path.split('?')[0])
    try { await access(resolve(root, dirname(file), target)) }
    catch { failures.push(`${file}: missing ${link}`) }
  }
}
if (process.argv.includes('--external')) {
  for (const url of external) {
    try {
      let response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15000), redirect: 'follow' })
      if ([403, 405].includes(response.status)) response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' })
      if (!response.ok) failures.push(`${url}: HTTP ${response.status}`)
    } catch (error) { failures.push(`${url}: ${error.message}`) }
  }
}
if (failures.length) { failures.forEach(value => console.error(value)); process.exitCode = 1 }
else console.log(`Links verified${process.argv.includes('--external') ? `, including ${external.size} external links` : ' (local files and page anchors)'}.`)
