require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { cleanEnv, normalizeSupabaseUrl } = require('../env');

const url = normalizeSupabaseUrl(cleanEnv('SUPABASE_URL'));
const key = cleanEnv('SUPABASE_KEY') || cleanEnv('SUPABASE_ANON_KEY');

if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY (or SUPABASE_ANON_KEY) are required for this read-only check.');
}

async function main() {
    const supabase = createClient(url, key);
    const { count, error } = await supabase
        .from('inbody_results')
        .select('id', { count: 'exact', head: true });

    if (error) throw error;
    console.log(`inbody_results row count: ${count ?? 0}`);
}

main().catch((error) => {
    console.error(`inbody_results read-only check failed: ${error.message}`);
    process.exitCode = 1;
});
