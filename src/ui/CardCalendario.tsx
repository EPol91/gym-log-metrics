// Il calendario in cima a Oggi, al posto della mano che saluta.
//
// Un saluto occupa spazio e non dice niente. La data invece la guardi, e col
// tocco diventa il posto dove vedi quando ti sei allenato e cosa hai fatto —
// senza passare dallo storico, che e' un elenco e non un colpo d'occhio.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createPortal } from 'react-dom'
import { calendario, type GiornoCalendario } from '../rs/allenamento'
import { sessionElapsedSec } from '../db/repo'
import { volume, tonnage } from '../metrics/metrics'
import { LOCAL_USER_ID } from '../db/seed'
import { db } from '../db/db'
import type { SetEntry } from '../db/schema'
import { todayLocal, shiftDate } from '../util/date'
import { fmtData } from '../util/format'

const GIORNI = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

/** Lunedi della settimana di una data: la griglia parte sempre da li'. */
const lunedi = (d: string) => shiftDate(d, -((new Date(d + 'T00:00:00').getDay() + 6) % 7))

/** Il quadratino della data in cima, che apre il calendario. */
export function DataDiOggi({ onApri }: { onApri: () => void }) {
  const oggi = new Date()
  return (
    <button onClick={onApri} aria-label="Calendario"
      style={{
        background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12,
        padding: '6px 10px', textAlign: 'center', flex: '0 0 auto', lineHeight: 1.15,
      }}>
      <div className="muted" style={{ fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase' }}>
        {['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][oggi.getDay()]}
      </div>
      <div style={{ fontSize: 22, color: 'var(--gold)', fontFamily: "'Playfair Display', Georgia, serif" }}>
        {oggi.getDate()}
      </div>
      <div className="muted" style={{ fontSize: 9 }}>
        {MESI[oggi.getMonth()].slice(0, 3)} {oggi.getFullYear()}
      </div>
    </button>
  )
}

/** Il calendario a tutta pagina, con il dettaglio del giorno che tocchi. */
export function Calendario({ onClose, onApriSeduta }: {
  onClose: () => void
  onApriSeduta?: (sessionId: string) => void
}) {
  const oggi = todayLocal()
  const [mesiIndietro, setMesiIndietro] = useState(0)
  const [scelto, setScelto] = useState<string | null>(null)

  // Sei settimane per volta: piu' di cosi' non ci sta, meno non basta a capire
  // il ritmo di un ciclo che va per otto giorni.
  const fine = mesiIndietro === 0 ? oggi : shiftDate(oggi, -42 * mesiIndietro)
  const da = lunedi(shiftDate(fine, -41))
  const giorni = useLiveQuery(() => calendario(da, fine), [da, fine])
  // Un giorno puo' avere piu' sedute. Prima finivano in una mappa per data e la
  // seconda cancellava la prima: un allenamento che non compare e' peggio di un
  // allenamento scritto male.
  const perData = new Map<string, GiornoCalendario[]>()
  for (const g of giorni ?? []) {
    const lista = perData.get(g.date)
    if (lista) lista.push(g); else perData.set(g.date, [g])
  }

  const celle: string[] = []
  for (let d = da; d <= fine; d = shiftDate(d, 1)) celle.push(d)

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
          padding: '14px 16px', margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong>Calendario</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>

        <div className="row spread" style={{ alignItems: 'center' }}>
          <button className="chip" onClick={() => setMesiIndietro((v) => v + 1)}>‹ prima</button>
          <span className="small">{fmtData(da).slice(0, 5)} – {fmtData(fine).slice(0, 5)}</span>
          <button className="chip" disabled={mesiIndietro === 0} onClick={() => setMesiIndietro((v) => Math.max(0, v - 1))}>dopo ›</button>
        </div>

        <div className="row" style={{ gap: 4, marginTop: 10 }}>
          {GIORNI.map((g, i) => (
            <span key={i} className="muted" style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>{g}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 4 }}>
          {celle.map((d) => {
            const gg = perData.get(d) ?? []
            // Due sedute in un giorno: il quadratino resta uno — la griglia non
            // si allarga — ma si divide, cosi' si vede che sono due e di chi sono.
            const rs = gg.some((g) => g.delCoach), mie = gg.some((g) => !g.delCoach)
            const sfondo = !gg.length ? 'transparent'
              : rs && mie ? 'linear-gradient(135deg, var(--rs) 0 50%, var(--gold) 50% 100%)'
              : rs ? 'var(--rs)' : 'var(--gold)'
            return (
              <button key={d} onClick={() => setScelto(scelto === d ? null : d)}
                style={{
                  padding: 0, height: 38, borderRadius: 8, background: sfondo,
                  border: '1px solid ' + (gg.length ? (rs && !mie ? 'var(--rs)' : 'var(--gold)') : 'var(--line)'),
                  color: gg.length ? '#000' : 'var(--muted)', fontSize: 12,
                  outline: d === oggi ? '2px solid var(--text)' : 'none', outlineOffset: -2,
                  boxShadow: scelto === d ? '0 0 0 2px var(--text)' : 'none',
                  position: 'relative',
                }}>
                {new Date(d + 'T00:00:00').getDate()}
                {gg.length > 1 && (
                  <span style={{
                    position: 'absolute', top: 2, right: 3, fontSize: 9, fontWeight: 700,
                    lineHeight: 1, color: '#000', opacity: .75,
                  }}>×{gg.length}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="row" style={{ gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <span className="row" style={{ gap: 5 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--rs)' }} />
            <span className="muted" style={{ fontSize: 11 }}>dal coach</span>
          </span>
          <span className="row" style={{ gap: 5 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gold)' }} />
            <span className="muted" style={{ fontSize: 11 }}>tua</span>
          </span>
          <span className="row" style={{ gap: 5 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, border: '1px solid var(--line)' }} />
            <span className="muted" style={{ fontSize: 11 }}>riposo</span>
          </span>
        </div>

        {scelto && <DettaglioGiorno date={scelto} gg={perData.get(scelto) ?? []} onApriSeduta={onApriSeduta} />}
      </div>
    </div>,
    document.body,
  )
}

/** Cosa c'e' dentro le sedute di quel giorno: una lettura sola, non una per riga. */
async function dettaglio(date: string) {
  const sedute = (await db.sessions.where('userId').equals(LOCAL_USER_ID).toArray())
    .filter((x) => x.date === date && x.finishedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  if (!sedute.length) return []
  const nomi = new Map((await db.exercises.where('userId').equals(LOCAL_USER_ID).toArray()).map((e) => [e.id, e.name]))

  const out = []
  for (const s of sedute) {
    const entrate = await db.exerciseEntries.where({ sessionId: s.id }).sortBy('order')
    const esercizi = []
    let tutti: SetEntry[] = []
    for (const e of entrate) {
      const sets = await db.sets.where({ entryId: e.id }).sortBy('order')
      tutti = tutti.concat(sets)
      esercizi.push({ id: e.id, nome: nomi.get(e.exerciseId) ?? '—', sets })
    }
    out.push({
      id: s.id,
      durationMin: s.finishedAt ? Math.round(sessionElapsedSec(s) / 60) : null,
      vol: volume(tutti), ton: tonnage(tutti), esercizi,
    })
  }
  return out
}

/** Cosa hai fatto quel giorno: tutte le sedute, non solo la prima. */
function DettaglioGiorno({ date, gg, onApriSeduta }: {
  date: string; gg: GiornoCalendario[]; onApriSeduta?: (id: string) => void
}) {
  const sessioni = useLiveQuery(() => dettaglio(date), [date]) ?? []

  if (!gg.length) {
    return (
      <div className="card" style={{ marginTop: 12, marginBottom: 0 }}>
        <div className="row spread"><strong>{fmtData(date)}</strong><span className="muted small">riposo</span></div>
      </div>
    )
  }

  return (
    <>
      {gg.map((g, i) => (
        <SedutaDelGiorno key={g.id} date={date} g={g} sessione={sessioni.find((s) => s.id === g.id)}
          numero={gg.length > 1 ? `${i + 1}ª di ${gg.length}` : null} onApriSeduta={onApriSeduta} />
      ))}
    </>
  )
}

function SedutaDelGiorno({ date, g, sessione, numero, onApriSeduta }: {
  date: string; g: GiornoCalendario; numero: string | null
  sessione?: { id: string; durationMin: number | null; vol: number; ton: number; esercizi: { id: string; nome: string; sets: SetEntry[] }[] }
  onApriSeduta?: (id: string) => void
}) {
  return (
    <div className="card" style={{ marginTop: 12, marginBottom: 0, borderColor: g.delCoach ? 'var(--rs)' : 'var(--gold)' }}>
      <div className="row spread" style={{ alignItems: 'baseline' }}>
        <strong style={{ color: g.delCoach ? 'var(--rs)' : 'var(--gold)' }}>{g.nome}</strong>
        {/* Con due allenamenti in un giorno serve sapere quale stai guardando. */}
        <span className="muted small">{numero ? `${numero} · ` : ''}{fmtData(date)}</span>
      </div>

      <div className="row spread" style={{ marginTop: 8 }}>
        <span className="muted small">Orario</span>
        <span className="small">{g.dalle}{g.alle ? ` – ${g.alle}` : ' · in corso'}</span>
      </div>
      {sessione?.durationMin != null && (
        <div className="row spread"><span className="muted small">Durata</span><span className="small">{sessione.durationMin} min</span></div>
      )}
      <div className="row spread"><span className="muted small">Serie</span><span className="small">{g.serie}</span></div>
      {sessione && (
        <>
          <div className="row spread"><span className="muted small">Volume</span><span className="small">{sessione.vol} reps</span></div>
          <div className="row spread"><span className="muted small">Tonnellaggio</span><span className="small">{sessione.ton} kg</span></div>
        </>
      )}

      {/* Il nome per intero, anche su due righe: "Squat…" e "Abducto…" non
          dicono cosa hai fatto, ed e' l'unica cosa che questa riga deve dire. */}
      {!!sessione?.esercizi?.length && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
          {sessione.esercizi.map((e) => (
            <div key={e.id} className="row spread" style={{ padding: '3px 0', alignItems: 'baseline', gap: 10 }}>
              <span className="small" style={{ flex: '1 1 55%', minWidth: 0 }}>
                {e.nome}
              </span>
              <span className="muted" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', textAlign: 'right', flex: '0 1 auto' }}>
                {e.sets.map((s) => `${s.weight}×${s.reps}`).join('  ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {sessione && onApriSeduta && (
        <button className="chip" style={{ marginTop: 10 }} onClick={() => onApriSeduta(sessione.id)}>
          Apri la seduta ›
        </button>
      )}
    </div>
  )
}
