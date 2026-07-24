// Segnali sonori (WebAudio). Condivisi tra timer recupero e timer cardio.
// Catena master con limiter → posso spingere il gain al massimo per bucare la musica
// senza distorcere. Toni acuti + doppio oscillatore = più penetranti.
//
// LIMITE: un'app web non ha audio-focus, non può abbassare la musica di sistema; il beep
// si mixa sotto di essa. Qui lo rendiamo il più forte possibile + vibrazione di rinforzo.

let _ctx: (AudioContext & { _bus?: GainNode }) | null = null

function buildBus(c: AudioContext & { _bus?: GainNode }) {
  const comp = c.createDynamicsCompressor() // brickwall limiter: alza il volume percepito
  comp.threshold.value = -6; comp.knee.value = 0; comp.ratio.value = 20
  comp.attack.value = 0.002; comp.release.value = 0.12
  const bus = c.createGain(); bus.gain.value = 1
  bus.connect(comp); comp.connect(c.destination)
  c._bus = bus
}

function getCtx(): (AudioContext & { _bus?: GainNode }) | null {
  try {
    if (!_ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      _ctx = new C()
      buildBus(_ctx)
    }
    return _ctx
  } catch { return null }
}

function ctx(): (AudioContext & { _bus?: GainNode }) | null {
  const c = getCtx()
  if (c && c.state !== 'running') c.resume().catch(() => { /* ignore */ })
  return c
}

/** Sblocca/riattiva l'audio. Chiamata ai gesti utente e quando la tab torna visibile. */
export function unlockAudio() {
  const c = getCtx()
  if (c && c.state !== 'running') c.resume().catch(() => { /* ignore */ })
}

// Aggancio globale: ogni tocco riattiva il context (che può ri-sospendersi in background).
if (typeof window !== 'undefined') {
  const opt: AddEventListenerOptions = { passive: true }
  window.addEventListener('pointerdown', unlockAudio, opt)
  window.addEventListener('touchstart', unlockAudio, opt)
  window.addEventListener('keydown', unlockAudio, opt)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') unlockAudio() })
}

// Vibrazione: sentita anche con la musica alta (Android). No-op dove non supportata.
function buzz(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch { /* ignore */ }
}

type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth'

// Nota con doppio oscillatore (fondamentale + ottava): più ricca di armoniche acute → buca meglio.
function note(c: AudioContext & { _bus?: GainNode }, freq: number, start: number, dur: number, gain = 0.6, type: Wave = 'square') {
  const dest = c._bus ?? c.destination
  const t = c.currentTime + start
  const g = c.createGain(); g.connect(dest)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  for (const [f, gy] of [[freq, 1], [freq * 2, 0.5]] as const) {
    const o = c.createOscillator(); const og = c.createGain()
    o.type = type; o.frequency.value = f; og.gain.value = gy
    o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.02)
  }
}

/** Tick del conto alla rovescia: acuto e squadrato per bucare la musica. */
export function tick() { const c = ctx(); if (c) note(c, 1000, 0, 0.09, 0.7) }

/** Fine recupero / inizio lavoro: allarme deciso a beep ripetuti + vibrazione forte. */
export function goSound() {
  const c = ctx()
  buzz([200, 80, 200, 80, 200])
  if (!c) return
  const beeps = [0, 0.2, 0.4]
  beeps.forEach((s) => note(c, 1320, s, 0.16, 0.95))
  note(c, 1600, 0.6, 0.5, 1.0) // coda lunga e alta
}

/** Segnale di riposo: due note discendenti + breve vibrazione. */
export function restCue() {
  const c = ctx()
  buzz(140)
  if (!c) return
  note(c, 660, 0, 0.16, 0.7); note(c, 480, 0.17, 0.3, 0.6)
}

/** Fine sessione: fanfara + allarme a beep ripetuti (più lungo e ben udibile) + vibrazione. */
export function finishCue() {
  const c = ctx()
  buzz([150, 70, 250, 70, 250])
  if (!c) return
  const fanfara: [number, number][] = [[784, 0], [988, 0.14], [1175, 0.28], [1568, 0.44]]
  fanfara.forEach(([f, s]) => note(c, f, s, s === 0.44 ? 0.55 : 0.2, 0.85, 'triangle'))
  const beeps = [0.95, 1.18, 1.5, 1.73]
  beeps.forEach((s, i) => note(c, i % 2 ? 1175 : 1480, s, 0.2, 0.95))
}
