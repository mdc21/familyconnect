/**
 * FamilyConnect Geospatial Basemap Tile Proxy & Cache
 * Provides high-availability, offline-tolerant, same-origin raster tiles
 * for emergency relief and crisis map views.
 */

const express = require('express');
const https = require('https');
const router = express.Router();

// In-memory cache for fast repeat access (up to 500 tiles)
const tileCache = new Map();
const MAX_CACHE_SIZE = 500;

function fetchTileBuffer(url, userAgent) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': userAgent || 'FamilyConnect-DisasterResponse/1.0 (contact: humanitarian@familyconnect.org)',
                'Accept': 'image/png,image/*;q=0.9'
            },
            timeout: 6000
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`Upstream returned HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Tile request timed out'));
        });
    });
}

// 1x1 transparent PNG fallback in case of complete upstream network failure
const FALLBACK_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
);

router.get(['/osm/:z/:x/:y.png', '/:z/:x/:y.png'], async (req, res) => {
    const z = parseInt(req.params.z, 10);
    const x = parseInt(req.params.x, 10);
    const y = parseInt(req.params.y, 10);

    if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || z > 19 || x < 0 || y < 0) {
        return res.status(400).send('Invalid tile coordinates');
    }

    const key = `${z}/${x}/${y}`;

    // Check memory cache
    if (tileCache.has(key)) {
        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            'X-Tile-Cache': 'HIT'
        });
        return res.send(tileCache.get(key));
    }

    // Clean, unwatermarked OpenStreetMap humanitarian tile servers
    const osmUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    const subdomains = ['a', 'b', 'c', 'd'];
    const sub = subdomains[(x + y) % subdomains.length];
    const cartoUrl = `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;

    try {
        let buffer;
        try {
            buffer = await fetchTileBuffer(osmUrl, 'FamilyConnect-DisasterResponse/1.0 (+https://familyconnect.org; contact: tech@familyconnect.org)');
        } catch (err1) {
            // Fallback to CartoDB Voyager
            buffer = await fetchTileBuffer(cartoUrl);
        }

        // Store in cache
        if (tileCache.size >= MAX_CACHE_SIZE) {
            const firstKey = tileCache.keys().next().value;
            tileCache.delete(firstKey);
        }
        tileCache.set(key, buffer);

        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            'X-Tile-Cache': 'MISS'
        });
        return res.send(buffer);
    } catch (err) {
        // Return fallback image so UI doesn't display broken image icons
        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=60',
            'X-Tile-Fallback': '1'
        });
        return res.send(FALLBACK_PNG);
    }
});

module.exports = router;
