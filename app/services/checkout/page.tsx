import type { Metadata } from "next";
import { CheckoutPage } from "@/web/components/services/CheckoutPage";

export const metadata: Metadata = {
  title: "Checkout — Growth Services | DecodeCreator",
  description: "Complete your growth service order with guest checkout.",
  robots: { index: false, follow: false },
};

export default function Checkout() {
  return <CheckoutPage />;
}
