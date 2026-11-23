import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

function element() {
  return {
    handlers: {}, hidden: false, disabled: false, value: '', checked: false,
    addEventListener(name, handler) { this.handlers[name] = handler },
    removeAttribute() {}, setAttribute() {}, focus() { this.focused = true },
    select() { this.selected = true }, append() {}, querySelector() { return null },
    hasAttribute() { return false }, showModal() { this.opened = true },
  }
}

function invite(navigator) {
  const nodes = Object.fromEntries(['inviteFriend', 'headerInvite', 'inviteDialog', 'inviteLink'].map(id => [id, element()]))
  const messages = []
  const context = { document: { getElementById: id => nodes[id] }, navigator, UiSounds: { play() {} } }
  runInNewContext(readFileSync('js/app-tools.js', 'utf8') + '\nthis.AppTools = AppTools', context)
  context.AppTools.connectInvite(message => messages.push(message))
  return { nodes, messages, click: (id = 'inviteFriend') => nodes[id].handlers.click() }
}

test('invite shares the hosted install link and respects cancellation', async () => {
  let payload
  const shared = invite({ share: async value => { payload = value } })
  await shared.click('headerInvite')
  assert.equal(payload.url, 'https://arvind595.github.io/Punchly/')
  assert.equal(shared.nodes.inviteDialog.opened, undefined)
  let copied = false
  const cancelled = invite({
    share: async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }) },
    clipboard: { writeText: async () => { copied = true } },
  })
  await cancelled.click()
  assert.equal(copied, false)
  assert.deepEqual(cancelled.messages, [])
})

test('invite copies the link or exposes it for manual copying when unavailable', async () => {
  let copied
  const clipboard = invite({ clipboard: { writeText: async value => { copied = value } } })
  await clipboard.click()
  assert.equal(copied, 'https://arvind595.github.io/Punchly/')
  assert.match(clipboard.messages[0], /copied/i)
  const unavailable = invite({ clipboard: { writeText: async () => { throw new Error('Denied') } } })
  await unavailable.click('headerInvite')
  assert.equal(unavailable.nodes.inviteDialog.opened, true)
  assert.equal(unavailable.nodes.inviteLink.selected, true)
})

test('setup shows the imported lunch choice and saves a changed choice', async () => {
  const ids = ['setupDialog', 'setupForm', 'setupSkipPane', 'keepSetup', 'confirmSetupSkip',
    'setupHeading', 'setupWelcome', 'setupPosition', 'setupBack', 'setupContinue', 'setupSkip',
    'setupRestore', 'setupBackup', 'setupBackupStatus']
  const nodes = Object.fromEntries(ids.map(id => [id, element()]))
  nodes.setupHeading.textContent = 'Welcome'
  const steps = Array.from({ length: 8 }, (_, i) => ({ ...element(), dataset: { setupStep: `Step ${i}` } }))
  const fields = ['clockFormat', 'theme', 'targetShift', 'lunchLimit', 'minimumLunch', 'displayName']
  nodes.setupForm.elements = Object.fromEntries(fields.map(name => [name, element()]))
  nodes.setupForm.querySelectorAll = () => steps
  const settings = { clockFormat: '12', theme: 'light', targetShift: '08:00', lunchLimit: 45, minimumLunch: true, displayName: 'Demo' }
  let saved
  const Storage = {
    profileDetails: value => ({ displayName: value.displayName || '' }),
    needsSetup: () => true,
    finishSetup: value => { saved = value; return true },
  }
  const context = {
    document: { getElementById: id => nodes[id], createElement: () => element() },
    Preferences: { themeGroups: [] }, Storage,
    AppTools: { modal: () => ({ open() {}, close() {} }) },
    UiSounds: { feedback: () => () => {}, play() {} },
    window: { importBackupFile: async () => { settings.minimumLunch = false; return true } },
  }
  runInNewContext(readFileSync('js/setup.js', 'utf8') + '\nthis.Setup = Setup', context)
  const setup = context.Setup.connect(settings, () => {})
  setup.open()
  assert.equal(nodes.setupForm.elements.minimumLunch.checked, true)
  nodes.setupBackup.files = [{}]
  await nodes.setupBackup.handlers.change()
  assert.equal(nodes.setupForm.elements.minimumLunch.checked, false)
  nodes.setupForm.elements.minimumLunch.checked = true
  for (let i = 0; i < 9; i++) nodes.setupForm.handlers.submit({ preventDefault() {} })
  assert.equal(saved.minimumLunch, true)
  assert.equal(saved.lunchLimit, 45)
})
