import React, { useState, useEffect, useCallback } from 'react';
import { initPostHog } from '../posthog';
import { AppScreen, MeditationLogEntry } from '../shared/types/types';
import { getTimeOfDay } from '../shared/utils/utils';
import css from '../shared/styles/styles';
import AmbientOrbs from '../shared/components/AmbientOrbs';
import InstallBanner from '../shared/components/InstallBanner';
import PillSelectors from '../features/player/components/PillSelectors';
import PlayerControls from '../features/player/components/PlayerControls';
import FeedbackScreen from '../features/feedback/components/FeedbackScreen';
import ThankyouScreen from '../features/feedback/components/ThankyouScreen';
import { usePWAInstall } from '../shared/hooks/usePWAInstall';
import { useRepoLogs } from '../features/player/hooks/useRepoLogs';
import { useSelectionState } from '../features/player/hooks/useSelectionState';
import { usePlayerSession } from '../features/player/hooks/usePlayerSession';

/* ─── App ───────────────────────────────────────────────────────────── */
export default function App() {
  const { repoLog, backgroundsLog, loadingOptions } = useRepoLogs();
  const pwa = usePWAInstall();
  const selection = useSelectionState(repoLog, backgroundsLog);

  const [screen, setScreen] = useState<AppScreen>('player');
  const [completedEntry, setCompletedEntry] = useState<MeditationLogEntry | null>(null);

  const handleSessionEnded = useCallback((entry: MeditationLogEntry | null) => {
    setCompletedEntry(entry);
    setScreen('feedback');
  }, []);

  const player = usePlayerSession(selection.musica, selection.getMatchingEntries, handleSessionEnded);

  /* init PostHog */
  useEffect(() => { initPostHog(); }, []);

  const handleFeedbackDone = useCallback(() => { setScreen('thankyou'); }, []);
  const handleNewSession = useCallback(() => {
    setScreen('player');
    player.resetPlayback();
    setCompletedEntry(null);
  }, [player]);

  const isGuided = selection.tipo === true;
  const hasActiveAudio = player.sessionActive;

  return (
    <>
      <style>{css}</style>
      <div className="backdrop" />
      <div style={{ position: 'relative', minHeight: '100vh' }}>
        <AmbientOrbs />

        {/* ── PLAYER SCREEN ── */}
        <div className={`shell fade-wrap${screen !== 'player' ? ' hidden' : ''}`}>
          <div className="card">
            <p className="tod">{getTimeOfDay()}</p>
            <h1 className="brand-title">Bhavana</h1>
            <p className="tagline">un momento solo para ti</p>

            <InstallBanner
              isInstalled={pwa.isInstalled}
              showInstallBanner={pwa.showInstallBanner}
              installPrompt={pwa.installPrompt}
              isIOS={pwa.isIOS}
              onInstall={pwa.handleInstallClick}
              onDismissBanner={() => pwa.setShowInstallBanner(false)}
              onDismissIOS={() => {
                const el = document.querySelector('.ios-install-banner') as HTMLElement | null;
                if (el) el.style.display = 'none';
              }}
            />

            <PillSelectors
              repoLog={repoLog}
              backgroundsLog={backgroundsLog}
              duracion={selection.duracion}
              nivel={selection.nivel}
              musica={selection.musica}
              tipo={selection.tipo}
              allSelected={selection.allSelected}
              isAvailable={selection.isAvailable()}
              audioError={player.audioError}
              loadingOptions={loadingOptions}
              onSetTipo={selection.setTipo}
              onSetDuracion={selection.setDuracion}
              onSetNivel={selection.setNivel}
              onSetMusica={selection.setMusica}
              onSetBackgroundVolume={player.setBackgroundVolume}
              onResetPlayback={player.resetPlayback}
            />

            <PlayerControls
              playing={player.playing}
              currentTime={player.currentTime}
              duration={player.duration}
              volume={player.volume}
              backgroundVolume={player.backgroundVolume}
              progressPct={player.progressPct}
              concatenatedUrl={player.concatenatedUrl}
              selectedEntry={player.selectedEntry}
              isGuided={isGuided}
              hasActiveAudio={hasActiveAudio}
              selectionComplete={selection.allSelected && selection.isAvailable()}
              preparingAudio={player.preparingAudio}
              allSelected={selection.allSelected}
              isAvailable={selection.isAvailable()}
              onTogglePlayPause={player.togglePlayPause}
              onPlay={player.handlePlay}
              onSeek={player.handleSeek}
              onVolumeChange={player.setVolume}
              onBackgroundVolumeChange={player.setBackgroundVolume}
              onDownload={() => {}}
            />
          </div>
        </div>

        {/* ── FEEDBACK SCREEN ── */}
        <FeedbackScreen
          visible={screen === 'feedback'}
          completedEntry={completedEntry}
          onDone={handleFeedbackDone}
          onNewSession={handleNewSession}
        />

        {/* ── THANK-YOU SCREEN ── */}
        <ThankyouScreen
          visible={screen === 'thankyou'}
          onNewSession={handleNewSession}
          installAvailable={pwa.installPrompt !== null}
          isIOS={pwa.isIOS}
          isInstalled={pwa.isInstalled}
          onInstall={pwa.handleInstallClick}
        />
      </div>

      {/* Hidden background audio element */}
      {isGuided && player.backgroundAudioUrl && (
        <audio ref={player.backgroundAudioRef} src={player.backgroundAudioUrl} />
      )}
    </>
  );
}