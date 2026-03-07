export const config = { maxDuration: 30 };

const GITHUB_TOKEN    = process.env.GITHUB_TOKEN;
const GITHUB_REPO     = process.env.GITHUB_REPO || 'flexasaurusrex/raincheck';
const ENGINE_PASSWORD = process.env.ENGINE_PASSWORD || 'Rocky1';
const FILE_PATH       = 'public/stories.json';
const BRANCH          = 'main';

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

  const { token, stories, issue, week_of } = req.body;

  if (!token || !isValidToken(token)) return res.status(401).json({ error: 'Unauthorized' });
  if (!stories || !stories.length)    return res.status(400).json({ error: 'No stories provided' });

  try {
    const content = JSON.stringify({ issue, week_of, stories }, null, 2);
    const base64  = Buffer.from(content).toString('base64');

    // Get current file SHA (required for updates)
    const getRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${BRANCH}`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    let sha = null;
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    // Commit the new stories.json
    const putRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        message: `📰 Issue #${issue} — ${week_of}`,
        content: base64,
        branch:  BRANCH,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      throw new Error(`GitHub API error: ${err.message}`);
    }

    const result = await putRes.json();
    return res.status(200).json({
      ok: true,
      commit: result.commit?.html_url,
      message: `Issue #${issue} published — site will update in ~15 seconds`
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
