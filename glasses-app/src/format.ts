import type { CooksResponse } from './relay'

const MAX_COOKS = 3 // keep it readable on the 576x288 display

/** Render the cook list into plain text for the glasses text container. */
export function renderCooks(data: CooksResponse): string {
  if (!data.cooks.length) return 'No active cooks'

  const u = data.unit
  const blocks = data.cooks.slice(0, MAX_COOKS).map((c) => {
    const internal = c.internal == null ? '--' : `${c.internal}°${u}`
    const target = c.target == null ? '--' : `${c.target}°${u}`
    const ambient = c.ambient == null ? '--' : `${c.ambient}°${u}`
    const eta = c.remainingSec == null ? '--' : fmtDuration(c.remainingSec)
    const progress = c.progressPct == null ? '' : `${progressBar(c.progressPct)} ${c.progressPct}%   `
    return `${c.name}  [${c.state}]\n  ${internal} -> ${target}   amb ${ambient}\n  ${progress}ETA ${eta}`
  })

  const extra = data.cooks.length > MAX_COOKS ? `\n\n(+${data.cooks.length - MAX_COOKS} more)` : ''
  return blocks.join('\n\n') + extra
}

function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

function progressBar(pct: number, width = 10): string {
  const filled = Math.round((pct / 100) * width)
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']'
}
