import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Which data the app runs on.
 * - Real data: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (in .env locally, in Vercel's settings online).
 * - Demo data in the browser: leave them out, or set VITE_DATA=demo. Handy for UI work and offline demos.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const live = !!url && !!key && import.meta.env.VITE_DATA !== 'demo';
/**
 * True while payments use Flutterwave's sandbox (no real money). Screens then say so.
 * When Nestly takes real money, set VITE_PAYMENTS=live in .env and in Vercel, and the test-mode notes disappear.
 */
export const testPayments = import.meta.env.VITE_PAYMENTS !== 'live';

/** The Supabase client. Only exists when `live` is true. */
export const sb: SupabaseClient | null = live ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

/** Where email links (confirm, reset password) should send people back to. */
export const siteUrl = () => window.location.origin;
