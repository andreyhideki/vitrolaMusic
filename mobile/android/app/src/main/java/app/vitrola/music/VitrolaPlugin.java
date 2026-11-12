package app.vitrola.music;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.yausername.ffmpeg.FFmpeg;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLException;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import com.yausername.youtubedl_android.YoutubeDLResponse;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import kotlin.Unit;

/**
 * Ponte entre a "API" que roda no WebView (api/src, via mobile/src/shims/child_process.ts)
 * e os programas nativos empacotados pela youtubedl-android: yt-dlp (Python), ffmpeg e ffprobe.
 * Os argumentos são exatamente os que api/src/services/external.ts e audio-meta.ts montam.
 */
@CapacitorPlugin(name = "Vitrola")
public class VitrolaPlugin extends Plugin {

    private static final String TAG = "Vitrola";
    private static final long AUTO_UPDATE_INTERVAL_MS = 24L * 60 * 60 * 1000;
    private static final long DEFAULT_TIMEOUT_MS = 180_000;

    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor();
    private final CountDownLatch ready = new CountDownLatch(1);
    /** exec usa a trava de leitura; a atualização do yt-dlp, a de escrita (não troca o binário no meio de um download). */
    private final ReentrantReadWriteLock ytdlpLock = new ReentrantReadWriteLock();
    private final Map<String, Process> processes = new ConcurrentHashMap<>();
    private volatile String initError;

    @Override
    public void load() {
        pool.execute(() -> {
            try {
                // Extrai Python, yt-dlp e ffmpeg na primeira execução (alguns segundos).
                YoutubeDL.getInstance().init(getContext());
                FFmpeg.getInstance().init(getContext());
            } catch (Exception e) {
                initError = "Falha ao preparar o yt-dlp/ffmpeg: " + e.getMessage();
                Log.e(TAG, initError, e);
            } finally {
                ready.countDown();
            }
            autoUpdate();
        });
    }

    // ---------- exec ----------

    @PluginMethod
    public void exec(PluginCall call) {
        String id = call.getString("id");
        String cmd = call.getString("cmd");
        JSArray rawArgs = call.getArray("args", new JSArray());
        long timeoutMs = call.getLong("timeoutMs", DEFAULT_TIMEOUT_MS);
        boolean streamOutput = Boolean.TRUE.equals(call.getBoolean("streamOutput", false));
        if (id == null || cmd == null) {
            call.reject("id e cmd são obrigatórios");
            return;
        }

        pool.execute(() -> {
            try {
                List<String> args = new ArrayList<>();
                for (int i = 0; i < rawArgs.length(); i++) args.add(rawArgs.getString(i));
                awaitReady();

                JSObject result;
                switch (cmd) {
                    case "yt-dlp":
                        result = runYtDlp(id, args, timeoutMs, streamOutput);
                        break;
                    case "ffmpeg":
                    case "ffprobe":
                        result = runBinary(id, cmd, args, timeoutMs);
                        break;
                    default:
                        call.reject("Programa não disponível: " + cmd);
                        return;
                }
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "exec " + cmd + " falhou", e);
                call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
            }
        });
    }

    @PluginMethod
    public void kill(PluginCall call) {
        String id = call.getString("id", "");
        YoutubeDL.getInstance().destroyProcessById(id);
        Process p = processes.remove(id);
        if (p != null) p.destroy();
        call.resolve();
    }

    private JSObject runYtDlp(String id, List<String> args, long timeoutMs, boolean streamOutput) throws InterruptedException {
        // external.ts checa a ferramenta com "--version" antes de cada download: responde sem subir o Python.
        if (args.size() == 1 && "--version".equals(args.get(0))) {
            String version = YoutubeDL.getInstance().version(getContext());
            return result(0, version != null ? version : "bundled", "");
        }

        YoutubeDLRequest request = new YoutubeDLRequest(Collections.emptyList());
        request.addCommands(args);

        ScheduledFuture<?> timeout = timers.schedule(() -> YoutubeDL.getInstance().destroyProcessById(id), timeoutMs, TimeUnit.MILLISECONDS);
        ytdlpLock.readLock().lock();
        try {
            YoutubeDLResponse r = YoutubeDL.getInstance().execute(request, id, false, (progress, eta, line) -> {
                if (streamOutput) {
                    JSObject e = new JSObject();
                    e.put("id", id);
                    e.put("line", line);
                    notifyListeners("execOutput", e);
                }
                return Unit.INSTANCE;
            });
            return result(r.getExitCode(), r.getOut(), r.getErr());
        } catch (YoutubeDL.CanceledException e) {
            return result(130, "", "ERROR: download cancelado ou tempo esgotado");
        } catch (YoutubeDLException e) {
            // A lib lança a exceção com o stderr do yt-dlp quando o código de saída é diferente de 0.
            return result(1, "", e.getMessage() != null ? e.getMessage() : "ERROR: falha no yt-dlp");
        } finally {
            ytdlpLock.readLock().unlock();
            timeout.cancel(false);
        }
    }

    /** ffmpeg/ffprobe da youtubedl-android: executáveis em nativeLibraryDir, bibliotecas extraídas no init. */
    private JSObject runBinary(String id, String cmd, List<String> args, long timeoutMs) throws IOException, InterruptedException {
        Context ctx = getContext();
        File bin = new File(ctx.getApplicationInfo().nativeLibraryDir, "ffmpeg".equals(cmd) ? "libffmpeg.so" : "libffprobe.so");
        File packages = new File(new File(ctx.getNoBackupFilesDir(), "youtubedl-android"), "packages");

        List<String> command = new ArrayList<>();
        command.add(bin.getAbsolutePath());
        command.addAll(args);

        ProcessBuilder pb = new ProcessBuilder(command);
        Map<String, String> env = pb.environment();
        env.put("LD_LIBRARY_PATH",
            new File(packages, "ffmpeg/usr/lib").getAbsolutePath() + ":" + new File(packages, "python/usr/lib").getAbsolutePath());
        env.put("HOME", ctx.getCacheDir().getAbsolutePath());
        env.put("TMPDIR", ctx.getCacheDir().getAbsolutePath());

        Process process = pb.start();
        processes.put(id, process);
        try {
            process.getOutputStream().close();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ByteArrayOutputStream err = new ByteArrayOutputStream();
            Thread outReader = drain(process.getInputStream(), out);
            Thread errReader = drain(process.getErrorStream(), err);

            boolean finished = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
            if (!finished) process.destroyForcibly();
            outReader.join(2000);
            errReader.join(2000);
            int code = finished ? process.exitValue() : 124;
            return result(code, out.toString("UTF-8"), err.toString("UTF-8"));
        } finally {
            processes.remove(id);
        }
    }

    private static Thread drain(InputStream in, ByteArrayOutputStream sink) {
        Thread t = new Thread(() -> {
            byte[] buf = new byte[8192];
            try {
                int n;
                while ((n = in.read(buf)) > 0) {
                    synchronized (sink) {
                        sink.write(buf, 0, n);
                    }
                }
            } catch (IOException ignored) {
                // processo encerrado
            }
        });
        t.start();
        return t;
    }

    private void awaitReady() throws InterruptedException {
        ready.await();
        if (initError != null) throw new IllegalStateException(initError);
    }

    private static JSObject result(int exitCode, String stdout, String stderr) {
        JSObject r = new JSObject();
        r.put("exitCode", exitCode);
        r.put("stdout", stdout != null ? stdout : "");
        r.put("stderr", stderr != null ? stderr : "");
        return r;
    }

    // ---------- atualização do yt-dlp ----------

    @PluginMethod
    public void updateYtDlp(PluginCall call) {
        pool.execute(() -> {
            try {
                awaitReady();
                call.resolve(update());
            } catch (Exception e) {
                call.reject("Falha ao atualizar o yt-dlp: " + e.getMessage());
            }
        });
    }

    private JSObject update() throws YoutubeDLException {
        ytdlpLock.writeLock().lock();
        try {
            YoutubeDL.UpdateStatus status = YoutubeDL.getInstance().updateYoutubeDL(getContext(), YoutubeDL.UpdateChannel._STABLE);
            prefs().edit().putLong("ytdlpUpdatedAt", System.currentTimeMillis()).apply();
            JSObject r = new JSObject();
            r.put("status", String.valueOf(status));
            r.put("version", YoutubeDL.getInstance().version(getContext()));
            Log.i(TAG, "yt-dlp: " + status + " " + YoutubeDL.getInstance().version(getContext()));
            return r;
        } finally {
            ytdlpLock.writeLock().unlock();
        }
    }

    /** O YouTube muda com frequência: atualiza o yt-dlp no máximo uma vez por dia, em segundo plano. */
    private void autoUpdate() {
        if (initError != null) return;
        long last = prefs().getLong("ytdlpUpdatedAt", 0);
        if (System.currentTimeMillis() - last < AUTO_UPDATE_INTERVAL_MS) return;
        try {
            update();
        } catch (Exception e) {
            Log.w(TAG, "Atualização automática do yt-dlp falhou (sem internet?)", e);
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("vitrola", Context.MODE_PRIVATE);
    }

    // ---------- serviço em primeiro plano ----------

    @PluginMethod
    public void setKeepAlive(PluginCall call) {
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        boolean downloading = Boolean.TRUE.equals(call.getBoolean("downloading", false));
        int current = call.getInt("downloadCurrent", 0);
        int total = call.getInt("downloadTotal", 0);
        Context ctx = getContext();
        // Só o contador mudou: atualiza a notificação sem reiniciar o serviço (o Android 12+
        // pode recusar startForegroundService com o app em segundo plano).
        if (KeepAliveService.updateIfRunning(ctx, playing, downloading, current, total)) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(ctx, KeepAliveService.class)
            .putExtra(KeepAliveService.EXTRA_PLAYING, playing)
            .putExtra(KeepAliveService.EXTRA_DOWNLOADING, downloading)
            .putExtra(KeepAliveService.EXTRA_CURRENT, current)
            .putExtra(KeepAliveService.EXTRA_TOTAL, total);
        try {
            if (playing || downloading) {
                ContextCompat.startForegroundService(ctx, intent);
            } else {
                ctx.stopService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            // Android 12+ pode recusar iniciar o serviço com o app em segundo plano.
            call.reject("Não foi possível iniciar o serviço em primeiro plano: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        pool.shutdownNow();
        timers.shutdownNow();
    }
}
