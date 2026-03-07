# ☂ Raincheck — Seattle's Weekly Dispatch

> *Where the drizzle becomes inspiration.*

A local newsletter platform for Seattle, powered by Rocky the Raincheck Raccoon.

---

## Project Structure

```
raincheck/
├── public/                  # Live site (deployed to Vercel)
│   ├── index.html           # Main landing page + subscribe
│   ├── rockyracoon.png      # Rocky mascot mark
│   └── raincheckbanner.png  # Hero banner illustration (add this)
│
├── internal/                # Editor tools (run locally, never deploy)
│   ├── engine.html          # Content engine — generate stories + thumbnails
│   └── email-template.html  # Weekly email template with {{VARIABLES}}
│
├── vercel.json              # Vercel deployment config
├── .gitignore
└── README.md
```

---

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "🚀 initial raincheck deploy"
git remote add origin https://github.com/YOUR_USERNAME/raincheck.git
git push -u origin main
```

### 2. Connect to Vercel
- Go to [vercel.com](https://vercel.com) → Import Project → select your GitHub repo
- Framework: **Other**
- Root directory: leave as `/`
- Click Deploy

### 3. Add your domain
Point `raincheckseattle.xyz` (or your domain) to Vercel in the project settings.

---

## Before Going Live Checklist

- [ ] Add `raincheckbanner.png` to `/public/` (the hero illustration)
- [ ] Add `rockyracoon.png` to `/public/` (Rocky's mark — already included)
- [ ] Set your **Beehiiv Publication ID** in `public/index.html`
  - Find it: Beehiiv Dashboard → Settings → Publication Details
  - Replace `YOUR_PUBLICATION_ID_HERE` with your real ID
- [ ] Update `ads@raincheckseattle.xyz` to your real email in `index.html`
- [ ] Update Rocky image URLs in `internal/email-template.html` from `https://raincheckseattle.xyz/rockyracoon.png` to your live domain

---

## Content Engine (internal/engine.html)

Run locally — open in browser, never deploy publicly.

**Requires:**
- Anthropic API key (Claude drafts the story)
- OpenAI API key (DALL·E 3 generates the Rocky-style thumbnail)

**Workflow:**
1. Enter topic + category + neighborhood
2. Hit Generate
3. Claude writes the story, DALL·E generates a square woodblock-style thumbnail
4. Approve / Edit / Discard in the tile grid
5. Copy approved content into the weekly email template

---

## Weekly Email (internal/email-template.html)

Fill in all `{{VARIABLES}}` before each send:

| Variable | Description |
|---|---|
| `{{ISSUE_NUMBER}}` | e.g. `001` |
| `{{DATE_DISPLAY}}` | e.g. `Mar 9` |
| `{{DATE_LONG}}` | e.g. `Sunday, March 9, 2026` |
| `{{PREHEADER_TEXT}}` | Short preview text (50 chars) |
| `{{ROCKY_INTRO_NOTE}}` | Rocky's personal weekly opener |
| `{{STORY1_IMAGE}}` through `{{STORY5_IMAGE}}` | Full URLs to generated thumbnails |
| `{{STORY1_HEADLINE}}` etc. | Story content from engine |
| `{{AD_EYEBROW}}`, `{{AD_HEADLINE}}`, `{{AD_BODY}}`, `{{AD_CTA}}`, `{{AD_URL}}` | Sponsor content |
| `{{ROCKYS_PICK_HEADLINE}}`, `{{ROCKYS_PICK_BODY}}` | Rocky's pick section |
| `{{QH1_TITLE}}` / `{{QH1_BODY}}` etc. | Quick hits (3 bullets) |
| `{{UNSUBSCRIBE_URL}}` | Auto-filled by Beehiiv |
| `{{PREFERENCES_URL}}` | Auto-filled by Beehiiv |

Upload the filled HTML to Beehiiv as a custom template.

---

## Brand Assets

| Asset | Notes |
|---|---|
| Rocky the Raincheck Raccoon | `rockyracoon.png` — woodblock linocut, pizza slice |
| Hero Banner | `raincheckbanner.png` — full Seattle scene illustration |
| Primary color | `#c8622a` — amber |
| Background | `#1a3a3f` — deep teal |
| Tagline | *Where the drizzle becomes inspiration.* |
| Fonts | Alfa Slab One (headlines), Lora (body), Barlow Condensed (labels) |

---

## Thumbnail Style Prompt (lock this in for all AI image generation)

```
Woodblock linocut print illustration, wet ink texture, deep teal and warm amber palette,
Seattle rainy atmosphere, gritty vintage editorial style, high contrast, square crop — [SUBJECT]
```

---

*Built with Claude. Rocky approves. 🦝🍕*
