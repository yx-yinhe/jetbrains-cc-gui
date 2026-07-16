import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClaudeContentBlock, ClaudeMessage, ToolResultBlock } from '../../types';
import { extractMarkdownContent } from '../../utils/copyUtils';
import { getCompletionSummaryBlockIndex, MessageItem } from './MessageItem';

vi.mock('../MarkdownBlock', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown-block">{content}</div>,
}));

vi.mock('../toolBlocks', () => ({
  ReadToolBlock: () => <div data-testid="read-tool-block">read</div>,
  ReadToolGroupBlock: () => <div data-testid="read-tool-group-block">read-group</div>,
  EditToolBlock: () => <div data-testid="edit-tool-block">edit</div>,
  EditToolGroupBlock: () => <div data-testid="edit-tool-group-block">edit-group</div>,
  BashToolBlock: () => <div data-testid="bash-tool-block">bash</div>,
  BashToolGroupBlock: () => <div data-testid="bash-tool-group-block">bash-group</div>,
  SearchToolGroupBlock: () => <div data-testid="search-tool-group-block">search-group</div>,
}));

vi.mock('./ContentBlockRenderer', () => ({
  ContentBlockRenderer: ({ block }: { block: ClaudeContentBlock }) => (
    <div data-testid={`content-block-${block.type}`}>
      {block.type === 'text' ? block.text : block.type}
    </div>
  ),
}));

vi.mock('./ProviderNotConfiguredCard', () => ({
  ProviderNotConfiguredCard: () => <div data-testid="provider-not-configured-card">provider-card</div>,
  isProviderNotConfiguredError: () => false,
}));

const t = ((key: string, opts?: Record<string, string>) => {
  const translations: Record<string, string> = {
    'markdown.copyMessage': '复制消息',
    'markdown.copySuccess': '已复制',
    'chat.streamingConnected': '已连接',
    'chat.totalDuration': '本次耗时',
    'chat.tokenUsage': '输入 {{input}} / 输出 {{output}}',
    'chat.tokenUsageDetail': '本轮合计 — 输入 {{input}} · 缓存写入 {{cacheWrite}} · 缓存读取 {{cacheRead}} · 输出 {{output}}',
    'chat.executionProcess.label': '执行过程',
    'chat.executionProcess.readFile': '读取了文件',
    'chat.executionProcess.readFiles': '读取了多个文件',
    'chat.executionProcess.editedFile': '编辑了文件',
    'chat.executionProcess.editedFiles': '编辑了多个文件',
    'chat.executionProcess.singleCommand': '执行了命令',
    'chat.executionProcess.multipleCommands': '执行了多个命令',
    'chat.executionProcess.singleSearch': '进行了搜索',
    'chat.executionProcess.multipleSearches': '进行了多次搜索',
    'chat.executionProcess.singleTool': '调用了工具',
    'chat.executionProcess.multipleTools': '调用了多个工具',
    'chat.executionProcess.summarySeparator': '、',
    'chat.executionProcess.summaryPairSeparator': '并',
    'chat.executionProcess.summaryFinalSeparator': '并',
    'chat.executionProcess.itemCount': '{{count}} 项',
    'chat.executionProcess.completed': '已完成',
    'chat.executionProcess.cancelled': '已手动取消',
    'chat.executionProcess.permission_denied': '权限被拒绝',
    'chat.executionProcess.error': '执行出错',
    'chat.executionProcess.terminated': '意外终止',
  };
  let result = translations[key] ?? key;
  if (opts) {
    for (const [k, v] of Object.entries(opts)) {
      result = result.replace(`{{${k}}}`, v);
    }
  }
  return result;
}) as any;

const getMessageText = (message: ClaudeMessage) => message.content ?? '';

const getContentBlocks = (message: ClaudeMessage): ClaudeContentBlock[] => {
  const raw = message.raw;
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const content = Array.isArray(raw.content)
    ? raw.content
    : Array.isArray(raw.message?.content)
      ? raw.message.content
      : [];

  return content as ClaudeContentBlock[];
};

const findToolResult = (_toolId: string | undefined, _messageIndex: number): ToolResultBlock | null => null;

interface RenderMessageOptions {
  isLast?: boolean;
  streamingActive?: boolean;
  processCollapseEnabled?: boolean;
  currentProvider?: string;
}

function buildMessageItem(message: ClaudeMessage, options: RenderMessageOptions = {}) {
  return (
    <MessageItem
      message={message}
      messageIndex={0}
      messageKey="message-0"
      isLast={options.isLast ?? false}
      streamingActive={options.streamingActive ?? false}
      isThinking={false}
      t={t}
      getMessageText={getMessageText}
      getContentBlocks={getContentBlocks}
      findToolResult={findToolResult}
      extractMarkdownContent={extractMarkdownContent}
      processCollapseEnabled={options.processCollapseEnabled}
      currentProvider={options.currentProvider}
    />
  );
}

function renderMessageItem(message: ClaudeMessage, options: RenderMessageOptions = {}) {
  return render(buildMessageItem(message, options));
}

describe('MessageItem copy button visibility', () => {
  it('hides the assistant copy button for tool-only messages', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      content: 'Tool: shell_command',
      raw: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'shell_command',
            input: { cmd: 'git status' },
          },
        ],
      } as any,
    };

    renderMessageItem(message);

    fireEvent.click(screen.getByRole('button', { name: /意外终止/ }));
    fireEvent.click(screen.getByRole('button', { name: /执行了命令/ }));
    expect(screen.getByTestId('bash-tool-block')).toBeTruthy();
    expect(screen.queryByTestId('content-block-text')).toBeNull();
    expect(screen.queryByRole('button', { name: '复制消息' })).toBeNull();
  });

  it('keeps the assistant copy button when tool output is followed by reply text', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      raw: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'shell_command',
            input: { cmd: 'git status' },
          },
          {
            type: 'text',
            text: '提交完成。',
          },
        ],
      } as any,
    };

    renderMessageItem(message);

    fireEvent.click(screen.getByRole('button', { name: /执行过程/ }));
    fireEvent.click(screen.getByRole('button', { name: /执行了命令/ }));
    expect(screen.getByTestId('bash-tool-block')).toBeTruthy();
    expect(screen.getByTestId('content-block-text')).toBeTruthy();
    expect(screen.getByRole('button', { name: '复制消息' })).toBeTruthy();
  });

  it('groups consecutive exec_command blocks into the batch command tool block', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      raw: {
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'exec_command',
            input: { command: 'git status' },
          },
          {
            type: 'tool_use',
            id: 'tool-2',
            name: 'exec_command',
            input: { command: 'git diff --cached' },
          },
        ],
      } as any,
    };

    renderMessageItem(message);

    fireEvent.click(screen.getByRole('button', { name: /意外终止/ }));
    fireEvent.click(screen.getByRole('button', { name: /执行了多个命令/ }));
    expect(screen.getByTestId('bash-tool-group-block')).toBeTruthy();
    expect(screen.queryAllByTestId('content-block-tool_use')).toHaveLength(0);
  });

  it('renders independent Codex commands separately instead of calling them a batch', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      raw: {
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'exec_command', input: { command: 'git status' } },
          { type: 'tool_use', id: 'tool-2', name: 'exec_command', input: { command: 'git diff' } },
          { type: 'text', text: 'Done.' },
        ],
      } as any,
    };

    renderMessageItem(message, { currentProvider: 'codex' });

    const processToggle = screen.getByRole('button', { name: /执行过程/ });
    fireEvent.click(processToggle);
    const commandToggle = screen.getByRole('button', { name: /执行了多个命令/ });
    expect(commandToggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('bash-tool-block')).toBeNull();
    fireEvent.click(commandToggle);
    expect(screen.queryByTestId('bash-tool-group-block')).toBeNull();
    expect(screen.getAllByTestId('bash-tool-block')).toHaveLength(2);
  });

  it('uses one summary disclosure for consecutive edits and commands between prose', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      raw: {
        content: [
          { type: 'text', text: 'Working on the change.' },
          { type: 'tool_use', id: 'edit-1', name: 'edit_file', input: { file_path: 'a.ts' } },
          { type: 'tool_use', id: 'edit-2', name: 'write_to_file', input: { file_path: 'b.ts' } },
          { type: 'tool_use', id: 'cmd-1', name: 'exec_command', input: { command: 'git status' } },
          { type: 'tool_use', id: 'cmd-2', name: 'exec_command', input: { command: 'git diff' } },
          { type: 'text', text: 'Done.' },
        ],
      } as any,
    };

    renderMessageItem(message, { currentProvider: 'codex' });
    fireEvent.click(screen.getByRole('button', { name: /执行过程/ }));

    const toolToggle = screen.getByRole('button', { name: /编辑了多个文件并执行了多个命令/ });
    expect(toolToggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('.execution-command-group')).toHaveLength(1);
    fireEvent.click(toolToggle);
    expect(screen.getByTestId('edit-tool-group-block')).toBeTruthy();
    expect(screen.getAllByTestId('bash-tool-block')).toHaveLength(2);
  });
});

describe('assistant execution process folding', () => {
  const executionMessage: ClaudeMessage = {
    type: 'assistant',
    durationMs: 84000,
    raw: {
      content: [
        { type: 'thinking', thinking: 'Inspecting the project.' },
        { type: 'tool_use', id: 'tool-1', name: 'exec_command', input: { command: 'git status' } },
        { type: 'text', text: 'The change is complete.' },
      ],
      turnUsage: {
        input_tokens: 1200,
        output_tokens: 456,
      },
    } as any,
  };

  it('recognizes structurally separate process content without requiring a tool call', () => {
    expect(getCompletionSummaryBlockIndex([
      { type: 'thinking', thinking: 'Reasoning.' },
      { type: 'text', text: 'Final answer.' },
    ])).toBe(1);
    expect(getCompletionSummaryBlockIndex([
      { type: 'text', text: 'Interim update.' },
      { type: 'text', text: 'Final answer.' },
    ])).toBe(1);
    expect(getCompletionSummaryBlockIndex([{ type: 'text', text: 'Ordinary answer.' }])).toBe(-1);
  });

  it('collapses completed process content while leaving the final answer visible', () => {
    renderMessageItem(executionMessage);

    const toggle = screen.getByRole('button', { name: /执行过程/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('thinking')).toBeNull();
    expect(screen.getByText('The change is complete.')).toBeTruthy();
    expect(toggle.textContent).toContain('输入 1.2K / 输出 456');
    expect(document.querySelector('.message-duration')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('thinking')).toBeTruthy();
  });

  it('shows process content normally while the turn is streaming', () => {
    renderMessageItem(executionMessage, { isLast: true, streamingActive: true });

    expect(screen.queryByRole('button', { name: /执行过程/ })).toBeNull();
    expect(screen.getByText('thinking')).toBeTruthy();
    expect(screen.getByText('The change is complete.')).toBeTruthy();
  });

  it('starts expanded when default folding is disabled and remains manually collapsible', () => {
    renderMessageItem(executionMessage, { processCollapseEnabled: false });

    const toggle = screen.getByRole('button', { name: /执行过程/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('preserves an earlier turn fold choice when the next turn starts', () => {
    const view = renderMessageItem(executionMessage, { isLast: true });
    const toggle = screen.getByRole('button', { name: /执行过程/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    view.rerender(buildMessageItem(executionMessage, { isLast: false, streamingActive: true }));

    expect(screen.getByRole('button', { name: /执行过程/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses a cancelled turn under its reason without requiring a final answer', () => {
    const cancelledMessage: ClaudeMessage = {
      type: 'assistant',
      turnTerminationReason: 'cancelled',
      raw: {
        content: [
          { type: 'text', text: 'Partial progress.' },
          { type: 'tool_use', id: 'tool-1', name: 'exec_command', input: { command: 'git status' } },
        ],
      } as any,
    };

    renderMessageItem(cancelledMessage);

    const toggle = screen.getByRole('button', { name: /已手动取消/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Partial progress.')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('Partial progress.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /执行了命令/ })).toBeTruthy();
  });
});

describe('MessageItem token usage display', () => {
  it('shows whole-turn token usage alongside duration when turnUsage is present', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      content: 'Hello',
      durationMs: 16000,
      raw: {
        message: {
          content: [{ type: 'text', text: 'Hello' }],
        },
        turnUsage: {
          input_tokens: 1200,
          output_tokens: 456,
        },
      } as any,
    };

    renderMessageItem(message);

    expect(screen.getByText('0:16')).toBeTruthy();
    expect(screen.getByText('输入 1.2K / 输出 456')).toBeTruthy();
  });

  it('counts cache tokens in the input total and details them in the tooltip', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      content: 'Hello',
      durationMs: 10000,
      raw: {
        message: {
          content: [{ type: 'text', text: 'Hello' }],
        },
        turnUsage: {
          input_tokens: 37,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 36310,
          output_tokens: 353,
        },
      } as any,
    };

    renderMessageItem(message);

    // Input shows the full input side (37 + 0 + 36310 = 36347 → "36.3K"),
    // so heavy cache reads are never hidden from the user.
    const tokens = screen.getByText('输入 36.3K / 输出 353');
    expect(tokens).toBeTruthy();
    expect(tokens.getAttribute('title')).toBe(
      '本轮合计 — 输入 37 · 缓存写入 0 · 缓存读取 36.3K · 输出 353'
    );
  });

  it('ignores per-call usage fields (message.usage / top-level usage)', () => {
    // Regression guard: message.usage is the per-call context-occupancy value
    // for the status bar and top-level usage is the session-cumulative Codex
    // value — rendering either would misstate what the turn consumed.
    const message: ClaudeMessage = {
      type: 'assistant',
      content: 'Hello',
      durationMs: 5000,
      raw: {
        content: [{ type: 'text', text: 'Hello' }],
        usage: {
          input_tokens: 500000,
          output_tokens: 9000,
        },
        message: {
          content: [{ type: 'text', text: 'Hello' }],
          usage: {
            input_tokens: 37,
            output_tokens: 353,
          },
        },
      } as any,
    };

    renderMessageItem(message);

    expect(screen.getByText('0:05')).toBeTruthy();
    expect(screen.queryByText(/输入/)).toBeNull();
  });

  it('does not show token usage when no turnUsage is present', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      content: 'Hello',
      durationMs: 3000,
      raw: {
        message: {
          content: [{ type: 'text', text: 'Hello' }],
        },
      } as any,
    };

    renderMessageItem(message);

    expect(screen.getByText('0:03')).toBeTruthy();
    expect(screen.queryByText(/输入/)).toBeNull();
  });

  it('does not show token usage when tokens are all zero', () => {
    const message: ClaudeMessage = {
      type: 'assistant',
      content: 'Hello',
      durationMs: 3000,
      raw: {
        message: {
          content: [{ type: 'text', text: 'Hello' }],
        },
        turnUsage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      } as any,
    };

    renderMessageItem(message);

    expect(screen.getByText('0:03')).toBeTruthy();
    expect(screen.queryByText(/输入/)).toBeNull();
  });
});
