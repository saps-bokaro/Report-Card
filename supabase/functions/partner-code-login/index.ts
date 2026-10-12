import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigin = 'https://saps-bokaro.github.io';
const redirectTo = 'https://saps-bokaro.github.io/Report-Card/support.html';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
};

function jsonResponse(body: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (request) => {
  if (request.headers.get('origin') !== allowedOrigin) {
    return jsonResponse({ error: 'Request origin is not allowed.' }, 403);
  }

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Partner code login is missing Supabase server configuration.');
    return jsonResponse({ error: 'Partner access is unavailable.' }, 500);
  }

  let code: unknown;
  try {
    ({ code } = await request.json());
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }

  if (typeof code !== 'string' || code.length < 24 || code.length > 256) {
    return jsonResponse({ error: 'Invalid partner access code.' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: partnerUserId, error: verifyError } = await supabase.rpc(
      'verify_partner_access_code',
      { input_code: code }
    );
    if (verifyError) throw verifyError;
    if (typeof partnerUserId !== 'string') {
      return jsonResponse({ error: 'Invalid partner access code.' }, 401);
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(partnerUserId);
    if (userError) throw userError;
    if (!userData.user?.email) {
      return jsonResponse({ error: 'Partner account is not configured.' }, 403);
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
      options: { redirectTo }
    });
    if (linkError) throw linkError;

    const actionLink = linkData.properties?.action_link;
    if (!actionLink) throw new Error('Supabase did not return a sign-in link.');
    return jsonResponse({ actionLink });
  } catch (error) {
    console.error('Partner code login failed:', error);
    return jsonResponse({ error: 'Partner access is unavailable.' }, 500);
  }
});
