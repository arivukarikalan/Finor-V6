import express from 'express';
import { supabase } from './src/config/supabase.js';

// Mock Supabase getUser method to bypass requireAuth verification
supabase.auth.getUser = async (token) => {
  return { data: { user: { id: '56fdfb1f-1068-4120-9e1c-18ef69d837d0' } }, error: null };
};

// Now import the router
import router from './src/routes/news.js';

const app = express();
app.use(express.json());
app.use('/', router);

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`Test news server running on port ${port}`);

  const headers = {
    'Authorization': 'Bearer dummy_token_value'
  };

  console.log("\n1. Testing GET /news ...");
  try {
    const res = await fetch(`http://localhost:${port}/`, { headers });
    if (res.ok) {
      const json = await res.json();
      console.log("Success! News articles count:", json.length);
      if (json.length > 0) {
        console.log("Sample article symbol:", json[0].stock_symbol);
      }
    } else {
      console.error("GET /news failed with status:", res.status);
      console.error(await res.text());
    }
  } catch (err) {
    console.error("GET /news error:", err.message);
  }

  console.log("\n2. Testing GET /corporate-actions ...");
  try {
    const res = await fetch(`http://localhost:${port}/corporate-actions`, { headers });
    if (res.ok) {
      const json = await res.json();
      console.log("Success! Upcoming actions:", json.upcoming?.length, "Past actions:", json.past?.length);
    } else {
      console.error("GET /corporate-actions failed with status:", res.status);
      console.error(await res.text());
    }
  } catch (err) {
    console.error("GET /corporate-actions error:", err.message);
  }

  server.close();
});
