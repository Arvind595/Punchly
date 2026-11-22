import {
  createUISFX,
  getCue,
  type CueName,
  type PlayingSFX,
  type PlayOptions,
  type UISFXPlayer,
} from 'uisfx'

type Preferences = {
  punchAudio: boolean
  soundVolume: number
  typingSounds: boolean
}
type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night'
type Feedback = (cue: CueName, options?: PlayOptions) => PlayingSFX | null

const pack = 'zen'
const cueGain = 1.5
const punchRates: Record<DayPeriod, number> = {
  morning: 1.08,
  afternoon: 1,
  evening: 0.94,
  night: 0.86,
}
const quiet: Feedback = () => null
let settings: Preferences | undefined
let player: UISFXPlayer | undefined
let context: AudioContext | undefined
let listeners: AbortController | undefined
let resuming: Promise<void> | undefined
let disposal: Promise<void> | undefined
let stopWait: (() => void) | undefined
let view = 0

export function connect(saved: Preferences) {
  if (typeof window === 'undefined' || listeners) return
  settings = saved
  listeners = new AbortController()
  const options = { capture: true, signal: listeners.signal }
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse') unlock(event)
    },
    options,
  )
  document.addEventListener(
    'pointerup',
    (event) => {
      if (event.pointerType !== 'mouse') unlock(event)
    },
    options,
  )
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        !event.repeat &&
        !['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)
      )
        unlock(event)
    },
    options,
  )
  document.addEventListener('click', unlock, options)
  document.addEventListener('input', type, options)
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) silence()
    },
    options,
  )
  window.addEventListener(
    'pagehide',
    (event) => {
      if (event.persisted) silence()
      else void destroy()
    },
    options,
  )
}

function unlock(event: Event) {
  if (!event.isTrusted || !settings || disposal) return
  const Audio =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Audio) return
  try {
    context ??= new Audio()
    if (!player) {
      player = createUISFX({
        pack,
        volume: 0.7,
        enabled: settings.punchAudio,
        context,
      })
      sync(settings)
    }
    if (context.state !== 'running' && !resuming) {
      const pending = context.resume().catch(() => {})
      resuming = pending
      void pending.finally(() => {
        if (resuming === pending) resuming = undefined
      })
    }
  } catch {
    // Audio availability never changes the result of an app action.
  }
}

function ready() {
  return (
    settings?.punchAudio &&
    settings.soundVolume > 0 &&
    player &&
    context?.state === 'running' &&
    !document.hidden
  )
}

export const play: Feedback = (cue, options) => {
  if (!ready()) return null
  try {
    const volume = Math.min(
      1,
      (options?.volume ?? getCue(cue).defaultVolume) * cueGain,
    )
    return player?.play(cue, { ...options, volume }) ?? null
  } catch {
    return null
  }
}

export function punch(period: DayPeriod) {
  play('checkpoint', { playbackRate: punchRates[period] })
}

function type(event: Event) {
  const field = event.target
  if (
    !settings?.typingSounds ||
    !event.isTrusted ||
    !(field instanceof Element)
  )
    return
  if (
    field.matches(
      'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="tel"], input[type="url"], input[type="password"]',
    )
  ) {
    play('typing', { volume: 0.035, cooldownMs: 0, retrigger: 'overlap' })
  }
}

// Take a snapshot at the start of an async action. A later gesture cannot make an old outcome audible.
export function feedback(): Feedback {
  if (!ready()) return quiet
  const startedIn = view
  return (cue, options) => (startedIn === view ? play(cue, options) : null)
}

export function startLoading(scope: HTMLElement) {
  if (stopWait) return stopWait
  if (!ready()) return quiet
  let handle: PlayingSFX | null = null
  function stop() {
    clearTimeout(start)
    clearTimeout(limit)
    if (stopWait === stop) stopWait = undefined
    handle?.stop()
    handle = null
  }
  const start = setTimeout(() => {
    if (!scope.getClientRects().length) {
      stop()
      return
    }
    handle = play('loading')
    if (!handle) stop()
  }, 300)
  const limit = setTimeout(stop, 8000)
  stopWait = stop
  return stop
}

export function leaveView() {
  view++
  stopWait?.()
}

export function silence() {
  leaveView()
  player?.stopAll()
}

export function sync(next: Preferences) {
  settings = next
  if (!player) return
  if (!next.punchAudio || next.soundVolume === 0) silence()
  player.setPack(pack)
  player.setEnabled(next.punchAudio)
  if (player.getVolume() !== next.soundVolume / 100)
    player.setVolume(next.soundVolume / 100)
}

export function destroy() {
  if (disposal) return disposal
  silence()
  listeners?.abort()
  const activePlayer = player
  const ownedContext = context
  player = context = undefined
  resuming = undefined
  disposal = (async () => {
    try {
      await activePlayer?.destroy()
    } finally {
      if (ownedContext && ownedContext.state !== 'closed') {
        try {
          await ownedContext.close()
        } catch {
          /* Already unavailable. */
        }
      }
      listeners = undefined
      settings = undefined
      disposal = undefined
    }
  })()
  return disposal
}
