package app.etphealth.gym;

import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
}
