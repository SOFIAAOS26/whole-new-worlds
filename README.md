# WHOLE NEW WORLDS — the official player

> *What if we choose each other?*

A cinematic, single-page web experience built for the song **Whole New Worlds**.
No frameworks, no backend, no build step — just HTML, CSS and vanilla JavaScript.
It's designed to run as a fully static site on **GitHub Pages**.

- Custom player (play / pause / restart · ±10s · seek · volume · mute · share)
- Bilingual synced lyrics — English big, Spanish underneath — with **EN · ES** toggle
- A living starfield background that breathes with the music
- An intro, section-aware moments, and a dedicated ending
- Responsive (a cinematic two-column desktop, a single premium column on mobile)
- Accessible: keyboard control, ARIA labels, focus states, `prefers-reduced-motion`

---

## 1. File structure

```
Mundos_enteros/
├── index.html
├── README.md
├── assets/
│   ├── whole-new-worlds.mp3     ← the audio (already here)
│   ├── cover.jpg                ← the cover art
│   ├── lyrics.json             ← lyrics + translations + timings (edit this)
│   └── lyrics.lrc              ← a plain .lrc export (optional / portability)
├── css/
│   └── style.css
└── js/
    └── app.js
```

Everything uses **relative paths**, so it works whether it's opened from the repo
root or from `https://USERNAME.github.io/whole-new-worlds/`.

---

## 2. Run it locally

Because the app uses `fetch()` to load the lyrics, opening `index.html` directly
with `file://` can be blocked by the browser. Run a tiny local server instead:

```bash
cd Mundos_enteros
python3 -m http.server 8000
# then open http://localhost:8000
```

(Any static server works — `npx serve`, VS Code Live Server, etc.)

---

## 3. Publish on GitHub Pages

1. Create a repository named **`whole-new-worlds`** (any name is fine).
2. Put every file from this folder in the repo root and push:
   ```bash
   git init
   git add .
   git commit -m "Whole New Worlds — official player"
   git branch -M main
   git remote add origin https://github.com/USERNAME/whole-new-worlds.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment**
   - **Source:** *Deploy from a branch*
   - **Branch:** `main` · folder `/ (root)` → **Save**
4. Wait ~1 minute. Your site is live at:
   `https://USERNAME.github.io/whole-new-worlds/`

> Tip: for a perfect social-media preview, edit the `og:image` / `twitter:image`
> tags in `index.html` to the **full absolute URL** of the cover, e.g.
> `https://USERNAME.github.io/whole-new-worlds/assets/cover.jpg`.

---

## 4. Replace the audio

Drop your final mixdown in `assets/` and name it **`whole-new-worlds.mp3`**.
(Or keep any name and update `<audio src="…">` in `index.html` and `audio` in
`assets/lyrics.json`.) MP3 is the safest cross-browser format.

---

## 5. Replace the cover

Replace **`assets/cover.jpg`** with your own square artwork (1400–1600px works
well). Nothing else to change — the ambient glow is generated in CSS from the
artwork automatically.

---

## 6. Edit the lyrics

All lyrics live in **`assets/lyrics.json`**. Each line looks like this:

```json
{
  "time": 8.37,
  "section": "INTRO",
  "sectionStart": true,
  "en": "What if we choose each other?",
  "es": "¿Y si nos elegimos?",
  "tag": "whatif"
}
```

- **`en`** — the English line (shown large)
- **`es`** — the Spanish translation (shown smaller underneath)
- **`section`** — `INTRO`, `VERSE 1`, `PRE-CHORUS`, `CHORUS`, `POST-CHORUS`,
  `VERSE 2`, `BRIDGE`, `BUILD`, `FINAL CHORUS`, `CLIMAX`, `OUTRO`.
  Some sections (chorus, climax, build) make the background swell.
- **`sectionStart`** — `true` on the first line of a section (drives the small
  section label). Cosmetic.
- **`tag`** — optional special visual treatment (see §8).

Add, remove or reorder lines freely — the player rebuilds itself from this file.

---

## 7. Sync the timestamps  ⏱️ (important)

**The `time` values shipped here are ESTIMATES.** They are spread across the real
song length so the experience works immediately, but they are *not* hand-timed to
the vocal yet. Replacing them is easy:

1. Open the site locally, press play, and watch which line is active.
2. In `assets/lyrics.json`, set each line's **`time`** (in **seconds**, decimals
   allowed) to the exact moment that line should light up.
   - `8.37` = 8.37 seconds · `95.5` = 1:35.5
3. Save and refresh. That's it — no code changes.

Lines must stay in ascending time order (they already are). A quick way to grab
timings: play the track in any audio editor (Audacity, etc.) and note the start
of each line.

There's also a classic **`assets/lyrics.lrc`** file if you prefer that format or
want to reuse the timings elsewhere. The app reads `lyrics.json`, so that's the
one that drives the page — keep it as the source of truth.

---

## 8. Special line effects (`tag`)

Give any line one of these tags to make it feel different:

| tag            | effect                                                        |
|----------------|---------------------------------------------------------------|
| `whatif`       | *What if we choose each other?* — editorial glow              |
| `worlds`       | **WHOLE NEW WORLDS** — uppercase, gradient shimmer            |
| `worlds-soft`  | a gentler nod to the motif                                    |
| `imagine`      | *You imagine it / I will build it* — editorial serif          |
| `invent`       | *We'll invent it together* — warm gold glow                   |
| `mars`         | the playful Mars/dog line — a little 🐕 trots in               |

Leave `tag` as `""` for a normal line.

---

## 9. Change the title / credit / tagline

- **Title & tagline shown in the UI:** edit the text in `index.html`
  (`.identity-title`, `.identity-tagline`, the intro block) and the `<title>` /
  `<meta>` tags.
- **Credit line** (“An original song”): change `credit` in `assets/lyrics.json`
  *or* the `.identity-credit` text in `index.html`.

---

## 10. Customize the colours

Open `css/style.css` and edit the variables at the very top (`:root`):

```css
--void:        #050505;   /* the deep background            */
--text:        #f4f3f8;   /* warm white                     */
--cosmic-blue: #6f8bff;   /* primary light / progress line  */
--violet:      #8a6cff;   /* secondary cosmic tint          */
--gold:        #d9b877;   /* rare warm accent               */
```

Change these four or five values and the whole universe re-tints consistently.
Also update `<meta name="theme-color">` in `index.html` to match `--void`.

---

## 11. Keyboard shortcuts

| key            | action                    |
|----------------|---------------------------|
| `Space` / `K`  | play / pause (or start)   |
| `← / →`        | seek −5s / +5s            |
| `↑ / ↓`        | volume up / down          |
| `M`            | mute / unmute             |
| `L`            | cycle lyrics language     |
| on the seek bar: `←/→` ±5s, `Shift+←/→` ±30s, `Home`/`End` |

---

## 12. Notes

- No API keys, no tracking, no external calls except Google Fonts (and the page
  still looks right if fonts fail to load).
- Tested against modern Chrome, Safari, Firefox, and mobile Safari/Chrome.
- Autoplay is never forced — the listener always presses play first.

*Built as the official digital universe of the song. If a world doesn't exist —
we'll invent it together.*
