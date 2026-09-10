const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const { runNewsCollectorAgent } = require('../src/services/newsAgent');

async function seed() {
    const client = await pool.connect();
    try {
        console.log('--- Initializing & Seeding FamilyConnect Database ---');
        
        // Log connected database host (safely masked)
        const connStr = process.env.DATABASE_URL || 'localhost:5432';
        const maskedHost = connStr.includes('@') ? connStr.split('@')[1].split('/')[0] : 'localhost:5432';
        console.log(`Connected to PostgreSQL Host: ${maskedHost}`);

        // Check if database schema is already initialized
        const checkRes = await client.query("SELECT to_regclass('public.disaster_event') as exists;");
        const schemaAlreadyExists = Boolean(checkRes.rows[0]?.exists);

        const sqlFiles = [
            { path: '../src/db/schema.sql', skipIfExists: true },
            { path: '../src/db/migration-orchestrator.sql', skipIfExists: false },
            { path: '../src/db/seed-modules.sql', skipIfExists: false },
            { path: '../src/db/seed.sql', skipIfExists: false },
            { path: '../src/db/seed_assam.sql', skipIfExists: false }
        ];

        for (const fileObj of sqlFiles) {
            if (fileObj.skipIfExists && schemaAlreadyExists) {
                console.log(`Schema tables already present. Skipping ${fileObj.path}...`);
                continue;
            }

            const fullPath = path.join(__dirname, fileObj.path);
            if (fs.existsSync(fullPath)) {
                console.log(`Executing ${fileObj.path}...`);
                const sql = fs.readFileSync(fullPath, 'utf8');
                try {
                    await client.query(sql);
                } catch (sqlErr) {
                    // If error is about relation already existing or unique key duplicate, log and continue
                    if (sqlErr.code === '42P07' || sqlErr.code === '23505' || sqlErr.code === '42710') {
                        console.log(`Notice: Objects in ${fileObj.path} already exist (${sqlErr.message}). Continuing...`);
                    } else {
                        throw sqlErr;
                    }
                }
            }
        }

        console.log('Running AI News Collector cycles for initial feed ingestion...');
        try {
            await runNewsCollectorAgent('EVENT-NP-TIBET-2026');
            await runNewsCollectorAgent('EVENT-IN-FL-2026-1187');
        } catch (agentErr) {
            console.warn('Warning during news agent cycle:', agentErr.message);
        }

        console.log('✅ Database initialization & seeding completed successfully.');
    } catch (err) {
        console.error('Error seeding database:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
