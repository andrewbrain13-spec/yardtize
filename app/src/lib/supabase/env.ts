/**
 * Supabase connection details, read once with a clear failure message.
 * A missing key should fail loudly at boot, not as a confusing 401 later.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local for local dev, or to the Vercel project's Environment Variables for the deployed site.`,
    );
  }
  return value;
}

export const SUPABASE_URL = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Safe to expose to the browser; row-level security governs what it can read. */
export const SUPABASE_PUBLISHABLE_KEY = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
