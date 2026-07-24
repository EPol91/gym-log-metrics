// Segnali sonori (WebAudio). Condivisi tra timer recupero e timer cardio.
// Onde triangle/square + gain alti → udibili anche con la musica in cuffia.

// UN SOLO AudioContext condiviso. I browser mobile lo creano "suspended": un timer
// (setInterval) NON può riattivarlo, quindi va sbloccato durante un gesto utente e
// riattivato con resume() prima di ogni suono — altrimenti il beep non parte affatto.
let _ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (!_ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      _ctx = new C()
    }
    return _ctx
  } catch { return null }
}

function ctx(): AudioContext | null {
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

function note(c: AudioContext, freq: number, start: number, dur: number, gain = 0.3, type: Wave = 'triangle') {
  const o = c.createOscillator(); const g = c.createGain()
  o.type = type; o.frequency.value = freq; o.connect(g); g.connect(c.destination)
  const t = c.currentTime + start
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.start(t); o.stop(t + dur + 0.02)
}

/** Tick del conto alla rovescia: acuto e squadrato per bucare la musica. */
export function tick() { const c = ctx(); if (c) note(c, 950, 0, 0.09, 0.4, 'square') }

/** Suono "GO": tre note ascendenti decise (inizio lavoro / fine recupero) + vibrazione. */
export function goSound() {
  const c = ctx()
  buzz([160, 70, 160])
  if (!c) return
  note(c, 660, 0, 0.16, 0.5); note(c, 880, 0.16, 0.16, 0.5); note(c, 1319, 0.33, 0.42, 0.62, 'square')
}

/** Segnale di riposo: due note discendenti morbide + breve vibrazione. */
export function restCue() {
  const c = ctx()
  buzz(120)
  if (!c) return
  note(c, 560, 0, 0.16, 0.4); note(c, 400, 0.17, 0.28, 0.34)
}

/** Fine sessione: fanfara + allarme a beep ripetuti (più lungo e ben udibile) + vibrazione. */
export function finishCue() {
  const c = ctx()
  buzz([120, 60, 220, 60, 220])
  if (!c) return
  const fanfara: [number, number][] = [[784, 0], [988, 0.14], [1175, 0.28], [1568, 0.44]]
  fanfara.forEach(([f, s]) => note(c, f, s, s === 0.44 ? 0.5 : 0.15, 0.5, 'triangle'))
  const beeps = [0.95, 1.18, 1.5, 1.73]
  beeps.forEach((s, i) => note(c, i % 2 ? 988 : 1319, s, 0.18, 0.55, 'square'))
}
