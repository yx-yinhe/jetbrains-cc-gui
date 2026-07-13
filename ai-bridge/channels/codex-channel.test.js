import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCodexReasoningEffort } from './codex-channel.js';

test('Codex reasoning effort preserves GPT-5.6 max and ultra levels', () => {
  assert.equal(resolveCodexReasoningEffort('max'), 'max');
  assert.equal(resolveCodexReasoningEffort('ultra'), 'ultra');
});

test('Codex reasoning effort trims values and defaults to medium', () => {
  assert.equal(resolveCodexReasoningEffort(' xhigh '), 'xhigh');
  assert.equal(resolveCodexReasoningEffort(''), 'medium');
  assert.equal(resolveCodexReasoningEffort(null), 'medium');
});
