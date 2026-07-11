import React from 'react';
import { MeditationLogEntry } from '../../../shared/types/types';
import { capitalize, musicDisplayName } from '../../../shared/utils/utils';
import { IconPlay, IconPause, IconDownload, IconVolume, IconLeaf } from '../../../shared/utils/icons';

interface PlayerControlsProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  backgroundVolume: number;
  progressPct: number;
  concatenatedUrl: string | null;
  selectedEntry: MeditationLogEntry | null;
  selectedDuration: string;
  isGuided: boolean;
  hasActiveAudio: boolean;
  selectionComplete: boolean;
  preparingAudio: boolean;
  allSelected: boolean;
  isAvailable: boolean;
  onTogglePlayPause: () => void;
  onPlay: () => void;
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
  onVolumeChange: (v: number) => void;
  onBackgroundVolumeChange: (v: number) => void;
  onDownload: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function PlayerControls({
  playing,
  currentTime,
  duration,
  volume,
  backgroundVolume,
  progressPct,
  concatenatedUrl,
  selectedEntry,
  selectedDuration,
  isGuided,
  hasActiveAudio,
  selectionComplete,
  preparingAudio,
  allSelected,
  isAvailable,
  onTogglePlayPause,
  onPlay,
  onSeek,
  onVolumeChange,
  onBackgroundVolumeChange,
  onDownload,
}: PlayerControlsProps) {
  return (
    <>
      <div className="divider" />

      {preparingAudio && <p className="loading-msg">preparando tu meditación…</p>}

      <div className="bottom-row">
        <div className="bottom-left">
          <div
            className={`ring${playing ? ' playing' : ''}`}
            onClick={preparingAudio ? undefined : (hasActiveAudio ? onTogglePlayPause : (selectionComplete ? onPlay : undefined))}
            role="button"
            aria-label={playing ? 'Pausar meditación' : 'Iniciar meditación'}
            style={{
              cursor: !preparingAudio && (selectionComplete || hasActiveAudio) ? 'pointer' : 'default',
              opacity: preparingAudio ? 0.35 : (selectionComplete || hasActiveAudio ? 1 : 0.4),
            }}
          >
            <span className="ring-icon">
              {playing ? <IconPause /> : <IconPlay />}
            </span>
          </div>
        </div>

        <div className="vol-stack">
          <div className="vol-wrap">
            <IconVolume />
            <input
              type="range"
              className="vol-slider"
              min={0} max={1} step={0.01}
              value={volume}
              onChange={e => onVolumeChange(parseFloat(e.target.value))}
              aria-label="Volumen"
            />
          </div>

          {isGuided && selectedEntry && (
            <div className="vol-wrap">
              <IconLeaf />
              <input
                type="range"
                className="vol-slider"
                min={0} max={1} step={0.01}
                value={backgroundVolume}
                onChange={e => onBackgroundVolumeChange(parseFloat(e.target.value))}
                aria-label="Volumen de fondo"
              />
            </div>
          )}
        </div>
      </div>

      <p className={`session-label${selectedEntry ? ' active' : ''}`}>
        {preparingAudio
          ? ''
          : selectedEntry
            ? `${selectedDuration} min · ${capitalize(selectedEntry.level ?? '')} · ${musicDisplayName(selectedEntry.music)} · var. ${selectedEntry.variation ?? '-'}`
            : allSelected && !isAvailable
              ? ''
              : 'elige tu sesión y presiona para comenzar'}
      </p>

      <div className="progress-area">
        <div className="progress-track" onClick={onSeek}>
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="time-labels">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(Math.floor(duration)) : '--:--'}</span>
        </div>
      </div>

      <div className="download-row">
        <a
          className="icon-btn"
          href={concatenatedUrl ?? '#'}
          download={selectedEntry && concatenatedUrl ? `${selectedDuration}_${selectedEntry.level ?? 'silencio'}_${selectedEntry.variation ?? ''}.wav` : undefined}
          aria-label="Descargar meditación"
          title="Descargar"
          style={{ pointerEvents: hasActiveAudio ? 'auto' : 'none', opacity: hasActiveAudio ? 1 : 0.2, textDecoration: 'none' }}
          onClick={onDownload}
        >
          <IconDownload />
        </a>
      </div>
    </>
  );
}