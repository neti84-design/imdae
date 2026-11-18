/* 감각 피드백: 진동(햅틱) + 소리 */
(function () {
  'use strict';
  const S = (window.Ssok = window.Ssok || {});

  const canVibrate = typeof navigator.vibrate === 'function';
  const LEVELS = { off: 0, weak: 0.55, normal: 1, strong: 1.6 };
  let mult = 1;
  let soundOn = false;

  // iOS Safari(18+)는 vibrate가 없지만 <input switch> 토글 시 시스템 햅틱이 난다.
  let iosSwitch = null;
  function setupIOSSwitch() {
    if (canVibrate || iosSwitch) return;
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;';
    document.body.appendChild(label);
    iosSwitch = label;
  }

  function scale(p) {
    if (Array.isArray(p)) return p.map((v, i) => (i % 2 === 0 ? Math.max(1, Math.round(v * mult)) : v));
    return Math.max(1, Math.round(p * mult));
  }

  let lastIOS = 0;
  function vib(pattern, iosOk) {
    if (!mult) return;
    if (canVibrate) {
      try { navigator.vibrate(scale(pattern)); } catch (e) { /* noop */ }
    } else if (iosOk && iosSwitch) {
      const now = performance.now();
      if (now - lastIOS < 60) return;
      lastIOS = now;
      iosSwitch.click();
    }
  }

  /* ---------- 소리 (WebAudio 합성, 파일 없음) ---------- */
  let ac = null;
  let noiseBuf = null;
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      const len = Math.floor(ac.sampleRate * 0.08);
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tick(freq, vol, dur, when) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (when || 0);
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.4;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(a.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function chime() {
    const a = audio();
    if (!a) return;
    [660, 880, 1320].forEach((f, i) => {
      const t = a.currentTime + i * 0.12;
      const o = a.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + 1);
    });
  }

  S.feedback = {
    canVibrate,
    configure(settings) {
      mult = LEVELS[settings.vib] != null ? LEVELS[settings.vib] : 1;
      soundOn = !!settings.sound;
      setupIOSSwitch();
    },
    /** 사용자 제스처 안에서 한 번 불러 오디오를 깨운다 */
    unlock() { if (soundOn) audio(); },
    /** 집을 때: 가볍게 1회 */
    grab() { vib(10, true); },
    /** 당기는 중: 장력(0~1)에 따라 점점 강하게 */
    tension(t) { vib(2 + t * t * 16, false); },
    /** 뽑힐 때 "톡" (+뿌리째면 아주 약한 여운) */
    pluck(root) {
      vib(root ? [26, 55, 5] : 18, true);
      if (soundOn) {
        tick(3800, 0.35, 0.03);
        if (root) tick(2400, 0.08, 0.05, 0.06);
      }
    },
    /** 검은 머리를 집음: "앗" */
    oops() { vib(6, false); if (soundOn) tick(900, 0.05, 0.04); },
    complete() { vib([12, 70, 12, 70, 30], true); if (soundOn) chime(); },
    test() { vib([26, 55, 5], true); if (soundOn) tick(3800, 0.35, 0.03); }
  };
})();
