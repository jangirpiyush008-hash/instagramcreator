// Iframe-safe layout: strips our normal header/footer so embedded widgets
// render clean in a customer's own page. Same fonts/tokens still apply.

export const metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="p-4">{children}</main>
    </div>
  );
}
