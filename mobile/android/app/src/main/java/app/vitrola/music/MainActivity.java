package app.vitrola.music;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locais precisam ser registrados antes do super.onCreate (que cria o bridge).
        registerPlugin(VitrolaPlugin.class);
        registerPlugin(AudioOutputPlugin.class);
        registerPlugin(MediaPlugin.class);
        super.onCreate(savedInstanceState);

        // Serve as músicas baixadas com suporte real a Range (seek e crossfade).
        bridge.setWebViewClient(new MediaWebViewClient(bridge));

        // Com a tela apagada o WebView abre mão da prioridade do processo de renderização
        // (onde roda o JS e o <audio>), e o sistema o congela (no HyperOS/MIUI na hora),
        // mesmo com o serviço em primeiro plano ativo. Mantém a prioridade do app.
        if (Build.VERSION.SDK_INT >= 26) {
            bridge.getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }

        // Android 13+: a notificação do serviço em primeiro plano (tocando/baixando) precisa de permissão.
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        }
    }
}
