import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Not found</h1>
      <p className="text-muted-foreground mt-2">
        That page doesn't exist or the handle isn't valid.
      </p>
      <Link href="/" className="underline mt-6 inline-block">
        Back to home
      </Link>
    </section>
  );
}
