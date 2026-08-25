import { useEffect, useRef } from 'react'
import { registraStrato } from '../util/indietro'

/**
 * Blocca lo scorrimento della pagina finché la finestra è aperta.
 *
 * Il conto è UNO per tutte le finestre, e serve proprio a questo: quando se ne
 * aprono due annidate — «Modifica» e dentro «scegli alimento» — quella interna,
 * chiudendosi, ripristinava lo stato che aveva trovato, cioè *bloccato*, e ce lo
 * lasciava. Da lì la pagina non scorreva più, mentre i tocchi continuavano a
 * funzionare: sembrava l'app impallata, era solo lo scorrimento spento.
 *
 * Col contatore lo riattiva soltanto l'ultima che si chiude.
 */
let aperte = 0
let prima = ''

export function useBloccoScroll(): void {
  useEffect(() => {
    if (aperte === 0) {
      prima = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    aperte++
    return () => {
      aperte = Math.max(0, aperte - 1)
      if (aperte === 0) document.body.style.overflow = prima
    }
  }, [])
}

/**
 * «Questa finestra e' aperta, e si chiude cosi'»: il tasto indietro del
 * telefono chiude prima l'ultima aperta, come ci si aspetta da qualsiasi app.
 *
 * Sta qui accanto al blocco dello scorrimento perche' le due cose vanno quasi
 * sempre insieme, ma restano separate: una finestra puo' voler comparire
 * nell'elenco dell'indietro senza per forza bloccare la pagina sotto.
 */
export function useIndietro(chiudi: () => void): void {
  // Il riferimento tiene l'ultima versione della funzione senza rifare
  // l'iscrizione a ogni render: rifarla sposterebbe la finestra in cima
  // all'elenco a ogni battito, e l'ordine non sarebbe piu' quello di apertura.
  const ultimo = useRef(chiudi)
  ultimo.current = chiudi
  useEffect(() => registraStrato(() => ultimo.current()), [])
}
