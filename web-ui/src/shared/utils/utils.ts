import { SentenceEntry, BackgroundLog, MeditationsConfig, LevelConfig } from '../types/types';
import { R2_BUCKET_URL } from '../constants/constants';

export function parseDurationMinutes(duration: string): number {
  const match = duration.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function buildSentenceUrls(sentences: SentenceEntry[], maxSegments: number): string[] {
  return sentences.slice(0, maxSegments).map(s => `${R2_BUCKET_URL}/${s.audioUrl}`);
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

export function buildBackgroundUrl(durationMinutes: number, music: string): string {
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

/**
 * Compute a flat `Record<durationKey, totalSlots>` from the new nested
 * MeditationsConfig structure. Sums fixedSlots + durationTier.totalSlots
 * for the *first* meditation entry (e.g. anapanasati).
 */
export function getComputedSentencesByDuration(config: MeditationsConfig): Record<string, number> {
  const meditation = Object.values(config.meditations)[0];
  if (!meditation) return {};
  const fixedTotal = Object.values(meditation.fixedSlots).reduce((sum, v) => sum + v, 0);
  const result: Record<string, number> = {};
  for (const [key, tier] of Object.entries(meditation.durationTiers)) {
    result[key] = fixedTotal + tier.totalSlots;
  }
  return result;
}

/**
 * Given a MeditationsConfig, a duration key, a level key, compute how many
 * sentences are needed for each section according to the level's phaseOrder
 * and ratios, honoring fixedSlots for inicio/cierre.
 *
 * Returns a `Record<section, count>` mapping section names to the number of
 * sentences needed for that section, in the order defined by phaseOrder.
 */
export function getSectionCounts(
  config: MeditationsConfig,
  durationKey: string,
  levelKey: string
): Record<string, number> {
  const meditation = Object.values(config.meditations)[0];
  if (!meditation) return {};

  const levelConfig: LevelConfig | undefined = meditation.level?.[levelKey];
  if (!levelConfig) return {};

  const durationTier = meditation.durationTiers[durationKey];
  if (!durationTier) return {};

  const totalSlots = durationTier.totalSlots;

  // Identify fixed sections (inicio, cierre)
  const fixedSections = Object.keys(meditation.fixedSlots);
  const fixedTotal = fixedSections.reduce((sum, s) => sum + (meditation.fixedSlots[s] ?? 0), 0);

  // remaining slots to distribute among variable sections (those in phaseOrder that are not fixed)
  const variableSections = levelConfig.phaseOrder.filter(s => !fixedSections.includes(s));
  const remainingSlots = totalSlots - fixedTotal;

  const result: Record<string, number> = {};

  // First assign fixed slots
  for (const section of fixedSections) {
    result[section] = meditation.fixedSlots[section] ?? 0;
  }

  // Then distribute remaining slots by ratios among variable sections
  if (variableSections.length > 0 && remainingSlots > 0) {
    const totalRatio = variableSections.reduce((sum, s) => sum + (levelConfig.ratios[s] ?? 0), 0);
    let allocated = 0;
    for (let i = 0; i < variableSections.length; i++) {
      const section = variableSections[i];
      const ratio = levelConfig.ratios[section] ?? 0;
      // For the last section, give all remaining slots to avoid rounding errors
      if (i === variableSections.length - 1) {
        result[section] = remainingSlots - allocated;
      } else {
        const count = Math.round((ratio / totalRatio) * remainingSlots);
        result[section] = count;
        allocated += count;
      }
    }
  }

  return result;
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