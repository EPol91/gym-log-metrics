// Le coppie del coach sulle schede gia' importate.
//
// La coppia (6A+6B e compagne) e' un dato scritto dentro la scheda, e la seduta
// la legge da li' per nascere gia' accoppiata. Ma le schede importate prima che
// quel dato esistesse non ce l'hanno: la seduta partiva con due esercizi
// sciolti. Reimportare il protocollo lo sistemerebbe, solo che nessuno deve
// reimportare niente per una cosa del genere — quindi glielo stampiamo qui.
//
// Per posizione, perche' e' esattamente come l'import le ha scritte, e solo se
// la scheda ha ancora tanti esercizi quanti ne ha il protocollo: se l'hai
// cambiata tu, e' tua e non la tocchiamo.

import { db } from '../db/db'
import { LOCAL_USER_ID } from '../db/seed'
import { SEDUTE_RS } from './protocollo'

/** Ripetibile a costo zero: se le coppie ci sono gia', non scrive nulla. */
export async function allineaCoppieRs(): Promise<number> {
  let toccate = 0
  const schede = await db.templates.where('userId').equals(LOCAL_USER_ID).toArray()

  for (const s of SEDUTE_RS) {
    const scheda = schede.find((t) => t.name === s.nome)
    if (!scheda || scheda.items.length !== s.esercizi.length) continue

    const attese = s.esercizi.filter((e) => e.coppia).length
    if (attese === 0) continue
    const gia = scheda.items.filter((i) => i.coppia).length
    if (gia === attese) continue

    const items = scheda.items
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((it, i) => {
        const coppia = s.esercizi[i]?.coppia
        return coppia ? { ...it, coppia } : it
      })
    await db.templates.update(scheda.id, { items })
    toccate++
  }
  return toccate
}
