import { supabase } from '../src/config/supabase.js';

async function run() {
  try {
    let hasMore = true;
    let iteration = 1;
    while (hasMore) {
      console.log(`Running reconcile_staging_trades (Iteration ${iteration})...`);
      const { data, error } = await supabase.rpc('reconcile_staging_trades');
      if (error) {
        console.error("RPC Error:", error.message);
        break;
      } else {
        console.log(`Iteration ${iteration} Result:`, data);
        const total = (data.processed || 0) + (data.duplicates || 0) + (data.failed || 0);
        if (total === 0) {
          hasMore = false;
        }
      }
      iteration++;
    }
    console.log("Done reconciliation loop.");
  } catch (e) {
    console.error("Exception:", e.message);
  }
}

run();
