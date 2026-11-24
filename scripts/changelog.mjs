import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync('release.json', 'utf8'))
let since = process.argv[2]
if (since && (!/^[a-zA-Z0-9_./-]+$/.test(since) || since.startsWith('-') || since.includes('..'))) throw new Error('Provide a valid tag or commit as the starting point.')
if (!since) {
  try { since = execFileSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { /* Repositories without tags use the most recent commits. */ }
}
const args = ['log', '--no-merges', '--format=%s']
if (since) args.push(`${since}..HEAD`)
else args.push('-20')
const commits = execFileSync('git', args, { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean)
process.stdout.write(`# Punchly v${config.version}\n\n${commits.length ? commits.map(value => `- ${value}`).join('\n') : '- No commits since the selected reference.'}\n`)
