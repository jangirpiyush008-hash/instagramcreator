// USDT payment verification across EVM chains.
//
// User pays USDT to our wallet, submits the tx hash, we verify it on
// the CORRECT chain automatically:
//   - BSC (BEP20)  → BscScan API
//   - Ethereum     → Etherscan API
//   - Polygon      → Polygonscan API
//
// Same 0x... wallet address works on all three (all EVM). We try each
// chain's API in parallel; whichever chain has the tx is the one we
// verify against. Different chains have different USDT contracts and
// decimals, so we config that per-chain.
//
// Tron (TRC20) uses a completely different address format (T…) and API
// so it's excluded — user's configured wallet is 0x… (EVM only).
//
// Amount tolerance: 5% shortfall accepted. Real crypto transactions
// eat into the amount via bridge fees, wrapped-USDT quirks, or
// exchange withdrawal deductions. Being too strict rejects legit
// payments — a 5% band covers realistic edge cases without letting
// scammers pay 50% and claim full order.

// ── Chain config ────────────────────────────────────────────────────────

export type EvmChain = "bsc" | "ethereum" | "polygon";

interface ChainConfig {
  name: string;
  apiHost: string;
  usdtContract: string;       // lowercase
  usdtDecimals: number;
  explorerHost: string;       // for tx links in responses
  apiKeyEnv: string;
}

const CHAINS: Record<EvmChain, ChainConfig> = {
  bsc: {
    name: "BNB Smart Chain (BEP20)",
    apiHost: "https://api.bscscan.com",
    usdtContract: "0x55d398326f99059ff775485246999027b3197955",
    usdtDecimals: 18,
    explorerHost: "https://bscscan.com",
    apiKeyEnv: "BSCSCAN_API_KEY",
  },
  ethereum: {
    name: "Ethereum (ERC20)",
    apiHost: "https://api.etherscan.io",
    usdtContract: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    usdtDecimals: 6,
    explorerHost: "https://etherscan.io",
    apiKeyEnv: "ETHERSCAN_API_KEY",
  },
  polygon: {
    name: "Polygon (USDT.e / ERC20)",
    apiHost: "https://api.polygonscan.com",
    usdtContract: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    usdtDecimals: 6,
    explorerHost: "https://polygonscan.com",
    apiKeyEnv: "POLYGONSCAN_API_KEY",
  },
};

// Standard ERC20 Transfer event topic — identical across all EVM chains.
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Shortfall tolerance — accept amounts >= expected × (1 - tolerance).
const AMOUNT_TOLERANCE = 0.05; // 5%

// ── Public types ────────────────────────────────────────────────────────

export interface VerifyArgs {
  txHash: string;
  expectedRecipient: string;       // our wallet (lowercase)
  expectedAmountUsdt: number;      // e.g. 40.00
  minTimestampSec?: number;        // optional freshness check
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  chain?: EvmChain;
  amountReceivedUsdt?: number;
  fromAddress?: string;
  blockTimestamp?: number;
  explorerUrl?: string;
}

// ── Etherscan-style RPC types (identical across BscScan/Etherscan/Polygonscan) ──

interface EtherscanRpcResponse<T> {
  jsonrpc?: string;
  id?: number;
  result?: T;
  error?: { message?: string; code?: number };
}

interface RpcReceipt {
  status: string;                  // "0x1" = success
  transactionHash: string;
  from: string;
  to: string;
  blockNumber: string;
  logs: { address: string; topics: string[]; data: string }[];
}

interface RpcBlock {
  timestamp: string;
}

// ── Low-level helpers ───────────────────────────────────────────────────

async function chainRpc<T>(
  chain: ChainConfig,
  params: Record<string, string>,
  timeoutMs = 8000,
): Promise<EtherscanRpcResponse<T>> {
  const key = process.env[chain.apiKeyEnv];
  const url = new URL(`${chain.apiHost}/api`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (key) url.searchParams.set("apikey", key);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: ac.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${chain.name}: HTTP ${res.status}`);
    return (await res.json()) as EtherscanRpcResponse<T>;
  } finally {
    clearTimeout(t);
  }
}

function hex2num(hex: string): number {
  return parseInt(hex.replace(/^0x/, ""), 16);
}
function hex2bigint(hex: string): bigint {
  return BigInt(hex.startsWith("0x") ? hex : "0x" + hex);
}

// Parse an ERC20 Transfer log — same event signature on every EVM chain.
function parseTransferLog(log: { topics: string[]; data: string }): {
  from: string;
  to: string;
  amountRaw: bigint;
} | null {
  if (log.topics.length < 3 || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return null;
  const from = "0x" + log.topics[1]!.slice(-40).toLowerCase();
  const to = "0x" + log.topics[2]!.slice(-40).toLowerCase();
  const amountRaw = hex2bigint(log.data);
  return { from, to, amountRaw };
}

// Fetch receipt from a single chain. Returns null if the tx isn't on
// this chain (which is the expected happy-path for 2 of 3 chains when
// the user paid on one specific chain).
async function fetchReceipt(chain: ChainConfig, txHash: string): Promise<RpcReceipt | null> {
  try {
    const resp = await chainRpc<RpcReceipt | null>(chain, {
      module: "proxy",
      action: "eth_getTransactionReceipt",
      txhash: txHash,
    });
    return resp.result ?? null;
  } catch (e) {
    // Explorer down / rate limited — treat as "not on this chain" so
    // we still try the others. If ALL fail, the caller reports a
    // generic "not found" message.
    console.warn(`[payment] ${chain.name} receipt lookup failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// Fetch block timestamp for freshness check (best-effort).
async function fetchBlockTimestamp(chain: ChainConfig, blockNumber: string): Promise<number | undefined> {
  try {
    const resp = await chainRpc<RpcBlock | null>(chain, {
      module: "proxy",
      action: "eth_getBlockByNumber",
      tag: blockNumber,
      boolean: "false",
    });
    if (resp.result?.timestamp) return hex2num(resp.result.timestamp);
  } catch {
    // best-effort
  }
  return undefined;
}

// ── The verify function ────────────────────────────────────────────────

export async function verifyUsdtPayment(args: VerifyArgs): Promise<VerifyResult> {
  const txHash = args.txHash.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return { ok: false, reason: "Transaction hash format is invalid (expected 66-char 0x… string)." };
  }
  const expectedRecipient = args.expectedRecipient.trim().toLowerCase();

  // Try all three chains in parallel — whichever has the tx wins.
  // 2 of 3 will return null (tx doesn't exist on those chains). One
  // returns the receipt. Cost: 3 API calls total per verify — cheap.
  const chainOrder: EvmChain[] = ["bsc", "ethereum", "polygon"];
  const receiptResults = await Promise.all(
    chainOrder.map(async (c) => {
      const cfg = CHAINS[c];
      const receipt = await fetchReceipt(cfg, txHash);
      return { chain: c, cfg, receipt };
    }),
  );

  const hit = receiptResults.find((r) => r.receipt !== null);
  if (!hit || !hit.receipt) {
    return {
      ok: false,
      reason:
        "Transaction not found on BSC, Ethereum, or Polygon yet. Wait ~30–60 seconds after paying and try again. If you paid on a different chain (Tron, Solana, etc.) it's not supported yet — please contact support.",
    };
  }

  const { cfg, receipt, chain } = hit;

  if (receipt.status !== "0x1") {
    return {
      ok: false,
      reason: `Transaction failed on-chain (${cfg.name}). Please send again.`,
      chain,
      explorerUrl: `${cfg.explorerHost}/tx/${txHash}`,
    };
  }

  // Find the USDT Transfer log addressed to our wallet on the
  // matching chain's contract address.
  let matched: { from: string; to: string; amountRaw: bigint } | null = null;
  for (const log of receipt.logs ?? []) {
    if (log.address.toLowerCase() !== cfg.usdtContract) continue;
    const parsed = parseTransferLog(log);
    if (!parsed) continue;
    if (parsed.to !== expectedRecipient) continue;
    matched = parsed;
    break;
  }
  if (!matched) {
    return {
      ok: false,
      reason: `Transaction found on ${cfg.name} but it doesn't contain a USDT transfer to our wallet. Make sure you sent USDT (not another token) to the correct address on ${cfg.name}.`,
      chain,
      explorerUrl: `${cfg.explorerHost}/tx/${txHash}`,
    };
  }

  const receivedUsdt = Number(matched.amountRaw) / Math.pow(10, cfg.usdtDecimals);
  const minAcceptable = args.expectedAmountUsdt * (1 - AMOUNT_TOLERANCE);
  if (receivedUsdt < minAcceptable) {
    return {
      ok: false,
      reason: `Amount received (${receivedUsdt.toFixed(4)} USDT) is less than the required ${args.expectedAmountUsdt.toFixed(2)} USDT (5% tolerance allowed).`,
      chain,
      amountReceivedUsdt: receivedUsdt,
      fromAddress: matched.from,
      explorerUrl: `${cfg.explorerHost}/tx/${txHash}`,
    };
  }

  // Freshness check — only rejects blatantly old txs (e.g. someone
  // trying to reuse a payment they made a week ago for a new order).
  // 24h grace window backward — real payments almost always confirm
  // within minutes but we forgive slow ones.
  let blockTimestamp: number | undefined;
  if (args.minTimestampSec) {
    blockTimestamp = await fetchBlockTimestamp(cfg, receipt.blockNumber);
    const graceSec = 24 * 60 * 60;
    if (blockTimestamp && blockTimestamp + graceSec < args.minTimestampSec) {
      return {
        ok: false,
        reason: "This transaction is more than 24 hours older than the order. Please make a fresh payment.",
        chain,
        amountReceivedUsdt: receivedUsdt,
        fromAddress: matched.from,
        blockTimestamp,
        explorerUrl: `${cfg.explorerHost}/tx/${txHash}`,
      };
    }
  }

  return {
    ok: true,
    chain,
    amountReceivedUsdt: receivedUsdt,
    fromAddress: matched.from,
    blockTimestamp,
    explorerUrl: `${cfg.explorerHost}/tx/${txHash}`,
  };
}

// Backwards-compat alias — the verify route imports the old name.
export const verifyBep20UsdtPayment = verifyUsdtPayment;
