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

export interface InstructionEntry {
  script: string;
  audioUrl: string;
}

export interface InstructionSection {
  sentences: Record<string, InstructionEntry>[];
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

/** Flat `durationKey → DurationTier` map (e.g. the "silence" meditation). */
export type DurationTierMap = Record<string, DurationTier>;

/** Nested `silenceKey → durationKey → DurationTier` map (e.g. guided meditations). */
export type NestedDurationTiers = Record<string, DurationTierMap>;

/** durationTiers may be flat or nested by silence length (cortos/largos). */
export type DurationTiers = DurationTierMap | NestedDurationTiers;

export interface LevelConfig {
  phaseOrder: string[];
  ratios: Record<string, number>;
  minDurationTier?: string;
}

export interface MeditationConfig {
  label: string;
  inicioPath?: string;
  cierrePath?: string;
  cuerpoPath?: string;
  sensacionesPath?: string;
  mentePath?: string;
  dhammasPath?: string;
  fixedSlots?: Record<string, number>;
  durationTiers: DurationTiers;
  level?: Record<string, LevelConfig>;
}

export interface SilenceURLConfig {
  /** Silence file for short pauses (cortos) — 20 seconds */
  cortos?: string;
  /** Silence file for medium pauses (medios) — 40 seconds */
  medios?: string;
  /** Silence file for long pauses (largos) — 65 seconds */
  largos?: string;
  /** Extra silence clip used as the closing pause before the cierre in "medios" sessions */
  medios_complement?: string;
  /** Extra silence clip used as the closing pause before the cierre in "largos" sessions */
  largos_complement?: string;
}

export interface MeditationsConfig {
  version: string;
  gongsURL?: string;
  silenceURL?: SilenceURLConfig;
  meditations: Record<string, MeditationConfig>;
}

export type AppScreen = 'player' | 'feedback' | 'thankyou';

export type MoodId = 'flowing' | 'clear' | 'drifting' | 'restless';