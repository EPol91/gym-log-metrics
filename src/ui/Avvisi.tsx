import { useEffect, useState } from 'react'
import { avvisiDiOggi, mettiVia, type Avviso, type Tipo } from '../util/promemoria'
import { segnaUscita, oraAdesso } from '../tempo/orari'
import { todayLocal } from '../util/date'

/**
 * Gli avvisi, dentro l'app.
 *
 * Nella tendina di Android arrivano solo nell'app installata e solo col
 * permesso dato: le stesse cose da fare valgono anche a notifiche spente e nel
 * browser, e una notifica scorsa via alle sette del mattino e' come non
 * averla mai avuta. Qui restano finche' non le metti via.
 *
 * La card non c'e' quando non c'e' niente da dire: e' il punto di tutto il
 * meccanismo.
 */

/** Dove porta ogni avviso: dirlo e basta lascerebbe il lavoro a te. */
const DOVE: Partial<Record<Tipo, { testo: string; dove: 'food' | 'health' | 'train'; sezione?: string }>> = {
  peso: { testo: 'Pesati', dove: 'health', sezione: 'corpo' },
  whoop: { testo: 'Sincronizza', dove: 'health', sezione: 'vitali' },
  recupero: { testo: 'Allenati', dove: 'train' },
  pasto: { testo: 'Segna', dove: 'food' },
}

export function Avvisi({ onGo }: { onGo: (dove: 'food' | 'health' | 'train', sezione?: string) => void }) {
  const [avvisi, setAvvisi] = useState<Avviso[] | null>(null)

  useEffect(() => { void avvisiDiOggi().then(setAvvisi) }, [])

  function via(t: Tipo, avviso?: Avviso) {
    mettiVia(t, avviso)
    setAvvisi((p) => (p ?? []).filter((a) => a.tipo !== t))
  }

  if (!avvisi?.length) return null

  // Una riga per avviso, con la ✕ a destra: in Oggi deve entrare tutto in una
  // schermata. La spiegazione «tornano domani» sta in Profilo → Coach, dove si
  // spengono.
  return (
    <div className="col" style={{ gap: 6 }}>
      {avvisi.map((a) => {
        const azione = DOVE[a.tipo]
        return (
          <div key={a.tipo} className="card" style={{ margin: 0, padding: '7px 8px 7px 12px', display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 14, flex: 'none' }}>🔔</span>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.35 }}>
              <span style={{ fontWeight: 600 }}>{a.titolo}</span>
              <span className="muted"> · {a.testo}</span>
            </div>
            {azione && (
              <button className="chip" style={{ padding: '4px 10px', flex: 'none' }}
                onClick={() => { via(a.tipo, a); onGo(azione.dove, azione.sezione) }}>{azione.testo}</button>
            )}
            {/* L'uscita si segna da qui: l'ora e' adesso. Ignorarla vale «al solito». */}
            {a.tipo === 'uscita' && (
              <button className="chip on" style={{ padding: '4px 10px', flex: 'none' }}
                onClick={async () => { await segnaUscita(todayLocal(), oraAdesso()); via(a.tipo) }}>Esco ora</button>
            )}
            <button className="chip" style={{ padding: 0, width: 28, height: 28, borderRadius: '50%', flex: 'none', color: 'var(--muted)' }}
              onClick={() => via(a.tipo, a)} aria-label="Metti via">✕</button>
          </div>
        )
      })}
    </div>
  )
}
