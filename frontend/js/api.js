// FamilyConnect frontend — shared API client.
// Talks to the backend built in src/ (SPEC-003 contracts). No framework,
// no build step: this is deliberately a plain script so the whole
// public-facing app stays small over a slow connection.

const API_BASE = window.FC_API_BASE || '/api/v1';
const urlParams = new URLSearchParams(window.location.search);
const DISASTER_EVENT_ID = urlParams.get('event') || localStorage.getItem('fc_current_event_id') || window.FC_EVENT_ID || 'EVENT-IN-FL-2026-1187';

function newIdempotencyKey() {
    // Native UUIDv4, no dependency needed.
    return crypto.randomUUID();
}

/**
 * Maps an RFC 9457 problem+json body to plain, non-alarming language.
 * The interface's voice: explain what happened and what to do next,
 * never blame the person, never use raw error codes as the message.
 */
function humaniseProblem(problem, status) {
    const known = {
        FC_ERR_400_INVALID_SCHEMA: 'Something on this form needs a second look. Check the highlighted fields and try again.',
        FC_ERR_401_AUTH_REQUIRED: 'This needs additional verification before it can continue.',
        FC_ERR_403_DISPUTED_ACCESS: 'This case is temporarily under review and its details are not available right now.',
        FC_ERR_404_NOT_FOUND: "We couldn't find that. Double-check the reference and try again.",
        FC_ERR_409_IDEMPOTENCY: 'It looks like this was already submitted with different details. Please start a new submission.',
        FC_ERR_412_CONCURRENCY_LOCK: 'This record changed while you were viewing it. Refresh the page and try again.',
        FC_ERR_422_STATE_TRANSITION: "This action can't be completed in the case's current status.",
        FC_ERR_429_RATE_LIMIT: "You're submitting a lot in a short time. Please wait a moment and try again.",
        FC_ERR_503_DEGRADED_MODE: "Our systems are temporarily unavailable. Your information hasn't been lost — please try again shortly.",
    };
    if (problem && problem.code && known[problem.code]) return known[problem.code];
    if (status >= 500) return "Something went wrong on our end. Your information hasn't been lost — please try again shortly.";
    return (problem && problem.title) || 'Something went wrong. Please try again.';
}

async function apiRequest(method, path, { body, idempotent = false, headers = {}, skipTranslation = false } = {}) {
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    if (idempotent) reqHeaders['Idempotency-Key'] = newIdempotencyKey();
    if (!reqHeaders['X-Disaster-Event-ID']) reqHeaders['X-Disaster-Event-ID'] = DISASTER_EVENT_ID;
    if (!reqHeaders['Authorization']) {
        const token = localStorage.getItem('fc_auth_token');
        if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            method,
            headers: reqHeaders,
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch (networkErr) {
        // Genuinely offline / server unreachable — distinct message from a
        // server-side 503, since the person's next step differs (check
        // their own connection vs. just retry later).
        const err = new Error("We can't reach FamilyConnect right now. Check your connection and try again — nothing has been lost.");
        err.offline = true;
        throw err;
    }

    const text = await res.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            // Received non-JSON (e.g. HTML 404 or proxy error page)
            if (!res.ok) {
                const err = new Error("Unable to load data right now. Please try again shortly.");
                err.status = res.status;
                throw err;
            }
        }
    }

    if (!res.ok) {
        const err = new Error(humaniseProblem(data, res.status));
        err.status = res.status;
        err.problem = data;
        throw err;
    }

    return data;
}

function getLocalized(item, field, lang) {
    if (!item) return '';
    const l = lang || (typeof getLang === 'function' ? getLang() : 'en');
    if (item.translations && item.translations[l] && item.translations[l][field]) {
        return item.translations[l][field];
    }
    return item[field] || '';
}

const api = {
    getLocalized,
    submitSafety: (body) => apiRequest('POST', '/submissions/safety', { body, idempotent: true }),
    submitMissing: (body) => apiRequest('POST', '/submissions/missing', { body, idempotent: true }),
    getSubmission: (id) => apiRequest('GET', `/submissions/${encodeURIComponent(id)}`),
    getCase: (ref) => apiRequest('GET', `/cases/${encodeURIComponent(ref)}`),
    getCaseUpdates: (ref) => apiRequest('GET', `/cases/${encodeURIComponent(ref)}/updates`),
    getAssistanceCentres: () => apiRequest('GET', '/assistance-centres'),
    submitAssistanceRequest: (caseRef, body) => apiRequest('POST', `/cases/${encodeURIComponent(caseRef)}/assistance`, {
        body, headers: { 'X-Debug-Actor-Class': 'FAMILY' },
    }),
    getRumours: (eventId) => apiRequest('GET', `/events/${encodeURIComponent(eventId || DISASTER_EVENT_ID)}/rumours`),
    submitRumour: (eventId, body) => apiRequest('POST', `/events/${encodeURIComponent(eventId || DISASTER_EVENT_ID)}/rumours`, { body }),
    submitDnaRequest: (body) => apiRequest('POST', '/dna/requests', { body, idempotent: true }),
    getDnaRequestStatus: (ref) => apiRequest('GET', `/dna/requests/${encodeURIComponent(ref)}`),
    getDnaQueue: (status) => apiRequest('GET', `/dna/queue${status ? '?status=' + encodeURIComponent(status) : ''}`, { headers: authHeader() }),
    updateDnaStatus: (ref, body) => apiRequest('PATCH', `/dna/requests/${encodeURIComponent(ref)}/status`, { body, headers: authHeader() }),
    // Case tracking — public lookup by reference number
    trackCase: (ref) => apiRequest('GET', `/cases/track?ref=${encodeURIComponent(ref)}`),
    runNewsAgent: () => apiRequest('POST', '/news/agent/run', { headers: authHeader() }),
    getNewsQueue: (status = 'PENDING_REVIEW') => apiRequest('GET', `/news/queue?status=${encodeURIComponent(status)}`, { headers: authHeader() }),
    reviewNewsItem: (id, body) => apiRequest('POST', `/news/queue/${encodeURIComponent(id)}/review`, { body, headers: authHeader() }),
    getPublicNews: (category = 'ALL', sourceType = 'ALL') => apiRequest('GET', `/news/public?category=${encodeURIComponent(category)}&sourceType=${encodeURIComponent(sourceType)}`),
    getPartnerUpdates: () => apiRequest('GET', '/news/partner-updates'),
    getNewsSchedule: () => apiRequest('GET', '/news/schedule'),
    updateNewsSchedule: (body) => apiRequest('PUT', '/news/schedule', { body, headers: authHeader() }),
    registerOrganisation: (body) => apiRequest('POST', '/organisations/register', { body }),
    getActiveAgencies: () => apiRequest('GET', '/organisations/active'),
    getTunnelSites: () => apiRequest('GET', '/tunnels'),
    getTunnelRoster: (siteId) => apiRequest('GET', `/tunnels/${siteId}/roster`),
    reportTunnelWorker: (body) => apiRequest('POST', '/tunnels/worker-report', { body }),
    triggerTunnelAgent: () => apiRequest('POST', '/tunnels/agent/run'),
    getActiveEvents: () => apiRequest('GET', '/events/active', { skipTranslation: true }),
    updateTunnelWorkerStatus: (rosterId, body) => apiRequest('PUT', `/tunnels/roster/${encodeURIComponent(rosterId)}/status`, { body, headers: authHeader() }),
    updateTunnelSiteStatus: (siteId, body) => apiRequest('PUT', `/tunnels/${encodeURIComponent(siteId)}/status`, { body, headers: authHeader() }),
    // Information updates & Rumours
    getInformation: (eventId, category) => apiRequest('GET', `/events/${encodeURIComponent(eventId || DISASTER_EVENT_ID)}/information${category && category !== 'ALL' ? '?category=' + encodeURIComponent(category) : ''}`),
    publishInformation: (eventId, body) => apiRequest('POST', `/events/${encodeURIComponent(eventId || DISASTER_EVENT_ID)}/information`, { body, headers: authHeader() }),
    getRumours: (eventId) => apiRequest('GET', `/events/${encodeURIComponent(eventId || DISASTER_EVENT_ID)}/rumours`),
    correctRumour: (eventId, rumourId, body) => apiRequest('POST', `/events/${encodeURIComponent(eventId || DISASTER_EVENT_ID)}/rumours/${encodeURIComponent(rumourId)}/correction`, { body, headers: authHeader() }),
    // Assistance centres
    createAssistanceCentre: (body) => apiRequest('POST', '/assistance-centres', { body, headers: authHeader() }),
    updateAssistanceCentre: (centreId, body) => apiRequest('PATCH', `/assistance-centres/${encodeURIComponent(centreId)}`, { body, headers: authHeader() }),
    // Auth
    login: (body) => apiRequest('POST', '/auth/login', { body }),
    getMe: () => apiRequest('GET', '/auth/me', { headers: authHeader() }),
};

function authHeader() {
    const token = localStorage.getItem('fc_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function getAuthSession() {
    try {
        const raw = localStorage.getItem('fc_auth_session');
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function setAuthSession(token, account) {
    localStorage.setItem('fc_auth_token', token);
    localStorage.setItem('fc_auth_session', JSON.stringify(account));
}

function clearAuthSession() {
    localStorage.removeItem('fc_auth_token');
    localStorage.removeItem('fc_auth_session');
}

