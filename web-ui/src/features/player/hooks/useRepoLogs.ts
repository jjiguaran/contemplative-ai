import { useState, useEffect } from 'react';
import { SentenceEntry, BackgroundLog, MeditationsConfig, InstructionSection } from '../../../shared/types/types';

/**
 * Map a section name to its path field in the meditation config.
 * The config uses `<section>Path` keys (e.g. `inicioPath`, `cuerpoPath`).
 */
type SectionPathField = 'inicioPath' | 'cierrePath' | 'cuerpoPath' | 'sensacionesPath' | 'mentePath' | 'dhammasPath';

const SECTION_PATH_FIELDS: Record<string, SectionPathField> = {
  inicio: 'inicioPath',
  cierre: 'cierrePath',
  cuerpo: 'cuerpoPath',
  sensaciones: 'sensacionesPath',
  mente: 'mentePath',
  dhammas: 'dhammasPath',
};

/**
 * Convert a per-section instruction file (structure:
 * `{ sentences: [ { "1": { script, audioUrl }, "2": { script, audioUrl }, ... }, ... ] }`)
 * into a flat list of SentenceEntry objects tagged with their section.
 * For each position, a random variation is selected so the meditation is dynamic.
 */
function flattenInstructionSection(
  section: string,
  data: InstructionSection | null
): SentenceEntry[] {
  if (!data?.sentences) return [];
  return data.sentences.flatMap((entry, index) => {
    // Only consider variations that have an audioUrl — variations without
    // audio are placeholders that haven't been generated yet.
    const keys = Object.keys(entry).filter(k => entry[k]?.audioUrl);
    if (keys.length === 0) return [];
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const item = entry[randomKey];
    if (!item) return [];
    return [{
      id: `${section}_${index + 1}`,
      script: item.script,
      section,
      date: '',
      model: '',
      audioUrl: item.audioUrl,
      TTS_model: '',
    }];
  });
}

export function useRepoLogs() {
  const [sentencesRepo, setSentencesRepo] = useState<{ level: string; sentences: SentenceEntry[] } | null>(null);
  const [backgroundsLog, setBackgroundsLog] = useState<BackgroundLog | null>(null);
  const [meditationsConfig, setMeditationsConfig] = useState<MeditationsConfig | null>(null);
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const [bgRes, configRes] = await Promise.all([
          fetch('/backgrounds_log.json'),
          fetch('/meditations_config.json'),
        ]);
        if (bgRes.ok) setBackgroundsLog(await bgRes.json());

        let config: MeditationsConfig | null = null;
        if (configRes.ok) {
          config = await configRes.json() as MeditationsConfig;
          setMeditationsConfig(config);
        }

        // Fetch each per-section instruction file referenced in the config
        if (config) {
          const meditation = Object.values(config.meditations)[0];
          if (meditation) {
            const sectionEntries = await Promise.all(
              Object.entries(SECTION_PATH_FIELDS).map(async ([section, pathField]) => {
                const path = meditation[pathField];
                if (!path) return [] as SentenceEntry[];
                try {
                  const res = await fetch(`/${path.replace(/^public\//, '')}`);
                  if (!res.ok) return [] as SentenceEntry[];
                  const data = await res.json() as InstructionSection;
                  return flattenInstructionSection(section, data);
                } catch (e) {
                  console.error(`Error fetching section ${section}:`, e);
                  return [] as SentenceEntry[];
                }
              })
            );
            const allSentences = sectionEntries.flat();
            setSentencesRepo({ level: '', sentences: allSentences });
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingOptions(false);
      }
    })();
  }, []);

  return { sentencesRepo, backgroundsLog, meditationsConfig, loadingOptions };
}