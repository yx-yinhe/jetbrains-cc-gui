import { act, renderHook } from '@testing-library/react';
import { useAssistantDisplaySettings } from './useAssistantDisplaySettings';

describe('useAssistantDisplaySettings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults both options on and persists independent changes', () => {
    const { result, unmount } = renderHook(() => useAssistantDisplaySettings());
    expect(result.current.progressHighlightEnabled).toBe(true);
    expect(result.current.summaryHighlightEnabled).toBe(true);

    act(() => result.current.setProgressHighlightEnabled(false));
    expect(result.current.progressHighlightEnabled).toBe(false);
    expect(result.current.summaryHighlightEnabled).toBe(true);
    unmount();

    const restored = renderHook(() => useAssistantDisplaySettings());
    expect(restored.result.current.progressHighlightEnabled).toBe(false);
    expect(restored.result.current.summaryHighlightEnabled).toBe(true);
  });
});
