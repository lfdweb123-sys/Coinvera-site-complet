import { Cur } from './cryptos';
import { info, warn } from './log';
export type Hit = { txid: string; amount: bigint; ts: number; confirmed: boolean };
const T = 12_000;
async function j(url: string, init?: RequestInit) { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(T), cache: 'no-store' }); if (!r.ok) throw new Error('http_' + r.status); return r.json(); }
async function rpc(url: string, method: string, params: any[]) { const r = await j(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); if (r.error) throw new Error('rpc_' + (r.error.message ?? '')); return r.result; }
const TRON = () => process.env.TRON_API ?? 'https://api.trongrid.io';
const tronH = (): Record<string, string> => (process.env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } : {});
const RPC = (c: Cur) => c.evm === 'bsc' ? process.env.RPC_BSC ?? 'https://bsc-dataseed.binance.org' : c.evm === 'polygon' ? process.env.RPC_POLYGON ?? 'https://polygon-bor-rpc.publicnode.com' : process.env.RPC_ETH ?? 'https://ethereum-rpc.publicnode.com';
const SOL = () => process.env.RPC_SOL ?? 'https://api.mainnet-beta.solana.com';
const ESPLORA = (c: Cur) => c.chain === 'ltc' ? process.env.LTC_API ?? 'https://litecoinspace.org/api' : process.env.BTC_API ?? 'https://blockstream.info/api';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Transferts entrants recents vers l'adresse (depuis sinceMs). Native EVM : non scannable (voir verifyEvmNative).
export async function scanIncoming(c: Cur, address: string, sinceMs: number): Promise<Hit[]> {
  const t0 = Date.now();
  try {
    let hits: Hit[] = [];
    if (c.chain === 'tron') {
      if (c.token) { const r = await j(`${TRON()}/v1/accounts/${address}/transactions/trc20?only_to=true&limit=100&contract_address=${c.token}&min_timestamp=${sinceMs}`, { headers: tronH() });
        hits = (r.data ?? []).filter((x: any) => x.to === address).map((x: any) => ({ txid: x.transaction_id, amount: BigInt(x.value), ts: x.block_timestamp, confirmed: true })); }
      else { const r = await j(`${TRON()}/v1/accounts/${address}/transactions?only_to=true&limit=100&min_timestamp=${sinceMs}`, { headers: tronH() });
        hits = (r.data ?? []).filter((x: any) => x.ret?.[0]?.contractRet === 'SUCCESS' && x.raw_data?.contract?.[0]?.type === 'TransferContract').map((x: any) => ({ txid: x.txID, amount: BigInt(x.raw_data.contract[0].parameter.value.amount), ts: x.block_timestamp, confirmed: true })); }
    } else if (c.chain === 'btc' || c.chain === 'ltc') {
      const r = await j(`${ESPLORA(c)}/address/${address}/txs`);
      hits = r.map((x: any) => ({ txid: x.txid, amount: BigInt(x.vout.filter((o: any) => o.scriptpubkey_address === address).reduce((a: number, o: any) => a + o.value, 0)), ts: (x.status?.block_time ?? Math.floor(Date.now() / 1000)) * 1000, confirmed: !!x.status?.confirmed })).filter((h: Hit) => h.amount > 0n && h.ts >= sinceMs - 3_600_000);
    } else if (c.chain === 'evm' && c.token) {
      const u = RPC(c); const latest = parseInt(await rpc(u, 'eth_blockNumber', []), 16); const bt = c.evm === 'bsc' ? 3 : c.evm === 'polygon' ? 2 : 12;
      const blocks = Math.min(4000, Math.ceil((Date.now() - sinceMs) / 1000 / bt) + 30); const to = '0x' + address.slice(2).toLowerCase().padStart(64, '0');
      const logs = await rpc(u, 'eth_getLogs', [{ fromBlock: '0x' + (latest - blocks).toString(16), toBlock: 'latest', address: c.token, topics: [TRANSFER, null, to] }]);
      hits = logs.map((l: any) => ({ txid: l.transactionHash, amount: BigInt(l.data), ts: Date.now(), confirmed: true }));
    } else if (c.chain === 'sol') {
      const u = SOL(); const keys: string[] = [];
      if (c.token) { const ta = await rpc(u, 'getTokenAccountsByOwner', [address, { mint: c.token }, { encoding: 'jsonParsed' }]); (ta.value ?? []).forEach((v: any) => keys.push(v.pubkey)); } else keys.push(address);
      const seen = new Set<string>();
      for (const k of keys) { const sigs = await rpc(u, 'getSignaturesForAddress', [k, { limit: 25, commitment: 'confirmed' }]);
        for (const s of sigs) { if (s.err || seen.has(s.signature) || (s.blockTime && s.blockTime * 1000 < sinceMs - 120_000)) continue; seen.add(s.signature);
          const tx = await rpc(u, 'getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]); if (!tx || tx.meta?.err) continue; let delta = 0n;
          if (c.token) { const g = (arr: any[]) => BigInt(arr?.find((b: any) => b.owner === address && b.mint === c.token)?.uiTokenAmount?.amount ?? '0'); delta = g(tx.meta.postTokenBalances) - g(tx.meta.preTokenBalances); }
          else { const i = tx.transaction.message.accountKeys.findIndex((a: any) => (a.pubkey ?? a) === address); if (i >= 0) delta = BigInt(tx.meta.postBalances[i]) - BigInt(tx.meta.preBalances[i]); }
          if (delta > 0n) hits.push({ txid: s.signature, amount: delta, ts: (tx.blockTime ?? s.blockTime ?? 0) * 1000, confirmed: true }); } }
    } else return [];
    info('chain.scan', { cur: c.id, hits: hits.length, ms: Date.now() - t0 }); return hits;
  } catch (e) { warn('chain.scan_failed', { cur: c.id, message: (e as Error).message, ms: Date.now() - t0 }); throw e; }
}
// ETH / BNB natifs : verification directe d'un hash fourni (aucun index d'adresse n'existe sans service tiers).
export async function verifyEvmNative(c: Cur, txid: string, address: string): Promise<Hit | null> {
  const u = RPC(c); const tx = await rpc(u, 'eth_getTransactionByHash', [txid]); if (!tx || !tx.to || tx.to.toLowerCase() !== address.toLowerCase()) return null;
  const rc = await rpc(u, 'eth_getTransactionReceipt', [txid]); if (!rc || rc.status !== '0x1') return null;
  const blk = await rpc(u, 'eth_getBlockByNumber', [rc.blockNumber, false]);
  return { txid, amount: BigInt(tx.value), ts: parseInt(blk.timestamp, 16) * 1000, confirmed: true };
}
