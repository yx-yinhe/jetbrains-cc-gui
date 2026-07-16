import { useCallback, useEffect, useState } from 'react';

const PROCESS_COLLAPSE_KEY = 'completionProcessCollapseEnabled';
const JUMP_TO_USER_KEY = 'completionJumpToUserEnabled';
const LEGACY_KEYS = ['assistantProgressHighlightEnabled', 'assistantSummaryHighlightEnabled'];

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

export function useCompletionBehaviorSettings() {
  const [processCollapseEnabled, setProcessCollapseEnabledState] = useState(
    () => readEnabledPreference(PROCESS_COLLAPSE_KEY),
  );
  const [completionJumpToUserEnabled, setCompletionJumpToUserEnabledState] = useState(
    () => readEnabledPreference(JUMP_TO_USER_KEY),
  );

  useEffect(() => {
    try {
      LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Legacy cleanup is best-effort only.
    }
  }, []);

  const setProcessCollapseEnabled = useCallback((enabled: boolean) => {
    setProcessCollapseEnabledState(enabled);
    persistEnabledPreference(PROCESS_COLLAPSE_KEY, enabled);
  }, []);

  const setCompletionJumpToUserEnabled = useCallback((enabled: boolean) => {
    setCompletionJumpToUserEnabledState(enabled);
    persistEnabledPreference(JUMP_TO_USER_KEY, enabled);
  }, []);

  return {
    processCollapseEnabled,
    completionJumpToUserEnabled,
    setProcessCollapseEnabled,
    setCompletionJumpToUserEnabled,
  };
}
