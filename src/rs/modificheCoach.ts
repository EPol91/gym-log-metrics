// Le modifiche del coach alle schede gia' importate, portate una volta sola.
//
// Le schede 🦠 sono tue: importate una volta, da li' le cambi tu. Quando il
// coach cambia qualcosa e tu dici di portarlo, lo si porta qui — toccando solo
// quello che e' ancora com'era stato importato. Una coppia che hai gia' sciolto,
// o una riga del coach che hai riscritto, restano come le hai lasciate tu.

import { db, nowISO } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'

/**
 * 26.10.2026, D5. 1A e 1B non piu' in superset: tre serie ciascuno, 150″ pieni,
 * la French press dopo tutte le serie di curl, 35 kg fissi finche' non chiudi
 * 10-10-10. E il 2B diventa «per braccio». Il resto del protocollo non cambia.
 */
const D5_26_10 = 'etp.coach.d5.26-10-2026'

const RIGHE_D5: { prima: string; dopo: string; recupero?: number }[] = [
  {
    prima: '🦠 D5 · @A|B|C · 6-10 · carico fisso · RIR1-2 / RIR1-2 / RIR1 · superset con 1B',
    dopo: '🦠 D5 · @A|B|C · 6-10 · carico fisso 35 kg · RIR1-2 / RIR1-2 / RIR1 · rec 150″',
    recupero: 150,
  },
  {
    prima: '🦠 D5 · @A|B|C · 6-10 · carico fisso · RIR1-2 / RIR1-2 / RIR1 · rec 120-150″ dopo la coppia',
    dopo: '🦠 D5 · @A|B|C · 6-10 · carico fisso 35 kg · RIR1-2 / RIR1-2 / RIR1 · rec 150″ · dopo le tre serie di curl',
    recupero: 150,
  },
  {
    prima: '🦠 D5 · @A|B · 10-15 · RIR1 / RIR0-1 nelle fasi autorizzate · rec 90″ dopo la coppia',
    dopo: '🦠 D5 · @A|B · 10-15 per braccio · RIR1 / RIR0-1 nelle fasi autorizzate · rec 90″ dopo la coppia',
  },
]

/**
 * Gira una volta: finito il giro lascia un segno e non ci torna piu'.
 * Dice se ha cambiato qualcosa, per avvisarti.
 */
export async function portaModificheD5(): Promise<boolean> {
  try {
    if (localStorage.getItem(D5_26_10)) return false
  } catch { /* senza localStorage si riprova: costa due letture */ }

  let cambiato = false
  await db.transaction('rw', db.templates, db.exercises, async () => {
    // La coppia 1A+1B, sciolta: alla prossima seduta nascono separati.
    const schede = await db.templates.where('userId').equals(LOCAL_USER_ID).toArray()
    for (const s of schede) {
      if (!s.items.some((i) => i.coppia === 'D5-1')) continue
      const items = s.items.map((i) => {
        if (i.coppia !== 'D5-1') return i
        const { coppia: _via, ...resto } = i
        return resto
      })
      await db.templates.update(s.id, { items, updatedAt: nowISO() })
      cambiato = true
    }

    // La riga del coach nelle note, solo se e' ancora quella importata.
    const esercizi = await db.exercises.toArray()
    for (const ex of esercizi) {
      const righe = (ex.settings ?? '').split('\n')
      let toccato = false
      let recupero: number | undefined
      const nuove = righe.map((r) => {
        const m = RIGHE_D5.find((x) => r.trim() === x.prima)
        if (!m) return r
        toccato = true
        recupero = m.recupero ?? recupero
        return m.dopo
      })
      if (!toccato) continue
      await db.exercises.update(ex.id, {
        settings: nuove.join('\n'),
        ...(recupero ? { restSec: recupero } : {}),
        updatedAt: nowISO(),
      })
      cambiato = true
    }
  })

  try { localStorage.setItem(D5_26_10, nowISO()) } catch { /* riprova alla prossima */ }
  return cambiato
}
