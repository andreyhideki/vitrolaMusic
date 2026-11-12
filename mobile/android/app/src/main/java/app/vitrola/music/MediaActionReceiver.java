package app.vitrola.music;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Botões da notificação (voltar, tocar/pausar, avançar): repassa para a sessão de mídia. */
public class MediaActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        MediaControls media = MediaControls.get(context);
        switch (action) {
            case MediaControls.ACTION_PLAY: media.dispatch("play", 0); break;
            case MediaControls.ACTION_PAUSE: media.dispatch("pause", 0); break;
            case MediaControls.ACTION_NEXT: media.dispatch("next", 0); break;
            case MediaControls.ACTION_PREVIOUS: media.dispatch("previous", 0); break;
            default: break;
        }
    }
}
