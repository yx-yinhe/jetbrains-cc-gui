import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeMessage } from '../types';
import { getUniqueMessageKeys } from '../utils/messageUtils';
import { MessageAnchorRail } from './MessageAnchorRail';

function makeRect(top: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    right: 100,
    bottom: top + 20,
    left: 0,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect;
}

let intersectionCallback: IntersectionObserverCallback | null = null;
let intersectionObserver: IntersectionObserver | null = null;

function emitIntersections(
  entries: Array<{ target: Element; isIntersecting: boolean }>,
): void {
  if (!intersectionCallback || !intersectionObserver) {
    throw new Error('IntersectionObserver was not initialized');
  }

  act(() => {
    intersectionCallback!(entries.map(({ target, isIntersecting }) => ({
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      time: 0,
      boundingClientRect: makeRect(0),
      intersectionRect: makeRect(0),
      rootBounds: makeRect(0),
    } as IntersectionObserverEntry)), intersectionObserver!);
  });
}

function activeDots(dots: HTMLElement[]): HTMLElement[] {
  return dots.filter((dot) => dot.classList.contains('is-active'));
}

describe('MessageAnchorRail', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    intersectionCallback = null;
    intersectionObserver = null;

    vi.stubGlobal('IntersectionObserver', class MockIntersectionObserver {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds = [0];

      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
        intersectionObserver = this as unknown as IntersectionObserver;
      }

      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps colliding timestamp anchors independently navigable and active', () => {
    const timestamp = '2026-07-13T12:00:00.000Z';
    const messages: ClaudeMessage[] = ['first', 'second', 'third'].map((content) => ({
      type: 'user',
      content,
      timestamp,
    }));
    const messageKeys = getUniqueMessageKeys(messages);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 100 });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(makeRect(0));
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    const nodeMap = new Map<string, HTMLDivElement>();
    messageKeys.forEach((key, index) => {
      const node = document.createElement('div');
      node.dataset.messageAnchorId = key;
      vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(makeRect((index + 1) * 100));
      nodeMap.set(key, node);
    });

    render(
      <MessageAnchorRail
        messages={messages}
        containerRef={{ current: container } as RefObject<HTMLDivElement>}
        messageNodeMap={{ current: nodeMap } as RefObject<Map<string, HTMLDivElement>>}
      />
    );

    const dots = screen.getAllByRole('button');
    expect(dots).toHaveLength(3);

    fireEvent.click(dots[0]);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 72, behavior: 'smooth' });
    expect(activeDots(dots)).toEqual([dots[0]]);

    fireEvent.click(dots[1]);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 172, behavior: 'smooth' });
    expect(activeDots(dots)).toEqual([dots[1]]);

    fireEvent.click(dots[0]);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 72, behavior: 'smooth' });
    expect(scrollTo).toHaveBeenCalledTimes(3);
  });

  it('keeps the clicked consecutive message active while both messages are visible', () => {
    const messages: ClaudeMessage[] = [
      { type: 'user', content: 'upper message', timestamp: '2026-07-13T12:00:00.000Z' },
      { type: 'user', content: 'lower message', timestamp: '2026-07-13T12:00:01.000Z' },
    ];
    const messageKeys = getUniqueMessageKeys(messages);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 100 });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(makeRect(0));
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    const nodes = messageKeys.map((key, index) => {
      const node = document.createElement('div');
      node.dataset.messageAnchorId = key;
      vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(makeRect((index + 1) * 100));
      return node;
    });
    const nodeMap = new Map(messageKeys.map((key, index) => [key, nodes[index]]));

    render(
      <MessageAnchorRail
        messages={messages}
        containerRef={{ current: container } as RefObject<HTMLDivElement>}
        messageNodeMap={{ current: nodeMap } as RefObject<Map<string, HTMLDivElement>>}
      />
    );

    const dots = screen.getAllByRole('button');
    emitIntersections([{ target: nodes[0], isIntersecting: true }]);
    expect(activeDots(dots)).toEqual([dots[0]]);

    fireEvent.click(dots[1]);
    expect(activeDots(dots)).toEqual([dots[1]]);

    emitIntersections([
      { target: nodes[0], isIntersecting: true },
      { target: nodes[1], isIntersecting: true },
    ]);
    expect(activeDots(dots)).toEqual([dots[1]]);

    fireEvent.click(dots[1]);
    expect(activeDots(dots)).toEqual([dots[1]]);

    fireEvent.click(dots[0]);
    emitIntersections([
      { target: nodes[0], isIntersecting: true },
      { target: nodes[1], isIntersecting: true },
    ]);
    expect(activeDots(dots)).toEqual([dots[0]]);
    expect(scrollTo).toHaveBeenCalledTimes(3);
  });

  it('releases the navigation lock if the destination never becomes visible', () => {
    const messages: ClaudeMessage[] = [
      { type: 'user', content: 'upper message', timestamp: '2026-07-13T12:00:00.000Z' },
      { type: 'user', content: 'lower message', timestamp: '2026-07-13T12:00:01.000Z' },
    ];
    const messageKeys = getUniqueMessageKeys(messages);
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 100 });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(makeRect(0));
    container.scrollTo = vi.fn();

    const nodes = messageKeys.map((key, index) => {
      const node = document.createElement('div');
      node.dataset.messageAnchorId = key;
      vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(makeRect((index + 1) * 100));
      return node;
    });
    const nodeMap = new Map(messageKeys.map((key, index) => [key, nodes[index]]));

    render(
      <MessageAnchorRail
        messages={messages}
        containerRef={{ current: container } as RefObject<HTMLDivElement>}
        messageNodeMap={{ current: nodeMap } as RefObject<Map<string, HTMLDivElement>>}
      />
    );

    const dots = screen.getAllByRole('button');
    emitIntersections([{ target: nodes[0], isIntersecting: true }]);
    fireEvent.click(dots[1]);
    emitIntersections([{ target: nodes[0], isIntersecting: true }]);
    expect(activeDots(dots)).toEqual([dots[1]]);

    act(() => vi.advanceTimersByTime(1800));
    emitIntersections([{ target: nodes[0], isIntersecting: true }]);
    expect(activeDots(dots)).toEqual([dots[0]]);
  });
});
