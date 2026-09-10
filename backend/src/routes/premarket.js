import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { generatePremarketReport, getGlobalMarketCues } from '../services/premarketService.js';

const router = express.Router();

/**
 * GET /api/premarket/today
 * Returns the 8:00 AM Morning Market Pulse report personalized for the authenticated user
 */
router.get('/today', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const report = await generatePremarketReport(userId);
    res.json({ report, ...report });
  } catch (err) {
    console.error('[PremarketRoute] Error generating premarket report:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate premarket report' });
  }
});

/**
 * GET /api/premarket/cues
 * Returns public global market cues (unauthenticated / quick poll)
 */
router.get('/cues', async (req, res) => {
  try {
    const cues = await getGlobalMarketCues();
    res.json(cues);
  } catch (err) {
    console.error('[PremarketRoute] Error fetching global cues:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
