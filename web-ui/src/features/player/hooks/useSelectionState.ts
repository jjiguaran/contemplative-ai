import { useState } from 'react';
import { MeditationLog, MeditationLogEntry, BackgroundLog, MeditationsConfig } from '../../../shared/types/types';
import { parseDurationMinutes, isBackgroundAvailable } from '../../../shared/utils/utils';

export function useSelectionState(repoLog: MeditationLog | null, backgroundsLog: BackgroundLog | null, meditationsConfig: MeditationsConfig | null) {
  const [duracion, setDuracion] = useState<string>('');
  const [nivel, setNivel] = useState<string>('');
  const [musica, setMusica] = useState<string>('');
  const [tipo, setTipo] = useState<boolean | null>(null);

  const allEntries = repoLog?.meditations ?? [];

  const durationMinutes = duracion ? parseInt(duracion, 10) : 0;
  const durationLabel = durationMinutes > 0 ? `${durationMinutes} min` : '';

  const getMatchingEntries = (): MeditationLogEntry[] => {
    if (!duracion || !musica || tipo === null) return [];
    if (tipo === true && !nivel) return [];
    const requiredSegments = meditationsConfig?.sentencesByDuration?.[duracion] ?? 0;
    if (tipo === true) {
      return allEntries.filter(
        e => (e.segments?.length ?? 0) >= requiredSegments && e.level === nivel && (e.guided === undefined ? e.level !== null : e.guided) === true
      );
    }
    return allEntries.filter(
      e => (e.segments?.length ?? 0) >= requiredSegments && e.level === null && e.music === musica && (e.guided === undefined ? e.level !== null : e.guided) === false
    );
  };

  const available = (): boolean => {
    const matches = getMatchingEntries();
    if (matches.length === 0) return false;
    if (tipo === true && musica !== 'silence' && !isBackgroundAvailable(backgroundsLog, durationLabel, musica)) return false;
    return true;
  };

  const allSelected = tipo === null
    ? false
    : tipo === true
      ? !!(duracion && nivel && musica)
      : !!(duracion && musica);

  return {
    duracion,
    nivel,
    musica,
    tipo,
    setDuracion,
    setNivel,
    setMusica,
    setTipo,
    allEntries,
    getMatchingEntries,
    isAvailable: available,
    allSelected,
  };
}