import { redirect } from "next/navigation";

// Kept as a real route so old bookmarks / marketing emails still work,
// but the actual auth UX lives in the global AuthModal (see
// web/components/AuthModal.tsx). We just bounce to `/?auth=signin`
// which opens the same modal.

export const metadata = {
  title: "Sign in — DecodeCreator",
  description:
    "Sign in to DecodeCreator to unlock the full analytics report for any public Instagram, TikTok, or YouTube account.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextParam = next ? `&next=${encodeURIComponent(next)}` : "";
  redirect(`/?auth=signin${nextParam}`);
}
