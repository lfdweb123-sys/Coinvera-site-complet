import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { codeEmail } from '@/lib/mail';
describe('e-mail de code', () => {
  it('contient le code, sans balise style ni script', () => {
    const m = codeEmail({ name: 'Awa <b>', code: '482913', purpose: 'verify' });
    expect(m.html).toContain('482913'); expect(m.html).not.toMatch(/<style|<script|<link/i); expect(m.html).toContain('Awa &lt;b&gt;'); expect(m.subject).toContain('482913');
    writeFileSync('/tmp/mail.html', m.html);
  });
});
