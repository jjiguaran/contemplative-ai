/* ─── Types ─────────────────────────────────────────────────────────── */
export interface SentenceEntry {
  id: string;
  script: string;
  section: string;
  date: string;
  model: string;
  audioUrl: string;
  TTS_model: string;
}

export interface SentencesRepo {
  level: string;
  sentences: SentenceEntry[];
}

export interface BackgroundLogEntry {
  duration: string;
  date_generated: string;
  music: string;
  source_file: string;
}

export interface BackgroundLog {
  backgrounds: BackgroundLogEntry[];
}

export interface DurationTier {
  totalSlots: number;
}

export interface LevelConfig {
  phaseOrder: string[];
  ratios: Record<string, number>;
  minDurationTier?: string;
}

export interface MeditationConfig {
  label: string;
  fixedSlots: Record<string, number>;
  durationTiers: Record<string, DurationTier>;
  level: Record<string, LevelConfig>;
}

export interface MeditationsConfig {
  version: string;
  meditations: Record<string, MeditationConfig>;
}

export type AppScreen = 'player' | 'feedback' | 'thankyou';

export type MoodId = 'flowing' | 'clear' | 'drifting' | 'restless';