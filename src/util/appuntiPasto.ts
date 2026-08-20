// Il pasto negli appunti.
//
// Copiare un pasto in Cibo e incollarlo dentro la giornata del coach sono due
// schermate diverse, e lo stato di React non passa da una all'altra. Qui gli
// appunti stanno fuori: un riferimento al pasto — non una copia dei suoi dati,
// che invecchierebbe — e il nome, per poterlo scrivere sul tasto.
//
// Su disco e non in memoria: se copi, chiudi l'app e la riapri, quello che
// avevi copiato è ancora lì.

const CHIAVE = 'pasto-copiato'

export interface PastoCopiato { mealId: string; name: string }

export function copiaPasto(p: PastoCopiato): void {
  try { localStorage.setItem(CHIAVE, JSON.stringify(p)) } catch { /* ignore */ }
}

export function pastoCopiato(): PastoCopiato | null {
  try {
    const s = localStorage.getItem(CHIAVE)
    if (!s) return null
    const p = JSON.parse(s) as PastoCopiato
    return p?.mealId ? p : null
  } catch { return null }
}

export function svuotaAppunti(): void {
  try { localStorage.removeItem(CHIAVE) } catch { /* ignore */ }
}
