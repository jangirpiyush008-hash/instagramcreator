import type { Metadata } from "next";
import { ServicesCatalog } from "@/web/components/services/ServicesCatalog";

// noindex + nofollow — the SMM vertical is intentionally hidden from
// search engines to keep it from being associated with the main
// DecodeCreator analytics brand in Google's index. Direct-link
// customers only.
export const metadata: Metadata = {
  title: "Growth Services",
  description: "Growth services.",
  robots: { index: false, follow: false, nocache: true },
};

export default function ServicesPage() {
  return <ServicesCatalog />;
}
