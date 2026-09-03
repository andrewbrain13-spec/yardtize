"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "./ui";

const LINKS = [
  { href: "/", label: "How it works" },
  { href: "/worth", label: "What's it worth?" },
  { href: "/list", label: "List your yard" },
  { href: "/browse", label: "For businesses" },
];

export function Nav({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname();
  /*
   * The menu remembers which page it was opened on, so navigating away closes
   * it for free — no effect syncing state to the route.
   */
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  const linkClass = (href: string) =>
    pathname === href
      ? "bg-brand-wash-2 text-brand-deep"
      : "text-ink-2 hover:bg-brand-wash hover:text-ink";

  return (
    <nav className="sticky top-0 z-50 bg-surface/92 backdrop-blur-lg border-b border-hairline">
      <div className="flex items-center gap-[26px] px-[26px] h-[58px]">
        <Link
          href="/"
          className="flex items-center gap-[9px] text-[19px] font-extrabold tracking-[-0.2px] select-none"
        >
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-brand-mid to-brand-deep text-on-brand text-[15px] font-extrabold">
            Y
          </span>
          Yardtize
        </Link>

        <div className="hidden md:flex gap-1 ml-2">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={`px-[13px] py-2 rounded-[9px] font-medium transition-colors ${linkClass(href)}`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex-1" />

        <Link
          href={signedIn ? "/dashboard" : "/sign-in"}
          className={`${buttonClass("ghost")} max-sm:px-3`}
        >
          {signedIn ? "Your account" : "Sign in"}
        </Link>

        {/* Below md the links above are hidden, so without this there is no way
            to reach them from any page but the landing hero. */}
        <button
          type="button"
          onClick={() => setOpenFor(open ? null : pathname)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className="md:hidden grid place-items-center w-[38px] h-[38px] rounded-[10px] border border-edge text-ink"
        >
          <span aria-hidden="true" className="text-[17px] leading-none">
            {open ? "✕" : "☰"}
          </span>
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="md:hidden border-t border-hairline px-[18px] py-2.5 flex flex-col">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={`px-3.5 py-3 rounded-[10px] font-medium ${linkClass(href)}`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
