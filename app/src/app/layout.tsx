import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { getSessionProfile } from "@/lib/supabase/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LAUNCHED } from "./robots";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yardtize — Your yard is prime ad space",
  description:
    "Yardtize matches high-traffic yards with local businesses and campaigns. Placements are priced with official state traffic data and screened against your city's sign code.",
  // Kept in step with robots.ts so the tag and the robots file never disagree.
  robots: LAUNCHED ? { index: true, follow: true } : { index: false, follow: false },
  metadataBase: new URL("https://www.yardtize.com"),
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let signedIn = false;
  try {
    signedIn = Boolean((await getSessionProfile())?.user);
  } catch {
    // Supabase not configured on this deployment — render as a logged-out visitor.
  }

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Nav signedIn={signedIn} />
        <main className="flex-1">{children}</main>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
