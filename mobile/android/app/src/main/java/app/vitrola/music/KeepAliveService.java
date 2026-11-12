package app.vitrola.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

/**
 * Serviço em primeiro plano enquanto há música tocando ou downloads na fila. Mantém o
 * processo (e o WebView, onde roda a "API" local) vivo com a tela apagada e segura um
 * wake lock parcial para os downloads continuarem.
 */
public class KeepAliveService extends Service {

    static final String EXTRA_PLAYING = "playing";
    static final String EXTRA_DOWNLOADING = "downloading";
    static final String EXTRA_CURRENT = "downloadCurrent";
    static final String EXTRA_TOTAL = "downloadTotal";
    private static final String CHANNEL_ID = "vitrola_background";
    private static final int NOTIFICATION_ID = 1;
    private static final long WAKE_LOCK_TIMEOUT_MS = 6L * 60 * 60 * 1000;

    private PowerManager.WakeLock wakeLock;

    /** Estado do serviço em execução (null se parado): tocando / baixando. */
    private static volatile boolean[] runningState;
    /** Último contador de downloads (para redesenhar a notificação quando a música muda). */
    private static volatile int lastCurrent, lastTotal;

    /**
     * Se o serviço já roda com os mesmos tipos (tocando/baixando), só troca o texto da
     * notificação. Devolve false quando é preciso (re)iniciar ou parar o serviço.
     */
    static boolean updateIfRunning(Context ctx, boolean playing, boolean downloading, int current, int total) {
        boolean[] state = runningState;
        if (state == null || state[0] != playing || state[1] != downloading) return false;
        lastCurrent = current;
        lastTotal = total;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(NOTIFICATION_ID, buildNotification(ctx, playing, downloading, current, total));
        return true;
    }

    /** A música (título, capa, tocando/pausado) mudou: redesenha a notificação, se o serviço roda. */
    static void refresh(Context ctx) {
        boolean[] state = runningState;
        if (state == null) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(NOTIFICATION_ID, buildNotification(ctx, state[0], state[1], lastCurrent, lastTotal));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        boolean playing = intent != null && intent.getBooleanExtra(EXTRA_PLAYING, false);
        boolean downloading = intent != null && intent.getBooleanExtra(EXTRA_DOWNLOADING, false);
        int current = intent != null ? intent.getIntExtra(EXTRA_CURRENT, 0) : 0;
        int total = intent != null ? intent.getIntExtra(EXTRA_TOTAL, 0) : 0;
        lastCurrent = current;
        lastTotal = total;

        if (!playing && !downloading) {
            stop();
            return START_NOT_STICKY;
        }

        int type = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (playing) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            if (downloading) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(this, playing, downloading, current, total), type);
        runningState = new boolean[] { playing, downloading };
        acquireWakeLock();
        return START_NOT_STICKY;
    }

    /** Android 15: o tipo dataSync tem limite diário; ao esgotar, o sistema chama este método. */
    @Override
    public void onTimeout(int startId, int fgsType) {
        stop();
    }

    @Override
    public void onDestroy() {
        runningState = null;
        releaseWakeLock();
        super.onDestroy();
    }

    private void stop() {
        runningState = null;
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        releaseWakeLock();
        stopSelf();
    }

    private static Notification buildNotification(Context ctx, boolean playing, boolean downloading, int current, int total) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Reprodução e downloads", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }

        Intent open = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        String download = total > 0 ? "Baixando " + current + " de " + total : "Baixando músicas";

        // Com música carregada: notificação de player (capa, título, artista e botões), que o
        // Android também mostra na tela de bloqueio. Os downloads viram o subtexto.
        MediaControls media = MediaControls.peek();
        if (playing && media != null && media.hasTrack) {
            boolean isPlaying = media.playing;
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(isPlaying ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)
                .setContentTitle(media.title)
                .setContentText(media.album.isEmpty() ? media.artist : media.artist + " · " + media.album)
                .setLargeIcon(media.art)
                .setContentIntent(content)
                .setOngoing(isPlaying)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .addAction(android.R.drawable.ic_media_previous, "Voltar", mediaIntent(ctx, MediaControls.ACTION_PREVIOUS, 1))
                .addAction(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                    isPlaying ? "Pausar" : "Tocar",
                    mediaIntent(ctx, isPlaying ? MediaControls.ACTION_PAUSE : MediaControls.ACTION_PLAY, 2))
                .addAction(android.R.drawable.ic_media_next, "Avançar", mediaIntent(ctx, MediaControls.ACTION_NEXT, 3))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(media.token())
                    .setShowActionsInCompactView(0, 1, 2));
            if (downloading) b.setSubText(download);
            return b.build();
        }

        String text = playing ? (downloading ? "Tocando · " + download.toLowerCase() : "Tocando") : download;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(playing ? android.R.drawable.ic_media_play : android.R.drawable.stat_sys_download)
            .setContentTitle("Vitrola Music")
            .setContentText(text)
            .setContentIntent(content)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setCategory(playing ? NotificationCompat.CATEGORY_TRANSPORT : NotificationCompat.CATEGORY_PROGRESS);
        // Barra de progresso da leva: faixas concluídas de total.
        if (downloading && total > 0) builder.setProgress(total, current - 1, false);
        return builder.build();
    }

    private static PendingIntent mediaIntent(Context ctx, String action, int requestCode) {
        Intent i = new Intent(ctx, MediaActionReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(ctx, requestCode, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vitrola:background");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS);
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }
}
