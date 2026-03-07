// Regular serverless function - 60s timeout
export const config = { maxDuration: 60 };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const ENGINE_PASSWORD   = process.env.ENGINE_PASSWORD || 'Rocky1';

function isValidToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [prefix, , password] = decoded.split(':');
    return prefix === 'raincheck' && password === ENGINE_PASSWORD;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, action, topic, category, neighborhood, context, imagePrompt } = req.body;

  if (!token || !isValidToken(token)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (action === 'find_stories')   return await findSeattleStories(res);
    if (action === 'generate_story') return await generateStory(res, { topic, category, neighborhood, context });
    if (action === 'generate_image') return await generateImage(res, imagePrompt);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}

async function findSeattleStories(res) {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  // Single call with web search tool — Claude searches and writes in one shot
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are the editorial voice of Raincheck, Seattle's weekly local newsletter. Today is ${today}.
Write warm, witty, hyperlocal content based on REAL current Seattle events you find.
After searching, return ONLY a valid JSON array — no markdown, no backticks, no explanation.`,
      messages: [{
        role: 'user',
        content: `Search for real things happening in Seattle this week and write 5 newsletter stories.

Return ONLY this JSON array:
[
  {
    "category": "🍜 Food & Drink",
    "headline": "punchy headline max 12 words",
    "body": "2-3 sentences with specific real details.",
    "location": "Neighborhood · timing",
    "image_prompt_subject": "specific visual for woodblock linocut illustration",
    "image_placeholder": "🍜",
    "link": "real URL to official website, event page, or best source — null if none found",
    "maps_link": "https://maps.google.com/?q=VENUE+NAME+SEATTLE — null if no specific venue",
    "tickets_link": "URL to ticket purchase page — null if no tickets needed"
  }
]

Categories: 🍜 Food & Drink, 🎵 Music, 🌸 Outdoors, 🎨 Arts & Culture, 🏪 New Opening, 👨‍👩‍👧 Family, ⚽ Sports, 🎭 Theater`
      }]
    })
  });

  const data = await response.json();

  // Extract text blocks only
  let text = '';
  for (const block of (data.content || [])) {
    if (block.type === 'text') text += block.text;
  }

  text = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not parse stories from response');

  return res.status(200).json({ stories: JSON.parse(match[0]) });
}

async function generateStory(res, { topic, category, neighborhood, context }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: `You are the editorial voice of Raincheck, Seattle's weekly local newsletter.
Write warm, witty, hyperlocal content. Return ONLY valid JSON, no markdown, no backticks.`,
      messages: [{
        role: 'user',
        content: `Write a Raincheck story about: "${topic}"
Category: ${category} | Neighborhood: ${neighborhood || 'Seattle'}
${context ? 'Context: ' + context : ''}

Return ONLY this JSON:
{
  "headline": "max 12 words",
  "body": "2-3 sentences with specific details.",
  "location": "${neighborhood || 'Seattle'} · timing if relevant",
  "image_prompt_subject": "visual for woodblock linocut illustration",
  "image_placeholder": "emoji"
}`
      }]
    })
  });

  const data = await response.json();
  let text = (data.content?.[0]?.text || '').trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  return res.status(200).json({ story: JSON.parse(text) });
}

async function generateImage(res, imagePromptSubject) {
  const prompt = `Woodblock linocut print illustration, wet ink texture, deep teal and warm amber palette, Seattle rainy atmosphere, gritty vintage editorial style, high contrast, square crop — ${imagePromptSubject}`;

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'url' })
  });

  const data = await response.json();
  if (data.error) throw new Error(`OpenAI error: ${data.error.message} (code: ${data.error.code})`);
  if (!data.data || !data.data[0]) throw new Error(`Unexpected OpenAI response: ${JSON.stringify(data)}`);
  return res.status(200).json({ url: data.data[0].url });
}
