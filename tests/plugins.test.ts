import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DONATIONS, DONATIONS_ZIP, LISTED, PLUGIN_VERSIONS, donationsDownloadUrl, isPluginKey, pluginDownloadUrl, pluginZip, type PluginKey } from '@/lib/plugins';
const root = path.resolve(__dirname, '..');
const PLUGINS: { key: PluginKey; slug: string; cst: string; pfx: string }[] = [
  { key: 'donations', slug: 'coinvera-donations', cst: 'CVD_VERSION', pfx: 'cvd' }, { key: 'invoices', slug: 'coinvera-invoices', cst: 'CVI_VERSION', pfx: 'cvi' },
  { key: 'subscriptions', slug: 'coinvera-subscriptions', cst: 'CVS_VERSION', pfx: 'cvs' }, { key: 'tickets', slug: 'coinvera-tickets', cst: 'CVT_VERSION', pfx: 'cvt' },
  { key: 'guard', slug: 'coinvera-guard', cst: 'CVG_VERSION', pfx: 'cvg' },
  { key: 'reminders', slug: 'coinvera-reminders', cst: 'CVR_VERSION', pfx: 'cvr' },
  { key: 'returns', slug: 'coinvera-returns', cst: 'CVX_VERSION', pfx: 'cvx' },
];
describe('registre des plugins', () => {
  it('connaît exactement les plugins testés ci-dessous', () => { expect(Object.keys(PLUGIN_VERSIONS).sort()).toEqual(PLUGINS.map(p => p.key).sort()); });
  it('valide les clés et construit les URL de téléchargement', () => {
    expect(isPluginKey('tickets')).toBe(true); expect(isPluginKey('woocommerce')).toBe(false); expect(isPluginKey('__proto__')).toBe(false); expect(isPluginKey(undefined)).toBe(false);
    expect(pluginDownloadUrl('https://www.coinvera.me/', 'invoices')).toBe('https://www.coinvera.me/downloads/coinvera-invoices.zip');
    expect(donationsDownloadUrl('https://www.coinvera.me/')).toBe('https://www.coinvera.me' + DONATIONS_ZIP); expect(DONATIONS.version).toBe(PLUGIN_VERSIONS.donations);
  });
  it('liste chaque plugin avec un ZIP cohérent', () => { for (const l of LISTED) if (l.key !== 'woocommerce') expect(l.zip).toBe(pluginZip(l.key as PluginKey)); });
});
describe.each(PLUGINS)('plugin $key', ({ key, slug, cst, pfx }) => {
  const dir = path.join(root, 'plugins', slug); const mainPath = path.join(dir, `${slug}.php`);
  it('la version du site correspond à celle du plugin', () => {
    const main = readFileSync(mainPath, 'utf8'); const v = PLUGIN_VERSIONS[key];
    expect(main).toContain(`* Version: ${v}`); expect(main).toContain(`define('${cst}', '${v}')`);
  });
  it('envoie son nom à l’API de licence (emplacements par plugin)', () => {
    const api = readFileSync(path.join(dir, 'includes', `class-${pfx}-api.php`), 'utf8');
    expect(api).toMatch(new RegExp(`'plugin'\\s*=>\\s*'${key}'`));
  });
  it('l’archive existe et contient le plugin à jour, rien d’autre', () => {
    const zip = path.join(root, 'public', pluginZip(key)); expect(existsSync(zip)).toBe(true);
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(names).toContain(`${slug}/${slug}.php`); expect(names.every(n => n.startsWith(`${slug}/`))).toBe(true);
    expect(names.some(n => /\.DS_Store|\.git|node_modules/.test(n))).toBe(false);
    expect(execFileSync('unzip', ['-p', zip, `${slug}/${slug}.php`], { encoding: 'utf8' })).toBe(readFileSync(mainPath, 'utf8'));
  });
});
