package app.etphealth.gym;

import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;

/**
 * L'interruttore che la pagina usa per accendere il servizio della seduta.
 *
 * Due metodi e nient'altro: accendi quando comincia la registrazione, spegni
 * quando la chiudi. La logica sta tutta nella pagina — qui si tocca solo
 * l'interruttore che tiene sveglia l'app (vedi ServizioSeduta).
 */
@CapacitorPlugin(name = "SedutaViva")
public class SedutaViva extends Plugin {

  @PluginMethod
  public void accendi(PluginCall call) {
    Intent i = new Intent(getContext(), ServizioSeduta.class);
    i.putExtra(ServizioSeduta.EXTRA_TESTO, call.getString("testo", "Seduta in corso"));
    // startForegroundService: da Android 8 un servizio in primo piano si avvia
    // cosi', e ha cinque secondi per mostrare la sua notifica o viene ucciso.
    ContextCompat.startForegroundService(getContext(), i);
    call.resolve();
  }

  @PluginMethod
  public void spegni(PluginCall call) {
    getContext().stopService(new Intent(getContext(), ServizioSeduta.class));
    call.resolve();
  }

  /**
   * I segnali del conto alla rovescia, affidati al servizio.
   *
   * Arriva un elenco di momenti — fine del recupero, cambi di fase del cardio —
   * ciascuno con il suo tipo e con quanti tic fargli precedere. Da qui in poi
   * suona il servizio, che e' sveglio anche quando la pagina viene rallentata.
   */
  @PluginMethod
  public void programmaBip(PluginCall call) {
    JSArray elenco = call.getArray("bip");
    if (elenco == null) { call.resolve(); return; }

    long[] istanti;
    String[] tipi;
    int[] tick;
    try {
      List<JSONObject> righe = elenco.toList();
      istanti = new long[righe.size()];
      tipi = new String[righe.size()];
      tick = new int[righe.size()];
      for (int i = 0; i < righe.size(); i++) {
        JSONObject r = righe.get(i);
        istanti[i] = r.optLong("ms", 0);
        tipi[i] = r.optString("tipo", "via");
        tick[i] = r.optInt("tick", 3);
      }
    } catch (JSONException e) {
      call.reject("Segnali illeggibili");
      return;
    }

    Intent i = new Intent(getContext(), ServizioSeduta.class);
    i.setAction(ServizioSeduta.AZIONE_BIP);
    i.putExtra(ServizioSeduta.EXTRA_ISTANTI, istanti);
    i.putExtra(ServizioSeduta.EXTRA_TIPI, tipi);
    i.putExtra(ServizioSeduta.EXTRA_TICK, tick);
    ContextCompat.startForegroundService(getContext(), i);
    call.resolve();
  }

  /** Rientri nell'app, o il timer si ferma: i segnali programmati si buttano. */
  @PluginMethod
  public void annullaBip(PluginCall call) {
    Intent i = new Intent(getContext(), ServizioSeduta.class);
    i.setAction(ServizioSeduta.AZIONE_ANNULLA);
    ContextCompat.startForegroundService(getContext(), i);
    call.resolve();
  }
}
