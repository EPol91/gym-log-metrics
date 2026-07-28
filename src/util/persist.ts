import { useState } from 'react'

/**
 * Stato che sopravvive al refresh (sessionStorage).
 * Serve per data selezionata, sotto-schede e filtri: ricaricare la pagina
 * deve riportarti dov'eri, non all'inizio.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem('st:' + key)
      if (raw != null) return JSON.parse(raw) as T
    } catch { /* storage non disponibile: si parte dal valore iniziale */ }
    return initial
  })

  const set = (v: T | ((p: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
      try { sessionStorage.setItem('st:' + key, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  return [value, set]
}
