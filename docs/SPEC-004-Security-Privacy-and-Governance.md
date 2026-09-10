### SPEC-004 — SECURITY, PRIVACY, GOVERNANCE & SAFEGUARDING SPECIFICATION FamilyConnect: Disaster Family Assistance, Reconnection & Coordination Platform Version: 0.2 Status: Revised Baseline — Recommended for Approval Parent Specifications: SPEC-001 v0.3, SPEC-002 v0.2, SPEC-003 v0.2

## 1. Governance Principles

FamilyConnect ensures that humanitarian assistance does not introduce new physical, emotional, or digital risks. The platform enforces Minimum Necessary Disclosure: actors receive only the specific data fields required for their verified purpose, and family communications remain strictly partitioned from public or unrelated claimant visibility.

## 2. Controller / Processor / Joint Controller Model

FamilyConnect cannot assume a hard-coded Data Controller. The governance model requires a formal determination process prior to any disaster deployment: **Disaster Event → Governance Authority → Legal Determination → Controller/Processor Assignment → Data Processing Agreement (DPA) → System Configuration**. FamilyConnect may be deployed by Nepalese authorities, an international NGO, or a humanitarian consortium. The platform software acts as the Processor, configurable to the legal mandates of the designated Controller(s).

## 3. Processing Purpose & Legal Basis

Processing relies on a configured Legal Basis Registry, eliminating the unsafe assumption of a universal transition to explicit consent.


| Data Category | Purpose | Legal Basis (Example) | Controller | Retention |
| --- | --- | --- | --- | --- |
| Safety Declaration | Reconnection | Vital Interest / Consent | Configured per event | Configurable |
| Missing Report | Locate Person | Public Task / Vital Interest | Configured per event | Configurable |
| Medical Info | Identification | Restricted Statutory | Hospital / Authority | Legal Hold |
| Family Contact | Communication | Legitimate Interest / Consent | Configured per event | Configurable |
| Safeguarding | Protection | Statutory / Vital Interest | Police / Child Services | Statutory |

## 4. Data Classification

The platform implements a strict four-tier data classification hierarchy:

- **PUBLIC:** Safe for public dissemination (e.g., general disaster updates, assistance centre locations).
- **CONTROLLED:** Accessible to authenticated users with legitimate, verified case access (e.g., case status, verified routing updates).
- **SENSITIVE:** Personal, family, logistical, and emotional support information (e.g., psychosocial referrals, family locations).
- **HIGHLY_RESTRICTED:** Safeguarding alerts, biometrics, forensic data, exact vulnerable-person locations, identity documents, and law-enforcement records.
## 5. Identity Assurance Levels (IAL)

Not all users possess equal identity verification. Access scales strictly with IAL:

- **IAL-0 (Anonymous):** Public API access only.
- **IAL-1 (Contact Verified):** Email/SMS OTP verified.
- **IAL-2 (Identity Reasonably Verified):** Document upload or physical Red Cross verification.
- **IAL-3 (Authority Verified):** Verified by an embassy, police, or hospital liaison.
- **IAL-4 (Statutory/Strong):** Cryptographic MFA backed by a recognized statutory organization.
## 6. Authentication & Authorisation

Authentication establishes *who* the actor is (IAL); authorisation establishes *what* they can do based on the separation of concepts:

- **Consent:** "I agree my info can be shared for this purpose."
- **Family Authorisation:** "This person is verified to receive case updates."
- **Legal Authority:** "This agency has statutory rights to this data."
- **Emergency Disclosure:** "Data disclosed immediately to preserve life."
## 7. Purpose-Based Access Control

Access requires a mathematically enforced matrix: Actor + Role + Case Relationship + Data Classification + PurposeOfAccess.

Valid purposes include: LIFE_SAFETY, IDENTIFICATION, FAMILY_RECONNECTION, MEDICAL_CARE, SAFEGUARDING, CONSULAR_SUPPORT, FORENSIC_IDENTIFICATION, HUMANITARIAN_ASSISTANCE.

## 8. Family Authorisation

Relationships are not assumed via shared case references. Evidence requirements scale dynamically: SELF_ASSERTED → PERSONAL_KNOWLEDGE → DOCUMENTARY → AUTHORITY_VERIFIED → DIRECT_PERSON_CONFIRMATION. Documentary proof is not strictly mandated if IAL-2 physical verification is achieved, accommodating disaster victims without documents.

## 9. Disputed Claims

When multiple families claim the same person or dispute case ownership:

- The system generates a CaseDispute.
- Data sharing is instantly frozen (RESTRICTED_PENDING_REVIEW).
- Claimants are blinded to each other's contact information and location.
- A CASE_WORKER or legal authority must arbitrate the dispute.
## 10. Consent, Restriction, Withdrawal & Correction

Right to Erasure is replaced with a granular Privacy Preference Engine. An affected person can declare:

- *Status:* "I am safe".
- *Notification:* "Tell my family."
- *Restriction:* "Do not share my exact location, phone number, or medical data."
- *Objection:* "Hide my identity from Claimant B."
## 11. Emergency / Break-Glass Disclosure

Bypassing standard locks requires a formal Emergency Disclosure Protocol resulting in an immutable AuditEvent:

- **Action:** Explicit EMERGENCY_DISCLOSURE trigger.
- **Inputs:** Reason code, case reference, specific fields requested, intended recipient, purpose, and time-limit.
- **Output:** Minimum necessary data released.
- **Governance:** Automatic audit generation, mandatory post-incident review, and immediate capability to revoke access.
## 12. Children & Vulnerable Adults

A SafeguardingAlert entirely removes a minor's profile from public or standard family views. Physical custody transfers mandate a SafeguardingHandover API transaction, capturing the receiving officer's badge/ID and ensuring a legally auditable chain of custody.

## 13. Medical & Hospital Information

Hospitals receive Minimum Necessary Disclosure. To facilitate IDENTIFICATION, hospitals may query physical descriptors and upload IdentityEvidence. They are shielded from family financial data, disputes, or non-medical history. Families are notified of a hospital location but denied specific clinical diagnoses unless explicitly authorized by the patient or medical authority.

## 14. Forensic & Deceased-Person Information

AI cannot determine death. DECEASED_PERSON transitions require statutory forensic confirmation. **Family Notification Protocol:** FamilyConnect is strictly prohibited from autonomously triggering digital death notifications. Forensic confirmation routes to a designated authority, triggering human-mediated bereavement contact before any digital system update is visible to the family.

## 15. Cross-Border Data Sharing

In the Nepal–Tibet–India context, data localization and flow are heavily restricted:

- Data resides in a sovereign/compliant cloud.
- Flows are restricted by recipient organization type and permitted data categories.
- Embassies access only verified nationals via a restricted ConsularCase.
- Onward-transfer of bulk database records across borders is technologically blocked.
## 16. Agency & Organisation Verification

An individual claiming police or hospital affiliation receives zero privileges until the chain is validated:

Organisation Registered → Organisation Authenticated → User Verified → Role Assigned → Permissions Granted.

## 17. Trusted Intermediaries

Because families may lack connectivity, Trusted Intermediaries (Red Cross volunteers, community leaders) can act via proxy. Intermediaries can submit information, request assistance, and receive operational routing instructions, but they do *not* inherit the family's right to view protected historical case data.

## 18. Information Source & Verification

To combat misinformation, all data updates require a structured reliability matrix: SourceType + SourceOrganisation + VerificationStatus + ReliabilityLevel + EvidenceReference. SOCIAL_MEDIA / UNVERIFIED is strictly segregated from POLICE / VERIFIED.

## 19. Misinformation Governance

Rumours are isolated as event-level entities. Authorities can evaluate a DisasterRumour, issue a formal RumourCorrected event, and broadcast debunked claims (e.g., false dam bursts) to all authorized users to prevent panic, without exposing the underlying falsehood as truth.

## 20. Data Retention & Legal Holds

Arbitrary 30-day thresholds are removed. The system relies on configurable policies: ReviewThreshold, RetentionPolicy, HandoverPolicy, and LegalHold. Cases may remain open for months or years based on active investigation requirements or statutory legal holds.

## 21. External Case Handover

When disaster deployment concludes, cases trigger a formal CaseHandover to external statutory systems (e.g., ICRC Tracing). This generates an ExternalCaseReference while retaining an immutable, locked archive of the original audit history for legal compliance.

## 22. Audit & Accountability

All status changes, emergency disclosures, and authorization modifications trigger append-only, tamper-evident AuditEvent records. These logs are segregated from standard administrative access.

## 23. Security Incident / Breach

Upon detecting an anomaly (e.g., brute-force enumeration attempts):

- Public APIs are rate-limited or disabled.
- HIGHLY_RESTRICTED access is locked down.
- Audits are isolated.
- Data Controllers are immediately alerted.
## 24. Disaster Continuity & Offline Operations

To survive telecommunications failures, offline operations (VHF radio, paper logs) are natively supported. Case workers retroactively sync physical interventions via the CommunicationAttempt endpoint, maintaining digital/physical parity.

## 25. Data Subject / Family Requests

Subject access requests support granular adjustments: families can correct physical descriptors, restrict disclosure scopes, or object to specific agency sharing without being forced into complete account erasure.

## 26. Third-Party & Partner Governance

No API integration is granted without an executed DPA and Partner API Key scoped exclusively to Minimum Necessary Disclosure principles.

## 27. AI Governance

AI is strictly relegated to non-authoritative support (translation, summarization, duplicate flagging). AI is technologically prohibited from confirming identity, changing authorization states, confirming death, or executing safeguarding handovers.

## 28. Security Testing & Assurance

The platform design natively mitigates the 25 specified red-team disaster scenarios, spanning false rescues, offline states, hospital ID requests, hostile family disputes, and unauthorized enumeration.

## 29. Privacy Impact Assessment (PIA)

Before production deployment, a mandatory PIA must document exact local parameters for: data residency, cross-border flows, forensic handling, children's data, dispute resolution, and system compromise recovery.

## 30. Deployment Approval Gate

**SPEC-004 v0.2 is APPROVED.** Implementation must not proceed to SPEC-005 (Architecture & Deployment) until the designated Data Controller has signed off on the Privacy Impact Assessment and Legal Basis Registry.
