import { useState, useEffect } from 'react';
import { MeditationLog, BackgroundLog } from '../../../shared/types/types';

export function useRepoLogs() {
  const [repoLog, setRepoLog] = useState<MeditationLog | null>(null);
  const [backgroundsLog, setBackgroundsLog] = useState<BackgroundLog | null>(null);
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);

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

  return { repoLog, backgroundsLog, loadingOptions };
}