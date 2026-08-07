/* ──────────────────────────────────────────────────────────────────────
 * Shared decode cache
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

export function clearAudioDecodeCache(): void {
  decodeCache.clear();
}

/* ──────────────────────────────────────────────────────────────────────
 * Gapless streaming playback interface
 * ────────────────────────────────────────────────────────────────────── */
export interface SegmentedPlayerHandle {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  getCurrentTime(): number;
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
  let clockRunning = false;
  let seekOffset = 0;
  let epochCtxTime = 0;
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
  } as SegmentedPlayerHandle;
}