const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const { runNewsCollectorAgent } = require('../src/services/newsAgent');

async function seed() {
    const client = await pool.connect();
    try {
        console.log('--- Initializing & Seeding FamilyConnect Database ---');

        const sqlFiles = [
            '../src/db/schema.sql',
            '../src/db/migration-orchestrator.sql',
            '../src/db/seed-modules.sql',
            '../src/db/seed.sql',
            '../src/db/seed_assam.sql'
        ];

        for (const relPath of sqlFiles) {
            const fullPath = path.join(__dirname, relPath);
            if (fs.existsSync(fullPath)) {
                console.log(`Executing ${relPath}...`);
                const sql = fs.readFileSync(fullPath, 'utf8');
                await client.query(sql);
            }
        }

        console.log('Running AI News Collector cycles for initial feed ingestion...');
        await runNewsCollectorAgent('EVENT-NP-TIBET-2026');
        await runNewsCollectorAgent('EVENT-IN-FL-2026-1187');

        console.log('Database initialization & seeding completed successfully.');
    } catch (err) {
        console.error('Error seeding database:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
