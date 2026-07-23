// Segnali sonori (WebAudio). Condivisi tra timer recupero e timer cardio.
// Onde triangle/square + gain alti → udibili anche con la musica in cuffia.

function ctx(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    return new C()
  } catch { return null }
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
export function tick() { const c = ctx(); if (c) note(c, 900, 0, 0.09, 0.3, 'square') }

/** Suono "GO": tre note ascendenti decise (inizio lavoro / fine recupero). */
export function goSound() {
  const c = ctx(); if (!c) return
  note(c, 660, 0, 0.14, 0.34); note(c, 880, 0.15, 0.14, 0.34); note(c, 1175, 0.31, 0.34, 0.42)
}

/** Segnale di riposo: due note discendenti morbide. */
export function restCue() {
  const c = ctx(); if (!c) return
  note(c, 540, 0, 0.16, 0.28); note(c, 400, 0.17, 0.26, 0.24)
}

/** Fine sessione: fanfara + allarme a beep ripetuti (più lungo e ben udibile). */
export function finishCue() {
  const c = ctx(); if (!c) return
  const fanfara: [number, number][] = [[784, 0], [988, 0.14], [1175, 0.28], [1568, 0.44]]
  fanfara.forEach(([f, s]) => note(c, f, s, s === 0.44 ? 0.5 : 0.15, 0.42, 'triangle'))
  const beeps = [0.95, 1.18, 1.5, 1.73]
  beeps.forEach((s, i) => note(c, i % 2 ? 988 : 1319, s, 0.18, 0.45, 'square'))
}
