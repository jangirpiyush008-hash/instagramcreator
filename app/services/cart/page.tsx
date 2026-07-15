import type { Metadata } from "next";
import { CartPage } from "@/web/components/services/CartPage";

export const metadata: Metadata = {
  title: "Your Cart — Growth Services | DecodeCreator",
  description: "Review your growth service order before checkout.",
  robots: { index: false, follow: false },
};

export default function Cart() {
  return <CartPage />;
}
