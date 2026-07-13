import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReasoningSelect } from './ReasoningSelect';
import { getCodexReasoningLevels } from '../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

describe('ReasoningSelect', () => {
  it('matches the Codex 0.144.1 GPT-5.6 reasoning capability catalog', () => {
    expect([...getCodexReasoningLevels('gpt-5.6-sol')]).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max', 'ultra',
    ]);
    expect([...getCodexReasoningLevels('gpt-5.6-terra')]).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max', 'ultra',
    ]);
    expect([...getCodexReasoningLevels('gpt-5.6-luna')]).toEqual([
      'low', 'medium', 'high', 'xhigh', 'max',
    ]);
  });

  it.each(['gpt-5.6-sol', 'gpt-5.6-terra'])(
    'shows max and ultra for %s',
    (selectedModel) => {
      render(
        <ReasoningSelect
          value="high"
          onChange={vi.fn()}
          currentProvider="codex"
          selectedModel={selectedModel}
        />,
      );

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('Max')).toBeTruthy();
      expect(screen.getByText('Ultra')).toBeTruthy();
    },
  );

  it('shows max but not ultra for GPT-5.6 Luna', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="codex"
        selectedModel="gpt-5.6-luna"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Max')).toBeTruthy();
    expect(screen.queryByText('Ultra')).toBeNull();
  });

  it('supports the GPT-5.6 alias and dated snapshots', () => {
    const { rerender } = render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="codex"
        selectedModel="gpt-5.6"
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Ultra')).toBeTruthy();

    fireEvent.click(screen.getByRole('button'));
    rerender(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="codex"
        selectedModel="gpt-5.6-2026-07-13"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Ultra')).toBeTruthy();

    fireEvent.click(screen.getByRole('button'));
    rerender(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="codex"
        selectedModel="gpt-5.6-sol-2026-07-13"
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Ultra')).toBeTruthy();
  });

  it('keeps legacy Codex models limited to xhigh', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="codex"
        selectedModel="gpt-5.5"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('XHigh')).toBeTruthy();
    expect(screen.queryByText('Max')).toBeNull();
    expect(screen.queryByText('Ultra')).toBeNull();
  });

  it('resets ultra to high when the selected model does not support it', () => {
    const onChange = vi.fn();

    render(
      <ReasoningSelect
        value="ultra"
        onChange={onChange}
        currentProvider="codex"
        selectedModel="gpt-5.6-luna"
      />,
    );

    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('shows xhigh and max for Claude Opus 4.8', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="claude"
        selectedModel="claude-opus-4-8"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('XHigh')).toBeTruthy();
    expect(screen.getByText('Max')).toBeTruthy();
  });

  it('shows max but not xhigh for Claude Sonnet 4.6', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="claude"
        selectedModel="claude-sonnet-4-6"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('XHigh')).toBeNull();
    expect(screen.getByText('Max')).toBeTruthy();
  });

  it('shows max but not xhigh for Claude Sonnet 5', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="claude"
        selectedModel="claude-sonnet-5"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('XHigh')).toBeNull();
    expect(screen.getByText('Max')).toBeTruthy();
  });

  it('resets unavailable effort when selected Claude model changes', () => {
    const onChange = vi.fn();

    render(
      <ReasoningSelect
        value="xhigh"
        onChange={onChange}
        currentProvider="claude"
        selectedModel="claude-sonnet-4-6"
      />,
    );

    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('hides for Claude models without effort support', () => {
    render(
      <ReasoningSelect
        value="high"
        onChange={vi.fn()}
        currentProvider="claude"
        selectedModel="claude-haiku-4-5"
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});
