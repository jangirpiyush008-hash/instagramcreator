import { redirect } from "next/navigation";

// Same story as /login — kept as a route so old links survive but the
// UX lives in the global AuthModal. Bounces to /?auth=signup.

export const metadata = {
  title: "Create account — DecodeCreator",
  description:
    "Create your free DecodeCreator account to unlock the full analytics report on any public Instagram, TikTok, or YouTube account.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextParam = next ? `&next=${encodeURIComponent(next)}` : "";
  redirect(`/?auth=signup${nextParam}`);
}
