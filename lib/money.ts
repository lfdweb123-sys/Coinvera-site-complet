// Montants en entiers : 1 USD = 1_000_000 unites. Jamais de flottants dans la comptabilite.
export const SCALE = 1_000_000;
export const toUnits = (n: number | string) => Math.round(Number(n) * SCALE);
export const fromUnits = (u: number) => (u / SCALE).toFixed(6);
export const bps = (u: number, b: number) => Math.floor((u * b) / 10000);
