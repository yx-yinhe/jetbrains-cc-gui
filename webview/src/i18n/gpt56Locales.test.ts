import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ptBR from './locales/pt-BR.json';
import ru from './locales/ru.json';
import zhTW from './locales/zh-TW.json';
import zh from './locales/zh.json';

const LOCALES = { en, es, fr, hi, ja, ko, 'pt-BR': ptBR, ru, 'zh-TW': zhTW, zh };

describe.each(Object.entries(LOCALES))('GPT-5.6 locale coverage: %s', (_locale, messages) => {
  it('includes all model descriptions and highest reasoning levels', () => {
    expect(messages.models.codex.gpt56sol.description).toBeTruthy();
    expect(messages.models.codex.gpt56terra.description).toBeTruthy();
    expect(messages.models.codex.gpt56luna.description).toBeTruthy();
    expect(messages.reasoning.max.label).toBeTruthy();
    expect(messages.reasoning.max.description).toBeTruthy();
    expect(messages.reasoning.ultra.label).toBeTruthy();
    expect(messages.reasoning.ultra.description).toBeTruthy();
  });
});
