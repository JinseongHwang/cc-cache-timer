import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheClock } from '../types'

// The main conversation of a subscription user is cached with a 1-hour TTL.
const TTL_MS = 60 * 60 * 1000
// A toast is shown once each time the time left drops below one of these (minutes).
const WARN_AT_MIN = [10, 3]
const TICK_MS = 1000

const clock = atom(
  { plugin: 'cache-timer', key: 'clock' } as const,
  { lastAt: null, warned: [] } satisfies CacheClock as CacheClock,
  { shape: 'clock-1' },
)

function hhmm(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function refresh($: EngineInterface): Promise<void> {
  const state = await read($, clock)
  if (state.lastAt === null) {
    $.ui.status(undefined)
    return
  }

  const leftMs = state.lastAt + TTL_MS - (await $.clock.now())
  const expiresAt = hhmm(state.lastAt + TTL_MS)

  // The engine prefixes the line with "⚠ cache-timer: ", so the text carries no symbol or colon.
  if (leftMs <= 0) {
    $.ui.status(`Cache expired at ${expiresAt}, next request re-reads everything`)
    return
  }

  // Round up to whole seconds so the countdown starts at 60m 00s right after a request.
  const leftSec = Math.ceil(leftMs / 1000)
  const left = `${Math.floor(leftSec / 60)}m ${String(leftSec % 60).padStart(2, '0')}s`
  const soon = leftSec <= WARN_AT_MIN[0]! * 60 ? ', expiring soon' : ''
  $.ui.status(`${left} left${soon} (until ${expiresAt})`)

  const due = WARN_AT_MIN.filter(m => leftSec <= m * 60 && !state.warned.includes(m))
  if (due.length === 0) return

  await update($, clock, s => ({ ...s, warned: [...s.warned, ...due] }))
  $.ui.toast(
    `Prompt cache expires in ${left} (at ${expiresAt}). Send your next request before then to keep it.`,
    { timeoutMs: 10000 },
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(TICK_MS, () => refresh($))
    await refresh($)
    return next(e)
  })

  // Every model request of the main conversation renews the cache, so record when it was sent.
  // Subagents (those with an agentId) use a separate cache bucket and are not counted.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await update($, clock, () => ({ lastAt: now, warned: [] }))
      await refresh($)
    }
    return yield* next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, clock, () => ({ lastAt: null, warned: [] }))
      $.ui.status(undefined)
    }
    return next(e)
  })
}
