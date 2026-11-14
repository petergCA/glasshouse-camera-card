/*!
 * Glasshouse Camera Card v1.2.0
 * A security-camera wall: live-refreshing snapshots, detection badges and an in-card live view.
 * Part of the Glasshouse card suite. MIT License (c) 2026 Peter Gray.
 */
(() => {
  'use strict';

  const VERSION = '1.2.0';
  const TAG = 'glasshouse-camera-card';

  const HOLD_MS = 500;
  const MOVE_TOLERANCE = 10;
  const LOAD_TIMEOUT = 20000;   // a request older than this no longer blocks the next one
  const FAIL_LIMIT = 2;         // consecutive failures (with a frame on screen) before "Offline"
  const SWAP_MS = 460;          // crossfade length
  const LIVE_SNAPSHOT_MS = 2000; // snapshot cadence in the live view when ha-camera-stream is missing
  const DEFAULT_REFRESH = 10;
  const TAP_ACTIONS = new Set(['live', 'more-info', 'none']);

  const DETECTORS = [
    { key: 'person', label: 'Person', icon: 'mdi:account', rank: 3 },
    { key: 'vehicle', label: 'Vehicle', icon: 'mdi:car', rank: 2 },
    { key: 'motion', label: 'Motion', icon: 'mdi:motion-sensor', rank: 1 },
  ];

  const STYLE = `
    :host {
      --gh-font: var(--glasshouse-font, -apple-system, "SF Pro Text", Inter, Roboto, system-ui, sans-serif);
      --gh-surface: var(--glasshouse-surface, rgba(255,255,255,0.045));
      --gh-surface-2: var(--glasshouse-surface-2, rgba(255,255,255,0.075));
      --gh-border: var(--glasshouse-border, rgba(255,255,255,0.09));
      --gh-blur: var(--glasshouse-blur, 18px);
      --gh-radius: var(--glasshouse-radius, 22px);
      --gh-radius-sm: var(--glasshouse-radius-sm, 14px);
      --gh-pad: var(--glasshouse-pad, 16px);
      --gh-gap: var(--glasshouse-gap, 10px);
      --gh-text: var(--glasshouse-text, #e9eef6);
      --gh-text-2: var(--glasshouse-text-2, #93a0b5);
      --gh-text-3: var(--glasshouse-text-3, #5d697d);
      --gh-ok: var(--glasshouse-ok, #3fb950);
      --gh-warn: var(--glasshouse-warn, #e3b341);
      --gh-alert: var(--glasshouse-alert, #ff5c5c);
      --gh-info: var(--glasshouse-info, #58a6ff);
      --gh-light: var(--glasshouse-light, #ffb547);
      --gh-fan: var(--glasshouse-fan, #4dd6e8);
      --gh-cover: var(--glasshouse-cover, #a3a8ff);
      --gh-switch: var(--glasshouse-switch, #7ee08a);
      --gh-heat: var(--glasshouse-heat, #ff7a59);
      --gh-cool: var(--glasshouse-cool, #58a6ff);
      --gh-media: var(--glasshouse-media, #c48cff);
      --gh-lock: var(--glasshouse-lock, #3fb950);
      --gh-security: var(--glasshouse-security, #ff5c5c);
      --gh-energy: var(--glasshouse-energy, #f6d365);
      --gh-water: var(--glasshouse-water, #4aa8ff);
      --gh-neutral: var(--glasshouse-neutral, #93a0b5);
      --gh-accent: var(--gh-info);
      --gh-ease: 160ms ease;
      --gh-glass: rgba(8, 11, 18, 0.58);
      display: block;
    }
    * { box-sizing: border-box; }
    ha-card {
      display: block;
      position: relative;
      container: gh-cam / inline-size;
      background: var(--gh-surface);
      border: 1px solid var(--gh-border);
      border-radius: var(--gh-radius);
      -webkit-backdrop-filter: blur(var(--gh-blur)) saturate(140%);
      backdrop-filter: blur(var(--gh-blur)) saturate(140%);
      padding: var(--gh-pad);
      color: var(--gh-text);
      font-family: var(--gh-font);
      font-size: 13px;
      font-weight: 500;
      line-height: 1.3;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }
    button {
      font: inherit; color: inherit; background: none; border: 0; margin: 0; padding: 0;
      cursor: pointer; -webkit-tap-highlight-color: transparent;
    }
    button:focus { outline: none; }
    button:focus-visible { outline: 2px solid var(--gh-accent); outline-offset: 2px; }
    ha-icon { display: inline-flex; --mdc-icon-size: 22px; }
    [hidden] { display: none !important; }

    /* ---------- header ---------- */
    .head { display: flex; align-items: center; gap: 12px; min-height: 44px; margin-bottom: 14px; }
    .head-ic {
      flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%;
      display: grid; place-items: center;
      background: var(--gh-surface-2); color: var(--gh-text-2);
      transition: background var(--gh-ease), color var(--gh-ease), box-shadow var(--gh-ease);
    }
    .head-ic.on {
      background: color-mix(in srgb, var(--gh-security) 16%, transparent);
      color: var(--gh-security);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-security) 45%, transparent), 0 0 18px -6px var(--gh-security);
    }
    .titles { flex: 1 1 auto; min-width: 0; }
    .title {
      font-size: 16px; font-weight: 650; letter-spacing: -0.005em; line-height: 1.25;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .summary {
      margin-top: 2px; color: var(--gh-text-2); font-variant-numeric: tabular-nums;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .summary .n { color: var(--gh-text); font-weight: 600; }
    .summary .bad { color: var(--gh-alert); font-weight: 600; }
    .status {
      flex: 0 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: 8px;
      height: 32px; padding: 0 12px 0 11px; border-radius: 999px;
      background: var(--gh-surface-2); color: var(--gh-text-2);
      font-size: 13px; font-weight: 600; white-space: nowrap;
      transition: background var(--gh-ease), color var(--gh-ease), box-shadow var(--gh-ease);
    }
    .status span { overflow: hidden; text-overflow: ellipsis; }
    .status .sd { flex: 0 0 auto; position: relative; width: 8px; height: 8px; border-radius: 50%; background: var(--gh-ok); }
    .status.person, .status.vehicle, .status.motion { --c: var(--gh-warn); color: var(--c);
      background: color-mix(in srgb, var(--c) 14%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent); }
    .status.vehicle { --c: var(--gh-info); }
    .status.person { --c: var(--gh-alert); }
    .status.person .sd, .status.vehicle .sd, .status.motion .sd { background: var(--c); }
    .status.person .sd::after { content: ""; position: absolute; inset: 0; border-radius: 50%;
      background: var(--c); animation: gh-ping 1.6s cubic-bezier(0, 0, .2, 1) infinite; }
    @container gh-cam (max-width: 380px) { .status span { display: none; } .status { padding: 0 12px; } }

    /* ---------- grid ---------- */
    .grid {
      display: grid; gap: var(--gh-gap);
      grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr));
    }
    @container gh-cam (min-width: 520px) { .grid.auto { --cols: 2; } }
    @container gh-cam (min-width: 900px) { .grid.auto { --cols: 3; } .grid.auto.by4 { --cols: 4; } }

    /* ---------- tile ---------- */
    .tile {
      position: relative; display: block; width: 100%;
      aspect-ratio: var(--arw, 16) / var(--arh, 9);
      border-radius: var(--gh-radius-sm); overflow: hidden; isolation: isolate;
      background: #0a0e16; text-align: left;
      container: gh-tile / inline-size;
      user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
      touch-action: manipulation;
      transition: box-shadow 240ms ease, transform 120ms ease;
    }
    .tile.static { cursor: default; }
    .tile:not(.static):active { transform: scale(0.99); }
    .tile::after {
      content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 6;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.07);
      transition: box-shadow 240ms ease;
    }
    .tile.motion::after, .tile.vehicle::after { box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--det) 60%, transparent); }
    .tile.motion { --det: var(--gh-warn); }
    .tile.vehicle { --det: var(--gh-info); }
    .tile.person { --det: var(--gh-alert); animation: gh-alert 2.4s ease-in-out infinite; }
    .tile.person::after { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--gh-alert) 80%, transparent); }
    @keyframes gh-alert {
      0%, 100% { box-shadow: 0 0 0 0 transparent, 0 0 16px -8px var(--gh-alert); }
      50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--gh-alert) 22%, transparent), 0 0 26px -6px var(--gh-alert); }
    }

    .media { position: absolute; inset: 0; z-index: 0; }
    .frame {
      position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
      object-position: var(--gh-cam-pos, 50% 50%);
      opacity: 0; z-index: 1; transition: opacity ${SWAP_MS}ms ease, filter 300ms ease, transform 700ms cubic-bezier(.2,.8,.2,1);
    }
    .frame.show { opacity: 1; }
    .frame.front { z-index: 2; }
    .frame.instant { transition: none; }
    .tile:not(.static):hover .frame { transform: scale(1.025); }

    .skel {
      position: absolute; inset: 0; z-index: 1; display: none; place-items: center;
      color: rgba(255,255,255,0.08);
      background:
        linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.055) 50%, transparent 70%) 0 0 / 250% 100%,
        radial-gradient(120% 90% at 50% 0%, #121a29 0%, #0b0f18 70%);
      animation: gh-shimmer 1.8s linear infinite;
    }
    .skel ha-icon { --mdc-icon-size: 34px; }
    .tile.loading .skel { display: grid; }
    @keyframes gh-shimmer { from { background-position: 150% 0, 0 0; } to { background-position: -100% 0, 0 0; } }

    .shade-top {
      position: absolute; inset: 0 0 auto 0; height: 46%; z-index: 3; pointer-events: none;
      background: linear-gradient(to bottom, rgba(4,7,12,0.42), transparent);
      opacity: 0; transition: opacity 300ms ease;
    }
    .tile.has-frame .shade-top { opacity: 1; }

    .top {
      position: absolute; top: 10px; left: 10px; right: 10px; z-index: 4;
      display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; pointer-events: none;
    }
    .badges { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }

    .pill-live {
      display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px 0 7px;
      border-radius: 6px; font-size: 10px; font-weight: 750; letter-spacing: .1em; line-height: 1;
      color: #fff; background: var(--gh-alert);
      box-shadow: 0 2px 12px -3px color-mix(in srgb, var(--gh-alert) 80%, transparent);
    }
    .pill-live i { width: 6px; height: 6px; border-radius: 50%; background: #fff; animation: gh-blink 1.6s ease-in-out infinite; }
    .pill-live.rec { background: var(--gh-glass); color: var(--gh-text);
      -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12); }
    .pill-live.rec i { background: var(--gh-alert); }
    .pill-live.still { background: var(--gh-glass); color: var(--gh-text); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12); }
    .pill-live.still i { background: var(--gh-text-2); animation: none; }
    @keyframes gh-blink { 50% { opacity: .25; } }

    .badge {
      --c: var(--gh-warn);
      display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px 0 7px;
      border-radius: 999px; font-size: 11px; font-weight: 650; line-height: 1; color: var(--gh-text);
      background: color-mix(in srgb, var(--c) 16%, var(--gh-glass));
      -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent);
      animation: gh-in 220ms ease-out;
    }
    .badge.vehicle { --c: var(--gh-info); }
    .badge.person { --c: var(--gh-alert); }
    .badge ha-icon { --mdc-icon-size: 14px; color: var(--c); }
    .badge .dot { position: relative; width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: 0 0 auto; }
    .badge.motion .dot { animation: gh-breathe 2.4s ease-in-out infinite; }
    .badge.person .dot::after {
      content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--c);
      animation: gh-ping 1.6s cubic-bezier(0, 0, .2, 1) infinite;
    }
    .badge .bl { display: none; }
    @container gh-tile (min-width: 300px) { .badge .bl { display: inline; } }
    @keyframes gh-ping { 0% { transform: scale(1); opacity: .75; } 80%, 100% { transform: scale(2.8); opacity: 0; } }
    @keyframes gh-breathe { 50% { opacity: .45; } }
    @keyframes gh-in { from { opacity: 0; transform: translateY(-3px); } }

    .bottom {
      position: absolute; left: 0; right: 0; bottom: 0; z-index: 4; pointer-events: none;
      display: flex; align-items: flex-end; gap: 8px; padding: 34px 12px 10px;
      background: linear-gradient(to top, rgba(4,7,12,0.88) 0%, rgba(4,7,12,0.55) 42%, transparent 100%);
    }
    .name {
      flex: 1 1 auto; min-width: 0; font-size: 13px; font-weight: 650; color: #fff; letter-spacing: -0.005em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }
    @container gh-tile (min-width: 380px) { .name { font-size: 16px; } .bottom { padding: 40px 14px 12px; } }
    .ago {
      flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding-bottom: 1px;
      font-size: 11px; font-weight: 600; color: rgba(233,238,246,0.74); font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .ago .w { display: none; }
    @container gh-tile (min-width: 300px) { .ago .w { display: inline; } }
    .beat { width: 6px; height: 6px; border-radius: 50%; background: var(--gh-ok);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--gh-ok) 60%, transparent); }
    .beat.stale { background: var(--gh-warn); }
    .beat.pulse { animation: gh-beat 900ms ease-out; }
    @keyframes gh-beat { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--gh-ok) 70%, transparent); }
      100% { box-shadow: 0 0 0 7px transparent; } }

    .off {
      position: absolute; inset: 0; z-index: 2; display: none;
      flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding-bottom: 18px;
      background: radial-gradient(120% 100% at 50% 0%, #121826 0%, #0a0d15 75%);
      text-align: center;
    }
    .tile.offline .off { display: flex; }
    .tile.offline.has-frame .off { background: rgba(7,10,16,0.58); }
    .tile.offline .frame { filter: blur(14px) saturate(0.35) brightness(0.6); transform: scale(1.12); }
    .tile.offline .badges, .tile.offline .pill-live, .tile.offline .ago, .tile.offline .shade-top { display: none; }
    .off-ic {
      width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; margin-bottom: 6px;
      background: var(--gh-surface-2); color: var(--gh-text-2);
      box-shadow: inset 0 0 0 1px var(--gh-border);
    }
    .off-ic ha-icon { --mdc-icon-size: 20px; }
    .off-t { font-size: 13px; font-weight: 650; color: var(--gh-text); }
    .off-s { font-size: 11px; font-weight: 600; color: var(--gh-text-2); font-variant-numeric: tabular-nums; }

    /* ---------- live view ---------- */
    dialog.lv {
      padding: 0; border: 0; margin: auto; background: transparent; color: var(--gh-text);
      width: min(1180px, calc(100vw - 32px)); max-width: none; max-height: none; overflow: visible;
      font-family: var(--gh-font); font-size: 13px; font-weight: 500; line-height: 1.3;
      -webkit-font-smoothing: antialiased;
    }
    dialog.lv:not([open]) { display: none; }
    dialog.lv.fallback[open] { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center;
      width: auto; background: rgba(3,5,10,0.74); }
    dialog.lv::backdrop {
      background: rgba(3,5,10,0.74);
      -webkit-backdrop-filter: blur(14px) saturate(120%); backdrop-filter: blur(14px) saturate(120%);
    }
    .sheet {
      width: 100%; max-width: min(1180px, calc(100vw - 32px));
      background: rgba(17,22,33,0.86);
      border: 1px solid var(--gh-border); border-radius: var(--gh-radius);
      -webkit-backdrop-filter: blur(var(--gh-blur)) saturate(140%); backdrop-filter: blur(var(--gh-blur)) saturate(140%);
      box-shadow: 0 40px 90px -24px rgba(0,0,0,0.75);
      padding: 12px;
      animation: gh-pop 240ms cubic-bezier(.2,.8,.2,1);
      container: gh-sheet / inline-size;
    }
    @keyframes gh-pop { from { opacity: 0; transform: translateY(8px) scale(.975); } }
    .sheet:focus { outline: none; }
    .sh-head { display: flex; align-items: center; gap: 8px; padding: 2px 2px 12px 8px; min-height: 56px; }
    .sh-titles { flex: 1 1 auto; min-width: 0; }
    .sh-title { font-size: 16px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sh-sub { margin-top: 2px; color: var(--gh-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stage .top { top: 12px; left: 12px; right: 12px; z-index: 5; }
    .sh-badges .bl { display: inline; }
    @container gh-sheet (max-width: 420px) { .sh-badges .bl { display: none; } }
    .round {
      flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
      background: var(--gh-surface-2); color: var(--gh-text);
      transition: background var(--gh-ease), transform var(--gh-ease);
    }
    .round ha-icon { --mdc-icon-size: 20px; }
    .round:hover { background: rgba(255,255,255,0.12); }
    .round:active { transform: scale(0.94); }
    .stage {
      position: relative; margin: 0 auto; overflow: hidden; background: #000;
      border-radius: var(--gh-radius-sm);
      width: min(100%, calc((100vh - 120px) * var(--arw, 16) / var(--arh, 9)));
      aspect-ratio: var(--arw, 16) / var(--arh, 9);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
    }
    .stage ha-camera-stream, .stage .snap { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .stage ha-camera-stream { --video-max-height: 100%; }
    .stage .frame { object-fit: contain; object-position: 50% 50%; }
    .tile.pannable { cursor: grab; touch-action: pan-y; }
    .tile.panning { cursor: grabbing; }
    .tile.panning .frame { transition: opacity ${SWAP_MS}ms ease; }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; }
    }
  `;

  /* ---------------------------------------------------------------- helpers */

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children) for (const c of [].concat(children)) if (c) el.append(c);
    return el;
  }

  function icon(name) {
    const el = document.createElement('ha-icon');
    el.setAttribute('icon', name);
    el.icon = name;
    return el;
  }

  const isEntityId = (v) => typeof v === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/i.test(v);

  /** Parse "16:9", "16/9", "4x3", "1.777", 1.5 or "56.25%" into { w, h }. */
  function parseAspect(v) {
    if (v === undefined || v === null || v === '') return { w: 16, h: 9 };
    if (typeof v === 'number' && v > 0) return { w: v, h: 1 };
    const s = String(v).trim();
    let m = s.match(/^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i);
    if (m && Number(m[1]) > 0 && Number(m[2]) > 0) return { w: Number(m[1]), h: Number(m[2]) };
    m = s.match(/^(\d+(?:\.\d+)?)%$/);
    if (m && Number(m[1]) > 0) return { w: 100, h: Number(m[1]) };
    if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 0) return { w: Number(s), h: 1 };
    return null;
  }

  /**
   * Snapshot URL for a camera state. Relative proxy paths are prefixed with hass.hassUrl() when
   * available, and a cache-busting `t` parameter is appended (not for data:/blob: URLs).
   */
  function buildUrl(stateObj, hass, t) {
    const pic = stateObj && stateObj.attributes && stateObj.attributes.entity_picture;
    if (!pic || typeof pic !== 'string') return null;
    if (/^(data|blob):/i.test(pic)) return pic;
    let url = pic;
    if (pic.startsWith('/') && hass && typeof hass.hassUrl === 'function') {
      try { url = hass.hassUrl(pic) || pic; } catch (e) { url = pic; }
    }
    if (t === undefined || t === null || t === false) return url;
    const hashAt = url.indexOf('#');
    const hash = hashAt >= 0 ? url.slice(hashAt) : '';
    const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
    const clean = base.replace(/([?&])t=[^&]*(&|$)/, (all, pre, post) => (post ? pre : '')).replace(/[?&]$/, '');
    return `${clean}${clean.includes('?') ? '&' : '?'}t=${encodeURIComponent(t)}${hash}`;
  }

  function fmtAgo(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 2) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const hr = Math.floor(m / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  function fmtLastSeen(ts, now) {
    if (!ts) return null;
    const age = now - ts;
    if (age < 60 * 60 * 1000) return `Last seen ${fmtAgo(age)}`;
    const d = new Date(ts);
    const today = new Date(now);
    const sameDay = d.toDateString() === today.toDateString();
    try {
      return sameDay
        ? `Last seen ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    } catch (e) {
      return `Last seen ${fmtAgo(age)}`;
    }
  }

  /** "right", "left top", "70%", "70% 40%" or a number (x %) → {x, y} in percent; null when unset/invalid. */
  function parsePos(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? { x: Math.min(100, Math.max(0, v)), y: 50 } : null;
    const words = { left: ['x', 0], right: ['x', 100], top: ['y', 0], bottom: ['y', 100], center: [null, 50], centre: [null, 50] };
    const out = { x: 50, y: 50 };
    const parts = String(v).trim().toLowerCase().split(/\s+/);
    let axis = 0;
    for (const p of parts) {
      if (words[p]) { const [k, n] = words[p]; if (k) out[k] = n; axis++; continue; }
      const m = /^(-?\d+(?:\.\d+)?)%?$/.exec(p);
      if (!m) return null;
      out[axis === 0 ? 'x' : 'y'] = Math.min(100, Math.max(0, Number(m[1])));
      axis++;
    }
    return out;
  }
  const POS_KEY = (id) => `glasshouse-camera-card:pos:${id}`;
  function loadPos(id) {
    try { const v = JSON.parse(localStorage.getItem(POS_KEY(id)) || 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null; } catch (e) { return null; }
  }
  function savePos(id, pos) {
    try { if (pos) localStorage.setItem(POS_KEY(id), JSON.stringify(pos)); else localStorage.removeItem(POS_KEY(id)); } catch (e) { /* private mode */ }
  }

  function tsOf(iso) {
    const t = Date.parse(iso || '');
    return Number.isFinite(t) ? t : 0;
  }

  /** Two stacked <img> that crossfade: the new frame loads hidden and fades in over the old one. */
  class Fader {
    constructor(parent, cls) {
      this.imgs = [0, 1].map(() => h('img', { class: `frame ${cls || ''}`, alt: '', draggable: 'false', decoding: 'async' }));
      parent.append(...this.imgs);
      this.front = -1;
      this.seq = 0;
      this.pending = 0;
      this._hide = null;
    }
    get current() { return this.front >= 0 ? this.imgs[this.front] : null; }
    load(url, onOk, onErr) {
      const seq = ++this.seq;
      const back = this.imgs[this.front === 0 ? 1 : 0];
      this.pending = Date.now();
      back.onload = () => {
        if (seq !== this.seq) return;
        const show = () => { if (seq === this.seq) { this.pending = 0; this._swap(back); onOk && onOk(); } };
        // decode off the main thread before the fade, but never wait on it for long
        if (typeof back.decode === 'function') {
          Promise.race([back.decode(), new Promise((r) => setTimeout(r, 120))]).then(show, show);
        } else show();
      };
      back.onerror = () => {
        if (seq !== this.seq) return;
        this.pending = 0;
        onErr && onErr();
      };
      back.src = url;
    }
    _swap(next) {
      const prev = this.current;
      clearTimeout(this._hide);
      next.classList.remove('instant');
      next.classList.add('front', 'show');
      if (prev && prev !== next) {
        prev.classList.remove('front');
        this._hide = setTimeout(() => {
          prev.classList.add('instant');
          prev.classList.remove('show');
        }, SWAP_MS + 40);
      }
      this.front = this.imgs.indexOf(next);
    }
    cancel() { this.seq += 1; this.pending = 0; clearTimeout(this._hide); }
  }

  /* ------------------------------------------------------------------ card */

  class GlasshouseCameraCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._tiles = [];
      this._seen = new Map();
      this._built = false;
      this._inView = typeof IntersectionObserver !== 'function';
      this._running = false;
      this._timer = null;
      this._ticker = null;
      this._live = null;
      this._onVis = () => this._setActive();
    }

    static get version() { return VERSION; }
    static buildUrl(stateObj, hass, t) { return buildUrl(stateObj, hass, t); }
    static parseAspect(v) { return parseAspect(v); }
    static fmtAgo(ms) { return fmtAgo(ms); }

    static getStubConfig(hass) {
      const ids = Object.keys((hass && hass.states) || {}).filter((id) => id.startsWith('camera.')).slice(0, 3);
      return { title: 'Cameras', cameras: ids.length ? ids.map((entity) => ({ entity })) : [{ entity: 'camera.example' }] };
    }

    setConfig(config) {
      if (!config || typeof config !== 'object') throw new Error(`${TAG}: invalid configuration`);
      if (!Array.isArray(config.cameras) || !config.cameras.length) {
        throw new Error(`${TAG}: "cameras" must be a non-empty list`);
      }
      const defTap = config.tap_action === undefined ? 'live' : this._tapOf(config.tap_action, 'tap_action');
      const cameras = config.cameras.map((c, i) => {
        const o = typeof c === 'string' ? { entity: c } : { ...c };
        if (!isEntityId(o.entity)) throw new Error(`${TAG}: cameras[${i}] needs a valid "entity" id`);
        for (const d of DETECTORS) {
          if (o[d.key] !== undefined && !isEntityId(o[d.key])) {
            throw new Error(`${TAG}: cameras[${i}].${d.key} must be an entity id`);
          }
        }
        o.tap_action = o.tap_action === undefined ? defTap : this._tapOf(o.tap_action, `cameras[${i}].tap_action`);
        if (o.position !== undefined && !parsePos(o.position)) throw new Error(`${TAG}: cameras[${i}].position must be left/center/right/top/bottom or "x% y%"`);
        o.pos = parsePos(o.position) || { x: 50, y: 50 };
        o.pan = o.pan === undefined ? (config.pan !== false) : o.pan !== false;
        return o;
      });
      const columns = config.columns === undefined || config.columns === 'auto' ? 'auto' : Number(config.columns);
      if (columns !== 'auto' && !(Number.isInteger(columns) && columns >= 1 && columns <= 6)) {
        throw new Error(`${TAG}: "columns" must be a whole number from 1 to 6, or "auto"`);
      }
      const aspect = parseAspect(config.aspect_ratio);
      if (!aspect) throw new Error(`${TAG}: "aspect_ratio" must look like "16:9", "4:3" or "1:1"`);
      let refresh = config.refresh === undefined ? DEFAULT_REFRESH : Number(config.refresh);
      if (!Number.isFinite(refresh) || refresh < 0) throw new Error(`${TAG}: "refresh" must be a number of seconds (0 or more)`);
      if (refresh > 0 && refresh < 1) refresh = 1;
      if (config.title !== undefined && typeof config.title !== 'string') throw new Error(`${TAG}: "title" must be text`);

      this._config = { ...config, cameras, columns, aspect, refresh };
      this._watch = [];
      for (const c of cameras) {
        this._watch.push(c.entity);
        for (const d of DETECTORS) if (c[d.key]) this._watch.push(c[d.key]);
      }
      this._teardownTiles();
      this._built = false;
      this._seen.clear();
      if (this._hass) this.hass = this._hass;
    }

    _tapOf(v, where) {
      const a = typeof v === 'object' && v ? v.action : v;
      if (!TAP_ACTIONS.has(a)) throw new Error(`${TAG}: ${where} must be live, more-info or none`);
      return a;
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._config || !hass) return;
      if (!this._built) this._build();
      const changed = new Set();
      for (const id of this._watch) {
        const st = hass.states[id];
        if (!this._seen.has(id) || st !== this._seen.get(id)) {
          changed.add(id);
          this._seen.set(id, st);
        }
      }
      if (changed.size) {
        for (const t of this._tiles) {
          const camChanged = changed.has(t.cam.entity);
          const detChanged = DETECTORS.some((d) => t.cam[d.key] && changed.has(t.cam[d.key]));
          if (camChanged) this._cameraChanged(t);
          if (camChanged || detChanged) this._renderTile(t);
        }
        this._renderHeader();
        if (this._live) this._renderLive();
      }
      this._setActive();
    }

    get hass() { return this._hass; }

    getCardSize() {
      const n = this._config ? this._config.cameras.length : 3;
      const cols = this._config && this._config.columns !== 'auto' ? this._config.columns : 2;
      return (this._config && this._config.title ? 1 : 0) + Math.ceil(n / cols) * 3;
    }

    getGridOptions() {
      return { columns: 'full', rows: 'auto' };
    }

    connectedCallback() {
      if (typeof IntersectionObserver === 'function' && !this._io) {
        this._io = new IntersectionObserver((entries) => {
          const e = entries[entries.length - 1];
          this._inView = !!(e && e.isIntersecting);
          this._setActive();
        }, { rootMargin: '120px 0px' });
        this._io.observe(this);
      }
      document.addEventListener('visibilitychange', this._onVis);
      this._setActive();
    }

    disconnectedCallback() {
      if (this._io) { this._io.disconnect(); this._io = null; this._inView = typeof IntersectionObserver !== 'function'; }
      document.removeEventListener('visibilitychange', this._onVis);
      this._closeLive();
      this._setActive();
    }

    /* ---------------------------------------------------- refresh engine */

    _isActive() {
      return !!(this.isConnected && this._hass && this._built && this._inView &&
        document.visibilityState !== 'hidden' && !this._live);
    }

    _setActive() {
      const active = this._isActive();
      if (active === this._running) {
        if (active) this._loadDirty();
        return;
      }
      this._running = active;
      if (active) {
        this._cycle();
        this._ticker = setInterval(() => this._tickAgo(), 1000);
        this._tickAgo();
      } else {
        clearTimeout(this._timer); this._timer = null;
        clearInterval(this._ticker); this._ticker = null;
      }
    }

    get _refreshMs() { return this._config.refresh * 1000; }

    /** Load every tile that is due, then schedule the next pass. */
    _cycle() {
      clearTimeout(this._timer); this._timer = null;
      if (!this._running) return;
      const now = Date.now();
      const every = this._refreshMs;
      for (const t of this._tiles) {
        const due = t.dirty || !t.lastReq || (every > 0 && now - t.lastReq >= every - 250);
        if (due) this._load(t);
      }
      if (every > 0) this._timer = setTimeout(() => this._cycle(), every);
    }

    _loadDirty() {
      for (const t of this._tiles) if (t.dirty) this._load(t);
    }

    _cameraChanged(t) {
      const st = this._hass.states[t.cam.entity];
      const prev = t.st;
      t.st = st;
      const pic = st && st.attributes.entity_picture;
      const wasOff = !prev || prev.state === 'unavailable';
      if (!prev || pic !== (prev.attributes && prev.attributes.entity_picture) || (wasOff && st && st.state !== 'unavailable')) {
        t.dirty = true;
        if (this._running) this._load(t);
      }
    }

    _load(t) {
      const st = this._hass && this._hass.states[t.cam.entity];
      if (!st || st.state === 'unavailable') { t.dirty = false; this._renderTile(t); return; }
      const now = Date.now();
      if (t.fader.pending && now - t.fader.pending < LOAD_TIMEOUT) return; // stays dirty; retried later
      t.dirty = false;
      const url = buildUrl(st, this._hass, now);
      if (!url) { t.error = true; this._renderTile(t); return; }
      t.lastReq = now;
      t.requests += 1;
      t.lastUrl = url;
      t.fader.load(url, () => this._onFrame(t), () => this._onFail(t));
    }

    _onFrame(t) {
      if (t.dirty && this._running) setTimeout(() => this._load(t), 0);
      t.lastOk = Date.now();
      t.failures = 0;
      t.error = false;
      t.hasFrame = true;
      if (!t.el.classList.contains('panning')) this._applyPos(t);
      const beat = t.beat;
      beat.classList.remove('pulse');
      void beat.offsetWidth;
      beat.classList.add('pulse');
      this._renderTile(t);
      this._renderHeader();
    }

    _onFail(t) {
      t.failures += 1;
      if (!t.hasFrame || t.failures >= FAIL_LIMIT) t.error = true;
      this._renderTile(t);
      this._renderHeader();
    }

    _tickAgo() {
      const now = Date.now();
      for (const t of this._tiles) this._renderAgo(t, now);
    }

    /* ------------------------------------------------------------- build */

    _teardownTiles() {
      for (const t of this._tiles) { t.fader.cancel(); clearTimeout(t.holdTimer); }
      this._tiles = [];
      clearTimeout(this._timer); this._timer = null;
      clearInterval(this._ticker); this._ticker = null;
      this._running = false;
      this._closeLive();
    }

    _build() {
      const c = this._config;
      const root = this.shadowRoot;
      root.innerHTML = '';
      root.append(h('style', { text: STYLE }));
      const card = h('ha-card');
      card.style.setProperty('--arw', String(c.aspect.w));
      card.style.setProperty('--arh', String(c.aspect.h));
      this._card = card;

      this._head = null;
      if (c.title) {
        const ic = h('div', { class: 'head-ic', 'aria-hidden': 'true' }, icon('mdi:cctv'));
        const title = h('div', { class: 'title', text: c.title });
        const summary = h('div', { class: 'summary' });
        const status = h('div', { class: 'status', role: 'status' }, [h('i', { class: 'sd' }), h('span')]);
        card.append(h('div', { class: 'head' }, [ic, h('div', { class: 'titles' }, [title, summary]), status]));
        this._head = { ic, summary, status };
      }

      const n = (c.cameras || []).length;
      // auto: on wide cards use 4 columns when that fills every row and 3 would not (4, 8, 16 … cameras)
      const by4 = c.columns === 'auto' && n % 4 === 0 && n % 3 !== 0;
      const grid = h('div', { class: `grid${c.columns === 'auto' ? ' auto' : ''}${by4 ? ' by4' : ''}` });
      if (c.columns !== 'auto') grid.style.setProperty('--cols', String(c.columns));
      this._tiles = c.cameras.map((cam) => this._makeTile(cam));
      grid.append(...this._tiles.map((t) => t.el));
      card.append(grid);

      const dlg = h('dialog', { class: 'lv', 'aria-label': 'Live camera view' });
      dlg.style.setProperty('--arw', String(c.aspect.w));
      dlg.style.setProperty('--arh', String(c.aspect.h));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); this._closeLive(); });
      dlg.addEventListener('click', (e) => { if (e.target === dlg) this._closeLive(); });
      dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); this._closeLive(); } });
      this._dlg = dlg;

      root.append(card, dlg);
      this._built = true;
    }

    _makeTile(cam) {
      const el = h('button', { class: 'tile loading', type: 'button', 'data-entity': cam.entity });
      if (cam.tap_action === 'none') el.classList.add('static');
      const media = h('div', { class: 'media' });
      const fader = new Fader(media);
      const skel = h('div', { class: 'skel', 'aria-hidden': 'true' }, icon('mdi:cctv'));
      const offIc = h('div', { class: 'off-ic' }, icon('mdi:video-off-outline'));
      const offT = h('div', { class: 'off-t', text: 'Offline' });
      const offS = h('div', { class: 'off-s' });
      const off = h('div', { class: 'off' }, [offIc, offT, offS]);
      const live = h('span', { class: 'pill-live', hidden: true }, [h('i'), h('span', { text: 'LIVE' })]);
      const badges = h('div', { class: 'badges' });
      const badgeEls = {};
      for (const d of DETECTORS) {
        if (!cam[d.key]) continue;
        const b = h('span', { class: `badge ${d.key}`, hidden: true, title: d.label },
          [h('i', { class: 'dot' }), icon(d.icon), h('span', { class: 'bl', text: d.label })]);
        badgeEls[d.key] = b;
      }
      // person first, then vehicle, then motion (most important nearest the corner)
      badges.append(...DETECTORS.slice().reverse().map((d) => badgeEls[d.key]).filter(Boolean));
      const name = h('span', { class: 'name' });
      const beat = h('i', { class: 'beat' });
      const agoText = h('span', { class: 'at' });
      const ago = h('span', { class: 'ago' }, [beat, h('span', { class: 'w', text: 'updated' }), agoText]);
      el.append(media, skel, off, h('div', { class: 'shade-top' }),
        h('div', { class: 'top' }, [live, badges]),
        h('div', { class: 'bottom' }, [name, ago]));

      const t = {
        cam, el, fader, skel, off, offT, offS, live, badgeEls, name, beat, agoText, ago,
        st: undefined, dirty: true, lastReq: 0, lastOk: 0, requests: 0, failures: 0,
        error: false, hasFrame: false, holdTimer: null, held: false, lastUrl: null,
      };
      this._bindTile(t);
      return t;
    }

    /** How far (px) the cropped frame overflows the tile on each axis, from the front image's natural size. */
    _overflow(t) {
      const img = t.fader.current;
      const W = t.el.clientWidth, H = t.el.clientHeight;
      if (!img || !img.naturalWidth || !W || !H) return { x: 0, y: 0 };
      const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      return { x: Math.max(0, img.naturalWidth * k - W), y: Math.max(0, img.naturalHeight * k - H) };
    }

    _applyPos(t) {
      t.el.style.setProperty('--gh-cam-pos', `${t.pos.x.toFixed(1)}% ${t.pos.y.toFixed(1)}%`);
      if (t.cam.pan) {
        const o = this._overflow(t);
        t.el.classList.toggle('pannable', o.x > 1 || o.y > 1);
      }
    }

    _bindTile(t) {
      const el = t.el;
      let sx = 0, sy = 0, start = null, panning = false;
      t.pos = (t.cam.pan && loadPos(t.cam.entity)) || { ...t.cam.pos };
      this._applyPos(t);
      const clear = () => { clearTimeout(t.holdTimer); t.holdTimer = null; };
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        t.held = false;
        t.panned = false;
        sx = e.clientX; sy = e.clientY;
        start = { ...t.pos };
        panning = false;
        clear();
        t.holdTimer = setTimeout(() => {
          t.holdTimer = null;
          if (panning) return;
          t.held = true;
          this._moreInfo(t.cam.entity);
        }, HOLD_MS);
      });
      el.addEventListener('pointermove', (e) => {
        if (!start) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (!panning && Math.hypot(dx, dy) > MOVE_TOLERANCE) {
          clear();
          const o = this._overflow(t);
          if (t.cam.pan && (o.x > 1 || o.y > 1) && e.buttons !== 0) {
            panning = true;
            el.classList.add('panning');
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          }
        }
        if (panning) {
          const o = this._overflow(t);
          t.pos = {
            x: o.x > 1 ? Math.min(100, Math.max(0, start.x - (dx / o.x) * 100)) : start.x,
            y: o.y > 1 ? Math.min(100, Math.max(0, start.y - (dy / o.y) * 100)) : start.y,
          };
          this._applyPos(t);
        }
      });
      const end = () => {
        clear();
        if (panning) {
          panning = false;
          t.panned = true;
          el.classList.remove('panning');
          savePos(t.cam.entity, t.pos);
        }
        start = null;
      };
      for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, end);
      el.addEventListener('pointerleave', () => { if (!panning) { clear(); start = null; } });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('dragstart', (e) => e.preventDefault());
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (t.held) { t.held = false; return; }
        if (t.panned) { t.panned = false; return; }
        this._tap(t);
      });
    }

    _tap(t) {
      const a = t.cam.tap_action;
      if (a === 'none') return;
      if (a === 'more-info') { this._moreInfo(t.cam.entity); return; }
      this._openLive(t);
    }

    _moreInfo(entityId) {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
    }

    _nameOf(t) {
      const st = this._hass && this._hass.states[t.cam.entity];
      return t.cam.name || (st && st.attributes.friendly_name) || t.cam.entity;
    }

    _detections(cam) {
      const out = [];
      for (const d of DETECTORS) {
        const id = cam[d.key];
        const st = id && this._hass.states[id];
        if (st && st.state === 'on') out.push(d);
      }
      return out;
    }

    _isOffline(t) {
      const st = this._hass && this._hass.states[t.cam.entity];
      return !st || st.state === 'unavailable' || t.error;
    }

    _renderTile(t) {
      if (!this._hass) return;
      const st = this._hass.states[t.cam.entity];
      const name = this._nameOf(t);
      const offline = this._isOffline(t);
      const dets = offline ? [] : this._detections(t.cam);
      const el = t.el;
      t.name.textContent = name;
      el.classList.toggle('has-frame', t.hasFrame);
      el.classList.toggle('offline', offline);
      el.classList.toggle('loading', !offline && !t.hasFrame);
      const top = dets.length ? dets[0].key : null; // DETECTORS is ordered by importance
      for (const d of DETECTORS) {
        el.classList.toggle(d.key, top === d.key);
        if (t.badgeEls[d.key]) t.badgeEls[d.key].hidden = !dets.includes(d);
      }
      const streaming = !!st && (st.state === 'streaming' || st.state === 'recording');
      t.live.hidden = offline || !t.hasFrame || !streaming;
      t.live.classList.toggle('rec', !!st && st.state === 'recording');
      t.live.lastChild.textContent = st && st.state === 'recording' ? 'REC' : 'LIVE';

      if (offline) {
        if (!st) { t.offT.textContent = 'Not found'; }
        else if (st.state === 'unavailable') { t.offT.textContent = 'Offline'; }
        else { t.offT.textContent = t.hasFrame ? 'Offline' : 'No signal'; }
      }
      let label = `${name} camera`;
      if (offline) label += ', offline';
      if (dets.length) label += `, ${dets.map((d) => d.label.toLowerCase()).join(' and ')} detected`;
      if (t.cam.tap_action === 'live') label += '. Open live view';
      if (t.cam.tap_action === 'more-info') label += '. Show details';
      el.setAttribute('aria-label', label);
      this._renderAgo(t, Date.now());
    }

    _renderAgo(t, now) {
      if (t.lastOk) {
        t.agoText.textContent = fmtAgo(now - t.lastOk);
        const every = this._config.refresh > 0 ? this._config.refresh * 1000 : 60000;
        t.beat.classList.toggle('stale', now - t.lastOk > Math.max(every * 3, 30000));
      } else {
        t.agoText.textContent = '';
      }
      t.ago.style.visibility = t.lastOk ? '' : 'hidden';
      if (t.el.classList.contains('offline')) {
        const st = this._hass && this._hass.states[t.cam.entity];
        const seen = t.lastOk || (st && st.state === 'unavailable' ? tsOf(st.last_changed) : 0);
        t.offS.textContent = fmtLastSeen(seen, now) || (st ? 'Waiting for a picture' : t.cam.entity);
      }
    }

    _renderHeader() {
      if (!this._head || !this._hass) return;
      const total = this._tiles.length;
      const offline = this._tiles.filter((t) => this._isOffline(t)).length;
      const s = this._head.summary;
      s.textContent = '';
      s.append(h('span', { class: 'n', text: String(total) }), document.createTextNode(total === 1 ? ' camera' : ' cameras'));
      if (offline) {
        s.append(document.createTextNode(' · '), h('span', { class: 'bad', text: String(offline) }), document.createTextNode(' offline'));
      }
      // Most important active detection across the wall
      let best = null;
      for (const t of this._tiles) {
        if (this._isOffline(t)) continue;
        for (const d of this._detections(t.cam)) {
          if (!best || d.rank > best.d.rank) best = { d, name: this._nameOf(t) };
        }
      }
      const st = this._head.status;
      st.className = `status${best ? ` ${best.d.key}` : ''}`;
      st.lastChild.textContent = best ? `${best.d.label} · ${best.name}` : 'All clear';
      this._head.ic.classList.toggle('on', !!best && best.d.key === 'person');
    }

    /* --------------------------------------------------------- live view */

    _openLive(t) {
      if (!this._dlg) return;
      this._closeLive(true);
      const dlg = this._dlg;
      dlg.innerHTML = '';
      const pill = h('span', { class: 'pill-live' }, [h('i'), h('span', { text: 'LIVE' })]);
      const title = h('div', { class: 'sh-title' });
      const sub = h('div', { class: 'sh-sub' });
      const badges = h('div', { class: 'badges sh-badges' });
      const info = h('button', { class: 'round', type: 'button', 'aria-label': 'Camera details' }, icon('mdi:information-outline'));
      const close = h('button', { class: 'round close', type: 'button', 'aria-label': 'Close live view' }, icon('mdi:close'));
      info.addEventListener('click', () => { const id = t.cam.entity; this._closeLive(); this._moreInfo(id); });
      close.addEventListener('click', () => this._closeLive());
      const stage = h('div', { class: 'stage' });
      const sheet = h('div', { class: 'sheet', tabindex: '-1' }, [
        h('div', { class: 'sh-head' }, [h('div', { class: 'sh-titles' }, [title, sub]), info, close]),
        stage,
      ]);
      dlg.append(sheet);

      const live = { t, pill, title, sub, badges, stage, stream: null, fader: null, timer: null };
      const Stream = customElements.get('ha-camera-stream');
      if (Stream) {
        const s = document.createElement('ha-camera-stream');
        s.hass = this._hass;
        s.stateObj = this._hass.states[t.cam.entity];
        s.controls = true;
        s.muted = true;
        s.allowExoPlayer = true;
        s.setAttribute('controls', '');
        s.setAttribute('muted', '');
        stage.append(s);
        live.stream = s;
      } else {
        // No HA stream element (e.g. outside Home Assistant): show quickly refreshing snapshots.
        const snap = h('div', { class: 'snap' });
        stage.append(snap);
        live.fader = new Fader(snap);
        const cur = t.fader.current;
        if (cur && cur.src) live.fader.load(cur.src);
        const pull = () => {
          const st = this._hass && this._hass.states[t.cam.entity];
          const url = buildUrl(st, this._hass, Date.now());
          if (url && !(live.fader.pending && Date.now() - live.fader.pending < LOAD_TIMEOUT)) live.fader.load(url);
          live.timer = setTimeout(pull, LIVE_SNAPSHOT_MS);
        };
        live.timer = setTimeout(pull, cur && cur.src ? LIVE_SNAPSHOT_MS : 0);
      }
      stage.append(h('div', { class: 'top' }, [pill, badges]));
      this._live = live;
      this._renderLive();
      if (typeof dlg.showModal === 'function') {
        try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); dlg.classList.add('fallback'); }
      } else {
        dlg.setAttribute('open', '');
        dlg.classList.add('fallback');
      }
      this._setActive();
      try { sheet.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }

    _renderLive() {
      const L = this._live;
      if (!L || !this._hass) return;
      const st = this._hass.states[L.t.cam.entity];
      L.title.textContent = this._nameOf(L.t);
      if (L.stream && st && L.stream.stateObj !== st) L.stream.stateObj = st;
      if (L.stream && L.stream.hass !== this._hass) L.stream.hass = this._hass;
      const offline = !st || st.state === 'unavailable';
      L.pill.className = `pill-live${L.stream && !offline ? '' : ' still'}`;
      L.pill.lastChild.textContent = offline ? 'OFFLINE' : L.stream ? 'LIVE' : 'SNAPSHOT';
      const brand = st && (st.attributes.brand || st.attributes.model_name);
      L.sub.textContent = offline ? 'Camera is offline'
        : L.stream ? ['Live stream', brand].filter(Boolean).join(' · ')
          : `Snapshot · refreshes every ${LIVE_SNAPSHOT_MS / 1000}s`;
      L.badges.textContent = '';
      if (!offline) {
        for (const d of this._detections(L.t.cam)) {
          L.badges.append(h('span', { class: `badge ${d.key}` }, [h('i', { class: 'dot' }), icon(d.icon), h('span', { class: 'bl', text: d.label })]));
        }
      }
    }

    _closeLive(silent) {
      const L = this._live;
      if (!L) return;
      this._live = null;
      clearTimeout(L.timer);
      if (L.fader) L.fader.cancel();
      const dlg = this._dlg;
      if (dlg) {
        if (typeof dlg.close === 'function' && dlg.open) { try { dlg.close(); } catch (e) { /* ignore */ } }
        dlg.removeAttribute('open');
        dlg.classList.remove('fallback');
        dlg.innerHTML = ''; // drops ha-camera-stream, which stops the stream
      }
      if (!silent) {
        try { L.t.el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        this._setActive();
      }
    }
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, GlasshouseCameraCard);
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: TAG,
      name: 'Glasshouse Camera Card',
      description: 'A security-camera wall with live-refreshing snapshots, detection badges and a live view.',
      preview: true,
      documentationURL: 'https://github.com/petergCA/glasshouse-camera-card',
    });
    console.info(
      `%c GLASSHOUSE-CAMERA-CARD %c v${VERSION} `,
      'color:#0a0f18;background:#ff5c5c;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px',
      'color:#e9eef6;background:#1b2333;font-weight:600;border-radius:0 4px 4px 0;padding:2px 4px',
    );
  }
})();
