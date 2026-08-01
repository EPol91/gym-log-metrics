package app.etphealth.gym;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Da Android 15 la finestra e' a tutto schermo per forza: il contenuto parte
 * sotto la barra di stato e finisce sotto quella di navigazione. Nel browser se
 * ne occupa Chrome; qui no, e senza questo l'app appare tutta schiacciata in
 * alto, col titolo sotto l'orologio.
 *
 * Qui si chiede al sistema quanto spazio occupano le sue barre e lo si gira
 * alla pagina come margine. Nessun numero fisso: cambia da telefono a telefono,
 * e cambia anche a schermo ruotato o con la navigazione a gesti.
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Barre trasparenti sul nero dell'app, con icone chiare: la barra di stato
    // non deve sembrare un pezzo estraneo incollato sopra.
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    WindowInsetsControllerCompat barre =
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    barre.setAppearanceLightStatusBars(false);
    barre.setAppearanceLightNavigationBars(false);

    final View radice = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(radice, (vista, insets) -> {
      Insets barreSistema = insets.getInsets(
          WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
      vista.setPadding(barreSistema.left, barreSistema.top, barreSistema.right, barreSistema.bottom);
      return insets;
    });
  }
}
