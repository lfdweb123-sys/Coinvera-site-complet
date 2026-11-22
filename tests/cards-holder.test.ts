import { beforeEach, describe, expect, it, vi } from 'vitest';
const store: Record<string, any> = {}; const calls: any[] = []; let failAt = '';
vi.mock('@/lib/log', () => ({ warn: () => {}, info: () => {}, error: () => {} }));
vi.mock('@/lib/auth', () => ({ HttpError: class extends Error { constructor(public status: number, public code: string) { super(code); } } }));
vi.mock('@/lib/cards/cryptoinfra', () => ({ ci: async (m: string, p: string, o: any) => { calls.push({ m, p, body: o?.body }); if (failAt === p) throw Object.assign(new Error('unauthorized'), { code: 'unauthorized' }); return { status: 201, data: {} }; } }));
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: (path: string) => ({
  get: async () => ({ exists: path in store, data: () => store[path] }),
  create: async (d: any) => { if (path in store) throw new Error('exists'); if (JSON.stringify(d, (_k, v) => (v === undefined ? '__undef__' : v)).includes('__undef__')) throw new Error('undefined value'); store[path] = d; },
  update: async (d: any) => { store[path] = { ...store[path], ...d }; } }) } }));
import { registerHolder, getHolder } from '@/lib/cards/holder';
const ID = { firstName: 'Jean', lastName: 'Dupont', dateOfBirth: '1990-05-17', phone: '+22997000000', country: 'BJ', address: '12 rue des Cocotiers', city: 'Cotonou', zipCode: '01BP123', state: 'Littoral' };
beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; calls.length = 0; failAt = ''; });
describe('création du compte carte', () => {
  it('crée l’utilisateur puis le titulaire chez le prestataire avec un identifiant de 9 chiffres', async () => {
    const h = await registerHolder('uid1', 'a@b.co', ID);
    expect(h.registered).toBe(true); expect(calls.map(c => c.p)).toEqual(['/v1/users', '/v1/cards/holders']);
    expect(calls[0].body.external_user_id).toMatch(/^[0-9]{9}$/); expect(calls[1].body).toMatchObject({ user_id: calls[0].body.external_user_id, email: 'a@b.co', first_name: 'Jean', last_name: 'Dupont', phone: '+22997000000', date_of_birth: '1990-05-17', country: 'BJ', address: '12 rue des Cocotiers', city: 'Cotonou', zip_code: '01BP123' });
    expect(store['card_holders/uid1'].registered).toBe(true); expect(store[`card_holder_ids/${calls[0].body.external_user_id}`]).toMatchObject({ uid: 'uid1' });
  });
  it('refuse un mineur avant tout appel au prestataire et ne conserve ni adresse, ni téléphone, ni date de naissance', async () => {
    await expect(registerHolder('uid3', 'a@b.co', { ...ID, dateOfBirth: new Date().getUTCFullYear() - 10 + '-01-01' })).rejects.toThrow('underage'); expect(calls.length).toBe(0);
    await registerHolder('uid4', 'a@b.co', ID); const doc = JSON.stringify(store['card_holders/uid4']); for (const v of ['Cocotiers', '22997000000', '1990-05-17', '01BP123']) expect(doc).not.toContain(v);
  });
  it('rejouable : après un échec, la nouvelle tentative garde le même identifiant et ne crée rien en double', async () => {
    failAt = '/v1/cards/holders'; await expect(registerHolder('uid2', 'a@b.co', ID)).rejects.toThrow(); const ext = (await getHolder('uid2'))!.externalId; expect((await getHolder('uid2'))!.registered).toBe(false);
    failAt = ''; calls.length = 0; const h = await registerHolder('uid2', 'a@b.co', ID); expect(h.registered).toBe(true); expect(h.externalId).toBe(ext);
  });
});
