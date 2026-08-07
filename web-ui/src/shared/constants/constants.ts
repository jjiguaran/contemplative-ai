export const R2_BUCKET_URL = "https://pub-e5092eb6363d42ce8ac557dbecc589f0.r2.dev";

/**
 * Sample rate used when rendering the concatenated WAV file. The segments
 * are voice-only narration, so we don't need CD quality — downsampling
 * keeps the resulting blob a reasonable size on mobile devices. Raise this
 * if voice quality needs to be crisper, at the cost of a bigger download
 * and more memory used while building it.
 */
export const CONCAT_SAMPLE_RATE = 24000;

export const MOOD_OPTIONS = [
  { id: 'flowing',  emoji: '🌊', label: 'En flujo' },
  { id: 'clear',    emoji: '☀️', label: 'Despejado' },
  { id: 'drifting', emoji: '🌫️', label: 'A la deriva' },
  { id: 'restless', emoji: '🔥', label: 'Inquieto' },
] as const;