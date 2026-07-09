import { useState } from 'react';
import { MeditationLog, MeditationLogEntry, BackgroundLog } from '../../../shared/types/types';
import { isBackgroundAvailable } from '../../../shared/utils/utils';

export function useSelectionState(repoLog: MeditationLog | null, backgroundsLog: BackgroundLog | null) {
  const [duracion, setDuracion] = useState<string>('');
  const [nivel, setNivel] = useState<string>('');
  const [musica, setMusica] = useState<string>('');
  const [tipo, setTipo] = useState<boolean | null>(null);

  const allEntries = repoLog?.meditations ?? [];

  const getMatchingEntries = (): MeditationLogEntry[] => {
    if (!duracion || !musica || tipo === null) return [];
    if (tipo === true && !nivel) return [];
    if (tipo === true) {
      return allEntries.filter(
        e => e.duration === duracion && e.level === nivel && (e.guided === undefined ? e.level !== null : e.guided) === true
      );
    }
    return allEntries.filter(
      e => e.duration === duracion && e.level === null && e.music === musica && (e.guided === undefined ? e.level !== null : e.guided) === false
    );
  };

  const available = (): boolean => {
    const matches = getMatchingEntries();
    if (matches.length === 0) return false;
    if (tipo === true && musica !== 'silence' && !isBackgroundAvailable(backgroundsLog, duracion, musica)) return false;
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