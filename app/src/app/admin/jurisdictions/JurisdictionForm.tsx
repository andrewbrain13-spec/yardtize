"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { saveJurisdiction, type SaveState } from "./actions";
import { buttonClass, Card } from "@/components/ui";
import type { Jurisdiction } from "@/lib/supabase/types";

const INITIAL: SaveState = { status: "idle" };

const field =
  "w-full border-[1.5px] border-hairline bg-white rounded-[11px] px-3.5 py-2.5 text-[14.5px] focus:outline-none focus:border-brand-mid";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonClass("primary", "big")} disabled:opacity-60`}>
      {pending ? "Saving…" : "Save city"}
    </button>
  );
}

function Text({
  name, label, hint, defaultValue, placeholder, type = "text", required = false,
}: {
  name: string; label: string; hint?: string; defaultValue?: string | number | null;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1.5">
        {label}
        {hint && <span className="font-normal text-ink-3"> — {hint}</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={field}
      />
    </label>
  );
}

function Check({
  name, label, hint, defaultChecked, onChange,
}: {
  name: string; label: string; hint?: string; defaultChecked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <label className="flex gap-2.5 items-start cursor-pointer py-1.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-[3px] w-[16px] h-[16px] accent-[#166534]"
      />
      <span>
        <b className="block text-[13.5px]">{label}</b>
        {hint && <span className="text-[12.5px] text-ink-2">{hint}</span>}
      </span>
    </label>
  );
}

function Area({
  name, label, hint, defaultValue, rows = 2, placeholder,
}: {
  name: string; label: string; hint?: string; defaultValue?: string | null;
  rows?: number; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1.5">
        {label}
        {hint && <span className="font-normal text-ink-3"> — {hint}</span>}
      </span>
      <textarea name={name} rows={rows} defaultValue={defaultValue ?? ""} placeholder={placeholder} className={field} />
    </label>
  );
}

function Section({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <Card className="p-[22px] mb-4">
      <h2 className="text-[16px] tracking-[-0.2px]">{title}</h2>
      {blurb && <p className="text-[12.5px] text-ink-2 mt-1 mb-3 max-w-[62ch]">{blurb}</p>}
      <div className={blurb ? "" : "mt-3"}>{children}</div>
    </Card>
  );
}

/**
 * One city's sign code, as a form.
 *
 * Written for someone reading a municipal code in another tab, not for someone
 * who knows the database: every field says what it does to the product, and
 * anything left blank means "no such rule" rather than zero.
 */
export function JurisdictionForm({ jurisdiction }: { jurisdiction?: Jurisdiction }) {
  const [result, action] = useActionState(saveJurisdiction, INITIAL);
  const r = jurisdiction?.rules;
  const [weekend, setWeekend] = useState(Boolean(r?.weekend_corner?.allowed));

  return (
    <form action={action}>
      {jurisdiction && <input type="hidden" name="id" value={jurisdiction.id} />}

      <Section
        title="Which city"
        blurb="The match name is what a geocoded address is compared against, lower-cased. It is usually the same as the name — set it only when the geocoder says something different, like an unincorporated area."
      >
        <div className="grid sm:grid-cols-3 gap-3">
          <Text name="name" label="City name" defaultValue={jurisdiction?.name} placeholder="Olathe" required />
          <Text name="state" label="State" hint="two letters" defaultValue={jurisdiction?.state} placeholder="KS" required />
          <Text name="match_city" label="Match name" hint="optional" defaultValue={jurisdiction?.match_city} placeholder="olathe" />
        </div>
        <div className="mt-2">
          <Check
            name="is_verified"
            label="I have read this city's actual sign code"
            hint="Unverified cities show a 'compliance review pending' badge and are not offered to commercial advertisers at all. Leave this off until you have the text in front of you."
            defaultChecked={jurisdiction?.is_verified}
          />
        </div>
      </Section>

      <Section
        title="Size and placement"
        blurb="The sign-area limit decides which sign sizes a homeowner is even offered here, so it is the single most important number on this page. Leave anything that the city does not regulate blank."
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Text name="max_sign_sqft" label="Max sign area" hint="sq ft" type="number" defaultValue={r?.max_sign_sqft} required />
          <Text name="max_height_ft" label="Max height" hint="ft" type="number" defaultValue={r?.max_height_ft} required />
          <Text name="setback_ft" label="Setback from right-of-way" hint="ft, blank if none" type="number" defaultValue={r?.setback_ft} />
          <Text name="corner_diagonal_ft" label="Corner sight triangle" hint="ft, corner lots" type="number" defaultValue={r?.corner_diagonal_ft} />
          <Text name="permit_required_above_sqft" label="Permit needed above" hint="sq ft, blank if never" type="number" defaultValue={r?.permit_required_above_sqft} />
        </div>
      </Section>

      <Section
        title="How long a sign may stand"
        blurb="Some cities cap a display period and then require the yard to sit empty. Scheduling honors this, so filling it in changes what durations an advertiser can book."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Text name="display_period_days" label="Display period" hint="days, blank if unlimited" type="number" defaultValue={r?.display_period_days} />
          <Text name="gap_days" label="Required gap after" hint="days" type="number" defaultValue={r?.gap_days} />
        </div>
      </Section>

      <Section
        title="Commercial advertising"
        blurb="This is the gate that decides whether a for-profit business may advertise on a yard here at all. Most cities prohibit off-site commercial signs; leave the box unchecked unless the code plainly allows them."
      >
        <Check
          name="commercial_offpremise_allowed"
          label="Off-site commercial advertising is allowed"
          hint="A sign advertising a business that is not on this property."
          defaultChecked={r?.commercial_offpremise_allowed}
        />
        <div className="mt-2">
          <Area name="commercial_note" label="What the code says" defaultValue={r?.commercial_note} rows={3}
            placeholder="Commercial messages may only advertise activity conducted on the premises…" />
        </div>
        <div className="mt-3">
          <Check
            name="nonprofit_exempt"
            label="Nonprofits fall outside the commercial ban"
            hint="True where the prohibition is written to cover for-profit advertisers only."
            defaultChecked={r?.nonprofit_exempt}
          />
          <Area name="nonprofit_note" label="Nonprofit note" defaultValue={r?.nonprofit_note} />
        </div>
      </Section>

      <Section
        title="Weekend corner"
        blurb="A few cities carve out an extra temporary sign on corner lots for part of the weekend. Where that exists it is a legal commercial product, and Yardtize sells it as its own inventory type."
      >
        <Check
          name="weekend_corner_allowed"
          label="This city has a weekend corner-lot allowance"
          defaultChecked={r?.weekend_corner?.allowed}
          onChange={setWeekend}
        />
        {weekend && (
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            <Text name="weekend_corner_max_sqft_per_face" label="Max per face" hint="sq ft" type="number" defaultValue={r?.weekend_corner?.max_sqft_per_face ?? 3} />
            <Text name="weekend_corner_max_faces" label="Faces" type="number" defaultValue={r?.weekend_corner?.max_faces ?? 2} />
            <Text name="weekend_corner_max_height_ft" label="Max height" hint="ft" type="number" defaultValue={r?.weekend_corner?.max_height_ft ?? 4} />
            <div className="sm:col-span-3">
              <Text name="weekend_corner_window" label="When" defaultValue={r?.weekend_corner?.window} placeholder="Friday 6:00 a.m. to Sunday 9:00 p.m." />
            </div>
            <div className="sm:col-span-3">
              <Area name="weekend_corner_note" label="Note" defaultValue={r?.weekend_corner?.note} />
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Noncommercial and political"
        blurb="Campaigns and causes are the widest-open lane in most cities, and several states protect them by statute during an election window."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Text name="noncommercial_aggregate_sqft" label="Total noncommercial area per lot" hint="sq ft" type="number" defaultValue={r?.noncommercial?.aggregate_sqft} />
          <Text name="noncommercial_duration_limit_days" label="Duration limit" hint="days, blank if none" type="number" defaultValue={r?.noncommercial?.duration_limit_days} />
        </div>
        <div className="mt-3">
          <Area name="noncommercial_note" label="Noncommercial note" defaultValue={r?.noncommercial?.note} />
        </div>
        <div className="mt-3">
          <Check
            name="political_allowed_year_round"
            label="Political signs are allowed year-round"
            defaultChecked={r?.political?.allowed_year_round ?? true}
          />
          <div className="grid sm:grid-cols-3 gap-3 mt-2">
            <Text name="political_statute" label="Protecting statute" hint="if any" defaultValue={r?.political?.statute} placeholder="K.S.A. 25-2711" />
            <Text name="political_window_start" label="Protected from" hint="YYYY-MM-DD" defaultValue={r?.political?.protected_window_start} />
            <Text name="political_window_end" label="Protected until" hint="YYYY-MM-DD" defaultValue={r?.political?.protected_window_end} />
          </div>
          <div className="mt-3">
            <Area name="political_note" label="Political note" defaultValue={r?.political?.note} />
          </div>
        </div>
      </Section>

      <Section title="Enforcement" blurb="What actually happens if someone complains — this appears on the placement agreement both parties sign.">
        <Area name="enforcement_process" label="The city's process" defaultValue={r?.enforcement?.process} rows={3}
          placeholder="Complaint to code enforcement, then a warning letter with 10–30 days to cure…" />
        <div className="mt-3">
          <Area name="enforcement_posture" label="Yardtize's posture" defaultValue={r?.enforcement?.platform_posture ?? "48-hour takedown on any notice."} />
        </div>
      </Section>

      <Section
        title="Sources"
        blurb="One per line. These print under the compliance card and on the agreement, and are what makes the screening believable rather than asserted."
      >
        <Area name="citations" label="Section numbers you read" rows={4}
          defaultValue={jurisdiction?.citations?.join("\n")}
          placeholder={"UDO § 18.440.130\nK.S.A. 25-2711"} />
      </Section>

      {result.status === "error" && (
        <p role="alert" className="text-[13.5px] text-amber bg-amber-wash border border-amber-edge rounded-[10px] px-3.5 py-2.5 mb-4">
          {result.message}
        </p>
      )}

      <div className="flex gap-3 items-center flex-wrap">
        <Save />
        <Link href="/admin/jurisdictions" className={buttonClass("ghost")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
