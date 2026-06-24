import { supabase } from './src/config/supabase.js';

async function check() {
  const tables = ['app_settings', 'trades', 'holdings', 'gtts', 'news_cache', 'price_cache'];
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
        
      if (error) {
        console.log(`Table '${table}': ERROR - ${error.message}`);
      } else {
        console.log(`Table '${table}': OK (found ${data.length} records)`);
      }
    } catch (e) {
      console.log(`Table '${table}': EXCEPTION - ${e.message}`);
    }
  }
}

check();
