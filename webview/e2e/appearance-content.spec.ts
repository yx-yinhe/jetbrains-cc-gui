import { expect, test, type Page } from '@playwright/test';
import { APP_VERSION } from '../src/version/version';

type BridgeWindow = Window & typeof globalThis & {
  sendToJava?: (message: string) => void;
  updateMessages?: (json: string) => void;
  showPermissionDialog?: (json: string) => void;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((appVersion) => {
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('lastSeenChangelogVersion', appVersion);
    (window as BridgeWindow).sendToJava = () => {};
  }, APP_VERSION);
});

async function showAssistantMarkdown(page: Page, content: string) {
  await page.waitForFunction(() => typeof (window as BridgeWindow).updateMessages === 'function');
  await page.evaluate((text) => {
    const bridgeWindow = window as BridgeWindow;
    if (!bridgeWindow.updateMessages) throw new Error('updateMessages is not registered');
    bridgeWindow.updateMessages(JSON.stringify([{
      type: 'assistant',
      content: text,
      raw: { message: { content: [{ type: 'text', text }] } },
      timestamp: '2026-01-01T00:00:00.000Z',
    }]));
  }, content);
}

async function showGenericTool(page: Page) {
  await page.waitForFunction(() => typeof (window as BridgeWindow).updateMessages === 'function');
  await page.evaluate(() => {
    const bridgeWindow = window as BridgeWindow;
    if (!bridgeWindow.updateMessages) throw new Error('updateMessages is not registered');
    bridgeWindow.updateMessages(JSON.stringify([{
      type: 'assistant',
      content: 'Tool: exec',
      raw: {
        message: {
          content: [{
            type: 'tool_use',
            id: 'exec-opacity-probe',
            name: 'exec',
            input: { PATCH: 'const result = await Promise.all(tasks);' },
          }],
        },
      },
      timestamp: '2026-01-01T00:00:00.000Z',
    }]));
  });
}

test('content font size reaches the chat input without scaling the UI', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fontSizeLevel', '6');
  });

  await page.goto('/');
  const input = page.locator('.input-editable');
  await expect(input).toBeVisible();
  await showAssistantMarkdown(page, 'Typography probe');
  const message = page.locator('.message.assistant .markdown-content');
  await expect(message).toBeVisible();

  const typography = await page.evaluate(() => {
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const app = document.querySelector<HTMLElement>('#app');
    const editable = document.querySelector<HTMLElement>('.input-editable');
    const markdown = document.querySelector<HTMLElement>('.message.assistant .markdown-content');
    return {
      appZoom: app ? Number(getComputedStyle(app).zoom) : null,
      contentScale: Number(rootStyle.getPropertyValue('--cc-gui-content-font-scale')),
      editorFontSize: Number.parseFloat(rootStyle.getPropertyValue('--idea-editor-font-size')),
      fontScale: rootStyle.getPropertyValue('--font-scale').trim(),
      inputFontSize: editable ? Number.parseFloat(getComputedStyle(editable).fontSize) : null,
      messageFontSize: markdown ? Number.parseFloat(getComputedStyle(markdown).fontSize) : null,
    };
  });

  expect(typography.appZoom).toBe(1);
  expect(typography.contentScale).toBe(1.4);
  expect(typography.fontScale).toBe('1');
  expect(typography.inputFontSize).toBeCloseTo(typography.editorFontSize * 1.4, 2);
  expect(typography.messageFontSize).toBeCloseTo(typography.inputFontSize ?? 0, 2);
});

test('assistant Markdown code blocks use the independent opacity', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('appearanceOpacitySettings', JSON.stringify({
      surface: 20,
      codeBlock: 41,
    }));
  });

  await page.goto('/');
  await showAssistantMarkdown(page, '```ts\nconst answer = 42;\n```');

  const codeBlock = page.locator('.message.assistant .markdown-content pre');
  await expect(codeBlock).toBeVisible();

  const colors = await page.evaluate(() => {
    const root = document.documentElement;
    const pre = document.querySelector<HTMLElement>('.message.assistant .markdown-content pre');
    return {
      markdownBlock: pre ? getComputedStyle(pre).backgroundColor : null,
      markdownVariable: root.style.getPropertyValue('--cc-gui-markdown-code-block-bg'),
      toolCodeVariable: root.style.getPropertyValue('--cc-gui-code-block-bg'),
    };
  });

  expect(colors).toEqual({
    markdownBlock: 'rgba(18, 18, 18, 0.41)',
    markdownVariable: 'rgba(18, 18, 18, 0.41)',
    toolCodeVariable: 'rgba(18, 18, 18, 0.32)',
  });
});

test('permission prompt surfaces use configured translucent backgrounds', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('appearanceOpacitySettings', JSON.stringify({
      surface: 20,
      codeBlock: 90,
      menu: 37,
    }));
  });

  await page.goto('/');
  await page.waitForFunction(() => typeof (window as BridgeWindow).showPermissionDialog === 'function');
  await page.evaluate(() => {
    const bridgeWindow = window as BridgeWindow;
    bridgeWindow.showPermissionDialog?.(JSON.stringify({
      channelId: 'permission-opacity-probe',
      toolName: 'Bash',
      inputs: {
        cwd: 'D:/workspace',
        command: 'Get-Content README.md',
      },
    }));
  });

  const dialog = page.locator('.permission-dialog-v3');
  await expect(dialog).toBeVisible();
  const commandBox = page.locator('.permission-dialog-v3-command-box');
  await expect(commandBox).toBeVisible();

  expect(await dialog.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgba(30, 30, 30, 0.37)');
  expect(await commandBox.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgba(18, 18, 18, 0.32)');
});

test('generic tool parameters use the normal-panel-derived code surface', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('appearanceOpacitySettings', JSON.stringify({
      surface: 20,
      codeBlock: 90,
    }));
  });

  await page.goto('/');
  await showGenericTool(page);
  const toolHeader = page.locator('.message.assistant .task-header');
  await expect(toolHeader).toBeVisible();
  await toolHeader.click();

  const parameterBlock = page.locator('.message.assistant .task-field-content');
  await expect(parameterBlock).toBeVisible();
  expect(await parameterBlock.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgba(18, 18, 18, 0.32)');
});
