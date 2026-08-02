import { useEffect, useState } from 'react'
import { avvisiDiOggi, mettiVia, type Avviso, type Tipo } from '../util/promemoria'

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
}

export function Avvisi({ onGo }: { onGo: (dove: 'food' | 'health' | 'train', sezione?: string) => void }) {
  const [avvisi, setAvvisi] = useState<Avviso[] | null>(null)

  useEffect(() => { void avvisiDiOggi().then(setAvvisi) }, [])

  function via(t: Tipo) {
    mettiVia(t)
    setAvvisi((p) => (p ?? []).filter((a) => a.tipo !== t))
  }

  if (!avvisi?.length) return null

  return (
    <div className="card" style={{ borderColor: 'var(--line)' }}>
      <div className="row spread" style={{ alignItems: 'center', marginBottom: 6 }}>
        <span className="small" style={{ color: 'var(--muted)', letterSpacing: '.1em' }}>🔔 AVVISI</span>
        <span className="muted small">{avvisi.length}</span>
      </div>

      {avvisi.map((a, i) => {
        const azione = DOVE[a.tipo]
        return (
          <div key={a.tipo} style={{ marginTop: i ? 10 : 0 }}>
            <div className="row spread" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <p className="small" style={{ margin: 0 }}>{a.titolo}</p>
                <p className="muted" style={{ margin: '1px 0 0', fontSize: 12 }}>{a.testo}</p>
              </div>
              <span className="row" style={{ gap: 5, flex: 'none' }}>
                {azione && (
                  <button className="chip" style={{ padding: '4px 10px' }}
                    onClick={() => { via(a.tipo); onGo(azione.dove, azione.sezione) }}>{azione.testo}</button>
                )}
                <button className="chip" style={{ padding: '4px 9px', color: 'var(--muted)' }}
                  onClick={() => via(a.tipo)} aria-label="Metti via">✕</button>
              </span>
            </div>
          </div>
        )
      })}
      <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
        Tornano domani se la cosa è ancora da fare. Si spengono in Profilo → Coach.
      </p>
    </div>
  )
}
