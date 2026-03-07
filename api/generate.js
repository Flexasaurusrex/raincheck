export const config = { runtime: 'edge' };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const { action, topic, category, neighborhood, context, imagePrompt } = await req.json();

  try {
    if (action === 'generate_story') {
      return await generateStory({ topic, category, neighborhood, context });
    }
    if (action === 'generate_image') {
      return await generateImage(imagePrompt);
    }
    if (action === 'find_stories') {
      return await findSeattleStories();
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e.message }, 500);
  }
}

// ── FIND SEATTLE STORIES via Claude web search ──
async function findSeattleStories() {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'interleaved-thinking-2025-01-14'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search'
      }],
      system: `You are the editorial engine for Raincheck, Seattle's weekly local newsletter. Today is ${today}.

Search the web for 5 real, specific things happening in Seattle THIS WEEK — things worth telling locals about. Focus on:
- New restaurant/bar openings or notable specials
- Live music, arts events, cultural happenings  
- Outdoor activities, parks, seasonal things
- Interesting local news (positive only — no crime/politics)
- Cool new shops, pop-ups, markets

For each story, write in Raincheck's voice: warm, witty, local, like a friend who lives here telling you about something great.

Return ONLY a valid JSON array, no markdown, no preamble:
[
  {
    "category": "🍜 Food & Drink",
    "headline": "...",
    "body": "2-3 sentences max. Specific details. Why should locals care right now.",
    "location": "Neighborhood · Day/Date or Hours",
    "image_prompt_subject": "specific visual subject for woodblock illustration",
    "image_placeholder": "🍜"
  }
]

Categories to choose from: 🍜 Food & Drink, 🎵 Music, 🌸 Outdoors, 🎨 Arts & Culture, 🏪 New Opening, 👨‍👩‍👧 Family, ⚽ Sports, 🎭 Theater`,
      messages: [{ role: 'user', content: `Find 5 great Seattle stories for this week's Raincheck newsletter. Today is ${today}. Search for real current events and openings.` }]
    })
  });

  const data = await res.json();

  // Extract text from response (may include tool use blocks)
  let text = '';
  for (const block of data.content || []) {
    if (block.type === 'text') text += block.text;
  }

  // Parse JSON from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse stories from Claude response');
  const stories = JSON.parse(match[0]);

  return json({ stories });
}

// ── GENERATE SINGLE STORY ──
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
Write warm, witty, hyperlocal content. Be specific. Sound like a friend who lives in Seattle telling you about something worth doing.
Return ONLY valid JSON, no markdown backticks, no preamble.`,
      messages: [{
        role: 'user',
        content: `Write a Raincheck story about: "${topic}"
Category: ${category}
Neighborhood: ${neighborhood || 'Seattle'}
${context ? 'Additional context: ' + context : ''}

Return JSON:
{
  "headline": "punchy headline, max 12 words",
  "body": "2-3 sentences. Specific details. Why locals should care right now.",
  "location": "${neighborhood || 'Seattle'} · timing/hours if relevant",
  "image_prompt_subject": "specific visual for woodblock linocut illustration",
  "image_placeholder": "relevant emoji"
}`
      }]
    })
  });

  const data = await res.json();
  const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
  const story = JSON.parse(text);
  return json({ story });
}

// ── GENERATE DALL·E THUMBNAIL ──
async function generateImage(imagePromptSubject) {
  const fullPrompt = `Woodblock linocut print illustration, wet ink texture, deep teal and warm amber palette, Seattle rainy atmosphere, gritty vintage editorial style, high contrast, square crop — ${imagePromptSubject}`;

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: fullPrompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url'
    })
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
