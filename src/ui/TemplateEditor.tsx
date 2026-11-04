import { useEffect, useRef, useState } from 'react'
import { useIndietro } from './useBloccoScroll'
import { useLiveQuery } from 'dexie-react-hooks'
import { getTemplate, createTemplate, updateTemplate, allExercises } from '../db/repo'
import { codiceScheda } from '../scores/confronto'
import { ExercisePicker } from './ExercisePicker'
import type { TemplateItem, WorkoutType } from '../db/schema'

const TYPES: { key: WorkoutType; label: string }[] = [
  { key: 'push', label: 'Push' }, { key: 'pull', label: 'Pull' }, { key: 'legs', label: 'Legs' },
  { key: 'upper', label: 'Upper' }, { key: 'lower', label: 'Lower' }, { key: 'fullbody', label: 'Full body' },
  { key: 'brosplit', label: 'Bro split' }, { key: 'custom', label: 'Libera' },
]

type Voce = Omit<TemplateItem, 'order'>

/**
 * La scheda: nome, tipo a chip, esercizi da trascinare per la maniglia ≡. Sotto
 * ogni esercizio la riga del coach di quella giornata; i superset si vedono con
 * la barra oro. templateId null = nuova scheda (creata solo al salvataggio:
 * niente schede vuote).
 */
export function TemplateEditor({ templateId, onBack }: { templateId: string | null; onBack: () => void }) {
  useIndietro(onBack)
  const tpl = useLiveQuery(() => (templateId ? getTemplate(templateId) : undefined), [templateId])
  const exercises = useLiveQuery(allExercises, []) ?? []
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkoutType>('custom')
  const [cardio, setCardio] = useState(false)
  const [items, setItems] = useState<Voce[]>([])
  const [picking, setPicking] = useState<null | 'aggiungi' | number>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [trascina, setTrascina] = useState<{ i: number; y0: number; h: number; dy: number } | null>(null)
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!templateId) { setLoaded(true); return } // nuova: parte vuota
    if (tpl && !loaded) {
      setName(tpl.name); setType(tpl.type); setCardio(!!tpl.cardio)
      // La coppia del superset si tiene: prima il salvataggio la perdeva.
      setItems([...tpl.items].sort((a, b) => a.order - b.order).map(({ exerciseId, coppia }) => ({ exerciseId, ...(coppia ? { coppia } : {}) })))
      setLoaded(true)
    }
  }, [tpl, loaded, templateId])

  const codice = codiceScheda(name)
  const nomeDi = (id: string) => exercises.find((e) => e.id === id)?.name ?? '—'
  const rigaCoach = (id: string) => {
    const r = (exercises.find((e) => e.id === id)?.settings ?? '').split('\n').find((x) => codice && x.trimStart().startsWith(`🦠 ${codice} ·`))
    return r?.trim().replace(/^🦠\s*D\d+\s*·\s*/, '')
  }
  // Superset A, B…: nell'ordine in cui compaiono.
  const lettere = new Map<string, string>()
  for (const it of items) if (it.coppia && !lettere.has(it.coppia)) lettere.set(it.coppia, String.fromCharCode(65 + lettere.size))

  function sposta(da: number, a: number) {
    if (a < 0 || a >= items.length || a === da) return
    const next = [...items]
    const [x] = next.splice(da, 1)
    next.splice(a, 0, x)
    setItems(next)
  }

  /** Unisce all'esercizio sotto in superset, oppure lo separa dalla sua coppia. */
  function coppia(i: number) {
    const next = items.map((x) => ({ ...x }))
    if (next[i].coppia) {
      const c = next[i].coppia
      delete next[i].coppia
      // Rimasto solo, l'altro non e' piu' un superset.
      const resto = next.filter((x) => x.coppia === c)
      if (resto.length === 1) delete resto[0].coppia
    } else if (next[i + 1]) {
      const c = next[i + 1].coppia ?? `${codice ?? 'S'}-${Date.now().toString(36)}`
      next[i].coppia = c
      next[i + 1].coppia = c
    }
    setItems(next)
  }

  async function save() {
    const payload = { name, type, cardio, items: items.map((x, order) => ({ ...x, order })) }
    if (templateId) await updateTemplate(templateId, payload)
    else { const id = await createTemplate(name, type); await updateTemplate(id, payload) }
    onBack()
  }

  // Trascinare: la riga segue il dito e scambia posto quando supera mezza riga.
  const inizia = (i: number) => (e: React.PointerEvent) => {
    const riga = (e.currentTarget as HTMLElement).closest('.trasc') as HTMLElement | null
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setMenu(null)
    setTrascina({ i, y0: e.clientY, h: riga?.getBoundingClientRect().height ?? 56, dy: 0 })
  }
  const muovi = (e: React.PointerEvent) => {
    if (!trascina) return
    const dy = e.clientY - trascina.y0
    const passi = Math.round(dy / trascina.h)
    const a = Math.max(0, Math.min(items.length - 1, trascina.i + passi))
    if (a !== trascina.i) {
      sposta(trascina.i, a)
      setTrascina({ ...trascina, i: a, y0: trascina.y0 + (a - trascina.i) * trascina.h, dy: dy - (a - trascina.i) * trascina.h })
    } else setTrascina({ ...trascina, dy })
  }
  const fine = () => setTrascina(null)

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="barra-s">
        <button className="ind" style={{ color: 'var(--muted)' }} onClick={onBack}>Annulla</button>
        <span className="tit">Scheda</span>
        <button className="ind" style={{ fontWeight: 700, opacity: name.trim() ? 1 : 0.4 }} disabled={!name.trim()} onClick={save}>Salva</button>
      </div>

      <div className="campo-a">
        <label>Nome</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Push A" />
      </div>

      {!cardio && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {TYPES.map((t) => <button key={t.key} className={type === t.key ? 'chip on' : 'chip'} onClick={() => setType(t.key)}>{t.label}</button>)}
        </div>
      )}

      {/* Una scheda senza esercizi puo' essere un cardio o un allenamento che
          stai ancora costruendo: la differenza la sai solo tu. */}
      <div className="row spread" style={{ padding: '2px 4px', alignItems: 'center' }}>
        <span style={{ fontSize: 13.5 }}>Solo cardio <span className="muted" style={{ fontSize: 12 }}>· elenco a parte</span></span>
        <button role="switch" aria-checked={cardio} aria-label="Solo cardio" className={cardio ? 'interruttore on' : 'interruttore'} onClick={() => setCardio((v) => !v)} />
      </div>

      <div className="row spread" style={{ margin: '2px 4px -4px', alignItems: 'baseline' }}>
        <span className="etichetta-p">{items.length} {items.length === 1 ? 'esercizio' : 'esercizi'}</span>
        {items.length > 1 && <span className="muted" style={{ fontSize: 11.5 }}>trascina ≡ per spostare</span>}
      </div>

      {items.length === 0 ? <p className="muted small">Nessun esercizio. Aggiungine uno.</p> : (
        <div className="lista-p" ref={lista}>
          {items.map((it, i) => {
            const preso = trascina?.i === i
            const coach = rigaCoach(it.exerciseId)
            return (
              <div key={`${it.exerciseId}-${i}`} className="trasc"
                style={preso ? { transform: `translateY(${trascina!.dy}px)`, background: 'var(--surface-3)', position: 'relative', zIndex: 2, boxShadow: '0 8px 20px #0009' } : undefined}>
                <div className="row" style={{ gap: 10, padding: '10px 8px 10px 0', alignItems: 'center' }}>
                  <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 3, background: it.coppia ? 'var(--gold)' : 'transparent', flex: 'none' }} />
                  <span className="maniglia-a" onPointerDown={inizia(i)} onPointerMove={muovi} onPointerUp={fine} onPointerCancel={fine} aria-label="Sposta">≡</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                    {nomeDi(it.exerciseId)}
                    <span className="sotto" style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
                      {it.coppia && <span style={{ color: 'var(--gold)' }}>superset {lettere.get(it.coppia)}{coach ? ' · ' : ''}</span>}
                      {coach}
                    </span>
                  </span>
                  <button className="icona-a senza" aria-label="Altro" onClick={() => setMenu(menu === i ? null : i)}>⋯</button>
                </div>
                {menu === i && (
                  <div className="row" style={{ gap: 6, padding: '0 12px 10px 30px', flexWrap: 'wrap' }}>
                    <button className="chip" onClick={() => { setMenu(null); setPicking(i) }}>⇄ Sostituisci</button>
                    {(it.coppia || items[i + 1]) && (
                      <button className="chip" onClick={() => { setMenu(null); coppia(i) }}>{it.coppia ? 'Separa dal superset' : 'Superset con il successivo'}</button>
                    )}
                    <button className="chip" disabled={i === 0} onClick={() => { setMenu(null); sposta(i, i - 1) }}>↑</button>
                    <button className="chip" disabled={i === items.length - 1} onClick={() => { setMenu(null); sposta(i, i + 1) }}>↓</button>
                    <button className="chip" style={{ color: '#e57373' }} onClick={() => { setMenu(null); setItems(items.filter((_, k) => k !== i)) }}>✕ Togli</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {picking != null ? (
        <ExercisePicker
          onPick={(id) => {
            if (picking === 'aggiungi') setItems([...items, { exerciseId: id }])
            else setItems(items.map((x, k) => (k === picking ? { ...x, exerciseId: id } : x)))
            setPicking(null)
          }}
          onClose={() => setPicking(null)} />
      ) : (
        <button className="ghost" style={{ height: 44 }} onClick={() => setPicking('aggiungi')}>＋ Aggiungi esercizio</button>
      )}
    </div>
  )
}
