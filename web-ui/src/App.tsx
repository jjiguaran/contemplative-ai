import React, { useState, useEffect, useRef } from 'react';
import { initPostHog, captureEvent } from './posthog';
import { MeditationLog, MeditationLogEntry, BackgroundLog, AppScreen } from './types';
import { buildSegmentUrls, buildBackgroundUrl, isBackgroundAvailable, parseDurationMinutes, getTimeOfDay } from './utils';
import { createSegmentedPlayer, buildDownloadableWav, SegmentedPlayerHandle } from './audio';
import css from './styles';
import FeedbackScreen from './FeedbackScreen';
import ThankyouScreen from './ThankyouScreen';
import InstallBanner from './InstallBanner';
import PillSelectors from './PillSelectors';
import PlayerControls from './PlayerControls';

/* ─── App ───────────────────────────────────────────────────────────── */
export default function App() {
  const [repoLog, setRepoLog] = useState<MeditationLog | null>(null);
  const [backgroundsLog, setBackgroundsLog] = useState<BackgroundLog | null>(null);
  const [duracion, setDuracion] = useState<string>('');
  const [nivel, setNivel] = useState<string>('');
  const [musica, setMusica] = useState<string>('');
  const [tipo, setTipo] = useState<boolean | null>(null);

  // Downloadable WAV for the current session. This is now built lazily/in the
  // background AFTER playback has already started (playback itself streams
  // segments directly, it no longer waits on this), so it may still be null
  // for a bit even while audio is already playing.
  const [concatenatedUrl, setConcatenatedUrl] = useState<string | null>(null);
  // True only very briefly: from hitting play until the first segment has
  // decoded and sound has actually started (previously this covered the
  // entire fetch+decode+render+encode pipeline for the whole meditation).
  const [preparingAudio, setPreparingAudio] = useState<boolean>(false);
  // True once a streaming playback session exists for the current entry.
  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [backgroundAudioUrl, setBackgroundAudioUrl] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<MeditationLogEntry | null>(null);
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [backgroundVolume, setBackgroundVolume] = useState(0.15);

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Detect iOS (no beforeinstallprompt support) and standalone mode
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches;

  // Screen state
  const [screen, setScreen] = useState<AppScreen>('player');
  // The entry that just completed, kept for PostHog context in feedback
  const [completedEntry, setCompletedEntry] = useState<MeditationLogEntry | null>(null);

  const backgroundAudioRef = useRef<HTMLAudioElement>(null);
  /** Reused AudioContext — segments are decoded and played through this same context */
  const audioContextRef = useRef<AudioContext | null>(null);
  /** The active streaming player for the current session */
  const playerRef = useRef<SegmentedPlayerHandle | null>(null);
  /** Mirrors concatenatedUrl so the unmount cleanup effect can see the latest value */
  const concatenatedUrlRef = useRef<string | null>(null);

  /* init PostHog */
  useEffect(() => { initPostHog(); }, []);

  /* Keep the ref in sync, and revoke the object URL on unmount */
  useEffect(() => { concatenatedUrlRef.current = concatenatedUrl; }, [concatenatedUrl]);
  useEffect(() => {
    return () => {
      if (concatenatedUrlRef.current) URL.revokeObjectURL(concatenatedUrlRef.current);
      if (playerRef.current) playerRef.current.destroy();
    };
  }, []);

  /* Capture the PWA install prompt event */
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
    if (!installPrompt) return;
    (installPrompt as any).prompt();
    (installPrompt as any).userChoice.then((result: { outcome: string }) => {
      captureEvent('pwa_install', { outcome: result.outcome });
      setShowInstallBanner(false);
      setInstallPrompt(null);
    });
  };

  /* fetch logs */
  useEffect(() => {
    (async () => {
      try {
        const [medRes, bgRes] = await Promise.all([
          fetch('/dynamic_meditations_repo.json'),
          fetch('/backgrounds_log.json'),
        ]);
        if (medRes.ok) setRepoLog(await medRes.json());
        if (bgRes.ok) setBackgroundsLog(await bgRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  /* sync voice volume */
  useEffect(() => {
    if (playerRef.current) playerRef.current.setVolume(volume);
  }, [volume]);

  /* sync background volume */
  useEffect(() => {
    if (backgroundAudioRef.current) backgroundAudioRef.current.volume = backgroundVolume;
  }, [backgroundVolume]);

  /* Start/stop background audio when the URL changes.
   * This must be a useEffect rather than inline code in handlePlay because
   * React state updates (setBackgroundAudioUrl) are async — the <audio>
   * element won't be mounted yet when handlePlay tries to access the ref. */
  useEffect(() => {
    const bg = backgroundAudioRef.current;
    if (!bg) return;
    if (backgroundAudioUrl) {
      bg.currentTime = 0;
      bg.volume = backgroundVolume;
      bg.play().catch(console.error);
    } else {
      bg.pause();
      bg.currentTime = 0;
    }
  }, [backgroundAudioUrl]);

  const allEntries = repoLog?.meditations ?? [];

  const getMatchingEntries = (): MeditationLogEntry[] => {
    if (!duracion || !musica || tipo === null) return [];
    if (tipo === true && !nivel) return [];
    if (tipo === true) {
      // Guided entries: the voice track is recorded without background (music: "silence"),
      // so we don't filter by e.music here. The music selection only controls the
      // separate background track played alongside the voice.
      return allEntries.filter(
        e => e.duration === duracion && e.level === nivel && (e.guided === undefined ? e.level !== null : e.guided) === true
      );
    }
    return allEntries.filter(
      e => e.duration === duracion && e.level === null && e.music === musica && (e.guided === undefined ? e.level !== null : e.guided) === false
    );
  };

  const isAvailable = (): boolean => {
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

  /** Clears out everything about the current/previous session, revoking the blob URL */
  const resetPlayback = () => {
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    if (concatenatedUrl) URL.revokeObjectURL(concatenatedUrl);
    setConcatenatedUrl(null);
    setBackgroundAudioUrl(null);
    setSelectedEntry(null);
    setSessionActive(false);
    setPlaying(false);
    setCurrentTime(0);
    setAudioError(null);
  };

  const handlePlay = async () => {
    const matches = getMatchingEntries();
    if (!matches.length) return;

    const entry = matches[Math.floor(Math.random() * matches.length)];
    const urls = buildSegmentUrls(entry);
    // Use the user's music selection for the background track, not the entry's music field
    // (guided entries always have music: "silence" since the voice is recorded clean)
    const bgUrl = musica !== 'silence' ? buildBackgroundUrl(entry, musica) : null;

    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    if (concatenatedUrl) URL.revokeObjectURL(concatenatedUrl);

    setSelectedEntry(entry);
    setBackgroundAudioUrl(bgUrl);
    setCurrentTime(0);
    setDuration(parseDurationMinutes(entry.duration) * 60);
    setPlaying(false);
    setAudioError(null);
    setConcatenatedUrl(null);
    setSessionActive(false);
    setScreen('player');

    captureEvent('meditation_started', {
      duration: entry.duration,
      level: entry.level ?? undefined,
      music: entry.music,
      variation: entry.variation ?? undefined,
      model: entry.model ?? undefined,
    });

    setPreparingAudio(true);
    try {
      if (!audioContextRef.current) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new Ctx();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      const ctx = audioContextRef.current;

      const player = createSegmentedPlayer(urls, ctx);
      playerRef.current = player;
      setSessionActive(true);

      let startedPlayingUI = false;
      player.onDurationChange(d => {
        setDuration(d);
        // The first segment has decoded and playback has been scheduled —
        // this is as close as we get to "sound has actually started".
        if (!startedPlayingUI) {
          startedPlayingUI = true;
          setPreparingAudio(false);
          setPlaying(true);
        }
      });
      player.onTimeUpdate(t => setCurrentTime(Math.floor(t)));
      player.onEnded(() => handleAudioEnded());
      player.onError(err => {
        console.error('Error reproduciendo el audio:', err);
        setAudioError('No se pudo preparar el audio. Intenta de nuevo.');
        setPreparingAudio(false);
      });

      player.play();

      // Build the downloadable WAV in the background, in parallel with
      // playback. It reuses whatever segments the player has already
      // fetched/decoded, so this is now just a render + encode pass rather
      // than a full fetch+decode+render+encode pipeline — and crucially, it
      // no longer blocks the moment sound starts.
      buildDownloadableWav(urls, ctx)
        .then(({ url }) => setConcatenatedUrl(url))
        .catch(err => console.error('Error preparando la descarga:', err));
    } catch (err) {
      console.error('Error preparando el audio:', err);
      setAudioError('No se pudo preparar el audio. Intenta de nuevo.');
      setPreparingAudio(false);
    }
  };

  /** Session complete */
  const handleAudioEnded = () => {
    setPlaying(false);
    setCurrentTime(0);
    captureEvent('meditation_completed', selectedEntry ? {
      duration: selectedEntry.duration,
      level: selectedEntry.level ?? undefined,
      music: selectedEntry.music,
      variation: selectedEntry.variation ?? undefined,
    } : undefined);
    setCompletedEntry(selectedEntry);
    setScreen('feedback');
  };

  const togglePlayPause = () => {
    const player = playerRef.current;
    const bg = backgroundAudioRef.current;
    if (!player || !sessionActive) return;
    if (playing) {
      player.pause();
      if (bg) bg.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
      if (bg) bg.play().catch(console.error);
    }
  };

  /** Seeking */
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const player = playerRef.current;
    const bg = backgroundAudioRef.current;
    if (!player || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * duration;
    player.seek(newTime);
    if (bg) bg.currentTime = newTime;
    setCurrentTime(Math.floor(newTime));
  };

  const handleFeedbackDone = () => { setScreen('thankyou'); };

  const handleNewSession = () => {
    setScreen('player');
    resetPlayback();
    setCompletedEntry(null);
  };

  const progressPct = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
  const selectionComplete = allSelected && isAvailable();
  const isGuided = tipo === true;
  const hasActiveAudio = sessionActive;

  return (
    <>
      <style>{css}</style>

      <div className="backdrop" />

      <div style={{ position: 'relative', minHeight: '100vh' }}>

        {/* ── Ambient orbs (shared across screens) ── */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        {/* ── PLAYER SCREEN ── */}
        <div className={`shell fade-wrap${screen !== 'player' ? ' hidden' : ''}`}>
          <div className="card">
            {/* Header */}
            <p className="tod">{getTimeOfDay()}</p>
            <h1 className="brand-title">Bhavana</h1>
            <p className="tagline">un momento solo para ti</p>

            {/* PWA Install Banner */}
            <InstallBanner
              isInstalled={isInstalled}
              showInstallBanner={showInstallBanner}
              installPrompt={installPrompt}
              isIOS={isIOS}
              onInstall={handleInstallClick}
              onDismissBanner={() => setShowInstallBanner(false)}
              onDismissIOS={() => {
                const el = document.querySelector('.ios-install-banner') as HTMLElement | null;
                if (el) el.style.display = 'none';
              }}
            />

            {/* Pill selectors */}
            <PillSelectors
              repoLog={repoLog}
              backgroundsLog={backgroundsLog}
              duracion={duracion}
              nivel={nivel}
              musica={musica}
              tipo={tipo}
              allSelected={allSelected}
              isAvailable={isAvailable()}
              audioError={audioError}
              loadingOptions={loadingOptions}
              onSetTipo={setTipo}
              onSetDuracion={setDuracion}
              onSetNivel={setNivel}
              onSetMusica={setMusica}
              onSetBackgroundVolume={setBackgroundVolume}
              onResetPlayback={resetPlayback}
            />

            {/* Player controls */}
            <PlayerControls
              playing={playing}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              backgroundVolume={backgroundVolume}
              progressPct={progressPct}
              concatenatedUrl={concatenatedUrl}
              selectedEntry={selectedEntry}
              isGuided={isGuided}
              hasActiveAudio={hasActiveAudio}
              selectionComplete={selectionComplete}
              preparingAudio={preparingAudio}
              allSelected={allSelected}
              isAvailable={isAvailable()}
              onTogglePlayPause={togglePlayPause}
              onPlay={handlePlay}
              onSeek={handleSeek}
              onVolumeChange={setVolume}
              onBackgroundVolumeChange={setBackgroundVolume}
              onDownload={() => captureEvent('meditation_downloaded', selectedEntry ? {
                duration: selectedEntry.duration,
                level: selectedEntry.level ?? undefined,
                music: selectedEntry.music,
                variation: selectedEntry.variation ?? undefined,
              } : undefined)}
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
          installAvailable={installPrompt !== null}
          isIOS={isIOS}
          isInstalled={isInstalled}
          onInstall={handleInstallClick}
        />
      </div>

      {/* Hidden background audio element */}
      {isGuided && backgroundAudioUrl && (
        <audio
          ref={backgroundAudioRef}
          src={backgroundAudioUrl}
        />
      )}
    </>
  );
}