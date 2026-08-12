import { useState } from 'react';
import { SentencesRepo, SentenceEntry, BackgroundLog, MeditationsConfig } from '../../../shared/types/types';
import { isBackgroundAvailable, getComputedSentencesByDuration, getSectionCounts, getDurationTier } from '../../../shared/utils/utils';

export function useSelectionState(sentencesRepo: SentencesRepo | null, backgroundsLog: BackgroundLog | null, meditationsConfig: MeditationsConfig | null) {
  const [duracion, setDuracion] = useState<string>('');
  const [nivel, setNivel] = useState<string>('');
  const [musica, setMusica] = useState<string>('');
  const [tipo, setTipo] = useState<boolean | null>(null);
  const [silencios, setSilencios] = useState<string>('');

  const allSentences = sentencesRepo?.sentences ?? [];
  const repoLevel = sentencesRepo?.level ?? '';

  /** Get the available level options from meditationsConfig instead of sentencesRepo */
  const getLevelOptions = (): string[] => {
    if (!meditationsConfig) return [];
    const meditation = Object.values(meditationsConfig.meditations)[0];
    if (!meditation?.level) return [];
    return Object.keys(meditation.level);
  };

  const durationMinutes = duracion ? parseInt(duracion, 10) : 0;
  const durationLabel = durationMinutes > 0 ? `${durationMinutes} min` : '';

  const getMatchingSentences = (): SentenceEntry[] => {
    if (!duracion || !musica || tipo === null) return [];
    if (tipo === true && !nivel) return [];
    if (tipo === true) {
      if (!meditationsConfig) return [];
      const meditation = Object.values(meditationsConfig.meditations)[0];
      if (!meditation?.level?.[nivel]) return [];

      const levelConfig = meditation.level?.[nivel];
      if (!levelConfig) return [];
      const sectionCounts = getSectionCounts(meditationsConfig, duracion, nivel, silencios);

      // Group sentences by section
      const sentencesBySection: Record<string, SentenceEntry[]> = {};
      for (const s of allSentences) {
        if (!sentencesBySection[s.section]) {
          sentencesBySection[s.section] = [];
        }
        sentencesBySection[s.section].push(s);
      }

      // Build result following phaseOrder
      const result: SentenceEntry[] = [];
      for (const section of levelConfig.phaseOrder) {
        const needed = sectionCounts[section] ?? 0;
        const available = sentencesBySection[section] ?? [];
        // Take the first `needed` sentences from this section
        result.push(...available.slice(0, needed));
      }
      return result;
    }
    // For unguided, return empty (no voice sentences needed)
    return [];
  };

  const available = (): boolean => {
    if (tipo === null) return false;
    if (tipo === true) {
      if (!duracion || !nivel || !musica || !silencios) return false;
      const sentencesByDuration = meditationsConfig ? getComputedSentencesByDuration(meditationsConfig, silencios) : {};
      const requiredSegments = sentencesByDuration[duracion] ?? 0;
      if (allSentences.length < requiredSegments) return false;
      if (musica !== 'silence' && !isBackgroundAvailable(backgroundsLog, durationLabel, musica)) return false;
    } else {
      if (!duracion || !musica) return false;
      // "En silencio": the session needs the silence (gong) assets plus a
      // duration tier for the chosen duration in the silence meditation config.
      // "En silencio" always uses the "cortos" silence length.
      const silenceTiers = meditationsConfig?.meditations?.['silence']?.durationTiers;
      const silenceTier = silenceTiers ? getDurationTier(silenceTiers, 'cortos', duracion) : undefined;
      if (!silenceTier || !meditationsConfig?.gongsURL || !meditationsConfig?.silenceURL) return false;
    }
    return true;
  };

  // `silencios` only applies to guided sessions ("En silencio" always uses "cortos"),
  // so it is not required to mark the selection as complete in the unguided branch.
  const allSelected = tipo === null
    ? false
    : tipo === true
      ? !!(duracion && nivel && musica && silencios)
      : !!(duracion && musica);

  return {
    duracion,
    nivel,
    musica,
    tipo,
    silencios,
    setDuracion,
    setNivel,
    setMusica,
    setTipo,
    setSilencios,
    allSentences,
    repoLevel,
    getLevelOptions,
    getMatchingSentences,
    isAvailable: available,
    allSelected,
  };
}
