// USDT BEP20 payment verification via BscScan.
//
// Flow:
//   1. User pays USDT (BEP20) to our wallet address
//   2. User submits the tx hash on the checkout page
//   3. We call BscScan to verify:
//      - Transaction exists and succeeded
//      - Token contract = USDT BEP20 (0x55d398326f99059fF775485246999027B3197955)
//      - Recipient (`to` in the Transfer event) matches our wallet
//      - Amount transferred >= expected (allow 1% tolerance for
//        network fees paid by sender + rounding on amount pickers)
//      - Block confirmed (~15s finality on BSC)
//   4. Mark order paid, trigger fulfillment (out of scope for now)
//
// BscScan API: https://docs.bscscan.com/
// Free tier: 5 req/sec without key. Add BSCSCAN_API_KEY for higher
// limits and less flakiness.

const USDT_BEP20_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
// USDT on BEP20 uses 18 decimals (unlike ERC20 USDT which is 6). Yes,
// this is confusing — Binance issued their USDT peg with 18 decimals.
const USDT_BEP20_DECIMALS = 18;

// ERC20 Transfer event signature — same across all EVM chains
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface VerifyArgs {
  txHash: string;
  expectedRecipient: string;       // our wallet (lowercase)
  expectedAmountUsdt: number;      // dollars, e.g. 40.00
  minTimestampSec?: number;        // optional freshness check (unix seconds)
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;                 // human-readable on failure
  amountReceivedUsdt?: number;
  fromAddress?: string;
  blockTimestamp?: number;
}

interface BscScanResponse<T> {
  jsonrpc?: string;
  id?: number;
  status?: string;
  message?: string;
  result?: T;
}

interface RpcTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: string | null;
  input: string;
}

interface RpcReceipt {
  status: string;                  // "0x1" = success, "0x0" = fail
  transactionHash: string;
  from: string;
  to: string;
  blockNumber: string;
  logs: {
    address: string;
    topics: string[];
    data: string;
  }[];
}

interface RpcBlock {
  timestamp: string;               // hex-encoded unix seconds
}

async function bscscanRpc<T>(params: Record<string, string>): Promise<BscScanResponse<T>> {
  const key = process.env.BSCSCAN_API_KEY;
  const url = new URL("https://api.bscscan.com/api");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (key) url.searchParams.set("apikey", key);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`BscScan HTTP ${res.status}`);
    }
    return (await res.json()) as BscScanResponse<T>;
  } finally {
    clearTimeout(timeout);
  }
}

function hex2num(hex: string): number {
  return parseInt(hex.replace(/^0x/, ""), 16);
}

function hex2bigint(hex: string): bigint {
  return BigInt(hex.startsWith("0x") ? hex : "0x" + hex);
}

// Parse an ERC20 Transfer log: topics = [TRANSFER_TOPIC, from, to], data = value
function parseTransferLog(log: { topics: string[]; data: string }): {
  from: string;
  to: string;
  amountRaw: bigint;
} | null {
  if (log.topics.length < 3 || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return null;
  // Topics are 32-byte hex strings — right-most 20 bytes are the address
  const from = "0x" + log.topics[1]!.slice(-40).toLowerCase();
  const to = "0x" + log.topics[2]!.slice(-40).toLowerCase();
  const amountRaw = hex2bigint(log.data);
  return { from, to, amountRaw };
}

export async function verifyBep20UsdtPayment(args: VerifyArgs): Promise<VerifyResult> {
  const txHash = args.txHash.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return { ok: false, reason: "Transaction hash format is invalid." };
  }
  const expectedRecipient = args.expectedRecipient.trim().toLowerCase();

  // 1. Get the transaction receipt — tells us success/failure + logs.
  let receipt: RpcReceipt | null = null;
  try {
    const resp = await bscscanRpc<RpcReceipt | null>({
      module: "proxy",
      action: "eth_getTransactionReceipt",
      txhash: txHash,
    });
    receipt = resp.result ?? null;
  } catch (e) {
    return {
      ok: false,
      reason: `Couldn't reach BscScan to verify. Try again in a moment. (${e instanceof Error ? e.message : e})`,
    };
  }
  if (!receipt) {
    return {
      ok: false,
      reason: "Transaction not found on-chain yet. Wait ~30s after paying and try again.",
    };
  }
  if (receipt.status !== "0x1") {
    return { ok: false, reason: "Transaction failed on-chain. Please send again." };
  }

  // 2. Find the USDT Transfer log addressed to our wallet.
  let matched: { from: string; to: string; amountRaw: bigint } | null = null;
  for (const log of receipt.logs ?? []) {
    if (log.address.toLowerCase() !== USDT_BEP20_CONTRACT) continue;
    const parsed = parseTransferLog(log);
    if (!parsed) continue;
    if (parsed.to !== expectedRecipient) continue;
    matched = parsed;
    break;
  }
  if (!matched) {
    return {
      ok: false,
      reason:
        "That transaction doesn't contain a USDT (BEP20) transfer to our wallet. Make sure you sent USDT on the BEP20 network to the correct address.",
    };
  }

  // 3. Amount check — 1% tolerance for pickers/rounding.
  const receivedUsdt = Number(matched.amountRaw) / Math.pow(10, USDT_BEP20_DECIMALS);
  const tolerance = 0.99; // allow 1% shortfall
  if (receivedUsdt < args.expectedAmountUsdt * tolerance) {
    return {
      ok: false,
      reason: `Amount received (${receivedUsdt.toFixed(2)} USDT) is less than the required ${args.expectedAmountUsdt.toFixed(2)} USDT.`,
      amountReceivedUsdt: receivedUsdt,
      fromAddress: matched.from,
    };
  }

  // 4. Optional freshness check — get block timestamp.
  let blockTimestamp: number | undefined;
  try {
    const resp = await bscscanRpc<RpcBlock | null>({
      module: "proxy",
      action: "eth_getBlockByNumber",
      tag: receipt.blockNumber,
      boolean: "false",
    });
    if (resp.result?.timestamp) blockTimestamp = hex2num(resp.result.timestamp);
  } catch {
    // Non-fatal — freshness is best-effort.
  }
  if (args.minTimestampSec && blockTimestamp && blockTimestamp < args.minTimestampSec) {
    return {
      ok: false,
      reason:
        "This transaction is older than the order. Please make a fresh payment for this order.",
      amountReceivedUsdt: receivedUsdt,
      fromAddress: matched.from,
      blockTimestamp,
    };
  }

  return {
    ok: true,
    amountReceivedUsdt: receivedUsdt,
    fromAddress: matched.from,
    blockTimestamp,
  };
}

// Also useful for the raw-tx-shape debug flow.
export async function fetchTxSummary(txHash: string): Promise<RpcTx | null> {
  const resp = await bscscanRpc<RpcTx | null>({
    module: "proxy",
    action: "eth_getTransactionByHash",
    txhash: txHash,
  });
  return resp.result ?? null;
}
