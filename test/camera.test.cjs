/* Tests for glasshouse-camera-card, run with node + jsdom (not a repo dependency):
 *   mkdir /tmp/ghtest && cd /tmp/ghtest && npm i jsdom
 *   node /path/to/repo/test/camera.test.cjs
 * jsdom does not fetch images, so tests fire `load` / `error` on the card's <img> by hand.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(require.resolve('jsdom', { paths: [process.cwd(), __dirname] }));

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  ✓', msg); }
  else { failed += 1; console.log('  ✗', msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)})`); }

const windows = [];

function setup(config, opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  windows.push(w);
  w.eval(`
    customElements.define('ha-card', class extends HTMLElement {});
    customElements.define('ha-icon', class extends HTMLElement {});
    window.__vis = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis });
  `);
  if (o.io) {
    w.eval(`
      window.__io = [];
      window.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; this.els = []; window.__io.push(this); }
        observe(el) { this.els.push(el); }
        disconnect() { this.els = []; }
        fire(v) { this.cb(this.els.map((target) => ({ target, isIntersecting: v }))); }
      };
    `);
  }
  w.console.info = () => {};
  w.eval(read('test/mock-hass.js'));
  w.eval(read('glasshouse-camera-card.js'));
  const mock = w.GHMock.createHass(undefined, { hassUrl: 'http://ha.local:8123' });
  const card = w.document.createElement('glasshouse-camera-card');
  card.setConfig(config || {
    title: 'Cameras', refresh: 1,
    cameras: [
      { entity: 'camera.front_door', name: 'Front Door', motion: 'binary_sensor.front_door_motion', person: 'binary_sensor.front_door_person' },
      { entity: 'camera.driveway', vehicle: 'binary_sensor.driveway_vehicle', motion: 'binary_sensor.driveway_motion', tap_action: 'more-info' },
      { entity: 'camera.side_gate', tap_action: 'none' },
    ],
  });
  w.document.body.append(card);
  mock.subscribe((hass) => { card.hass = hass; });
  const events = [];
  card.addEventListener('hass-more-info', (e) => events.push(['more-info', e.detail.entityId]));
  const $ = (sel) => card.shadowRoot.querySelector(sel);
  const tile = (id) => card._tiles.find((t) => t.cam.entity === id);
  // complete (or fail) the outstanding request of a tile
  const finish = (t, type) => {
    const img = t.fader.imgs.find((i) => i.getAttribute('src') === t.lastUrl);
    img.dispatchEvent(new w.Event(type || 'load'));
  };
  const setVis = (v) => { w.__vis = v; w.document.dispatchEvent(new w.Event('visibilitychange')); };
  return { w, mock, card, events, $, tile, finish, setVis };
}

(async () => {
  console.log('URL building');
  {
    const { w } = setup();
    const C = w.customElements.get('glasshouse-camera-card');
    const st = (pic) => ({ attributes: { entity_picture: pic } });
    const hass = { hassUrl: (p) => `http://ha.local:8123${p || ''}` };
    eq(C.buildUrl(st('/api/camera_proxy/camera.a?token=abc'), hass, 123),
      'http://ha.local:8123/api/camera_proxy/camera.a?token=abc&t=123', 'relative path gets hassUrl prefix and &t=');
    eq(C.buildUrl(st('/api/camera_proxy/camera.a?token=abc'), {}, 5), '/api/camera_proxy/camera.a?token=abc&t=5', 'no hassUrl: stays relative');
    eq(C.buildUrl(st('/api/camera_proxy/camera.a?token=abc'), hass), 'http://ha.local:8123/api/camera_proxy/camera.a?token=abc', 'no t: no cache-buster');
    eq(C.buildUrl(st('/local/snap.jpg'), hass, 9), 'http://ha.local:8123/local/snap.jpg?t=9', 'no query string -> ?t=');
    eq(C.buildUrl(st('/api/camera_proxy/camera.a?t=1&token=abc'), hass, 2), 'http://ha.local:8123/api/camera_proxy/camera.a?token=abc&t=2', 'existing t replaced, not duplicated');
    eq(C.buildUrl(st('/api/camera_proxy/camera.a?token=abc&t=1'), hass, 2), 'http://ha.local:8123/api/camera_proxy/camera.a?token=abc&t=2', 'trailing t replaced');
    eq(C.buildUrl(st('https://cam.example/snap.jpg?x=1'), hass, 3), 'https://cam.example/snap.jpg?x=1&t=3', 'absolute URL not prefixed');
    eq(C.buildUrl(st('data:image/jpeg;base64,AAAA'), hass, 3), 'data:image/jpeg;base64,AAAA', 'data: URL untouched');
    eq(C.buildUrl(st(undefined), hass, 3), null, 'no entity_picture -> null');
    eq(C.buildUrl(undefined, hass, 3), null, 'no state -> null');
    eq(C.parseAspect('16:9'), { w: 16, h: 9 }, 'aspect 16:9');
    eq(C.parseAspect('4/3'), { w: 4, h: 3 }, 'aspect 4/3');
    eq(C.parseAspect('56.25%'), { w: 100, h: 56.25 }, 'aspect percent');
    eq(C.parseAspect(1), { w: 1, h: 1 }, 'aspect number');
    eq(C.parseAspect('wide'), null, 'bad aspect -> null');
    eq([1000, 4000, 125000, 7200000].map(C.fmtAgo), ['just now', '4s ago', '2m ago', '2h ago'], 'ago formatting');
  }

  console.log('initial load, crossfade, refresh scheduling');
  {
    const { card, tile, finish, $ } = setup();
    const fd = tile('camera.front_door');
    eq(fd.requests, 1, 'visible card requests a frame at once');
    ok(fd.lastUrl.startsWith('http://ha.local:8123/api/camera_proxy/camera.front_door?token=') && /&t=\d+$/.test(fd.lastUrl), 'proxy URL with hassUrl prefix and cache-buster');
    eq(tile('camera.side_gate').requests, 0, 'unavailable camera is not fetched');
    ok(fd.el.classList.contains('loading'), 'skeleton until the first frame');
    finish(fd);
    ok(!fd.el.classList.contains('loading') && fd.el.classList.contains('has-frame'), 'first frame replaces the skeleton');
    const shown = fd.fader.current;
    ok(shown.classList.contains('show') && shown.classList.contains('front'), 'new frame shown on top');
    eq(fd.agoText.textContent, 'just now', 'updated label');
    finish(tile('camera.driveway'));

    await sleep(1150);
    eq(fd.requests, 2, 'refreshes after `refresh` seconds');
    const prev = fd.fader.current;
    const next = fd.fader.imgs.find((i) => i !== prev);
    eq(next.getAttribute('src'), fd.lastUrl, 'next frame loads into the hidden image');
    ok(prev.classList.contains('show'), 'old frame stays visible while the new one loads (no spinner)');
    await sleep(1100);
    eq(fd.requests, 2, 'no new request while one is still in flight');
    finish(fd);
    ok(fd.fader.current === next, 'frames swap on load');
    await sleep(600);
    ok(!prev.classList.contains('show'), 'old frame hidden after the crossfade');
    ok($('.summary').textContent.includes('3 cameras') && $('.summary').textContent.includes('1 offline'), 'header summary');
    card.remove();
  }

  console.log('visibility gating (document hidden)');
  {
    const { tile, finish, setVis, card } = setup();
    const fd = tile('camera.front_door');
    finish(fd);
    setVis('hidden');
    ok(!card._running, 'stops when the tab is hidden');
    await sleep(1200);
    eq(fd.requests, 1, 'no requests while hidden');
    setVis('visible');
    eq(fd.requests, 2, 'stale frame refreshed the moment the tab is visible again');
    ok(card._running, 'running again');
    card.remove();
    ok(!card._running && card._timer === null && card._ticker === null, 'timers cleared on disconnect');
  }

  console.log('visibility gating (IntersectionObserver)');
  {
    const { w, tile, finish, card } = setup(undefined, { io: true });
    const fd = tile('camera.front_door');
    eq(fd.requests, 0, 'nothing fetched before the card is on screen');
    ok(fd.el.classList.contains('loading'), 'skeleton while off screen');
    w.__io[0].fire(true);
    eq(fd.requests, 1, 'fetched when scrolled into view');
    finish(fd);
    w.__io[0].fire(false);
    await sleep(1200);
    eq(fd.requests, 1, 'no refresh while scrolled out of view');
    w.__io[0].fire(true);
    eq(fd.requests, 2, 'refreshes on return');
    card.remove();
  }

  console.log('refresh: 0 (state changes only)');
  {
    const { mock, tile, finish, card } = setup({
      refresh: 0, cameras: ['camera.front_door', { entity: 'camera.driveway', motion: 'binary_sensor.driveway_motion' }],
    });
    const fd = tile('camera.front_door'), dw = tile('camera.driveway');
    finish(fd); finish(dw);
    await sleep(1200);
    eq(fd.requests, 1, 'no periodic refresh');
    mock.setState('camera.front_door', undefined, { entity_picture: '/api/camera_proxy/camera.front_door?token=rotated' });
    eq(fd.requests, 2, 'new entity_picture -> immediate fetch');
    ok(fd.lastUrl.includes('token=rotated'), 'uses the new token');
    mock.setState('binary_sensor.driveway_motion', 'off');
    eq(dw.requests, 1, 'sensor change does not refetch the picture');
    card.remove();
  }

  console.log('offline and errors');
  {
    const { mock, tile, finish, $, card } = setup();
    const sg = tile('camera.side_gate');
    ok(sg.el.classList.contains('offline'), 'unavailable camera shows the Offline tile');
    eq(sg.offT.textContent, 'Offline', 'offline title');
    ok(/^Last seen /.test(sg.offS.textContent), `last seen (${sg.offS.textContent})`);
    ok(!sg.el.classList.contains('loading'), 'no skeleton on an offline tile');
    mock.setState('camera.side_gate', 'idle');
    eq(sg.requests, 1, 'fetches as soon as the camera comes back');
    finish(sg);
    ok(!sg.el.classList.contains('offline'), 'back online');

    const dw = tile('camera.driveway');
    finish(dw, 'error');
    ok(dw.el.classList.contains('offline'), 'first frame failing -> offline');
    eq(dw.offT.textContent, 'No signal', 'no frame yet -> "No signal"');

    const fd = tile('camera.front_door');
    finish(fd);
    await sleep(1100);
    finish(fd, 'error');
    ok(!fd.el.classList.contains('offline'), 'one failed refresh keeps the last frame');
    await sleep(1000);
    finish(fd, 'error');
    ok(fd.el.classList.contains('offline') && fd.el.classList.contains('has-frame'), 'repeated failures -> offline over the last frame');
    eq(fd.offT.textContent, 'Offline', 'offline title with a frame');
    ok($('.summary').textContent.includes('2 offline'), 'header counts offline cameras');
    await sleep(1000);
    finish(fd);
    ok(!fd.el.classList.contains('offline'), 'recovers on the next good frame');
    card.remove();
  }

  console.log('badges and header status');
  {
    const { mock, tile, $, card } = setup();
    const fd = tile('camera.front_door');
    ok(!fd.badgeEls.person.hidden && !fd.badgeEls.motion.hidden, 'person + motion badges on');
    ok(fd.el.classList.contains('person') && !fd.el.classList.contains('motion'), 'tile ring follows the most important detection');
    eq($('.status').textContent, 'Person · Front Door', 'header status names the camera');
    ok($('.status').classList.contains('person'), 'header status in alert colour');
    ok(fd.el.getAttribute('aria-label').includes('person and motion detected'), 'aria-label mentions detections');
    const dw = tile('camera.driveway');
    ok(!dw.badgeEls.vehicle.hidden && dw.el.classList.contains('vehicle'), 'vehicle badge');
    mock.setState('binary_sensor.front_door_person', 'off');
    ok(fd.badgeEls.person.hidden && fd.el.classList.contains('motion'), 'person off -> motion ring');
    eq($('.status').textContent, 'Vehicle · Driveway', 'status falls back to the next detection');
    mock.setState('binary_sensor.front_door_motion', 'off');
    mock.setState('binary_sensor.driveway_vehicle', 'off');
    mock.setState('binary_sensor.driveway_motion', 'off');
    ok(fd.badgeEls.motion.hidden && !fd.el.classList.contains('motion'), 'all badges off');
    eq($('.status').textContent, 'All clear', 'all clear');
    ok(tile('camera.side_gate').el.querySelectorAll('.badge').length === 0, 'no badges without sensors');

    let renders = 0;
    const orig = card._renderTile.bind(card);
    card._renderTile = (t) => { renders += 1; orig(t); };
    card.hass = mock.current;
    eq(renders, 0, 'same states -> no re-render');
    mock.setState('binary_sensor.driveway_motion', 'on');
    eq(renders, 1, 'only the affected tile re-renders');
    card.remove();
  }

  console.log('tap actions, live view, hold');
  {
    const { w, tile, events, card, finish } = setup();
    const fd = tile('camera.front_door');
    finish(fd);
    fd.el.click();
    const dlg = card.shadowRoot.querySelector('dialog');
    ok(dlg.hasAttribute('open'), 'tap opens the live view');
    ok(dlg.querySelector('.stage .snap img'), 'no ha-camera-stream -> snapshot fallback');
    eq(dlg.querySelector('.sh-title').textContent, 'Front Door', 'live view title');
    eq(dlg.querySelector('.pill-live').textContent, 'SNAPSHOT', 'fallback pill');
    ok(!card._running, 'grid refresh pauses while the live view is open');
    dlg.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(!dlg.hasAttribute('open') && !dlg.querySelector('.stage'), 'Escape closes and tears down the view');
    ok(card._running, 'grid refresh resumes');
    fd.el.click();
    dlg.querySelector('.close').click();
    ok(!dlg.hasAttribute('open'), 'close button');

    tile('camera.driveway').el.click();
    eq(events.at(-1), ['more-info', 'camera.driveway'], 'tap_action more-info');
    const n = events.length;
    tile('camera.side_gate').el.click();
    ok(events.length === n && !dlg.hasAttribute('open'), 'tap_action none');

    const P = w.PointerEvent || w.MouseEvent;
    fd.el.dispatchEvent(new P('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
    await sleep(560);
    fd.el.dispatchEvent(new P('pointerup', { bubbles: true, button: 0 }));
    fd.el.click();
    eq(events.at(-1), ['more-info', 'camera.front_door'], 'hold opens more-info');
    ok(!dlg.hasAttribute('open'), 'click after a hold does not open the live view');
    card.remove();
  }

  console.log('live view with ha-camera-stream');
  {
    const { w, tile, card, mock } = setup();
    w.eval(`customElements.define('ha-camera-stream', class extends HTMLElement {})`);
    tile('camera.front_door').el.click();
    const s = card.shadowRoot.querySelector('ha-camera-stream');
    ok(s && s.hass === mock.current && s.stateObj === mock.current.states['camera.front_door'], 'stream element gets hass + stateObj');
    eq(card.shadowRoot.querySelector('dialog .pill-live').textContent, 'LIVE', 'LIVE pill');
    mock.setState('camera.front_door', undefined, { entity_picture: '/x?token=new' });
    ok(s.stateObj === mock.current.states['camera.front_door'], 'stateObj kept current');
    card.remove();
  }

  console.log('config');
  {
    const { w, card } = setup();
    const C = w.customElements.get('glasshouse-camera-card');
    const bad = (cfg) => { try { new C().setConfig(cfg); return false; } catch (e) { return /glasshouse-camera-card/.test(e.message); } };
    ok(bad({}), 'cameras required');
    ok(bad({ cameras: [] }), 'cameras non-empty');
    ok(bad({ cameras: [{ name: 'x' }] }), 'camera needs entity');
    ok(bad({ cameras: [{ entity: 'camera.a', person: 'nope' }] }), 'sensor must be an entity id');
    ok(bad({ cameras: ['camera.a'], columns: 9 }), 'columns range');
    ok(bad({ cameras: ['camera.a'], refresh: -1 }), 'refresh >= 0');
    ok(bad({ cameras: ['camera.a'], aspect_ratio: 'wide' }), 'aspect ratio format');
    ok(bad({ cameras: [{ entity: 'camera.a', tap_action: 'toggle' }] }), 'tap_action values');
    ok(!bad({ cameras: [{ entity: 'camera.a', tap_action: { action: 'more-info' } }], columns: 'auto', aspect_ratio: '4:3', refresh: 0 }), 'valid config');
    eq(card.getGridOptions(), { columns: 'full', rows: 'auto' }, 'getGridOptions');
    eq(C.getStubConfig({ states: { 'camera.a': {}, 'light.b': {} } }), { title: 'Cameras', cameras: [{ entity: 'camera.a' }] }, 'stub config');
    ok(card.getCardSize() >= 4, 'card size');
    card.remove();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  windows.forEach((w) => w.close());
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
