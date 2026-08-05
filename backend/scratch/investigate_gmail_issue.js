import { supabase } from '../src/config/supabase.js';

async function investigate() {
  try {
    console.log("=== STAGING TRADES SUMMARY ===");
    const { data: staging, error: err1 } = await supabase
      .from('staging_trades')
      .select('*');
    if (err1) {
      console.error("Error staging_trades:", err1.message);
    } else {
      console.log(`Total staging trades: ${staging.length}`);
      const summary = {};
      staging.forEach(s => {
        summary[s.status] = (summary[s.status] || 0) + 1;
      });
      console.log("Summary by status:", summary);

      console.log("\nPending / Failed / Duplicate details (up to 20):");
      const filtered = staging.filter(s => s.status !== 'PROCESSED').slice(0, 20);
      filtered.forEach(s => {
        console.log(`ID: ${s.id}, Status: ${s.status}, Error: ${s.error_message}, Created: ${s.created_at}`);
        console.log(`Raw:`, JSON.stringify(s.raw_data));
        console.log("---");
      });
    }
  } catch (e) {
    console.error("Exception:", e.message);
  }
}

investigate();
