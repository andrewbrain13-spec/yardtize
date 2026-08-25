/**
 * Database types, kept in step with supabase/migrations/*.sql by hand.
 * (Once the Supabase CLI can reach the project we can generate these instead.)
 */

export type UserRole = "homeowner" | "business";
export type ListingStatus = "draft" | "live" | "paused";
export type RequestStatus =
  | "requested"
  | "approved"
  | "declined"
  | "active"
  | "completed";
export type AdvertiserType = "business" | "campaign" | "nonprofit";
export type InstallChoice = "self" | "platform";

export type TrafficSegmentRow = {
  road: string;
  descriptor?: string;
  aadt: number;
  year: number;
  source: string;
};

/** Shape of jurisdictions.rules — see 0002_jurisdictions_seed.sql. */
export type JurisdictionRules = {
  max_sign_sqft: number;
  max_height_ft: number;
  setback_ft: number | null;
  corner_diagonal_ft: number | null;
  permit_required_above_sqft: number | null;
  max_signs_per_lot: number;
  noncommercial: {
    aggregate_sqft: number;
    duration_limit_days: number | null;
    note?: string;
  };
  commercial_offpremise_allowed: boolean;
  commercial_note?: string;
  nonprofit_exempt: boolean;
  nonprofit_note?: string;
  political: {
    allowed_year_round: boolean;
    statute?: string;
    protected_window_start?: string;
    protected_window_end?: string;
    note?: string;
  };
  display_period_days: number | null;
  gap_days: number | null;
  weekend_corner: {
    allowed: boolean;
    max_sqft_per_face: number;
    max_faces: number;
    max_height_ft: number;
    window: string;
    note?: string;
  } | null;
  enforcement: { process: string; platform_posture: string };
};

export type Profile = {
  id: string;
  email: string;
  role: UserRole | null;
  full_name: string | null;
  /** Operator access to /admin. Not editable by the account itself — see 0008. */
  is_admin: boolean;
  /** Set by an operator: listings hidden, no new listings or requests. */
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type Jurisdiction = {
  id: string;
  name: string;
  state: string;
  match_city: string | null;
  is_default: boolean;
  is_verified: boolean;
  rules: JurisdictionRules;
  citations: string[];
  created_at: string;
};

export type Listing = {
  id: string;
  owner_id: string;
  jurisdiction_id: string | null;
  street_address: string;
  city: string;
  state: string;
  postal_code: string | null;
  headline: string | null;
  lat: number;
  lng: number;
  sign_lat: number | null;
  sign_lng: number | null;
  aadt_sum: number | null;
  traffic_segments: TrafficSegmentRow[];
  traffic_source: string | null;
  traffic_year: number | null;
  signalized: boolean;
  corner_lot: boolean;
  suggested_rate: number | null;
  monthly_rate: number | null;
  status: ListingStatus;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type PlacementRequest = {
  id: string;
  listing_id: string;
  requester_id: string;
  advertiser_type: AdvertiserType;
  advertiser_name: string;
  sign_size_label: string;
  sign_size_sqft: number;
  duration_months: number | null;
  is_election_window: boolean;
  install: InstallChoice;
  /** First day the sign stands, and the day it comes down — [starts_on, ends_on). */
  starts_on: string;
  ends_on: string;
  /** The placement's life after it goes active. */
  installed_at: string | null;
  removed_at: string | null;
  takedown_requested_at: string | null;
  takedown_reason: string | null;
  rendering_path: string | null;
  message: string | null;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
};

/**
 * The columns of a live listing that anyone may see — what the marketplace is
 * shopped on. `street_address` is deliberately absent, and the coordinates are
 * rounded to about a block, so a yard can be found and judged without being
 * pinpointed before its owner has approved anyone. See migration 0006.
 */
export type PublicListing = Omit<
  Listing,
  "owner_id" | "street_address" | "sign_lat" | "sign_lng" | "suggested_rate" | "updated_at"
>;

/**
 * When a yard is spoken for. Deliberately carries no advertiser — availability
 * is public in a marketplace, who booked it is not. See migration 0011.
 */
export type ListingAvailability = {
  listing_id: string;
  starts_on: string;
  ends_on: string;
};

export type LeaseStatus = "awaiting_signature" | "submitted" | "approved" | "rejected";

/** One per placement. `terms` is the frozen snapshot the document renders from. */
export type Lease = {
  id: string;
  request_id: string;
  status: LeaseStatus;
  terms: import("@/lib/lease").LeaseTerms;
  signed_path: string | null;
  signed_by: string | null;
  signed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

/** One party's signature on an agreement, with what it takes to stand behind it. */
export type LeaseSignature = {
  id: string;
  lease_id: string;
  signer_id: string;
  party: "owner" | "advertiser";
  typed_name: string;
  drawn_mark: string | null;
  consent_text: string;
  ip: string | null;
  user_agent: string | null;
  signed_at: string;
};

export type PlacementEventKind = "installed" | "takedown_requested" | "removed" | "note";

/** Append-only record of what happened to a placement once it was live. */
export type PlacementEvent = {
  id: string;
  request_id: string;
  kind: PlacementEventKind;
  actor_id: string | null;
  note: string | null;
  photo_path: string | null;
  created_at: string;
};

/** What Yardtize knows about someone it can't serve yet. */
export type WaitlistEntry = {
  id: string;
  email: string;
  role: UserRole | null;
  city: string | null;
  state: string | null;
  note: string | null;
  source: string;
  created_at: string;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  // supabase-js's generic requires this key even when we never traverse
  // relationships through the typed client.
  Relationships: [];
};

export type AadtCacheRow = {
  id: string;
  lat_key: number;
  lng_key: number;
  aadt_sum: number | null;
  segments: unknown;
  source: string | null;
  data_year: number | null;
  fetched_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      jurisdictions: Table<Jurisdiction>;
      listings: Table<Listing>;
      requests: Table<PlacementRequest>;
      aadt_cache: Table<AadtCacheRow>;
      waitlist: Table<WaitlistEntry>;
      leases: Table<Lease>;
      lease_signatures: Table<LeaseSignature>;
      placement_events: Table<PlacementEvent>;
      placement_reminders: Table<{ id: string; request_id: string; kind: string; sent_at: string }>;
    };
    Views: {
      listings_public: Table<PublicListing>;
      listing_availability: Table<ListingAvailability>;
    };
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      listing_status: ListingStatus;
      request_status: RequestStatus;
      advertiser_type: AdvertiserType;
      install_choice: InstallChoice;
      lease_status: LeaseStatus;
      placement_event_kind: PlacementEventKind;
    };
    CompositeTypes: Record<string, never>;
  };
};
