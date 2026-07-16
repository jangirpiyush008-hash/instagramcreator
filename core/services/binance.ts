import crypto from "node:crypto";

// Binance API client for verifying USDT deposits.
//
// Catches two cases the block-explorer verifier misses:
//   1. Internal Binance-to-Binance transfers ("Off-chain Transfer")
//      that don't touch the blockchain at all
//   2. On-chain deposits where the customer withdrew from Binance —
//      Binance's records are faster than block explorer indexing
//      (their deposit shows within 30s vs 1-2 min for BscScan)
//
// Uses the sapi/v1/capital/deposit/hisrec endpoint. Read-only,
// deposit history only — the API key only needs "Enable Reading"
// permission, no withdrawal or trading capability.
//
// Auth: query is signed with HMAC-SHA256(secret) over the query
// string. API key goes in the X-MBX-APIKEY header. Standard
// Binance signed-endpoint pattern.

const BASE_URL = "https://api.binance.com";

// Binance's transferType field: 0 = external (on-chain), 1 = internal.
// Status: 1 = success. Other values = pending or credited but locked.
interface DepositRecord {
  amount: string;             // e.g. "0.10000000"
  coin: string;               // "USDT"
  network: string;            // "BSC" | "ETH" | "MATIC" | "TRX" | ...
  address: string;            // recipient address (our wallet)
  addressTag?: string;
  txId: string;               // on-chain hash OR "Internal transfer XXXXX"
  insertTime: number;         // ms timestamp
  transferType: 0 | 1;        // 0 external, 1 internal
  status: 0 | 1 | 6 | 7 | 8;  // 1 = success (only status we accept)
}

export interface BinanceVerifyArgs {
  expectedRecipient: string;  // our wallet, lowercase 0x…
  expectedAmountUsdt: number; // e.g. 0.10
  createdAtSec: number;       // order created_at unix seconds
  // Optional: the user's tx hash. If provided we match on it too
  // (belt-and-suspenders); if not, we match on amount+time+recipient.
  txHash?: string;
}

export interface BinanceVerifyResult {
  ok: boolean;
  reason?: string;
  amountReceivedUsdt?: number;
  network?: string;
  txId?: string;
  transferType?: "onchain" | "internal";
  insertTimeMs?: number;
}

const AMOUNT_TOLERANCE = 0.05; // 5% shortfall accepted

export async function verifyBinanceDeposit(
  args: BinanceVerifyArgs,
): Promise<BinanceVerifyResult> {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    return { ok: false, reason: "Binance API not configured (BINANCE_API_KEY / BINANCE_API_SECRET missing)." };
  }

  // Search window: order_created − 7 days back, up to now. Deliberately
  // generous so a customer can pay from Binance BEFORE placing the
  // order (a common flow — "I already sent it, here's my proof")
  // without our search missing the deposit. Dedup on Binance txId
  // stops the same deposit from unlocking two orders.
  const startTimeMs = (args.createdAtSec - 7 * 24 * 60 * 60) * 1000;
  const endTimeMs = Date.now();

  const params = new URLSearchParams({
    coin: "USDT",
    startTime: String(startTimeMs),
    endTime: String(endTimeMs),
    recvWindow: "10000",
    timestamp: String(Date.now()),
  });
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(params.toString())
    .digest("hex");
  params.set("signature", signature);

  let deposits: DepositRecord[];
  try {
    const res = await fetch(`${BASE_URL}/sapi/v1/capital/deposit/hisrec?${params}`, {
      headers: { "X-MBX-APIKEY": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `Binance API error ${res.status}: ${bodyText.slice(0, 200)}`,
      };
    }
    deposits = (await res.json()) as DepositRecord[];
  } catch (e) {
    return {
      ok: false,
      reason: `Couldn't reach Binance: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  if (!Array.isArray(deposits) || deposits.length === 0) {
    return {
      ok: false,
      reason: "No USDT deposits found in Binance for this time window.",
    };
  }

  // Match logic:
  //   1. Recipient address matches (case-insensitive)
  //   2. Amount within tolerance
  //   3. Status = 1 (success)
  //   4. If txHash provided, prefer that match; otherwise take the
  //      first matching amount+recipient in the window.
  const expectedRecipient = args.expectedRecipient.trim().toLowerCase();
  const minAcceptable = args.expectedAmountUsdt * (1 - AMOUNT_TOLERANCE);
  const providedTx = args.txHash?.trim().toLowerCase();

  const candidates = deposits.filter((d) => {
    if (d.status !== 1) return false;
    if (d.address.toLowerCase() !== expectedRecipient) return false;
    const amt = Number(d.amount);
    if (!Number.isFinite(amt) || amt < minAcceptable) return false;
    return true;
  });

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: `Found ${deposits.length} recent USDT deposit(s) but none matched (recipient ${expectedRecipient.slice(0, 10)}… / amount ≥ ${minAcceptable.toFixed(4)}). Deposit may still be pending — retry in ~60s.`,
    };
  }

  // If user gave a txHash, prefer matches on that. Otherwise take the
  // most recent candidate (Binance orders by insertTime desc typically).
  const preferred =
    (providedTx &&
      candidates.find((d) => d.txId.toLowerCase().includes(providedTx))) ||
    candidates[0]!;

  return {
    ok: true,
    amountReceivedUsdt: Number(preferred.amount),
    network: preferred.network,
    txId: preferred.txId,
    transferType: preferred.transferType === 1 ? "internal" : "onchain",
    insertTimeMs: preferred.insertTime,
  };
}
