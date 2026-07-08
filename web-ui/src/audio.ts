import { CONCAT_SAMPLE_RATE } from './constants';

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar: ${url}`);
  return res.arrayBuffer();
}

/**
 * Encodes an AudioBuffer as a 16-bit PCM WAV Blob. WAV is used (rather than
 * re-encoding to opus/mp3, which would require an extra codec library) because
 * it's natively writable from raw PCM samples and every browser's <audio>
 * element seeks perfectly within it.
 */
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
  view.setUint32(16, 16, true);        // fmt chunk size
  view.setUint16(20, 1, true);         // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
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

/**
 * Fetches + decodes every segment, then uses an OfflineAudioContext to render
 * them back-to-back into a single buffer, encodes that to a WAV Blob, and
 * returns an object URL plus the resulting exact duration.
 */
export async function buildConcatenatedAudioUrl(
  urls: string[],
  decodeCtx: AudioContext
): Promise<{ url: string; durationSeconds: number }> {
  const arrayBuffers = await Promise.all(urls.map(fetchArrayBuffer));
  // .slice(0) copies the buffer — decodeAudioData detaches the original in some browsers
  const audioBuffers = await Promise.all(
    arrayBuffers.map(ab => decodeCtx.decodeAudioData(ab.slice(0)))
  );

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
}