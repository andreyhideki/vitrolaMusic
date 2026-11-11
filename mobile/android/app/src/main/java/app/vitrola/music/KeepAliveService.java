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
    private static final String CHANNEL_ID = "vitrola_background";
    private static final int NOTIFICATION_ID = 1;
    private static final long WAKE_LOCK_TIMEOUT_MS = 6L * 60 * 60 * 1000;

    private PowerManager.WakeLock wakeLock;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        boolean playing = intent != null && intent.getBooleanExtra(EXTRA_PLAYING, false);
        boolean downloading = intent != null && intent.getBooleanExtra(EXTRA_DOWNLOADING, false);

        if (!playing && !downloading) {
            stop();
            return START_NOT_STICKY;
        }

        int type = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (playing) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            if (downloading) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(playing, downloading), type);
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
        releaseWakeLock();
        super.onDestroy();
    }

    private void stop() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        releaseWakeLock();
        stopSelf();
    }

    private Notification buildNotification(boolean playing, boolean downloading) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Reprodução e downloads", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }

        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        String text = playing ? (downloading ? "Tocando · baixando músicas" : "Tocando") : "Baixando músicas";
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(playing ? android.R.drawable.ic_media_play : android.R.drawable.stat_sys_download)
            .setContentTitle("Vitrola Music")
            .setContentText(text)
            .setContentIntent(content)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(playing ? NotificationCompat.CATEGORY_TRANSPORT : NotificationCompat.CATEGORY_PROGRESS)
            .build();
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
