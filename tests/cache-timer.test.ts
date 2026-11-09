import { expect, mock, test } from 'claude-code/testing'

const MIN = 60 * 1000

test('counts down by the second, warns at 10 and 3 min, then expires', async ($, on) => {
  const clock = mock.clock(on, { now: new Date(2026, 10, 9, 2, 9, 0).getTime() })
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })

  const step = async (agentId?: string) => {
    for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'opus', messageCount: 1, agentId })) {
      // there are no chunks
    }
    await clock.settle()
  }
  const last = () => statuses[statuses.length - 1]

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await step()
  expect(last()).toBe('60m 00s left (until 03:09)')

  await clock.advance(1000)
  expect(last()).toBe('59m 59s left (until 03:09)')

  // a subagent request does not reset the timer
  await step('sub-1')
  expect(last()).toBe('59m 59s left (until 03:09)')

  await clock.advance(50 * MIN - 1000)
  expect(last()).toBe('10m 00s left, expiring soon (until 03:09)')
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('10m 00s')

  await clock.advance(7 * MIN)
  expect(last()).toBe('3m 00s left, expiring soon (until 03:09)')
  expect(toasts.length).toBe(2)

  await clock.advance(3 * MIN)
  expect(last()).toBe('Cache expired at 03:09, next request re-reads everything')
  expect(toasts.length).toBe(2)

  // a new request starts over from 60 minutes
  await step()
  expect(last()).toBe('60m 00s left (until 04:09)')
})
