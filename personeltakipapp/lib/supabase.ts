import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://eyuqsewxaetmwiiwihcu.supabase.co'
).trim();

const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const looksLikeKey = (key?: string) => !!key && (key.startsWith('eyJ') || key.startsWith('sb_'));

const supabaseAnonKey = (
  (looksLikeKey(envAnonKey) ? envAnonKey : undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dXFzZXd4YWV0bXdpaXdpaGN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTMyMjIsImV4cCI6MjExMTI2OTIyMn0.pG3zR95dvEmrs27KExu7An07V2X2Uh9c6guJrbNGy6U'
).trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
