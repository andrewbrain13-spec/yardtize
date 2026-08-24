import type { Metadata } from "next";
import { Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import type { Listing, PlacementRequest, Profile } from "@/lib/supabase/types";
import { SuspendControl } from "./SuspendControl";

export const metadata: Metadata = {
  title: "People — Yardtize",
  robots: { index: false, follow: false },
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Every account, and the one control that matters for a pilot: stopping one.
 *
 * The counts are the point — an account with no yards and no requests is
 * somebody who signed up and stalled, which is a different problem from an
 * account causing trouble, and the screen should let you tell them apart.
 */
export default async function PeoplePage() {
  const { admin } = await requireAdmin("/admin/people");
  if (!admin) return null;

  const [{ data: profileRows }, { data: listingRows }, { data: requestRows }] = await Promise.all([
    admin.from("profiles").select("*").order("created_at", { ascending: false }),
    admin.from("listings").select("id, owner_id, is_demo, status"),
    admin.from("requests").select("id, requester_id, status"),
  ]);

  const profiles = (profileRows ?? []) as Profile[];
  const listings = (listingRows ?? []) as Pick<Listing, "id" | "owner_id" | "is_demo" | "status">[];
  const requests = (requestRows ?? []) as Pick<PlacementRequest, "id" | "requester_id" | "status">[];

  const yardsBy = new Map<string, number>();
  for (const l of listings) yardsBy.set(l.owner_id, (yardsBy.get(l.owner_id) ?? 0) + 1);

  const requestsBy = new Map<string, number>();
  for (const r of requests) requestsBy.set(r.requester_id, (requestsBy.get(r.requester_id) ?? 0) + 1);

  const suspended = profiles.filter((p) => p.suspended_at);
  const active = profiles.filter((p) => !p.suspended_at);

  return (
    <div className="max-w-[900px] mx-auto px-[26px] py-[52px]">
      <h1 className="text-[26px] tracking-[-0.4px]">People</h1>
      <p className="text-ink-2 mt-1.5 mb-6 max-w-[60ch]">
        Suspending an account hides every yard it owns and blocks new listings
        and requests. Nothing is deleted — a complaint that turns out to be
        wrong costs nobody their listings.
      </p>

      <Card className="p-[22px]">
        <h2 className="text-[17px] tracking-[-0.3px] mb-2">
          Accounts <span className="text-ink-3 font-normal text-[14px]">({active.length})</span>
        </h2>
        {active.length === 0 ? (
          <p className="text-[13.5px] text-ink-2 py-1">Nobody yet.</p>
        ) : (
          active.map((p) => (
            <Row
              key={p.id}
              profile={p}
              yards={yardsBy.get(p.id) ?? 0}
              requests={requestsBy.get(p.id) ?? 0}
            />
          ))
        )}
      </Card>

      {suspended.length > 0 && (
        <Card className="p-[22px] mt-4">
          <h2 className="text-[17px] tracking-[-0.3px] mb-2">
            Suspended <span className="text-ink-3 font-normal text-[14px]">({suspended.length})</span>
          </h2>
          {suspended.map((p) => (
            <Row
              key={p.id}
              profile={p}
              yards={yardsBy.get(p.id) ?? 0}
              requests={requestsBy.get(p.id) ?? 0}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function Row({
  profile,
  yards,
  requests,
}: {
  profile: Profile;
  yards: number;
  requests: number;
}) {
  const activity =
    profile.role === "homeowner"
      ? `${yards} ${yards === 1 ? "yard" : "yards"}`
      : `${requests} ${requests === 1 ? "request" : "requests"}`;

  return (
    <div className="flex justify-between items-center gap-3 flex-wrap py-3 border-t border-hairline first:border-t-0">
      <span className="min-w-0">
        <b className="block text-[14.5px] truncate">{profile.full_name || profile.email}</b>
        <span className="text-[12.5px] text-ink-2">
          {profile.full_name ? `${profile.email} · ` : ""}
          joined {when(profile.created_at)}
          {profile.suspended_at ? ` · suspended ${when(profile.suspended_at)}` : ""}
        </span>
      </span>
      <span className="flex items-center gap-3 flex-wrap justify-end shrink-0">
        <span className="text-[12.5px] text-ink-2">{activity}</span>
        {profile.is_admin && <Badge>operator</Badge>}
        <Badge tone={profile.role ? "brand" : "gold"}>{profile.role ?? "no role yet"}</Badge>
        <SuspendControl
          profileId={profile.id}
          suspended={Boolean(profile.suspended_at)}
          reason={profile.suspended_reason}
        />
      </span>
    </div>
  );
}
