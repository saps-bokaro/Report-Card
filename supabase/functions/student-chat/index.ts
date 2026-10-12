import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigin = 'https://saps-bokaro.github.io';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
};

function jsonResponse(body: unknown, status = 200) {
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
    console.error('Student chat is missing Supabase server configuration.');
    return jsonResponse({ error: 'Chat is unavailable.' }, 500);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }

  const requestData = payload as Record<string, unknown>;
  const action = requestData.action;
  const regNo = typeof requestData.regNo === 'string' ? requestData.regNo.trim() : '';
  const className = typeof requestData.className === 'string' ? requestData.className.trim() : '';
  const allowedChatClassPattern = /^XII\/[A-K]$/i;
  if ((action !== 'load' && action !== 'send') || !regNo || regNo.length > 100 || !className || className.length > 100) {
    return jsonResponse({ error: 'Enter a valid class and registration number.' }, 400);
  }
  if (!allowedChatClassPattern.test(className)) {
    return jsonResponse({ error: 'Help chat is only available for classes XII/A to XII/K.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: registration, error: registrationError } = await supabase
      .from('registrations')
      .select('reg_no, class_name')
      .eq('reg_no', regNo)
      .eq('class_name', className)
      .maybeSingle();
    if (registrationError) throw registrationError;
    if (!registration) return jsonResponse({ error: 'Registration not found.' }, 404);

    if (action === 'load') {
      const pageSize = 1000;
      const messages = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('id, sender, message, created_at')
          .eq('reg_no', regNo)
          .eq('class_name', className)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        messages.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return jsonResponse({ messages });
    }

    const message = typeof requestData.message === 'string' ? requestData.message.trim() : '';
    if (!message || message.length > 4000) {
      return jsonResponse({ error: 'Messages must be between 1 and 4000 characters.' }, 400);
    }

    const { data: savedMessage, error } = await supabase
      .from('chat_messages')
      .insert({ reg_no: regNo, class_name: className, sender: 'visitor', message })
      .select('id, sender, message, created_at')
      .single();
    if (error) throw error;
    return jsonResponse({ message: savedMessage }, 201);
  } catch (error) {
    console.error('Student chat request failed:', error);
    return jsonResponse({ error: 'Chat is unavailable. Please try again.' }, 500);
  }
});
