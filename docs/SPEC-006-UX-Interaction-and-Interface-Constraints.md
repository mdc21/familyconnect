### SPEC-006 defines the user experience, interaction models, and interface constraints for the FamilyConnect Minimum Viable Product (MVP). It translates the strict API, privacy, and architectural controls established in SPEC-003 through SPEC-005 into trauma-informed, low-bandwidth interfaces optimized for disaster zones.

## 1. Core UX Principles

- **Trauma-Informed Design:** Families in disaster zones experience extreme emotional distress and limited cognitive bandwidth. Interfaces must use plain language, high-contrast visual cues, and avoid overwhelming users with unnecessary data fields.
- **No False Certainty:** The interface must visually differentiate between unverified claims and authoritative facts. AI-assisted matching must explicitly render as "Potential Match – Pending Human Review," never as a confirmed outcome.
- **Progressive Disclosure:** Sensitive data, such as medical routing or exact physical locations, is masked by default on family dashboards. Revealing it requires an explicit interaction (e.g., "Tap to Reveal") to prevent shoulder-surfing in crowded evacuation camps.
- **Low-Bandwidth Optimization:** The MVP interface must load rapidly over degraded 2G/3G networks common after earthquakes. The UI avoids heavy client-side frameworks, relying on minimal payloads and localized caching.
- **Offline Tolerance:** The interface must never silently discard user input during network drops. The UI must explicitly distinguish between "Saved Offline" and "Synced to Server" states.
## 2. The Kathmandu Scenario (Primary User Journey)

This journey validates the architectural acceptance criteria, guiding a distressed relative arriving in Kathmandu with minimal connectivity.


| Journey Phase | User Action | Interface Response | Privacy & Data Control |
| --- | --- | --- | --- |
| Arrival & Discovery | Scans QR code at airport or connects to low-bandwidth portal. | Loads lightweight landing page prioritizing immediate actions: "I Am Safe," "Report Missing," and "Find Assistance Centre." | Public API access only; no case enumeration or searchable databases exposed. |
| Case Registration | Submits basic details, last known contact, and relationship. | Issues a unique Case Reference ID. Displays an immediate SubmissionReceipt acknowledging triage. | Submission succeeds via idempotent POST request, protecting against accidental retries. |
| Authentication | Enters Case Reference and verifies identity via OTP or Red Cross worker. | Unlocks the restricted Family Dashboard based on Identity Assurance Level (IAL). | Enforces minimum necessary disclosure based on PurposeOfAccess. |
| Case Tracking | Views the case timeline and current status. | Shows verified updates. Displays the next_review_at timestamp to prevent feelings of abandonment during periods of no news. | Clinical or forensic evidence remains masked unless explicitly authorized by authorities. |
| Next Physical Action | Requests logistical assistance for accommodation. | Maps the request to the nearest physical Assistance Centre and logs the family's local footprint. | FamilyLocation data is classified as sensitive and hidden from public view. |

## 3. Public Interface (Affected Persons & Reporters)

- **I Am Safe Submission:** A single-page form collecting identity and contact preferences. The success screen must explicitly state, "Your declaration has been received and queued for verification," avoiding the false confirmation of SAFE_CONFIRMED before authoritative review.
- **Disaster Rumour Feed:** A dedicated public broadcast UI displaying corrected misinformation (e.g., debunked reports of a dam burst). This utilizes the RumourCorrected domain event to alleviate panic without elevating unverified claims.
- **Assistance Directory:** A highly cached, read-only list of operational hospitals, embassies, and Red Cross stations mapped to the GET /api/v1/assistance-centres endpoint.
## 4. Family & Proxy Dashboard

- **Timeline View:** The central UI for authorized relatives, displaying the chronological history of the case. Verified information from statutory authorities is badged with a distinct authoritative icon (e.g., a green shield).
- **Dispute Lock State:** If a CaseDispute is triggered by conflicting family claims, the dashboard visually locks. A persistent banner explains that data sharing is frozen (RESTRICTED_PENDING_REVIEW) pending human arbitration, masking all competing claimant details.
- **Proxy Appointment:** A dedicated management screen allowing families to delegate digital access to a TrustedIntermediary (e.g., a community worker or embassy official) with strict expiration dates and scoped permissions.
## 5. Case Worker & Agency Portal

- **Triage & Matching Queue:** Case Workers review AI-flagged PotentialMatchDetected events. The interface forces a mandatory, audited choice: "Confirm Match" or "Reject Match," logging the decision directly to the AuditEvent ledger.
- **Safeguarding Handovers:** When transferring custody of a vulnerable minor, the UI invokes the SafeguardingHandover API. The interface requires the receiving statutory officer to digitally sign or acknowledge the transfer, ensuring an unbroken chain of custody.
- **Offline Communication Sync:** When telecom infrastructure fails, field workers log interventions on paper or offline devices. The portal provides a "Batch Upload" interface for the CommunicationAttempt endpoint, allowing workers to backfill physical interventions once connectivity is restored.
## 6. Offline Synchronization UX

Field application clients must implement a local SQLite or IndexedDB storage queue to support the Restoring Family Links mission during total network blackouts.


| UI Element | Behavior | Architectural Binding |
| --- | --- | --- |
| Network Status Banner | Persistently displays "Online" (Green) or "Working Offline – Changes Saved Locally" (Amber). | Monitors browser navigator.onLine and API heartbeat endpoints. |
| Outbox Queue | Shows a list of pending state transitions (e.g., 3 pending safety declarations). | Maps to local storage payloads awaiting upload. |
| Sync Execution | Automatically attempts upload upon reconnection. Displays a progress bar for queue clearing. | Transmits payloads with UUID Idempotency-Key headers to prevent duplicates. |
| Conflict Resolution Modal | If an ETag mismatch occurs (412 Precondition Failed), forces the Case Worker to resolve the concurrent edit. | Compares the local state against the server's authoritative state before overriding. |

## 7. Notification & Communication UX

- **SMS Constraints:** SMS is strictly utilized as a low-bandwidth signaling mechanism. To enforce minimum necessary disclosure, an SMS payload must never contain clinical, forensic, or safeguarding data. A compliant notification reads: "FamilyConnect: An authoritative update regarding case FC-NP-2026-00892 is available. Please log in or visit an Assistance Centre."
- **Human-Mediated Death Notification:** The UI technologically restricts automated digital notifications for a DECEASED_PERSON state transition. Forensic confirmations are routed exclusively to the Case Worker dashboard, triggering a mandatory offline operational process for human-led bereavement contact prior to any digital dashboard update.
Appendix

**UX Red-Team Review: 25-Scenario Validation**

- **Disputes & Impersonation (Scenarios 2, 21, 22):** PASS. The "Dispute Lock State" successfully masks all claimant data and displays a persistent RESTRICTED_PENDING_REVIEW banner to prevent hostile actors from scraping data during family conflicts.
- **Deceased Person Dignity (Scenario 5):** PASS. Automated digital notifications for death are technologically restricted at the UI level. The interface forces case workers into a human-mediated offline workflow before any digital dashboard update occurs.
- **Offline & Telecom Failure (Scenarios 9, 17):** PASS. The inclusion of an Outbox Queue, "Working Offline" status banners, and ETag conflict resolution modals successfully addresses the reality of disconnected field operations.
- **Misinformation & Panic (Scenarios 14, 15):** PASS. The Disaster Rumour Feed UX properly isolates debunked social media claims, broadcasting corrections without polluting individual case timelines or elevating unverified rumors to authoritative facts.
- **Safeguarding Custody (Scenario 3):** PASS. The UI mandates that receiving statutory officers digitally sign or acknowledge the SafeguardingHandover, enforcing an unbroken, auditable chain of custody.
- **Privacy Preferences (Scenario 19):** CONDITIONAL PASS. While contact preferences are mentioned, the UX must explicitly mandate distinct toggle switches (e.g., "Hide Exact Location", "Hide Phone Number") on the public submission forms so users can request logistical help without broadcasting their coordinates.
- **Agency Data Masking (Scenarios 10, 11, 12, 13):** CONDITIONAL PASS. The Agency Portal interface must explicitly enforce "Minimum Necessary UI Rendering." For example, a hospital's portal must render physical descriptors and IdentityEvidence but completely hide UI components related to family financial disputes or non-medical history.
**SPEC-006 Confirmation & Baseline**

With the above conditional passes integrated, **SPEC-006 is CONFIRMED** and baselined as v0.2. The interaction models successfully translate the strict privacy, safeguarding, and architectural controls of SPEC-003, SPEC-004, and SPEC-005 into trauma-informed interfaces.
