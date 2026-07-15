import { useCallback, useState } from 'react';

const PROGRESS_HIGHLIGHT_KEY = 'assistantProgressHighlightEnabled';
const SUMMARY_HIGHLIGHT_KEY = 'assistantSummaryHighlightEnabled';

function readEnabledPreference(key: string): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function persistEnabledPreference(key: string, enabled: boolean): void {
  try {
    localStorage.setItem(key, String(enabled));
  } catch {
    // Keep the in-memory preference when storage is unavailable.
  }
}

export function useAssistantDisplaySettings() {
  const [progressHighlightEnabled, setProgressHighlightEnabledState] = useState(
    () => readEnabledPreference(PROGRESS_HIGHLIGHT_KEY),
  );
  const [summaryHighlightEnabled, setSummaryHighlightEnabledState] = useState(
    () => readEnabledPreference(SUMMARY_HIGHLIGHT_KEY),
  );

  const setProgressHighlightEnabled = useCallback((enabled: boolean) => {
    setProgressHighlightEnabledState(enabled);
    persistEnabledPreference(PROGRESS_HIGHLIGHT_KEY, enabled);
  }, []);

  const setSummaryHighlightEnabled = useCallback((enabled: boolean) => {
    setSummaryHighlightEnabledState(enabled);
    persistEnabledPreference(SUMMARY_HIGHLIGHT_KEY, enabled);
  }, []);

  return {
    progressHighlightEnabled,
    summaryHighlightEnabled,
    setProgressHighlightEnabled,
    setSummaryHighlightEnabled,
  };
}
