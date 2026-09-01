/* =========================================================================
   WHOLE NEW WORLDS — app.js
   A custom cinematic player + synced bilingual lyrics + living background.
   Vanilla JS, no dependencies. Everything degrades gracefully.
   ========================================================================= */
(() => {
  "use strict";

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // sections that should make the universe swell a little
  const HOT_SECTIONS = new Set(["CHORUS", "FINAL CHORUS", "CLIMAX", "BUILD"]);
  const HUM = /^ta-ra/i;

  const els = {
    body:        document.body,
    audio:       $("#audio"),
    intro:       $("#intro"),
    introPlay:   $("#introPlay"),
    stage:       $("#stage"),
    ending:      $("#ending"),
    btnAgain:    $("#btnAgain"),

    coverGlow:   $("#coverGlow"),
    identityCredit: $("#identityCredit"),

    btnPlay:     $("#btnPlay"),
    btnRestart:  $("#btnRestart"),
    btnBack:     $("#btnBack"),
    btnFwd:      $("#btnFwd"),
    btnVol:      $("#btnVol"),
    volume:      $("#volume"),
    btnShare:    $("#btnShare"),

    seek:        $("#seek"),
    seekFill:    $("#seekFill"),
    seekBuffered:$("#seekBuffered"),
    seekHead:    $("#seekHead"),
    seekTip:     $("#seekTip"),
    timeCurrent: $("#timeCurrent"),
    timeDuration:$("#timeDuration"),

    lyricsScroll:$("#lyricsScroll"),
    lyricsList:  $("#lyricsList"),
    sectionFlag: $("#sectionFlag"),

    toast:       $("#toast"),
    canvas:      $("#starfield"),
    wordmark:    $(".sky-wordmark"),

    btnCinema:   $("#btnCinema"),
    cinemaBar:   $("#cinemaBar"),
    cinePlay:    $("#cinePlay"),
    cineExit:    $("#cineExit"),
    cineSeek:    $("#cineSeek"),
    cineFill:    $("#cineFill"),
    cineTime:    $("#cineTime"),
  };

  const CHORUS_SECTIONS = new Set(["CHORUS", "FINAL CHORUS", "CLIMAX"]);

  const state = {
    lines: [],
    times: [],
    active: -1,
    duration: 0,
    lastVolume: 0.85,
    userScrolling: false,
    userScrollTimer: 0,
    energy: 0,          // smoothed 0..1
    targetEnergy: 0,
    booted: false,
  };

  /* ----------------------------------------------------------------------
     TIME HELPERS
     ---------------------------------------------------------------------- */
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  /* ----------------------------------------------------------------------
     LOAD LYRICS
     ---------------------------------------------------------------------- */
  async function loadLyrics() {
    try {
      const res = await fetch("assets/lyrics.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      state.lines = data.lines || [];
      if (data.credit) {
        els.identityCredit.textContent = data.credit;
      }
    } catch (err) {
      console.warn("Could not load lyrics.json:", err);
      els.lyricsList.innerHTML =
        '<p style="opacity:.5;font-size:.9rem;letter-spacing:.1em">Lyrics unavailable.</p>';
      state.lines = [];
    }
    state.times = state.lines.map((l) => l.time);
    renderLyrics();
  }

  function renderLyrics() {
    const frag = document.createDocumentFragment();
    state.lines.forEach((line, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "lyric";
      el.dataset.index = i;
      if (line.tag) el.classList.add("tag-" + line.tag);
      if (HUM.test(line.en)) el.classList.add("is-hum");
      el.setAttribute("aria-label", `Jump to lyric: ${line.en}`);

      const en = document.createElement("span");
      en.className = "en";
      en.textContent = line.en;

      const es = document.createElement("span");
      es.className = "es";
      es.textContent = line.es;

      el.append(en, es);
      el.addEventListener("click", () => seekToLine(i));
      frag.appendChild(el);
    });
    els.lyricsList.innerHTML = "";
    els.lyricsList.appendChild(frag);
  }

  /* ----------------------------------------------------------------------
     LYRIC SYNC
     ---------------------------------------------------------------------- */
  function indexForTime(t) {
    const times = state.times;
    if (!times.length || t < times[0]) return -1;
    // binary search: last index whose time <= t
    let lo = 0, hi = times.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
  }

  function setActive(i) {
    if (i === state.active) return;
    const nodes = els.lyricsList.children;

    if (state.active >= 0 && nodes[state.active])
      nodes[state.active].classList.remove("is-active");

    // relabel neighbours cheaply (past / next hints)
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k];
      n.classList.toggle("is-past", k < i);
      n.classList.toggle("is-next", k > i);
    }

    state.active = i;
    const node = nodes[i];
    if (node) {
      node.classList.add("is-active");
      node.classList.remove("is-past", "is-next");
      centerLine(node);
      updateSectionFlag(i);
      setSceneForLine(state.lines[i]);
    }
  }

  function centerLine(node) {
    if (state.userScrolling) return;
    const shell = els.lyricsScroll;
    const target = node.offsetTop - shell.clientHeight / 2 + node.clientHeight / 2;
    shell.scrollTo({ top: target, behavior: REDUCED ? "auto" : "smooth" });
  }

  function updateSectionFlag(i) {
    const line = state.lines[i];
    if (!line) return;
    els.sectionFlag.textContent = line.section || "";
    els.sectionFlag.classList.add("show");
    // update the universe's mood by section
    els.body.dataset.section = line.section || "";
    boostForSection(line.section);
  }

  /* ----------------------------------------------------------------------
     TRANSPORT
     ---------------------------------------------------------------------- */
  function play() {
    els.audio.play().catch((e) => console.warn("play blocked:", e));
  }
  function pause() { els.audio.pause(); }
  function togglePlay() { els.audio.paused ? play() : pause(); }

  function seekToLine(i) {
    const t = state.times[i];
    if (t == null) return;
    els.audio.currentTime = t + 0.01;
    setActive(i);
    if (els.audio.paused) play();
  }

  function nudge(delta) {
    els.audio.currentTime = clamp(els.audio.currentTime + delta, 0, state.duration || els.audio.duration || 0);
  }

  function restart() {
    els.audio.currentTime = 0;
    setActive(-1);
    play();
  }

  function toggleMute() {
    if (els.audio.muted || els.audio.volume === 0) {
      els.audio.muted = false;
      els.audio.volume = state.lastVolume || 0.85;
      els.volume.value = els.audio.volume;
    } else {
      state.lastVolume = els.audio.volume;
      els.audio.muted = true;
    }
    reflectVolume();
  }

  function reflectVolume() {
    const muted = els.audio.muted || els.audio.volume === 0;
    els.btnVol.setAttribute("aria-pressed", String(muted));
    els.btnVol.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    els.btnVol.classList.toggle("is-muted", muted);
    els.body.dataset.muted = String(muted);
    // reflect visually which icon shows via a class toggle
    els.btnVol.querySelector(".ic-vol").style.display = muted ? "none" : "";
    els.btnVol.querySelector(".ic-mute").style.display = muted ? "" : "none";
  }

  /* ----------------------------------------------------------------------
     SEEK BAR (pointer + keyboard, precise)
     ---------------------------------------------------------------------- */
  function seekRatioFromEvent(clientX) {
    const r = els.seek.getBoundingClientRect();
    return clamp((clientX - r.left) / r.width, 0, 1);
  }

  function updateSeekVisual(ratio) {
    const pct = (ratio * 100).toFixed(3) + "%";
    els.seekFill.style.width = pct;
    els.seekHead.style.left = pct;
  }

  function wireSeek() {
    let scrubbing = false;

    const moveTip = (clientX) => {
      const ratio = seekRatioFromEvent(clientX);
      const r = els.seek.getBoundingClientRect();
      const dur = state.duration || els.audio.duration || 0;
      els.seekTip.textContent = fmt(ratio * dur);
      els.seekTip.style.left = (clamp(clientX - r.left, 0, r.width)) + "px";
    };

    els.seek.addEventListener("pointerdown", (e) => {
      scrubbing = true;
      els.seek.classList.add("is-scrubbing");
      els.seek.setPointerCapture(e.pointerId);
      const ratio = seekRatioFromEvent(e.clientX);
      updateSeekVisual(ratio);
      moveTip(e.clientX);
      els.seek.classList.add("show-tip");
    });

    els.seek.addEventListener("pointermove", (e) => {
      if (scrubbing) {
        const ratio = seekRatioFromEvent(e.clientX);
        updateSeekVisual(ratio);
      }
      moveTip(e.clientX);
    });

    els.seek.addEventListener("pointerenter", () => els.seek.classList.add("show-tip"));
    els.seek.addEventListener("pointerleave", () => { if (!scrubbing) els.seek.classList.remove("show-tip"); });

    const finish = (e) => {
      if (!scrubbing) return;
      scrubbing = false;
      els.seek.classList.remove("is-scrubbing", "show-tip");
      const ratio = seekRatioFromEvent(e.clientX);
      const dur = state.duration || els.audio.duration || 0;
      els.audio.currentTime = ratio * dur;
    };
    els.seek.addEventListener("pointerup", finish);
    els.seek.addEventListener("pointercancel", () => { scrubbing = false; els.seek.classList.remove("is-scrubbing", "show-tip"); });

    // keyboard on the slider
    els.seek.addEventListener("keydown", (e) => {
      const dur = state.duration || els.audio.duration || 0;
      const step = e.shiftKey ? 30 : 5;
      if (e.key === "ArrowRight") { nudge(step); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { nudge(-step); e.preventDefault(); }
      else if (e.key === "Home") { els.audio.currentTime = 0; e.preventDefault(); }
      else if (e.key === "End") { els.audio.currentTime = dur - 0.2; e.preventDefault(); }
    });
  }

  /* ----------------------------------------------------------------------
     SHARE
     ---------------------------------------------------------------------- */
  async function share() {
    const url = location.href;
    const payload = {
      title: "Whole New Worlds",
      text: "What if we choose each other? — Whole New Worlds",
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
    } catch (e) { /* user cancelled — fall through silently */
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast(url);
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  /* ----------------------------------------------------------------------
     CINEMA MODE — only the lyrics and the cosmos, fullscreen
     ---------------------------------------------------------------------- */
  let idleTimer = 0;
  function idleActivity() {
    els.body.dataset.idle = "false";
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (els.body.dataset.cinema === "true") els.body.dataset.idle = "true";
    }, 2600);
  }
  function startIdleWatch() {
    document.addEventListener("mousemove", idleActivity);
    document.addEventListener("touchstart", idleActivity, { passive: true });
    idleActivity();
  }
  function stopIdleWatch() {
    document.removeEventListener("mousemove", idleActivity);
    document.removeEventListener("touchstart", idleActivity);
    clearTimeout(idleTimer);
    els.body.dataset.idle = "false";
  }
  function requestFS() {
    const d = document.documentElement;
    const fn = d.requestFullscreen || d.webkitRequestFullscreen;
    if (fn) { try { const p = fn.call(d); if (p && p.catch) p.catch(() => {}); } catch {} }
  }
  function exitFS() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const fn = document.exitFullscreen || document.webkitExitFullscreen;
      if (fn) { try { const p = fn.call(document); if (p && p.catch) p.catch(() => {}); } catch {} }
    }
  }
  function toggleCinema(on) {
    const want = on === undefined ? els.body.dataset.cinema !== "true" : on;
    els.body.dataset.cinema = String(want);
    els.btnCinema.setAttribute("aria-pressed", String(want));
    els.btnCinema.setAttribute("aria-label", want ? "Exit cinema mode" : "Enter cinema mode");
    els.cinemaBar.setAttribute("aria-hidden", String(!want));
    if (want) {
      requestFS();
      startIdleWatch();
      const node = els.lyricsList.children[state.active];
      if (node) requestAnimationFrame(() => centerLine(node));
    } else {
      exitFS();
      stopIdleWatch();
    }
  }
  function updateCineProgress(ratio, t) {
    if (els.body.dataset.cinema !== "true") return;
    els.cineFill.style.width = (ratio * 100).toFixed(2) + "%";
    els.cineTime.textContent = fmt(t);
  }

  /* ----------------------------------------------------------------------
     BACKGROUND STARFIELD (canvas)
     ---------------------------------------------------------------------- */
  const sky = {
    ctx: null, w: 0, h: 0, dpr: 1,
    stars: [], raf: 0, running: false, boost: 0,
    scene: { constellations: 0, city: 0, mars: 0, finale: 0 },
    target: { constellations: 0, city: 0, mars: 0, finale: 0 },
    buildings: [],
    realStars: null,
  };

  // A few elegant constellations that draw themselves during the choruses.
  // Points are in a local -1..1 space; edges connect them in order.
  const CONSTELLATIONS = [
    { // "W" — the signature, top centre
      cx: 0.5, cy: 0.15, s: 0.11,
      pts: [[-1, -0.55], [-0.5, 0.6], [0, -0.25], [0.5, 0.6], [1, -0.55]],
      edges: [[0,1],[1,2],[2,3],[3,4]],
    },
    { // a temple / house — architecture, "we are the architects"
      cx: 0.19, cy: 0.26, s: 0.10,
      pts: [[-1, 0.6], [-1, -0.2], [0, -1], [1, -0.2], [1, 0.6]],
      edges: [[0,1],[1,2],[2,3],[3,4],[4,0]],
    },
    { // a heart — choosing each other
      cx: 0.83, cy: 0.2, s: 0.09,
      pts: [[0, 0.5], [-0.55, 0.95], [-1, 0.25], [0, -0.7], [1, 0.25], [0.55, 0.95], [0, 0.5]],
      edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]],
    },
  ];

  function initSky() {
    if (!els.canvas) return;
    sky.ctx = els.canvas.getContext("2d");
    resizeSky();
    window.addEventListener("resize", debounce(resizeSky, 200));
    if (REDUCED) { drawSky(true); return; }   // one static frame
    startSky();
  }

  function resizeSky() {
    sky.dpr = Math.min(window.devicePixelRatio || 1, 2);
    sky.w = window.innerWidth;
    sky.h = window.innerHeight;
    els.canvas.width = Math.floor(sky.w * sky.dpr);
    els.canvas.height = Math.floor(sky.h * sky.dpr);
    sky.ctx.setTransform(sky.dpr, 0, 0, sky.dpr, 0, 0);
    buildStars();
    buildCity();
    projectRealSky();
    if (REDUCED) drawSky(true);
  }

  function buildCity() {
    const n = clamp(Math.round(sky.w / 90), 8, 20);
    const maxH = Math.min(sky.h * 0.24, 230);
    sky.buildings = [];
    let x = -0.02;
    for (let i = 0; i < n; i++) {
      const wFrac = 0.035 + Math.random() * 0.05;
      const h = maxH * (0.34 + Math.random() * 0.66);
      const cols = 2 + Math.floor(Math.random() * 2);
      const rows = Math.max(2, Math.floor(h / 22));
      const wins = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (Math.random() < 0.5)
            wins.push([(c + 0.5) / cols, (r + 0.6) / rows, Math.random() < 0.12]);
      sky.buildings.push({ x, w: wFrac, h, order: i / n, wins });
      x += wFrac + 0.006 + Math.random() * 0.02;
      if (x > 1.06) break;
    }
  }

  // The hidden finale: the real sky of a specific night, projected to screen.
  async function loadRealSky() {
    try {
      const res = await fetch("assets/sky-1995.json", { cache: "no-cache" });
      if (!res.ok) return;
      const data = await res.json();
      state.realSky = data.stars || null;
      projectRealSky();
    } catch (e) { /* easter egg is optional — never block */ }
  }

  function projectRealSky() {
    if (!state.realSky) return;
    const R = 0.62 * Math.hypot(sky.w, sky.h);
    const cx = sky.w / 2, cy = sky.h / 2;
    sky.realStars = state.realSky.map((s) => ({
      sx: cx + s.x * R,
      sy: cy - s.y * R,             // N up on screen
      r: clamp(0.4 + s.s * 0.45, 0.4, 4.6),
      a: s.a,
      ph: Math.random() * 6.283,
      hot: s.m < 1.6,
    }));
  }

  function buildStars() {
    const area = sky.w * sky.h;
    const count = clamp(Math.round(area / 7000), 90, 240);
    sky.stars = new Array(count).fill(0).map(() => {
      const depth = Math.random();           // 0 far .. 1 near
      return {
        x: Math.random() * sky.w,
        y: Math.random() * sky.h,
        z: depth,
        r: 0.25 + depth * 1.35,
        base: 0.18 + Math.random() * 0.6,
        tw: Math.random() * Math.PI * 2,      // twinkle phase
        tws: 0.6 + Math.random() * 1.6,       // twinkle speed
        hue: Math.random(),
      };
    });
  }

  function starColor(hue, a) {
    if (hue > 0.86) return `rgba(200,212,255,${a})`;
    if (hue > 0.72) return `rgba(255,236,205,${a})`;
    return `rgba(255,255,255,${a})`;
  }

  let lastT = 0;
  function drawSky(single = false) {
    const ctx = sky.ctx;
    if (!ctx) return;
    const now = performance.now();
    const dt = single ? 0 : Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    ctx.clearRect(0, 0, sky.w, sky.h);

    const energy = state.energy;
    const drift = (6 + energy * 26 + sky.boost * 40) * dt;   // px/s upward
    const cx = sky.w / 2, cy = sky.h * 0.36;

    for (const s of sky.stars) {
      if (!single) {
        // slow parallax drift toward the light, faster when energetic
        s.y -= drift * (0.3 + s.z);
        // gentle expansion from centre during hot moments
        if (sky.boost > 0.01) {
          s.x += ((s.x - cx) * 0.0009 * sky.boost * s.z);
          s.y += ((s.y - cy) * 0.0009 * sky.boost * s.z);
        }
        if (s.y < -4) { s.y = sky.h + 4; s.x = Math.random() * sky.w; }
        if (s.x < -4) s.x = sky.w + 4;
        if (s.x > sky.w + 4) s.x = -4;
        s.tw += s.tws * dt;
      }
      const twinkle = 0.72 + Math.sin(s.tw) * 0.28;
      const a = clamp(s.base * twinkle * (0.6 + energy * 0.6), 0, 1) * (1 - sky.scene.finale);
      if (a <= 0.002) continue;
      ctx.beginPath();
      ctx.fillStyle = starColor(s.hue, a);
      ctx.arc(s.x, s.y, s.r * (1 + energy * 0.25), 0, Math.PI * 2);
      ctx.fill();
      // a soft halo for the nearest, brightest stars
      if (s.z > 0.82 && a > 0.4) {
        ctx.beginPath();
        ctx.fillStyle = starColor(s.hue, a * 0.14);
        ctx.arc(s.x, s.y, s.r * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- scenography: the universe tells the song ----
    const sc = sky.scene, tg = sky.target;
    const spd = { constellations: 1.6, city: 0.85, mars: 2.2, finale: 0.5 };
    for (const k in sc) sc[k] += (tg[k] - sc[k]) * Math.min(dt * spd[k], 1);
    drawMars(sc.mars * (1 - sc.finale));
    drawCity(sc.city * (1 - sc.finale));
    drawConstellations(sc.constellations * (0.8 + energy * 0.35) * (1 - sc.finale));
    drawRealSky(sc.finale, now);

    // ease boost back down
    sky.boost += (0 - sky.boost) * Math.min(dt * 0.6, 1);

    if (!single && sky.running) sky.raf = requestAnimationFrame(() => drawSky());
  }

  function drawCity(p) {
    if (p <= 0.003) return;
    const ctx = sky.ctx, baseY = sky.h + 2;
    for (const b of sky.buildings) {
      const rise = clamp((p - b.order * 0.35) / (1 - b.order * 0.35), 0, 1);
      if (rise <= 0) continue;
      const h = b.h * rise, bw = b.w * sky.w, bx = b.x * sky.w, top = baseY - h;
      const g = ctx.createLinearGradient(0, top, 0, baseY);
      g.addColorStop(0, `rgba(28,34,68,${0.9 * p})`);
      g.addColorStop(1, `rgba(6,8,18,${0.96 * p})`);
      ctx.fillStyle = g;
      ctx.fillRect(bx, top, bw, h);
      ctx.fillStyle = `rgba(120,150,255,${0.5 * rise * p})`;
      ctx.fillRect(bx, top, bw, 1.2);
      for (const w of b.wins) {
        const wy = top + w[1] * h;
        if (wy < top + 3) continue;
        ctx.fillStyle = w[2]
          ? `rgba(232,202,142,${0.72 * rise * p})`
          : `rgba(150,180,255,${0.55 * rise * p})`;
        ctx.fillRect(bx + w[0] * bw - 1, wy, 1.6, 1.6);
      }
    }
  }

  function drawConstellations(p) {
    if (p <= 0.003) return;
    const ctx = sky.ctx, minD = Math.min(sky.w, sky.h);
    ctx.lineWidth = 1;
    for (const c of CONSTELLATIONS) {
      const ox = c.cx * sky.w, oy = c.cy * sky.h, sc = c.s * minD;
      const P = c.pts.map(([x, y]) => [ox + x * sc, oy + y * sc]);
      const total = c.edges.length;
      for (let e = 0; e < total; e++) {
        const a = clamp(p * total - e, 0, 1);
        if (a <= 0) break;
        const [i, j] = c.edges[e];
        ctx.strokeStyle = `rgba(155,178,255,${0.3 * a * p})`;
        ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); ctx.stroke();
      }
      for (let k = 0; k < P.length; k++) {
        const a = clamp(p * P.length - k * 0.6, 0, 1);
        if (a <= 0) continue;
        ctx.beginPath();
        ctx.fillStyle = `rgba(222,230,255,${0.9 * a * p})`;
        ctx.arc(P[k][0], P[k][1], 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `rgba(150,175,255,${0.16 * a * p})`;
        ctx.arc(P[k][0], P[k][1], 6, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawMars(p) {
    if (p <= 0.003) return;
    const ctx = sky.ctx;
    const cx = sky.w * 0.74;
    const r = Math.min(sky.w, sky.h) * 0.045;
    const cy = sky.h * 0.9 - r * 0.4 - p * r * 1.6;   // rises from the horizon
    let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6);
    g.addColorStop(0, `rgba(222,120,72,${0.4 * p})`);
    g.addColorStop(1, "rgba(222,120,72,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2); ctx.fill();
    g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
    g.addColorStop(0, `rgba(228,150,100,${p})`);
    g.addColorStop(0.7, `rgba(190,92,58,${p})`);
    g.addColorStop(1, `rgba(120,50,36,${p})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  // The real sky of that night, settling into place over the ending.
  function drawRealSky(p, now) {
    if (p <= 0.003 || !sky.realStars) return;
    const ctx = sky.ctx, cx = sky.w / 2, cy = sky.h / 2;
    const scale = 1.07 - 0.07 * p;   // stars glide inward into their true positions
    for (const s of sky.realStars) {
      const sx = cx + (s.sx - cx) * scale;
      const sy = cy + (s.sy - cy) * scale;
      if (sx < -30 || sx > sky.w + 30 || sy < -30 || sy > sky.h + 30) continue;
      const tw = 0.82 + Math.sin(now * 0.0016 + s.ph) * 0.18;
      const a = clamp(s.a * p * tw, 0, 1);
      ctx.beginPath();
      ctx.fillStyle = `rgba(242,245,255,${a})`;
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.hot) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(150,175,255,${a * 0.2})`;
        ctx.arc(sx, sy, s.r * 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function startSky() {
    if (sky.running || REDUCED) return;
    sky.running = true;
    lastT = performance.now();
    sky.raf = requestAnimationFrame(() => drawSky());
  }
  function stopSky() {
    sky.running = false;
    cancelAnimationFrame(sky.raf);
  }

  function boostForSection(section) {
    if (REDUCED) return;
    if (HOT_SECTIONS.has(section)) sky.boost = Math.min(1, sky.boost + 0.5);
  }

  // Decide which scene elements the current line should summon.
  function setSceneForLine(line) {
    if (!line || REDUCED) return;
    const s = line.section || "", e = (line.en || "").toLowerCase(), tag = line.tag || "";
    const t = sky.target;
    t.constellations = CHORUS_SECTIONS.has(s) ? 1 : (s === "PRE-CHORUS" || s === "BRIDGE" ? 0.4 : 0);
    t.mars = tag === "mars" ? 1 : 0;
    let city = 0;
    if (s === "BUILD" || s === "FINAL CHORUS" || s === "CLIMAX") city = 1;
    else if (s === "VERSE 2" && /(cities|empire|realities|worlds|mars|dog|time)/.test(e)) city = 0.75;
    else if (s === "CHORUS" && /(architect|road|worlds)/.test(e)) city = 0.6;
    t.city = city;
  }

  /* ----------------------------------------------------------------------
     AUDIO ENERGY (WebAudio) — subtle, optional
     ---------------------------------------------------------------------- */
  const audioFx = { ctx: null, analyser: null, data: null, source: null, on: false };

  function initEnergy() {
    if (audioFx.on || REDUCED) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      audioFx.ctx = new AC();
      audioFx.source = audioFx.ctx.createMediaElementSource(els.audio);
      audioFx.analyser = audioFx.ctx.createAnalyser();
      audioFx.analyser.fftSize = 256;
      audioFx.analyser.smoothingTimeConstant = 0.85;
      audioFx.data = new Uint8Array(audioFx.analyser.frequencyBinCount);
      audioFx.source.connect(audioFx.analyser);
      audioFx.analyser.connect(audioFx.ctx.destination);
      audioFx.on = true;
    } catch (e) {
      console.warn("WebAudio unavailable, using state-based energy:", e);
    }
  }

  function sampleEnergy() {
    // target energy: from analyser if available, else from play state
    if (audioFx.on && !els.audio.paused) {
      audioFx.analyser.getByteFrequencyData(audioFx.data);
      let sum = 0;
      // weight low-mids (the body of the track)
      const n = Math.min(64, audioFx.data.length);
      for (let i = 0; i < n; i++) sum += audioFx.data[i];
      state.targetEnergy = clamp((sum / n) / 175, 0, 1);
    } else {
      state.targetEnergy = els.audio.paused ? 0.0 : 0.4;
    }
    // smooth
    state.energy += (state.targetEnergy - state.energy) * 0.08;
    els.body.style.setProperty("--energy", state.energy.toFixed(3));
  }

  function energyLoop() {
    sampleEnergy();
    requestAnimationFrame(energyLoop);
  }

  /* ----------------------------------------------------------------------
     AUDIO EVENTS
     ---------------------------------------------------------------------- */
  function wireAudio() {
    const a = els.audio;

    a.addEventListener("loadedmetadata", () => {
      state.duration = a.duration;
      els.timeDuration.textContent = fmt(a.duration);
      els.seek.setAttribute("aria-valuemax", "100");
    });

    a.addEventListener("timeupdate", () => {
      const dur = state.duration || a.duration || 0;
      const t = a.currentTime;
      const ratio = dur ? t / dur : 0;
      updateSeekVisual(ratio);
      updateCineProgress(ratio, t);
      els.timeCurrent.textContent = fmt(t);
      els.seek.setAttribute("aria-valuenow", Math.round(ratio * 100));
      els.seek.setAttribute("aria-valuetext", `${fmt(t)} of ${fmt(dur)}`);
      const idx = indexForTime(t);
      if (idx !== state.active) setActive(idx);
    });

    a.addEventListener("progress", () => {
      try {
        if (a.buffered.length && state.duration) {
          const end = a.buffered.end(a.buffered.length - 1);
          els.seekBuffered.style.width = (end / state.duration * 100).toFixed(2) + "%";
        }
      } catch {}
    });

    a.addEventListener("play", () => {
      els.body.dataset.state = "playing";
      els.btnPlay.setAttribute("aria-pressed", "true");
      els.btnPlay.setAttribute("aria-label", "Pause");
      if (audioFx.ctx && audioFx.ctx.state === "suspended") audioFx.ctx.resume();
      startSky();
    });

    a.addEventListener("pause", () => {
      if (els.body.dataset.state !== "ending") els.body.dataset.state = "paused";
      els.btnPlay.setAttribute("aria-pressed", "false");
      els.btnPlay.setAttribute("aria-label", "Play");
    });

    a.addEventListener("volumechange", reflectVolume);

    a.addEventListener("ended", showEnding);
  }

  /* ----------------------------------------------------------------------
     INTRO / ENDING
     ---------------------------------------------------------------------- */
  function beginExperience() {
    initEnergy();
    if (audioFx.ctx && audioFx.ctx.state === "suspended") audioFx.ctx.resume();
    els.intro.classList.add("is-hidden");
    els.stage.setAttribute("aria-hidden", "false");
    els.ending.classList.remove("is-shown");
    els.ending.setAttribute("aria-hidden", "true");
    requestAnimationFrame(() => els.stage.classList.add("is-live"));
    play();
  }

  function showEnding() {
    els.body.dataset.state = "ending";
    els.ending.classList.add("is-shown");
    els.ending.setAttribute("aria-hidden", "false");
    // leave lyrics where they froze for a beat; gently release energy
    state.targetEnergy = 0;
    // the universe settles into the real sky of that night
    sky.target.finale = 1;
    sky.target.constellations = 0;
    sky.target.city = 0;
    sky.target.mars = 0;
  }

  function playAgain() {
    els.ending.classList.remove("is-shown");
    els.ending.setAttribute("aria-hidden", "true");
    els.body.dataset.state = "playing";
    els.audio.currentTime = 0;
    sky.target.finale = 0;
    setActive(-1);
    play();
  }

  /* ----------------------------------------------------------------------
     LANGUAGE TOGGLE
     ---------------------------------------------------------------------- */
  function setLang(lang) {
    els.body.dataset.lang = lang;
    $$(".lang-btn").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    // keep the active line centred after layout shift
    const node = els.lyricsList.children[state.active];
    if (node) requestAnimationFrame(() => centerLine(node));
  }

  /* ----------------------------------------------------------------------
     MANUAL SCROLL DETECTION (pause auto-centre briefly)
     ---------------------------------------------------------------------- */
  function wireManualScroll() {
    const onUser = () => {
      state.userScrolling = true;
      clearTimeout(state.userScrollTimer);
      state.userScrollTimer = setTimeout(() => { state.userScrolling = false; }, 2600);
    };
    els.lyricsScroll.addEventListener("wheel", onUser, { passive: true });
    els.lyricsScroll.addEventListener("touchmove", onUser, { passive: true });
  }

  /* ----------------------------------------------------------------------
     EASTER EGG — click the giant wordmark
     ---------------------------------------------------------------------- */
  function wireEasterEgg() {
    let count = 0, timer = 0;
    const trigger = () => {
      count++;
      clearTimeout(timer);
      timer = setTimeout(() => (count = 0), 1600);
      if (count === 3) toast("Choose your world");
      if (count >= 5) {
        count = 0;
        toast("Whole new worlds ✦");
        starburst();
      }
    };
    els.wordmark.style.pointerEvents = "auto";
    els.wordmark.addEventListener("click", trigger);
  }

  function starburst() {
    if (REDUCED) return;
    const cx = sky.w / 2, cy = sky.h * 0.36;
    for (const s of sky.stars) {
      const ang = Math.atan2(s.y - cy, s.x - cx);
      s.x += Math.cos(ang) * 30 * s.z;
      s.y += Math.sin(ang) * 30 * s.z;
    }
    sky.boost = 1;
  }

  /* ----------------------------------------------------------------------
     GLOBAL KEYBOARD
     ---------------------------------------------------------------------- */
  function wireKeys() {
    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      // let the seek slider handle its own arrows
      if (e.target === els.seek && ["ArrowLeft", "ArrowRight"].includes(e.key)) return;

      switch (e.key) {
        case " ":
        case "k":
          if (els.intro.classList.contains("is-hidden")) { togglePlay(); e.preventDefault(); }
          else { beginExperience(); e.preventDefault(); }
          break;
        case "ArrowRight": nudge(5); break;
        case "ArrowLeft": nudge(-5); break;
        case "ArrowUp":
          els.audio.volume = clamp(els.audio.volume + 0.05, 0, 1);
          els.volume.value = els.audio.volume; e.preventDefault(); break;
        case "ArrowDown":
          els.audio.volume = clamp(els.audio.volume - 0.05, 0, 1);
          els.volume.value = els.audio.volume; e.preventDefault(); break;
        case "m": toggleMute(); break;
        case "c": case "C": toggleCinema(); e.preventDefault(); break;
        case "Escape":
          if (els.body.dataset.cinema === "true") { toggleCinema(false); e.preventDefault(); }
          break;
        case "l": {
          const order = ["both", "en", "es"];
          const next = order[(order.indexOf(els.body.dataset.lang) + 1) % order.length];
          setLang(next); break;
        }
        default: break;
      }
    });
  }

  /* ----------------------------------------------------------------------
     WIRE CONTROLS
     ---------------------------------------------------------------------- */
  function wireControls() {
    els.introPlay.addEventListener("click", beginExperience);
    els.btnAgain.addEventListener("click", playAgain);

    els.btnPlay.addEventListener("click", togglePlay);
    els.btnRestart.addEventListener("click", restart);
    els.btnBack.addEventListener("click", () => nudge(-10));
    els.btnFwd.addEventListener("click", () => nudge(10));
    els.btnVol.addEventListener("click", toggleMute);
    els.btnShare.addEventListener("click", share);

    els.volume.addEventListener("input", () => {
      els.audio.muted = false;
      els.audio.volume = parseFloat(els.volume.value);
      state.lastVolume = els.audio.volume;
    });

    $$(".lang-btn").forEach((b) =>
      b.addEventListener("click", () => setLang(b.dataset.lang)));

    els.btnCinema.addEventListener("click", () => toggleCinema());
    els.cineExit.addEventListener("click", () => toggleCinema(false));
    els.cinePlay.addEventListener("click", togglePlay);
    els.cineSeek.addEventListener("pointerdown", (e) => {
      const r = els.cineSeek.getBoundingClientRect();
      const ratio = clamp((e.clientX - r.left) / r.width, 0, 1);
      els.audio.currentTime = ratio * (state.duration || els.audio.duration || 0);
    });
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && els.body.dataset.cinema === "true") toggleCinema(false);
    });
    document.addEventListener("webkitfullscreenchange", () => {
      if (!document.webkitFullscreenElement && els.body.dataset.cinema === "true") toggleCinema(false);
    });

    wireSeek();
    wireManualScroll();
    wireEasterEgg();
    wireKeys();
  }

  /* ----------------------------------------------------------------------
     UTIL
     ---------------------------------------------------------------------- */
  function debounce(fn, ms) {
    let t = 0;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  /* ----------------------------------------------------------------------
     BOOT
     ---------------------------------------------------------------------- */
  async function boot() {
    if (state.booted) return;
    state.booted = true;
    els.audio.volume = parseFloat(els.volume.value) || 0.85;
    state.lastVolume = els.audio.volume;
    reflectVolume();
    wireAudio();
    wireControls();
    await loadLyrics();
    try { initSky(); } catch (e) { console.warn("starfield disabled:", e); }
    loadRealSky();
    if (!REDUCED) requestAnimationFrame(energyLoop);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
