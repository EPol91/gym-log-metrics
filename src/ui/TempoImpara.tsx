// Salute → Tempo, in cima: cosa sta imparando dalle tue sere.
//
// La proposta per stasera (solo cena e letto, costruiti intorno all'allenamento
// che fai tu), poi le scoperte, ognuna con le sere su cui si regge. Finche' le
// sere non bastano c'e' un avviso solo: quante ne ha e quante ne servono.

import { useLiveQuery } from 'dexie-react-hooks'
import { imparato, MINIMO, type Fascia, type Scoperta } from '../tempo/impara'
import { durata } from '../tempo/giornata'
import { hhmm } from '../tempo/orari'

/** Come si dice ogni fascia dentro una frase. */
const FRASE: Record<string, string> = {
  'meno di 1h30': 'meno di 1h30',
  '1h30 – 2h': 'fra 1h30 e 2h',
  '2h e oltre': '2 ore piene',
  'entro 45′': 'entro 45′',
  '45′ – 1h': 'fra 45′ e un\'ora',
  'oltre 1h': 'oltre un\'ora dopo',
}
const frase = (f: Fascia) => FRASE[f.etichetta] ?? f.etichetta

/** Sotto questa differenza di recupero non si dice che una fascia e' meglio. */
const DIFFERENZA = 3

function Barre({ s, una, tante }: { s: Scoperta; una: string; tante: string }) {
  const valori = s.fasce.filter((f) => f.sere >= MINIMO && f.recupero != null).map((f) => f.recupero!)
  const min = Math.min(...valori), max = Math.max(...valori)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 9, alignItems: 'end' }}>
      {s.fasce.map((f) => {
        const conta = f.sere >= MINIMO && f.recupero != null
        const top = conta && f === s.meglio && max - min >= DIFFERENZA
        const alto = conta ? 14 + ((f.recupero! - min) / (max - min || 1)) * 38 : 10
        return (
          <div key={f.etichetta} style={{ textAlign: 'center' }}>
            <div style={{ height: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <i style={{
                display: 'block', width: 34, height: alto, borderRadius: '6px 6px 2px 2px',
                background: top ? 'linear-gradient(180deg, var(--good), #2f7a48)' : conta ? '#3a3730' : 'transparent',
                ...(conta ? {} : { border: '1px dashed #3a3730' }),
              }} />
            </div>
            <div style={{ fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 15, marginTop: 3, color: top ? 'var(--good)' : conta ? 'var(--text)' : 'var(--faint)' }}>
              {conta ? `${f.recupero}%` : '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.3 }}>{f.etichetta}</div>
            <div style={{ fontSize: 10, color: 'var(--faint)' }}>{f.sere} {f.sere === 1 ? una : tante}</div>
          </div>
        )
      })}
    </div>
  )
}

function Chip({ s, parola }: { s: Scoperta; parola: string }) {
  return (
    <span className={'chip' + (s.regge ? ' on' : '')} style={{ fontSize: 11, padding: '2px 9px' }}>
      {s.sere} {parola}{s.regge ? '' : ' · pochi dati'}
    </span>
  )
}

const pochi = `Me ne servono almeno ${MINIMO} in due fasce diverse per dirlo con sicurezza.`

function CenaLetto({ s }: { s: Scoperta }) {
  const { meglio: m, peggio: p } = s
  const conta = s.regge && m && p && m.recupero! - p.recupero! >= DIFFERENZA
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="row spread"><span className="eyebrow">Cena → letto</span><Chip s={s} parola="notti" /></div>
      <h3 style={{ fontFamily: 'var(--f-testo)', fontSize: 14.5, fontWeight: 700, margin: '6px 0 3px' }}>
        {!s.regge ? 'Quanto tempo lasciare fra cena e letto' : conta ? `Con ${frase(m!)} fra cena e letto dormi meglio` : 'Per ora la distanza fra cena e letto non cambia il recupero'}
      </h3>
      <p style={{ margin: 0, fontSize: 12.5, color: '#cfc9bc', lineHeight: 1.45 }}>
        {!s.regge ? pochi
          : conta ? <>{m!.hrv != null && p!.hrv != null && <>HRV {m!.hrv} contro {p!.hrv} e </>}recupero {m!.recupero}% contro {p!.recupero}%, rispetto alle notti in cui vai a letto {frase(p!)} dopo cena.</>
          : <>Recupero {m!.recupero}% contro {p!.recupero}%: una differenza troppo piccola per contare.</>}
      </p>
      <Barre s={s} una="notte" tante="notti" />
      {s.regge && <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 7 }}>recupero medio WHOOP · regge su {s.sere} notti</div>}
    </div>
  )
}

function AllenaCena({ s }: { s: Scoperta }) {
  const { meglio: m, peggio: p } = s
  const conta = s.regge && m && p && m.recupero! - p.recupero! >= DIFFERENZA
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="row spread"><span className="eyebrow">Allenamento → cena</span><Chip s={s} parola="sere" /></div>
      <h3 style={{ fontFamily: 'var(--f-testo)', fontSize: 14.5, fontWeight: 700, margin: '6px 0 3px' }}>
        {!s.regge ? 'Quanto aspettare a cenare dopo l\'allenamento' : conta ? `Quando ceni ${frase(m!)} dalla fine dell'allenamento, recuperi meglio` : 'Per ora l\'attesa prima di cena non cambia il recupero'}
      </h3>
      <p style={{ margin: 0, fontSize: 12.5, color: '#cfc9bc', lineHeight: 1.45 }}>
        {!s.regge ? pochi
          : conta ? <>Recupero {m!.recupero}% contro {p!.recupero}%{m!.letto != null && p!.letto != null && <>, a letto alle {hhmm(m!.letto)} contro le {hhmm(p!.letto)}</>}, rispetto a quando ceni {frase(p!)}.</>
          : <>Recupero {m!.recupero}% contro {p!.recupero}%: una differenza troppo piccola per contare.</>}
      </p>
      <Barre s={s} una="sera" tante="sere" />
      {s.regge && <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 7 }}>recupero medio WHOOP · regge su {s.sere} sere</div>}
    </div>
  )
}

export function TempoImpara() {
  const im = useLiveQuery(() => imparato(), [])
  if (!im) return null
  const { cenaLetto: cl, allenaCena: ac, oggi } = im

  // Niente che regga: un avviso solo, con quante sere ci sono per fascia.
  if (!cl.regge && !ac.regge) {
    return (
      <div className="card" style={{ margin: 0, borderColor: '#3d3420' }}>
        <div className="eyebrow" style={{ color: 'var(--gold)' }}>Cosa sta imparando · pochi dati</div>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#cfc9bc', lineHeight: 1.45 }}>
          Ho {cl.sere} {cl.sere === 1 ? 'notte' : 'notti'} con cena e letto segnati: per dirti qualcosa di serio me ne
          servono almeno {MINIMO} in due fasce diverse. Segna l'ora di fine cena ogni sera e qui arrivano la proposta per
          stasera e le scoperte.
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--faint)' }}>
          cena → letto: {cl.fasce.map((f) => `${f.etichetta} ${f.sere}`).join(' · ')}
        </p>
      </div>
    )
  }

  // La proposta: solo le righe che reggono, e solo se la differenza conta.
  const vale = (s: Scoperta) => s.regge && s.meglio && s.peggio && s.meglio.recupero! - s.peggio.recupero! >= DIFFERENZA
  const attesa = vale(ac) ? ac.meglio! : undefined
  const distanza = vale(cl) ? cl.meglio! : undefined
  const fine = oggi.fineAllena ?? im.fineDiSolito
  const entro = attesa && Number.isFinite(attesa.a) ? attesa.a - 1 : undefined
  const cenaEntro = oggi.cena ?? (fine != null && entro != null ? fine + entro : undefined)
  const lettoDa = cenaEntro != null && distanza && distanza.da > 0 ? cenaEntro + distanza.da : undefined

  return (
    <>
      {(attesa || distanza) && (
        <div className="card" style={{ margin: 0, borderColor: '#3d3420', background: 'radial-gradient(120% 90% at 100% 0%, #2a2312 0%, #17150f 45%, var(--surface) 100%)' }}>
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>Stasera{oggi.codice ? ` · dopo la ${oggi.codice}` : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 4, alignItems: 'baseline', marginTop: 6 }}>
            {attesa && <>
              <b style={{ fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 20, color: 'var(--gold)' }}>
                {Number.isFinite(attesa.a) ? `≤ ${attesa.a - 1}′` : `> ${durata(attesa.da - 1)}`}
              </b>
              <span style={{ fontSize: 13 }}>dalla fine dell'allenamento alla cena</span>
            </>}
            {distanza && <>
              <b style={{ fontFamily: 'var(--f-numeri)', fontWeight: 600, fontSize: 20, color: 'var(--gold)' }}>
                {distanza.da > 0 ? `≥ ${durata(distanza.da).replace('h00', 'h')}` : `< ${durata(distanza.a).replace('h00', 'h')}`}
              </b>
              <span style={{ fontSize: 13 }}>dalla cena al letto</span>
            </>}
          </div>
          {(cenaEntro != null || lettoDa != null) && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              {oggi.cena != null
                ? <>Cena finita alle {hhmm(oggi.cena)}{lettoDa != null && <>: a letto dalle {hhmm(lettoDa)}</>}.</>
                : <>{oggi.fineAllena != null ? 'Hai finito' : 'Se finisci'} alle {hhmm(fine!)}{cenaEntro != null && <>: cena entro le {hhmm(cenaEntro)}</>}{lettoDa != null && <>, a letto dalle {hhmm(lettoDa)}</>}.</>}
            </div>
          )}
        </div>
      )}
      <CenaLetto s={cl} />
      <AllenaCena s={ac} />
    </>
  )
}
