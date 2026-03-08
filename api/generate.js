// Regular serverless function - 60s timeout
export const config = { maxDuration: 60 };

import { put } from '@vercel/blob';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY;
const ENGINE_PASSWORD   = process.env.ENGINE_PASSWORD;

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
    if (action === 'find_stories')   return await findSeattleStories(res, req.body.count || 5);
    if (action === 'generate_story') return await generateStory(res, { topic, category, neighborhood, context });
    if (action === 'generate_image') return await generateImage(res, imagePrompt);
    if (action === 'upload_image')   return await uploadUserImage(res, req.body.imageData, req.body.filename);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}

async function findSeattleStories(res, count = 5) {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

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
CRITICAL: Before writing any date into a story, verify it with a second search. Never guess or infer dates — only write dates you have confirmed from a source. If you cannot confirm an exact date, write "dates TBA" rather than guessing.
After searching, return ONLY a valid JSON array — no markdown, no backticks, no explanation.`,
      messages: [{
        role: 'user',
        content: `Search for real things happening in Seattle this week and write ${count} newsletter stories.

IMPORTANT: For every event date you include, you must have found it explicitly in a search result. Do not assume or approximate dates.

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

  // Generate from DALL-E
  const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'url' })
  });

  const data = await openaiRes.json();
  if (data.error) throw new Error(`OpenAI error: ${data.error.message} (code: ${data.error.code})`);
  if (!data.data?.[0]?.url) throw new Error(`Unexpected OpenAI response: ${JSON.stringify(data)}`);

  // Fetch image and upload to Vercel Blob for permanent storage
  const imageRes = await fetch(data.data[0].url);
  const imageBuffer = await imageRes.arrayBuffer();
  const filename = `images/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

  const blob = await put(filename, imageBuffer, {
    access: 'public',
    contentType: 'image/png'
  });

  return res.status(200).json({ url: blob.url });
}

async function uploadUserImage(res, base64Data, filename) {
  if (!base64Data) throw new Error('No image data provided');
  const clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');
  const ext = (filename?.split('.').pop() || 'jpg').toLowerCase().replace('jpeg','jpg');
  const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const blobName = `images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const blob = await put(blobName, buffer, { access: 'public', contentType });
  return res.status(200).json({ url: blob.url });
}
