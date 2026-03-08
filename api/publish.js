export const config = { maxDuration: 60 };

const GITHUB_TOKEN    = process.env.GITHUB_TOKEN;
const GITHUB_REPO     = process.env.GITHUB_REPO || 'flexasaurusrex/raincheck';
const ENGINE_PASSWORD = process.env.ENGINE_PASSWORD;
const BRANCH          = 'main';
const SITE_URL        = 'https://raincheck.news';

function isValidToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [prefix, , password] = decoded.split(':');
    return prefix === 'raincheck' && password === ENGINE_PASSWORD;
  } catch { return false; }
}

async function gh(path, options = {}) {
  return fetch(`https://api.github.com/repos/${GITHUB_REPO}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
}

function buildArchiveBlock(issue, week_of, stories) {
  const cards = stories.map(story => {
    const heroClass = story.hero ? ' story-card--hero' : '';
    const imgHtml = story.image
      ? `<img src="${story.image}" alt="${(story.headline || '').replace(/"/g, '&quot;')}" />`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;">${story.image_placeholder || '📰'}</div>`;
    const linksHtml = [
      story.link         ? `<a class="card-link card-link--primary" href="${story.link}" target="_blank" rel="noopener">More info →</a>` : '',
      story.tickets_link ? `<a class="card-link card-link--secondary" href="${story.tickets_link}" target="_blank" rel="noopener">🎟 Get tickets</a>` : '',
      story.maps_link    ? `<a class="card-link card-link--secondary" href="${story.maps_link}" target="_blank" rel="noopener">📍 Directions</a>` : '',
    ].filter(Boolean).join('\n            ');

    return `      <div class="story-card${heroClass}">
        <div class="card-bar"></div>
        <div class="card-img">${imgHtml}</div>
        <div class="card-body">
          <div class="card-cat">${story.category || ''}</div>
          <h3 class="card-title">${story.headline || ''}</h3>
          <p class="card-text">${story.body || ''}</p>
          <div class="card-loc">${story.location || ''}</div>
          ${linksHtml ? `<div class="card-links">\n            ${linksHtml}\n          </div>` : ''}
        </div>
      </div>`;
  }).join('\n\n');

  return `  <!-- ISSUE ${issue} -->
  <div class="issue-block reveal">
    <div class="issue-header">
      <div class="issue-num">Issue ${issue}</div>
      <div class="issue-date">Vol. 1</div>
      <div class="issue-tag">Week of ${week_of}</div>
    </div>
    <div class="stories-grid">
${cards}
    </div>
  </div>`;
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
    // Get current branch tip
    const branchRes = await gh(`/git/refs/heads/${BRANCH}`);
    if (!branchRes.ok) throw new Error('Could not get branch ref');
    const { object: { sha: branchSha } } = await branchRes.json();

    // Get tree SHA of current commit
    const commitRes = await gh(`/git/commits/${branchSha}`);
    if (!commitRes.ok) throw new Error('Could not get commit');
    const { tree: { sha: treeSha } } = await commitRes.json();

    // Download each Vercel Blob image and upload to GitHub, rewrite URL to raincheck.news
    const treeItems = [];

    const processedStories = await Promise.all(stories.map(async (story) => {
      if (!story.image || !story.image.includes('vercel-storage.com')) return story;
      try {
        const imgRes = await fetch(story.image);
        if (!imgRes.ok) return story;
        const imgBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(imgBuffer).toString('base64');

        // Keep original filename from blob URL
        const rawName = story.image.split('/').pop().split('?')[0];
        const repoPath = `public/images/${rawName}`;

        const blobRes = await gh('/git/blobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: base64, encoding: 'base64' })
        });
        if (!blobRes.ok) return story;
        const { sha: blobSha } = await blobRes.json();

        treeItems.push({ path: repoPath, mode: '100644', type: 'blob', sha: blobSha });
        return { ...story, image: `${SITE_URL}/images/${rawName}` };
      } catch (e) {
        console.error('Image transfer failed:', e.message);
        return story;
      }
    }));

    // Add stories.json (with rewritten image URLs) to the tree
    const storiesContent = JSON.stringify({ issue, week_of, stories: processedStories }, null, 2);
    const storiesBlobRes = await gh('/git/blobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: Buffer.from(storiesContent).toString('base64'), encoding: 'base64' })
    });
    if (!storiesBlobRes.ok) throw new Error('Could not create stories blob');
    const { sha: storiesBlobSha } = await storiesBlobRes.json();
    treeItems.push({ path: 'public/stories.json', mode: '100644', type: 'blob', sha: storiesBlobSha });

    // Update archive.html with new issue block
    try {
      const archiveRes = await gh('/contents/public/archive.html');
      if (archiveRes.ok) {
        const archiveData = await archiveRes.json();
        const currentHtml = Buffer.from(archiveData.content, 'base64').toString('utf8');
        const issueBlock = buildArchiveBlock(issue, week_of, processedStories);
        const marker = '  <!-- Future issues will appear here -->';
        if (currentHtml.includes(marker) && !currentHtml.includes(`Issue ${issue}<`)) {
          const updatedHtml = currentHtml.replace(marker, `${issueBlock}\n\n${marker}`);
          const archiveBlobRes = await gh('/git/blobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: Buffer.from(updatedHtml).toString('base64'), encoding: 'base64' })
          });
          if (archiveBlobRes.ok) {
            const { sha: archiveBlobSha } = await archiveBlobRes.json();
            treeItems.push({ path: 'public/archive.html', mode: '100644', type: 'blob', sha: archiveBlobSha });
          }
        }
      }
    } catch (e) {
      console.error('Archive update failed (non-fatal):', e.message);
    }

    // Create new tree on top of existing
    const newTreeRes = await gh('/git/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: treeSha, tree: treeItems })
    });
    if (!newTreeRes.ok) throw new Error('Could not create tree');
    const { sha: newTreeSha } = await newTreeRes.json();

    // Create commit
    const newCommitRes = await gh('/git/commits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `📰 Issue #${issue} — ${week_of}`,
        tree: newTreeSha,
        parents: [branchSha]
      })
    });
    if (!newCommitRes.ok) throw new Error('Could not create commit');
    const { sha: newCommitSha, html_url } = await newCommitRes.json();

    // Advance branch ref
    const updateRefRes = await gh(`/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommitSha })
    });
    if (!updateRefRes.ok) throw new Error('Could not update branch ref');

    return res.status(200).json({
      ok: true,
      commit: html_url,
      message: `Issue #${issue} published — site will update in ~15 seconds`
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
