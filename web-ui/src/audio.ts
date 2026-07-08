import { CONCAT_SAMPLE_RATE } from './constants';

/* ────────────────────────────────────────────────────────────────────────
 * Shared decode cache
 *
 * Fetching + decoding is the one piece of work we can't avoid, so we do it
 * exactly once per segment URL and reuse the result both for playback and
 * (later, lazily) for the downloadable WAV export. Failed decodes are
 * evicted so a retry is possible.
 * ──────────────────────────────────────────────────────────────────────── */
const decodeCache = new Map<string, Promise<AudioBuffer>>();

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar: ${url}`);
  return res.arrayBuffer();
}

function decodeSegment(url: string, ctx: BaseAudioContext): Promise<AudioBuffer> {
  let cached = decodeCache.get(url);
  if (!cached) {
    // .slice(0) copies the buffer — decodeAudioData detaches the original in some browsers
    cached = fetchArrayBuffer(url).then(ab => ctx.decodeAudioData(ab.slice(0)));
    cached.catch(() => decodeCache.delete(url));
    decodeCache.set(url, cached);
  }
  return cached;
}

/** Optional: call if you ever need to free memory held by cached buffers
 *  (e.g. after a very long session, or on an explicit "low memory" signal). */
export function clearAudioDecodeCache(): void {
  decodeCache.clear();
}

/* ────────────────────────────────────────────────────────────────────────
 * Gapless streaming playback
 *
 * Instead of concatenating every segment into one giant rendered buffer
 * before anything can play, we decode segments in parallel and schedule
 * each one on a real-time AudioContext back-to-back with sample-accurate
 * start times (source.start(t)). This is the same trick gapless-playback
 * apps use: because scheduling is timestamp-based rather than event-based
 * (waiting for 'ended'), there's no risk of an audible gap between
 * segments, and playback can begin as soon as the FIRST segment is decoded
 * instead of waiting for all of them plus a render pass plus a WAV encode.
 *
 * Pausing is just ctx.suspend()/resume() — since every source's start time
 * is expressed in AudioContext time, and that clock stops advancing while
 * suspended, every scheduled node pauses and resumes in perfect sync for
 * free.
 * ──────────────────────────────────────────────────────────────────────── */

export interface SegmentedPlayerHandle {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
  /** Best known duration so far. Grows as more segments finish decoding,
   *  and is final once isFullyLoaded() is true. */
  getDuration(): number;
  isFullyLoaded(): boolean;
  onTimeUpdate(cb: (t: number) => void): () => void;
  onDurationChange(cb: (d: number) => void): () => void;
  onEnded(cb: () => void): () => void;
  onError(cb: (e: Error) => void): () => void;
  destroy(): void;
}

export function createSegmentedPlayer(urls: string[], ctx: AudioContext): SegmentedPlayerHandle {
  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  const buffers: (AudioBuffer | null)[] = new Array(urls.length).fill(null);
  const durations: number[] = new Array(urls.length).fill(0);
  let totalKnownDuration = 0;
  let fullyLoaded = urls.length === 0;

  let activeSources: AudioBufferSourceNode[] = [];
  let scheduledUntilIndex = -1;
  let lastScheduledEndCtxTime = 0;

  let playing = false;
  let clockRunning = false; // true once audio has actually been scheduled to play
  let seekOffset = 0; // timeline position (s) when the clock was last (re)anchored
  let epochCtxTime = 0; // ctx.currentTime corresponding to seekOffset
  let endedFired = false;
  let destroyed = false;
  let rafHandle: number | null = null;

  const timeUpdateCbs = new Set<(t: number) => void>();
  const durationChangeCbs = new Set<(d: number) => void>();
  const endedCbs = new Set<() => void>();
  const errorCbs = new Set<(e: Error) => void>();

  function currentTimelinePosition(): number {
    if (!clockRunning) return seekOffset;
    return seekOffset + (ctx.currentTime - epochCtxTime);
  }

  function stopAllScheduled() {
    activeSources.forEach(s => {
      s.onended = null;
      try { s.stop(); } catch { /* already stopped/ended */ }
    });
    activeSources = [];
    scheduledUntilIndex = -1;
    clockRunning = false;
  }

  /** Schedules as many *already-decoded* upcoming segments as it can, back
   *  to back. Safe to call repeatedly (e.g. every time a new segment
   *  finishes decoding) — it only does work when there's a contiguous next
   *  segment ready to go. */
  function maybeScheduleAhead() {
    if (!playing || destroyed) return;

    let nextIndex: number;
    let nextStartCtxTime: number;
    let nextStartOffsetWithinBuffer = 0;

    if (scheduledUntilIndex >= 0) {
      nextIndex = scheduledUntilIndex + 1;
      nextStartCtxTime = lastScheduledEndCtxTime;
    } else {
      const pos = currentTimelinePosition();
      let acc = 0;
      let idx = 0;
      while (idx < durations.length && durations[idx] > 0 && acc + durations[idx] <= pos) {
        acc += durations[idx];
        idx++;
      }
      nextIndex = idx;
      nextStartOffsetWithinBuffer = Math.max(0, pos - acc);
      nextStartCtxTime = ctx.currentTime;
    }

    while (nextIndex < urls.length && buffers[nextIndex]) {
      const buf = buffers[nextIndex]!;
      const offset = nextStartOffsetWithinBuffer;
      const playDuration = Math.max(0, buf.duration - offset);

      if (!clockRunning) {
        // This is the first segment actually being scheduled for this
        // play/resume/seek — anchor the clock here so the progress bar
        // doesn't advance before sound is truly scheduled.
        epochCtxTime = nextStartCtxTime;
        clockRunning = true;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.start(nextStartCtxTime, offset);
      activeSources.push(src);

      const isLast = nextIndex === urls.length - 1;
      if (isLast) {
        src.onended = () => {
          if (destroyed) return;
          if (playing && !endedFired) {
            playing = false;
            endedFired = true;
            endedCbs.forEach(cb => cb());
          }
        };
      }

      lastScheduledEndCtxTime = nextStartCtxTime + playDuration;
      scheduledUntilIndex = nextIndex;
      nextStartCtxTime = lastScheduledEndCtxTime;
      nextStartOffsetWithinBuffer = 0;
      nextIndex++;
    }
  }

  // Kick off fetch+decode of every segment immediately and in parallel —
  // this is the only unavoidable work, and it was already parallel before.
  urls.forEach((url, i) => {
    decodeSegment(url, ctx)
      .then(buf => {
        if (destroyed) return;
        buffers[i] = buf;
        durations[i] = buf.duration;
        totalKnownDuration = durations.reduce((s, d) => s + d, 0);
        durationChangeCbs.forEach(cb => cb(totalKnownDuration));
        maybeScheduleAhead();
      })
      .catch(err => {
        errorCbs.forEach(cb => cb(err instanceof Error ? err : new Error(String(err))));
      });
  });

  Promise.allSettled(urls.map(url => decodeSegment(url, ctx))).then(() => {
    fullyLoaded = true;
  });

  function startTicking() {
    const tick = () => {
      if (!playing) return;
      timeUpdateCbs.forEach(cb => cb(currentTimelinePosition()));
      rafHandle = requestAnimationFrame(tick);
    };
    rafHandle = requestAnimationFrame(tick);
  }
  function stopTicking() {
    if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }

  function play() {
    if (playing || destroyed) return;
    playing = true;
    endedFired = false;
    maybeScheduleAhead();
    startTicking();
  }

  function pause() {
    if (!playing) return;
    seekOffset = currentTimelinePosition();
    playing = false;
    stopAllScheduled();
    stopTicking();
  }

  function seek(seconds: number) {
    const cap = totalKnownDuration > 0 ? totalKnownDuration : seconds;
    const wasPlaying = playing;
    if (playing) stopAllScheduled();
    seekOffset = Math.max(0, Math.min(seconds, cap));
    endedFired = false;
    playing = wasPlaying;
    if (wasPlaying) maybeScheduleAhead();
    timeUpdateCbs.forEach(cb => cb(seekOffset));
  }

  function setVolume(v: number) {
    gain.gain.value = v;
  }

  function destroy() {
    destroyed = true;
    stopAllScheduled();
    stopTicking();
    try { gain.disconnect(); } catch { /* noop */ }
  }

  return {
    play,
    pause,
    seek,
    setVolume,
    getCurrentTime: currentTimelinePosition,
    getDuration: () => totalKnownDuration,
    isFullyLoaded: () => fullyLoaded,
    onTimeUpdate: cb => { timeUpdateCbs.add(cb); return () => timeUpdateCbs.delete(cb); },
    onDurationChange: cb => { durationChangeCbs.add(cb); return () => durationChangeCbs.delete(cb); },
    onEnded: cb => { endedCbs.add(cb); return () => endedCbs.delete(cb); },
    onError: cb => { errorCbs.add(cb); return () => errorCbs.delete(cb); },
    destroy,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * WAV export — kept exactly as before, but now only ever called on-demand
 * (e.g. when the user actually clicks "download"), never on the play path.
 * Reuses whatever segments are already decoded/cached from playback, so in
 * the common case it doesn't refetch anything.
 * ──────────────────────────────────────────────────────────────────────── */

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

/**
 * Builds a single downloadable WAV for a set of segment URLs, on demand.
 * Cached per exact URL-list so clicking "download" twice (or downloading
 * after playback already decoded everything) doesn't redo the work.
 *
 * This still uses an OfflineAudioContext render pass — that's fine here
 * because it only runs once, lazily, for the (much rarer) download action,
 * not on every play.
 */
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
