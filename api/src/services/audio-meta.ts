import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function getAudioBitrate(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=bit_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { timeout: 15_000 });
    const kbps = Math.round(Number(stdout.trim()) / 1000);
    return Number.isFinite(kbps) && kbps > 0 ? kbps : null;
  } catch {
    return null;
  }
}

/**
 * Mede a loudness integrada (EBU R128, em LUFS) com o filtro `loudnorm` do ffmpeg,
 * que só analisa (saída descartada) e imprime um JSON no fim do stderr.
 * Retorna null se a análise falhar ou se a faixa for silenciosa.
 */
export async function getLoudness(filePath: string): Promise<number | null> {
  try {
    const { stderr } = await execFileAsync('ffmpeg', [
      '-hide_banner', '-nostats',
      '-i', filePath,
      '-map', 'a:0',
      '-af', 'loudnorm=print_format=json',
      '-f', 'null', '-',
    ], { timeout: 180_000, maxBuffer: 10 * 1024 * 1024 });
    const match = /"input_i"\s*:\s*"([^"]+)"/.exec(stderr);
    const lufs = match ? Number(match[1]) : NaN;
    return Number.isFinite(lufs) ? Math.round(lufs * 100) / 100 : null;
  } catch {
    return null;
  }
}
