/* 쏙 — 머리 화면: 생성, 그리기, 제스처(이동·확대·집기·당기기), 뽑기 판정 */
(function () {
  'use strict';
  const S = (window.Ssok = window.Ssok || {});

  const W = 600;                 // 월드 폭 (높이는 화면 비율에 맞춰 생성)
  const TAU = Math.PI * 2;
  const LONG_PRESS_MS = 220;     // 이 시간 누르고 있으면 집기
  const MOVE_SLOP = 9;           // 이 이상 움직이면 집기 대신 화면 이동
  const PICK_PX = 20;            // 흰머리 집기 허용 반경(화면 px)
  const OOPS_PX = 9;             // 검은 머리 "앗" 판정 반경
  const MAX_ZOOM = 5.5;          // 최소 배율 대비 최대 배율
  const STUB_T = 0.16;           // 끊겼을 때 남는 길이 비율

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  S.hashStr = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  /* ---------- 베지어 ---------- */
  function bez(h, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * h.x0 + b * h.x1 + c * h.x2 + d * h.x3, a * h.y0 + b * h.y1 + c * h.y2 + d * h.y3];
  }
  // [0, t] 구간의 조절점 (드 카스텔조)
  function splitLeft(h, t) {
    const x01 = lerp(h.x0, h.x1, t), y01 = lerp(h.y0, h.y1, t);
    const x12 = lerp(h.x1, h.x2, t), y12 = lerp(h.y1, h.y2, t);
    const x23 = lerp(h.x2, h.x3, t), y23 = lerp(h.y2, h.y3, t);
    const x012 = lerp(x01, x12, t), y012 = lerp(y01, y12, t);
    const x123 = lerp(x12, x23, t), y123 = lerp(y12, y23, t);
    return [h.x0, h.y0, x01, y01, x012, y012, lerp(x012, x123, t), lerp(y012, y123, t)];
  }
  function pathHair(ctx, h) {
    ctx.moveTo(h.x0, h.y0);
    if (h.cut >= 1) ctx.bezierCurveTo(h.x1, h.y1, h.x2, h.y2, h.x3, h.y3);
    else {
      const p = splitLeft(h, h.cut);
      ctx.bezierCurveTo(p[2], p[3], p[4], p[5], p[6], p[7]);
    }
  }
  function samples(h, t0, t1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(bez(h, lerp(t0, t1, i / n)));
    return out;
  }

  /* ---------- 머리 생성 ---------- */
  function generate(seed, H) {
    const r = mulberry32(seed);
    const amp = 5 + r() * 14, per = 140 + r() * 170, ph = r() * TAU;
    const partX = (y) => W / 2 + amp * Math.sin(y / per + ph);
    const nBlack = 300 + Math.floor(r() * 301);   // 300~600
    const nWhite = 8 + Math.floor(r() * 13);      // 8~20

    function mk(white) {
      const y0 = -30 + r() * (H + 60);
      const side = r() < 0.5 ? -1 : 1;
      const d = white ? 9 + r() * 110 : 3 + Math.pow(r(), 1.5) * (W * 0.56);
      const x0 = partX(y0) + side * d;
      const len = white ? 80 + r() * 70 : 60 + r() * 105;
      let ang = side < 0 ? Math.PI - (0.12 + r() * 0.6) : 0.12 + r() * 0.6;
      ang += (r() - 0.5) * 0.35;
      const bend = (r() - 0.5) * 0.9;
      const a2 = ang + bend * 0.5, a3 = ang + bend;
      return {
        x0, y0,
        x1: x0 + Math.cos(ang) * len * 0.35, y1: y0 + Math.sin(ang) * len * 0.35,
        x2: x0 + Math.cos(a2) * len * 0.7, y2: y0 + Math.sin(a2) * len * 0.7,
        x3: x0 + Math.cos(a3) * len, y3: y0 + Math.sin(a3) * len,
        len, d, white,
        w: white ? 2.0 + r() * 0.7 : 1.3 + r() * 1.1,
        shade: Math.floor(r() * 4),
        need: 80 + r() * 40,          // 뽑히는 당김 거리(px) 80~120
        cut: 1, removed: false, broken: false
      };
    }

    const hairs = [];
    for (let i = 0; i < nWhite; i++) hairs.push(mk(true));
    for (let i = 0; i < nBlack; i++) hairs.push(mk(false));
    hairs.forEach((h, i) => { h.id = i; });

    // 그리는 순서: 검은 머리 65%를 먼저 깔고, 나머지와 흰머리를 섞어서 위에
    const blacks = hairs.slice(nWhite);
    const base = blacks.slice(0, Math.floor(nBlack * 0.65));
    const top = blacks.slice(base.length).concat(hairs.slice(0, nWhite));
    for (let i = top.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [top[i], top[j]] = [top[j], top[i]];
    }
    // 검은 머리 집기 판정용 샘플
    blacks.forEach((h) => { h.pts = samples(h, 0, 1, 6); });

    return { W, H, partX, hairs, whites: hairs.slice(0, nWhite), base, top };
  }

  function buildMass(head) {
    // 가르마에서 멀어질수록 진해지는 부드러운 머리 덩어리 (저해상도로 한 번만)
    const k = 1 / 3;
    const cw = Math.ceil(head.W * k), ch = Math.ceil(head.H * k);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    for (let y = 0; y < ch; y++) {
      const px = head.partX(y / k) * k;
      const grad = g.createLinearGradient(0, 0, cw, 0);
      const stop = (dx) => clamp((px + dx * k) / cw, 0, 1);
      grad.addColorStop(0, 'rgba(30,23,19,0.93)');
      grad.addColorStop(stop(-80), 'rgba(30,23,19,0.88)');
      grad.addColorStop(stop(-26), 'rgba(34,26,21,0.35)');
      grad.addColorStop(stop(-9), 'rgba(34,26,21,0)');
      grad.addColorStop(stop(9), 'rgba(34,26,21,0)');
      grad.addColorStop(stop(26), 'rgba(34,26,21,0.35)');
      grad.addColorStop(stop(80), 'rgba(30,23,19,0.88)');
      grad.addColorStop(1, 'rgba(30,23,19,0.93)');
      g.fillStyle = grad;
      g.fillRect(0, y, cw, 1);
    }
    return c;
  }

  const SHADES = ['#1b1512', '#251d18', '#30261f', '#15100d'];

  /* ======================================================================= */
  class Game {
    constructor(canvas, tissueCanvas, hooks) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.tcv = tissueCanvas;
      this.tctx = tissueCanvas.getContext('2d');
      this.hooks = hooks || {};
      this.fb = S.feedback;
      this.pointers = new Map();
      this.mode = 'idle';
      this.flies = [];
      this.fx = [];
      this.running = false;
      this.dirty = true;
      this.head = null;
      this._loop = this._loop.bind(this);
      this._bind();
    }

    /* ---------- 판 시작/저장 ---------- */
    newRound(opts) {
      const rect = this.cv.getBoundingClientRect();
      const aspect = (rect.height || 800) / (rect.width || 400);
      const H = Math.round(clamp(W * aspect, 760, 1400));
      this.load({ v: 1, mode: opts.mode, seed: opts.seed >>> 0, date: opts.date || null, H, removed: [], cuts: {}, broken: [], tissue: [], stats: { clean: 0, removed: 0, breaks: 0 } });
    }

    load(st) {
      this.st = st;
      this.head = generate(st.seed, st.H);
      this.mass = buildMass(this.head);
      st.removed.forEach((id) => { this.head.hairs[id].removed = true; });
      Object.keys(st.cuts).forEach((id) => { this.head.hairs[id].cut = st.cuts[id]; });
      (st.broken || []).forEach((id) => { this.head.hairs[id].broken = true; });
      this.flies = []; this.fx = []; this.grab = null; this.mode = 'idle';
      this.finishing = null;
      this.resize();
      if (st.cam) { this.s = st.cam.s * this.minS; this.tx = st.cam.x * this.vw; this.ty = st.cam.y * this.vh; this._clampCam(); }
      else this._initCam();
      this._drawTissue();
      this._emitRemain();
      this.dirty = true;
    }

    getState() {
      if (!this.st) return null;
      this.st.cam = { s: this.s / this.minS, x: this.tx / this.vw, y: this.ty / this.vh };
      return this.st;
    }

    get total() { return this.head ? this.head.whites.length : 0; }
    get remain() { return this.head ? this.head.whites.filter((h) => !h.removed).length : 0; }
    get isComplete() { return this.head && this.remain === 0; }

    start() { if (!this.running) { this.running = true; this.dirty = true; requestAnimationFrame(this._loop); } }
    stop() { this.running = false; this._cancelGesture(); }

    /* ---------- 카메라 ---------- */
    resize() {
      const rect = this.cv.getBoundingClientRect();
      this.vw = rect.width || 1; this.vh = rect.height || 1;
      this.dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.cv.width = Math.round(this.vw * this.dpr);
      this.cv.height = Math.round(this.vh * this.dpr);
      const tr = this.tcv.getBoundingClientRect();
      this.tw = tr.width || 1; this.th = tr.height || 1;
      this.tcv.width = Math.round(this.tw * this.dpr);
      this.tcv.height = Math.round(this.th * this.dpr);
      if (this.head) {
        const prevMin = this.minS;
        this.minS = Math.max(this.vw / this.head.W, this.vh / this.head.H);
        if (prevMin && this.s) this.s = this.s * (this.minS / prevMin);
        this._clampCam();
        this._drawTissue();
      }
      this.dirty = true;
    }
    _initCam() {
      this.s = this.minS * 1.35;
      this.tx = this.vw / 2 - (this.head.W / 2) * this.s;
      this.ty = this.vh / 2 - (this.head.H / 2) * this.s;
      this._clampCam();
    }
    _clampCam() {
      this.s = clamp(this.s, this.minS, this.minS * MAX_ZOOM);
      this.tx = clamp(this.tx, this.vw - this.head.W * this.s, 0);
      this.ty = clamp(this.ty, this.vh - this.head.H * this.s, 0);
    }
    toWorld(x, y) { return [(x - this.tx) / this.s, (y - this.ty) / this.s]; }
    toScreen(x, y) { return [x * this.s + this.tx, y * this.s + this.ty]; }
    _zoomAt(sx, sy, ns) {
      const [wx, wy] = this.toWorld(sx, sy);
      this.s = clamp(ns, this.minS, this.minS * MAX_ZOOM);
      this.tx = sx - wx * this.s;
      this.ty = sy - wy * this.s;
      this._clampCam();
      this.dirty = true;
    }
    _animZoom(sx, sy, ns) {
      const [wx, wy] = this.toWorld(sx, sy);
      this.camAnim = { t0: performance.now(), dur: 260, s0: this.s, s1: ns, wx, wy, sx, sy };
    }

    /* ---------- 입력 ---------- */
    _bind() {
      const cv = this.cv;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      cv.addEventListener('pointerdown', (e) => {
        if (!this.head || this.finishing) return;
        e.preventDefault();
        this.fb.unlock();
        try { cv.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
        const [x, y] = pos(e);
        this.pointers.set(e.pointerId, { x, y });
        if (this.hooks.onTouch) this.hooks.onTouch();
        if (this.pointers.size === 1) this._down1(e.pointerId, x, y);
        else if (this.pointers.size === 2) this._startPinch();
      });
      cv.addEventListener('pointermove', (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        e.preventDefault();
        const [x, y] = pos(e);
        const dx = x - p.x, dy = y - p.y;
        p.x = x; p.y = y;
        this._move(e.pointerId, x, y, dx, dy);
      });
      const up = (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.delete(e.pointerId);
        this._up(e.pointerId, e.type === 'pointercancel');
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('lostpointercapture', up);
      cv.addEventListener('wheel', (e) => {
        if (!this.head) return;
        e.preventDefault();
        const [x, y] = pos(e);
        this._zoomAt(x, y, this.s * Math.exp(-e.deltaY * 0.0015));
      }, { passive: false });
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _down1(id, x, y) {
      clearTimeout(this.lpTimer);
      this.mode = 'pending';
      this.press = { id, x0: x, y0: y, t0: performance.now() };
      this.lpTimer = setTimeout(() => this._tryGrab(), LONG_PRESS_MS);
      this.dirty = true;
    }

    _startPinch() {
      clearTimeout(this.lpTimer);
      if (this.mode === 'grab') this._release(true);
      const [a, b] = [...this.pointers.values()];
      this.mode = 'pinch';
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: this.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      const [wx, wy] = this.toWorld(this.pinch.mx, this.pinch.my);
      this.pinch.wx = wx; this.pinch.wy = wy;
      this.press = null;
      this.dirty = true;
    }

    _move(id, x, y, dx, dy) {
      if (this.mode === 'pending') {
        if (Math.hypot(x - this.press.x0, y - this.press.y0) > MOVE_SLOP) {
          clearTimeout(this.lpTimer);
          this.mode = 'pan';
          this.tx += x - this.press.x0 - dx; this.ty += y - this.press.y0 - dy; // 놓친 거리 반영
        }
      }
      if (this.mode === 'pan') {
        this.tx += dx; this.ty += dy; this._clampCam(); this.dirty = true;
      } else if (this.mode === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.s = clamp(this.pinch.s0 * (d / this.pinch.d0), this.minS, this.minS * MAX_ZOOM);
        this.tx = mx - this.pinch.wx * this.s;
        this.ty = my - this.pinch.wy * this.s;
        this._clampCam();
        this.dirty = true;
      } else if (this.mode === 'grab' && this.grab && id === this.grab.pid) {
        this._pull(x, y);
      }
    }

    _up(id, cancelled) {
      clearTimeout(this.lpTimer);
      if (this.mode === 'pending' && this.press && !cancelled) {
        const now = performance.now();
        const lt = this.lastTap;
        if (lt && now - lt.t < 320 && Math.hypot(lt.x - this.press.x0, lt.y - this.press.y0) < 40) {
          const target = this.s < this.minS * 2 ? this.minS * 2.6 : this.minS;
          this._animZoom(this.press.x0, this.press.y0, target);
          this.lastTap = null;
        } else this.lastTap = { t: now, x: this.press.x0, y: this.press.y0 };
      }
      if (this.mode === 'grab' && this.grab && id === this.grab.pid) this._release(false);
      if (this.mode === 'pinch') {
        this.mode = this.pointers.size === 1 ? 'pan' : 'idle';
      } else if (this.pointers.size === 0) {
        if (this.mode !== 'snap') this.mode = 'idle';
      }
      this.press = this.pointers.size ? this.press : null;
      this.dirty = true;
    }

    _cancelGesture() {
      clearTimeout(this.lpTimer);
      if (this.grab) this._release(true);
      this.pointers.clear();
      this.mode = 'idle';
      this.press = null;
    }

    /* ---------- 집기 ---------- */
    _tryGrab() {
      if (this.mode !== 'pending' || !this.press) return;
      const { x0, y0, id } = this.press;
      const [wx, wy] = this.toWorld(x0, y0);
      const tol = PICK_PX / this.s;
      let best = null, bd = Infinity;
      for (const h of this.head.whites) {
        if (h.removed) continue;
        const n = h.cut < 1 ? 6 : 22;
        const tolH = h.cut < 1 ? tol * 1.3 : tol;
        for (let i = 0; i <= n; i++) {
          const t = (h.cut * i) / n;
          const [px, py] = bez(h, t);
          const d = Math.hypot(px - wx, py - wy);
          if (d < tolH && d < bd) { bd = d; best = { h, t }; }
        }
      }
      if (best) {
        const h = best.h;
        // 뿌리 쪽으로 너무 붙어 집으면 살짝 바깥에서 집은 것으로
        const t = Math.max(best.t, Math.min(h.cut, 0.08));
        const [gx, gy] = bez(h, t);
        const [rsx, rsy] = this.toScreen(h.x0, h.y0);
        const [gsx, gsy] = this.toScreen(gx, gy);
        this.grab = {
          h, t, gx, gy, pid: id,
          fx: gx, fy: gy, tension: 0,
          base: Math.hypot(gsx - rsx, gsy - rsy),
          hist: [[performance.now(), 0]], lastBuzz: 0
        };
        this.mode = 'grab';
        this.fb.grab();
        this.dirty = true;
        return;
      }
      // 검은 머리를 집었는지
      const tolB = OOPS_PX / this.s;
      let hitBlack = false;
      for (const h of this.head.top) {
        if (h.white) continue;
        for (const [px, py] of h.pts) {
          if (Math.abs(px - wx) < tolB && Math.abs(py - wy) < tolB) { hitBlack = true; break; }
        }
        if (hitBlack) break;
      }
      if (!hitBlack) {
        for (const h of this.head.base) {
          for (const [px, py] of h.pts) {
            if (Math.abs(px - wx) < tolB && Math.abs(py - wy) < tolB) { hitBlack = true; break; }
          }
          if (hitBlack) break;
        }
      }
      if (hitBlack) {
        this.fx.push({ kind: 'oops', x: x0, y: y0 - 26, t0: performance.now(), dur: 750 });
        this.fb.oops();
      }
      this.mode = 'pan';
      this.press = null;
      this.dirty = true;
    }

    /* ---------- 당기기 ---------- */
    _pull(sx, sy) {
      const g = this.grab, h = g.h;
      const [fx, fy] = this.toWorld(sx, sy);
      g.fx = fx; g.fy = fy;
      const [rsx, rsy] = this.toScreen(h.x0, h.y0);
      const pull = Math.max(0, Math.hypot(sx - rsx, sy - rsy) - g.base);
      const now = performance.now();
      g.hist.push([now, pull]);
      while (g.hist.length > 2 && now - g.hist[0][0] > 110) g.hist.shift();
      g.tension = clamp(pull / h.need, 0, 1);
      if (g.tension > 0.08 && now - g.lastBuzz > 95 - g.tension * 35) {
        this.fb.tension(g.tension);
        g.lastBuzz = now;
      }
      this.dirty = true;
      if (pull >= h.need) this._pluck(sx, sy);
    }

    _speed() {
      const hist = this.grab.hist;
      const a = hist[0], b = hist[hist.length - 1];
      const dt = b[0] - a[0];
      return dt > 0 ? (b[1] - a[1]) / dt : 0; // px/ms
    }

    _pluck(sx, sy) {
      const g = this.grab, h = g.h;
      const v = this._speed();
      // 천천히 당기면 뿌리째. 빠를수록 끊길 확률 ↑ (평균 약 85%)
      let breakP = v < 0.55 ? 0.06 : v < 1.1 ? 0.16 : v < 1.9 ? 0.38 : 0.6;
      if (h.cut < 1) breakP = 0; // 남은 짧은 머리는 항상 뿌리째
      const broken = Math.random() < breakP;

      // 날아갈 조각 (화면 좌표): 집은 점이 손가락 위치에 오도록 원래 모양을 평행이동
      const t0 = broken ? STUB_T : 0;
      const pts = samples(h, t0, h.cut, 16).map(([x, y]) => this.toScreen(x - g.gx + g.fx, y - g.gy + g.fy));
      // 뿌리 쪽 부분을 손가락 쪽으로 살짝 끌어올린 듯 곧게
      const lenWorld = h.len * (h.cut - t0);

      const st = this.st;
      if (broken) {
        h.cut = STUB_T; h.broken = true;
        st.cuts[h.id] = STUB_T;
        if (!st.broken.includes(h.id)) st.broken.push(h.id);
        st.stats.breaks++;
      } else {
        h.removed = true;
        st.removed.push(h.id);
        st.stats.removed++;
        if (!h.broken) st.stats.clean++;
      }
      const item = { l: clamp(22 + lenWorld * 0.42, 14, 82), root: !broken, b: (Math.random() - 0.5) * 0.6 };
      this._launchFly(pts, item, h.w * this.s);
      this.fb.pluck(!broken);
      this.fx.push({ kind: 'pop', x: sx, y: sy, t0: performance.now(), dur: 380, root: !broken });
      if (broken) this.fx.push({ kind: 'note', text: '끊겼어요 · 남은 걸 다시 집어보세요', t0: performance.now(), dur: 1800 });

      this.grab = null;
      this.mode = 'idle';
      this.dirty = true;
      this._emitRemain();
      if (this.hooks.onPluck) this.hooks.onPluck({ root: !broken, speed: v });
      if (!broken && this.hooks.onRemove) this.hooks.onRemove({ clean: !h.broken });
      if (this.hooks.onState) this.hooks.onState(this.getState());
      if (this.isComplete) this._finish();
    }

    _release(instant) {
      const g = this.grab;
      if (!g) return;
      if (instant) { this.grab = null; this.dirty = true; return; }
      this.snap = { g, t0: performance.now(), dur: 200, fx: g.fx, fy: g.fy, ten: g.tension };
      this.grab = null;
      this.mode = this.pointers.size ? 'pan' : 'idle';
      this.dirty = true;
    }

    /* ---------- 휴지 ---------- */
    _slot(i, n) {
      const top = 14, bottom = this.th - 14;
      const gap = Math.min(7, (bottom - top) / Math.max(n - 1, 1));
      const y = n <= 1 ? (top + bottom) / 2 : top + i * gap + Math.max(0, (bottom - top - gap * (n - 1)) / 2);
      return [14, y];
    }
    _launchFly(pts, item, w) {
      const tr = this.tcv.getBoundingClientRect();
      const cr = this.cv.getBoundingClientRect();
      const n = this.st.tissue.length + 1 + this.flies.length;
      const [lx, ly] = this._slot(n - 1, n);
      // 목표: 휴지 위 슬롯의 중앙 (play 캔버스 좌표계)
      const tx = tr.left - cr.left + lx + item.l / 2;
      const ty = tr.top - cr.top + ly;
      const a = pts[0], z = pts[pts.length - 1];
      const ang = Math.atan2(z[1] - a[1], z[0] - a[0]);
      const sl = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1;
      const cx = (a[0] + z[0]) / 2, cy = (a[1] + z[1]) / 2;
      this.flies.push({ pts, cx, cy, tx, ty, ang, sc: item.l / sl, item, t0: performance.now(), dur: 720, w });
    }
    _drawTissue() {
      const g = this.tctx, d = this.dpr;
      if (!g || !this.st) return;
      g.setTransform(d, 0, 0, d, 0, 0);
      g.clearRect(0, 0, this.tw, this.th);
      const items = this.st.tissue;
      const n = items.length;
      items.forEach((it, i) => {
        const [x, y] = this._slot(i, n);
        drawLaidHair(g, x, y, it, 1);
      });
    }

    /* ---------- 완료 ---------- */
    _finish() {
      this.finishing = { t0: performance.now() + 650, dur: 1700, done: false };
      this._cancelGesture();
    }

    _emitRemain() {
      if (this.hooks.onRemain) this.hooks.onRemain(this.remain, this.total);
    }

    /* ---------- 루프 ---------- */
    _loop(now) {
      if (!this.running) return;
      if (this.camAnim) {
        const a = this.camAnim, p = clamp((now - a.t0) / a.dur, 0, 1), e = easeOut(p);
        this.s = clamp(lerp(a.s0, a.s1, e), this.minS, this.minS * MAX_ZOOM);
        this.tx = a.sx - a.wx * this.s; this.ty = a.sy - a.wy * this.s;
        this._clampCam();
        if (p >= 1) this.camAnim = null;
        this.dirty = true;
      }
      const animating = this.flies.length || this.fx.length || this.snap || this.camAnim || this.finishing || this.mode === 'pending' || this.grab;
      if (this.dirty || animating) { this._draw(now); this.dirty = false; }
      requestAnimationFrame(this._loop);
    }

    _draw(now) {
      const ctx = this.ctx, head = this.head, d = this.dpr;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.fillStyle = '#e8c7b0';
      ctx.fillRect(0, 0, this.vw, this.vh);
      if (!head) return;
      const progress = this.total ? 1 - this.remain / this.total : 0;

      ctx.save();
      ctx.translate(this.tx, this.ty);
      ctx.scale(this.s, this.s);

      // 두피
      const sg = ctx.createRadialGradient(head.W / 2, head.H * 0.42, 20, head.W / 2, head.H * 0.5, head.H * 0.75);
      sg.addColorStop(0, '#f3d9c6');
      sg.addColorStop(1, '#e3bea6');
      ctx.fillStyle = sg;
      ctx.fillRect(-40, -40, head.W + 80, head.H + 80);
      // 머리 덩어리
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.mass, 0, 0, head.W, head.H);

      // 모공 (가르마 근처)
      ctx.fillStyle = 'rgba(96,70,58,0.55)';
      ctx.beginPath();
      for (const h of head.base) if (h.d < 55) { ctx.moveTo(h.x0 + 1, h.y0); ctx.arc(h.x0, h.y0, h.w * 0.55, 0, TAU); }
      for (const h of head.top) if (!h.white && h.d < 55) { ctx.moveTo(h.x0 + 1, h.y0); ctx.arc(h.x0, h.y0, h.w * 0.55, 0, TAU); }
      ctx.fill();

      ctx.lineCap = 'round';
      // 바닥층: 색별로 묶어서 한 번에
      for (let k = 0; k < SHADES.length; k++) {
        ctx.strokeStyle = SHADES[k];
        for (const wv of [1.5, 2.1]) {
          ctx.lineWidth = wv;
          ctx.beginPath();
          for (const h of head.base) if (h.shade === k && (h.w < 1.85) === (wv === 1.5)) pathHair(ctx, h);
          ctx.stroke();
        }
      }
      // 윗층 (흰머리 섞임)
      const grabbed = this.grab ? this.grab.h : this.snap ? this.snap.g.h : null;
      for (const h of head.top) {
        if (h.removed || h === grabbed) continue;
        if (h.white) this._drawWhite(ctx, h);
        else {
          ctx.strokeStyle = SHADES[h.shade];
          ctx.lineWidth = h.w;
          ctx.beginPath(); pathHair(ctx, h); ctx.stroke();
        }
      }

      // 윤기: 흰머리가 줄수록 진해지는 결 방향 하이라이트
      if (progress > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.05 + progress * 0.16;
        ctx.strokeStyle = '#8f7a6a';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (const h of head.base) if (h.shade < 2) pathHair(ctx, h);
        ctx.stroke();
        ctx.restore();
      }

      // 당기는 중 / 되돌아가는 중
      if (this.grab) this._drawPulled(ctx, this.grab.h, this.grab.t, this.grab.gx, this.grab.gy, this.grab.fx, this.grab.fy, this.grab.tension);
      else if (this.snap) {
        const sn = this.snap, p = clamp((now - sn.t0) / sn.dur, 0, 1), e = easeOut(p);
        const g = sn.g;
        // 살짝 튕기는 느낌
        const k = 1 - e + Math.sin(e * Math.PI) * -0.08;
        this._drawPulled(ctx, g.h, g.t, g.gx, g.gy, lerp(g.gx, sn.fx, k), lerp(g.gy, sn.fy, k), sn.ten * (1 - e));
        if (p >= 1) this.snap = null;
      }
      ctx.restore();

      // 핀셋
      if (this.grab) this._drawTweezers(ctx, ...this.toScreen(this.grab.fx, this.grab.fy), this.grab.tension);

      // 길게 누르는 중 표시
      if (this.mode === 'pending' && this.press) {
        const p = clamp((now - this.press.t0 - 60) / (LONG_PRESS_MS - 60), 0, 1);
        if (p > 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(this.press.x0, this.press.y0, 22, -Math.PI / 2, -Math.PI / 2 + p * TAU);
          ctx.stroke();
        }
      }

      this._drawFlies(ctx, now);
      this._drawFx(ctx, now);
      if (this.finishing) this._drawFinish(ctx, now);
    }

    _drawWhite(ctx, h) {
      ctx.strokeStyle = 'rgba(40,28,22,0.35)';
      ctx.lineWidth = h.w + 1.1;
      ctx.beginPath(); pathHair(ctx, h); ctx.stroke();
      ctx.strokeStyle = '#efebe3';
      ctx.lineWidth = h.w;
      ctx.beginPath(); pathHair(ctx, h); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = h.w * 0.35;
      ctx.beginPath(); pathHair(ctx, h); ctx.stroke();
      if (h.cut < 1) { // 끊긴 끝
        const [ex, ey] = bez(h, h.cut);
        ctx.fillStyle = '#d9d3c8';
        ctx.beginPath(); ctx.arc(ex, ey, h.w * 0.6, 0, TAU); ctx.fill();
      }
    }

    _drawPulled(ctx, h, t, gx, gy, fx, fy, ten) {
      // 뿌리가 당겨지며 두피가 살짝 솟음
      ctx.fillStyle = `rgba(250,226,210,${0.5 + ten * 0.4})`;
      ctx.beginPath(); ctx.ellipse(h.x0, h.y0, 1.6 + ten * 3.2, 1.3 + ten * 2.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(160,110,90,${0.15 + ten * 0.3})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // 뿌리→집은 점: 원래 곡선을 손가락 쪽으로, 장력에 따라 곧게
      const left = samples(h, 0, t, 12);
      const ox = fx - gx, oy = fy - gy;
      const pts = left.map(([x, y], i) => {
        const u = i / 12;
        const sx = lerp(h.x0, fx, u), sy = lerp(h.y0, fy, u); // 직선
        const cx = x + ox * u, cy = y + oy * u;               // 휘어진 채 따라옴
        const k = clamp(ten * 1.2 + 0.25, 0, 1);
        return [lerp(cx, sx, k), lerp(cy, sy, k)];
      });
      const right = h.cut > t ? samples(h, t, h.cut, 12).map(([x, y]) => [x + ox, y + oy]) : [];
      const all = pts.concat(right.slice(1));
      const stroke = (style, w) => {
        ctx.strokeStyle = style; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(all[0][0], all[0][1]);
        for (let i = 1; i < all.length; i++) ctx.lineTo(all[i][0], all[i][1]);
        ctx.stroke();
      };
      ctx.lineJoin = 'round';
      stroke('rgba(40,28,22,0.35)', h.w + 1.1);
      stroke('#f3efe8', h.w);
      stroke('rgba(255,255,255,0.95)', h.w * 0.35);
    }

    _drawTweezers(ctx, x, y, ten) {
      const ang = -Math.PI / 4 - 0.2; // 오른쪽 위에서 들어오는 핀셋
      const L = 78, open = 7 - ten * 3;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.lineCap = 'round';
      for (const sgn of [-1, 1]) {
        const grad = ctx.createLinearGradient(0, 0, L, 0);
        grad.addColorStop(0, '#9aa3ab');
        grad.addColorStop(0.5, '#e6eaee');
        grad.addColorStop(1, '#b4bcc3');
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(2, sgn * 1.2 + 2); ctx.lineTo(L, sgn * open + 2); ctx.stroke();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3.6;
        ctx.beginPath(); ctx.moveTo(2, sgn * 1.2); ctx.lineTo(L, sgn * open); ctx.stroke();
      }
      ctx.restore();
    }

    _drawFlies(ctx, now) {
      const keep = [];
      for (const f of this.flies) {
        const p = clamp((now - f.t0) / f.dur, 0, 1);
        const pop = clamp(p / 0.18, 0, 1);  // 먼저 톡 튀어 오르고
        const fly = easeInOut(clamp((p - 0.12) / 0.88, 0, 1)); // 휴지로
        const cx = lerp(f.cx, f.tx, fly);
        const cy = lerp(f.cy, f.ty, fly) - Math.sin(fly * Math.PI) * 50 - (1 - fly) * easeOut(pop) * 10;
        const rot = -f.ang * fly;
        const sc = lerp(1, f.sc, fly);
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc, sc);
        ctx.translate(-f.cx, -f.cy);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const line = (style, w) => {
          ctx.strokeStyle = style; ctx.lineWidth = w / sc;
          ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]);
          for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
          ctx.stroke();
        };
        const w = lerp(f.w, 1.8, fly);
        line('rgba(40,28,22,0.3)', w + 1.2);
        line('#f4f0e9', w);
        if (f.item.root) { // 하얀 모근
          const [rx, ry] = f.pts[0];
          const bx = Math.cos(f.ang), by = Math.sin(f.ang);
          ctx.fillStyle = '#fffdf8';
          ctx.strokeStyle = 'rgba(120,95,80,0.4)';
          ctx.lineWidth = 0.8 / sc;
          ctx.beginPath();
          const brx = lerp(w * 1.4, 2.6, fly) / sc, bry = lerp(w * 0.95, 1.8, fly) / sc;
          ctx.ellipse(rx + bx * brx * 0.5, ry + by * brx * 0.5, brx, bry, f.ang, 0, TAU);
          ctx.fill(); ctx.stroke();
        }
        ctx.restore();
        if (p < 1) keep.push(f);
        else { this.st.tissue.push(f.item); this._drawTissue(); }
      }
      this.flies = keep;
    }

    _drawFx(ctx, now) {
      const keep = [];
      for (const e of this.fx) {
        const p = clamp((now - e.t0) / e.dur, 0, 1);
        if (e.kind === 'oops') {
          ctx.globalAlpha = 1 - p;
          ctx.font = '600 20px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(60,40,30,0.5)';
          ctx.lineWidth = 3;
          ctx.strokeText('앗', e.x, e.y - p * 18);
          ctx.fillText('앗', e.x, e.y - p * 18);
          ctx.globalAlpha = 1;
        } else if (e.kind === 'pop') {
          const rr = 10 + easeOut(p) * (e.root ? 34 : 22);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - p) * 0.8})`;
          ctx.lineWidth = 2 * (1 - p) + 0.5;
          ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, TAU); ctx.stroke();
        } else if (e.kind === 'note') {
          const a = p < 0.1 ? p / 0.1 : p > 0.8 ? (1 - p) / 0.2 : 1;
          ctx.globalAlpha = a;
          ctx.font = '500 14px system-ui, sans-serif';
          ctx.textAlign = 'center';
          const tw = ctx.measureText(e.text).width + 28;
          const y = this.vh - 150;
          ctx.fillStyle = 'rgba(40,30,25,0.72)';
          roundRect(ctx, this.vw / 2 - tw / 2, y - 18, tw, 34, 17); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(e.text, this.vw / 2, y + 4);
          ctx.globalAlpha = 1;
        }
        if (p < 1) keep.push(e);
      }
      this.fx = keep;
    }

    _drawFinish(ctx, now) {
      const f = this.finishing;
      if (now < f.t0) return;
      const p = clamp((now - f.t0) / f.dur, 0, 1);
      // 대각선으로 지나가는 윤기
      const span = this.vw + this.vh;
      const c = lerp(-0.3, 1.3, easeInOut(p)) * span;
      const g = ctx.createLinearGradient(c - 160, c - 160 - this.vw * 0, c + 160, c + 160);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,246,230,0.42)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.restore();
      // 반짝이
      if (!f.sparks) {
        f.sparks = Array.from({ length: 18 }, () => ({ x: Math.random() * this.vw, y: Math.random() * this.vh, o: Math.random() * 0.7, r: 3 + Math.random() * 6 }));
      }
      for (const s of f.sparks) {
        const q = clamp((p - s.o * 0.8) / 0.3, 0, 1);
        const a = Math.sin(q * Math.PI);
        if (a <= 0) continue;
        drawSpark(ctx, s.x, s.y, s.r * (0.6 + a * 0.6), a);
      }
      if (p >= 1 && !f.done) {
        f.done = true;
        this.fb.complete();
        if (this.hooks.onComplete) this.hooks.onComplete(Object.assign({}, this.st.stats, { total: this.total }));
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawSpark(ctx, x, y, r, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }
  // 휴지 위에 가지런히 놓인 흰머리
  function drawLaidHair(g, x, y, it, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.lineCap = 'round';
    const ex = x + it.l, cy = y + it.b * 6;
    const path = () => { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + ex) / 2, cy, ex, y + it.b * 2); };
    g.strokeStyle = 'rgba(90,80,100,0.35)'; g.lineWidth = 2.6; path(); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.6; path(); g.stroke();
    if (it.root) {
      g.fillStyle = '#ffffff';
      g.strokeStyle = 'rgba(90,80,100,0.45)';
      g.lineWidth = 0.8;
      g.beginPath(); g.ellipse(x - 1, y, 2.6, 1.8, 0, 0, TAU); g.fill(); g.stroke();
    }
    g.restore();
  }
  S.drawLaidHair = drawLaidHair;

  S.Game = Game;
})();
