import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import test from 'node:test'

test('release check accepts the generated files with LF and CRLF license checkouts', () => {
  const manifest = JSON.parse(readFileSync('deployment-manifest.json', 'utf8'))
  const parent = realpathSync(tmpdir())
  const scratch = mkdtempSync(join(parent, 'punchly-release-'))
  try {
    for (const file of [...Object.keys(manifest.assets), 'deployment-manifest.json', 'release.json', 'scripts/release.mjs']) {
      const destination = join(scratch, file)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(file, destination)
    }
    const license = readFileSync('LICENSE', 'utf8').replace(/\r\n/g, '\n')
    for (const [lineEnding, contents] of [['LF', license], ['CRLF', license.replace(/\n/g, '\r\n')]]) {
      writeFileSync(join(scratch, 'LICENSE'), contents)
      const check = spawnSync(process.execPath, ['scripts/release.mjs', '--check'], { cwd: scratch, encoding: 'utf8' })
      assert.equal(check.status, 0, `${lineEnding} checkout: ${check.error ?? check.stderr}`)
    }
  } finally {
    if (dirname(realpathSync(scratch)) === parent && basename(scratch).startsWith('punchly-release-')) {
      rmSync(scratch, { recursive: true, force: true })
    }
  }
})
