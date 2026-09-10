-- Minimal seed data the SPEC-007 integration gate suite depends on.
INSERT INTO disaster_event (event_id, name)
VALUES ('EVENT-NP-TIBET-2026', 'Nepal-Tibet Test Event')
ON CONFLICT DO NOTHING;
