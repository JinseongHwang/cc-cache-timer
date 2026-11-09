export type CacheClock = {
  /** When the main conversation last sent a model request (ms since epoch), or null if it has not yet */
  lastAt: number | null
  /** Thresholds (minutes) already announced for the current lastAt */
  warned: number[]
}

declare module 'claude-code' {
  interface PluginState {
    'cache-timer': { clock: Shaped<CacheClock> }
  }
}
