import { act, renderHook } from '@testing-library/react';
import { useCompletionBehaviorSettings } from './useCompletionBehaviorSettings';

describe('useCompletionBehaviorSettings', () => {
  beforeEach(() => localStorage.clear());

  it('defaults both options on and persists them independently', () => {
    const { result, unmount } = renderHook(() => useCompletionBehaviorSettings());
    expect(result.current.processCollapseEnabled).toBe(true);
    expect(result.current.completionJumpToUserEnabled).toBe(true);

    act(() => result.current.setProcessCollapseEnabled(false));
    expect(result.current.processCollapseEnabled).toBe(false);
    expect(result.current.completionJumpToUserEnabled).toBe(true);
    unmount();

    const restored = renderHook(() => useCompletionBehaviorSettings());
    expect(restored.result.current.processCollapseEnabled).toBe(false);
    expect(restored.result.current.completionJumpToUserEnabled).toBe(true);
  });
});
