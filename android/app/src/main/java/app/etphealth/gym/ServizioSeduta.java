package app.etphealth.gym;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
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

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

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
  /** Le note dei quattro segnali, scritte dalla pagina: {"tic":{...},"via":{...}} */
  public static final String EXTRA_SUONO = "suono";
  /** Quanto forte in cuffia, in centesimi. Dall'altoparlante resta pieno. */
  public static final String EXTRA_VOLUME = "volume";

  /** Sei ore: nessuna seduta dura di piu', e un blocco dimenticato non deve prosciugare la batteria. */
  private static final long TETTO_MS = 6 * 60 * 60 * 1000L;

  private PowerManager.WakeLock sveglia;
  private final Handler mano = new Handler(Looper.getMainLooper());
  /*
   * Una lista di promemoria a parte per l'audio.
   *
   * Quella dei bip viene svuotata di colpo quando rientri nell'app o si
   * riprogrammano i segnali: se dentro c'era anche il «rilascia il fuoco audio»,
   * quello non partiva piu' e la musica restava abbassata per sempre.
   */
  private final Handler manoAudio = new Handler(Looper.getMainLooper());
  private AudioFocusRequest fuocoAttivo;
  /** L'ultima tabella dei suoni ricevuta. Vuota = le note di riserva qui sotto. */
  private JSONObject suoni;
  private int volumeCuffie = 35;
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
      rilasciaFuoco();
    } else if (AZIONE_BIP.equals(azione)) {
      String tabella = intent.getStringExtra(EXTRA_SUONO);
      if (tabella != null) {
        try { suoni = new JSONObject(tabella); } catch (JSONException e) { suoni = null; }
      }
      volumeCuffie = Math.max(0, Math.min(100, intent.getIntExtra(EXTRA_VOLUME, volumeCuffie)));
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
    manoAudio.removeCallbacksAndMessages(null);
    rilasciaFuoco();
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
   * Un segnale: suono + vibrazione.
   *
   * Le note non stanno qui: arrivano dalla pagina insieme ai tempi, perche' il
   * suono lo scegli tu e deve essere lo stesso dentro e fuori dall'app. Quelle
   * scritte sotto sono solo la riserva per il caso — raro — in cui il servizio
   * riparta da solo senza aver ancora ricevuto niente.
   */
  private void suona(String tipo) {
    if (suoni != null) {
      JSONObject v = suoni.optJSONObject(tipo);
      if (v != null) { suonaVoce(v); return; }
    }
    switch (tipo) {
      case "tic":
        nota(new int[][]{{1000, 90}}, "square", false);
        vibra(new long[]{0, 30});
        break;
      case "riposo":
        nota(new int[][]{{660, 170}, {0, 30}, {480, 300}}, "square", false);
        vibra(new long[]{0, 140});
        break;
      case "fine":
        nota(new int[][]{{784, 180}, {988, 180}, {1175, 180}, {0, 60}, {1568, 550}}, "square", false);
        vibra(new long[]{0, 150, 70, 250, 70, 250});
        break;
      default: // via
        nota(new int[][]{{1320, 160}, {0, 70}, {1320, 160}, {0, 70}, {1320, 160}, {0, 70}, {1600, 520}}, "square", false);
        vibra(new long[]{0, 200, 80, 200, 80, 200});
        break;
    }
  }

  /** Una voce come l'ha scritta la pagina: note, forma dell'onda, coda, vibrazione. */
  private void suonaVoce(JSONObject v) {
    JSONArray note = v.optJSONArray("note");
    if (note != null) {
      int[][] seq = new int[note.length()][2];
      for (int i = 0; i < note.length(); i++) {
        JSONArray n = note.optJSONArray(i);
        seq[i][0] = n == null ? 0 : n.optInt(0, 0);
        seq[i][1] = n == null ? 0 : n.optInt(1, 0);
      }
      nota(seq, v.optString("onda", "square"), v.optBoolean("decadi", false));
    }
    JSONArray vib = v.optJSONArray("vibra");
    if (vib != null) {
      long[] schema = new long[vib.length()];
      for (int i = 0; i < vib.length(); i++) schema[i] = vib.optLong(i, 0);
      vibra(schema);
    }
  }

  private static final int CAMPIONI = 44100;

  /** Rilascia il fuoco audio, se ce l'abbiamo: la musica torna al suo volume. */
  private synchronized void rilasciaFuoco() {
    AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
    if (am != null && fuocoAttivo != null) am.abandonAudioFocusRequest(fuocoAttivo);
    fuocoAttivo = null;
  }

  /**
   * Suona una sequenza di note: ogni riga e' {frequenza in Hz, durata in ms},
   * frequenza 0 = silenzio.
   *
   * Prima si chiede il FUOCO AUDIO: e' quello che fa abbassare la musica per un
   * secondo. Senza, il beep parte davvero ma finisce sotto la canzone — che e'
   * esattamente come suonava prima.
   */
  private void nota(int[][] sequenza, String forma, boolean decadi) {
    int durataMs = 0;
    for (int[] n : sequenza) durataMs += n[1];

    AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);

    // Con le cuffie il beep NON deve uscire anche dall'altoparlante.
    //
    // Non era un difetto nostro: Android manda la sveglia sempre anche allo
    // scatolotto, apposta, perche' una sveglia nelle sole cuffie sfilate non
    // sveglia nessuno. In palestra pero' non stai dormendo: hai le cuffie, e il
    // telefono che squilla in sala e' solo roba tua sparata agli altri.
    //
    // Con le cuffie collegate il beep diventa audio normale, che segue il
    // percorso delle cuffie e basta. Senza cuffie resta sveglia: cosi' regge
    // col volume dei media a zero e col telefono in tasca.
    boolean cuffie = inCuffia(am);
    AudioAttributes attributi = new AudioAttributes.Builder()
        .setUsage(cuffie ? AudioAttributes.USAGE_MEDIA : AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();

    synchronized (this) {
      if (fuocoAttivo == null) {
        fuocoAttivo = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attributi)
            .build();
        if (am != null) am.requestAudioFocus(fuocoAttivo);
      }
    }
    // Il rilascio va sulla lista dell'audio, che non viene mai svuotata, e si
    // rimanda a ogni nuovo segnale: durante i tic la musica resta bassa una
    // volta sola invece di ballare a ogni secondo.
    manoAudio.removeCallbacksAndMessages(null);

    try {
      byte[] pcm = onda(sequenza, forma, decadi);
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
      // In cuffia il beep te lo ritrovi dentro l'orecchio, non a mezzo metro:
      // a volume pieno spacca i timpani. Un terzo basta e avanza, tanto la
      // musica in quel momento e' gia' abbassata dal ducking. Dall'altoparlante
      // resta pieno: li' il telefono e' in tasca e deve bucare la sala.
      tr.setVolume(cuffie ? AudioTrack.getMaxVolume() * (volumeCuffie / 100f) : AudioTrack.getMaxVolume());
      tr.play();
      // Il lettore si butta quando ha finito, non prima: rilasciarlo subito
      // taglierebbe il suono a meta'.
      mano.postDelayed(() -> { try { tr.release(); } catch (RuntimeException ignored) { } }, durataMs + 400L);
    } catch (RuntimeException e) {
      // Senza suono resta la vibrazione: meglio di niente, e non si porta giu' il servizio.
    }

    manoAudio.postDelayed(this::rilasciaFuoco, durataMs + 600L);
  }

  /**
   * Stai ascoltando in cuffia? Jack, USB o Bluetooth: per noi sono la stessa
   * cosa — un'uscita privata, dove il suono resta tuo.
   */
  private boolean inCuffia(AudioManager am) {
    if (am == null) return false;
    try {
      for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
        switch (d.getType()) {
          case AudioDeviceInfo.TYPE_WIRED_HEADSET:
          case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
          case AudioDeviceInfo.TYPE_USB_HEADSET:
          case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
          case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
          case AudioDeviceInfo.TYPE_HEARING_AID:
            return true;
          default:
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && (d.getType() == AudioDeviceInfo.TYPE_BLE_HEADSET
                 || d.getType() == AudioDeviceInfo.TYPE_BLE_SPEAKER)) return true;
        }
      }
    } catch (RuntimeException ignored) { }
    return false;
  }

  /**
   * La sequenza scritta come onda, con attacco e coda smussati.
   *
   * La forma cambia il carattere: quadra e' ricca di acuti e buca la musica,
   * sinusoide e' tonda, triangolare sta in mezzo. Col decadimento la nota si
   * spegne mentre suona — e' quello che distingue una campana da un beep.
   */
  private byte[] onda(int[][] sequenza, String forma, boolean decadi) {
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
          if ("sine".equals(forma)) {
            v = Math.sin(2 * Math.PI * fase);
          } else if ("triangle".equals(forma)) {
            v = fase < 0.5 ? (4 * fase - 1) : (3 - 4 * fase);
          } else {
            v = fase < 0.5 ? 1.0 : -1.0;            // quadra: ricca di acuti
          }
          if (decadi) v *= Math.pow(1.0 - (c / (double) campioni), 2.2);
          if (c < rampa) v *= c / (double) rampa;
          if (!decadi && c > campioni - rampa) v *= (campioni - c) / (double) rampa;
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
