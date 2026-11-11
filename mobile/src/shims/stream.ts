/**
 * `node:stream` não existe no WebView. `api/src/routes/tracks.ts` só usa streams
 * nas rotas `/stream` e `/stream-url`, que o app não chama: o player toca o arquivo
 * local (ou a URL direta do stream) via `platform.resolveStreamUrl`.
 */
export const Readable = {
  fromWeb(): never {
    throw new Error('Streams HTTP não são usados no app Android');
  },
};
export type ReadableStream = unknown;
export default { Readable };
