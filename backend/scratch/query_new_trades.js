import { supabase } from '../src/config/supabase.js';

async function queryNewTrades() {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log("Newest trades in database:");
    data.forEach(t => {
      console.log(`ID: ${t.id}, Symbol: ${t.stock_symbol}, Qty: ${t.quantity}, Price: ${t.price}, Trade Date: ${t.trade_date}, Created: ${t.created_at}`);
    });
  }
}

queryNewTrades();
