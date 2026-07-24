/**
 * AGENTS.md discovery and session file management for Codex.
 * Collects agent instructions from project directories and finds session files.
 */

import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { getRealHomeDir } from '../../utils/path-utils.js';
import { MAX_AGENTS_MD_BYTES, AGENTS_FILE_NAMES, SESSION_PATCH_SCAN_MAX_FILES, logWarn, logInfo, logDebug } from './codex-utils.js';

const SESSION_META_READ_BYTES = 64 * 1024;
const MAX_SUBAGENT_PARENT_DEPTH = 8;
const sessionFileCache = new Map();

/**
 * Finds a session file containing the threadId under ~/.codex/sessions.
 */
export function findSessionFileByThreadId(
  threadId,
  sessionsRoot = join(getRealHomeDir(), '.codex', 'sessions')
) {
  if (!threadId || typeof threadId !== 'string') {
    return null;
  }

  if (!existsSync(sessionsRoot)) {
    return null;
  }

  const cacheKey = `${sessionsRoot}\0${threadId}`;
  const cachedPath = sessionFileCache.get(cacheKey);
  if (cachedPath && existsSync(cachedPath)) {
    return cachedPath;
  }
  sessionFileCache.delete(cacheKey);

  const stack = [sessionsRoot];
  let visited = 0;

  while (stack.length > 0 && visited < SESSION_PATCH_SCAN_MAX_FILES) {
    const current = stack.pop();
    if (!current) continue;
    visited += 1;

    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.jsonl') && entry.name.includes(threadId)) {
        sessionFileCache.set(cacheKey, fullPath);
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Resolves a persisted multi-agent v2 sub-agent thread back to its resumable
 * parent. Codex CLI rejects direct input to sub-agent threads.
 */
export function resolveCodexResumeThreadId(
  threadId,
  sessionsRoot = join(getRealHomeDir(), '.codex', 'sessions')
) {
  if (!threadId || typeof threadId !== 'string') {
    return threadId;
  }

  let candidate = threadId;
  const visited = new Set();

  for (let depth = 0; depth < MAX_SUBAGENT_PARENT_DEPTH; depth += 1) {
    if (visited.has(candidate)) {
      break;
    }
    visited.add(candidate);

    const sessionFile = findSessionFileByThreadId(candidate, sessionsRoot);
    const metadata = readSessionResumeMetadata(sessionFile);
    if (!metadata?.isSubagent) {
      return candidate;
    }

    const parentThreadId = metadata.parentThreadId || metadata.sessionId;
    if (!parentThreadId || parentThreadId === candidate) {
      break;
    }
    candidate = parentThreadId;
  }

  return threadId;
}

function readSessionResumeMetadata(sessionFile) {
  if (!sessionFile) {
    return null;
  }

  let fd = null;
  try {
    fd = openSync(sessionFile, 'r');
    const buffer = Buffer.alloc(SESSION_META_READ_BYTES);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    const head = buffer.toString('utf8', 0, bytesRead);
    const firstLineEnd = head.indexOf('\n');
    const sessionMeta = firstLineEnd >= 0 ? head.slice(0, firstLineEnd) : head;

    const threadSource = extractJsonStringValue(sessionMeta, 'thread_source');
    const hasSubagentSource = /"source"\s*:\s*\{\s*"subagent"\s*:/.test(sessionMeta);
    const parentThreadId = extractJsonStringValue(sessionMeta, 'parent_thread_id');
    const sessionId = extractJsonStringValue(sessionMeta, 'session_id');

    return {
      isSubagent: threadSource === 'subagent' || hasSubagentSource,
      parentThreadId,
      sessionId,
    };
  } catch (error) {
    logDebug('Codex', `Failed to inspect session metadata: ${error?.message || error}`);
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // Ignore close failures after a read attempt.
      }
    }
  }
}

function extractJsonStringValue(text, field) {
  if (!text || !field) return null;
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`"${escapedField}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`));
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

/**
 * Find the Git repository root directory.
 * @param {string} startDir - Starting directory
 * @returns {string|null} Git root directory or null
 */
export function findGitRoot(startDir) {
  let currentDir = startDir;

  while (currentDir) {
    const gitDir = join(currentDir, '.git');
    if (existsSync(gitDir)) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached the filesystem root
      break;
    }
    currentDir = parentDir;
  }
  return null;
}

/**
 * Search for an AGENTS.md file in a single directory.
 * @param {string} dir - Directory to search
 * @returns {string|null} Found file path or null
 */
export function findAgentsFileInDir(dir) {
  for (const fileName of AGENTS_FILE_NAMES) {
    const filePath = join(dir, fileName);
    try {
      if (existsSync(filePath)) {
        const stats = statSync(filePath);
        if (stats.isFile() && stats.size > 0) {
          return filePath;
        }
      }
    } catch (e) {
      // Ignore permission errors, etc.
    }
  }
  return null;
}

/**
 * Read the contents of an AGENTS.md file.
 * @param {string} filePath - File path
 * @returns {string} File content (may be truncated)
 */
export function readAgentsFile(filePath) {
  try {
    const stats = statSync(filePath);
    const content = readFileSync(filePath, 'utf8');
    if (content.length > MAX_AGENTS_MD_BYTES) {
      logInfo('AGENTS.md', `File truncated from ${content.length} to ${MAX_AGENTS_MD_BYTES} bytes: ${filePath}`);
      return content.slice(0, MAX_AGENTS_MD_BYTES);
    }
    return content;
  } catch (e) {
    logWarn('AGENTS.md', `Failed to read file: ${filePath}`, e.message);
    return '';
  }
}

/**
 * Collect all AGENTS.md instructions (from project root to current directory).
 *
 * Search rules (consistent with Codex CLI):
 * 1. Global instructions: ~/.codex/AGENTS.override.md or ~/.codex/AGENTS.md
 * 2. Project instructions: every directory from git root to cwd
 *
 * @param {string} cwd - Current working directory
 * @returns {string} Merged instruction content
 */
export function collectAgentsInstructions(cwd) {
  if (!cwd || typeof cwd !== 'string') {
    return '';
  }

  const instructions = [];
  let totalBytes = 0;

  // 1. First read global instructions (~/.codex/)
  const codexHome = (process.env.CODEX_HOME && process.env.CODEX_HOME.trim())
    ? process.env.CODEX_HOME.trim()
    : join(getRealHomeDir(), '.codex');
  const globalFile = findAgentsFileInDir(codexHome);
  if (globalFile) {
    const content = readAgentsFile(globalFile);
    if (content.trim()) {
      logInfo('AGENTS.md', `Loaded global instructions: ${globalFile}`);
      instructions.push(`# Global Instructions (${globalFile})\n\n${content}`);
      totalBytes += content.length;
    }
  }

  // 2. Then read project instructions (from git root to cwd)
  const gitRoot = findGitRoot(cwd);
  const searchRoot = gitRoot || cwd;

  // Collect all directories from searchRoot to cwd
  const directories = [];
  let currentDir = cwd;
  while (currentDir) {
    directories.unshift(currentDir); // Add to the beginning to maintain root-to-leaf order
    if (currentDir === searchRoot) {
      break;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  // Read AGENTS.md from each directory in order
  for (const dir of directories) {
    if (totalBytes >= MAX_AGENTS_MD_BYTES) {
      logInfo('AGENTS.md', `Reached max bytes limit (${MAX_AGENTS_MD_BYTES}), stopping collection`);
      break;
    }

    const file = findAgentsFileInDir(dir);
    if (file) {
      const content = readAgentsFile(file);
      if (content.trim()) {
        const relativePath = dir === searchRoot ? '(root)' : dir.replace(searchRoot, '.');
        logInfo('AGENTS.md', `Loaded project instructions: ${file}`);
        instructions.push(`# Project Instructions ${relativePath}\n\n${content}`);
        totalBytes += content.length;
      }
    }
  }

  if (instructions.length === 0) {
    logDebug('AGENTS.md', 'No AGENTS.md files found');
    return '';
  }

  logInfo('AGENTS.md', `Collected ${instructions.length} instruction files, total ${totalBytes} bytes`);
  return instructions.join('\n\n---\n\n');
}
