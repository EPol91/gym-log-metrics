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
function note(c: AudioContext & { _bus?: GainNode }, freq: number, start: number, dur: number, gain = 0.6, type: Wave = 'square', decadi = false) {
  const dest = c._bus ?? c.destination
  const t = c.currentTime + start
  const g = c.createGain(); g.connect(dest)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  // Con la coda che si spegne il calo comincia subito e dura tutta la nota: e'
  // quello che fa sembrare una campana quella che altrimenti e' un beep.
  g.gain.exponentialRampToValueAtTime(0.0001, t + (decadi ? dur * 0.98 : dur))
  for (const [f, gy] of [[freq, 1], [freq * 2, 0.5]] as const) {
    const o = c.createOscillator(); const og = c.createGain()
    o.type = type; o.frequency.value = f; og.gain.value = gy
    o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.02)
  }
}


// --- Quale suono, e quanto forte ------------------------------------------
//
// La scelta sta nel profilo, ma qui dentro non si legge il database: chi la sa
// la passa (all'avvio e a ogni cambio). Cosi' questo file resta quello che e' —
// un pezzo di audio — e non si porta dietro mezza app.

import { impostaScelta, sceltaCorrente, suonoDi, type Voce } from './suoni'

export const impostaSuono = impostaScelta

/**
 * Suona una voce del suono scelto (o di un altro, per l'anteprima).
 *
 * Il volume qui e' quello della manopola: dentro l'app l'audio esce dalle
 * cuffie come qualsiasi altro suono, quindi vale la stessa regola del servizio.
 */
export function suonaVoce(quale: 'tic' | 'via' | 'riposo' | 'fine', key?: string, vol?: number): void {
  const ora = sceltaCorrente()
  const voce: Voce = (key ? suonoDi(key) : ora.suono).voci[quale]
  const g = Math.max(0.02, (vol ?? ora.volume) / 100)
  if (voce.vibra) buzz(voce.vibra)
  const c = ctx()
  if (!c) return
  let t = 0
  for (const [hz, ms] of voce.note) {
    const dur = ms / 1000
    if (hz > 0) note(c, hz, t, dur, g, voce.onda, voce.decadi)
    t += dur
  }
}

/** Tic del conto alla rovescia. */
export function tick() { suonaVoce('tic') }

/** Fine recupero: si riparte. */
export function goSound() { suonaVoce('via') }

/** Fine lavoro: si respira. */
export function restCue() { suonaVoce('riposo') }

/** Seduta o cardio chiusi. */
export function finishCue() { suonaVoce('fine') }
