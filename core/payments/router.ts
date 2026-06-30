import type { PaymentProvider } from "./provider";
import { RazorpayProvider } from "./razorpay";
import { LemonSqueezyProvider } from "./lemonsqueezy";
import type { Region } from "../types";

export function providerForRegion(region: Region): PaymentProvider {
  return region === "IN" ? new RazorpayProvider() : new LemonSqueezyProvider();
}

export function providerByName(name: string): PaymentProvider {
  if (name === "razorpay") return new RazorpayProvider();
  if (name === "lemonsqueezy") return new LemonSqueezyProvider();
  throw new Error(`Unknown payment provider: ${name}`);
}
