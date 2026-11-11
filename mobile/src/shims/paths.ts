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

/**
 * URL que o `<audio>` do WebView toca para um arquivo local. É servida pelo
 * `MediaWebViewClient` (Android), que respeita Range — o `_capacitor_file_` do
 * Capacitor não respeita, e o seek quebraria.
 */
export function playableFileUrl(absPath: string): string {
  return `${location.origin}/_vitrola_media_${encodePath(absPath)}`;
}
