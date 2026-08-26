import React from 'react';
import { SentencesRepo, BackgroundLog, MeditationsConfig } from '../../../shared/types/types';
import { formatDuration, capitalize, musicDisplayName, getComputedSentencesByDuration, getDurationTierMap } from '../../../shared/utils/utils';

/** Available silence-length options shown in the UI */
const SILENCE_OPTIONS = ['cortos', 'medios', 'largos'] as const;

interface PillSelectorsProps {
  sentencesRepo: SentencesRepo | null;
  backgroundsLog: BackgroundLog | null;
  meditationsConfig: MeditationsConfig | null;
  duracion: string;
  nivel: string;
  musica: string;
  tipo: boolean | null;
  silencios: string;
  allSelected: boolean;
  isAvailable: boolean;
  audioError: string | null;
  loadingOptions: boolean;
  onSetTipo: (t: boolean) => void;
  onSetDuracion: (d: string) => void;
  onSetNivel: (l: string) => void;
  onSetMusica: (m: string) => void;
  onSetSilencios: (s: string) => void;
  onSetBackgroundVolume: (v: number) => void;
  onResetPlayback: () => void;
  getLevelOptions: () => string[];
}

export default function PillSelectors({
  sentencesRepo,
  backgroundsLog,
  meditationsConfig,
  duracion,
  nivel,
  musica,
  tipo,
  silencios,
  allSelected,
  isAvailable,
  audioError,
  loadingOptions,
  onSetTipo,
  onSetDuracion,
  onSetNivel,
  onSetMusica,
  onSetSilencios,
  onSetBackgroundVolume,
  onResetPlayback,
  getLevelOptions,
}: PillSelectorsProps) {
  const allSentences = sentencesRepo?.sentences ?? [];

  const getUniqueDurations = () => {
    if (!meditationsConfig) return [];

    // "En silencio": durations come from the silence meditation tiers and
    // don't depend on voice sentences being available in the repo.
    if (tipo === false) {
      const silenceTiers = meditationsConfig.meditations?.['silence']?.durationTiers;
      if (!silenceTiers) return [];
      return Object.keys(getDurationTierMap(silenceTiers, 'cortos')).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }

    const sentencesByDuration = getComputedSentencesByDuration(meditationsConfig, silencios);
    // Show config keys that have entries with enough sentences
    return Object.keys(sentencesByDuration)
      .filter(d => {
        const requiredSegments = sentencesByDuration[d];
        return allSentences.length >= requiredSegments;
      })
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  };

  const getUniqueLevels = () =>
    getLevelOptions();

  const getUniqueMusicOptions = () => {
    const bgMusicTypes = backgroundsLog
      ? Array.from(new Set(backgroundsLog.backgrounds.map(b => b.music)))
      : [];
    return Array.from(new Set([...bgMusicTypes, 'silence'])).sort();
  };

  const getUniqueGuidedOptions = (): boolean[] => {
    const options: boolean[] = [];
    if (allSentences.length > 0) options.push(true);
    options.push(false);
    return options;
  };

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

      {/* Silence length only applies to guided sessions; "En silencio" always uses "cortos". */}
      {tipo === true && (
        <div className="pill-group">
          <p className="pill-label">Silencios</p>
          <div className="pills">
            {SILENCE_OPTIONS.map(s => (
              <div
                key={s}
                className={`pill${silencios === s ? ' active' : ''}`}
                onClick={() => { onSetSilencios(s); onResetPlayback(); }}
              >
                {capitalize(s)}
              </div>
            ))}
          </div>
        </div>
      )}

      {allSelected && !isAvailable && (
        <p className="unavailable">esta combinación no está disponible aún</p>
      )}

      {audioError && <p className="error-msg">{audioError}</p>}
    </>
  );
}