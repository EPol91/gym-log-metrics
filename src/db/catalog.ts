// Libreria esercizi integrata (seed). isCustom=false. L'utente può aggiungere custom.
// `aliases` alimenta l'anti-duplicato (identità stabile per PR/Exercise Intelligence).
import type { MuscleGroup } from './schema'

export interface CatalogEntry {
  name: string
  muscle: MuscleGroup
  aliases: string[]
}

export const EXERCISE_CATALOG: CatalogEntry[] = [
  { name: 'Panca piana bilanciere', muscle: 'petto', aliases: ['panca', 'panca piana', 'bench', 'bench press'] },
  { name: 'Panca inclinata bilanciere', muscle: 'petto', aliases: ['panca inclinata', 'incline bench'] },
  { name: 'Croci ai cavi', muscle: 'petto', aliases: ['croci', 'cable fly'] },
  { name: 'Stacco da terra', muscle: 'schiena', aliases: ['stacco', 'deadlift'] },
  { name: 'Rematore bilanciere', muscle: 'schiena', aliases: ['rematore', 'barbell row'] },
  { name: 'Lat machine', muscle: 'schiena', aliases: ['lat', 'pulldown'] },
  { name: 'Trazioni', muscle: 'schiena', aliases: ['pull up', 'trazione'] },
  { name: 'Military press', muscle: 'spalle', aliases: ['lento avanti', 'ohp', 'overhead press'] },
  { name: 'Alzate laterali', muscle: 'spalle', aliases: ['laterali', 'lateral raise'] },
  { name: 'Curl bilanciere', muscle: 'bicipiti', aliases: ['curl', 'barbell curl'] },
  { name: 'Curl manubri', muscle: 'bicipiti', aliases: ['dumbbell curl'] },
  { name: 'French press', muscle: 'tricipiti', aliases: ['skull crusher'] },
  { name: 'Pushdown ai cavi', muscle: 'tricipiti', aliases: ['pushdown', 'triceps pushdown'] },
  { name: 'Squat bilanciere', muscle: 'quadricipiti', aliases: ['squat', 'back squat'] },
  { name: 'Leg press', muscle: 'quadricipiti', aliases: ['pressa'] },
  { name: 'Leg extension', muscle: 'quadricipiti', aliases: ['estensioni gambe'] },
  { name: 'Leg curl', muscle: 'femorali', aliases: ['curl femorali'] },
  { name: 'Hip thrust', muscle: 'glutei', aliases: ['hip thrust'] },
  { name: 'Calf raise', muscle: 'polpacci', aliases: ['calf', 'polpacci'] },
  { name: 'Plank', muscle: 'core', aliases: ['plank'] },
]

/** Normalizza un nome per il confronto anti-duplicato. */
export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}
