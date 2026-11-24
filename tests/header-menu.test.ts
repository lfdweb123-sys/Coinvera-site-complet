import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LISTED } from '@/lib/plugins';
// Le sous-menu « Plugins » du header doit contenir exactement les plugins du registre : un plugin ajouté à lib/plugins.ts sans l'être au menu fait échouer ce test.
describe('menu Plugins du header', () => {
  const src = readFileSync('components/Site.tsx', 'utf8');
  const block = src.slice(src.indexOf("'/plugins': ["), src.indexOf('};', src.indexOf("'/plugins': [")));
  it.each(LISTED.map(p => [p.name, p.href]))('contient « %s » (%s)', (name, href) => {
    expect(block).toContain(`['${href}', '${name}']`);
  });
});
