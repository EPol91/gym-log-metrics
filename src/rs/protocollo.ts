// 🦠RS — il protocollo del coach, in forma di dati.
//
// Estratto dalla sua app il 31.07.2026 (vedi docs/RS_PROTOCOLLO_*.md).
// Lui manda i GRAMMI, non i valori per 100 g: quelli vengono dal tuo database di
// EP Coaching, dalla libreria Ciqual dell'app e — dove serviva — da tabelle
// pubbliche. Ogni valore porta scritto da dove viene, cosi' si puo' contestare.
//
// Dove il valore non c'e' resta VUOTO. Un numero inventato qui diventerebbe un
// numero sbagliato nel diario, e da li' finirebbe dritto al coach.

import type { Macros } from '../db/schema'

export interface AlimentoRs {
  nome: string
  /** null = da completare a mano: l'alimento si crea comunque, a zero. */
  per100: Macros | null
  fonte: string
}

const m = (kcal: number, carbs: number, protein: number, fat: number): Macros =>
  ({ kcal, carbs, protein, fat })

export const ALIMENTI_RS: AlimentoRs[] = [
  { nome: "Albume d'uovo", per100: m(47, 0.8, 11, 0), fonte: 'EP Coaching · Albume (Aia)' },
  { nome: 'Ananas', per100: m(40, 10, 0.5, 0), fonte: 'EP Coaching' },
  { nome: 'Avocado', per100: m(205, 0.8, 1.6, 20.6), fonte: 'Ciqual (libreria app)' },
  { nome: 'Banana', per100: m(65, 15.4, 1.2, 0.3), fonte: 'EP Coaching' },
  { nome: 'Burro di mandorle', per100: m(628, 5, 22, 55), fonte: 'EP Coaching · Tsunami' },
  { nome: 'Carpaccio di manzo', per100: null, fonte: 'da completare' },
  { nome: 'Ciclodestrine', per100: m(375, 95, 0, 0), fonte: 'EP Coaching · Solo Carb Tsunami' },
  { nome: 'Corn flakes', per100: m(371, 80, 9, 1), fonte: 'EP Coaching · Migros' },
  { nome: 'Cous cous (crudo)', per100: m(361, 72, 13, 1.8), fonte: 'Open Food Facts · 100% semola grano duro' },
  { nome: 'Fagiolini', per100: m(31, 6.9, 1.8, 0.2), fonte: 'EP Coaching' },
  { nome: "Farina d'avena", per100: m(389, 66, 14, 7), fonte: 'EP Coaching' },
  { nome: "Fiocchi d'avena", per100: m(375, 59, 14, 7), fonte: 'EP Coaching · Happy Harvest' },
  { nome: 'Gallette di riso', per100: m(367, 80, 8.3, 1.3), fonte: 'EP Coaching' },
  { nome: 'Gamberetti', per100: m(94, 1.9, 19, 1.2), fonte: 'Ciqual (libreria app) · gamberi cotti' },
  { nome: 'Kiwi', per100: m(61, 11, 0.9, 0.6), fonte: 'Ciqual (libreria app)' },
  { nome: 'Latte di mandorla senza zuccheri', per100: m(15, 0.5, 0.6, 1.3), fonte: 'EP Coaching · Aldi' },
  { nome: 'Lattuga', per100: m(12, 1.3, 1.3, 0.2), fonte: 'Ciqual (libreria app) · insalata' },
  { nome: 'Manzo', per100: m(101, 1, 22, 1), fonte: 'EP Coaching · carne magra' },
  { nome: 'Marmellata biologica', per100: m(135, 30, 0.8, 0.5), fonte: 'EP Coaching · marmellata 65%' },
  { nome: 'Merluzzo', per100: m(75, 0, 17.2, 0.7), fonte: 'EP Coaching · Bennet' },
  { nome: 'Mirtilli', per100: m(25, 5.1, 1, 0), fonte: 'EP Coaching' },
  { nome: "Olio extravergine d'oliva", per100: m(900, 0, 0, 100), fonte: 'EP Coaching' },
  { nome: 'Pane arabo', per100: m(287, 58.3, 8.3, 1.4), fonte: 'Ciqual (libreria app) · pane bianco, approssimato' },
  { nome: 'Pasta di riso (cruda)', per100: m(360, 78, 6, 1.2), fonte: 'EP Coaching' },
  { nome: 'Patate bollite', per100: m(86, 20, 1.7, 0.1), fonte: 'EP Coaching · patate lesse' },
  { nome: 'Patate dolci', per100: m(86, 20, 1.6, 0.3), fonte: 'EP Coaching' },
  { nome: 'Petto di pollo', per100: m(102, 0, 23, 1), fonte: 'EP Coaching' },
  { nome: 'Pomodori', per100: m(28, 5, 2, 0), fonte: 'EP Coaching' },
  { nome: 'Pomodori datterini', per100: m(37, 7.2, 1.1, 0.4), fonte: 'CREA · pomodorini ciliegino' },
  { nome: 'Proteine isolate Isopure', per100: m(358, 3, 90, 2), fonte: 'EP Coaching · IsolatePure Vaniglia/Nocciola (Tsunami)' },
  { nome: 'Rice Meal Tsunami Nutrition', per100: m(345, 78, 6.5, 0.8), fonte: 'EP Coaching · Cream of Rice (TBJP)' },
  { nome: 'Riso basmati (crudo)', per100: m(354, 79, 7, 1), fonte: 'EP Coaching' },
  { nome: 'Sale', per100: m(0, 0, 0, 0), fonte: 'EP Coaching · sale iodato' },
  { nome: "Tuorlo d'uovo", per100: m(294, 0, 15, 26), fonte: 'EP Coaching' },
  { nome: 'Vitello', per100: null, fonte: 'da completare' },
  { nome: 'Zucchine', per100: m(11, 1, 1, 0), fonte: 'EP Coaching' },
]

export interface PastoRs { nome: string; righe: { alimento: string; g: number }[] }
export interface GiornataRs {
  key: string
  nome: string
  targets: { kcal: number; protein: number; carbs: number; fat: number }
  pasti: PastoRs[]
}

const r = (alimento: string, g: number) => ({ alimento, g })

export const GIORNATE_RS: GiornataRs[] = [
  {
    key: 'rs_low_on', nome: '🦠 LOW ON',
    targets: { kcal: 2435, carbs: 300, protein: 201, fat: 49 },
    pasti: [
      { nome: 'Pasto 1', righe: [r("Fiocchi d'avena", 50), r("Albume d'uovo", 150), r("Tuorlo d'uovo", 15), r('Mirtilli', 100), r('Burro di mandorle', 10), r('Proteine isolate Isopure', 15), r('Sale', 1)] },
      { nome: 'Pasto 2', righe: [r('Gallette di riso', 50), r('Petto di pollo', 150), r('Avocado', 50), r('Pomodori', 100), r('Sale', 1)] },
      { nome: 'Pasto 3', righe: [r('Patate dolci', 200), r('Petto di pollo', 150), r("Olio extravergine d'oliva", 10), r('Zucchine', 100), r('Sale', 1)] },
      { nome: 'Pre-workout', righe: [r('Rice Meal Tsunami Nutrition', 80), r('Proteine isolate Isopure', 30), r('Ananas', 100), r('Sale', 1.5)] },
      { nome: 'Intra-workout', righe: [r('Ciclodestrine', 30), r('Sale', 1)] },
      { nome: 'Post-workout', righe: [r('Riso basmati (crudo)', 80), r('Manzo', 150), r("Olio extravergine d'oliva", 5), r('Fagiolini', 120), r('Sale', 1.5)] },
    ],
  },
  {
    key: 'rs_low_off', nome: '🦠 LOW OFF',
    targets: { kcal: 2249, carbs: 241, protein: 204, fat: 52 },
    pasti: [
      { nome: 'Pasto 1', righe: [r("Farina d'avena", 80), r("Albume d'uovo", 250), r('Burro di mandorle', 20), r('Mirtilli', 100), r('Sale', 1)] },
      { nome: 'Pasto 2', righe: [r('Proteine isolate Isopure', 40), r('Ananas', 100)] },
      { nome: 'Pasto 3', righe: [r('Riso basmati (crudo)', 80), r('Petto di pollo', 150), r("Olio extravergine d'oliva", 15), r('Zucchine', 150), r('Sale', 1)] },
      { nome: 'Pasto 4 · Panino arabo', righe: [r('Pane arabo', 80), r("Albume d'uovo", 60), r("Tuorlo d'uovo", 30), r('Carpaccio di manzo', 80), r('Sale', 1)] },
      { nome: 'Pasto 5', righe: [r('Patate bollite', 280), r('Merluzzo', 180), r("Olio extravergine d'oliva", 5), r('Lattuga', 120), r('Sale', 1)] },
    ],
  },
  {
    key: 'rs_high_on', nome: '🦠 HIGH ON',
    targets: { kcal: 2772, carbs: 353, protein: 209, fat: 59 },
    pasti: [
      { nome: 'Pasto 1', righe: [r("Fiocchi d'avena", 50), r("Albume d'uovo", 150), r('Burro di mandorle', 25), r('Mirtilli', 50), r('Rice Meal Tsunami Nutrition', 20), r('Proteine isolate Isopure', 15), r('Sale', 1)] },
      { nome: 'Pasto 2', righe: [r('Pane arabo', 80), r('Petto di pollo', 140), r('Avocado', 70), r('Zucchine', 50), r('Sale', 1)] },
      { nome: 'Pasto 3', righe: [r('Cous cous (crudo)', 50), r('Petto di pollo', 150), r("Olio extravergine d'oliva", 15), r('Zucchine', 100), r('Sale', 1)] },
      { nome: 'Pre-workout', righe: [r('Rice Meal Tsunami Nutrition', 80), r('Proteine isolate Isopure', 30), r('Banana', 120), r('Sale', 1.5)] },
      { nome: 'Intra-workout', righe: [r('Ciclodestrine', 25), r('Sale', 1)] },
      { nome: 'Post-workout', righe: [r('Pasta di riso (cruda)', 120), r('Gamberetti', 180), r("Olio extravergine d'oliva", 5), r('Zucchine', 50), r('Pomodori datterini', 50), r('Sale', 1.5)] },
    ],
  },
  {
    key: 'rs_high_off', nome: '🦠 HIGH OFF',
    targets: { kcal: 2778, carbs: 353, protein: 211, fat: 58 },
    pasti: [
      { nome: 'Pasto 1', righe: [r("Fiocchi d'avena", 50), r('Proteine isolate Isopure', 30), r('Burro di mandorle', 10), r('Mirtilli', 50), r('Marmellata biologica', 30), r('Rice Meal Tsunami Nutrition', 50), r('Sale', 1)] },
      { nome: 'Pasto 2', righe: [r('Riso basmati (crudo)', 80), r('Petto di pollo', 140), r("Olio extravergine d'oliva", 10), r('Zucchine', 50), r('Sale', 1)] },
      { nome: 'Pasto 3', righe: [r('Riso basmati (crudo)', 80), r('Petto di pollo', 140), r("Olio extravergine d'oliva", 10), r('Lattuga', 100), r('Sale', 1)] },
      { nome: 'Pasto 4', righe: [r('Corn flakes', 70), r('Proteine isolate Isopure', 35), r('Latte di mandorla senza zuccheri', 300), r('Kiwi', 100)] },
      { nome: 'Pasto 5', righe: [r('Patate dolci', 300), r('Vitello', 200), r("Olio extravergine d'oliva", 5), r('Fagiolini', 120), r('Sale', 1)] },
    ],
  },
]

/**
 * Come chiami TU gli esercizi che il coach chiama in un altro modo.
 *
 * Non e' solo un'etichetta: l'import punta al TUO esercizio, cosi' i carichi
 * restano in una storia sola invece di spaccarsi in due schede. Il nome del
 * coach resta come alias, e al prossimo aggiornamento del protocollo ritrova
 * il tuo senza ricreare il doppione.
 *
 * Piu' nomi = si prova in ordine e vince il primo che esiste gia' da te.
 */
export const RINOMINE: Record<string, string | string[]> = {
  'High row convergente chest-supported': 'Bilateral Cable High Row 45°',
  'T-bar row chest-supported': 'T-Bar Row',
  'Pulley unilaterale traiettoria alta': 'High Cable Unilateral Pulley',
  'Kelso shrug su supporto': 'Kelso Shrug',
  'Chest press convergente': 'Chest Press Machine',
  'Shoulder press manubri panca 80°': 'DB Shoulder Press',
  'Overhead cable extension': 'Vulken Overhead Extensions',
  'Pushdown stabile': 'Vulken Pushdown',
  'Smith squat': 'Squat Multipower',
  'Romanian deadlift': 'RDL',
  'Standing calf raise o calf press': 'Standing Calf Raise',
  'Lat machine presa neutra o semi-supina': 'Lat Machine',
  'Pulldown alla corda in massimo allungamento': 'Cable Pulldown',
  'Chest press inclinata convergente': 'Incline DB Press',
  'Cable fly': 'Croci ai Cavi',
  '6A · Preacher curl unilaterale': 'Unilateral Preacher Curl',
  '6B · Crucifix pushdown': 'Crucifix Pushdown',
  '1A · Curl bilanciere EZ': 'Curl Bilanciere EZ',
  '1B · French press EZ o manubri': 'French Press EZ',
  '2A · Curl al cavo braccio dietro il tronco': 'Cable Curl - Braccio dietro il tronco',
  '2B · Overhead rope extension': 'Vulken Overhead Extensions',
  // Scritto "Real" nell'elenco: provo prima la grafia corretta, poi quella.
  'Rear delt row o rear delt machine': ['Rear Delt Machine', 'Real Delt Machine'],
  'Shrug al cavo o macchina': 'Cable Shrug',
}

export interface EsercizioRs { nome: string; muscolo: string; prescrizione: string }
export interface SedutaRs { nome: string; codice: string; tipo: string; focus: string; prehab: string; esercizi: EsercizioRs[] }

const e = (nome: string, muscolo: string, prescrizione: string): EsercizioRs => ({ nome, muscolo, prescrizione })

export const SEDUTE_RS: SedutaRs[] = [
  {
    nome: '🦠 D1 · PULL A', codice: 'D1', tipo: 'pull', focus: 'Upper back · rear delts · bicipiti',
    prehab: 'Scapular pulldown o depressione scapolare al cavo — 1 serie da 10-12, RIR 4-5, rec 45-60″. Non conta come volume.',
    esercizi: [
      e('High row convergente chest-supported', 'schiena', '@A|B · 6-9 top set / 9-12 back-off · RIR1 / RIR1-2 · rec 150-180″'),
      e('T-bar row chest-supported', 'schiena', '@A|B · 8-12 · RIR1-2 · rec 150″'),
      e('Pulley unilaterale traiettoria alta', 'schiena', '@A|B · 10-15 per lato · RIR1-2 · rec 75-90″'),
      e('Kelso shrug su supporto', 'schiena', '@A|B · 10-15 · RIR1 · rec 90-120″'),
      e('Rear delt machine', 'spalle', '@A|B|C · 12-20 · RIR2 / RIR1 / RIR0-1 · rec 75-90″'),
      e('Bayesian curl', 'bicipiti', '@A|B|C · 8-12 · RIR1 · rec 90″'),
      e('Hammer curl al cavo', 'bicipiti', '@A|B · 10-15 · RIR1-2 · rec 75-90″'),
    ],
  },
  {
    nome: '🦠 D2 · PUSH', codice: 'D2', tipo: 'push', focus: 'Petto · spalle · tricipiti',
    prehab: 'Serratus wall slide — 1-2 serie da 8, rec 45-60″. Non conta come volume.',
    esercizi: [
      e('Pectoral machine', 'petto', '@A|B · 10-15 · RIR1-2 · rec 90-120″'),
      e('Smith incline press 20-30°', 'petto', '@A|B · 6-9 top set / 9-12 back-off · RIR1 / RIR1-2 · rec 180″'),
      e('Chest press convergente', 'petto', '@A|B · 8-12 · RIR1-2 · rec 150″'),
      e('Shoulder press manubri panca 80°', 'spalle', '@A|B · 8-12 · RIR1-2 · rec 150″'),
      e('Alzate laterali unilaterali al cavo', 'spalle', '@A|B|C · 12-20 · RIR2 / RIR1 / RIR0-1 · rec 60-75″'),
      e('Overhead cable extension', 'tricipiti', '@A|B · 8-12 · RIR1 · rec 90-120″'),
      e('Pushdown stabile', 'tricipiti', '@A|B · 10-15 · RIR1 / RIR0-1 nelle fasi autorizzate · rec 75-90″'),
    ],
  },
  {
    nome: '🦠 D3 · LOWER COMPLETO', codice: 'D3', tipo: 'legs', focus: 'Quadricipiti · femorali · glutei · polpacci',
    prehab: 'Dead bug — 1-2 serie da 6-8 per lato. Seated leg curl feeder — 1 serie da 15, RIR 4-5. Non contano come volume.',
    esercizi: [
      e('Seated leg curl', 'femorali', '@A|B|C · 8-12 · RIR2 / RIR1 / RIR1 · rec 90-120″'),
      e('Smith squat', 'quadricipiti', '@A|B · 6-9 top set / 9-12 back-off · RIR1 / RIR1-2 · rec 180-210″'),
      e('Leg press quad bias', 'quadricipiti', '@A|B · 10-15 · RIR1-2 · rec 150-180″'),
      e('Romanian deadlift', 'femorali', '@A|B · 6-9 top set / 9-12 back-off · RIR1 / RIR2 · rec 180-210″'),
      e('Hip thrust', 'glutei', '@A|B · 8-12 · RIR1-2 · rec 150″'),
      e('Adductor machine', 'glutei', '@A|B · 10-15 · RIR1 · rec 90″'),
      e('Standing calf raise o calf press', 'polpacci', '@A|B|C · 8-15 · RIR1 · rec 90-120″'),
    ],
  },
  {
    nome: '🦠 D4 · UPPER B', codice: 'D4', tipo: 'upper', focus: 'Gran dorsale · petto · richiamo braccia',
    prehab: 'Scapular pulldown — 1 serie da 10-12, RIR 4-5. Non conta come volume.',
    esercizi: [
      e('Lat machine presa neutra o semi-supina', 'schiena', '@A|B · 6-9 top set / 9-12 back-off · RIR1 / RIR1-2 · rec 150-180″'),
      e('Iliac pulldown unilaterale', 'schiena', '@A|B · 10-15 per lato · RIR1 · rec 75-90″'),
      e('Pulldown alla corda in massimo allungamento', 'schiena', '@A|B · 12-15 · RIR1-2 · rec 90″'),
      e('Chest press inclinata convergente', 'petto', '@A|B · 8-12 · RIR1-2 · rec 150″'),
      e('Cable fly', 'petto', '@A|B · 12-15 · RIR1 · rec 90″'),
      e('6A · Preacher curl unilaterale', 'bicipiti', '@A|B · 10-15 · RIR1 · superset con 6B'),
      e('6B · Crucifix pushdown', 'tricipiti', '@A|B · 10-15 · RIR1 · rec 90″ dopo la coppia'),
    ],
  },
  {
    nome: '🦠 D5 · ARMS + BACK C', codice: 'D5', tipo: 'upper', focus: 'Braccia prioritarie · trapezi · rear delts · paravertebrali',
    prehab: 'Estensione toracica su supporto — 1 serie da 5-6 respirazioni. Curl e pushdown feeder — 1 serie leggera, RIR 5. Non contano come volume.',
    esercizi: [
      e('1A · Curl bilanciere EZ', 'bicipiti', '@A|B|C · 6-10 · carico fisso · RIR1-2 / RIR1-2 / RIR1 · superset con 1B'),
      e('1B · French press EZ o manubri', 'tricipiti', '@A|B|C · 6-10 · carico fisso · RIR1-2 / RIR1-2 / RIR1 · rec 120-150″ dopo la coppia'),
      e('2A · Curl al cavo braccio dietro il tronco', 'bicipiti', '@A|B · 10-15 · RIR1 / RIR0-1 nelle fasi autorizzate · superset con 2B'),
      e('2B · Overhead rope extension', 'tricipiti', '@A|B · 10-15 · RIR1 / RIR0-1 nelle fasi autorizzate · rec 90″ dopo la coppia'),
      e('High row tecnica per upper back', 'schiena', '@A|B · 12-15 · RIR1-2 · rec 120″'),
      e('Rear delt row o rear delt machine', 'spalle', '@A|B · 12-20 · RIR1 · rec 75-90″'),
      e('Shrug al cavo o macchina', 'schiena', '@A|B · 10-15 · RIR1 · rec 90-120″'),
      e('Back extension 45° intento paravertebrale', 'schiena', '@A|B · 10-15 · RIR2 · rec 90-120″'),
    ],
  },
]
