import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const transparentOverridesCss = readFileSync(
  resolve(process.cwd(), 'src/components/ChatInputBox/styles/transparent-overrides.css'),
  'utf8',
);

describe('ChatInputBox typography', () => {
  it('applies content font settings to the editable input selector', () => {
    expect(transparentOverridesCss).toMatch(
      /\.input-editable\s*\{[^}]*font-size:\s*var\(--cc-gui-content-font-size, 14px\);[^}]*line-height:\s*var\(--cc-gui-content-line-height, 1\.5\);[^}]*\}/s,
    );
    expect(transparentOverridesCss).not.toMatch(/\.text-input\s*\{/);
  });
});
