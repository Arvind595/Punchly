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

test('app reset requires CONFIRM and a separate Yes while profile deletion uses its own confirmation', () => {
  const ids = ['resetDialog', 'resetForm', 'resetHeading', 'resetDescription', 'resetStatus', 'resetApp',
    'resetBackup', 'deleteProfile', 'confirmReset', 'resetPhrase', 'resetPhraseField',
    'resetFinalActions', 'applyReset', 'cancelFullReset']
  const nodes = Object.fromEntries(ids.map(id => [id, element()]))
  Object.assign(nodes.resetDialog, {
    hasAttribute() { return this.opened },
    close() { this.opened = false; this.handlers.close() },
  })
  let resets = 0
  let profiles = 0
  const context = {
    document: { getElementById: id => nodes[id] }, UiSounds: { play() {} },
    Storage: { reset() { resets++; return true }, deleteProfile() { profiles++; return true } },
  }
  runInNewContext(readFileSync('js/app-tools.js', 'utf8') + '\nthis.AppTools = AppTools', context)
  context.AppTools.connectReset({ onReset() {}, onProfileDeleted() {} })
  const submit = () => nodes.resetForm.handlers.submit({ preventDefault() {} })
  nodes.resetApp.handlers.click()
  nodes.resetPhrase.value = 'confirm'
  submit()
  assert.equal(nodes.resetFinalActions.hidden, true)
  nodes.applyReset.handlers.click()
  assert.equal(resets, 0)
  nodes.resetPhrase.value = 'CONFIRM'
  submit()
  assert.equal(nodes.cancelFullReset.focused, true)
  assert.equal(resets, 0)
  nodes.cancelFullReset.handlers.click()
  nodes.applyReset.handlers.click()
  assert.equal(resets, 0)
  nodes.resetApp.handlers.click()
  assert.equal(nodes.resetPhrase.value, '')
  nodes.resetPhrase.value = 'CONFIRM'
  submit()
  nodes.applyReset.handlers.click()
  assert.equal(resets, 1)
  nodes.deleteProfile.handlers.click()
  assert.equal(nodes.resetPhrase.disabled, true)
  submit()
  assert.equal(profiles, 1)
  assert.equal(resets, 1)
})

test('setup shows the imported lunch choice and saves a changed choice', async () => {
  const ids = ['setupDialog', 'setupForm', 'setupSkipPane', 'keepSetup', 'confirmSetupSkip',
    'setupHeading', 'setupWelcome', 'setupPosition', 'setupBack', 'setupContinue', 'setupSkip',
    'setupRestore', 'setupBackup', 'setupBackupStatus', 'setupComplete', 'setupDone', 'setupCompleteMessage', 'setupCompleteIcon']
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
  assert.equal(nodes.setupComplete.hidden, false)
  assert.equal(nodes.setupHeading.textContent, "You're all set!")
})

test('recognizes automatic device labels while respecting explicitly saved names', async () => {
  const context = { navigator: { userAgent: 'Windows', platform: 'Win32' } }
  runInNewContext(readFileSync('js/setup.js', 'utf8') + '\nthis.Setup = Setup', context)
  assert.equal(await context.Setup.isDeviceProfile({ displayName: 'Windows PC' }), true)
  assert.equal(await context.Setup.isDeviceProfile({ displayName: 'Windows PC', profileNameSource: 'user' }), false)
  assert.equal(await context.Setup.isDeviceProfile({ displayName: 'Aravind' }), false)
  assert.equal(await context.Setup.isDeviceProfile({ displayName: 'Device model', profileNameSource: 'device' }), true)
})
