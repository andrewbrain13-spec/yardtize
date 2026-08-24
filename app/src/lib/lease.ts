/**
 * The placement agreement, as content.
 *
 * ── Why this is a licence and not a lease ──────────────────────────────────
 *
 * Andrew asked for a lease. This is drafted as a *licence* instead, and the
 * distinction is not pedantry: a lease conveys a possessory interest in land,
 * which in Missouri and Kansas drags the arrangement toward landlord–tenant
 * law — notice periods, statutory eviction procedure, habitability and holdover
 * rules written for people living in buildings. A homeowner who wants a sign
 * gone should not have to evict anybody. A licence grants permission to place
 * an object, revocable on the terms written here, which is the instrument
 * billboard and out-of-home site agreements normally use for exactly this
 * reason.
 *
 * That call belongs to the attorney on the punch list, not to me. It is
 * flagged at the top of the document so it is the first thing they see.
 *
 * ── What lives here ────────────────────────────────────────────────────────
 *
 * The terms are frozen onto the lease row when it is generated (migration
 * 0013). A listing's rate can change and a city's rules can be corrected;
 * neither should quietly rewrite a document two people have already signed.
 * Everything below renders from that frozen snapshot.
 */

import { describeDay, describeTerm } from "@/lib/scheduling";
import { formatCents } from "@/lib/billing";

/** Bump when the wording changes, so signed copies stay attributable. */
export const LEASE_VERSION = "2026-08-draft-1";

export type LeaseTerms = {
  version: string;
  generatedAt: string;
  reference: string;
  owner: { name: string; email: string };
  advertiser: { name: string; contact: string; email: string; type: string };
  premises: {
    address: string;
    city: string;
    state: string;
    postalCode: string;
    signLat: number | null;
    signLng: number | null;
    aadt: number | null;
    trafficSource: string | null;
    trafficYear: number | null;
  };
  sign: { sizeLabel: string; sqft: number; install: "self" | "platform" };
  term: { startsOn: string; endsOn: string; isElectionWindow: boolean };
  money: {
    monthlyRateCents: number;
    dueNowCents: number;
    monthlyChargeCents: number;
    ownerTotalCents: number;
    feeTotalCents: number;
    advertiserTotalCents: number;
    depositCents: number;
    /** Charged once when Yardtize does the install. */
    installCents: number;
    /** Every payment, in order. A term is not always a run of equal months. */
    schedule: Array<{ label: string; dueOn: string; amountCents: number }>;
  };
  jurisdiction: {
    name: string;
    state: string;
    verified: boolean;
    maxSqft: number;
    maxHeightFt: number;
    setbackFt: number | null;
    displayPeriodDays: number | null;
    gapDays: number | null;
    citations: string[];
  } | null;
};

export type Clause = { heading: string; paragraphs: string[] };

/** Clauses with their numbers filled in, so a conditional clause can't skew them. */
export const numberedClauses = (t: LeaseTerms): Clause[] =>
  leaseClauses(t).map((c, i) => ({ ...c, heading: `${i + 1}. ${c.heading}` }));

const money = formatCents;

/**
 * How to describe what follows the first payment.
 *
 * The obvious phrasing — "then $X each month" — is wrong whenever the
 * instalments are not equal, which is exactly the case for the election
 * window: one full month and then seventeen prorated days. Saying that
 * prorated figure recurs monthly would misstate the amount on a document
 * somebody signs.
 */
function describeRest(t: LeaseTerms): string {
  const rest = t.money.schedule.slice(1);
  if (rest.length === 0) return "";

  const allEqual = rest.every((r) => r.amountCents === rest[0].amountCents);
  if (allEqual && rest.length > 1) {
    return `, then ${money(rest[0].amountCents)} on the same day of each of the following ${rest.length} months`;
  }
  if (allEqual) {
    return `, then ${money(rest[0].amountCents)} on ${describeDay(rest[0].dueOn)}`;
  }
  return `, then ${rest.length} further payments as scheduled below`;
}

/**
 * The agreement, clause by clause.
 *
 * Written to be read by the two people signing it rather than by a court:
 * short sentences, no defined-term machinery, no "hereinafter". Everything a
 * homeowner would actually worry about — can I make them take it down, who
 * fixes my grass, am I endorsing this — has its own clause and a plain answer.
 */
export function leaseClauses(t: LeaseTerms): Clause[] {
  const address = `${t.premises.address}, ${t.premises.city}, ${t.premises.state} ${t.premises.postalCode}`.trim();
  const self = t.sign.install === "self";
  const j = t.jurisdiction;

  return [
    {
      heading: "The parties",
      paragraphs: [
        `This agreement is between ${t.owner.name || t.owner.email} ("the Property Owner") and ${t.advertiser.name} ("the Advertiser").`,
        `Yardtize is not a party to it. Yardtize introduced the two of you, priced the placement from published state traffic data, screened it against the local sign code, and handles payment. It is not a landlord, a broker of your property, or your lawyer.`,
      ],
    },
    {
      heading: "What is being granted",
      paragraphs: [
        `The Property Owner gives the Advertiser permission to place one sign at ${address}, at the position agreed through Yardtize${t.premises.signLat != null ? ` (approximately ${t.premises.signLat.toFixed(5)}, ${t.premises.signLng?.toFixed(5)})` : ""}, and to enter the property as needed to install, maintain and remove it.`,
        `This is permission to place an object, not a tenancy. The Advertiser gets no possession of the property, no key, no right to exclude anyone, and no interest in the land. Nothing here creates a landlord and tenant relationship, a partnership, or a joint venture.`,
        `One sign. Not one per advertiser — one on the property, for the whole term. That is a Yardtize rule and it is stricter than any city here requires.`,
      ],
    },
    {
      heading: "The sign",
      paragraphs: [
        `The sign is ${t.sign.sizeLabel}, ${t.sign.sqft} square feet of face area.`,
        `The artwork approved through Yardtize is the artwork that gets printed. A materially different design needs the Property Owner's agreement first — they approved a specific thing, not a blank space.`,
        `The Advertiser owns or has licensed everything on the sign and is responsible for what it says.`,
      ],
    },
    {
      heading: "Term",
      paragraphs: [
        `${describeTerm({ startsOn: t.term.startsOn, endsOn: t.term.endsOn })}. The sign goes up on the first date and comes down on the second.${t.term.isElectionWindow ? " These are the dates of the 2026 election window." : ""}`,
        `The term does not renew by itself. Continuing past the end date takes a new agreement.`,
      ],
    },
    {
      heading: "What is paid, and to whom",
      paragraphs: [
        `The Property Owner is paid ${money(t.money.monthlyRateCents)} per month — the full rate on their listing. Yardtize's service fee is charged to the Advertiser on top of that, not taken out of it.`,
        `The Advertiser pays ${money(t.money.dueNowCents)} when this agreement is approved${describeRest(t)}. Across the whole term that is ${money(t.money.advertiserTotalCents)}, of which ${money(t.money.ownerTotalCents)} goes to the Property Owner and ${money(t.money.feeTotalCents)} is Yardtize's fee.`,
        ...(t.money.schedule.length > 1
          ? [
              `Payments in full: ${t.money.schedule
                .map((s) => `${money(s.amountCents)} on ${describeDay(s.dueOn)}`)
                .join("; ")}.`,
            ]
          : []),
        `Yardtize collects from the Advertiser and pays the Property Owner. If the Advertiser stops paying, the Property Owner may have the sign removed and this agreement ends — they are not expected to chase anyone for money.`,
      ],
    },
    ...(t.money.depositCents > 0
      ? [
          {
            heading: "Deposit",
            paragraphs: [
              `The Advertiser holds a refundable deposit of ${money(t.money.depositCents)} against damage to the property.`,
              `It is returned in full within 14 days of the sign coming down, provided the ground is left as it was found. If it is not, the cost of putting it right comes out of the deposit and anything left over is returned, with an itemised account of what was spent.`,
            ],
          },
        ]
      : []),
    {
      heading: "Installation and removal",
      paragraphs: [
        self
          ? `The Advertiser installs and removes the sign at their own cost and risk. They are responsible for calling in a utility locate before putting anything in the ground — Missouri and Kansas both require it, it is free, and hitting a buried line is the single most expensive thing that can go wrong here.`
          : `Yardtize installs and removes the sign, including the utility locate. The Advertiser is billed ${money(t.money.installCents)} for the pair.`,
        `Installation happens on or about the start date, at a time that suits the Property Owner. Removal happens within 7 days of the end date, and the ground is restored — stakes out, holes filled, grass reseeded if it was disturbed.`,
        `A sign left standing more than 7 days after the term ends may be removed and disposed of by the Property Owner at the Advertiser's cost.`,
      ],
    },
    {
      heading: "The local sign code",
      paragraphs: j
        ? [
            `This placement was screened against ${j.name}, ${j.state}${j.verified ? "" : ", whose code Yardtize has not yet verified line by line"}. As Yardtize reads it: signs up to ${j.maxSqft} square feet and ${j.maxHeightFt} feet tall${j.setbackFt ? `, set back at least ${j.setbackFt} feet from the right-of-way` : ""}${j.displayPeriodDays ? `, displayed up to ${j.displayPeriodDays} days at a time${j.gapDays ? ` with a ${j.gapDays}-day gap afterwards` : ""}` : ""}.`,
            `Sign codes change, and enforcement can reach both the Advertiser and the Property Owner — in some cities every day a sign is out of compliance is a separate offence. Both parties are relying on their own judgement about the law, not on Yardtize's.`,
            j.citations.length ? `Sections read: ${j.citations.join(" · ")}.` : "",
          ].filter(Boolean)
        : [
            `Yardtize has not verified the sign code for this city. Both parties should confirm the local limits before anything goes in the ground.`,
          ],
    },
    {
      heading: "Taking it down",
      paragraphs: [
        `If the city, a homeowners association, or the Property Owner objects to the sign for any reason, it comes down within 48 hours of notice. No argument, no notice period, no reason required from the Property Owner.`,
        `Rent is prorated to the day of removal and the balance refunded. Neither party owes the other anything further for a takedown made in good faith.`,
        `Either party may end this agreement early on 14 days' written notice, with rent prorated the same way.`,
      ],
    },
    {
      heading: "Endorsement",
      paragraphs: [
        `Hosting the sign is not an endorsement. The Property Owner is renting space and is not stating agreement with anything the sign says, and the Advertiser will not suggest otherwise in any other advertising.`,
      ],
    },
    {
      heading: "Risk",
      paragraphs: [
        `The Advertiser is responsible for injury or damage caused by the sign or by their work on the property, except where it is caused by the Property Owner.`,
        `The sign is the Advertiser's property and stays at their risk. Weather, theft and vandalism are their problem, not the Property Owner's.`,
      ],
    },
    {
      heading: "Everything else",
      paragraphs: [
        `Neither party may transfer this agreement to anybody else without the other's written agreement.`,
        `Notice under this agreement may be given by email to the addresses above, or through Yardtize.`,
        `This is governed by the law of the state the property is in — ${t.premises.state === "KS" ? "Kansas" : "Missouri"}.`,
        `This document, plus the artwork approved through Yardtize, is the whole agreement between the parties about this placement.`,
      ],
    },
  ];
}

/** The banner that has to survive every rendering of this document. */
export const LEASE_DISCLAIMER =
  "DRAFT — not legal advice. Yardtize generated this from what both parties selected and is not a party to it. " +
  "It is drafted as a licence rather than a lease so that placing a sign does not create a tenancy. " +
  "Have a Missouri or Kansas attorney review it before relying on it.";

export const leaseHeading = (t: LeaseTerms) =>
  `Yard Sign Placement Licence · ${t.reference} · prepared ${describeDay(t.generatedAt.slice(0, 10))}`;
