/**
 * O Filesystem do Capacitor recebe caminhos absolutos como URI (`Uri.parse` no Android).
 * Nomes de faixas podem ter `#`, `%` ou `?`, então cada parte do caminho é codificada;
 * o lado nativo decodifica de volta com `Uri.getPath()`.
 */
export function encodePath(absPath: string): string {
  return absPath.split('/').map(encodeURIComponent).join('/');
}

export function fileUri(absPath: string): string {
  return 'file://' + encodePath(absPath);
}

const MEDIA_PREFIX = '/_vitrola_media_';

/** O WebView aplica sozinho o início do Range nas respostas do `MediaWebViewClient`? */
let webViewSlicesRange = false;

/**
 * Descobre, uma vez ao abrir o app, se o WebView recorta o início do Range sozinho (WebViews
 * recentes fazem isso; os antigos não). O `MediaWebViewClient` responde ao teste com 256 bytes
 * inteiros (0, 1, 2...): pedindo `bytes=10-19`, receber 10 no primeiro byte significa que o
 * WebView recortou. Errar aqui faz o seek tocar o trecho errado ou travar perto do fim da faixa.
 */
export async function detectMediaRangeMode(): Promise<boolean> {
  // O fetch original do WebView: o do CapacitorHttp não passa pelo `MediaWebViewClient`.
  const webFetch = (window as unknown as { CapacitorWebFetch?: typeof fetch }).CapacitorWebFetch ?? fetch;
  try {
    const res = await webFetch(`${MEDIA_PREFIX}/__probe__`, { headers: { Range: 'bytes=10-19' }, cache: 'no-store' });
    const first = new Uint8Array(await res.arrayBuffer())[0];
    webViewSlicesRange = first === 10;
  } catch {
    webViewSlicesRange = false;
  }
  return webViewSlicesRange;
}

/**
 * URL que o `<audio>` do WebView toca para um arquivo local. É servida pelo
 * `MediaWebViewClient` (Android), que respeita Range (seek e crossfade).
 */
export function playableFileUrl(absPath: string): string {
  return `${location.origin}${MEDIA_PREFIX}${encodePath(absPath)}${webViewSlicesRange ? '?wv=1' : ''}`;
}
