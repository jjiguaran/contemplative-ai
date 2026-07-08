/* ─── Types ─────────────────────────────────────────────────────────── */
export interface MeditationLogEntry {
  duration: string;
  level: string | null;
  variation: number | null;
  model: string | null;
  date_generated: string;
  music: string;
  guided: boolean;
  /** Paths to individual audio segments (dynamic meditations) */
  segments?: string[];
  num_segments?: number;
}

export interface MeditationLog {
  meditations: MeditationLogEntry[];
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

export type AppScreen = 'player' | 'feedback' | 'thankyou';

export type MoodId = 'flowing' | 'clear' | 'drifting' | 'restless';