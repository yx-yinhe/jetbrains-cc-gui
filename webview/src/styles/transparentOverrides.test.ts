import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const transparentOverrides = readFileSync(
  resolve(process.cwd(), 'src/styles/less/transparent-overrides.less'),
  'utf8',
);

describe('transparent surface coverage', () => {
  it('connects permission prompts to the configured translucent surfaces', () => {
    expect(transparentOverrides).toMatch(
      /\.permission-dialog-v3\s*\{[^}]*background:\s*var\(--cc-gui-menu-bg,/s,
    );
    expect(transparentOverrides).toMatch(
      /\.permission-dialog-v3-command-box\s*\{[^}]*background:\s*var\(--cc-gui-code-block-bg,/s,
    );
  });

  it('keeps generic tool parameter blocks on the normal-panel-derived code surface', () => {
    expect(transparentOverrides).toMatch(
      /\.task-result,\s*\.task-field-content,\s*\.bash-command-block,[^{]*\{[^}]*background:\s*var\(--cc-gui-code-block-bg,/s,
    );
  });
});
