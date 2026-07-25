// Posizione: usata SOLO quando l'utente tocca un pulsante. Mai in automatico,
// mai in background. Se nega il permesso l'app continua a funzionare a mano.

export interface Coords { lat: number; lng: number }

export function isGeoSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

/** Chiede la posizione attuale. Rifiuta con un messaggio leggibile. */
export function getPosition(timeoutMs = 10_000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!isGeoSupported()) { reject(new Error('Posizione non supportata su questo dispositivo.')); return }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => {
        const msg = e.code === e.PERMISSION_DENIED ? 'Permesso posizione negato.'
          : e.code === e.POSITION_UNAVAILABLE ? 'Posizione non disponibile.'
            : 'Tempo scaduto: riprova all’aperto.'
        reject(new Error(msg))
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

/** Distanza in metri tra due punti (formula dell'emisenoverso). */
export function distanceMeters(a: Coords, b: Coords): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Distanza leggibile: "120 m" / "1.4 km". */
export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}
