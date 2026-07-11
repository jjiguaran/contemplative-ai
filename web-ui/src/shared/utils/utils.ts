import { MeditationLogEntry, BackgroundLog } from '../types/types';
import { R2_BUCKET_URL } from '../constants/constants';

export function parseDurationMinutes(duration: string): number {
  const match = duration.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function buildR2Url(entry: MeditationLogEntry, durationMinutes: number): string {
  if (entry.guided) {
    return `${R2_BUCKET_URL}/meditations/silence/${durationMinutes}_${entry.level}_${entry.variation}.opus`;
  } else {
    return `${R2_BUCKET_URL}/meditations/mute/${durationMinutes}_${entry.music}.opus`;
  }
}

export function buildSegmentUrls(entry: MeditationLogEntry, durationMinutes: number): string[] {
  if (entry.segments && entry.segments.length > 0) {
    const segments = entry.segments.map(s => `${R2_BUCKET_URL}/${s.audioUrl}`);
    return durationMinutes > 0 ? segments.slice(0, durationMinutes) : segments;
  }
  return [buildR2Url(entry, durationMinutes)];
}

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

export function buildBackgroundUrl(entry: MeditationLogEntry, durationMinutes: number, musicOverride?: string): string {
  const music = musicOverride ?? entry.music;
  return `${R2_BUCKET_URL}/sounds/backgrounds/${durationMinutes}_${music}.opus`;
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