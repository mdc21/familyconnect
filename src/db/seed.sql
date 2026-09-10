-- FamilyConnect Seed Data
-- Nepal-Tibet border glacial outburst flood, September 2026
-- Run AFTER schema.sql: psql -U familyconnect -d familyconnect -f seed.sql

-- ============================================================
-- DISASTER EVENT (idempotent upsert)
-- ============================================================
INSERT INTO disaster_event (event_id, name, status, governance_authority, data_controller, data_residency)
VALUES (
    'EVENT-NP-TIBET-2026',
    'Nepal–Tibet Border Glacial Outburst Flood — Langtang / Sun Koshi / Bhotekoshi',
    'ACTIVE',
    'Nepal Disaster Risk Reduction and Management Authority (NDRRMA)',
    'FamilyConnect / ICRC Joint Operation',
    'ap-south-1'
)
ON CONFLICT (event_id) DO NOTHING;

-- ============================================================
-- ORGANISATIONS
-- ============================================================
INSERT INTO organisation (organisation_id, name, organisation_type, country, operational_status)
VALUES
    ('11111111-0000-0000-0000-000000000001', 'Nepal Red Cross Society', 'HUMANITARIAN', 'NP', 'ACTIVE'),
    ('11111111-0000-0000-0000-000000000002', 'Nepal Police', 'GOVERNMENT', 'NP', 'ACTIVE'),
    ('11111111-0000-0000-0000-000000000003', 'Armed Police Force Nepal', 'GOVERNMENT', 'NP', 'ACTIVE'),
    ('11111111-0000-0000-0000-000000000004', 'UNHCR Nepal', 'UN_AGENCY', 'NP', 'ACTIVE'),
    ('11111111-0000-0000-0000-000000000005', 'Médecins Sans Frontières (MSF)', 'HUMANITARIAN', 'NP', 'ACTIVE'),
    ('11111111-0000-0000-0000-000000000006', 'World Food Programme Nepal', 'UN_AGENCY', 'NP', 'ACTIVE')
ON CONFLICT (organisation_id) DO NOTHING;

-- ============================================================
-- ASSISTANCE CENTRES
-- ============================================================
INSERT INTO assistance_centre
    (centre_id, organisation_id, event_id, name, location, opening_hours, services, languages, accessibility, emergency_contact, operational_status)
VALUES
    ('ac000001-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','EVENT-NP-TIBET-2026','Kathmandu Main Relief Hub — Tundikhel Ground','{"address":"Tundikhel Ground, Kathmandu","district":"Kathmandu","lat":27.7049,"lng":85.3163,"landmark":"Next to Ratna Park bus terminal"}','Open 24 hours / 7 days',ARRAY['Family tracing registration','Safe-person lists','Missing person reporting','DNA sample kits','Temporary shelter referrals','Psychosocial support'],ARRAY['Nepali','English','Hindi'],'Wheelchair accessible. Dedicated child-friendly space and private interview rooms.','+977-1-4228094','OPEN'),
    ('ac000002-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','EVENT-NP-TIBET-2026','Rasuwa District Relief Centre — Dhunche','{"address":"Dhunche Bazaar, Rasuwa","district":"Rasuwa","lat":28.1076,"lng":85.2985,"landmark":"Adjacent to District Administration Office"}','06:00–22:00 daily',ARRAY['Missing person registration','Family tracing','Helicopter transport registration','Medical triage','Food and water distribution'],ARRAY['Nepali','Tamang','English'],'Ground floor only. No wheelchair ramp — support staff available.','+977-10150-20012','OPEN'),
    ('ac000003-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000002','EVENT-NP-TIBET-2026','Sindhupalchok District Coordination Centre — Chautara','{"address":"Chautara, Sindhupalchok","district":"Sindhupalchok","lat":27.7903,"lng":85.7093,"landmark":"Sindhupalchok district police HQ compound"}','07:00–21:00 daily',ARRAY['Missing person filing','Case tracking inquiries','Inter-agency coordination','Evidence drop-off'],ARRAY['Nepali','English'],'Level access at main entrance.','+977-11-490033','OPEN'),
    ('ac000004-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000005','EVENT-NP-TIBET-2026','MSF Medical Point — Syabrubesi','{"address":"Syabrubesi, Rasuwa","district":"Rasuwa","lat":28.1566,"lng":85.3447,"landmark":"Near Syabrubesi helipad"}','Continuous (24h emergency services)',ARRAY['Emergency medical care','Wound treatment','Psychological first aid','Referral to Kathmandu hospitals'],ARRAY['Nepali','English','French'],'Field clinic — stretcher access available.','+977-9851-234567','OPEN'),
    ('ac000005-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000006','EVENT-NP-TIBET-2026','WFP Emergency Food Distribution — Melamchi','{"address":"Melamchi, Sindhupalchok","district":"Sindhupalchok","lat":27.8434,"lng":85.5587,"landmark":"Melamchi Municipality compound"}','08:00–18:00 daily',ARRAY['Emergency food rations','Safe drinking water','Hygiene kits','Infant nutrition support'],ARRAY['Nepali','English'],'Level ground. Priority lane for elderly and disabled.','+977-9800-123456','OPEN'),
    ('ac000006-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000003','EVENT-NP-TIBET-2026','Nuwakot Family Tracing Point — Bidur','{"address":"Bidur, Nuwakot","district":"Nuwakot","lat":27.9074,"lng":85.1714,"landmark":"Nuwakot district court building"}','08:00–20:00 daily',ARRAY['Family tracing','Safe-person registration','Temporary shelter coordination'],ARRAY['Nepali','Newari','English'],'Ground-floor room available. Steps at main entrance — staff will assist.','+977-10180-21001','OPEN')
ON CONFLICT (centre_id) DO NOTHING;

-- ============================================================
-- DISASTER RUMOURS
-- ============================================================
INSERT INTO disaster_rumour
    (rumour_id, event_id, claim, source, affected_area, verification_status, response_message, verified_by)
VALUES
    ('00000000-0000-0000-0000-000000000001','EVENT-NP-TIBET-2026','The Araniko Highway is completely blocked — no vehicles can pass anywhere between Kathmandu and the border.','WhatsApp / social media viral','Sindhupalchok / Bagmati','MISLEADING','The Araniko Highway (H04) is PARTIALLY blocked. Kathmandu to Barabise has reopened for light vehicles as of 2 September. Section Tatopani to Kodari remains impassable. — DoR Nepal (2 Sep 2026)','NDRRMA / Department of Roads'),
    ('00000000-0000-0000-0000-000000000002','EVENT-NP-TIBET-2026','All 46 workers trapped at Rasuwagadhi hydropower are confirmed dead.','Facebook / unattributed aggregators','Rasuwa','FALSE','FALSE: Contact established with Cavern B-2. 14 workers extracted safely. Oxygen stable. Air vent installed at 38.2m. Micro-drilling ongoing. — Nepali Army (3 Sep 2026)','Nepali Army / NDRRMA'),
    ('00000000-0000-0000-0000-000000000003','EVENT-NP-TIBET-2026','Drinking water in Kathmandu is contaminated — do not drink tap water.','Twitter/X, messaging groups','Kathmandu Valley','FALSE','FALSE: KUKL water treatment plants are operating normally. Kathmandu Valley supply is unaffected. Do not spread — causing unnecessary panic. — KUKL (2 Sep 2026)','KUKL / Kathmandu Metropolitan City'),
    ('00000000-0000-0000-0000-000000000004','EVENT-NP-TIBET-2026','China has refused to open the border to allow Nepali rescue teams to retrieve bodies.','Various social media','Nepal-China Border','UNVERIFIED','Active diplomatic communication confirmed. No official confirmation or denial yet. Monitoring closely. — Nepal MFA (3 Sep 2026)','Nepal Ministry of Foreign Affairs'),
    ('00000000-0000-0000-0000-000000000005','EVENT-NP-TIBET-2026','A second glacial lake outburst is imminent on Langtang Valley — evacuate immediately.','Viral WhatsApp audio','Rasuwa / Langtang','UNVERIFIED','No imminent secondary outburst confirmed. DHM monitoring ongoing. Official evacuation orders will be issued if warranted. Do not circulate unverified calls. — DHM Nepal (3 Sep 2026)','DHM Nepal / NDRRMA'),
    ('00000000-0000-0000-0000-000000000006','EVENT-NP-TIBET-2026','FamilyConnect is collecting DNA samples and selling genetic data to foreign companies.','Social media / messaging groups','National','FALSE','FALSE: DNA programme is humanitarian-only under Nepal Privacy Act 2075 and ICRC protocols. No commercial sharing. Consent mandatory. Overseen by Nepal Police FSL and ICRC. — FamilyConnect / ICRC (3 Sep 2026)','FamilyConnect / ICRC / Nepal Police')
ON CONFLICT (rumour_id) DO NOTHING;

-- ============================================================
-- COORDINATOR ACCOUNTS TABLE + SEED
-- password_hash = bcrypt('Coord@2026!') rounds=10
-- ============================================================
CREATE TABLE IF NOT EXISTS coordinator_account (
    account_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'CASE_WORKER',
    organisation_id UUID REFERENCES organisation(organisation_id),
    event_id        TEXT REFERENCES disaster_event(event_id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);

INSERT INTO coordinator_account (account_id, email, password_hash, display_name, role, organisation_id, event_id)
VALUES
    ('ca000001-0000-0000-0000-000000000001','admin@familyconnect.org','$2b$10$xMlng6dI63qSsiqpTjFHheCIMUwwkNZcDTo1VQpgepKepnmggVYni','System Administrator','ADMIN',NULL,'EVENT-NP-TIBET-2026'),
    ('ca000002-0000-0000-0000-000000000002','coordinator@ndrrma.gov.np','$2b$10$xMlng6dI63qSsiqpTjFHheCIMUwwkNZcDTo1VQpgepKepnmggVYni','NDRRMA Coordinator — Rasuwa','AUTHORITY','11111111-0000-0000-0000-000000000002','EVENT-NP-TIBET-2026'),
    ('ca000003-0000-0000-0000-000000000003','caseworker@nrcs.org','$2b$10$xMlng6dI63qSsiqpTjFHheCIMUwwkNZcDTo1VQpgepKepnmggVYni','Nepal Red Cross — Case Worker','CASE_WORKER','11111111-0000-0000-0000-000000000001','EVENT-NP-TIBET-2026')
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- ============================================================
-- INFORMATION UPDATES
-- ============================================================
INSERT INTO information_update
    (information_id, event_id, content, information_type, verification_status, audience, visibility_level, created_by, created_at)
VALUES
    ('00000002-0000-0000-0000-000000000001','EVENT-NP-TIBET-2026','NDRRMA confirms 9 hydropower tunnel sites affected across Rasuwa and Sindhupalchok. Approximately 143 workers unaccounted across all sites. Search and rescue operations active at all sites.','STATUS_UPDATE','VERIFIED','EVENT','PUBLIC','SYSTEM','2026-09-02T09:30:00Z'),
    ('00000002-0000-0000-0000-000000000002','EVENT-NP-TIBET-2026','Nepal Army Chief confirms 7 engineering units deployed across rescue sites. International SAR support (India NDRF, UK ISAR) has arrived in Kathmandu.','STATUS_UPDATE','VERIFIED','EVENT','PUBLIC','SYSTEM','2026-09-02T14:15:00Z'),
    ('00000002-0000-0000-0000-000000000003','EVENT-NP-TIBET-2026','Ministry of Health: 12 hospitals in Bagmati Province on emergency footing. Blood reserves increased. Trauma specialists from TUTH and Bir Hospital on standby.','STATUS_UPDATE','VERIFIED','EVENT','PUBLIC','SYSTEM','2026-09-02T16:00:00Z'),
    ('00000002-0000-0000-0000-000000000004','EVENT-NP-TIBET-2026','Nepal Red Cross: 14 district branches activated. Family tracing desks operational in Kathmandu, Rasuwa, Sindhupalchok, Nuwakot, Dolakha. 2,847 family inquiries registered as of 3 September.','STATUS_UPDATE','VERIFIED','EVENT','PUBLIC','SYSTEM','2026-09-03T08:00:00Z'),
    ('00000002-0000-0000-0000-000000000005','EVENT-NP-TIBET-2026','Emergency embassy hotlines confirmed: India +977-1-4410900 | China +977-1-4417527 | Bangladesh +977-1-4416278. Contact your embassy directly for consular assistance.','STATUS_UPDATE','VERIFIED','EVENT','PUBLIC','SYSTEM','2026-09-03T10:00:00Z'),
    ('00000002-0000-0000-0000-000000000006','EVENT-NP-TIBET-2026','Rasuwagadhi rescue: Air vent installed at 38.2m into Cavern B-2. Oxygen 20.4%. Nutrients delivered via 75mm conduit. 14 extracted, 32 in refuge. Drill estimated to break through in 18–24 hours.','STATUS_UPDATE','VERIFIED','EVENT','PUBLIC','SYSTEM','2026-09-03T12:00:00Z'),
    ('00000002-0000-0000-0000-000000000007','EVENT-NP-TIBET-2026','Araniko Highway partial reopening: Kathmandu–Barabise open for light vehicles. Barabise–Tatopani remains blocked. Full clearance: 10–14 days.','STATUS_UPDATE','VERIFIED','EVENT','PUBLIC','SYSTEM','2026-09-03T09:00:00Z'),
    ('00000002-0000-0000-0000-000000000008','EVENT-NP-TIBET-2026','Missing persons: 4,312 reported unaccounted. 1,876 matched to safe declarations or hospital records. 2,436 remain unresolved. DNA identification opens 5 September.','STATUS_UPDATE','VERIFIED','EVENT','PUBLIC','SYSTEM','2026-09-03T14:00:00Z')
ON CONFLICT (information_id) DO NOTHING;
