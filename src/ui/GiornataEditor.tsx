// La giornata del coach, correggibile prima di applicarla.
//
// Prima si poteva solo applicare a scatola chiusa e poi sistemare in Cibo: gli
// stessi tre cambi di alimento, ogni singolo giorno. Qui la giornata si apre,
// si vede riga per riga coi macro, si corregge una volta sola — e da lì in poi
// «Applica» porta in Cibo la TUA versione.
//
// Quello che ha prescritto il coach non si perde: resta sotto ogni riga
// (rsOriginale) ed è quello che l'RS continua a confrontare con quello che
// mangi davvero. Se sostituissimo anche quello, il report direbbe che hai
// seguito il piano alla lettera qualunque cosa tu abbia messo nel piatto.

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createPortal } from 'react-dom'
import { getDayTemplate, updateDayTemplateMeals, listFoods, macrosFor, listDayTypes, sincronizzaObiettivo, pastoComeItems } from '../db/diet'
import { pastoCopiato } from '../util/appuntiPasto'
import { computeRecipe, macrosForAmount, type RecipeAmount } from '../db/recipes'
import { FoodChooser } from './FoodChooser'
import { GIORNATE_RS } from '../rs/protocollo'
import { useBloccoScroll, useIndietro } from './useBloccoScroll'
import type { DayTemplateItem, DayTemplateMeal, Food, Macros, Recipe } from '../db/schema'

const VUOTO: Macros = { kcal: 0, carbs: 0, protein: 0, fat: 0 }

const somma = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal,
  carbs: Math.round((a.carbs + b.carbs) * 10) / 10,
  protein: Math.round((a.protein + b.protein) * 10) / 10,
  fat: Math.round((a.fat + b.fat) * 10) / 10,
})

/** I macro di una riga: dal cibo vero se c'è, altrimenti dalla fotografia salvata. */
function macroDi(it: DayTemplateItem, cibi: Map<string, Food>): Macros {
  const f = cibi.get(it.foodId)
  if (f && !it.recipeId) return macrosFor(f.per100, it.grams)
  return it.macrosSnapshot ?? VUOTO
}

function nomeDi(it: DayTemplateItem, cibi: Map<string, Food>): string {
  return cibi.get(it.foodId)?.name ?? it.nameSnapshot ?? '—'
}

/** Riga di macro compatta, coi colori di sempre: C, P, G. */
function Macro({ m, grande }: { m: Macros; grande?: boolean }) {
  return (
    <span style={{ flex: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ display: 'block', color: 'var(--gold)', fontSize: grande ? 14 : undefined }}>{m.kcal}</span>
      <span style={{ fontSize: 11 }}>
        <span style={{ color: 'var(--carb)' }}>C: {m.carbs}</span>,{' '}
        <span style={{ color: 'var(--prot)' }}>P: {m.protein}</span>,{' '}
        <span style={{ color: 'var(--fat)' }}>G: {m.fat}</span>
      </span>
    </span>
  )
}

/** Il pannello di una riga: grammi, sostituzione, ritorno al coach, elimina. */
function RigaSheet({ it, nome, onGrammi, onSostituisci, onElimina, onClose }: {
  it: DayTemplateItem; nome: string
  onGrammi: (g: number) => void; onSostituisci: () => void; onElimina: () => void; onClose: () => void
}) {
  useBloccoScroll()
  useIndietro(onClose)
  const [g, setG] = useState(String(it.grams))
  const originale = it.rsOriginale
  const cambiata = originale != null && (originale.nome !== nome || originale.g !== it.grams)

  function salva() {
    const n = Number(g.replace(',', '.'))
    if (Number.isFinite(n) && n > 0) onGrammi(Math.round(n))
    onClose()
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onClick={onClose}>
      <div className="card" style={{ width: 'min(420px, 100%)', margin: 0 }} onClick={(e) => e.stopPropagation()}>
        <strong style={{ display: 'block' }}>{nome}</strong>
        {originale && (
          <p className="muted small" style={{ margin: '2px 0 0' }}>
            Il coach qui scrive: {originale.nome} · {originale.g} g
          </p>
        )}

        {/* Riga-ricetta: la quantita' e' in porzioni, e si cambia rifacendo la
            scelta — non scrivendoci dentro dei grammi che non vogliono dire niente. */}
        {it.recipeId ? (
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            📖 Ricetta · {it.portions != null ? `${String(it.portions).replace('.', ',')} ${it.portions === 1 ? 'porzione' : 'porzioni'}` : `${it.grams} g`}
          </p>
        ) : (
          <>
            <label className="fl" style={{ marginTop: 10 }}>Grammi</label>
            <input inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} autoFocus
              style={{ width: '100%', fontSize: 20, textAlign: 'center', fontVariantNumeric: 'tabular-nums', padding: '8px 0' }} />
          </>
        )}

        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <button className="chip" style={{ flex: 1 }} onClick={onSostituisci}>⇄ Sostituisci</button>
          {cambiata && <button className="chip" style={{ flex: 1 }} onClick={() => { onClose(); onGrammi(originale!.g) }}>↺ Come il coach</button>}
        </div>

        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <button className="ghost" style={{ flex: 1, color: '#e57373' }} onClick={() => { onElimina(); onClose() }}>🗑 Elimina</button>
          <button className="ghost" style={{ flex: 1 }} onClick={onClose}>Annulla</button>
          <button className="primary" style={{ flex: 1 }} onClick={salva}>Salva</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Quante porzioni (o quanti grammi) di ricetta mettere nella riga. */
function QuantitaRicetta({ ricetta, cibi, onConferma, onClose }: {
  ricetta: Recipe; cibi: Map<string, Food>
  onConferma: (item: DayTemplateItem) => void; onClose: () => void
}) {
  useBloccoScroll()
  useIndietro(onClose)
  const aPorzioni = ricetta.mode === 'servings'
  const [q, setQ] = useState(aPorzioni ? '1' : '150')
  const calc = computeRecipe(ricetta, cibi)
  const n = Number(q.replace(',', '.'))
  const valido = Number.isFinite(n) && n > 0
  const amount: RecipeAmount | null = !valido ? null : aPorzioni ? { portions: n } : { grams: n }
  const macros = amount ? macrosForAmount(ricetta, calc, amount) : VUOTO

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onClick={onClose}>
      <div className="card" style={{ width: 'min(420px, 100%)', margin: 0 }} onClick={(e) => e.stopPropagation()}>
        <strong style={{ display: 'block' }}>📖 {ricetta.name}</strong>
        <label className="fl" style={{ marginTop: 10 }}>{aPorzioni ? 'Quante porzioni' : 'Quanti grammi'}</label>
        <input inputMode="decimal" value={q} autoFocus onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%', fontSize: 20, textAlign: 'center', padding: '8px 0', fontVariantNumeric: 'tabular-nums' }} />
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          {macros.kcal} kcal · <span style={{ color: 'var(--carb)' }}>C: {macros.carbs}</span>,{' '}
          <span style={{ color: 'var(--prot)' }}>P: {macros.protein}</span>,{' '}
          <span style={{ color: 'var(--fat)' }}>G: {macros.fat}</span>
        </p>
        <div className="row" style={{ gap: 6, marginTop: 12 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={onClose}>Annulla</button>
          <button className="primary" style={{ flex: 1 }} disabled={!valido}
            onClick={() => onConferma({
              foodId: '', recipeId: ricetta.id,
              grams: aPorzioni ? 0 : Math.round(n),
              ...(aPorzioni ? { portions: n } : {}),
              nameSnapshot: ricetta.name, macrosSnapshot: macros,
            })}>Metti</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function GiornataEditor({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  useIndietro(onClose)
  const modello = useLiveQuery(() => getDayTemplate(templateId), [templateId])
  const cibiElenco = useLiveQuery(listFoods, []) ?? []
  const tipi = useLiveQuery(listDayTypes, []) ?? []
  const cibi = useMemo(() => new Map(cibiElenco.map((f) => [f.id, f])), [cibiElenco])

  // La bozza: si tocca qui e si scrive solo con Salva. Applicare per sbaglio
  // una giornata mezza corretta sarebbe peggio di non poterla correggere.
  const [bozza, setBozza] = useState<DayTemplateMeal[] | null>(null)
  const [apri, setApri] = useState<{ m: number; i: number } | null>(null)
  const [scegli, setScegli] = useState<{ m: number; i: number | null } | null>(null)
  const [ricetta, setRicetta] = useState<{ r: Recipe; dove: { m: number; i: number | null } } | null>(null)
  const [salvato, setSalvato] = useState(false)
  const [nota, setNota] = useState<string | null>(null)
  // Il pasto copiato in Cibo: si legge quando apri, non serve che cambi dopo.
  const [appunti] = useState(pastoCopiato)

  // La bozza nasce già in ordine di pasto: così l'indice della riga a schermo è
  // lo stesso della riga nella bozza, e una correzione non finisce sul pasto sbagliato.
  const copiaOrdinata = (meals: DayTemplateMeal[]) => [...meals]
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ ...m, items: m.items.map((it) => ({ ...it })) }))

  useEffect(() => {
    if (modello && bozza == null) setBozza(copiaOrdinata(modello.meals))
    // Corretta prima che l'obiettivo la seguisse: si allinea aprendola, senza
    // che tu debba risalvarla a mano.
    if (modello?.modificata) void sincronizzaObiettivo(modello.id)
  }, [modello, bozza]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!modello || !bozza) return <p className="muted">Apro…</p>

  const obiettivi = tipi.find((t) => t.name === modello.name)?.targets
  // Quello che ha scritto il coach per questa giornata, com'e' arrivato: e' il
  // metro del controllo, e non lo tocca nessuno — nemmeno le tue correzioni.
  const g = GIORNATE_RS.find((x) => x.nome === modello.name)
  const piano: Macros | null = g
    ? { kcal: g.targets.kcal, carbs: g.targets.carbs, protein: g.targets.protein, fat: g.targets.fat }
    : null
  const scarto = (mio: number, suo: number) => {
    const d = Math.round((mio - suo) * 10) / 10
    return `${d > 0 ? '+' : ''}${d}`
  }
  const pasti = bozza
  const totale = pasti.reduce((a, m) => m.items.reduce((x, it) => somma(x, macroDi(it, cibi)), a), VUOTO)
  const sporco = JSON.stringify(bozza) !== JSON.stringify(copiaOrdinata(modello.meals))

  /** Cambia una riga sul posto, tenendo la fotografia dei macro aggiornata. */
  function tocca(mi: number, ii: number, patch: Partial<DayTemplateItem>) {
    setBozza((b) => {
      if (!b) return b
      const copia = b.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it })) }))
      const it = { ...copia[mi].items[ii], ...patch }
      const f = cibi.get(it.foodId)
      if (f && !it.recipeId) { it.macrosSnapshot = macrosFor(f.per100, it.grams); it.nameSnapshot = f.name }
      copia[mi].items[ii] = it
      return copia
    })
  }

  function elimina(mi: number, ii: number) {
    setBozza((b) => b?.map((m, i) => (i === mi ? { ...m, items: m.items.filter((_, x) => x !== ii) } : m)) ?? b)
  }

  /**
   * Incolla dentro un pasto le righe di quello copiato in Cibo.
   *
   * Va nella bozza, non su disco: resta una modifica come le altre, che Salva
   * conferma e «Annulla modifiche» butta via.
   */
  async function incolla(mi: number) {
    if (!appunti) return
    const p = await pastoComeItems(appunti.mealId)
    if (!p?.items.length) { setNota(`«${appunti.name}» non c'è più, o è vuoto.`); return }
    setBozza((b) => b?.map((m, i) => (i === mi ? { ...m, items: [...m.items, ...p.items] } : m)) ?? b)
    setNota(`${p.items.length} righe da «${p.nome}». Salva per tenerle.`)
  }

  /** Il pasto copiato diventa un pasto nuovo in fondo alla giornata. */
  async function incollaComePasto() {
    if (!appunti) return
    const p = await pastoComeItems(appunti.mealId)
    if (!p?.items.length) { setNota(`«${appunti.name}» non c'è più, o è vuoto.`); return }
    setBozza((b) => [...(b ?? []), { name: p.nome, order: (b?.length ?? 0), items: p.items }])
    setNota(`Pasto «${p.nome}» aggiunto in fondo. Salva per tenerlo.`)
  }

  /**
   * Mette una ricetta al posto di una riga, tenendo la prescrizione del coach.
   *
   * La riga cambia natura — non e' piu' un alimento — ma resta la stessa riga
   * del piano: `rsOriginale` non si tocca, altrimenti il confronto direbbe che
   * quella voce non c'era.
   */
  function sostituisciConRiga(mi: number, ii: number, item: DayTemplateItem) {
    setBozza((b) => {
      if (!b) return b
      const copia = b.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it })) }))
      const vecchia = copia[mi].items[ii]
      copia[mi].items[ii] = { ...item, ...(vecchia.rsOriginale ? { rsOriginale: vecchia.rsOriginale } : {}) }
      return copia
    })
  }

  function metti(f: Food) {
    const dove = scegli
    setScegli(null)
    if (!dove) return
    if (dove.i != null) { tocca(dove.m, dove.i, { foodId: f.id, nameSnapshot: f.name }); return }
    setBozza((b) => b?.map((m, i) => (i === dove.m
      ? { ...m, items: [...m.items, { foodId: f.id, grams: 100, nameSnapshot: f.name, macrosSnapshot: macrosFor(f.per100, 100) }] }
      : m)) ?? b)
  }

  async function salva() {
    await updateDayTemplateMeals(templateId, bozza!)
    setSalvato(true)
    setTimeout(() => setSalvato(false), 2500)
  }

  const aperta = apri ? pasti[apri.m]?.items[apri.i] : null

  return (
    <div className="col">
      <div className="row spread" style={{ alignItems: 'center' }}>
        <button className="ghost small" onClick={onClose}>‹ Giornate</button>
        <span className="muted small">{modello.modificata ? 'corretta da te' : 'come l\'ha scritta il coach'}</span>
      </div>

      <h2 style={{ margin: '6px 0 0', fontSize: 20 }}>{modello.name}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        Correggi qui gli alimenti e i grammi: «Applica» porterà in Cibo questa versione, non quella del coach.
      </p>

      {pasti.map((m, mi) => {
        const tot = m.items.reduce((a, it) => somma(a, macroDi(it, cibi)), VUOTO)
        return (
          <div className="card" key={`${m.name}-${m.order}`} style={{ padding: '10px 12px' }}>
            <div className="row spread" style={{ alignItems: 'baseline' }}>
              <strong style={{ fontSize: 14 }}>{m.name}</strong>
              <Macro m={tot} />
            </div>

            {m.items.map((it, ii) => {
              const nome = nomeDi(it, cibi)
              const orig = it.rsOriginale
              const cambiata = orig != null && (orig.nome !== nome || orig.g !== it.grams)
              return (
                <div key={ii} onClick={() => setApri({ m: mi, i: ii })}
                  className="row spread"
                  style={{ alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
                      {it.recipeId ? '📖 ' : ''}{nome}
                      {cambiata && <span style={{ color: 'var(--rs)', fontSize: 11 }}> · corretta</span>}
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {it.recipeId && it.portions != null
                        ? `${String(it.portions).replace('.', ',')} ${it.portions === 1 ? 'porzione' : 'porzioni'}`
                        : `${it.grams} g`}
                      {cambiata && orig ? ` · coach: ${orig.nome} ${orig.g} g` : ''}
                    </span>
                  </span>
                  <Macro m={macroDi(it, cibi)} />
                </div>
              )
            })}

            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="chip" onClick={() => setScegli({ m: mi, i: null })}>＋ Aggiungi alimento</button>
              {/* Il pasto che hai gia' sistemato in Cibo entra qui dentro com'e':
                  le sostituzioni le hai gia' fatte una volta. */}
              {appunti && (
                <button className="chip" onClick={() => void incolla(mi)}>
                  📥 Incolla «{appunti.name}»
                </button>
              )}
            </div>
          </div>
        )
      })}

      {appunti && (
        <button className="chip" style={{ alignSelf: 'flex-start' }} onClick={() => void incollaComePasto()}>
          📥 Incolla «{appunti.name}» come nuovo pasto
        </button>
      )}
      {nota && <p className="small" style={{ margin: 0, color: 'var(--gold)' }}>{nota}</p>}

      {/*
        Due totali, non uno.
        Il tuo — quello che mangerai davvero, coi tuoi alimenti — e quello che ha
        prescritto il coach. Sono la stessa giornata scritta da due persone
        diverse: metterli uno sotto l'altro è l'unico modo per controllare in un
        colpo d'occhio quanto ti sei allontanato dal piano.
      */}
      <div className="card" style={{ padding: '10px 12px' }}>
        <div className="row spread" style={{ alignItems: 'baseline' }}>
          <strong style={{ fontSize: 14 }}>Totale mio</strong>
          <Macro m={totale} grande />
        </div>

        {piano && (
          <>
            <div className="row spread" style={{ alignItems: 'baseline', marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--rs)' }}>Totale RS · piano del coach</span>
              <Macro m={piano} />
            </div>
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              differenza {scarto(totale.kcal, piano.kcal)} kcal ·{' '}
              <span style={{ color: 'var(--carb)' }}>C {scarto(totale.carbs, piano.carbs)}</span>,{' '}
              <span style={{ color: 'var(--prot)' }}>P {scarto(totale.protein, piano.protein)}</span>,{' '}
              <span style={{ color: 'var(--fat)' }}>G {scarto(totale.fat, piano.fat)}</span>
            </p>
          </>
        )}

        {!piano && obiettivi && (
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Obiettivo: {obiettivi.kcal} kcal · <span style={{ color: 'var(--carb)' }}>C: {obiettivi.carbs}</span>,{' '}
            <span style={{ color: 'var(--prot)' }}>P: {obiettivi.protein}</span>,{' '}
            <span style={{ color: 'var(--fat)' }}>G: {obiettivi.fat}</span>
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 8, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '8px 0' }}>
        <button className="ghost" style={{ flex: 1 }} disabled={!sporco}
          onClick={() => setBozza(copiaOrdinata(modello.meals))}>
          Annulla modifiche
        </button>
        <button className="primary" style={{ flex: 2 }} disabled={!sporco} onClick={salva}>
          {salvato ? '✓ Salvata' : 'Salva'}
        </button>
      </div>
      {salvato && <p className="small" style={{ margin: 0, color: 'var(--good)' }}>Da adesso «Applica» usa questa versione.</p>}

      {aperta && apri && (
        <RigaSheet
          it={aperta}
          nome={nomeDi(aperta, cibi)}
          onGrammi={(g) => tocca(apri.m, apri.i, { grams: g })}
          onSostituisci={() => { setScegli({ m: apri.m, i: apri.i }); setApri(null) }}
          onElimina={() => elimina(apri.m, apri.i)}
          onClose={() => setApri(null)}
        />
      )}

      {scegli && (
        <FoodChooser onPick={metti} onClose={() => setScegli(null)}
          onPickRecipe={(r) => { setRicetta({ r, dove: scegli }); setScegli(null) }} />
      )}

      {/* Quanto ne metti: porzioni se la ricetta va a porzioni, grammi se va a
          peso. Stessa domanda del ricettario, fatta qui perche' la riga la stai
          scrivendo dentro la giornata. */}
      {ricetta && (
        <QuantitaRicetta ricetta={ricetta.r} cibi={cibi}
          onClose={() => setRicetta(null)}
          onConferma={(item) => {
            const dove = ricetta.dove
            setRicetta(null)
            if (dove.i != null) sostituisciConRiga(dove.m, dove.i, item)
            else setBozza((b) => b?.map((m, i) => (i === dove.m ? { ...m, items: [...m.items, item] } : m)) ?? b)
          }} />
      )}
    </div>
  )
}
