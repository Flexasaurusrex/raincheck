export const config = { runtime: 'edge' };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const ENGINE_PASSWORD   = process.env.ENGINE_PASSWORD || 'Rocky1';

function isValidToken(token) {
  try {
    const decoded = atob(token);
    const [prefix, , password] = decoded.split(':');
    return prefix === 'raincheck' && password === ENGINE_PASSWORD;
  } catch { return false; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json();
  const { token, action, topic, category, neighborhood, context, imagePrompt } = body;

  if (!token || !isValidToken(token)) return json({ error: 'Unauthorized' }, 401);

  try {
    if (action === 'find_stories')   return await findSeattleStories();
    if (action === 'generate_story') return await generateStory({ topic, category, neighborhood, context });
    if (action === 'generate_image') return await generateImage(imagePrompt);
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e.message }, 500);
  }
}

async function findSeattleStories() {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  // Step 1: Use web search to find real Seattle events
  const searchRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Search for things happening in Seattle this week (today is ${today}). Find 5 real specific local events, openings, or activities. Search for: Seattle events this week, Seattle restaurant openings, Seattle concerts, Seattle outdoor activities. Return a brief summary of what you find.`
      }]
    })
  });

  const searchData = await searchRes.json();

  // Extract all text content from the response
  let searchSummary = '';
  for (const block of searchData.content || []) {
    if (block.type === 'text') searchSummary += block.text + '\n';
  }

  // Step 2: Use that search summary to generate structured stories
  const writeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: `You are the editorial voice of Raincheck, Seattle's weekly local newsletter. 
Write warm, witty, hyperlocal content. Be specific. Sound like a friend who lives in Seattle.
You MUST return ONLY a valid JSON array. No markdown, no backticks, no preamble, no explanation. Just the JSON array.`,
      messages: [{
        role: 'user',
        content: `Based on this Seattle news and events research, write 5 newsletter stories in Raincheck's voice:

${searchSummary || 'Write about typical Seattle spring activities, new restaurant openings, music venues, outdoor spots, and cultural events.'}

Return ONLY this JSON array (no other text):
[
  {
    "category": "🍜 Food & Drink",
    "headline": "punchy headline max 12 words",
    "body": "2-3 sentences. Specific details. Why locals should care right now.",
    "location": "Neighborhood · Day or Hours",
    "image_prompt_subject": "specific visual subject for woodblock linocut illustration",
    "image_placeholder": "🍜"
  }
]

Use these categories as appropriate: 🍜 Food & Drink, 🎵 Music, 🌸 Outdoors, 🎨 Arts & Culture, 🏪 New Opening, 👨‍👩‍👧 Family, ⚽ Sports, 🎭 Theater`
      }]
    })
  });

  const writeData = await writeRes.json();
  let text = '';
  for (const block of writeData.content || []) {
    if (block.type === 'text') text += block.text;
  }

  // Clean and parse JSON
  text = text.trim();
  // Strip any markdown code fences if present
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse stories from response');

  const stories = JSON.parse(match[0]);
  return json({ stories });
}

async function generateStory({ topic, category, neighborhood, context }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are the editorial voice of Raincheck, Seattle's weekly local newsletter.
Write warm, witty, hyperlocal content. Be specific. Sound like a friend who lives in Seattle.
Return ONLY valid JSON, no markdown, no preamble, no backticks.`,
      messages: [{
        role: 'user',
        content: `Write a Raincheck story about: "${topic}"
Category: ${category}
Neighborhood: ${neighborhood || 'Seattle'}
${context ? 'Context: ' + context : ''}

Return ONLY this JSON (no other text):
{
  "headline": "punchy headline max 12 words",
  "body": "2-3 sentences. Specific details. Why locals should care.",
  "location": "${neighborhood || 'Seattle'} · timing if relevant",
  "image_prompt_subject": "specific visual for woodblock linocut illustration",
  "image_placeholder": "relevant emoji"
}`
      }]
    })
  });

  const data = await res.json();
  let text = (data.content?.[0]?.text || '').trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  return json({ story: JSON.parse(text) });
}

async function generateImage(imagePromptSubject) {
  const prompt = `Woodblock linocut print illustration, wet ink texture, deep teal and warm amber palette, Seattle rainy atmosphere, gritty vintage editorial style, high contrast, square crop — ${imagePromptSubject}`;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'url' })
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return json({ url: data.data[0].url });
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
