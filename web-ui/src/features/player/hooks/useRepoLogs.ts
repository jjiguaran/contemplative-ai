import { useState, useEffect } from 'react';
import { SentencesRepo, BackgroundLog, MeditationsConfig } from '../../../shared/types/types';

export function useRepoLogs() {
  const [sentencesRepo, setSentencesRepo] = useState<SentencesRepo | null>(null);
  const [backgroundsLog, setBackgroundsLog] = useState<BackgroundLog | null>(null);
  const [meditationsConfig, setMeditationsConfig] = useState<MeditationsConfig | null>(null);
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const [sentencesRes, bgRes, configRes] = await Promise.all([
          fetch('/sentences_repo.json'),
          fetch('/backgrounds_log.json'),
          fetch('/meditations_config.json'),
        ]);
        if (sentencesRes.ok) setSentencesRepo(await sentencesRes.json());
        if (bgRes.ok) setBackgroundsLog(await bgRes.json());
        if (configRes.ok) setMeditationsConfig(await configRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  return { sentencesRepo, backgroundsLog, meditationsConfig, loadingOptions };
}
