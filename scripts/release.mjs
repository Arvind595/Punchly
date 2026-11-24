import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const config = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'))
if (!Number.isInteger(config.version) || config.version < 1) throw new Error('release.json needs a positive version number')
const textTypes = new Set(['.js', '.css', '.svg', '.html', '.webmanifest'])
const normalized = (file, bytes) => file === 'LICENSE' || textTypes.has(extname(file))
  ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))
  : bytes
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function readAsset(file) { return normalized(file, await readFile(join(root, file))) }
async function walk(directory) {
  const result = []
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`
    if (entry.isDirectory()) result.push(...await walk(name))
    else if (/\.(?:svg|png|jpe?g|woff)$/i.test(name)) result.push(name)
  }
  return result
}
const scripts = (await readdir(join(root, 'js'))).filter(name => name.endsWith('.js')).map(name => `js/${name}`)
const versioned = ['css/style.css', 'manifest.webmanifest', 'vendor/punchly-sounds.js', ...scripts]
const assets = [...new Set([...versioned, 'vendor/xlsx-0.20.3.mini.js', 'LICENSE', ...await walk('assets')])].sort()
const entries = {}
for (const file of assets) {
  const bytes = await readAsset(file)
  entries[file] = { sha256: hash(bytes), bytes: bytes.length }
}
for (const [file, expected] of Object.entries(config.vendorSha256 || {})) {
  if (entries[file]?.sha256 !== expected) throw new Error(`Vendor integrity mismatch: ${file}`)
}
for (const [file, limit] of Object.entries(config.assetBudgets || {})) {
  if (!entries[file] || entries[file].bytes > limit) throw new Error(`Asset is missing or exceeds its size budget: ${file}`)
}
const urlFor = file => `./${file}${versioned.includes(file) ? `?v=${entries[file].sha256.slice(0, 12)}` : ''}`
let html = (await readFile(join(root, 'index.html'), 'utf8')).replace(/\r\n/g, '\n')
html = html.replace(/(<meta name="punchly-release" content=")\d+("\s*>)/, `$1${config.version}$2`)
html = html.replace(/((?:src|href)=")(js\/[^"?]+|css\/style\.css|manifest\.webmanifest|vendor\/punchly-sounds\.js)(?:\?[^" ]*)?("\s*)/g,
  (all, prefix, file, suffix) => {
    if (!entries[file]) throw new Error(`Missing asset: ${file}`)
    return `${prefix}${file}?v=${entries[file].sha256.slice(0, 12)}${suffix}`
  })
const oldWorker = (await readFile(join(root, 'service-worker.js'), 'utf8')).replace(/\r\n/g, '\n')
if (!oldWorker.includes('// BEGIN GENERATED ASSETS') || !oldWorker.includes('// END GENERATED ASSETS')) throw new Error('Service-worker asset markers are missing')
const workerTemplate = oldWorker.replace(/\/\/ BEGIN GENERATED ASSETS[\s\S]*?\/\/ END GENERATED ASSETS/, '// GENERATED ASSETS')
const cacheDigest = hash(Buffer.from(JSON.stringify([config.version, entries, hash(Buffer.from(html)), hash(Buffer.from(workerTemplate))]))).slice(0, 12)
const block = `// BEGIN GENERATED ASSETS\nconst RELEASE = ${config.version};\nconst CACHE_NAME = 'punchly-static-v${config.version}-${cacheDigest}';\nconst APP_ASSETS = ${JSON.stringify(assets.map(urlFor), null, 2)}\n  .map(path => new URL(path, self.registration.scope).href);\n// END GENERATED ASSETS`
const worker = oldWorker.replace(/\/\/ BEGIN GENERATED ASSETS[\s\S]*?\/\/ END GENERATED ASSETS/, block)
entries['index.html'] = { sha256: hash(Buffer.from(html)), bytes: Buffer.byteLength(html) }
entries['service-worker.js'] = { sha256: hash(Buffer.from(worker)), bytes: Buffer.byteLength(worker) }
const manifest = JSON.stringify({ version: config.version, cache: `punchly-static-v${config.version}-${cacheDigest}`, assets: entries }, null, 2) + '\n'
const outputs = [['index.html', html], ['service-worker.js', worker], ['deployment-manifest.json', manifest]]
let different = false
for (const [file, output] of outputs) {
  const existing = await readFile(join(root, file), 'utf8').catch(() => '')
  if (existing.replace(/\r\n/g, '\n') === output) continue
  if (check) { console.error(`${file} is out of date; run npm run release:sync`); different = true }
  else { await writeFile(join(root, file), output); console.log(`Updated ${file}`) }
}
if (different) process.exitCode = 1
else if (check) console.log('Release assets and vendor integrity verified.')
