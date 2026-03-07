export const config = { maxDuration: 10 };

const ENGINE_PASSWORD = process.env.ENGINE_PASSWORD || 'Rocky1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body;
  const correct = ENGINE_PASSWORD;

  if (password === correct) {
    const token = Buffer.from(`raincheck:${Date.now()}:${correct}`).toString('base64');
    return res.status(200).json({ ok: true, token });
  }

  return res.status(401).json({ ok: false, error: 'Wrong password' });
}
