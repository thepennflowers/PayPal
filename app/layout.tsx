import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Penn Flowers | AI-assisted floristry, powered by PayPal",
  description:
    "Order bouquets and flower subscriptions from The Penn Flowers. Chat with our AI concierge, checkout with PayPal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-bloom-100 bg-white/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌸</span>
              <span className="font-semibold text-lg text-bloom-900">
                The Penn Flowers
              </span>
            </div>
            <nav className="text-sm text-leaf-700 flex gap-6">
              <a href="#bouquets" className="hover:text-leaf-600">
                Bouquets
              </a>
              <a href="#subscriptions" className="hover:text-leaf-600">
                Subscriptions
              </a>
              <a href="#florist" className="hover:text-leaf-600">
                Ask our AI florist
              </a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="max-w-5xl mx-auto px-6 py-10 text-xs text-bloom-900/50">
          Demo storefront running in{" "}
          <code>{process.env.USE_MOCK_DATA !== "false" ? "MOCK" : "LIVE"}</code>{" "}
          PayPal mode. See README.md to switch to sandbox/production.
        </footer>
      </body>
    </html>
  );
}
