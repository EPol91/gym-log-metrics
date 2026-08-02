import { useEffect, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { slideRicetta, type Formato, type Lingua } from '../util/slideRicetta'
import { condividi, inGalleria, nativo } from '../util/condividi'
import { traduciRicetta, haChiaveAI } from '../util/traduciRicetta'
import { didascaliaPost, type Didascalia } from '../util/didascalia'
import { ricorda, ricordo, type Ricordo } from '../util/memoriaAI'
import type { Food, Recipe } from '../db/schema'
import type { RecipeCalc } from '../db/recipes'

const CHI = 'etp:ig-handle'
const LINGUA = 'etp:slide-lingua'

/**
 * Rimette insieme la ricetta tradotta da quello che era stato tenuto da parte.
 * Le sezioni tornano al loro posto scorrendo solo quelle con ingredienti, nello
 * stesso ordine in cui erano state mandate a tradurre.
 */
function ricostruisci(r: Recipe, t: NonNullable<Ricordo['traduzione']>): { ricetta: Recipe; nomi: Map<string, string> } {
  const pieni = (r.groups ?? []).filter((g) => g.items.length)
  return {
    ricetta: {
      ...r,
      name: t.nome || r.name,
      steps: t.passi?.length ? t.passi : r.steps,
      groups: (r.groups ?? []).map((g) => {
        const pos = pieni.indexOf(g)
        return pos < 0 ? g : { ...g, name: t.sezioni?.[pos] ?? g.name }
      }),
    },
    nomi: new Map(t.nomi ?? []),
  }
}

/**
 * Le slide della ricetta, pronte per Instagram.
 *
 * Si vedono prima di uscire: una ricetta con la foto storta o un passo scritto
 * male si scopre qui, non dopo averla postata. Da qui partono con il menu di
 * condivisione di Android; sul telefono senza (o dal computer) si scaricano.
 */
export function SlideSheet({ recipe, calc, foods, onClose }: {
  recipe: Recipe
  calc: RecipeCalc
  foods: Food[]
  onClose: () => void
}) {
  const [formato, setFormato] = useState<Formato>('post')
  const [lingua, setLingua] = useState<Lingua>(() => (localStorage.getItem(LINGUA) === 'en' ? 'en' : 'it'))
  // Il testo tradotto vive qui, non nella ricetta: le slide in inglese non
  // devono cambiare quello che hai scritto tu.
  const [tradotto, setTradotto] = useState<{ ricetta: Recipe; nomi: Map<string, string> } | null>(null)
  const [traducendo, setTraducendo] = useState(false)
  const [dida, setDida] = useState<Didascalia | null>(null)
  const [scrivendo, setScrivendo] = useState(false)
  /** vero se il testo AI in memoria e' stato scritto su una versione precedente */
  const [vecchio, setVecchio] = useState(false)

  // Quello che l'AI ha gia' scritto torna su da solo, per questa ricetta e per
  // questa lingua: riaprire il pannello non deve costare un'altra chiamata.
  useEffect(() => {
    const r = ricordo(recipe.id, lingua)
    setDida(r?.didascalia ?? null)
    setVecchio(!!r && !!r.ricettaAl && r.ricettaAl !== recipe.updatedAt)
    setTradotto(r?.traduzione ? ricostruisci(recipe, r.traduzione) : null)
  }, [recipe.id, recipe.updatedAt, lingua]) // eslint-disable-line react-hooks/exhaustive-deps
  const [chi, setChi] = useState(() => localStorage.getItem(CHI) ?? '')
  const [urls, setUrls] = useState<string[]>([])
  const [blobs, setBlobs] = useState<Blob[]>([])
  const [busy, setBusy] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [fatte, setFatte] = useState(0)
  const [totale, setTotale] = useState(0)
  /** Quale slide stai guardando a schermo intero. */
  const [grande, setGrande] = useState<number | null>(null)

  // Si ridisegna a ogni cambio di formato o di firma. Le anteprime compaiono
  // una alla volta, appena la slide e' pronta: su una ricetta con la foto ci
  // vogliono diversi secondi, e guardare un pannello fermo sembra un guasto.
  useEffect(() => {
    let vivo = true
    const nati: string[] = []
    setBusy(true); setFatte(0); setTotale(0); setGrande(null)
    setUrls((vecchi) => { vecchi.forEach(URL.revokeObjectURL); return [] })
    setBlobs([])

    // Con la traduzione pronta si disegna quella; senza, la ricetta com'e'.
    const usata = tradotto?.ricetta ?? recipe
    const mappa = tradotto
      ? new Map(foods.map((f) => [f.id, { ...f, name: tradotto.nomi.get(f.id) ?? f.name }]))
      : new Map(foods.map((f) => [f.id, f]))

    slideRicetta(usata, calc, mappa, formato, chi.trim() || 'ETP HEALTH', lingua,
      (n, tot, appena) => {
        if (!vivo) return
        const u = URL.createObjectURL(appena)
        nati.push(u)
        // flushSync: senza, React rimanda il ridisegno alla fine del lavoro e
        // la barra resta a zero per tutti i secondi che ci vogliono — poi
        // compare tutto insieme. E' la stessa cura del trascinamento.
        flushSync(() => { setFatte(n); setTotale(tot); setUrls((p) => [...p, u]) })
      })
      .then((bs) => { if (vivo) setBlobs(bs) })
      .catch((e) => vivo && setMsg((e as Error)?.message ?? 'Non sono riuscito a disegnarle.'))
      .finally(() => vivo && setBusy(false))

    // Se cambi formato a meta' strada, le immagini gia' create vanno liberate:
    // sono qualche mega l'una.
    return () => { vivo = false; nati.forEach(URL.revokeObjectURL) }
  }, [recipe, calc, foods, formato, chi, lingua, tradotto])

  /** La didascalia del post: la scrive l'AI sui macro veri di questa ricetta. */
  async function scriviDidascalia() {
    setScrivendo(true); setMsg(null)
    try {
      // Il risultato resta in memoria fra un'apertura e l'altra: pagarlo di
      // nuovo solo perche' hai chiuso il pannello non ha senso.
      const nomi = (recipe.groups ?? []).flatMap((g) => g.items
        .map((it) => tradotto?.nomi.get(it.foodId) ?? foods.find((f) => f.id === it.foodId)?.name)
        .filter((x): x is string => !!x))
      const d = await didascaliaPost(tradotto?.ricetta ?? recipe, calc, nomi, lingua)
      setDida(d)
      ricorda(recipe.id, lingua, { didascalia: d, ricettaAl: recipe.updatedAt })
    } catch (e) {
      setMsg((e as Error)?.message ?? 'Didascalia non riuscita.')
    } finally { setScrivendo(false) }
  }

  async function copia(t: string) {
    try { await navigator.clipboard.writeText(t); setMsg('Copiata.') }
    catch { setMsg('Copia non riuscita: tienila premuta e copiala a mano.') }
  }

  /** Traduce il testo scritto da te. Le etichette cambiano da sole con la lingua. */
  async function traduci() {
    setTraducendo(true); setMsg(null)
    try {
      const nomi = new Map(foods.map((f) => [f.id, f.name]))
      const t = await traduciRicetta(recipe, nomi, lingua)
      setTradotto(t)
      // Si tiene solo il testo, non la ricetta intera: dentro c'e' la foto, e
      // una copia della foto per lingua riempirebbe lo spazio per niente.
      ricorda(recipe.id, lingua, {
        traduzione: {
          nome: t.ricetta.name,
          sezioni: (t.ricetta.groups ?? []).filter((g) => g.items.length).map((g) => g.name),
          passi: t.ricetta.steps,
          nomi: [...t.nomi],
        },
        ricettaAl: recipe.updatedAt,
      })
    } catch (e) {
      setMsg((e as Error)?.message ?? 'Traduzione non riuscita.')
    } finally { setTraducendo(false) }
  }

  const nomeFile = (i: number) =>
    `${recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ricetta'}-${i + 1}.png`

  const files = () => blobs.map((b, i) => ({ nome: nomeFile(i), blob: b }))

  async function esci(cosa: 'condividi' | 'galleria') {
    setMsg(null)
    try {
      if (cosa === 'condividi') { await condividi(files(), recipe.name); return }
      const dove = await inGalleria(files())
      setMsg(dove === 'download' ? 'Scaricate.' : `Salvate in galleria, album «${dove}».`)
    } catch (e) {
      // Se il menu viene chiuso col dito Android risponde con un errore: non e'
      // un guasto, e dirgli che qualcosa e' andato storto sarebbe una bugia.
      const t = (e as Error)?.message ?? ''
      if (/cancel|abort|annull/i.test(t)) return
      setMsg(t || 'Non ci sono riuscito.')
    }
  }

  // A schermo intero: l'anteprima da 148 px serve a contarle, non a leggerle.
  // Le frecce restano ai lati perche' su un telefono il dito e' li'.
  if (grande != null && urls[grande]) {
    return createPortal(
      <div onClick={() => setGrande(null)}
        style={{
          position: 'fixed', inset: 0, zIndex: 1100, background: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <img src={urls[grande]} alt={`Slide ${grande + 1}`}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />

        <div className="row spread" onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(18px + var(--sicuro-basso))', alignItems: 'center' }}>
          <button className="chip" disabled={grande === 0} onClick={() => setGrande(grande - 1)}>‹</button>
          <span className="muted small">{grande + 1} di {urls.length}</span>
          <button className="chip" disabled={grande === urls.length - 1} onClick={() => setGrande(grande + 1)}>›</button>
        </div>
        <button className="ghost" onClick={() => setGrande(null)}
          style={{ position: 'absolute', top: 'calc(12px + var(--vvtop, 0px))', right: 12, width: 40, height: 40, padding: 0, display: 'grid', placeItems: 'center' }}>✕</button>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', left: 0, right: 0, top: 'var(--vvtop, 0px)', height: 'var(--vvh, 100dvh)', zIndex: 1000, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: '92%', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16,
          padding: '14px 16px', margin: '0 8px',
        }}>
        <div className="row spread" style={{ alignItems: 'center', marginBottom: 10 }}>
          <strong>Slide per Instagram</strong>
          <button className="ghost" style={{ width: 36, height: 36, padding: 0, display: 'grid', placeItems: 'center' }} onClick={onClose}>✕</button>
        </div>

        {/* Tutto quello che sta fra il titolo e i due tasti scorre. Con la
            didascalia fuori da qui il pannello cresceva oltre lo schermo e il
            fondo — anteprime e tasti — restava tagliato via, senza scroll. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

        <div className="row" style={{ gap: 6 }}>
          <button className={formato === 'post' ? 'chip on' : 'chip'} style={{ flex: 1 }} onClick={() => setFormato('post')}>Post 4:5</button>
          <button className={formato === 'storia' ? 'chip on' : 'chip'} style={{ flex: 1 }} onClick={() => setFormato('storia')}>Storia 9:16</button>
        </div>

        {/* Lingua: le etichette cambiano subito e gratis. Il testo tuo — titolo,
            alimenti, passi — resta com'e' finche' non chiedi la traduzione. */}
        <div className="row" style={{ gap: 6, marginTop: 6, alignItems: 'center' }}>
          <button className={lingua === 'it' ? 'chip on' : 'chip'} style={{ flex: 1 }}
            onClick={() => { setLingua('it'); localStorage.setItem(LINGUA, 'it') }}>Italiano</button>
          <button className={lingua === 'en' ? 'chip on' : 'chip'} style={{ flex: 1 }}
            onClick={() => { setLingua('en'); localStorage.setItem(LINGUA, 'en') }}>English</button>
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6, alignItems: 'center' }}>
          <button className="chip" style={{ flex: 1 }} disabled={traducendo || busy || !haChiaveAI()}
            onClick={tradotto ? () => setTradotto(null) : traduci}>
            {traducendo ? 'Traduco…' : tradotto ? 'Torna al testo tuo' : 'Traduci il testo con AI'}
          </button>
          <button className="chip" style={{ flex: 1 }} disabled={scrivendo || busy || !haChiaveAI()}
            onClick={scriviDidascalia}>
            {scrivendo ? 'Scrivo…' : !dida ? 'Didascalia' : vecchio ? 'Aggiorna didascalia' : 'Riscrivi didascalia'}
          </button>
        </div>

        {vecchio && (
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Hai modificato la ricetta dopo che l’AI ha scritto: il testo qui sotto è quello di prima.
          </p>
        )}

        {/* La didascalia: il testo, gli hashtag e chi taggare, ognuno copiabile
            da solo — sotto il post si incollano in momenti diversi. */}
        {dida && (
          <div className="card" style={{ marginTop: 8, padding: 12 }}>
            <div className="row spread" style={{ alignItems: 'center' }}>
              <span className="muted small">Didascalia</span>
              <span className="row" style={{ gap: 6 }}>
                <button className="chip" style={{ padding: '3px 10px' }} onClick={() => copia(dida.testo)}>Copia</button>
                <button className="chip" style={{ padding: '3px 10px', color: 'var(--muted)' }}
                  /* butta solo la didascalia: la traduzione, se c'e', resta */
                  onClick={() => { ricorda(recipe.id, lingua, { didascalia: undefined }); setDida(null); setVecchio(false) }}
                  aria-label="Butta la didascalia">✕</button>
              </span>
            </div>
            <p className="small" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{dida.testo}</p>

            {!!dida.hashtag.length && (
              <>
                <div className="row spread" style={{ alignItems: 'center', marginTop: 12 }}>
                  <span className="muted small">Hashtag ({dida.hashtag.length})</span>
                  <button className="chip" style={{ padding: '3px 10px' }}
                    onClick={() => copia(dida.hashtag.map((h) => `#${h}`).join(' '))}>Copia</button>
                </div>
                <p className="small" style={{ margin: '6px 0 0', color: 'var(--gold-dim)', lineHeight: 1.6 }}>
                  {dida.hashtag.map((h) => `#${h}`).join(' ')}
                </p>
              </>
            )}

            {!!dida.tag.length && (
              <>
                <div className="muted small" style={{ marginTop: 12 }}>Chi taggare</div>
                <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
                  {dida.tag.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
                <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
                  Sono categorie, non profili: gli account veri li scegli tu — un @ sbagliato è peggio di nessun tag.
                </p>
              </>
            )}
          </div>
        )}
        {!haChiaveAI() && (
          <p className="muted small" style={{ margin: '6px 0 0' }}>
            Le etichette cambiano lingua da sole. Per tradurre anche titolo, ingredienti e
            passi serve la chiave AI in Profilo.
          </p>
        )}

        {/* La chiocciola la mette l'app: un nome senza non sembra un profilo. */}
        <label className="fl" style={{ marginTop: 10 }}>Nome Instagram</label>
        <input value={chi} placeholder="@iltuonome"
          onChange={(e) => { const v = e.target.value.replace(/^@+/, ''); setChi(v ? `@${v}` : '') }}
          onBlur={() => localStorage.setItem(CHI, chi.trim())} />

        {!recipe.photo && (
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            Nessuna foto: la copertina esce solo con il titolo. Aggiungila in modifica.
          </p>
        )}
        {msg && <p className="muted small" style={{ margin: '8px 0 0' }}>{msg}</p>}

        <div style={{ marginTop: 10 }}>
          {busy && (
            <div style={{ marginBottom: 8 }}>
              <div className="row spread">
                <span className="muted small">Disegno le slide…</span>
                <span className="muted small" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {totale ? `${fatte} di ${totale} · ${Math.round((fatte / totale) * 100)}%` : ''}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', marginTop: 5 }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: 'var(--gold)',
                  width: `${totale ? (fatte / totale) * 100 : 0}%`, transition: 'width .15s',
                }} />
              </div>
            </div>
          )}
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 }}>
            {urls.map((u, i) => (
              <img key={u} src={u} alt={`Slide ${i + 1}`} onClick={() => setGrande(i)}
                style={{
                  width: formato === 'post' ? 148 : 118, flex: 'none', borderRadius: 10,
                  border: '1px solid var(--line)', display: 'block', cursor: 'pointer',
                }} />
            ))}
          </div>
        </div>

        </div>

        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          <button className="primary" style={{ flex: 1 }} disabled={busy || !blobs.length} onClick={() => esci('condividi')}>
            Condividi ({blobs.length})
          </button>
          <button className="chip" disabled={busy || !blobs.length} onClick={() => esci('galleria')}>
            {nativo() ? 'Galleria' : 'Salva'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
