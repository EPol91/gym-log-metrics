package app.etphealth.gym;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.core.app.NotificationCompat;

/**
 * La seduta che resta viva anche quando esci dall'app.
 *
 * Android, appena lasci un'app, le toglie la corrente: congela il processo. Per
 * un'app normale va benissimo — per una che sta leggendo la fascia cardio e
 * contando i secondi del recupero e' la morte. La pagina smette di girare, i
 * battiti non arrivano piu', e i tentativi di riaggancio restano appesi finche'
 * non rientri: allora arrivano tutti insieme e l'app sembra bloccata.
 *
 * Il servizio in primo piano e' l'unica cosa che Android accetta come "questa
 * app sta facendo qualcosa che non puoi interrompere". Il prezzo e' la notifica
 * fissa: la stessa che vedi da WHOOP, Polar e Strava mentre registrano. Non e'
 * un dettaglio estetico, e' il patto.
 *
 * Qui dentro non c'e' logica: il servizio non legge la fascia e non conta
 * niente. Tiene solo acceso il processo, e a lavorare continua la pagina.
 */
public class ServizioSeduta extends Service {

  public static final String CANALE = "seduta-in-corso";
  public static final String EXTRA_TESTO = "testo";
  private static final int ID_NOTIFICA = 1801;

  /** Programma i segnali sonori del conto alla rovescia. */
  public static final String AZIONE_BIP = "app.etphealth.gym.BIP";
  /** Cancella tutti i segnali programmati. */
  public static final String AZIONE_ANNULLA = "app.etphealth.gym.ANNULLA_BIP";
  public static final String EXTRA_ISTANTI = "istanti"; // millisecondi da adesso
  public static final String EXTRA_TIPI = "tipi";       // via | riposo | fine
  public static final String EXTRA_TICK = "tick";       // quanti tic prima di ciascuno

  /** Sei ore: nessuna seduta dura di piu', e un blocco dimenticato non deve prosciugare la batteria. */
  private static final long TETTO_MS = 6 * 60 * 60 * 1000L;

  private PowerManager.WakeLock sveglia;
  private final Handler mano = new Handler(Looper.getMainLooper());
  private String testoCorrente = "Seduta in corso";

  @Override
  public IBinder onBind(Intent intent) {
    return null; // non si parla col servizio: si accende e si spegne, basta.
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String azione = intent != null ? intent.getAction() : null;
    if (intent != null && intent.getStringExtra(EXTRA_TESTO) != null) {
      testoCorrente = intent.getStringExtra(EXTRA_TESTO);
    }

    creaCanale();
    Notification notifica = costruisci(testoCorrente);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Da Android 10 il tipo va dichiarato: "dispositivo collegato" e' la
      // fascia cardio. Senza tipo, da Android 14 il sistema rifiuta il servizio.
      startForeground(ID_NOTIFICA, notifica, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
    } else {
      startForeground(ID_NOTIFICA, notifica);
    }
    tieniSveglio();

    if (AZIONE_ANNULLA.equals(azione)) {
      mano.removeCallbacksAndMessages(null);
    } else if (AZIONE_BIP.equals(azione)) {
      programma(
          intent.getLongArrayExtra(EXTRA_ISTANTI),
          intent.getStringArrayExtra(EXTRA_TIPI),
          intent.getIntArrayExtra(EXTRA_TICK));
    }

    // START_STICKY: se il sistema lo uccide per memoria, lo rimette in piedi.
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    mano.removeCallbacksAndMessages(null);
    lasciaDormire();
    super.onDestroy();
  }

  /**
   * I segnali del conto alla rovescia, suonati da qui e non dalla pagina.
   *
   * Fuori dall'app la pagina viene rallentata da Android a un battito al minuto:
   * i tic degli ultimi secondi e il «Vai!» arrivavano tardi o non arrivavano.
   * Il servizio invece e' sveglio davvero, e ha il suo orologio.
   *
   * Ogni istante e' un momento in cui deve succedere qualcosa (fine recupero,
   * cambio di fase del cardio), con quanti tic fargli precedere. Il canale e'
   * quello della sveglia: si sente anche con la musica alta.
   */
  private void programma(long[] istanti, String[] tipi, int[] tick) {
    mano.removeCallbacksAndMessages(null);
    if (istanti == null) return;
    for (int i = 0; i < istanti.length; i++) {
      final long quando = istanti[i];
      if (quando <= 0) continue;
      final String tipo = tipi != null && i < tipi.length ? tipi[i] : "via";
      final int quanti = tick != null && i < tick.length ? tick[i] : 3;

      for (int t = quanti; t > 0; t--) {
        long fra = quando - t * 1000L;
        if (fra > 0) mano.postDelayed(() -> suona("tic"), fra);
      }
      mano.postDelayed(() -> suona(tipo), quando);
    }
  }

  /**
   * Un segnale: suono sul canale sveglia + vibrazione.
   *
   * Il tono non arriva da ToneGenerator ma se lo scrive questo servizio, nota
   * per nota: cosi' si sa esattamente com'e' fatto — onda quadra, che ha le
   * armoniche acute che bucano la musica dove un fischio pulito sparisce — e
   * non dipende da un pezzo di Android che ogni tanto resta muto senza dirlo.
   */
  private void suona(String tipo) {
    switch (tipo) {
      case "tic":
        nota(new int[][]{{1000, 90}});
        vibra(new long[]{0, 30});
        break;
      case "riposo":
        nota(new int[][]{{660, 170}, {0, 30}, {480, 300}});
        vibra(new long[]{0, 140});
        break;
      case "fine":
        nota(new int[][]{{784, 180}, {988, 180}, {1175, 180}, {0, 60}, {1568, 550}});
        vibra(new long[]{0, 150, 70, 250, 70, 250});
        break;
      default: // via
        nota(new int[][]{{1320, 160}, {0, 70}, {1320, 160}, {0, 70}, {1320, 160}, {0, 70}, {1600, 520}});
        vibra(new long[]{0, 200, 80, 200, 80, 200});
        break;
    }
  }

  private static final int CAMPIONI = 44100;

  /**
   * Suona una sequenza di note: ogni riga e' {frequenza in Hz, durata in ms},
   * frequenza 0 = silenzio.
   *
   * Prima si chiede il FUOCO AUDIO: e' quello che fa abbassare la musica per un
   * secondo. Senza, il beep parte davvero ma finisce sotto la canzone — che e'
   * esattamente come suonava prima.
   */
  private void nota(int[][] sequenza) {
    int durataMs = 0;
    for (int[] n : sequenza) durataMs += n[1];

    AudioAttributes attributi = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();

    AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
    AudioFocusRequest fuoco = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attributi)
        .build();
    if (am != null) am.requestAudioFocus(fuoco);

    try {
      byte[] pcm = onda(sequenza);
      AudioTrack tr = new AudioTrack.Builder()
          .setAudioAttributes(attributi)
          .setAudioFormat(new AudioFormat.Builder()
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setSampleRate(CAMPIONI)
              .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
              .build())
          .setBufferSizeInBytes(pcm.length)
          .setTransferMode(AudioTrack.MODE_STATIC)
          .build();
      tr.write(pcm, 0, pcm.length);
      tr.setVolume(AudioTrack.getMaxVolume());
      tr.play();
      // Il lettore si butta quando ha finito, non prima: rilasciarlo subito
      // taglierebbe il suono a meta'.
      mano.postDelayed(() -> { try { tr.release(); } catch (RuntimeException ignored) { } }, durataMs + 400L);
    } catch (RuntimeException e) {
      // Senza suono resta la vibrazione: meglio di niente, e non si porta giu' il servizio.
    }

    if (am != null) mano.postDelayed(() -> am.abandonAudioFocusRequest(fuoco), durataMs + 500L);
  }

  /** La sequenza scritta come onda quadra, con attacco e coda smussati. */
  private byte[] onda(int[][] sequenza) {
    int totale = 0;
    for (int[] n : sequenza) totale += (int) (CAMPIONI * (n[1] / 1000.0));
    byte[] out = new byte[totale * 2];

    int i = 0;
    for (int[] n : sequenza) {
      int freq = n[0];
      int campioni = (int) (CAMPIONI * (n[1] / 1000.0));
      // Venti millesimi di rampa: senza, ogni nota comincia e finisce con uno
      // schiocco che si sente piu' della nota stessa.
      int rampa = Math.min(campioni / 2, CAMPIONI / 50);
      for (int c = 0; c < campioni; c++, i++) {
        double v = 0;
        if (freq > 0) {
          double fase = (c * freq / (double) CAMPIONI) % 1.0;
          v = fase < 0.5 ? 1.0 : -1.0;              // onda quadra: ricca di acuti
          if (c < rampa) v *= c / (double) rampa;
          if (c > campioni - rampa) v *= (campioni - c) / (double) rampa;
        }
        short s = (short) (v * 0.85 * Short.MAX_VALUE);
        out[i * 2] = (byte) (s & 0xff);
        out[i * 2 + 1] = (byte) ((s >> 8) & 0xff);
      }
    }
    return out;
  }

  private void vibra(long[] schema) {
    try {
      Vibrator v;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        VibratorManager vm = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
        v = vm == null ? null : vm.getDefaultVibrator();
      } else {
        v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
      }
      if (v == null || !v.hasVibrator()) return;
      v.vibrate(VibrationEffect.createWaveform(schema, -1));
    } catch (RuntimeException ignored) { /* senza vibrazione si vive */ }
  }

  /**
   * Il processore non deve addormentarsi col telefono in tasca.
   *
   * Il servizio in primo piano impedisce il congelamento, ma a schermo spento
   * il telefono va comunque in sonno profondo fra un battito e l'altro: i dati
   * arrivano a scatti e la registrazione si buca. Questo lo tiene sveglio —
   * solo mentre la seduta e' aperta, e comunque non oltre sei ore.
   */
  private void tieniSveglio() {
    if (sveglia != null && sveglia.isHeld()) return;
    PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
    if (pm == null) return;
    sveglia = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ETPHEALTH::seduta");
    sveglia.setReferenceCounted(false);
    sveglia.acquire(TETTO_MS);
  }

  private void lasciaDormire() {
    if (sveglia != null && sveglia.isHeld()) sveglia.release();
    sveglia = null;
  }

  private void creaCanale() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null || nm.getNotificationChannel(CANALE) != null) return;
    // Importanza bassa: deve stare li' senza suonare e senza saltarti addosso
    // mentre ti alleni.
    NotificationChannel canale = new NotificationChannel(CANALE, "Seduta in corso", NotificationManager.IMPORTANCE_LOW);
    canale.setDescription("Tiene attiva la registrazione mentre sei fuori dall'app.");
    canale.setShowBadge(false);
    canale.setSound(null, null);
    nm.createNotificationChannel(canale);
  }

  private Notification costruisci(String testo) {
    Intent apri = new Intent(this, MainActivity.class);
    apri.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent tocco = PendingIntent.getActivity(
        this, 0, apri, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    return new NotificationCompat.Builder(this, CANALE)
        .setContentTitle("ETP HEALTH")
        .setContentText(testo)
        .setSmallIcon(R.drawable.ic_cuore)
        .setContentIntent(tocco)
        .setOngoing(true)          // non si scarta per sbaglio con uno swipe
        .setSilent(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_WORKOUT)
        .build();
  }
}
