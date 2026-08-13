import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yardtize — Your yard is prime ad space",
  description:
    "Yardtize matches high-traffic yards with local businesses and campaigns. Placements are priced with official state traffic data and screened against your city's sign code.",
  // Pre-launch: keep the demo out of search results until Andrew is ready.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
