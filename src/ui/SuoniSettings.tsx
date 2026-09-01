// Che suono fanno i timer, e quanto forte in cuffia.
//
// Sono cose che si scelgono con l'orecchio, non leggendo: ogni voce si ascolta
// dallo stesso identico percorso che userà in palestra, e il volume si prova
// mentre lo giri. Tarare a occhio da qui sarebbe stato indovinare per te.

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getUser, updateUser } from '../db/repo'
import { SUONI, SUONO_DEFAULT, VOLUME_DEFAULT, impostaScelta } from '../util/suoni'
import { suonaVoce } from '../util/sound'

export function SuoniSettings() {
  const user = useLiveQuery(getUser, [])
  const scelto = user?.suonoTimer ?? SUONO_DEFAULT
  const [volume, setVolume] = useState<number | null>(null)
  const vol = volume ?? user?.volumeBip ?? VOLUME_DEFAULT

  // Quello che scegli vale subito, anche prima di uscire dalla schermata.
  useEffect(() => { impostaScelta(scelto, vol) }, [scelto, vol])

  return (
    <>
      <p className="muted small" style={{ margin: '0 0 10px' }}>
        Tocca un suono per sentirlo. Vale per il conto alla rovescia del recupero e per il cardio,
        dentro e fuori dall'app.
      </p>

      {SUONI.map((s) => (
        <button key={s.key}
          onClick={() => { void updateUser({ suonoTimer: s.key }); impostaScelta(s.key, vol); suonaVoce('via', s.key, vol) }}
          style={{
            width: '100%', textAlign: 'left', marginBottom: 6, padding: '10px 12px',
            background: s.key === scelto ? 'var(--gold-bg)' : 'var(--surface-2)',
            border: '1px solid ' + (s.key === scelto ? 'var(--gold)' : 'var(--line)'),
            borderRadius: 10,
          }}>
          <div className="row spread" style={{ alignItems: 'center' }}>
            <strong style={{ fontSize: 14, color: s.key === scelto ? 'var(--gold)' : 'var(--text)' }}>{s.nome}</strong>
            <span className="muted" style={{ fontSize: 11 }}>{s.key === scelto ? '✓ scelto · risenti' : 'ascolta'}</span>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 3, lineHeight: 1.45 }}>{s.descrizione}</div>
        </button>
      ))}

      <label className="fl" style={{ marginTop: 12 }}>Volume in cuffia · {vol}%</label>
      <input type="range" min={5} max={100} step={5} value={vol}
        onChange={(e) => setVolume(Number(e.target.value))}
        onPointerUp={() => { void updateUser({ volumeBip: vol }); suonaVoce('tic', scelto, vol) }}
        style={{ width: '100%' }} />
      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button className="chip" onClick={() => suonaVoce('tic', scelto, vol)}>Prova il tic</button>
        <button className="chip" onClick={() => suonaVoce('via', scelto, vol)}>Prova il via</button>
        <button className="chip" onClick={() => suonaVoce('fine', scelto, vol)}>Prova la fine</button>
      </div>
      <p className="muted small" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
        Con le cuffie il suono te lo ritrovi dentro l'orecchio: qui decidi tu quanto forte.
        Dall'altoparlante resta pieno — lì il telefono è in tasca e deve bucare la sala.
      </p>
    </>
  )
}
