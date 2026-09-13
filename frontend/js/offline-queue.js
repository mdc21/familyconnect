/**
 * FamilyConnect Offline-First IndexedDB Sync Queue
 * Allows field caseworkers and victims to file safety declarations and missing
 * reports in zero-connectivity environments, safely storing them on-device
 * and auto-syncing when internet connectivity resumes.
 */

(function() {
    const DB_NAME = 'fc_offline_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'submissions';

    let dbPromise = null;

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('status', 'status', { unique: false });
                    store.createIndex('queuedAt', 'queuedAt', { unique: false });
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
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.add(record);

            req.onsuccess = () => {
                updateConnectivityBadge();
                resolve(record);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function getQueuedItems() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();

            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function removeQueuedItem(id) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(id);

            req.onsuccess = () => {
                updateConnectivityBadge();
                resolve();
            };
            req.onerror = () => reject(req.error);
        });
    }

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
            const items = await getQueuedItems();
            for (const item of items) {
                try {
                    const apiBase = window.FC_API_BASE || '/api/v1';
                    const res = await fetch(`${apiBase}${item.path}`, {
                        method: item.method,
                        headers: {
                            'Content-Type': 'application/json',
                            ...item.headers
                        },
                        body: JSON.stringify(item.body)
                    });

                    if (res.ok || res.status === 409) {
                        // 200/201/202 Success, or 409 Idempotency (already processed) -> Remove from queue
                        await removeQueuedItem(item.id);
                        console.log(`[Offline Sync] Successfully uploaded queued report: ${item.localRef}`);
                    }
                } catch (err) {
                    console.warn(`[Offline Sync] Failed to upload ${item.localRef}, will retry when network improves:`, err.message);
                    break; // stop processing queue if still network errors
                }
            }
        } finally {
            isSyncing = false;
            updateConnectivityBadge();
        }
    }

    async function updateConnectivityBadge() {
        let badge = document.getElementById('fc-connectivity-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'fc-connectivity-badge';
            badge.style.position = 'fixed';
            badge.style.bottom = '1.25rem';
            badge.style.right = '1.25rem';
            badge.style.zIndex = '99999';
            badge.style.padding = '0.45rem 0.85rem';
            badge.style.borderRadius = '999px';
            badge.style.fontSize = '0.78rem';
            badge.style.fontWeight = '600';
            badge.style.display = 'inline-flex';
            badge.style.alignItems = 'center';
            badge.style.gap = '0.4rem';
            badge.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            badge.style.transition = 'all 0.25s ease';
            document.body.appendChild(badge);
        }

        const isOnline = navigator.onLine;
        let queueCount = 0;
        try {
            const items = await getQueuedItems();
            queueCount = items.length;
        } catch (e) {
            // DB not ready yet
        }

        if (!isOnline) {
            badge.style.background = '#92400e';
            badge.style.color = '#fff';
            badge.innerHTML = `🟠 <span>Offline</span> ${queueCount > 0 ? `(${queueCount} saved)` : ''}`;
            badge.style.display = 'inline-flex';
        } else if (queueCount > 0) {
            badge.style.background = '#0284c7';
            badge.style.color = '#fff';
            badge.innerHTML = `🔄 <span>Syncing ${queueCount} queued reports…</span>`;
            badge.style.display = 'inline-flex';
            syncQueue();
        } else {
            // Online and queue empty: hide badge to prevent visual clutter
            badge.style.display = 'none';
        }
    }

    window.addEventListener('online', () => {
        updateConnectivityBadge();
        syncQueue();
    });

    window.addEventListener('offline', () => {
        updateConnectivityBadge();
    });

    document.addEventListener('DOMContentLoaded', () => {
        updateConnectivityBadge();
        if (navigator.onLine) {
            syncQueue();
        }
    });

    window.FCOfflineQueue = {
        enqueueSubmission,
        getQueuedItems,
        removeQueuedItem,
        syncQueue,
        updateConnectivityBadge
    };
})();
