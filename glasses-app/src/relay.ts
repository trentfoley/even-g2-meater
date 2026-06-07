// Talks to OUR relay Worker, not MEATER directly (the relay supplies CORS).
const RELAY_BASE = (import.meta.env.VITE_RELAY_URL ?? '').replace(/\/$/, '')

export interface Cook {
  id: string
  name: string
  state: string
  internal: number | null
  ambient: number | null
  target: number | null
  peak: number | null
  elapsedSec: number
  remainingSec: number | null
  progressPct: number | null
}

export interface CooksResponse {
  cooks: Cook[]
  unit: 'F' | 'C'
  fetchedAt: number
}

export async function fetchCooks(): Promise<CooksResponse> {
  if (!RELAY_BASE) throw new Error('VITE_RELAY_URL is not set (see .env.example)')
  const res = await fetch(`${RELAY_BASE}/cooks`)
  if (!res.ok) throw new Error(`Relay responded ${res.status}`)
  return (await res.json()) as CooksResponse
}
