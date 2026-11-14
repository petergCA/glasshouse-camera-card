/* Mock Home Assistant `hass` for the Glasshouse camera card harness and node tests.
 * Generic demo data only. setState() creates a new state object (like HA) and hands a fresh hass
 * object to every subscriber. `pictureFor(id)` decides each camera's entity_picture. */
(function (root) {
  'use strict';

  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

  function s(entity_id, state, attributes, changedMinAgo) {
    const t = ago(changedMinAgo || 30);
    return { entity_id, state, attributes: attributes || {}, last_changed: t, last_updated: t, context: { id: 'x' } };
  }

  const CAMERAS = [
    ['camera.front_door', 'Front Door', 'streaming'],
    ['camera.driveway', 'Driveway', 'idle'],
    ['camera.backyard', 'Backyard', 'idle'],
    ['camera.garage', 'Garage', 'recording'],
    ['camera.nursery', 'Nursery', 'streaming'],
    ['camera.side_gate', 'Side Gate', 'unavailable'],
  ];

  function demoStates(pictureFor, sensorsOn) {
    const pic = pictureFor || ((id) => `/api/camera_proxy/${id}?token=demo${id.length}`);
    const on = sensorsOn || {
      'binary_sensor.front_door_person': 'on', 'binary_sensor.front_door_motion': 'on',
      'binary_sensor.driveway_vehicle': 'on', 'binary_sensor.driveway_motion': 'on',
    };
    const list = [];
    for (const [id, name, state] of CAMERAS) {
      list.push(s(id, state, {
        friendly_name: name, entity_picture: pic(id), access_token: 'demo', brand: 'Demo Cam',
        supported_features: 2, frontend_stream_type: 'hls',
      }, state === 'unavailable' ? 12 : 30));
      const base = id.split('.')[1];
      for (const k of ['motion', 'person', 'vehicle']) {
        const sid = `binary_sensor.${base}_${k}`;
        list.push(s(sid, on[sid] || 'off', { device_class: k === 'motion' ? 'motion' : 'occupancy', friendly_name: `${name} ${k}` }));
      }
    }
    const states = {};
    for (const x of list) states[x.entity_id] = x;
    return states;
  }

  function createHass(initialStates, opts) {
    const subscribers = new Set();
    const calls = [];
    let states = initialStates || demoStates();
    const base = (opts && opts.hassUrl !== undefined) ? opts.hassUrl : 'http://homeassistant.local:8123';

    function makeHass() {
      return {
        states,
        user: { name: 'Demo' },
        language: 'en',
        hassUrl(path) { return `${base}${path || ''}`; },
        callService(domain, service, data) {
          calls.push({ domain, service, data: JSON.parse(JSON.stringify(data || {})) });
          return Promise.resolve();
        },
      };
    }

    const api = {
      calls,
      current: makeHass(),
      subscribe(fn) { subscribers.add(fn); fn(api.current); return () => subscribers.delete(fn); },
      setState(id, state, attrs) {
        const prev = states[id];
        if (!prev) return;
        const now = new Date().toISOString();
        const next = {
          ...prev, attributes: { ...prev.attributes, ...(attrs || {}) }, last_updated: now,
          state: state === undefined ? prev.state : state,
          last_changed: state !== undefined && state !== prev.state ? now : prev.last_changed,
        };
        states = { ...states, [id]: next };
        api.current = makeHass();
        subscribers.forEach((fn) => fn(api.current));
      },
    };
    return api;
  }

  root.GHMock = { demoStates, createHass, CAMERAS };
})(typeof window !== 'undefined' ? window : globalThis);
