import React, { useState, useEffect, useRef } from 'react';
import { initPostHog, captureEvent } from './posthog';
import { MeditationLog, MeditationLogEntry, BackgroundLog, AppScreen } from './types';
import { buildSegmentUrls, buildBackgroundUrl, isBackgroundAvailable, parseDurationMinutes, getTimeOfDay } from './utils';
import { buildConcatenatedAudioUrl } from './audio';
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

  // Single fully-concatenated playable file for the current session (or null
  // while nothing has been prepared / a new session hasn't been built yet).
  const [concatenatedUrl, setConcatenatedUrl] = useState<string | null>(null);
  // True while segments are being fetched, decoded, and rendered into that file.
  const [preparingAudio, setPreparingAudio] = useState<boolean>(false);
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

  const audioRef = useRef<HTMLAudioElement>(null);
  const backgroundAudioRef = useRef<HTMLAudioElement>(null);
  const tickRef = useRef<number | null>(null);
  /** Reused AudioContext for decoding segments before concatenation */
  const audioContextRef = useRef<AudioContext | null>(null);
  /** Mirrors concatenatedUrl so the unmount cleanup effect can see the latest value */
  const concatenatedUrlRef = useRef<string | null>(null);

  /* init PostHog */
  useEffect(() => { initPostHog(); }, []);

  /* Keep the ref in sync, and revoke the object URL on unmount */
  useEffect(() => { concatenatedUrlRef.current = concatenatedUrl; }, [concatenatedUrl]);
  useEffect(() => {
    return () => {
      if (concatenatedUrlRef.current) URL.revokeObjectURL(concatenatedUrlRef.current);
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
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  /* sync background volume */
  useEffect(() => {
    if (backgroundAudioRef.current) backgroundAudioRef.current.volume = backgroundVolume;
  }, [backgroundVolume]);

  /* Once the concatenated file is mounted, start playback (and the background track) */
  useEffect(() => {
    if (!concatenatedUrl) return;
    const a = audioRef.current;
    const bg = backgroundAudioRef.current;
    if (!a) return;
    a.volume = volume;
    if (bg && backgroundAudioUrl) {
      bg.currentTime = 0;
      bg.volume = backgroundVolume;
      bg.play().catch(console.error);
    }
    a.play().then(() => setPlaying(true)).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concatenatedUrl]);

  useEffect(() => {
    if (playing) {
      tickRef.current = window.setInterval(() => {
        const a = audioRef.current;
        if (!a) return;
        setCurrentTime(Math.floor(a.currentTime));
      }, 500);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [playing]);

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
    if (concatenatedUrl) URL.revokeObjectURL(concatenatedUrl);
    setConcatenatedUrl(null);
    setBackgroundAudioUrl(null);
    setSelectedEntry(null);
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

    if (concatenatedUrl) URL.revokeObjectURL(concatenatedUrl);

    setSelectedEntry(entry);
    setBackgroundAudioUrl(bgUrl);
    setCurrentTime(0);
    setDuration(parseDurationMinutes(entry.duration) * 60);
    setPlaying(false);
    setAudioError(null);
    setConcatenatedUrl(null);
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

      const { url, durationSeconds } = await buildConcatenatedAudioUrl(urls, audioContextRef.current);
      setConcatenatedUrl(url);
      setDuration(durationSeconds);
    } catch (err) {
      console.error('Error preparando el audio concatenado:', err);
      setAudioError('No se pudo preparar el audio. Intenta de nuevo.');
    } finally {
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

  const handleLoadedMetadata = () => {
    const a = audioRef.current;
    if (a && isFinite(a.duration) && a.duration > 0) {
      setDuration(a.duration);
    }
  };

  const togglePlayPause = () => {
    const a = audioRef.current;
    const bg = backgroundAudioRef.current;
    if (!a || !concatenatedUrl) return;
    if (playing) {
      a.pause();
      if (bg) bg.pause();
      setPlaying(false);
    } else {
      a.play().then(() => setPlaying(true)).catch(console.error);
      if (bg) bg.play().catch(console.error);
    }
  };

  /** Seeking now works natively */
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    const bg = backgroundAudioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * duration;
    a.currentTime = newTime;
    if (bg) bg.currentTime = newTime;
    setCurrentTime(Math.floor(newTime));
  };

  /* Keep the background track's position aligned with the voice track whenever it (re)loads */
  useEffect(() => {
    const bg = backgroundAudioRef.current;
    const a = audioRef.current;
    if (!bg || !a) return;

    const onBgLoaded = () => {
      bg.currentTime = a.currentTime;
    };

    bg.addEventListener('loadedmetadata', onBgLoaded);
    return () => bg.removeEventListener('loadedmetadata', onBgLoaded);
  }, [backgroundAudioUrl]);

  const handleFeedbackDone = () => { setScreen('thankyou'); };

  const handleNewSession = () => {
    setScreen('player');
    resetPlayback();
    setCompletedEntry(null);
  };

  const progressPct = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
  const selectionComplete = allSelected && isAvailable();
  const isGuided = tipo === true;
  const hasActiveAudio = concatenatedUrl !== null;

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

      {/* Hidden voice audio element */}
      {hasActiveAudio && (
        <audio
          ref={audioRef}
          src={concatenatedUrl ?? undefined}
          onEnded={handleAudioEnded}
          onLoadedMetadata={handleLoadedMetadata}
        />
      )}

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