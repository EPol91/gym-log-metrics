// I campi che il coach chiede ogni giorno, nei suoi cinque gruppi.
//
// Sono la sua lista, non la mia: nomi, unità e scale vengono dal suo modulo di
// monitoraggio. Tenerli identici significa che quando si aprirà il collegamento
// non ci sarà niente da tradurre.

export type RsCampo =
  | 'giornata' | 'peso' | 'precisione' | 'sale' | 'acqua' | 'pasti_extra' | 'kcal' | 'pro' | 'cho' | 'fat'
  | 'appetito' | 'problemi_dig' | 'dettagli_dig'
  | 'passi' | 'cardio_min' | 'cardio_fc' | 'workout' | 'aderenza_logistica'
  | 'motivazione' | 'perf_up' | 'doms' | 'energia' | 'stress' | 'malattia'
  | 'ora_letto' | 'ora_sveglia' | 'durata_sonno' | 'qualita_sonno' | 'hrv'

export type RsGruppo = 'nutrizione' | 'digestione' | 'attivita' | 'biofeedback' | 'sonno'

/** Come si scrive un valore: cambia la tastiera e i controlli. */
export type RsTipo = 'numero' | 'testo' | 'scala5' | 'sinoo' | 'ora'

export interface RsDefinizione {
  key: RsCampo
  label: string
  gruppo: RsGruppo
  tipo: RsTipo
  /** Chi lo compila: l'app o tu. I 'tuoi' sono giudizi, e inventarli sarebbe mentire al coach. */
  auto: boolean
}

export const GRUPPI: { key: RsGruppo; label: string }[] = [
  { key: 'nutrizione', label: 'Nutrizione' },
  { key: 'digestione', label: 'Digestione' },
  { key: 'attivita', label: 'Attività' },
  { key: 'biofeedback', label: 'Biofeedback' },
  { key: 'sonno', label: 'Sonno' },
]

export const CAMPI: RsDefinizione[] = [
  // Prima di tutto il resto: senza sapere se era una LOW o una HIGH, i macro
  // qui sotto non si leggono. La scegli in Cibo, questa la riporta.
  { key: 'giornata', label: 'Giornata seguita', gruppo: 'nutrizione', tipo: 'testo', auto: true },
  { key: 'peso', label: 'Peso (kg)', gruppo: 'nutrizione', tipo: 'numero', auto: true },
  { key: 'precisione', label: 'Precisione nutri (%)', gruppo: 'nutrizione', tipo: 'numero', auto: true },
  { key: 'sale', label: 'Sale (g)', gruppo: 'nutrizione', tipo: 'numero', auto: true },
  { key: 'acqua', label: 'Acqua (L)', gruppo: 'nutrizione', tipo: 'numero', auto: true },
  { key: 'pasti_extra', label: 'Pasti extra', gruppo: 'nutrizione', tipo: 'numero', auto: false },
  { key: 'kcal', label: 'KCAL totali', gruppo: 'nutrizione', tipo: 'numero', auto: true },
  { key: 'cho', label: 'CHO (g)', gruppo: 'nutrizione', tipo: 'numero', auto: true },
  { key: 'pro', label: 'PRO (g)', gruppo: 'nutrizione', tipo: 'numero', auto: true },
  { key: 'fat', label: 'FAT (g)', gruppo: 'nutrizione', tipo: 'numero', auto: true },

  { key: 'appetito', label: 'Appetito (1-5)', gruppo: 'digestione', tipo: 'scala5', auto: false },
  { key: 'problemi_dig', label: 'Problemi digestivi', gruppo: 'digestione', tipo: 'sinoo', auto: false },
  { key: 'dettagli_dig', label: 'Dettagli digestivi', gruppo: 'digestione', tipo: 'testo', auto: false },

  { key: 'passi', label: 'Passi totali', gruppo: 'attivita', tipo: 'numero', auto: true },
  { key: 'cardio_min', label: 'Cardio minuti', gruppo: 'attivita', tipo: 'numero', auto: true },
  { key: 'cardio_fc', label: 'Cardio FC media', gruppo: 'attivita', tipo: 'numero', auto: true },
  { key: 'workout', label: 'Sessione allenamento', gruppo: 'attivita', tipo: 'testo', auto: true },
  { key: 'aderenza_logistica', label: 'Aderenza logistica (%)', gruppo: 'attivita', tipo: 'numero', auto: false },

  { key: 'motivazione', label: 'Motivazione (1-5)', gruppo: 'biofeedback', tipo: 'scala5', auto: false },
  { key: 'perf_up', label: 'Aumento prestazione', gruppo: 'biofeedback', tipo: 'sinoo', auto: true },
  { key: 'doms', label: 'Dolori muscolari DOMS (1-5)', gruppo: 'biofeedback', tipo: 'scala5', auto: true },
  { key: 'energia', label: 'Energia (1-5)', gruppo: 'biofeedback', tipo: 'scala5', auto: true },
  { key: 'stress', label: 'Stress (1-5)', gruppo: 'biofeedback', tipo: 'scala5', auto: false },
  { key: 'malattia', label: 'Malattia', gruppo: 'biofeedback', tipo: 'sinoo', auto: false },

  { key: 'ora_letto', label: 'Ora a letto', gruppo: 'sonno', tipo: 'ora', auto: true },
  { key: 'ora_sveglia', label: 'Ora di sveglia', gruppo: 'sonno', tipo: 'ora', auto: true },
  { key: 'durata_sonno', label: 'Durata sonno (ore)', gruppo: 'sonno', tipo: 'numero', auto: true },
  { key: 'qualita_sonno', label: 'Qualità sonno (1-5)', gruppo: 'sonno', tipo: 'scala5', auto: true },
  { key: 'hrv', label: 'HRV (ms)', gruppo: 'sonno', tipo: 'numero', auto: true },
]

export const DEF = new Map(CAMPI.map((c) => [c.key, c]))
