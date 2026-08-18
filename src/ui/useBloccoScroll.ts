import { useEffect } from 'react'

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
