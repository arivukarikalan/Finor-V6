import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './config/supabase.js';
import tradesRouter from './routes/trades.js';
import holdingsRouter from './routes/holdings.js';
import analyticsRouter from './routes/analytics.js';
import ordersRouter from './routes/orders.js';
import newsRouter from './routes/news.js';
import adminRouter from './routes/admin.js';
import assistantRouter from './routes/assistant.js';
import gmailRouter from './routes/gmail.js';
import snapshotsRouter from './routes/snapshots.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS (Cross-Origin Resource Sharing)
app.use(cors({
  origin: '*', // We will restrict this in production settings to our frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON request bodies
app.use(express.json());

// Routes
app.use('/api/trades', tradesRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/news', newsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/gmail', gmailRouter);
app.use('/api/snapshots', snapshotsRouter);

// API Health Check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'UP',
    message: 'Finor V6.0 API server is running smoothly',
    timestamp: new Date().toISOString()
  });
});

// Basic test route to check database connectivity
app.get('/api/db-check', async (req, res) => {
  try {
    // Attempt a simple query on app_settings
    const { data, error } = await supabase
      .from('app_settings')
      .select('count', { count: 'exact', head: true });
      
    if (error) {
      throw error;
    }
    
    res.json({
      status: 'SUCCESS',
      message: 'Successfully connected to Supabase Database',
      details: data
    });
  } catch (err) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Failed to connect to Supabase Database',
      error: err.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 Finor V6.0 Backend running on port ${PORT}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`========================================`);
}); 

