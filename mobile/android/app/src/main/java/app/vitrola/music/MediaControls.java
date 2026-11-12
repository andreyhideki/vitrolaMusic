package app.vitrola.music;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sessão de mídia nativa do Android. O WebView não repassa o Media Session do JavaScript
 * para o sistema, então sem isto a central multimídia do carro (AVRCP pelo Bluetooth), a
 * notificação e a tela de bloqueio não recebem título/artista/álbum nem os botões.
 *
 * O JS (mobile/src/mediaSession.ts) manda o estado por MediaPlugin.update; os botões do
 * carro, do fone e da notificação voltam ao JS pelo evento "action".
 */
public final class MediaControls {

    private static final String TAG = "VitrolaMedia";
    static final String ACTION_PLAY = "app.vitrola.music.PLAY";
    static final String ACTION_PAUSE = "app.vitrola.music.PAUSE";
    static final String ACTION_NEXT = "app.vitrola.music.NEXT";
    static final String ACTION_PREVIOUS = "app.vitrola.music.PREVIOUS";

    /** Recebe as ações (play, pause, next, previous, seekTo) e repassa ao JS. */
    interface Listener {
        void onAction(String action, long positionMs);
    }

    private static MediaControls instance;

    private final Context context;
    private final MediaSessionCompat session;
    private final ExecutorService artLoader = Executors.newSingleThreadExecutor();
    private volatile Listener listener;

    // Estado atual (o que a notificação e o carro mostram).
    volatile boolean hasTrack;
    volatile boolean playing;
    volatile String title = "";
    volatile String artist = "";
    volatile String album = "";
    volatile Bitmap art;
    private volatile String artUrl;
    private long durationMs;
    private long positionMs;

    static synchronized MediaControls get(Context ctx) {
        if (instance == null) instance = new MediaControls(ctx.getApplicationContext());
        return instance;
    }

    /** Já existe? (a notificação consulta sem criar a sessão). */
    static MediaControls peek() {
        return instance;
    }

    private MediaControls(Context context) {
        this.context = context;
        session = new MediaSessionCompat(context, "Vitrola");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { dispatch("play", 0); }
            @Override public void onPause() { dispatch("pause", 0); }
            @Override public void onStop() { dispatch("pause", 0); }
            @Override public void onSkipToNext() { dispatch("next", 0); }
            @Override public void onSkipToPrevious() { dispatch("previous", 0); }
            @Override public void onSeekTo(long pos) { dispatch("seekTo", pos); }
        });
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        session.setSessionActivity(PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        applyState();
    }

    MediaSessionCompat.Token token() {
        return session.getSessionToken();
    }

    void setListener(Listener l) {
        listener = l;
    }

    void dispatch(String action, long pos) {
        Listener l = listener;
        if (l != null) l.onAction(action, pos);
        else Log.w(TAG, "Ação sem ouvinte: " + action);
    }

    /** Atualiza a sessão e a notificação com o estado vindo do player. */
    synchronized void update(boolean hasTrack, boolean playing, String title, String artist, String album,
                             String artworkUrl, long durationMs, long positionMs) {
        boolean metaChanged = !eq(this.title, title) || !eq(this.artist, artist) || !eq(this.album, album)
            || this.durationMs != durationMs || this.hasTrack != hasTrack;
        this.hasTrack = hasTrack;
        this.playing = playing;
        this.title = title;
        this.artist = artist;
        this.album = album;
        this.durationMs = durationMs;
        this.positionMs = positionMs;

        if (!eq(artUrl, artworkUrl)) {
            artUrl = artworkUrl;
            art = null;
            metaChanged = true;
            if (artworkUrl != null && !artworkUrl.isEmpty()) loadArt(artworkUrl);
        }
        if (metaChanged) applyMetadata();
        applyState();
        session.setActive(hasTrack);
        KeepAliveService.refresh(context);
    }

    private void applyMetadata() {
        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_DESCRIPTION, album);
        if (durationMs > 0) b.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        Bitmap a = art;
        if (a != null) {
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, a);
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, a);
        }
        session.setMetadata(b.build());
    }

    private void applyState() {
        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_STOP
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_SEEK_TO;
        int state = !hasTrack ? PlaybackStateCompat.STATE_NONE
            : playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(state, positionMs, playing ? 1f : 0f)
            .build());
    }

    private void loadArt(String url) {
        artLoader.execute(() -> {
            Bitmap bmp = download(url);
            synchronized (this) {
                if (!eq(artUrl, url) || bmp == null) return;
                art = bmp;
                applyMetadata();
            }
            KeepAliveService.refresh(context);
        });
    }

    private static Bitmap download(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            try (InputStream in = conn.getInputStream()) {
                Bitmap bmp = BitmapFactory.decodeStream(in);
                if (bmp == null) return null;
                // Centrais multimídia e o Binder têm limite de tamanho: 512 px basta.
                int max = Math.max(bmp.getWidth(), bmp.getHeight());
                if (max <= 512) return bmp;
                float scale = 512f / max;
                return Bitmap.createScaledBitmap(bmp, Math.round(bmp.getWidth() * scale), Math.round(bmp.getHeight() * scale), true);
            }
        } catch (Exception e) {
            Log.w(TAG, "Capa não carregou: " + e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static boolean eq(String a, String b) {
        return a == null ? b == null : a.equals(b);
    }
}
