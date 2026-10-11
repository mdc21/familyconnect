/**
 * FamilyConnect Offline-First IndexedDB Sync Queue  — SPEC-011 Phase 1
 *
 * Provides:
 *   §4.3  enqueueSubmission() — queues all write-path endpoints when offline
 *   §4.4  enqueueApproval()  — coordinator offline approval with governance schema
 *   §4.5  updateStaleBadges() — stamps ⚠️ Last updated: N minutes ago on cached list views
 *
 * DB upgrade path:
 *   v1 → v2: adds 'approvals' object store (SPEC-011 §4.4)
 *   v2 → v3: adds 'cacheTimestamps' object store (SPEC-011 §4.5)
 */

(function () {
    const DB_NAME = 'fc_offline_db';
    const DB_VERSION = 3;         // bumped from 1 → 3 for new stores
    const STORE_SUBMISSIONS = 'submissions';
    const STORE_APPROVALS = 'approvals';
    const STORE_CACHE_TS = 'cacheTimestamps';

    let dbPromise = null;

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // v1: original submissions store
                if (oldVersion < 1) {
                    const store = db.createObjectStore(STORE_SUBMISSIONS, { keyPath: 'id' });
                    store.createIndex('status', 'status', { unique: false });
                    store.createIndex('queuedAt', 'queuedAt', { unique: false });
                }

                // v2: coordinator offline approval store (SPEC-011 §4.4)
                if (oldVersion < 2) {
                    if (!db.objectStoreNames.contains(STORE_APPROVALS)) {
                        const appStore = db.createObjectStore(STORE_APPROVALS, { keyPath: 'id' });
                        appStore.createIndex('status', 'status', { unique: false });
                        appStore.createIndex('type', 'type', { unique: false });
                        appStore.createIndex('decidedAt', 'decidedAt', { unique: false });
                    }
                }

                // v3: cache timestamp store for stale data badges (SPEC-011 §4.5)
                if (oldVersion < 3) {
                    if (!db.objectStoreNames.contains(STORE_CACHE_TS)) {
                        db.createObjectStore(STORE_CACHE_TS, { keyPath: 'key' });
                    }
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return dbPromise;
    }

    function generateOfflineRef(prefix = 'OFFLINE') {
        const rand = Math.floor(100000 + Math.random() * 900000);
        return `FC-${prefix}-${rand}`;
    }

    // ─── §4.3: General submission queue ──────────────────────────────────────────

    async function enqueueSubmission({ path, method = 'POST', body, headers = {}, label = 'Submission' }) {
        const db = await openDb();
        const id = crypto.randomUUID ? crypto.randomUUID() : ('off-' + Date.now() + '-' + Math.random());
        const localRef = generateOfflineRef('LOCAL');

        const record = {
            id,
            localRef,
            label,
            path,
            method,
            body,
            headers: {
                ...headers,
                'Idempotency-Key': headers['Idempotency-Key'] || (crypto.randomUUID ? crypto.randomUUID() : ('idemp-' + Date.now())),
                'X-Offline-Queued': 'true'
            },
            status: 'QUEUED',
            queuedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
            const store = tx.objectStore(STORE_SUBMISSIONS);
            const req = store.add(record);
            req.onsuccess = () => {
                updateConnectivityBadge();
                resolve(record);
            };
            req.onerror = () => reject(req.error);
        });
    }

    // ─── §4.4: Coordinator offline approval queue ─────────────────────────────────
    // Schema: { id, localRef, type, entityId, decision, reviewerComment,
    //           reviewerIAL, reviewerActorClass, decidedAt, status }
    // WARNING: Server MUST validate entity is still in STAGED/PROPOSED at sync time.

    async function enqueueApproval({ path, method = 'POST', body, headers = {}, label = 'Approval Decision' }) {
        const db = await openDb();
        const id = crypto.randomUUID ? crypto.randomUUID() : ('appr-' + Date.now() + '-' + Math.random());
        const localRef = generateOfflineRef('APPROVAL');

        // Extract IAL and actor class from the current session at the moment of decision.
        // This is the authoritative audit timestamp — the session may expire before sync.
        let reviewerIAL = null;
        let reviewerActorClass = null;
        try {
            const session = JSON.parse(localStorage.getItem('fc_auth_session') || 'null');
            if (session) {
                reviewerIAL = session.ial || null;
                reviewerActorClass = session.actorClass || null;
            }
        } catch (_) {}

        // Determine approval type from the path
        let approvalType = 'GENERIC_APPROVAL';
        if (path.includes('/portals/'))   approvalType = 'PORTAL_APPROVAL';
        if (path.includes('/projects/'))  approvalType = 'PROJECT_APPROVAL';
        if (path.includes('/recovery-needs/')) approvalType = 'NEED_VERIFICATION';

        // Extract the entity ID from the path (last path segment before any trailing segment)
        const pathParts = path.split('/').filter(Boolean);
        const entityId = pathParts.length >= 3 ? pathParts[pathParts.length - 1] : null;

        const record = {
            id,
            localRef,
            label,
            type: approvalType,
            entityId,
            path,
            method,
            // The body contains decision, reviewerComment, etc. from the UI
            decision: body && body.decision,
            reviewerComment: body && body.reviewerComment,
            reviewerIAL,
            reviewerActorClass,
            decidedAt: Date.now(),    // critical: timestamp of decision, not of sync
            body: {
                ...body,
                _offlineMeta: {
                    localRef,
                    decidedAt: new Date().toISOString(),
                    reviewerIAL,
                    reviewerActorClass,
                }
            },
            headers: {
                ...headers,
                'Idempotency-Key': headers['Idempotency-Key'] || (crypto.randomUUID ? crypto.randomUUID() : ('appr-' + Date.now())),
                'X-Offline-Queued': 'true',
                'X-Offline-Decided-At': new Date().toISOString(),
            },
            status: 'QUEUED',
            queuedAt: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_APPROVALS, 'readwrite');
            const store = tx.objectStore(STORE_APPROVALS);
            const req = store.add(record);
            req.onsuccess = () => {
                updateConnectivityBadge();
                resolve(record);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function getQueuedApprovals() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_APPROVALS, 'readonly');
            const store = tx.objectStore(STORE_APPROVALS);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function removeQueuedApproval(id) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_APPROVALS, 'readwrite');
            const store = tx.objectStore(STORE_APPROVALS);
            const req = store.delete(id);
            req.onsuccess = () => {
                updateConnectivityBadge();
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

    // ─── §4.3: General submission helpers ────────────────────────────────────────

    async function getQueuedItems() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SUBMISSIONS, 'readonly');
            const store = tx.objectStore(STORE_SUBMISSIONS);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function removeQueuedItem(id) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_SUBMISSIONS, 'readwrite');
            const store = tx.objectStore(STORE_SUBMISSIONS);
            const req = store.delete(id);
            req.onsuccess = () => {
                updateConnectivityBadge();
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

    // ─── §4.5: Cache timestamp tracking ──────────────────────────────────────────
    // Call recordCacheLoad(key) when data is loaded from network into a list view.
    // updateStaleBadges() renders ⚠️ Last updated: N minutes ago on cache-sourced views.

    async function recordCacheLoad(key) {
        try {
            const db = await openDb();
            const tx = db.transaction(STORE_CACHE_TS, 'readwrite');
            const store = tx.objectStore(STORE_CACHE_TS);
            store.put({ key, ts: Date.now() });
        } catch (_) {}
    }

    async function getCacheTimestamp(key) {
        try {
            const db = await openDb();
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_CACHE_TS, 'readonly');
                const store = tx.objectStore(STORE_CACHE_TS);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result ? req.result.ts : null);
                req.onerror = () => resolve(null);
            });
        } catch (_) { return null; }
    }

    function formatAge(ms) {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60)  return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60)  return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }

    /**
     * SPEC-011 §4.5 — Stale data timestamps.
     * Finds any element with data-fc-cache-key attribute and injects an age badge.
     * If offline, always shows; if online but cache age > ageThresholdMs, also shows.
     */
    async function updateStaleBadges(ageThresholdMs = 30 * 60 * 1000 /* 30 min */) {
        const nodes = document.querySelectorAll('[data-fc-cache-key]');
        for (const node of nodes) {
            const cacheKey = node.getAttribute('data-fc-cache-key');
            const ts = await getCacheTimestamp(cacheKey);
            if (!ts) continue;
            const age = Date.now() - ts;
            const isOffline = !navigator.onLine;
            const isStale = age > ageThresholdMs;

            // Find or create the stale badge inside this node
            let badge = node.querySelector('.fc-stale-data-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'fc-stale-data-badge';
                badge.style.cssText = [
                    'display:inline-flex', 'align-items:center', 'gap:0.3rem',
                    'font-size:0.75rem', 'color:#92400e',
                    'background:#fef3c7', 'border:1px solid #fde68a',
                    'border-radius:4px', 'padding:0.2rem 0.5rem',
                    'margin-bottom:0.5rem'
                ].join(';');
                node.prepend(badge);
            }

            if (isOffline || isStale) {
                badge.style.display = 'inline-flex';
                badge.textContent = `⚠️ Last updated: ${formatAge(age)}${isOffline ? ' (offline)' : ''}`;
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // ─── Sync engine ──────────────────────────────────────────────────────────────

    let isSyncing = false;

    async function syncQueue() {
        if (isSyncing || !navigator.onLine) return;
        isSyncing = true;

        const badge = document.getElementById('fc-connectivity-badge');
        if (badge) {
            badge.innerHTML = '🔄 <span style="font-size:0.75rem">Syncing reports…</span>';
            badge.style.display = 'inline-flex';
        }

        try {
            const apiBase = window.FC_API_BASE || '/api/v1';

            // 1. Sync general submissions
            const items = await getQueuedItems();
            for (const item of items) {
                try {
                    const res = await fetch(`${apiBase}${item.path}`, {
                        method: item.method,
                        headers: { 'Content-Type': 'application/json', ...item.headers },
                        body: JSON.stringify(item.body)
                    });
                    if (res.ok || res.status === 409) {
                        await removeQueuedItem(item.id);
                        console.log(`[Offline Sync] Uploaded: ${item.localRef}`);
                    }
                } catch (err) {
                    console.warn(`[Offline Sync] Failed ${item.localRef}:`, err.message);
                    break; // stop if still offline
                }
            }

            // 2. Sync coordinator approval decisions (SPEC-011 §4.4)
            // Server will reject with STALE_APPROVAL if entity state has changed.
            const approvals = await getQueuedApprovals();
            for (const appr of approvals) {
                try {
                    const res = await fetch(`${apiBase}${appr.path}`, {
                        method: appr.method,
                        headers: { 'Content-Type': 'application/json', ...appr.headers },
                        body: JSON.stringify(appr.body)
                    });
                    // 200/201 success, 409 idempotency (already processed), 422 STALE_APPROVAL:
                    // all are terminal — remove from queue and surface result to user if needed.
                    if (res.ok || res.status === 409 || res.status === 422) {
                        if (res.status === 422) {
                            console.warn(`[Offline Sync] Stale approval ${appr.localRef} rejected by server — requires human re-review.`);
                        }
                        await removeQueuedApproval(appr.id);
                    }
                } catch (err) {
                    console.warn(`[Offline Sync] Failed approval ${appr.localRef}:`, err.message);
                    break;
                }
            }
        } finally {
            isSyncing = false;
            updateConnectivityBadge();
        }
    }

    // ─── Connectivity badge ───────────────────────────────────────────────────────

    async function updateConnectivityBadge() {
        let badge = document.getElementById('fc-connectivity-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'fc-connectivity-badge';
            badge.setAttribute('aria-live', 'polite');
            badge.style.cssText = [
                'position:fixed', 'bottom:1.25rem', 'right:1.25rem',
                'z-index:99999', 'padding:0.45rem 0.85rem',
                'border-radius:999px', 'font-size:0.78rem', 'font-weight:600',
                'display:inline-flex', 'align-items:center', 'gap:0.4rem',
                'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
                'transition:all 0.25s ease', 'cursor:default'
            ].join(';');
            document.body.appendChild(badge);
        }

        const isOnline = navigator.onLine;
        let submissionCount = 0;
        let approvalCount = 0;
        try {
            submissionCount = (await getQueuedItems()).length;
            approvalCount = (await getQueuedApprovals()).length;
        } catch (_) {}

        const totalQueued = submissionCount + approvalCount;

        if (!isOnline) {
            badge.style.background = '#92400e';
            badge.style.color = '#fff';
            badge.innerHTML = `🟠 <span>Offline</span> ${totalQueued > 0 ? `(${totalQueued} saved)` : ''}`;
            badge.style.display = 'inline-flex';
            badge.title = totalQueued > 0
                ? `${totalQueued} item(s) queued — will sync when connection restores`
                : 'You are offline';
        } else if (totalQueued > 0) {
            badge.style.background = '#0284c7';
            badge.style.color = '#fff';
            badge.innerHTML = `🔄 <span>Syncing ${totalQueued} queued items…</span>`;
            badge.style.display = 'inline-flex';
            badge.title = 'Syncing offline queue to server';
            syncQueue();
        } else {
            badge.style.display = 'none';
        }

        // Also refresh stale data badges when connectivity changes
        updateStaleBadges();
    }

    // ─── Event listeners ──────────────────────────────────────────────────────────

    window.addEventListener('online', () => {
        updateConnectivityBadge();
        syncQueue();
    });

    window.addEventListener('offline', () => {
        updateConnectivityBadge();
    });

    document.addEventListener('DOMContentLoaded', () => {
        updateConnectivityBadge();
        if (navigator.onLine) syncQueue();
    });

    // ─── Public API ───────────────────────────────────────────────────────────────

    window.FCOfflineQueue = {
        // §4.3 General submissions
        enqueueSubmission,
        getQueuedItems,
        removeQueuedItem,
        // §4.4 Coordinator approvals
        enqueueApproval,
        getQueuedApprovals,
        removeQueuedApproval,
        // §4.5 Stale data
        recordCacheLoad,
        getCacheTimestamp,
        updateStaleBadges,
        // Sync / badge
        syncQueue,
        updateConnectivityBadge,
    };
})();
