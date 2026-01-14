import { query, getClient } from '../src/config/db';

const command = process.argv[2];

const usage = () => {
    console.log('Usage: npx ts-node scripts/manageMarkets.ts <command> [args]');
    console.log('Commands:');
    console.log('  create <title> <close_in_seconds> <initial_yes> <initial_no>');
    console.log('  list');
    console.log('  close <market_id>');
    console.log('  settle <market_id>');
    process.exit(1);
};

const createMarket = async () => {
    const title = process.argv[3];
    const duration = Number(process.argv[4]);
    const initYes = Number(process.argv[5]);
    const initNo = Number(process.argv[6]);

    if (!title || !duration) {
        usage();
    }

    const closureTime = Date.now() + (duration * 1000);

    try {
        const res = await query(
            `INSERT INTO markets (title, status, closure_timestamp, pool_yes, pool_no) 
             VALUES ($1, 'OPEN', $2, $3, $4) RETURNING id`,
            [title, closureTime, initYes || 0, initNo || 0]
        );
        console.log(`Market Created: ${res.rows[0].id}`);
    } catch (e) {
        console.error(e);
    }
};

const listMarkets = async () => {
    const res = await query('SELECT * FROM markets ORDER BY id DESC LIMIT 10'); // created_at missing in schema, using ID.
    // Markets schema didn't have created_at in init.sql. Using closure_timestamp for now.
    console.table(res.rows.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        pool: Number(r.total_pool)
    })));
};

// ... Implement close and settle later if needed for sim
// keeping it simple for now

const main = async () => {
    switch (command) {
        case 'create': await createMarket(); break;
        case 'list': await listMarkets(); break;
        default: usage();
    }
    process.exit(0);
};

main();
