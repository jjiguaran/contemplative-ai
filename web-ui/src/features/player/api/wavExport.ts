import { CONCAT_SAMPLE_RATE } from '../../../shared/constants/constants';

/* ──────────────────────────────────────────────────────────────────────
 * WAV export — on-demand downloadable WAV from segment URLs.
 * Reuses whatever segments are already decoded/cached from playback.
 * ────────────────────────────────────────────────────────────────────── */

const decodeCache = new Map<string, Promise<AudioBuffer>>();

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar: ${url}`);
  return res.arrayBuffer();
}

function decodeSegment(url: string, ctx: BaseAudioContext): Promise<AudioBuffer> {
  let cached = decodeCache.get(url);
  if (!cached) {
    cached = fetchArrayBuffer(url).then(ab => ctx.decodeAudioData(ab.slice(0)));
    cached.catch(() => decodeCache.delete(url));
    decodeCache.set(url, cached);
  }
  return cached;
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

const downloadCache = new Map<string, Promise<{ url: string; durationSeconds: number }>>();

export async function buildDownloadableWav(
  urls: string[],
  decodeCtx: AudioContext
): Promise<{ url: string; durationSeconds: number }> {
  const cacheKey = urls.join('|');
  let cached = downloadCache.get(cacheKey);
  if (cached) return cached;

  cached = (async () => {
    const audioBuffers = await Promise.all(urls.map(url => decodeSegment(url, decodeCtx)));

    const numChannels = Math.min(2, Math.max(...audioBuffers.map(b => b.numberOfChannels)));
    const totalDuration = audioBuffers.reduce((sum, b) => sum + b.duration, 0);
    const totalFrames = Math.max(1, Math.ceil(totalDuration * CONCAT_SAMPLE_RATE));

    const offlineCtx = new OfflineAudioContext(numChannels, totalFrames, CONCAT_SAMPLE_RATE);

    let offsetSeconds = 0;
    for (const buffer of audioBuffers) {
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineCtx.destination);
      source.start(offsetSeconds);
      offsetSeconds += buffer.duration;
    }

    const rendered = await offlineCtx.startRendering();
    const blob = audioBufferToWavBlob(rendered);
    return { url: URL.createObjectURL(blob), durationSeconds: rendered.duration };
  })();

  downloadCache.set(cacheKey, cached);
  cached.catch(() => downloadCache.delete(cacheKey));
  return cached;
}