const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const usesHashRouting = import.meta.env.MODE === 'pages';

export const config = {
  supabaseUrl: url ?? '',
  supabaseKey: key ?? '',
  configured: Boolean(url && /^https?:\/\//.test(url) && key && !key.startsWith('replace-')),
};
