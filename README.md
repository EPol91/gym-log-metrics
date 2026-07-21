# GYM LOG & METRICS

App di logging allenamenti + metriche. **Offline-first**, PWA installabile. Progetto personale con evoluzione commerciale pianificata (bundle Light/Premium).

> Documenti di riferimento nella sottocartella `docs/`: Project Bible, `ARCHITETTURA_v0.md`, `SCORE_FORMULE.md`.
> ⚠️ Il codice NON va spostato in percorsi che contengono `&` (rompe `npm` su Windows: la `&` è un separatore di comandi cmd). Gli spazi invece vanno bene.

## Avvio
```bash
npm install
npm run dev      # sviluppo → http://localhost:5173
npm run build    # build di produzione in dist/ (PWA)
```

## Stack
- **React + TypeScript + Vite**, PWA (vite-plugin-pwa, service worker offline)
- **IndexedDB via Dexie** — dati solo sul dispositivo, modello multi-tenant-ready (sync/cloud futuri senza rewrite)
- Nessun backend: chiave AI dell'utente (BYOK) chiamata diretta a Claude

## Principi (dalla Project Bible)
- **Single source of truth**: si salvano solo i dati grezzi; metriche/score derivati a runtime e memoizzati.
- Ogni Score dichiara la propria **affidabilità** (alta / media / inferenziale / insufficiente).
- **Una sola app**: gate `canUse()` per Light/Premium.

## Funzionalità
- **Logging workout**: tipo seduta → check pre-workout → esercizi (libreria + custom + anti-duplicato) → set (peso×reps, RPE opzionale) → timer recupero → riepilogo.
- **4 Score**: Readiness, Workout, Performance (phase-aware), Consistency. Formule in `SCORE_FORMULE.md`.
- **Exercise Intelligence**: dashboard per esercizio (PR, trend e1RM, grafico, storico).
- **Template** workout (salva struttura, riparti veloce).
- **Fase** (cut/bulk/recomp/mant.) — ricalibra il Performance.
- **Cardio** con zone (Standard / HRR).
- **Nutrition** (contesto giornaliero ON/OFF/Reload, acqua, sale — non entra negli Score).
- **AI**: chiave + tasto test; Insight on-demand su esercizi e sedute.

## Struttura
```
src/
  db/        schema, database (Dexie + migrazioni), repository, seed, catalogo
  metrics/   e1RM, volume, tonnellaggio, zone cardio
  scores/    le 4 formule Score + glue dai dati
  ai/        AI engine (isolato, BYOK ora → server-proxy in futuro)
  entitlements/  gate Light/Premium
  engines/   Event engine (scheletro)
  ui/        schermate e componenti
```

## Stato
Personale, offline, funzionante. Da fare: Analytics multi-esercizio, icone PNG dedicate, timer persistente fuori app (Android), schemi nutrizionali/macros, controlli-costo AI avanzati, cloud/account (fase commerciale).
