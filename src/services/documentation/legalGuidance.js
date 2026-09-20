/**
 * SPEC-008 §6 (FR-008-010) & Module M10 — Documentation Guidance & Legal Content
 * 
 * Provides statutory legal guidance and process templates for vital documentation:
 *   - Nepali Death Certificate (मृत्यु दर्ता)
 *   - Nepali Citizenship Replacement / Identity Restoration (नागरिकता प्रतिलिपि)
 *   - NDRRMA Disaster Relief Card (विपद् पीडित परिचय पत्र)
 * 
 * Statutory Boundary (BR-008-010 / FR-008-010):
 * FamilyConnect provides procedural tracking, guidance and document checklists.
 * It DOES NOT issue official certificates. Official certificates must be issued
 * exclusively by authorized government registrars (Ward Secretary / DAO).
 */

const LEGAL_GUIDANCE_TEMPLATES = {
    NEPALI_DEATH_CERTIFICATE: {
        processType: 'NEPALI_DEATH_CERTIFICATE',
        title: 'Nepali Death Registration Certificate (मृत्यु दर्ता प्रमाणपत्र)',
        authorityName: 'Ward Office / Local Registrar (स्थानीय पञ्जिकाधिकारीको कार्यालय - वडा कार्यालय)',
        statutoryBasis: 'Birth, Death and Other Vital Events (Registration) Act, 2033 (1976) & Local Government Operation Act, 2074 (स्थानीय सरकार सञ्चालन ऐन, २०७४)',
        statutoryDisclaimer: 'NOTICE: FamilyConnect facilitates document preparation and status tracking only. Under Section 4 of the Vital Events Act 2033, only the Ward Secretary (Local Registrar) is legally empowered to issue an official Death Certificate.',
        standardTimeline: 'Within 35 days of death (Free of charge; nominal penalty fee applicable after 35 days per local municipality bylaws).',
        disasterSpecialProcedure: 'For victims of landslides, glacial lake outburst floods, or missing persons where a body is unrecovered, registration requires an official Police Investigation Inquest Report (प्रहरी मुचुल्का / सर्जमिन मुचुल्का) and District Disaster Management Committee (DDMC) verification before the Ward Office can issue the certificate.',
        requiredDocuments: [
            {
                name: 'Hospital Death Certificate or Police Inquest Report (अस्पतालको मृत्यु प्रमाणपत्र वा प्रहरी मुचुल्का)',
                required: true,
                description: 'Original death confirmation from hospital or on-site police inquest report (Sarjamin Muchulka) signed by local representatives.'
            },
            {
                name: 'Applicant Citizenship Certificate (निवेदकको नागरिकता प्रमाणपत्र)',
                required: true,
                description: 'Original and photocopy of citizenship certificate of immediate kin/informant (spouse, child, parent).'
            },
            {
                name: 'Deceased Person Citizenship Certificate or Identification (मृतकको नागरिकता प्रमाणपत्र वा परिचयपत्र)',
                required: true,
                description: 'Original or copy of deceased person’s citizenship certificate, voter card, or national identity card.'
            },
            {
                name: 'Relationship Verification (नाता प्रमाणित सिफारिस)',
                required: false,
                description: 'Relationship certificate or verification from the local Ward Office confirming relation to the deceased.'
            },
            {
                name: 'Witness Statements with Citizenship Copies (साक्षीहरूको नागरिकता प्रतिलिपि)',
                required: true,
                description: 'Signatures and citizenship copies of two local witnesses residing within the same ward.'
            }
        ],
        steps: [
            { step: 1, title: 'Gather police and medical evidence', description: 'Obtain the police inquest report (Muchulka) from the local police station or post-mortem report if autopsy was conducted.' },
            { step: 2, title: 'Ward application submission', description: 'Submit the formal Vital Event Application Form (Schedule 2) at the local Ward Office.' },
            { step: 3, title: 'In-person witness verification', description: 'Ward Secretary inspects documents and takes witness testimony.' },
            { step: 4, title: 'Entry into National Civil Registration System', description: 'Record entered into the Department of National ID and Civil Registration (DoNIDCR) central database.' },
            { step: 5, title: 'Certificate issuance', description: 'Official stamped certificate issued by Local Registrar.' }
        ]
    },

    NEPALI_CITIZENSHIP_RESTORATION: {
        processType: 'NEPALI_CITIZENSHIP_RESTORATION',
        title: 'Replacement Citizenship Certificate (नागरिकता प्रतिलिपि)',
        authorityName: 'District Administration Office (जिल्ला प्रशासन कार्यालय - DAO)',
        statutoryBasis: 'Nepal Citizenship Act, 2063 (नेपाल नागरिकता ऐन, २०६३) and Nepal Citizenship Rules, 2063',
        statutoryDisclaimer: 'NOTICE: Citizenship replacement requires formal verification by the Chief District Officer (CDO) at the District Administration Office (DAO).',
        standardTimeline: '1 to 3 working days following recommendation from the local Ward Office.',
        disasterSpecialProcedure: 'For disaster survivors whose original documents and household records were destroyed by flood/debris, the Ward Office executes an expedited neighborhood verification (सर्जमिन) confirming permanent residency before forwarding the file to the DAO.',
        requiredDocuments: [
            {
                name: 'Ward Recommendation for Duplicate Citizenship (नागरिकता प्रतिलिपिको लागि वडा सिफारिस)',
                required: true,
                description: 'Official recommendation letter issued by the local Ward Chairperson or Secretary.'
            },
            {
                name: 'Police Lost Document Verification Report (प्रहरी प्रतिवेदन)',
                required: true,
                description: 'Police report confirming the destruction or loss of the original citizenship certificate in the disaster event.'
            },
            {
                name: 'Copy of Original Citizenship or Certificate Number (पुरानो नागरिकता नम्बर वा अभिलेख)',
                required: false,
                description: 'If physical copy is lost, the certificate number, issue date, and issuing DAO are cross-referenced with DAO archives (Dhadda / DoNIDCR).'
            },
            {
                name: 'Recent Passport-size Photographs (पासपोर्ट साइजको फोटो)',
                required: true,
                description: 'Two identical recent passport-size photographs with ears visible.'
            }
        ],
        steps: [
            { step: 1, title: 'File lost document report with Police', description: 'Report loss of citizenship at the nearest police post or assistance centre.' },
            { step: 2, title: 'Obtain Ward recommendation', description: 'Present police report and photo at the local Ward Office to obtain statutory recommendation.' },
            { step: 3, title: 'Submit file at DAO Citizenship Section', description: 'Present ward recommendation at the District Administration Office.' },
            { step: 4, title: 'Archive cross-verification', description: 'DAO officials match records against district ledger (ढाँचा / ढड्डा).' },
            { step: 5, title: 'Duplicate citizenship issued', description: 'Assistant Chief District Officer signs and issues the duplicate certificate.' }
        ]
    },

    DISASTER_VICTIM_RELIEF_CARD: {
        processType: 'DISASTER_VICTIM_RELIEF_CARD',
        title: 'Disaster Victim Identity & Relief Card (विपद् पीडित परिचय पत्र)',
        authorityName: 'Nepal Disaster Risk Reduction and Management Authority (NDRRMA) & Local Municipality',
        statutoryBasis: 'Disaster Risk Reduction and Management Act, 2074 (विपद् जोखिम न्यूनीकरण तथा व्यवस्थापन ऐन, २०७४)',
        statutoryDisclaimer: 'NOTICE: This card entitles eligible families to government emergency relief rations, reconstruction grant tranches, and subsidised shelter materials.',
        standardTimeline: '3 to 7 working days from on-site household damage assessment.',
        disasterSpecialProcedure: 'Joint mobile assessment teams (comprising Nepal Army/Police, Red Cross, and Municipal engineers) conduct household geotagged assessments.',
        requiredDocuments: [
            {
                name: 'Household Damage Assessment Form (घरधुरी क्षति विवरण फारम)',
                required: true,
                description: 'Official damage grade assessment (Grade 1 to Grade 5) signed by inspecting technical team.'
            },
            {
                name: 'Head of Household Citizenship Copy (घरमूलीको नागरिकता प्रतिलिपि)',
                required: true,
                description: 'Identification of designated head of household.'
            },
            {
                name: 'Land Ownership Certificate or Ward Land Tenure Verification (जग्गाधनी प्रमाणपुर्जा वा जग्गा बसोबास सिफारिस)',
                required: true,
                description: 'Proof of land tenure or Ward verification confirming long-term residence on vulnerable land.'
            }
        ],
        steps: [
            { step: 1, title: 'Technical damage survey', description: 'Municipal technical team conducts GPS-tagged structural assessment.' },
            { step: 2, title: 'Ward Committee validation', description: 'Local Disaster Management Committee reviews and certifies beneficiary list.' },
            { step: 3, title: 'Beneficiary card issued', description: 'Municipality issues embossed ID card for relief and reconstruction tranches.' }
        ]
    }
};

module.exports = {
    LEGAL_GUIDANCE_TEMPLATES,
    getGuidanceForProcess(processType) {
        return LEGAL_GUIDANCE_TEMPLATES[processType] || null;
    },
    getAllTemplates() {
        return Object.values(LEGAL_GUIDANCE_TEMPLATES);
    }
};
