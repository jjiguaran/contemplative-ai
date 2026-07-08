import { MeditationLogEntry, BackgroundLog } from './types';
import { R2_BUCKET_URL } from './constants';

export function parseDurationMinutes(duration: string): number {
  const match = duration.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function buildR2Url(entry: MeditationLogEntry): string {
  const durationNum = parseDurationMinutes(entry.duration);
  if (entry.guided) {
    // Voice track is always the pure voice from meditations/silence/
    return `${R2_BUCKET_URL}/meditations/silence/${durationNum}_${entry.level}_${entry.variation}.opus`;
  } else {
    return `${R2_BUCKET_URL}/meditations/mute/${durationNum}_${entry.music}.opus`;
  }
}

export function buildSegmentUrls(entry: MeditationLogEntry): string[] {
  if (entry.segments && entry.segments.length > 0) {
    return entry.segments.map(s => `${R2_BUCKET_URL}/${s}`);
  }
  // Fallback: return a single-element array with the old-style URL
  return [buildR2Url(entry)];
}

/**
 * Check if a background audio file exists for the given duration and music type,
 * based on the backgrounds_log.json registry.
 */
export function isBackgroundAvailable(
  backgroundsLog: BackgroundLog | null,
  duration: string,
  music: string
): boolean {
  if (!backgroundsLog) return false;
  const durationNum = parseDurationMinutes(duration);
  return backgroundsLog.backgrounds.some(
    b => parseDurationMinutes(b.duration) === durationNum && b.music === music
  );
}

/**
 * Build the URL for the background audio track.
 * Files are stored in sounds/backgrounds/ and named like 5_nature.opus
 */
export function buildBackgroundUrl(entry: MeditationLogEntry): string {
  const durationNum = parseDurationMinutes(entry.duration);
  return `${R2_BUCKET_URL}/sounds/backgrounds/${durationNum}_${entry.music}.opus`;
}

export function formatDuration(duration: string): string {
  const num = parseDurationMinutes(duration);
  return `${num} min`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function musicDisplayName(key: string): string {
  const labels: Record<string, string> = {
    nature: 'Naturaleza',
    silence: 'Silencio',
    binaural: 'Binaural',
  };
  return labels[key] ?? capitalize(key);
}