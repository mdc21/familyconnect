-- ============================================================
    -- ASSAM FLOOD SEED DATA
-- ============================================================

-- DISASTER EVENT (idempotent upsert)
INSERT INTO disaster_event (event_id, name, status, governance_authority, data_controller, data_residency)
VALUES (
    'EVENT-IN-FL-2026-1187',
    'Assam Brahmaputra Basin Flooding 2026',
    'ACTIVE',
    'Assam State Disaster Management Authority (ASDMA)',
    'Government of Assam / ASDMA',
    'ap-south-1'
)
ON CONFLICT (event_id) DO NOTHING;

-- ASSISTANCE CENTRES
INSERT INTO assistance_centre
    (centre_id, organisation_id, event_id, name, location, opening_hours, services, languages, accessibility, emergency_contact, operational_status)
VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','EVENT-IN-FL-2026-1187','Guwahati Central Relief Hub — Nehru Stadium','{"address":"Nehru Stadium, B. Borooah Road, Guwahati","district":"Kamrup Metropolitan","lat":26.1738,"lng":91.7580,"landmark":"Inside Stadium Complex"}','Open 24 hours / 7 days',ARRAY['Relief distribution','Medical triage','Temporary shelter','Food and water distribution'],ARRAY['Assamese','Hindi','English'],'Wheelchair accessible. Ground floor operations.','+91-361-2237042','OPEN'),
    ('aaaaaaaa-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','EVENT-IN-FL-2026-1187','Sivasagar District Rescue Station','{"address":"Sivasagar Civil Hospital Compound, Sivasagar","district":"Sivasagar","lat":26.9829,"lng":94.6366,"landmark":"Adjacent to Civil Hospital"}','06:00–22:00 daily',ARRAY['Missing person registration','Emergency medical care','Boat rescue coordination','Safe-person lists'],ARRAY['Assamese','English'],'Ramp available for stretcher access.','+91-3777-222137','OPEN'),
    ('aaaaaaaa-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000002','EVENT-IN-FL-2026-1187','Goalpara Evacuation Point','{"address":"Goalpara Town Hall","district":"Goalpara","lat":26.1734,"lng":90.6253,"landmark":"Near District Collector Office"}','07:00–21:00 daily',ARRAY['Family tracing','Shelter referrals','Hygiene kits distribution'],ARRAY['Assamese','Goalpariya','Hindi'],'Level access at main entrance.','+91-3662-240030','OPEN')
ON CONFLICT (centre_id) DO NOTHING;

-- DISASTER RUMOURS
INSERT INTO disaster_rumour
    (rumour_id, event_id, claim, source, affected_area, verification_status, response_message, verification_source, publication_status)
VALUES
    ('bbbbbbbb-0000-0000-0000-000000000001','EVENT-IN-FL-2026-1187','Kaziranga National Park animals are attacking villages due to flood displacement.','WhatsApp / Facebook','Golaghat / Nagaon','FALSE','FALSE: Kaziranga forest guards confirm no such incidents. Animals are sheltering on high ground constructed within the park. Do not spread panic.','Kaziranga Park Authority / ASDMA','BROADCASTED'),
    ('bbbbbbbb-0000-0000-0000-000000000002','EVENT-IN-FL-2026-1187','The Brahmaputra River embankment at Majuli has completely collapsed.','Twitter/X','Majuli','FALSE','FALSE: Majuli embankment is intact. Minor seepage was reported and is actively being reinforced by the Water Resources Department.','Water Resources Department, Assam','BROADCASTED'),
    ('bbbbbbbb-0000-0000-0000-000000000003','EVENT-IN-FL-2026-1187','NDRF helicopters are charging money for rescue operations in Sivasagar.','Local messaging groups','Sivasagar','FALSE','FALSE: NDRF and SDRF rescues are 100% free of charge. Please report any such demands to local police immediately.','NDRF / Assam Police','BROADCASTED')
ON CONFLICT (rumour_id) DO NOTHING;

-- INFORMATION UPDATES
INSERT INTO information_update
    (information_id, event_id, audience, content, verification_status, information_type, created_at)
VALUES
    ('cccccccc-0000-0000-0000-000000000001','EVENT-IN-FL-2026-1187','EVENT','ASDMA reports 15 districts affected by Brahmaputra overflowing. Over 250,000 displaced. NDRF and SDRF teams deployed.','VERIFIED','STATUS_UPDATE','2026-09-04T09:30:00Z'),
    ('cccccccc-0000-0000-0000-000000000002','EVENT-IN-FL-2026-1187','EVENT','Brahmaputra River flowing above danger mark at Neamatighat (Jorhat) and Tezpur. Ferry services suspended until further notice.','VERIFIED','LOCATION','2026-09-04T10:15:00Z'),
    ('cccccccc-0000-0000-0000-000000000003','EVENT-IN-FL-2026-1187','EVENT','13 massive relief camps opened across Goalpara, Sivasagar, and Biswanath districts. Food and medical aid being provided by district administration.','VERIFIED','LOCATION','2026-09-04T14:00:00Z'),
    ('cccccccc-0000-0000-0000-000000000004','EVENT-IN-FL-2026-1187','EVENT','Kaziranga National Park: 80% area inundated. Forest guards conducting round-the-clock patrols. Speed limit restricted to 20km/h on NH-715 to protect animal crossings.','VERIFIED','STATUS_UPDATE','2026-09-05T08:00:00Z'),
    ('cccccccc-0000-0000-0000-000000000005','EVENT-IN-FL-2026-1187','EVENT','Ministry of Health dispatching 50 additional medical teams with anti-venom and water-purification tablets to lower Assam districts to prevent water-borne diseases.','VERIFIED','MEDICAL','2026-09-05T09:00:00Z')
ON CONFLICT (information_id) DO NOTHING;

-- AI NEWS ITEMS (For public news feed to link with information updates)
INSERT INTO ai_news_item
    (news_id, event_id, title, summary, source_name, source_type, category, status, published_as_update_id)
VALUES
    ('dddddddd-0000-0000-0000-000000000001', 'EVENT-IN-FL-2026-1187', 'ASDMA Alert: 15 Districts Affected', 'ASDMA reports 15 districts affected by Brahmaputra overflowing.', 'Assam State Disaster Management Authority', 'OFFICIAL_AUTHORITY', 'RESCUE', 'PUBLISHED', 'cccccccc-0000-0000-0000-000000000001'),
    ('dddddddd-0000-0000-0000-000000000002', 'EVENT-IN-FL-2026-1187', 'Brahmaputra River Over Danger Mark', 'Brahmaputra flowing above danger mark at Neamatighat and Tezpur.', 'Central Water Commission', 'OFFICIAL_AUTHORITY', 'INFRASTRUCTURE', 'PUBLISHED', 'cccccccc-0000-0000-0000-000000000002'),
    ('dddddddd-0000-0000-0000-000000000003', 'EVENT-IN-FL-2026-1187', '13 Relief Camps Opened', '13 massive relief camps opened across Goalpara, Sivasagar, and Biswanath districts.', 'Assam State Govt', 'OFFICIAL_AUTHORITY', 'AID', 'PUBLISHED', 'cccccccc-0000-0000-0000-000000000003'),
    ('dddddddd-0000-0000-0000-000000000004', 'EVENT-IN-FL-2026-1187', 'Kaziranga Inundated', 'Kaziranga National Park 80% inundated. Animal patrols active.', 'Kaziranga Park Authority', 'OFFICIAL_AUTHORITY', 'RESCUE', 'PUBLISHED', 'cccccccc-0000-0000-0000-000000000004'),
    ('dddddddd-0000-0000-0000-000000000005', 'EVENT-IN-FL-2026-1187', 'Medical Teams Dispatched', 'Ministry of Health dispatching 50 medical teams with anti-venom.', 'Ministry of Health, Assam', 'HOSPITAL', 'AID', 'PUBLISHED', 'cccccccc-0000-0000-0000-000000000005')
ON CONFLICT (news_id) DO NOTHING;

-- COORDINATOR ACCOUNTS (Assam Responders)
INSERT INTO coordinator_account (account_id, email, password_hash, display_name, role, organisation_id, event_id)
VALUES
    ('ca000004-0000-0000-0000-000000000001','coordinator@asdma.assam.gov.in','$2b$10$xMlng6dI63qSsiqpTjFHheCIMUwwkNZcDTo1VQpgepKepnmggVYni','ASDMA Authority — Assam Govt','AUTHORITY','11111111-0000-0000-0000-000000000002','EVENT-IN-FL-2026-1187'),
    ('ca000005-0000-0000-0000-000000000001','caseworker@redcross.org.in','$2b$10$xMlng6dI63qSsiqpTjFHheCIMUwwkNZcDTo1VQpgepKepnmggVYni','Indian Red Cross — Assam Branch','CASE_WORKER','11111111-0000-0000-0000-000000000001','EVENT-IN-FL-2026-1187')
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
