import { useLiveQuery } from 'dexie-react-hooks'
import { getUser, updateUser } from '../db/repo'
import { COACH_BLOCKS_DEFAULT } from '../scores/coach'
import type { CoachBlock } from '../db/schema'

const BLOCCHI: { key: CoachBlock; nome: string; cosa: string }[] = [
  { key: 'salute', nome: 'Salute', cosa: 'recupero contro la tua media, debito di sonno, HRV in calo' },
  { key: 'nutrizione', nome: 'Nutrizione', cosa: 'proteine per chilo e calorie contro la fase' },
  { key: 'carico', nome: 'Carico e recupero', cosa: 'quante volte ti alleni da scarico' },
  { key: 'allenamento', nome: 'Allenamento', cosa: 'carico recente, e1RM fermo, trend forza, peso contro fase' },
  { key: 'riconoscimenti', nome: 'Riconoscimenti', cosa: 'PR, obiettivo settimanale, streak' },
]

/**
 * Cosa il Coach può guardare. Spegnere un blocco lo toglie dalle righe E dal
 * prompt del Coach AI: se non lo vuoi vedere, non deve nemmeno uscire di casa.
 */
export function CoachSettings() {
  const user = useLiveQuery(getUser, [])
  const attivi = new Set<CoachBlock>(user?.coachBlocks ?? COACH_BLOCKS_DEFAULT)

  function cambia(k: CoachBlock) {
    const next = new Set(attivi)
    if (next.has(k)) next.delete(k); else next.add(k)
    updateUser({ coachBlocks: BLOCCHI.map((b) => b.key).filter((x) => next.has(x)) })
  }

  return (
    <div className="card">
      <p className="muted small" style={{ marginTop: 0 }}>
        Il Coach mostra al massimo quattro righe, prendendole dai blocchi accesi e nell'ordine
        in cui stanno qui sotto.
      </p>
      <div className="col" style={{ gap: 5 }}>
        {BLOCCHI.map((b) => {
          const on = attivi.has(b.key)
          return (
            <button key={b.key} className={on ? 'sel' : ''} style={{ textAlign: 'left', padding: '9px 12px' }}
              onClick={() => cambia(b.key)}>
              <span className="row spread">
                <span>{b.nome}</span>
                <span className="small" style={{ flex: 'none', color: on ? 'var(--gold)' : 'var(--muted)' }}>
                  {on ? 'acceso' : 'spento'}
                </span>
              </span>
              <span className="muted small">{b.cosa}</span>
            </button>
          )
        })}
      </div>
      {attivi.size === 0 && (
        <p className="muted small" style={{ marginBottom: 0 }}>
          Tutti spenti: resta solo la riga del check di oggi.
        </p>
      )}
    </div>
  )
}
