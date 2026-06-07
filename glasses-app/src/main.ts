import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { fetchCooks } from './relay'
import { renderCooks } from './format'

const POLL_MS = 30_000 // MEATER recommends <= 2 req/60s; 30s keeps us at the limit.
const CONTAINER_ID = 1

type Bridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>

/** Mirror status into the WebView page too (handy in the simulator/browser). */
function setStatus(msg: string): void {
  const el = document.getElementById('status')
  if (el) el.textContent = msg
}

async function tick(bridge: Bridge): Promise<void> {
  let content: string
  try {
    const data = await fetchCooks()
    content = renderCooks(data)
    setStatus(`Updated ${new Date().toLocaleTimeString()} — ${data.cooks.length} cook(s)`)
  } catch (err) {
    content = `MEATER relay error:\n${(err as Error).message}`
    setStatus(content)
  }

  // Flicker-free in-place text update (no full container rebuild).
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({ containerID: CONTAINER_ID, contentOffset: 0, content }),
  )
}

async function main(): Promise<void> {
  const bridge = await waitForEvenAppBridge()

  // One full-screen text container (576x288, 4-bit greyscale).
  await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1,
      textObject: [
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          borderWidth: 0,
          borderColor: 0,
          paddingLength: 8,
          containerID: CONTAINER_ID,
          containerName: 'cooks',
          content: 'Loading MEATER cooks…',
          isEventCapture: 1, // capture touchpad events so we can detect double-press
        }),
      ],
    }),
  )

  // Input dispatch — double-press the temple touchpad (or R1 ring) to exit.
  // Taps arrive via `sysEvent` in the desktop simulator but via `textEvent` on real G2
  // hardware, so read eventType from whichever is present. CLICK=0 is omitted on the wire
  // (protobuf zero-omission) → arrives undefined → coalesced to 0 inside the sysEvent branch.
  // (Pattern verified against the even-g2-stop-watch app.)
  let pollTimer: number | undefined
  let unsubscribe: (() => void) | undefined
  const teardown = (): void => {
    if (pollTimer !== undefined) window.clearInterval(pollTimer)
    unsubscribe?.()
  }

  unsubscribe = bridge.onEvenHubEvent((event) => {
    const sysType = event.sysEvent
      ? (event.sysEvent.eventType ?? OsEventTypeList.CLICK_EVENT)
      : undefined

    // Host fired the exit (after the confirm dialog) or an abnormal exit → stop everything.
    if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      teardown()
      return
    }

    const eventType = event.sysEvent ? sysType : event.textEvent?.eventType
    if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      void bridge.shutDownPageContainer(1) // 1 = confirm dialog; the SYSTEM_EXIT it triggers drives teardown
    }
  })

  await tick(bridge)
  pollTimer = window.setInterval(() => void tick(bridge), POLL_MS)
}

main().catch((err) => setStatus(`Fatal: ${(err as Error).message}`))
