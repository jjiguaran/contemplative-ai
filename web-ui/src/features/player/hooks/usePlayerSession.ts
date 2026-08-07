import { useState, useRef, useEffect, useCallback } from 'react';
import { SentenceEntry, MeditationsConfig } from '../../../shared/types/types';
import { buildBackgroundUrl, getComputedSentencesByDuration } from '../../../shared/utils/utils';
import { R2_BUCKET_URL } from '../../../shared/constants/constants';
import { createSegmentedPlayer, SegmentedPlayerHandle } from '../api/segmentedPlayer';
import { buildDownloadableWav } from '../api/wavExport';
import { captureEvent } from '../../../posthog';

export interface PlayerSessionState {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  backgroundVolume: number;
  preparingAudio: boolean;
  sessionActive: boolean;
  audioError: string | null;
  concatenatedUrl: string | null;
  backgroundAudioUrl: string | null;
  selectedSentences: SentenceEntry[] | null;
  progressPct: number;
}

export function usePlayerSession(
  musica: string,
  getMatchingSentences: () => SentenceEntry[],
  meditationsConfig: MeditationsConfig | null,
  selectedDuration: string,
  onSessionEnded: () => void
) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [backgroundVolume, setBackgroundVolume] = useState(0.15);
  const [preparingAudio, setPreparingAudio] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [concatenatedUrl, setConcatenatedUrl] = useState<string | null>(null);
  const [backgroundAudioUrl, setBackgroundAudioUrl] = useState<string | null>(null);
  const [selectedSentences, setSelectedSentences] = useState<SentenceEntry[] | null>(null);

  const backgroundAudioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<SegmentedPlayerHandle | null>(null);
  const concatenatedUrlRef = useRef<string | null>(null);

  /* Keep the ref in sync, and revoke the object URL on unmount */
  useEffect(() => { concatenatedUrlRef.current = concatenatedUrl; }, [concatenatedUrl]);
  useEffect(() => {
    return () => {
      if (concatenatedUrlRef.current) URL.revokeObjectURL(concatenatedUrlRef.current);
      if (playerRef.current) playerRef.current.destroy();
    };
  }, []);

  /* sync voice volume */
  useEffect(() => {
    if (playerRef.current) playerRef.current.setVolume(volume);
  }, [volume]);

  /* sync background volume */
  useEffect(() => {
    if (backgroundAudioRef.current) backgroundAudioRef.current.volume = backgroundVolume;
  }, [backgroundVolume]);

  /* Start/stop background audio when the URL changes */
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
  }, [backgroundAudioUrl, backgroundVolume]);

  const resetPlayback = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    if (concatenatedUrl) URL.revokeObjectURL(concatenatedUrl);
    setConcatenatedUrl(null);
    setBackgroundAudioUrl(null);
    setSelectedSentences(null);
    setSessionActive(false);
    setPlaying(false);
    setCurrentTime(0);
    setAudioError(null);
  }, [concatenatedUrl]);

  const handlePlay = useCallback(async () => {
    const sentences = getMatchingSentences();
    if (!sentences.length) return;

    const durationMinutes = parseInt(selectedDuration, 10) || 0;
    const sentencesByDuration = meditationsConfig ? getComputedSentencesByDuration(meditationsConfig) : {};
    const maxSegments = sentencesByDuration[selectedDuration] ?? 0;

    // Interleave silence after every sentence, with an extra pause before the cierre (closing) sentence
    const silencePath = meditationsConfig?.silenceURL;
    const silenceUrl = silencePath ? `${R2_BUCKET_URL}/${silencePath}` : null;
    const gongPath = meditationsConfig?.gongsURL;
    const gongUrl = gongPath ? `${R2_BUCKET_URL}/${gongPath}` : null;

    const urlsWithSilence: string[] = [];
    const slicedSentences = sentences.slice(0, maxSegments);
    for (const sentence of slicedSentences) {
      // Skip sentences without an audio file (safety net)
      if (!sentence.audioUrl) continue;
      // Extra silence before the closing (cierre) section sentence
      if (sentence.section === 'cierre' && silenceUrl && gongUrl) {
        urlsWithSilence.push(silenceUrl);
      }
      urlsWithSilence.push(`${R2_BUCKET_URL}/${sentence.audioUrl}`);
      if (silenceUrl) urlsWithSilence.push(silenceUrl);
    }

    // Wrap the sentence sequence with the gong sound
    const urls = gongUrl
      ? [gongUrl, ...urlsWithSilence, gongUrl]
      : urlsWithSilence;

    const bgUrl = musica !== 'silence' ? buildBackgroundUrl(durationMinutes, musica) : null;

    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    if (concatenatedUrl) URL.revokeObjectURL(concatenatedUrl);

    setSelectedSentences(sentences);
    setBackgroundAudioUrl(bgUrl);
    setCurrentTime(0);
    setDuration(durationMinutes * 60);
    setPlaying(false);
    setAudioError(null);
    setConcatenatedUrl(null);
    setSessionActive(false);

    captureEvent('meditation_started', {
      duration: selectedDuration,
      music: musica,
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
        if (!startedPlayingUI) {
          startedPlayingUI = true;
          setPreparingAudio(false);
          setPlaying(true);
        }
      });
      player.onTimeUpdate(t => setCurrentTime(Math.floor(t)));
      player.onEnded(() => {
        setPlaying(false);
        setCurrentTime(0);
        captureEvent('meditation_completed', {
          duration: selectedDuration,
          music: musica,
        });
        onSessionEnded();
      });
      player.onError(err => {
        console.error('Error reproduciendo el audio:', err);
        setAudioError('No se pudo preparar el audio. Intenta de nuevo.');
        setPreparingAudio(false);
      });

      player.play();

      buildDownloadableWav(urls, ctx)
        .then(({ url }) => setConcatenatedUrl(url))
        .catch(err => console.error('Error preparando la descarga:', err));
    } catch (err) {
      console.error('Error preparando el audio:', err);
      setAudioError('No se pudo preparar el audio. Intenta de nuevo.');
      setPreparingAudio(false);
    }
  }, [getMatchingSentences, musica, meditationsConfig, concatenatedUrl, selectedDuration, onSessionEnded]);

  const togglePlayPause = useCallback(() => {
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
  }, [playing, sessionActive]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const player = playerRef.current;
    const bg = backgroundAudioRef.current;
    if (!player || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * duration;
    player.seek(newTime);
    if (bg) bg.currentTime = newTime;
    setCurrentTime(Math.floor(newTime));
  }, [duration]);

  const progressPct = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;

  return {
    // State
    playing,
    currentTime,
    duration,
    volume,
    backgroundVolume,
    preparingAudio,
    sessionActive,
    audioError,
    concatenatedUrl,
    backgroundAudioUrl,
    selectedSentences,
    progressPct,
    backgroundAudioRef,
    // Actions
    setVolume,
    setBackgroundVolume,
    resetPlayback,
    handlePlay,
    togglePlayPause,
    handleSeek,
  };
}