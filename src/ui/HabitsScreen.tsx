import { useEffect } from 'react'
import { fmtData } from '../util/format'
import { useLiveQuery } from 'dexie-react-hooks'
import { STEPS, ensureHabits, getHabit, adjustHabitTarget, recentHabitEntries } from '../db/habits'

const SECTION: React.CSSProperties = {
  fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)',
}

/**
 * Abitudini. Oggi c'è l'obiettivo passi: il conteggio quotidiano arriverà da Health
 * Connect quando l'app girerà come applicazione Android, non è una cosa da compilare
 * a mano ogni sera. Il modello dati è già pronto per riceverlo.
 */
export function HabitsScreen() {
  const habit = useLiveQuery(() => getHabit(STEPS), [])
  const recent = useLiveQuery(() => recentHabitEntries(STEPS, 7), [])
  // La scrittura sta in un effetto, mai dentro una query reattiva.
  useEffect(() => { ensureHabits() }, [])

  const target = habit?.target ?? 10000
  const ultimo = recent?.[0]
  const oggi = ultimo ? Math.min(100, (ultimo.value / target) * 100) : 0

  return (
    <div className="col">
      <h1>Abitudini</h1>

      <span style={SECTION}>Passi</span>
      <div className="card" style={{ marginTop: 0 }}>
        <label className="fl">Obiettivo al giorno</label>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <button onClick={() => adjustHabitTarget(STEPS, -1000)}>−</button>
          <strong style={{ flex: 1, textAlign: 'center', fontSize: 26, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
            {target.toLocaleString('it-IT')}
          </strong>
          <button onClick={() => adjustHabitTarget(STEPS, +1000)}>＋</button>
        </div>

        {ultimo ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${oggi}%`, background: 'var(--gold)', borderRadius: 999, transition: 'width .3s' }} />
            </div>
            <p className="muted small" style={{ marginTop: 6, marginBottom: 0, textAlign: 'center' }}>
              <strong style={{ color: 'var(--text)' }}>{ultimo.value.toLocaleString('it-IT')}</strong> passi il {fmtData(ultimo.date)}
              {ultimo.source === 'manual' ? ' · inseriti a mano' : ' · da Health Connect'}
            </p>
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
            Nessun dato ancora. I passi arriveranno da <strong style={{ color: 'var(--text)' }}>Health Connect</strong> quando
            l'app girerà come applicazione Android: il tuo Whoop ci scrive già, con un paio di giorni di ritardo.
            L'obiettivo puoi fissarlo fin d'ora.
          </p>
        )}
      </div>

      {/* Storico: compare solo quando c'è qualcosa da mostrare. */}
      {recent && recent.length > 1 && (
        <>
          <span style={SECTION}>Ultimi giorni</span>
          <div className="card" style={{ marginTop: 0 }}>
            {recent.map((r) => (
              <div key={r.id} className="row spread small" style={{ padding: '5px 0' }}>
                <span className="muted">{fmtData(r.date)}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: r.value >= target ? 'var(--good)' : 'var(--text)' }}>
                  {r.value.toLocaleString('it-IT')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="muted small">
        Qui arriveranno anche i check-in ricorrenti e le altre abitudini: per ora c'è quello che
        possiamo davvero misurare.
      </p>
    </div>
  )
}
