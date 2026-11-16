// Le modifiche del coach alle schede gia' importate, portate una volta sola.
//
// Le schede 🦠 sono tue: importate una volta, da li' le cambi tu. Quando il
// coach cambia qualcosa e tu dici di portarlo, lo si porta qui — toccando solo
// quello che e' ancora com'era stato importato. Una coppia che hai gia' sciolto,
// o una riga del coach che hai riscritto, restano come le hai lasciate tu.

import { db, newId, nowISO } from '../db/db'
import { normalizeName } from '../db/catalog'
import type { MuscleGroup } from '../db/schema'
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

/**
 * 03.11.2026, sei esercizi nuovi in D1, D3, D4 e D5. Dove avevi gia' l'esercizio
 * (high row bilaterale, calf press orizzontale, seated row, rear delt a manubri)
 * vale il tuo, con lo storico che ha; il DB row e il Cable Fly 45° nascono nuovi.
 * Si cambia la riga della scheda solo se e' ancora l'esercizio importato: se
 * l'hai gia' cambiato tu, resta il tuo. E se il nuovo e' gia' in scheda, niente
 * doppione.
 */
const CAMBIO_03_11 = 'etp.coach.scheda.03-11-2026'

const SCAMBI_03_11: {
  codice: string; via: string; nomi: string[]; alias: string
  crea?: { muscle: MuscleGroup; restSec: number }
}[] = [
  { codice: 'D1', via: 'T-Bar Row', nomi: ['Chest-supported DB row su panca inclinata 30-40°'], alias: 'Chest-supported DB row su panca inclinata 30-40°', crea: { muscle: 'schiena', restSec: 150 } },
  { codice: 'D3', via: 'Standing Calf Raise', nomi: ['Horizontal Calf Press', 'Horizonal Calf Press'], alias: 'Horizontal calf press' },
  { codice: 'D4', via: 'Croci ai cavi', nomi: ['Cable Fly 45°'], alias: 'Cable fly 45°', crea: { muscle: 'petto', restSec: 90 } },
  { codice: 'D5', via: 'High row tecnica per upper back', nomi: ['Seated Row Upper Back'], alias: 'Seated row presa larga, upper back' },
  { codice: 'D5', via: 'Rear delt machine', nomi: ['DB Rear Delts'], alias: 'Rear delt fly manubri su panca inclinata' },
]

/** Le righe del coach accorciate all'import, riscritte come le scrive lui. */
const RIGHE_03_11: { prima: string; dopo: string }[] = [
  { prima: '🦠 D1 · @A|B · 10-15 per lato · RIR1-2 · rec 75-90″', dopo: '🦠 D1 · @A|B · 10-15 per lato · RIR1-2 · rec 75-90″ dopo entrambi i lati' },
  { prima: '🦠 D2 · @A|B|C · 12-20 · RIR2 / RIR1 / RIR0-1 · rec 60-75″', dopo: '🦠 D2 · @A|B|C · 12-20 · RIR2 / RIR1 / RIR0-1 · rec 60-75″ dopo entrambi i lati' },
  { prima: '🦠 D2 · @A|B · 10-15 · RIR1 / RIR0-1 nelle fasi autorizzate · rec 75-90″', dopo: '🦠 D2 · @A|B · 10-15 · RIR1 / RIR0-1 solo nelle fasi autorizzate · rec 75-90″' },
  { prima: '🦠 D4 · @A|B · 10-15 per lato · RIR1 · rec 75-90″', dopo: '🦠 D4 · @A|B · 10-15 per lato · RIR1 · rec 75-90″ dopo entrambi i lati' },
]

const stesso = (a: string, b: string) => normalizeName(a) === normalizeName(b)

/** Gira una volta, come quella della D5. Dice cosa ha cambiato, per avvisarti. */
export async function portaModifiche03_11(): Promise<number> {
  try {
    if (localStorage.getItem(CAMBIO_03_11)) return 0
  } catch { /* senza localStorage si riprova: costa due letture */ }

  let cambiati = 0
  await db.transaction('rw', db.templates, db.exercises, async () => {
    const schede = await db.templates.where('userId').equals(LOCAL_USER_ID).toArray()
    const esercizi = await db.exercises.toArray()
    const trova = (nome: string) => esercizi.find((e) => stesso(e.name, nome) || e.aliases.some((a) => stesso(a, nome)))

    for (const s of SCAMBI_03_11) {
      const scheda = schede.find((t) => t.name.trimStart().startsWith('🦠') && t.name.match(/\bD[1-5]\b/)?.[0] === s.codice)
      const vecchio = esercizi.find((e) => stesso(e.name, s.via))
      if (!scheda || !vecchio) continue
      const posto = scheda.items.findIndex((i) => i.exerciseId === vecchio.id)
      if (posto < 0) continue // l'hai gia' cambiato tu

      let nuovo = s.nomi.map(trova).find(Boolean)
      if (!nuovo && s.crea) {
        const ts = nowISO()
        nuovo = { id: newId(), userId: LOCAL_USER_ID, createdAt: ts, updatedAt: ts, name: s.nomi[0], muscle: s.crea.muscle, isCustom: true, aliases: [], restSec: s.crea.restSec }
        await db.exercises.add(nuovo)
        esercizi.push(nuovo)
      }
      if (!nuovo || scheda.items.some((i) => i.exerciseId === nuovo!.id)) continue

      // La scheda: stesso posto, l'esercizio nuovo.
      scheda.items = scheda.items.map((i, k) => (k === posto ? { ...i, exerciseId: nuovo!.id } : i))
      await db.templates.update(scheda.id, { items: scheda.items, updatedAt: nowISO() })

      // La riga del coach di quel giorno passa dal vecchio al nuovo; le tue restano.
      const tag = `🦠 ${s.codice} ·`
      const righeVecchio = (vecchio.settings ?? '').split('\n')
      const riga = righeVecchio.find((r) => r.trimStart().startsWith(tag))
      const restoVecchio = righeVecchio.filter((r) => !r.trimStart().startsWith(tag))
      vecchio.settings = restoVecchio.join('\n')
      await db.exercises.update(vecchio.id, { settings: vecchio.settings, updatedAt: nowISO() })
      if (riga) {
        const mie = (nuovo.settings ?? '').split('\n').filter((r) => r.trim() && !r.trimStart().startsWith(tag))
        nuovo.settings = [...mie, riga.trim()].join('\n')
      }
      if (!nuovo.aliases.some((a) => stesso(a, s.alias))) nuovo.aliases = [...nuovo.aliases, s.alias]
      await db.exercises.update(nuovo.id, { settings: nuovo.settings, aliases: nuovo.aliases, updatedAt: nowISO() })
      cambiati++
    }

    for (const ex of esercizi) {
      const righe = (ex.settings ?? '').split('\n')
      let toccato = false
      const nuove = righe.map((r) => {
        const m = RIGHE_03_11.find((x) => r.trim() === x.prima)
        if (!m) return r
        toccato = true
        return m.dopo
      })
      if (toccato) await db.exercises.update(ex.id, { settings: nuove.join('\n'), updatedAt: nowISO() })
    }
  })

  try { localStorage.setItem(CAMBIO_03_11, nowISO()) } catch { /* riprova alla prossima */ }
  return cambiati
}

/**
 * 08.11.2026, D2 e D3. Lo shoulder press di D2 passa dai manubri allo Smith:
 * vale il tuo «Shoulder Press Multipower», con lo storico che ha (dal 13.11).
 * E le righe 🦠 prendono i carichi che il coach ora scrive nella prescrizione:
 * incline press 92,5 / 77,5, shoulder press 65, calf press 188. Una riga si
 * cambia solo se e' ancora quella importata; un esercizio solo se e' ancora
 * quello importato. Le tue note restano.
 */
const CAMBIO_08_11 = 'etp.coach.scheda.08-11-2026'

const RIGHE_08_11: { prima: string; dopo: string }[] = [
  { prima: '🦠 D2 · @A|B · 6-9 top set / 9-12 back-off · RIR1 / RIR1-2 · rec 180″', dopo: '🦠 D2 · @A|B · 6-9 top set / 9-12 back-off · RIR1 / RIR1-2 · rec 180″ · top set 92,5 kg / back-off 77,5 kg' },
  { prima: '🦠 D3 · @A|B|C · 8-15 · RIR1 · rec 90-120″', dopo: '🦠 D3 · @A|B|C · 8-15 · RIR1 · rec 90-120″ · 188 kg' },
]
const SPALLE_PRIMA = '🦠 D2 · @A|B · 8-12 · RIR1-2 · rec 150″'
const SPALLE_DOPO = '🦠 D2 · @A|B · 8-12 · RIR1-2 · rec 150″ · 65 kg entrambe le serie'

/** Dice cosa ha cambiato: 1 se lo shoulder press e' passato allo Smith. */
export async function portaModifiche08_11(): Promise<number> {
  try {
    if (localStorage.getItem(CAMBIO_08_11)) return 0
  } catch { /* senza localStorage si riprova: costa due letture */ }

  let cambiati = 0
  await db.transaction('rw', db.templates, db.exercises, async () => {
    const schede = await db.templates.where('userId').equals(LOCAL_USER_ID).toArray()
    const esercizi = await db.exercises.toArray()
    const trova = (nome: string) => esercizi.find((e) => stesso(e.name, nome) || e.aliases.some((a) => stesso(a, nome)))

    // D2: DB Shoulder Press → Shoulder Press Multipower, stesso posto.
    const scheda = schede.find((t) => t.name.trimStart().startsWith('🦠') && t.name.match(/\bD[1-5]\b/)?.[0] === 'D2')
    const vecchio = esercizi.find((e) => stesso(e.name, 'DB Shoulder Press'))
    const posto = scheda && vecchio ? scheda.items.findIndex((i) => i.exerciseId === vecchio.id) : -1
    if (scheda && vecchio && posto >= 0) {
      let nuovo = trova('Shoulder Press Multipower') ?? trova('Smith Shoulder Press')
      if (!nuovo) {
        const ts = nowISO()
        nuovo = { id: newId(), userId: LOCAL_USER_ID, createdAt: ts, updatedAt: ts, name: 'Shoulder Press Multipower', muscle: 'spalle', isCustom: true, aliases: [], restSec: 150 }
        await db.exercises.add(nuovo)
        esercizi.push(nuovo)
      }
      if (!scheda.items.some((i) => i.exerciseId === nuovo!.id)) {
        scheda.items = scheda.items.map((i, k) => (k === posto ? { ...i, exerciseId: nuovo!.id } : i))
        await db.templates.update(scheda.id, { items: scheda.items, updatedAt: nowISO() })

        // La riga del coach passa dal vecchio al nuovo, col carico nuovo se e' ancora quella importata.
        const tag = '🦠 D2 ·'
        const righeVecchio = (vecchio.settings ?? '').split('\n')
        const riga = righeVecchio.find((r) => r.trimStart().startsWith(tag))
        vecchio.settings = righeVecchio.filter((r) => !r.trimStart().startsWith(tag)).join('\n')
        await db.exercises.update(vecchio.id, { settings: vecchio.settings, updatedAt: nowISO() })
        if (riga) {
          const mie = (nuovo.settings ?? '').split('\n').filter((r) => r.trim() && !r.trimStart().startsWith(tag))
          nuovo.settings = [...mie, riga.trim() === SPALLE_PRIMA ? SPALLE_DOPO : riga.trim()].join('\n')
        }
        const alias = 'Smith shoulder press panca 80°'
        if (!nuovo.aliases.some((a) => stesso(a, alias))) nuovo.aliases = [...nuovo.aliases, alias]
        await db.exercises.update(nuovo.id, {
          settings: nuovo.settings, aliases: nuovo.aliases,
          ...(nuovo.restSec ? {} : { restSec: 150 }),
          // Creato al volo il 13.11 era finito in «altro»: e' deltoide anteriore.
          ...(nuovo.muscle === 'altro' ? { muscle: 'spalle' as MuscleGroup } : {}),
          updatedAt: nowISO(),
        })
        cambiati++
      }
    }

    // I carichi nelle righe 🦠 di incline press e calf press.
    for (const ex of esercizi) {
      const righe = (ex.settings ?? '').split('\n')
      let toccato = false
      const nuove = righe.map((r) => {
        const x = RIGHE_08_11.find((y) => r.trim() === y.prima)
        if (!x) return r
        toccato = true
        return x.dopo
      })
      if (toccato) await db.exercises.update(ex.id, { settings: nuove.join('\n'), updatedAt: nowISO() })
    }
  })

  try { localStorage.setItem(CAMBIO_08_11, nowISO()) } catch { /* riprova alla prossima */ }
  return cambiati
}

/**
 * 16.11.2026 (18:06), D2. Il pushdown torna a 29,5 kg, RIR1 fisso e recupero
 * 120″: la riga 🦠 si cambia solo se e' ancora quella importata, e allora il
 * recupero dell'esercizio passa a 120″.
 */
const CAMBIO_16_11 = 'etp.coach.scheda.16-11-2026'
const PUSHDOWN_PRIMA = '🦠 D2 · @A|B · 10-15 · RIR1 / RIR0-1 solo nelle fasi autorizzate · rec 75-90″'
const PUSHDOWN_DOPO = '🦠 D2 · @A|B · 10-15 · RIR1 · rec 120″ · 29,5 kg'

export async function portaModifiche16_11(): Promise<boolean> {
  try {
    if (localStorage.getItem(CAMBIO_16_11)) return false
  } catch { /* senza localStorage si riprova */ }

  let cambiato = false
  await db.transaction('rw', db.exercises, async () => {
    for (const ex of await db.exercises.toArray()) {
      const righe = (ex.settings ?? '').split('\n')
      if (!righe.some((r) => r.trim() === PUSHDOWN_PRIMA)) continue
      await db.exercises.update(ex.id, {
        settings: righe.map((r) => (r.trim() === PUSHDOWN_PRIMA ? PUSHDOWN_DOPO : r)).join('\n'),
        restSec: 120,
        updatedAt: nowISO(),
      })
      cambiato = true
    }
  })

  try { localStorage.setItem(CAMBIO_16_11, nowISO()) } catch { /* riprova alla prossima */ }
  return cambiato
}
