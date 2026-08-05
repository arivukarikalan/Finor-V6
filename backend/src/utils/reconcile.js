import { supabaseAdmin } from '../config/supabase.js';

/**
 * Reconciles all pending staging trades by loop-calling reconcile_staging_trades RPC.
 * This prevents staging queue starvation/backlog where LIMIT 100 on the database
 * side hides newer trades.
 */
export async function reconcileAllStagingTrades() {
  let iteration = 1;
  let totalProcessed = 0;
  let totalDuplicates = 0;
  let totalFailed = 0;
  
  while (iteration <= 50) { // Limit to 5000 records to prevent infinite loop
    const { data, error } = await supabaseAdmin.rpc('reconcile_staging_trades');
    if (error) {
      console.error(`[ReconcileTrades] Error at iteration ${iteration}:`, error.message);
      throw error;
    }
    
    const processed = data?.processed || 0;
    const duplicates = data?.duplicates || 0;
    const failed = data?.failed || 0;
    
    totalProcessed += processed;
    totalDuplicates += duplicates;
    totalFailed += failed;
    
    // If no records were processed, duplicate-flagged, or failed, queue is exhausted
    if (processed + duplicates + failed === 0) {
      break;
    }
    iteration++;
  }
  
  console.log(`[ReconcileTrades] Completed. Iterations: ${iteration - 1}, Processed: ${totalProcessed}, Duplicates: ${totalDuplicates}, Failed: ${totalFailed}`);
  return { processed: totalProcessed, duplicates: totalDuplicates, failed: totalFailed };
}

/**
 * Reconciles all pending staging transactions by loop-calling reconcile_staging_transactions RPC.
 * This prevents staging queue starvation/backlog where LIMIT 100 on the database
 * side hides newer transactions.
 */
export async function reconcileAllStagingTransactions() {
  let iteration = 1;
  let totalProcessed = 0;
  let totalDuplicates = 0;
  let totalFailed = 0;
  
  while (iteration <= 50) { // Limit to 5000 records to prevent infinite loop
    const { data, error } = await supabaseAdmin.rpc('reconcile_staging_transactions');
    if (error) {
      console.error(`[ReconcileTransactions] Error at iteration ${iteration}:`, error.message);
      throw error;
    }
    
    const processed = data?.processed || 0;
    const duplicates = data?.duplicates || 0;
    const failed = data?.failed || 0;
    
    totalProcessed += processed;
    totalDuplicates += duplicates;
    totalFailed += failed;
    
    // If no records were processed, duplicate-flagged, or failed, queue is exhausted
    if (processed + duplicates + failed === 0) {
      break;
    }
    iteration++;
  }
  
  console.log(`[ReconcileTransactions] Completed. Iterations: ${iteration - 1}, Processed: ${totalProcessed}, Duplicates: ${totalDuplicates}, Failed: ${totalFailed}`);
  return { processed: totalProcessed, duplicates: totalDuplicates, failed: totalFailed };
}
