import { supabase } from '../config/supabase.js';

/**
 * Middleware to protect routes using Supabase JWT verification.
 * Expects header: "Authorization: Bearer <jwt_token>"
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format.' });
    }

    const token = authHeader.split(' ')[1];
    
    // Call Supabase API to fetch user profile with the token (validates the JWT)
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Session invalid or expired.' });
    }

    // Attach user metadata to request object
    req.user = user;
    next();
  } catch (err) {
    console.error('[AuthMiddleware] Error verifying JWT:', err.message);
    return res.status(401).json({ error: 'Unauthorized: Verification failure.' });
  }
}
