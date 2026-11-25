import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookieOf, HUMAN_COOKIE, humanCookies, humanEnabled, HUMAN_TTL, requireHuman, signHuman, validHuman, verifyTurnstile } from '@/lib/human';
const on = () => { vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-test'); vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-test'); };
afterEach(() => vi.unstubAllEnvs());
const req = (cookie?: string) => new Request('https://x.test/api', { headers: cookie ? { cookie } : {} });
describe('cookie de vérification humaine', () => {
  it('accepte un cookie qu’on vient de signer', () => { on(); expect(validHuman(signHuman())).toBe(true); });
  it('refuse un cookie falsifié, tronqué ou vide', () => {
    on(); const v = signHuman(); const [e, n, s] = v.split('.');
    expect(validHuman(`${Number(e) + 99999}.${n}.${s}`)).toBe(false);   // durée rallongée à la main
    expect(validHuman(`${e}.${n}.${s.slice(0, -1)}0`)).toBe(false); expect(validHuman(`${e}.${n}`)).toBe(false); expect(validHuman('')).toBe(false); expect(validHuman(undefined)).toBe(false);
  });
  it('expire après 12 h', () => { on(); const v = signHuman(1_000_000); expect(validHuman(v, 1_000_000 + (HUMAN_TTL - 5) * 1000)).toBe(true); expect(validHuman(v, 1_000_000 + (HUMAN_TTL + 5) * 1000)).toBe(false); });
  it('est invalide si le secret change', () => { on(); const v = signHuman(); vi.stubEnv('TURNSTILE_SECRET_KEY', 'autre-secret'); expect(validHuman(v)).toBe(false); });
  it('lit le cookie parmi d’autres', () => { expect(cookieOf(req('a=1; cv_human=abc.def; b=2'), HUMAN_COOKIE)).toBe('abc.def'); expect(cookieOf(req(), HUMAN_COOKIE)).toBeUndefined(); });
  it('pose un cookie HttpOnly pour la preuve et un témoin lisible', () => {
    on(); const [proof, flag] = humanCookies(true); expect(proof).toMatch(/HttpOnly/); expect(proof).toMatch(/Secure/); expect(proof).toMatch(/SameSite=Lax/); expect(flag).not.toMatch(/HttpOnly/); expect(flag).toMatch(/^cv_human_ok=1/);
  });
});
describe('activation', () => {
  it('est désactivée sans clés, ou avec une seule des deux', () => {
    expect(humanEnabled()).toBe(false); vi.stubEnv('TURNSTILE_SECRET_KEY', 's'); expect(humanEnabled()).toBe(false);
    vi.unstubAllEnvs(); vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'k'); expect(humanEnabled()).toBe(false); on(); expect(humanEnabled()).toBe(true);
  });
  it('requireHuman ne bloque rien tant que Turnstile n’est pas configuré', () => { expect(() => requireHuman(req())).not.toThrow(); });
  it('requireHuman refuse sans cookie et accepte avec un cookie valide quand Turnstile est configuré', () => {
    on(); expect(() => requireHuman(req())).toThrow(/human_required/); expect(() => requireHuman(req('cv_human=n.o.pe'))).toThrow();
    expect(() => requireHuman(req(`${HUMAN_COOKIE}=${signHuman()}`))).not.toThrow();
  });
});
describe('contrôle auprès de Cloudflare', () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('accepte une réponse success:true et envoie secret, jeton et IP', async () => {
    on(); const f = ok({ success: true }); expect(await verifyTurnstile('tok-123456', '1.2.3.4', f)).toBe(true);
    const body = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as URLSearchParams; expect(body.get('secret')).toBe('secret-test'); expect(body.get('response')).toBe('tok-123456'); expect(body.get('remoteip')).toBe('1.2.3.4');
  });
  it('refuse success:false, une erreur HTTP, une panne réseau et un jeton vide', async () => {
    on(); expect(await verifyTurnstile('tok-123456', 'x', ok({ success: false }))).toBe(false); expect(await verifyTurnstile('tok-123456', 'x', ok({}, 500))).toBe(false);
    expect(await verifyTurnstile('tok-123456', 'x', (async () => { throw new Error('réseau'); }) as unknown as typeof fetch)).toBe(false); expect(await verifyTurnstile('', 'x', ok({ success: true }))).toBe(false);
  });
  it('ne contacte pas Cloudflare sans secret', async () => { const f = ok({ success: true }); expect(await verifyTurnstile('tok-123456', 'x', f)).toBe(false); expect(f).not.toHaveBeenCalled(); });
});
