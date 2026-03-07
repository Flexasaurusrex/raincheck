export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const { password } = await req.json();
  const correct = process.env.ENGINE_PASSWORD || 'Rocky1';

  if (password === correct) {
    // Return a simple signed token: base64(timestamp + secret)
    const token = btoa(`raincheck:${Date.now()}:${correct}`);
    return json({ ok: true, token });
  }

  return json({ ok: false, error: 'Wrong password' }, 401);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
