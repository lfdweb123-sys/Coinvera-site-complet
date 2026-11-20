import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DONATIONS, DONATIONS_ZIP, donationsDownloadUrl } from '@/lib/plugins';
const root = path.resolve(__dirname, '..');
const main = readFileSync(path.join(root, 'plugins/coinvera-donations/coinvera-donations.php'), 'utf8');
describe('plugin de dons', () => {
  it('la version du site correspond à celle du plugin', () => {
    expect(main).toContain(`* Version: ${DONATIONS.version}`);
    expect(main).toContain(`define('CVD_VERSION', '${DONATIONS.version}')`);
  });
  it('construit une URL de téléchargement propre', () => {
    expect(donationsDownloadUrl('https://www.coinvera.me/')).toBe('https://www.coinvera.me' + DONATIONS_ZIP);
  });
  it('l’archive existe et contient le plugin à jour', () => {
    const zip = path.join(root, 'public', DONATIONS_ZIP);
    expect(existsSync(zip)).toBe(true);
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(names).toContain('coinvera-donations/coinvera-donations.php');
    expect(names.every(n => n.startsWith('coinvera-donations/'))).toBe(true);
    const inZip = execFileSync('unzip', ['-p', zip, 'coinvera-donations/coinvera-donations.php'], { encoding: 'utf8' });
    expect(inZip).toBe(main);
  });
});
