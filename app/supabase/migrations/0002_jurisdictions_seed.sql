-- Verified sign-code rules for the two pilot cities, plus a conservative
-- fallback for anywhere we have not researched yet.
--
-- Sources are recorded in `citations`. KCMO text verified from the city's
-- official CPD redline and Municode; Overland Park verified from the live code
-- at codes.opkansas.org (see Yardtize-Zoning-Deep-Dive.md, Addendum).
--
-- `max_signs_per_lot` is 1 everywhere: that is a Yardtize platform rule
-- (one tasteful sign per yard), deliberately stricter than any city allows.

insert into jurisdictions (name, state, match_city, is_default, is_verified, rules, citations)
values
(
  'Kansas City', 'MO', 'kansas city', false, true,
  jsonb_build_object(
    'max_sign_sqft', 8,
    'max_height_ft', 4,
    'setback_ft', 5,
    'corner_diagonal_ft', 20,
    'permit_required_above_sqft', 10,
    'max_signs_per_lot', 1,
    'noncommercial', jsonb_build_object(
      'aggregate_sqft', 16,
      'duration_limit_days', null,
      'note', 'No duration limit on noncommercial signs. The aggregate cap is lifted from 6 weeks before to 2 weeks after a Kansas City election.'
    ),
    'commercial_offpremise_allowed', false,
    'commercial_note', 'Commercial messages may only advertise activity conducted on the premises. Off-premise commercial advertising is prohibited citywide outside the highway corridors, so paid third-party commercial listings are not offered here.',
    'nonprofit_exempt', false,
    'political', jsonb_build_object(
      'allowed_year_round', true,
      'note', 'Political signs are allowed year-round within the size rules. Missouri RSMo 442.404 bars HOAs from prohibiting political signs.'
    ),
    'display_period_days', null,
    'gap_days', null,
    'weekend_corner', null,
    'enforcement', jsonb_build_object(
      'process', '311 complaint to Neighborhood Preservation, then a warning letter with 10-30 days to cure.',
      'platform_posture', '48-hour takedown on any notice. Yardtize handles the notice and pays any fine on a compliant placement.'
    )
  ),
  array['Zoning Code § 88-445-06', '§ 88-445-14', '§ 88-810-1770', 'Building Code § 18-16']
),
(
  'Overland Park', 'KS', 'overland park', false, true,
  jsonb_build_object(
    'max_sign_sqft', 9,
    'max_height_ft', 6,
    'setback_ft', 1,
    'corner_diagonal_ft', null,
    'permit_required_above_sqft', null,
    'max_signs_per_lot', 1,
    'noncommercial', jsonb_build_object(
      'aggregate_sqft', 9,
      'duration_limit_days', 60,
      'note', 'Up to 3 stake signs totalling 9 sq ft; a single sign may be the full 9 sq ft. Each display period runs 60 days, then the lot must sit empty for 30 days.'
    ),
    'commercial_offpremise_allowed', false,
    'commercial_note', 'Off-site commercial signs are prohibited, but the definition covers for-profit advertisers only. Corner lots additionally get one extra temporary sign each weekend under § 18.440.130.G, which is expressly carved out of the prohibition.',
    'nonprofit_exempt', true,
    'nonprofit_note', 'Nonprofits, churches, schools, youth sports and community events fall outside the off-site commercial definition entirely.',
    'political', jsonb_build_object(
      'allowed_year_round', true,
      'statute', 'K.S.A. 25-2711',
      'protected_window_start', '2026-09-19',
      'protected_window_end', '2026-11-05',
      'note', 'From 45 days before to 2 days after an election, Kansas cities may not limit the number or placement of political signs on private property.'
    ),
    'display_period_days', 60,
    'gap_days', 30,
    'weekend_corner', jsonb_build_object(
      'allowed', true,
      'max_sqft_per_face', 3,
      'max_faces', 2,
      'max_height_ft', 4,
      'window', 'Friday 6:00 a.m. to Sunday 9:00 p.m.',
      'note', 'A legal weekend commercial product on corner lots — modelled as its own inventory type.'
    ),
    'enforcement', jsonb_build_object(
      'process', 'Notice, then a deadline, then a $140 reinspection fee, escalating up to $500/day at court discretion. Each day is a separate offense and liability can reach the advertiser as well as the property owner.',
      'platform_posture', '48-hour takedown on any notice. Yardtize handles the notice and pays any fine on a compliant placement.'
    )
  ),
  array['UDO § 18.440.130', '§ 18.440.020', '§ 18.440.180', '§ 18.440.190', '§ 18.440.200', 'K.S.A. 25-2711']
),
(
  'Unverified city', '--', null, true, false,
  jsonb_build_object(
    'max_sign_sqft', 3,
    'max_height_ft', 4,
    'setback_ft', 5,
    'corner_diagonal_ft', null,
    'permit_required_above_sqft', null,
    'max_signs_per_lot', 1,
    'noncommercial', jsonb_build_object(
      'aggregate_sqft', 3,
      'duration_limit_days', 30,
      'note', 'Conservative placeholder until this city''s code is verified.'
    ),
    'commercial_offpremise_allowed', false,
    'commercial_note', 'We do not offer paid commercial placements in a city until its sign code has been reviewed.',
    'nonprofit_exempt', false,
    'political', jsonb_build_object('allowed_year_round', false),
    'display_period_days', 30,
    'gap_days', null,
    'weekend_corner', null,
    'enforcement', jsonb_build_object(
      'process', 'Unknown — not yet researched.',
      'platform_posture', '48-hour takedown on any notice.'
    )
  ),
  array[]::text[]
);
