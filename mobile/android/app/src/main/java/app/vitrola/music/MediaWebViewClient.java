package app.vitrola.music;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Serve os arquivos de áudio baixados em {@code https://localhost/_vitrola_media_/<caminho absoluto>}.
 *
 * Respeita o Range (seek e crossfade) nos dois comportamentos do WebView: os recentes (ex.: Chromium
 * 157) aplicam sozinhos o início do Range sobre a resposta interceptada; os antigos não. O JS descobre
 * qual é o caso uma vez, pelo {@link #probe}, e avisa com {@code ?wv=1} na URL. Só arquivos de áudio
 * dentro da pasta de dados do app são servidos.
 */
public class MediaWebViewClient extends BridgeWebViewClient {

    public static final String PREFIX = "/_vitrola_media_";
    /** Pedido de teste: o JS descobre se o WebView aplica o Range sozinho (ver {@link #probe}). */
    private static final String PROBE = PREFIX + "/__probe__";
    private static final Pattern RANGE = Pattern.compile("^bytes=(\\d*)-(\\d*)$");
    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("mp3", "audio/mpeg");
        MIME.put("m4a", "audio/mp4");
        MIME.put("flac", "audio/flac");
        MIME.put("ogg", "audio/ogg");
        MIME.put("opus", "audio/opus");
        MIME.put("wav", "audio/wav");
    }

    private final File root;

    public MediaWebViewClient(Bridge bridge) {
        super(bridge);
        // Mesma pasta que o JS usa como DATA_DIR (Directory.Data + "/vitrola").
        this.root = new File(bridge.getContext().getFilesDir(), "vitrola");
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        String path = url.getPath();
        if ("localhost".equals(url.getHost()) && path != null && path.startsWith(PREFIX + "/")) {
            if (path.equals(PROBE)) return probe();
            boolean webViewSlices = "1".equals(url.getQueryParameter("wv"));
            return serve(path.substring(PREFIX.length()), request.getRequestHeaders(), webViewSlices);
        }
        return super.shouldInterceptRequest(view, request);
    }

    /**
     * Resposta de teste: 256 bytes (0, 1, 2...) inteiros, como 206. O JS pede {@code bytes=10-19}: se o
     * primeiro byte recebido for 10, o WebView recortou o início sozinho (WebViews recentes fazem isso
     * com respostas interceptadas); se for 0, não recorta e o recorte fica por conta de {@link #serve}.
     */
    private static WebResourceResponse probe() {
        byte[] data = new byte[256];
        for (int i = 0; i < data.length; i++) data[i] = (byte) i;
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes");
        headers.put("Cache-Control", "no-store");
        headers.put("Content-Range", "bytes 10-19/256");
        return new WebResourceResponse("application/octet-stream", null, 206, "Partial Content", headers, new ByteArrayInputStream(data));
    }

    /**
     * @param webViewSlices o WebView aplica o início do Range sozinho (detectado pelo {@link #probe}).
     *     Nesse caso o stream vai desde o byte 0 (limitado ao fim do intervalo) e o WebView pula até o
     *     início; recortar aqui também faria o início ser pulado duas vezes (seek tocava o trecho errado
     *     e, perto do fim da faixa, a resposta ficava vazia e o player travava ou pulava de música).
     */
    private WebResourceResponse serve(String filePath, Map<String, String> requestHeaders, boolean webViewSlices) {
        File file;
        try {
            file = new File(filePath).getCanonicalFile();
            String rootPath = root.getCanonicalPath() + File.separator;
            if (!file.getPath().startsWith(rootPath) || !file.isFile()) return error(404, "Not Found");
        } catch (IOException e) {
            return error(404, "Not Found");
        }

        String name = file.getName();
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        String mime = MIME.get(ext);
        if (mime == null) return error(404, "Not Found");

        long size = file.length();
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes");
        headers.put("Cache-Control", "no-cache");

        String range = requestHeaders.get("Range");
        if (range == null) range = requestHeaders.get("range");

        try {
            if (range == null) {
                headers.put("Content-Length", String.valueOf(size));
                return new WebResourceResponse(mime, null, 200, "OK", headers, new FileInputStream(file));
            }

            Matcher m = RANGE.matcher(range.trim());
            if (!m.matches() || (m.group(1).isEmpty() && m.group(2).isEmpty())) return unsatisfiable(size);

            long start;
            long end;
            if (m.group(1).isEmpty()) {
                // sufixo: bytes=-500 (últimos 500 bytes)
                start = Math.max(size - Long.parseLong(m.group(2)), 0);
                end = size - 1;
            } else {
                start = Long.parseLong(m.group(1));
                end = m.group(2).isEmpty() ? size - 1 : Math.min(Long.parseLong(m.group(2)), size - 1);
            }
            if (start >= size || start > end) return unsatisfiable(size);

            long length = end - start + 1;
            headers.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
            if (webViewSlices) {
                // O WebView calcula o Content-Length (stream disponível - início) e pula até o início.
                InputStream whole = new LimitedInputStream(new FileInputStream(file), end + 1);
                return new WebResourceResponse(mime, null, 206, "Partial Content", headers, whole);
            }

            InputStream in = new FileInputStream(file);
            long skipped = 0;
            while (skipped < start) {
                long n = in.skip(start - skipped);
                if (n <= 0) break;
                skipped += n;
            }
            headers.put("Content-Length", String.valueOf(length));
            return new WebResourceResponse(mime, null, 206, "Partial Content", headers, new LimitedInputStream(in, length));
        } catch (IOException | NumberFormatException e) {
            return error(500, "Internal Error");
        }
    }

    private static WebResourceResponse unsatisfiable(long size) {
        WebResourceResponse r = error(416, "Range Not Satisfiable");
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Range", "bytes */" + size);
        r.setResponseHeaders(headers);
        return r;
    }

    private static WebResourceResponse error(int status, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", status, reason, new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    /** Lê no máximo {@code remaining} bytes do stream original. */
    private static final class LimitedInputStream extends FilterInputStream {
        private long remaining;

        LimitedInputStream(InputStream in, long limit) {
            super(in);
            this.remaining = limit;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int b = super.read();
            if (b >= 0) remaining--;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            if (remaining <= 0) return -1;
            int n = super.read(buf, off, (int) Math.min(len, remaining));
            if (n > 0) remaining -= n;
            return n;
        }

        // O WebView pula até o início do Range com skip(): o que foi pulado conta no limite.
        @Override
        public long skip(long n) throws IOException {
            long skipped = super.skip(Math.min(n, remaining));
            if (skipped > 0) remaining -= skipped;
            return skipped;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), remaining);
        }
    }
}
