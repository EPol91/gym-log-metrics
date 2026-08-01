# ETP HEALTH — l'app Android

**L'APK è pronto: `ETP-HEALTH.apk`, nella cartella del progetto.**

## Installarla

1. Copia `ETP-HEALTH.apk` sul telefono (cavo, Drive, Telegram: come preferisci).
2. Aprilo. Android chiederà di permettere l'installazione da questa sorgente:
   è normale per un'app che non passa dal Play Store.
3. Si installa accanto alla PWA, non al posto suo. **La PWA resta dov'è,
   con tutti i suoi dati**: finché non decidi tu, non si tocca niente.

## Portare i dati dentro

L'app nuova parte vuota — è un'app diversa, con il suo archivio.

1. Nella **PWA**: Profilo → Backup → esporta. Ottieni un file `.json`.
2. Nell'**app**: Profilo → Backup → importa quel file, modo *sostituisci*.

Nel file c'è tutto: 27 tabelle, e anche il collegamento WHOOP — quindi non devi
rifare nemmeno quello. Verificato svuotando il database e reimportando: 295
record tornati identici campo per campo.

## Cosa cambia rispetto alla PWA

| | com'è |
|---|---|
| **Aggiornamenti** | automatici come adesso: l'app carica la stessa pagina che pubblichi con `git push`. Nessun APK nuovo da installare a ogni modifica |
| **Passi** | **automatici**, da Health Connect (Abitudini → *Collega i passi*). Dal browser non era possibile: WHOOP non li espone e Health Connect è un'API di sistema |
| **Fascia cardio** | funziona: nella WebView non c'è Web Bluetooth, quindi passa da un plugin nativo. Stesso servizio, stesso comportamento, riaggancio automatico compreso |
| **Icona** | adattiva vera: sfondo pieno e marchio dentro la zona sicura. Verificato con le maschere di Android — cerchio, quadrato stondato, goccia: **zero pixel del marchio tagliati** |
| **Avvio** | schermata nera col marchio, niente lampo bianco |

## Ricompilare

Serve solo se cambia qualcosa **dentro il guscio** (permessi, plugin, icona).
Per le modifiche all'app web non serve: quelle arrivano da sole.

```bash
npm run android
```

La compilazione scrive in `%LOCALAPPDATA%\etp-health-build`, **fuori da
OneDrive**: dentro, OneDrive teneva i file aperti mentre sincronizzava e Gradle
moriva a metà.

## Da sapere

- **Firma di sviluppo.** L'APK è firmato con la chiave di debug: va benissimo per
  installarlo tu, non per il Play Store. Se un giorno vorrai pubblicarlo serve
  una chiave tua, con una password che scegli e custodisci tu.
- **Android 8 minimo** (era 7): Health Connect non esiste sotto, e il tuo
  telefono è molto oltre.
- **Prima apertura**: serve rete, perché l'app carica la pagina dal web. Dopo,
  funziona anche offline come la PWA.
