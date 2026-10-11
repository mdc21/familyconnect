/**
 * Test Suite: SPEC-011 Phase 3 — Paper Record Digitisation Pipeline
 *
 * Verifies:
 * 1. Server-side OCR & structured field extraction (POST /api/v1/scan/extract)
 *    across all 6 supported paper form types:
 *    - POLICE_INTAKE
 *    - HOSPITAL_ADMISSION
 *    - SHELTER_REGISTRATION
 *    - RESCUE_SITE
 *    - DEATH_CERTIFICATE
 *    - COMMUNITY_DAMAGE
 * 2. Field confidence scoring (high, medium, low) and validation
 * 3. Multi-record tabular layout extraction for shelter sheets (§6.5)
 * 4. AI Fuzzy case matching (POST /api/v1/cases/match) (§6.6):
 *    - Name, age, sex, and location similarity
 *    - Cross-script transliteration awareness (Latin <-> Devanagari)
 *    - Threshold >= 0.85 generates POTENTIAL_MATCH
 *    - BR-001 guardrail: Proposes match, never silently merges or closes cases
 *    - Audit event generation
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/app');
const { pool } = require('../src/db');
const {
    computePersonMatchScore,
    stringSimilarity,
    levenshteinDistance
} = require('../src/services/matching/fuzzyMatcher');

let server;
let baseUrl;

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

after(async () => {
    if (server) {
        await new Promise(resolve => server.close(resolve));
    }
});

describe('SPEC-011 Phase 3 — Paper Record Digitisation & OCR Pipeline', () => {

    it('Fuzzy Matcher: Calculates accurate cross-script and phonetic similarity', () => {
        // Transliteration match
        const sim1 = stringSimilarity('Ramesh Thapa', 'रमेश थापा');
        assert.ok(sim1 >= 0.85, `Expected >= 0.85 for transliteration, got ${sim1}`);

        // Name token swap
        const sim2 = stringSimilarity('Ramesh Thapa', 'Thapa, Ramesh');
        assert.ok(sim2 >= 0.85, `Expected >= 0.85 for token swap, got ${sim2}`);

        // Typo tolerance
        const sim3 = stringSimilarity('Ramesh Thapa', 'Rameesh Thapaa');
        assert.ok(sim3 >= 0.80, `Expected >= 0.80 for minor typo, got ${sim3}`);

        // Different names
        const sim4 = stringSimilarity('Ramesh Thapa', 'Sita Sharma');
        assert.ok(sim4 < 0.4, `Expected < 0.4 for different names, got ${sim4}`);
    });

    it('Fuzzy Matcher: Composite score penalizes clear gender mismatch', () => {
        const target = { name: 'Ramesh Thapa', age: 34, sex: 'Male', location: 'Rasuwa' };
        const candidateSame = { name: 'Ramesh Thapa', age: 35, sex: 'Male', location: 'Rasuwa Camp' };
        const candidateFemale = { name: 'Ramesh Thapa', age: 35, sex: 'Female', location: 'Rasuwa' };

        const scoreSame = computePersonMatchScore(target, candidateSame);
        const scoreFemale = computePersonMatchScore(target, candidateFemale);

        assert.ok(scoreSame.overall >= 0.85, `Expected high match for same sex, got ${scoreSame.overall}`);
        assert.ok(scoreFemale.overall < 0.50, `Expected low match for conflicting sex, got ${scoreFemale.overall}`);
    });

    it('POST /api/v1/scan/extract processes POLICE_INTAKE record accurately', async () => {
        const rawText = `
            FIRST INFORMATION REPORT / POLICE INTAKE
            Police Station: Rasuwagadhi
            Case No: FIR-2026-9812
            Name: Bikram Adhikari
            Age: 42
            Sex: Male
            Last Seen Location: Syabrubesi Bridge
            Date Last Seen: 2026-09-27
            Reported By: Sunita Adhikari (Wife)
        `;

        const res = await fetch(`${baseUrl}/api/v1/scan/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText, formType: 'POLICE_INTAKE' })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.formType, 'POLICE_INTAKE');
        assert.equal(data.fields.name.value, 'Bikram Adhikari');
        assert.equal(data.fields.age.value, '42');
        assert.equal(data.fields.sex.value, 'Male');
        assert.equal(data.fields.police_case_ref.value, 'FIR-2026-9812');
        assert.equal(data.fields.name.confidence, 'high');
        assert.ok(data.overallConfidence >= 0.8);
    });

    it('POST /api/v1/scan/extract processes HOSPITAL_ADMISSION record', async () => {
        const rawText = `
            DISTRICT HOSPITAL ADMISSIONS REGISTER
            Patient Name: Anita Gurung
            Age: 29
            Sex: Female
            Injury: Compound fracture left tibia
            Ward: Orthopedic Ward Bed 14
            Admission Date: 2026-09-28
            Status: Admitted
            Record No: IPD-8421
        `;

        const res = await fetch(`${baseUrl}/api/v1/scan/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.formType, 'HOSPITAL_ADMISSION');
        assert.equal(data.fields.name.value, 'Anita Gurung');
        assert.equal(data.fields.age.value, '29');
        assert.equal(data.fields.sex.value, 'Female');
        assert.equal(data.fields.admission_status.value, 'Admitted');
        assert.equal(data.fields.hospital_ref.value, 'IPD-8421');
    });

    it('POST /api/v1/scan/extract processes RESCUE_SITE register', async () => {
        const rawText = `
            NDRF FIELD EXTRACTION LOG
            Rescue Team: Unit 7 NDRF
            Rescued Person: Pemba Sherpa
            Rescue Location: Langtang Trail km 14
            Rescue Time: 2026-09-28 09:30
            Condition: Stable
            Transferred To: Trishuli District Hospital
        `;

        const res = await fetch(`${baseUrl}/api/v1/scan/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText, formType: 'RESCUE_SITE' })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.formType, 'RESCUE_SITE');
        assert.equal(data.fields.name.value, 'Pemba Sherpa');
        assert.equal(data.fields.condition.value, 'Stable');
        assert.equal(data.fields.destination.value, 'Trishuli District Hospital');
    });

    it('POST /api/v1/scan/extract flags governance warning for DEATH_CERTIFICATE (§8)', async () => {
        const rawText = `
            MORTUARY REGISTER / DEATH CERTIFICATE
            Deceased Name: Unknown Male
            Estimated Age: 55
            Sex: Male
            Location Found: Trishuli River Bank
            Date Found: 2026-09-28
            Certificate No: PM-2026-042
        `;

        const res = await fetch(`${baseUrl}/api/v1/scan/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText, formType: 'DEATH_CERTIFICATE' })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.formType, 'DEATH_CERTIFICATE');
        assert.ok(data.warnings.length > 0, 'Must contain governance warning for death certificate');
        assert.ok(data.warnings[0].includes('SPEC-011 §8'));
    });

    it('POST /api/v1/scan/extract parses COMMUNITY_DAMAGE assessment', async () => {
        const rawText = `
            COMMUNITY DAMAGE ASSESSMENT REPORT
            Village: Mailung Ward 4
            Affected Households: 85
            Damage Category: Severely Damaged
            Infrastructure Affected: Water supply pipeline, primary school
            Circle Officer: D. K. Sharma
            Assessment Date: 2026-09-28
        `;

        const res = await fetch(`${baseUrl}/api/v1/scan/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText, formType: 'COMMUNITY_DAMAGE' })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.formType, 'COMMUNITY_DAMAGE');
        assert.equal(data.fields.village.value, 'Mailung Ward 4');
        assert.equal(data.fields.household_count.value, '85');
        assert.equal(data.fields.damage_category.value, 'Severely Damaged');
    });

    it('POST /api/v1/scan/extract tabular multi-row extraction for shelter registration (§6.5)', async () => {
        const rawText = `
            RELIEF CAMP SHELTER REGISTRATION SHEET
            S.No | Name | Age | Sex | Origin Village | Camp Location
            1. Ramesh Thapa, 34, Male, Rasuwagadhi, Camp Alpha
            2. Sita Sharma, 28, Female, Dhunche, Camp Alpha
            3. Hari Prasad, 52, Male, Syabrubesi, Camp Alpha
            4. Gita Tamang, 19, Female, Langtang, Camp Alpha
        `;

        const res = await fetch(`${baseUrl}/api/v1/scan/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawText, formType: 'SHELTER_REGISTRATION' })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.isTabular, true);
        assert.equal(data.records.length, 4);
        assert.equal(data.records[0].name, 'Ramesh Thapa');
        assert.equal(data.records[0].age, 34);
        assert.equal(data.records[0].sex, 'Male');
        assert.equal(data.records[1].name, 'Sita Sharma');
        assert.equal(data.records[1].sex, 'Female');
    });

    it('POST /api/v1/cases/match detects potential match and enforces BR-001 guardrail (§6.6)', async () => {
        // Seed an open missing person case
        let testCaseRef = `FC-TEST-${Date.now()}`;
        try {
            const client = await pool.connect();
            // Get or create valid disaster_event
            let eventId = 'EVENT-TEST-001';
            const evtRes = await client.query('SELECT event_id FROM disaster_event LIMIT 1');
            if (evtRes.rows.length > 0) {
                eventId = evtRes.rows[0].event_id;
            } else {
                await client.query(`INSERT INTO disaster_event (event_id, event_name, event_type, country) VALUES ($1, 'Test Event', 'FLOOD', 'NP') ON CONFLICT DO NOTHING`, [eventId]);
            }

            const pRes = await client.query(
                `INSERT INTO person (first_name, last_name, approximate_age, gender)
                 VALUES ('Ramesh', 'Thapa', 34, 'Male') RETURNING person_id`
            );
            const personId = pRes.rows[0].person_id;
            const cRes = await client.query(
                `INSERT INTO case_record (case_reference, event_id, case_type, status, primary_person_id)
                 VALUES ($1, $2, 'MISSING_PERSON', 'NEW', $3) RETURNING case_id`,
                [testCaseRef, eventId, personId]
            );
            await client.query(
                `INSERT INTO missing_report (case_id, person_id, last_known_location)
                 VALUES ($1, $2, $3)`,
                [cRes.rows[0].case_id, personId, JSON.stringify({ description: 'Rasuwagadhi' })]
            );
            client.release();
        } catch (dbErr) {
            console.warn('DB seed error in test:', dbErr.message);
        }

        // Match against candidate
        const res = await fetch(`${baseUrl}/api/v1/cases/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Ramesh Thapa',
                age: 34,
                sex: 'Male',
                location: 'Rasuwagadhi',
                recordType: 'HOSPITAL_ADMISSION',
                scanRef: 'FC-PAPER-998811'
            })
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(data.hasPotentialMatch, 'Should have flagged a potential match');
        assert.ok(data.topConfidence >= 0.85, `Confidence ${data.topConfidence} should be >= 0.85`);
        assert.ok(data.policy.includes('BR-001'), 'Must declare BR-001 human confirmation policy');

        // Confirm case status was NOT modified (BR-001 guardrail)
        const check = await pool.query(
            `SELECT status FROM case_record WHERE case_reference = $1`,
            [testCaseRef]
        );
        if (check.rows.length > 0) {
            assert.equal(check.rows[0].status, 'NEW', 'Status must remain NEW until human caseworker confirms');
        }
    });

    it('POST /api/v1/cases/match rejects missing name with 400 problem+json', async () => {
        const res = await fetch(`${baseUrl}/api/v1/cases/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ age: 25 })
        });

        assert.equal(res.status, 400);
        const err = await res.json();
        assert.equal(err.code, 'FC_ERR_400_INVALID_SCHEMA');
    });
});
