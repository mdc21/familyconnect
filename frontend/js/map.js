/**
 * FamilyConnect Geospatial Mapping Helper (Leaflet.js)
 * High-performance, lightweight, offline-friendly mapping for disaster hubs,
 * relief shelters, and safe water points.
 */

(function() {
    const EVENT_DEFAULT_COORDS = {
        'EVENT-IN-FL-2026-1187': { lat: 26.2006, lng: 92.5000, zoom: 8, name: 'Assam Brahmaputra Basin' },
        'EVENT-NP-TIBET-2026': { lat: 27.8500, lng: 85.4500, zoom: 9, name: 'Nepal–Tibet Border' }
    };

    function getPinSvg(type, color = '#005eb8') {
        // SVG icon based on category
        let iconPath = '';
        if (type === 'shelter') {
            // Home / shelter icon
            iconPath = '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="#fff"/>';
        } else if (type === 'water') {
            // Water droplet icon
            iconPath = '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="#fff"/>';
        } else {
            // Assistance / aid cross icon
            iconPath = '<path d="M19 10.5h-4.5V6h-5v4.5H5v5h4.5V20h5v-4.5H19z" fill="#fff"/>';
        }

        return `
            <div style="position:relative;width:34px;height:42px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));cursor:pointer;">
                <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17 0C7.61 0 0 7.61 0 17C0 29.75 17 42 17 42C17 42 34 29.75 34 17C34 7.61 26.39 0 17 0Z" fill="${color}"/>
                    <circle cx="17" cy="17" r="14" fill="${color}"/>
                </svg>
                <div style="position:absolute;top:5px;left:5px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">${iconPath}</svg>
                </div>
            </div>
        `;
    }

    function createCustomIcon(type, status) {
        let color = '#005eb8'; // Default primary blue
        const s = (status || '').toUpperCase();
        if (s.includes('OPEN') || s.includes('POTABLE') || s.includes('ACTIVE') || s.includes('VERIFIED')) {
            color = '#166534'; // Forest Green
        } else if (s.includes('CAPACITY') || s.includes('TESTING') || s.includes('PARTIAL') || s.includes('REPAIR')) {
            color = '#b45309'; // Warning Amber
        } else if (s.includes('CLOSED') || s.includes('CONTAMINATED') || s.includes('DEPLETED')) {
            color = '#991b1b'; // Emergency Red
        }

        return L.divIcon({
            className: 'fc-map-marker',
            html: getPinSvg(type, color),
            iconSize: [34, 42],
            iconAnchor: [17, 42],
            popupAnchor: [0, -38]
        });
    }

    /**
     * Initializes or updates a disaster map in the given container
     * @param {string} containerId - Element ID of map div
     * @param {Object} options - { items, type, eventId, onMarkerClick }
     */
    function initDisasterMap(containerId, options = {}) {
        const activeEventId = options.eventId || 
            (typeof DISASTER_EVENT_ID !== 'undefined' ? DISASTER_EVENT_ID : null) ||
            new URLSearchParams(window.location.search).get('event') || 
            localStorage.getItem('fc_current_event_id') || 
            'EVENT-NP-TIBET-2026';

        const {
            items = [],
            type = 'assistance', // 'assistance' | 'shelter' | 'water'
        } = options;

        const container = document.getElementById(containerId);
        if (!container) return null;

        const defaultRegion = EVENT_DEFAULT_COORDS[activeEventId] || EVENT_DEFAULT_COORDS['EVENT-NP-TIBET-2026'];

        // If map already initialized on this container, re-use it
        let map = container._fc_leaflet_map;
        if (!map) {
            map = L.map(containerId, {
                center: [defaultRegion.lat, defaultRegion.lng],
                zoom: defaultRegion.zoom,
                zoomControl: true,
                attributionControl: false
            });

            // High-reliability clean OpenStreetMap tile layer (same-origin cached proxy)
            L.tileLayer('/api/v1/tiles/osm/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
            }).addTo(map);

            // Attribution in bottom right
            L.control.attribution({ position: 'bottomright' }).addTo(map);

            container._fc_leaflet_map = map;
        }

        // Clear existing markers layer
        if (container._fc_markers_layer) {
            map.removeLayer(container._fc_markers_layer);
        }

        const markersLayer = L.layerGroup();
        const validCoords = [];

        items.forEach(item => {
            // Guard against cross-event marker pollution
            const itemEventId = item.eventId || item.event_id;
            if (itemEventId && itemEventId !== activeEventId) {
                return;
            }

            let lat = null;
            let lng = null;

            // Extract lat / lng from different item shapes
            if (item.location && typeof item.location === 'object') {
                lat = Number(item.location.lat);
                lng = Number(item.location.lng);
            } else if (item.lat && item.lng) {
                lat = Number(item.lat);
                lng = Number(item.lng);
            }

            if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

            validCoords.push([lat, lng]);

            const title = item.name || item.title || 'Facility';
            const status = item.operationalStatus || item.status || 'OPEN';
            const address = (item.location && item.location.address) || item.address || '';
            const hours = item.openingHours || item.hours || '';
            const contact = item.emergencyContact || item.contact || item.hotline || '';
            const capacity = item.capacity || '';
            const services = item.services || item.available || '';

            const statusClass = (status.includes('OPEN') || status.includes('POTABLE')) ? 'status-pill pill-VERIFIED' :
                                (status.includes('CAPACITY') || status.includes('TESTING')) ? 'status-pill pill-PARTIAL' : 'status-pill pill-FALSE';

            const popupContent = `
                <div style="font-family:'Public Sans',system-ui,sans-serif;font-size:0.85rem;min-width:220px;max-width:300px;line-height:1.4">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.4rem">
                        <strong style="color:#0f172a;font-size:0.95rem;line-height:1.2">${escapeHtml(title)}</strong>
                        <span class="${statusClass}" style="font-size:0.7rem;padding:0.15rem 0.4rem">${escapeHtml(status)}</span>
                    </div>
                    ${address ? `<p style="margin:0.25rem 0;color:#334155;font-size:0.8rem">📍 ${escapeHtml(address)}</p>` : ''}
                    ${hours ? `<p style="margin:0.25rem 0;color:#334155;font-size:0.8rem">⏰ <strong>Hours:</strong> ${escapeHtml(hours)}</p>` : ''}
                    ${capacity ? `<p style="margin:0.25rem 0;color:#334155;font-size:0.8rem">👥 ${escapeHtml(capacity)}</p>` : ''}
                    ${services ? `<p style="margin:0.25rem 0;color:#64748b;font-size:0.75rem">📦 ${escapeHtml(Array.isArray(services) ? services.join(', ') : services)}</p>` : ''}
                    ${contact ? `<p style="margin:0.35rem 0 0;font-size:0.8rem">📞 <a href="tel:${escapeHtml(contact.replace(/\s+/g,''))}" style="color:#005eb8;font-weight:600">${escapeHtml(contact)}</a></p>` : ''}
                    <div style="margin-top:0.6rem;padding-top:0.4rem;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between">
                        <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" rel="noopener" style="color:#005eb8;font-size:0.75rem;text-decoration:underline">Get Directions ↗</a>
                        <span style="font-size:0.7rem;color:#94a3b8">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
                    </div>
                </div>
            `;

            const icon = createCustomIcon(type, status);
            const marker = L.marker([lat, lng], { icon }).bindPopup(popupContent);
            markersLayer.addLayer(marker);
        });

        markersLayer.addTo(map);
        container._fc_markers_layer = markersLayer;

        // Auto-fit bounds if we have valid pins
        if (validCoords.length > 1) {
            const bounds = L.latLngBounds(validCoords);
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
        } else if (validCoords.length === 1) {
            map.setView(validCoords[0], 12);
        } else {
            map.setView([defaultRegion.lat, defaultRegion.lng], defaultRegion.zoom);
        }

        // Invalidate size in next frame to handle container visibility transitions
        setTimeout(() => map.invalidateSize(), 150);

        return map;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    window.initDisasterMap = initDisasterMap;
})();
