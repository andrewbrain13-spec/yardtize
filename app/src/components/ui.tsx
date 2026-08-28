import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type ButtonSize = "default" | "big";
type ButtonVariant = "primary" | "ghost";

const SIZES: Record<ButtonSize, string> = {
  default: "px-[17px] py-2.5 rounded-[11px] text-[15px]",
  big: "px-[26px] py-3.5 rounded-[13px] text-[16.5px]",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand",
  ghost: "bg-transparent border border-edge text-ink",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "default",
) {
  return [
    "inline-flex items-center justify-center font-semibold",
    "transition-[filter] duration-100 hover:brightness-[1.06]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-mid",
    SIZES[size],
    VARIANTS[variant],
  ].join(" ");
}

export function ButtonLink({
  variant = "primary",
  size = "default",
  className = "",
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <Link className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

export function Badge({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "gold";
}) {
  const tones = {
    brand: "bg-brand-wash-2 text-brand-deep",
    gold: "bg-amber-wash text-amber",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3.5px] text-[11.5px] font-bold whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** A card with the mockup's surface + hairline + soft shadow treatment. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface border border-edge rounded-card shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
}) {
  return (
    <div className="flex-1">
      <div className="text-[11.5px] text-ink-3 font-medium">{label}</div>
      <div className="text-[21px] font-bold tracking-[-0.3px] mt-px">{value}</div>
      <div className="text-[11.5px] text-ink-2">{sub}</div>
    </div>
  );
}
