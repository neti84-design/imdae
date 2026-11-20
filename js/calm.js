/* 다른 심신안정: 뽁뽁이 · 키캡 (소리는 항상 켜짐, 화면 안 🔊 버튼으로만 끔) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const isOn = (name) => $('screen-' + name).classList.contains('active');

  /* ---------- 소리 (WebAudio 합성) ---------- */
  let ac = null, out = null, muted = false;
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      out = ac.createGain();
      out.gain.value = 0.9;
      out.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const bufs = {};
  function noise(dur) {
    const key = Math.round(dur * 1000);
    if (bufs[key]) return bufs[key];
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const b = ac.createBuffer(1, len, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (bufs[key] = b);
  }
  function burst(t, dur, type, freq, q, gain) {
    const src = ac.createBufferSource();
    src.buffer = noise(dur);
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t); src.stop(t + dur + 0.01);
  }
  function tone(t, f0, f1, dur, gain, type) {
    const o = ac.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function popSound() {
    if (muted || !audio()) return;
    const t = ac.currentTime, p = rand(0.85, 1.2);
    burst(t, 0.045, 'highpass', 1800 * p, 0.7, 1.2);
    burst(t, 0.08, 'bandpass', 900 * p, 2, 0.9);
    tone(t, 520 * p, 140 * p, 0.08, 0.55);
  }

  const SW = {
    blue:  { click: true,  body: 2600, q: 3,   low: 180, lowG: 0.25, up: true },
    brown: { click: false, body: 1700, q: 2.2, low: 160, lowG: 0.45, up: true },
    red:   { click: false, body: 1300, q: 1.6, low: 140, lowG: 0.35, up: false },
    thock: { click: false, body: 700,  q: 1.4, low: 95,  lowG: 0.9,  up: false }
  };
  let sw = 'blue';
  function keyDown(big) {
    if (muted || !audio()) return;
    const s = SW[sw], t = ac.currentTime, p = rand(0.94, 1.06) * (big ? 0.85 : 1);
    if (s.click) {
      burst(t, 0.015, 'highpass', 4200 * p, 1, 1.4);
      tone(t, 3200 * p, 2200 * p, 0.015, 0.3, 'square');
    }
    burst(t + (s.click ? 0.008 : 0), 0.04, 'bandpass', s.body * p, s.q, 1.1);
    tone(t, s.low * 2 * p, s.low * p, big ? 0.12 : 0.07, s.lowG);
  }
  function keyUp() {
    const s = SW[sw];
    if (muted || !s.up || !audio()) return;
    burst(ac.currentTime, 0.02, 'bandpass', s.body * 1.3 * rand(0.94, 1.06), 2, 0.45);
  }
  // 진동: 안드로이드는 vibrate, 아이폰은 쏙의 시스템 햅틱 트릭
  const buzz = (ms) => {
    const fb = window.Ssok && window.Ssok.feedback;
    if (fb && fb.buzz) fb.buzz(ms);
    else { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* noop */ } }
  };

  // 아이폰 무음 스위치가 켜져 있어도 소리가 나도록 '재생' 모드로 전환
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* noop */ }
  const SILENT = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
  let unlocked = false;
  function unlock() {
    audio();
    if (unlocked) return;
    unlocked = true;
    try {
      const el = new Audio(SILENT);
      el.setAttribute('playsinline', '');
      const pr = el.play();
      if (pr && pr.catch) pr.catch(() => { unlocked = false; });
    } catch (e) { unlocked = false; }
  }
  ['touchend', 'pointerup', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));

  document.querySelectorAll('.calm-mute').forEach((b) => b.addEventListener('click', () => {
    muted = !muted;
    document.querySelectorAll('.calm-mute').forEach((x) => (x.textContent = muted ? '🔇' : '🔊'));
    if (!muted) popSound();
  }));
  // 메뉴로 들어올 때 오디오 깨우기 (iOS는 사용자 터치 안에서만 소리 허용)
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => audio()));

  /* ---------- 뽁뽁이 ---------- */
  const wrap = $('wrap');
  let pops = 0;
  function buildWrap() {
    wrap.innerHTML = '';
    for (let i = 0; i < 7 * 10; i++) {
      const b = document.createElement('div');
      b.className = 'bubble';
      wrap.appendChild(b);
    }
  }
  function popAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.classList.contains('bubble') || el.classList.contains('popped')) return;
    el.classList.add('popped');
    popSound(); buzz(30);
    $('pop-count').textContent = `${++pops}개 터뜨림`;
    if (!wrap.querySelector('.bubble:not(.popped)')) setTimeout(buildWrap, 700);
  }
  const dragging = new Set();
  wrap.addEventListener('pointerdown', (e) => {
    e.preventDefault(); audio();
    dragging.add(e.pointerId);
    try { wrap.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    popAt(e.clientX, e.clientY);
  });
  wrap.addEventListener('pointermove', (e) => { if (dragging.has(e.pointerId)) popAt(e.clientX, e.clientY); });
  const endDrag = (e) => dragging.delete(e.pointerId);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  $('new-wrap').addEventListener('click', () => { buildWrap(); popSound(); });
  buildWrap();

  /* ---------- 키캡 ---------- */
  const LAYOUT = [
    [['Esc', 'Escape', 'pink'], ['1', 'Digit1'], ['2', 'Digit2'], ['3', 'Digit3'], ['4', 'Digit4'], ['5', 'Digit5'], ['6', 'Digit6'], ['7', 'Digit7'], ['8', 'Digit8'], ['9', 'Digit9'], ['0', 'Digit0']],
    [['ㅂ', 'KeyQ'], ['ㅈ', 'KeyW'], ['ㄷ', 'KeyE'], ['ㄱ', 'KeyR'], ['ㅅ', 'KeyT'], ['ㅛ', 'KeyY'], ['ㅕ', 'KeyU'], ['ㅑ', 'KeyI'], ['ㅐ', 'KeyO'], ['ㅔ', 'KeyP']],
    [['ㅁ', 'KeyA'], ['ㄴ', 'KeyS'], ['ㅇ', 'KeyD'], ['ㄹ', 'KeyF'], ['ㅎ', 'KeyG'], ['ㅗ', 'KeyH'], ['ㅓ', 'KeyJ'], ['ㅏ', 'KeyK'], ['ㅣ', 'KeyL']],
    [['⇧', 'ShiftLeft', 'alt w15'], ['ㅋ', 'KeyZ'], ['ㅌ', 'KeyX'], ['ㅊ', 'KeyC'], ['ㅍ', 'KeyV'], ['ㅠ', 'KeyB'], ['ㅜ', 'KeyN'], ['ㅡ', 'KeyM'], ['⌫', 'Backspace', 'alt w15']],
    [['한/영', 'AltLeft', 'alt w15'], ['', 'Space', 'w5'], ['☺', 'ControlRight', 'pink w15'], ['↵', 'Enter', 'pink w15']]
  ];
  const board = $('board');
  const keyEls = {};
  LAYOUT.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'krow';
    r.forEach(([label, code, cls]) => {
      const k = document.createElement('button');
      k.className = 'key ' + (cls || '');
      k.textContent = label;
      keyEls[code] = k;
      row.appendChild(k);
    });
    board.appendChild(row);
  });
  let presses = 0;
  function press(k) {
    if (!k || k.classList.contains('down')) return;
    k.classList.add('down');
    keyDown(/w(15|5)/.test(k.className));
    buzz(/w(15|5)/.test(k.className) ? 28 : 18);
    $('key-count').textContent = `${++presses}번 딸깍`;
  }
  function release(k) {
    if (!k || !k.classList.contains('down')) return;
    k.classList.remove('down');
    keyUp();
  }
  const held = {};
  board.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('.key');
    if (!k) return;
    e.preventDefault(); audio();
    held[e.pointerId] = k;
    press(k);
  });
  const endKey = (e) => { if (held[e.pointerId]) { release(held[e.pointerId]); delete held[e.pointerId]; } };
  window.addEventListener('pointerup', endKey);
  window.addEventListener('pointercancel', endKey);
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  // PC에서는 실제 키보드로도
  window.addEventListener('keydown', (e) => {
    if (!isOn('keys')) return;
    const k = keyEls[e.code];
    if (!k) return;
    e.preventDefault(); audio();
    if (!e.repeat) press(k);
  });
  window.addEventListener('keyup', (e) => { if (isOn('keys')) release(keyEls[e.code]); });

  document.querySelectorAll('#switches button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#switches button').forEach((x) => x.classList.toggle('on', x === b));
    sw = b.dataset.sw;
    keyDown(false); buzz(18); setTimeout(keyUp, 90);
  }));
})();
