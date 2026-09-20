/**
 * Production Readiness Utility: Cleanup Seed & Demo Data
 * 
 * Safely removes all records marked with `is_seed = TRUE` across tables:
 *   - community_profile
 *   - recovery_need
 *   - documentation_process
 *   - family_recovery_case
 * 
 * Usage:
 *   node scripts/cleanup-seed-data.js [--dry-run]
 */

const { pool } = require('../src/db');

async function cleanupSeedData() {
    const isDryRun = process.argv.includes('--dry-run');
    const client = await pool.connect();

    try {
        console.log(`=== FamilyConnect Seed Data Cleaner ===`);
        console.log(`Mode: ${isDryRun ? 'DRY RUN (preview only)' : 'LIVE EXECUTION'}`);

        await client.query('BEGIN');

        const tables = [
            'recovery_task',
            'recovery_project',
            'resource_offer',
            'documentation_process',
            'family_recovery_case',
            'recovery_need',
            'community_profile',
            'organisation'
        ];

        const summary = {};

        for (const table of tables) {
            // Check if column exists
            const colCheck = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = 'is_seed'
            `, [table]);

            if (colCheck.rows.length === 0) {
                summary[table] = 0;
                continue;
            }

            const countRes = await client.query(`SELECT COUNT(*) as count FROM ${table} WHERE is_seed = TRUE`);
            const count = parseInt(countRes.rows[0].count, 10);
            summary[table] = count;

            if (!isDryRun && count > 0) {
                await client.query(`DELETE FROM ${table} WHERE is_seed = TRUE`);
                console.log(`  ✔ Purged ${count} seed records from table '${table}'`);
            } else {
                console.log(`  ℹ Found ${count} seed records in table '${table}'`);
            }
        }

        if (isDryRun) {
            await client.query('ROLLBACK');
            console.log('\n[DRY RUN COMPLETE] No records were modified.');
        } else {
            await client.query('COMMIT');
            console.log('\n✅ Seed data cleanup completed successfully. Production environment is clean.');
        }

        console.log('Summary:', summary);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error cleaning seed data:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    cleanupSeedData();
}

module.exports = { cleanupSeedData };
