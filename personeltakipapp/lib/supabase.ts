import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://eyuqsewxaetmwiiwhicu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dXFzZXd4YWV0bXdpaXdpaGN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTMyMjIsImV4cCI6MjExMTI2OTIyMn0.pG3zR95dvEmrs27KExu7An07V2X2Uh9c6guJrbNGy6U'
);