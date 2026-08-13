"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClass } from "./ui";

const LINKS = [
  { href: "/", label: "How it works" },
  { href: "/list", label: "List your yard" },
  { href: "/browse", label: "For businesses" },
];

export function Nav({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-[26px] px-[26px] h-[58px] bg-surface/92 backdrop-blur-lg border-b border-hairline">
      <Link
        href="/"
        className="flex items-center gap-[9px] text-[19px] font-extrabold tracking-[-0.2px] select-none"
      >
        <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-brand-mid to-brand-deep text-white text-[15px] font-extrabold">
          Y
        </span>
        Yardtize
      </Link>

      <div className="hidden md:flex gap-1 ml-2">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`px-[13px] py-2 rounded-[9px] font-medium transition-colors ${
                active
                  ? "bg-brand-wash-2 text-brand-deep"
                  : "text-ink-2 hover:bg-brand-wash hover:text-ink"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <div className="flex-1" />

      <Link href={signedIn ? "/dashboard" : "/sign-in"} className={buttonClass("ghost")}>
        {signedIn ? "Your account" : "Sign in"}
      </Link>
    </nav>
  );
}
