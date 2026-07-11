import React from 'react';
import { MeditationLogEntry, MeditationLog, BackgroundLog, MeditationsConfig } from '../../../shared/types/types';
import { parseDurationMinutes, formatDuration, capitalize, musicDisplayName } from '../../../shared/utils/utils';

interface PillSelectorsProps {
  repoLog: MeditationLog | null;
  backgroundsLog: BackgroundLog | null;
  meditationsConfig: MeditationsConfig | null;
  duracion: string;
  nivel: string;
  musica: string;
  tipo: boolean | null;
  allSelected: boolean;
  isAvailable: boolean;
  audioError: string | null;
  loadingOptions: boolean;
  onSetTipo: (t: boolean) => void;
  onSetDuracion: (d: string) => void;
  onSetNivel: (l: string) => void;
  onSetMusica: (m: string) => void;
  onSetBackgroundVolume: (v: number) => void;
  onResetPlayback: () => void;
}

export default function PillSelectors({
  repoLog,
  backgroundsLog,
  meditationsConfig,
  duracion,
  nivel,
  musica,
  tipo,
  allSelected,
  isAvailable,
  audioError,
  loadingOptions,
  onSetTipo,
  onSetDuracion,
  onSetNivel,
  onSetMusica,
  onSetBackgroundVolume,
  onResetPlayback,
}: PillSelectorsProps) {
  const allEntries = repoLog?.meditations ?? [];

  const getUniqueDurations = () => {
    if (meditationsConfig?.sentencesByDuration) {
      // Show config keys that have entries with enough segments
      return Object.keys(meditationsConfig.sentencesByDuration)
        .filter(d => {
          const requiredSegments = meditationsConfig.sentencesByDuration[d];
          return allEntries.some(e => (e.segments?.length ?? 0) >= requiredSegments);
        })
        .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }
    // Fallback: use segment lengths from entries
    return Array.from(new Set(allEntries.map(e => String(e.segments?.length ?? 0)))).sort(
      (a, b) => parseInt(a, 10) - parseInt(b, 10)
    );
  };

  const getUniqueLevels = () =>
    Array.from(new Set(allEntries.map(e => e.level))).filter((l): l is string => l !== null).sort().reverse();

  const getUniqueMusicOptions = () => {
    const bgMusicTypes = backgroundsLog
      ? Array.from(new Set(backgroundsLog.backgrounds.map(b => b.music)))
      : [];
    return Array.from(new Set([...bgMusicTypes, 'silence'])).sort();
  };

  const getGuidedNormalized = (e: MeditationLogEntry): boolean =>
    e.guided === undefined ? e.level !== null : e.guided;

  const getUniqueGuidedOptions = (): boolean[] =>
    Array.from(new Set(allEntries.map(e => getGuidedNormalized(e)))).sort((a, b) => a === b ? 0 : a ? -1 : 1);

  if (loadingOptions) return <p className="loading-msg">cargando sesiones…</p>;

  return (
    <>
      <div className="pill-group">
        <p className="pill-label">Tipo de meditación</p>
        <div className="pills">
          {getUniqueGuidedOptions().map(g => (
            <div
              key={g ? 'guided' : 'unguided'}
              className={`pill${tipo === g ? ' active' : ''}`}
              onClick={() => { onSetTipo(g); onSetNivel(''); onResetPlayback(); }}
            >
              {g ? 'Guiada' : 'En silencio'}
            </div>
          ))}
        </div>
      </div>

      <div className="pill-group">
        <p className="pill-label">Duración</p>
        <div className="pills">
          {getUniqueDurations().map(d => (
            <div
              key={d}
              className={`pill${duracion === d ? ' active' : ''}`}
              onClick={() => { onSetDuracion(d); onResetPlayback(); }}
            >
              {formatDuration(d)}
            </div>
          ))}
        </div>
      </div>

      {(tipo === null || tipo === true) && (
      <div className="pill-group">
        <p className="pill-label">Nivel</p>
        <div className="pills">
          {getUniqueLevels().map(l => (
            <div
              key={l}
              className={`pill${nivel === l ? ' active' : ''}`}
              onClick={() => { onSetNivel(l); onResetPlayback(); }}
            >
              {capitalize(l ?? '')}
            </div>
          ))}
        </div>
      </div>
      )}

      <div className="pill-group">
        <p className="pill-label">Sonido de fondo</p>
        <div className="pills">
          {getUniqueMusicOptions().map(m => (
            <div
              key={m}
              className={`pill${musica === m ? ' active' : ''}`}
              onClick={() => { 
                onSetMusica(m); 
                
                if (m === 'nature') {
                  onSetBackgroundVolume(0.15);
                } else if (m === 'binaural') {
                  onSetBackgroundVolume(0.75);
                } else {
                  onSetBackgroundVolume(0.50);
                }

                onResetPlayback();
              }}
            >
              {musicDisplayName(m)}
            </div>
          ))}
        </div>
      </div>

      {allSelected && !isAvailable && (
        <p className="unavailable">esta combinación no está disponible aún</p>
      )}

      {audioError && <p className="error-msg">{audioError}</p>}
    </>
  );
}