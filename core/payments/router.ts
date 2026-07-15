import type { PaymentProvider } from "./provider";
import { RazorpayProvider } from "./razorpay";
import { LemonSqueezyProvider } from "./lemonsqueezy";
import type { Region } from "../types";

// Provider selection order:
//   1. Explicit override: PAYMENT_PROVIDER=razorpay | lemonsqueezy
//   2. Region-based: IN → Razorpay, GLOBAL → LemonSqueezy
//   3. Availability fallback: if the region's default provider is not
//      configured (env vars missing), fall back to whichever one IS
//      configured. Prevents the "LemonSqueezy store id missing" screen
//      that GLOBAL users hit when only Razorpay is set up — which is
//      the case today (LemonSqueezy has never been onboarded).
//
// The availability fallback is critical because we CAN'T reliably
// detect region behind Railway — Railway doesn't stamp
// x-vercel-ip-country / cf-ipcountry / x-country headers, so
// regionFromHeaders returns GLOBAL for everyone including Indian
// customers. Without this fallback, every non-Cloudflare visitor
// gets routed to a LemonSqueezy checkout that instantly errors.
function razorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function lemonSqueezyConfigured(): boolean {
  return !!(
    process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID
  );
}

export function providerForRegion(region: Region): PaymentProvider {
  // 1. Explicit override wins over everything.
  const override = process.env.PAYMENT_PROVIDER?.toLowerCase();
  if (override === "razorpay") return new RazorpayProvider();
  if (override === "lemonsqueezy") return new LemonSqueezyProvider();

  // 2. Region-based selection with availability fallback.
  const preferRazorpay = region === "IN";
  const rpReady = razorpayConfigured();
  const lsReady = lemonSqueezyConfigured();

  if (preferRazorpay) {
    if (rpReady) return new RazorpayProvider();
    if (lsReady) return new LemonSqueezyProvider();
  } else {
    if (lsReady) return new LemonSqueezyProvider();
    if (rpReady) return new RazorpayProvider();
  }

  // Neither configured — return the region's default so the resulting
  // error mentions the provider you'd actually need to configure.
  return preferRazorpay ? new RazorpayProvider() : new LemonSqueezyProvider();
}

export function providerByName(name: string): PaymentProvider {
  if (name === "razorpay") return new RazorpayProvider();
  if (name === "lemonsqueezy") return new LemonSqueezyProvider();
  throw new Error(`Unknown payment provider: ${name}`);
}
