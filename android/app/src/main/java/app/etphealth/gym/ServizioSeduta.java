package app.etphealth.gym;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

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

  /** Sei ore: nessuna seduta dura di piu', e un blocco dimenticato non deve prosciugare la batteria. */
  private static final long TETTO_MS = 6 * 60 * 60 * 1000L;

  private PowerManager.WakeLock sveglia;

  @Override
  public IBinder onBind(Intent intent) {
    return null; // non si parla col servizio: si accende e si spegne, basta.
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String testo = intent != null && intent.getStringExtra(EXTRA_TESTO) != null
        ? intent.getStringExtra(EXTRA_TESTO)
        : "Seduta in corso";

    creaCanale();
    Notification notifica = costruisci(testo);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Da Android 10 il tipo va dichiarato: "dispositivo collegato" e' la
      // fascia cardio. Senza tipo, da Android 14 il sistema rifiuta il servizio.
      startForeground(ID_NOTIFICA, notifica, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
    } else {
      startForeground(ID_NOTIFICA, notifica);
    }
    tieniSveglio();

    // START_STICKY: se il sistema lo uccide per memoria, lo rimette in piedi.
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    lasciaDormire();
    super.onDestroy();
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
