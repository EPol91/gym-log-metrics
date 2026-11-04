import { createPortal } from 'react-dom'

/**
 * I bottoni in fondo allo schermo, dove arriva il pollice. Stanno nel body
 * (portale): dentro .app, che e' trasformato, un fixed non si ancorerebbe allo
 * schermo. Sotto la pagina va lasciato `.spazio-piede`, per non coprire l'ultima riga.
 */
export function PiedeFisso({ children }: { children: React.ReactNode }) {
  return createPortal(<div className="piede-s">{children}</div>, document.body)
}
