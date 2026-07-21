// Segnali sonori (WebAudio). Condivisi tra timer recupero e timer cardio.

function ctx(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    return new C()
  } catch { return null }
}

function note(c: AudioContext, freq: number, start: number, dur: number, gain = 0.16) {
  const o = c.createOscillator(); const g = c.createGain()
  o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(c.destination)
  g.gain.setValueAtTime(0.0001, c.currentTime + start)
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.02)
}

/** Tick breve del conto alla rovescia. */
export function tick() { const c = ctx(); if (c) note(c, 620, 0, 0.07, 0.12) }

/** Suono "GO": tre note ascendenti (inizio lavoro / fine recupero). */
export function goSound() {
  const c = ctx(); if (!c) return
  note(c, 660, 0, 0.12); note(c, 830, 0.13, 0.12); note(c, 1046, 0.27, 0.28, 0.2)
}

/** Segnale di riposo: due note discendenti morbide. */
export function restCue() {
  const c = ctx(); if (!c) return
  note(c, 520, 0, 0.14); note(c, 390, 0.15, 0.22, 0.16)
}

/** Fine sessione: fanfara breve. */
export function finishCue() {
  const c = ctx(); if (!c) return
  note(c, 660, 0, 0.12); note(c, 880, 0.13, 0.12); note(c, 1046, 0.26, 0.12); note(c, 1318, 0.39, 0.35, 0.2)
}
