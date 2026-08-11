import { query } from '../src/config/db';

async function fixSelectionConstraint() {
    try {
        console.log('[Migration] Dropping old wagers_selection_check constraint...');
        await query('ALTER TABLE wagers DROP CONSTRAINT IF EXISTS wagers_selection_check');
        console.log('[Migration] ✅ Old constraint dropped.');

        console.log('[Migration] Adding new permissive constraint...');
        await query(`ALTER TABLE wagers ADD CONSTRAINT wagers_selection_check CHECK (selection ~ '^[a-zA-Z0-9 _-]{1,50}$')`);
        console.log('[Migration] ✅ New constraint added. MULTI market selections are now allowed.');

        process.exit(0);
    } catch (error: any) {
        console.error('[Migration] ❌ Failed:', error.message);
        process.exit(1);
    }
}

fixSelectionConstraint();
