import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveCodexResumeThreadId } from './codex-agents-loader.js';

async function withSessionsRoot(run) {
  const root = await mkdtemp(join(tmpdir(), 'codex-session-resume-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeSession(root, id, metadata) {
  const dayDir = join(root, '2026', '07', '24');
  await mkdir(dayDir, { recursive: true });
  const file = join(dayDir, `rollout-${id}.jsonl`);
  await writeFile(file, `${JSON.stringify({ type: 'session_meta', payload: { id, ...metadata } })}\n`, 'utf8');
}

test('resolveCodexResumeThreadId keeps a normal thread unchanged', async () => {
  await withSessionsRoot(async (root) => {
    await writeSession(root, 'thread_main123456', {
      session_id: 'thread_main123456',
      thread_source: 'user',
      source: 'exec',
    });

    assert.equal(resolveCodexResumeThreadId('thread_main123456', root), 'thread_main123456');
  });
});

test('resolveCodexResumeThreadId redirects a sub-agent to its parent', async () => {
  await withSessionsRoot(async (root) => {
    await writeSession(root, 'thread_main123456', {
      session_id: 'thread_main123456',
      thread_source: 'user',
      source: 'exec',
    });
    await writeSession(root, 'thread_child123456', {
      session_id: 'thread_main123456',
      parent_thread_id: 'thread_main123456',
      thread_source: 'subagent',
      source: { subagent: { thread_spawn: { parent_thread_id: 'thread_main123456' } } },
    });

    assert.equal(resolveCodexResumeThreadId('thread_child123456', root), 'thread_main123456');
  });
});

test('resolveCodexResumeThreadId walks nested sub-agent parents', async () => {
  await withSessionsRoot(async (root) => {
    await writeSession(root, 'thread_main123456', {
      session_id: 'thread_main123456',
      thread_source: 'user',
      source: 'exec',
    });
    await writeSession(root, 'thread_child123456', {
      session_id: 'thread_main123456',
      parent_thread_id: 'thread_main123456',
      thread_source: 'subagent',
      source: { subagent: { thread_spawn: { parent_thread_id: 'thread_main123456' } } },
    });
    await writeSession(root, 'thread_grandchild123456', {
      session_id: 'thread_child123456',
      parent_thread_id: 'thread_child123456',
      thread_source: 'subagent',
      source: { subagent: { thread_spawn: { parent_thread_id: 'thread_child123456' } } },
    });

    assert.equal(resolveCodexResumeThreadId('thread_grandchild123456', root), 'thread_main123456');
  });
});

test('resolveCodexResumeThreadId leaves an orphan sub-agent unchanged', async () => {
  await withSessionsRoot(async (root) => {
    await writeSession(root, 'thread_orphan123456', {
      session_id: 'thread_orphan123456',
      thread_source: 'subagent',
      source: { subagent: { other: 'guardian' } },
    });

    assert.equal(resolveCodexResumeThreadId('thread_orphan123456', root), 'thread_orphan123456');
  });
});
