import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const context = { Uint8Array }
runInNewContext(readFileSync('js/app-tools.js', 'utf8') + '\nthis.AppTools = AppTools', context)
const file = (type, size, bytes) => ({ type, size, slice: () => ({ arrayBuffer: async () => Uint8Array.from(bytes).buffer }) })

test('profile uploads require a supported image signature and a 5 MB size limit', async () => {
  const png = [137, 80, 78, 71, 13, 10, 26, 10]
  await context.AppTools.validatePhotoFile(file('image/png', 100, png))
  await context.AppTools.validatePhotoFile(file('image/jpeg', 100, [255, 216, 255]))
  await assert.rejects(context.AppTools.validatePhotoFile(file('image/png', 6 * 1024 * 1024, png)), /5 MB/)
  await assert.rejects(context.AppTools.validatePhotoFile(file('image/png', 100, [255, 216, 255])), /does not match/)
  await assert.rejects(context.AppTools.validatePhotoFile(file('image/svg+xml', 100, png)), /JPEG, PNG, or WebP/)
})

test('oversized decoded dimensions are rejected before opening the crop dialog', async () => {
  const ids = ['photoDialog', 'profilePhotoFile', 'photoCrop', 'photoZoom', 'photoX', 'photoY', 'profilePhotoChoose', 'applyPhoto']
  const nodes = Object.fromEntries(ids.map(id => [id, {
    handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler }, querySelector: () => null,
    hasAttribute: () => false, setAttribute() {}, removeAttribute() {},
  }]))
  nodes.photoCrop.width = 192
  nodes.profilePhotoFile.files = [file('image/png', 100, [137, 80, 78, 71, 13, 10, 26, 10])]
  let message = ''
  let revoked = false
  class Image { set src(value) { this.naturalWidth = 9000; this.naturalHeight = 9000; this.onload() } }
  const env = {
    Uint8Array, Image, document: { getElementById: id => nodes[id] },
    URL: { createObjectURL: () => 'blob:image', revokeObjectURL: () => { revoked = true } },
    UiSounds: { feedback: () => () => {}, play() {} },
  }
  runInNewContext(readFileSync('js/app-tools.js', 'utf8') + '\nthis.AppTools = AppTools', env)
  env.AppTools.connectPhoto(() => { throw new Error('must not save') }, text => { message = text })
  await nodes.profilePhotoFile.handlers.change()
  assert.match(message, /dimensions are too large/)
  assert.equal(revoked, true)
})
