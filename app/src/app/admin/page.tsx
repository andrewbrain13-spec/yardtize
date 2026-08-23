import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { money } from "@/lib/money";
import type {
  Listing,
  PlacementRequest,
  Profile,
  RequestStatus,
  WaitlistEntry,
} from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Operations — Yardtize",
  robots: { index: false, follow: false },
};

const fmt = (n: number) => n.toLocaleString("en-US");
const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const STATUS_TONE: Record<RequestStatus, "brand" | "gold"> = {
  requested: "gold",
  approved: "brand",
  active: "brand",
  declined: "brand",
  completed: "brand",
};

/**
 * One screen for running the pilot, so the answer to "what's happening?" is
 * never "let me open the database".
 *
 * Everything here reads through the service-role client, which is the whole
 * point — it crosses accounts. Access is the `is_admin` flag on the profile,
 * which the account holder cannot set on themselves.
 */
export default async function AdminPage() {
  const { admin } = await requireAdmin("/admin");
  if (!admin) {
    return (
      <div className="max-w-[720px] mx-auto px-[26px] py-[70px]">
        <Card className="p-[32px]">
          <h1 className="text-[22px]">Operations</h1>
          <p className="text-ink-2 mt-2.5">
            SUPABASE_SECRET_KEY isn&rsquo;t set on this deployment, so this screen
            has nothing to read. Add it in the Vercel project settings.
          </p>
        </Card>
      </div>
    );
  }

  const [listingsRes, requestsRes, profilesRes, waitlistRes] = await Promise.all([
    admin.from("listings").select("*").order("created_at", { ascending: false }),
    admin.from("requests").select("*").order("created_at", { ascending: false }).limit(50),
    admin.from("profiles").select("*").order("created_at", { ascending: false }),
    admin.from("waitlist").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  const listings = (listingsRes.data ?? []) as Listing[];
  const requests = (requestsRes.data ?? []) as PlacementRequest[];
  const profiles = (profilesRes.data ?? []) as Profile[];
  const waitlist = (waitlistRes.data ?? []) as WaitlistEntry[];

  const listingById = new Map(listings.map((l) => [l.id, l]));
  const emailById = new Map(profiles.map((p) => [p.id, p.email]));

  const real = listings.filter((l) => !l.is_demo);
  const pending = requests.filter((r) => r.status === "requested").length;
  const booked = requests.filter((r) => r.status === "approved" || r.status === "active");

  /*
   * Monthly run-rate of what has actually been agreed to — the only number on
   * this page that a pilot lives or dies by. Demo yards are excluded because
   * nobody is paying for them.
   */
  const runRate = booked.reduce((sum, r) => {
    const l = listingById.get(r.listing_id);
    return sum + (l && !l.is_demo ? (l.monthly_rate ?? 0) : 0);
  }, 0);

  return (
    <div className="max-w-[1060px] mx-auto px-[26px] py-[52px]">
      <div className="flex items-baseline gap-3 flex-wrap mb-6">
        <h1 className="text-[26px] tracking-[-0.4px]">Operations</h1>
        <span className="text-[12.5px] text-ink-3">
          Everything across every account. Only you see this.
        </span>
        <Link
          href="/admin/jurisdictions"
          className="text-[13px] font-semibold text-brand-deep underline underline-offset-2"
        >
          Cities &amp; sign codes →
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-7">
        <Tile label="Real yards" value={String(real.length)} sub={`${listings.length - real.length} demo`} />
        <Tile label="Homeowners" value={String(profiles.filter((p) => p.role === "homeowner").length)} sub={`${profiles.length} accounts`} />
        <Tile label="Advertisers" value={String(profiles.filter((p) => p.role === "business").length)} sub="signed up" />
        <Tile label="Awaiting a homeowner" value={String(pending)} sub={`${requests.length} requests total`} />
        <Tile label="Booked run-rate" value={money(runRate)} sub={`${booked.length} live or approved`} />
      </div>

      <Panel title="Requests" count={requests.length}>
        {requests.length === 0 ? (
          <Empty>Nothing yet. The first one arrives when an advertiser asks for a yard.</Empty>
        ) : (
          requests.map((r) => {
            const l = listingById.get(r.listing_id);
            return (
              <Line key={r.id}>
                <span className="min-w-0">
                  <b className="block text-[14px] truncate">{r.advertiser_name}</b>
                  <span className="text-[12.5px] text-ink-2">
                    {emailById.get(r.requester_id) ?? "unknown"} → {l?.headline ?? "deleted listing"}
                    {l && ` · ${l.city}, ${l.state}`}
                  </span>
                </span>
                <span className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[12px] text-ink-3">{when(r.created_at)}</span>
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  <Link
                    href={`/agreement/${r.id}`}
                    className="text-[12.5px] font-semibold text-brand-deep underline underline-offset-2"
                  >
                    summary
                  </Link>
                </span>
              </Line>
            );
          })
        )}
      </Panel>

      <Panel title="Listings" count={listings.length}>
        {listings.length === 0 ? (
          <Empty>No yards yet.</Empty>
        ) : (
          listings.map((l) => (
            <Line key={l.id}>
              <span className="min-w-0">
                <b className="block text-[14px] truncate">
                  {l.headline ?? "Untitled"}
                  {l.is_demo && <span className="ml-2 text-[11px] text-amber font-semibold">DEMO</span>}
                </b>
                <span className="text-[12.5px] text-ink-2 truncate block">
                  {l.street_address}, {l.city}, {l.state} · {emailById.get(l.owner_id) ?? "unknown owner"}
                </span>
              </span>
              <span className="flex items-center gap-3 shrink-0 text-right">
                <span className="text-[12.5px] text-ink-2 tabular-nums">
                  {l.aadt_sum === null ? "no count" : `${fmt(l.aadt_sum)}/day`}
                </span>
                <span className="text-[14px] font-bold tabular-nums w-[74px]">{money(l.monthly_rate)}</span>
                <Badge tone={l.status === "live" ? "brand" : "gold"}>{l.status}</Badge>
              </span>
            </Line>
          ))
        )}
      </Panel>

      <Panel title="Waitlist" count={waitlist.length}>
        {waitlist.length === 0 ? (
          <Empty>
            Nobody has asked for another city yet. This fills up from the landing
            page, the browse rail, and the listing wizard.
          </Empty>
        ) : (
          waitlist.map((w) => (
            <Line key={w.id}>
              <span className="min-w-0">
                <b className="block text-[14px] truncate">{w.email}</b>
                <span className="text-[12.5px] text-ink-2">
                  {[w.city, w.state].filter(Boolean).join(", ") || "no place given"}
                  {w.role && ` · ${w.role}`} · via {w.source}
                </span>
              </span>
              <span className="text-[12px] text-ink-3 shrink-0">{when(w.created_at)}</span>
            </Line>
          ))
        )}
      </Panel>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-[15px]">
      <div className="text-[11.5px] text-ink-3 font-medium">{label}</div>
      <div className="text-[22px] font-bold tracking-[-0.4px] mt-0.5">{value}</div>
      <div className="text-[11.5px] text-ink-2">{sub}</div>
    </Card>
  );
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-[22px] mb-4">
      <h2 className="text-[17px] tracking-[-0.3px] mb-2">
        {title} <span className="text-ink-3 font-normal text-[14px]">({count})</span>
      </h2>
      {children}
    </Card>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3 flex-wrap py-2.5 border-t border-hairline first:border-t-0">
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] text-ink-2 py-1">{children}</p>;
}
