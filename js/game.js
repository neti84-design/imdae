/* 쏙 — 머리 화면: 생성, 찰랑이는 머리카락 물리, 그리기,
   제스처(뒤적이기·이동·확대·집기·당기기), 뽑기 판정 */
(function () {
  'use strict';
  const S = (window.Ssok = window.Ssok || {});

  const W = 600;                 // 월드 폭 (높이는 화면 비율에 맞춰 생성)
  const TAU = Math.PI * 2;
  const LONG_PRESS_MS = 150;     // 처음 꾹 누르고 있으면 집기
  const STILL_MS = 200;          // 뒤적이다 이만큼 멈추면 집기
  const PINCH_WINDOW_MS = 140;   // 두 손가락이 이 안에 같이 닿으면 이동·확대
  const HOLD_PX = 38;            // 대고 있는 손가락이 머리카락을 막는 반경(화면 px)
  const MOVE_SLOP = 9;           // 이 이상 움직이면 뒤적이기
  const PICK_PX = 34;            // 흰머리 집기 허용 반경(화면 px)
  const OOPS_PX = 9;             // 검은 머리 "앗" 판정 반경
  const BRUSH_PX = 74;           // 손가락이 머리카락을 미는 반경(화면 px)
  const MAX_ZOOM = 5.5;          // 최소 배율 대비 최대 배율
  const STUB_T = 0.16;           // 끊겼을 때 남는 길이 비율

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

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
  function generate(seed, H, styleId) {
    const st = S.styleById(styleId);
    const r = mulberry32(seed);
    const g = st.setup(r, W, H);
    const nBlack = st.black[0] + Math.floor(r() * (st.black[1] - st.black[0] + 1));
    const nWhite = 8 + Math.floor(r() * 13);   // 8~20

    function build(p, dd, white) {
      const ang = dd.ang, a0 = dd.a0 != null ? dd.a0 : ang, len = dd.len, bend = dd.bend, curl = dd.curl || 0;
      const px = -Math.sin(ang), py = Math.cos(ang);
      const x0 = p.x0, y0 = p.y0;
      const h = {
        x0, y0,
        bx1: x0 + Math.cos(a0) * len * 0.35 + px * curl * len * 0.5,
        by1: y0 + Math.sin(a0) * len * 0.35 + py * curl * len * 0.5,
        bx2: x0 + Math.cos(ang + bend * 0.5) * len * 0.7 - px * curl * len * 0.5,
        by2: y0 + Math.sin(ang + bend * 0.5) * len * 0.7 - py * curl * len * 0.5,
        bx3: x0 + Math.cos(ang + bend) * len,
        by3: y0 + Math.sin(ang + bend) * len,
        ang, a0, len, bend, curl, d: p.d, white,
        w: white ? Math.max(dd.w || 0, 1.9) + r() * 0.6 : dd.w || 1.3 + r() * 1.1,
        shade: Math.floor(r() * 4),
        need: 45 + r() * 25,                // 뽑히는 당김 거리(px) 45~70
        ph: r() * TAU,
        k: white ? 110 + r() * 40 : 45 + r() * 35 - Math.min(len, 300) * 0.06,  // 흰머리는 뻣뻣
        give: white ? 0.3 : 1,              // 손가락에 밀리는 정도
        ox: 0, oy: 0, vx: 0, vy: 0, rx: 0, ry: 0,
        cut: 1, removed: false, broken: false, hidden: false
      };
      h.x1 = h.bx1; h.y1 = h.by1; h.x2 = h.bx2; h.y2 = h.by2; h.x3 = h.bx3; h.y3 = h.by3;
      const xs = [x0, h.bx1, h.bx2, h.bx3], ys = [y0, h.by1, h.by2, h.by3];
      const m = len * 0.85;
      h.bb = [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
      return h;
    }
    const make = (white) => { const p = st.root(g, r, W, H, white); return build(p, st.dir(g, r, p, white), white); };

    const whites = [], blacks = [], covers = [];
    for (let i = 0; i < nWhite; i++) { const h = make(true); h.hidden = r() < st.hidden * 0.5; whites.push(h); }
    for (let i = 0; i < nBlack; i++) blacks.push(make(false));
    // 숨은 흰머리는 검은 머리 몇 가닥이 위를 덮는다 → 뒤적여야 보임
    for (const w of whites) {
      if (!w.hidden) continue;
      const n = 5 + Math.floor(r() * 4);
      const px = -Math.sin(w.ang), py = Math.cos(w.ang);
      for (let i = 0; i < n; i++) {
        const s = (r() - 0.5) * 14, a = (r() - 0.35) * 12;
        const p = { x0: w.x0 + px * s + Math.cos(w.ang) * a, y0: w.y0 + py * s + Math.sin(w.ang) * a, d: w.d };
        covers.push(build(p, {
          ang: w.ang + (r() - 0.5) * 0.22, a0: w.a0 + (r() - 0.5) * 0.2,
          len: w.len * (0.95 + r() * 0.35), bend: w.bend + (r() - 0.5) * 0.3, curl: w.curl
        }, false));
      }
    }
    const hairs = whites.concat(blacks, covers);
    hairs.forEach((h, i) => { h.id = i; });

    const base = blacks.slice(0, Math.floor(nBlack * 0.65));
    const top = blacks.slice(base.length).concat(whites.filter((w) => !w.hidden));
    for (let i = top.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [top[i], top[j]] = [top[j], top[i]];
    }
    return {
      W, H, style: st, g, hairs, whites, base, top, covers, topBlack: top.filter((h) => !h.white),
      hiddenWhites: whites.filter((w) => w.hidden),
      blacks: blacks.concat(covers)
    };
  }

  function buildMass(head) {
    // 두피가 보이는 곳(가르마·가마)에서 멀어질수록 진해지는 머리 덩어리, 저해상도로 한 번만
    const k = 1 / 3;
    const cw = Math.ceil(head.W * k), ch = Math.ceil(head.H * k);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const img = g.createImageData(cw, ch);
    const st = head.style;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const d = st.scalpDist(head.g, x / k, y / k);
        const a = smooth(2, 26, d) * 0.85;
        const i = (y * cw + x) * 4;
        img.data[i] = 30; img.data[i + 1] = 23; img.data[i + 2] = 19; img.data[i + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const SHADES = ['#1b1512', '#251d18', '#30261f', '#15100d'];

  function drawWhite(ctx, h) {
    ctx.strokeStyle = 'rgba(40,28,22,0.35)';
    ctx.lineWidth = h.w + 1.1;
    ctx.beginPath(); pathHair(ctx, h); ctx.stroke();
    ctx.strokeStyle = '#efebe3';
    ctx.lineWidth = h.w;
    ctx.beginPath(); pathHair(ctx, h); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = h.w * 0.35;
    ctx.beginPath(); pathHair(ctx, h); ctx.stroke();
    if (h.cut < 1) {
      const [ex, ey] = bez(h, h.cut);
      ctx.fillStyle = '#d9d3c8';
      ctx.beginPath(); ctx.arc(ex, ey, h.w * 0.6, 0, TAU); ctx.fill();
    }
  }

  // 머리 한 장 그리기 (게임 화면과 스타일 미리보기가 같이 씀). 월드 좌표계에서 호출
  function drawHead(ctx, head, mass, skip, progress) {
    const sg = ctx.createRadialGradient(head.W / 2, head.H * 0.42, 20, head.W / 2, head.H * 0.5, head.H * 0.75);
    sg.addColorStop(0, '#f3d9c6');
    sg.addColorStop(1, '#e3bea6');
    ctx.fillStyle = sg;
    ctx.fillRect(-40, -40, head.W + 80, head.H + 80);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mass, 0, 0, head.W, head.H);

    // 모공 (두피가 보이는 곳)
    ctx.fillStyle = 'rgba(96,70,58,0.55)';
    ctx.beginPath();
    for (const h of head.blacks) if (h.d < 22) { ctx.moveTo(h.x0 + 1, h.y0); ctx.arc(h.x0, h.y0, h.w * 0.55, 0, TAU); }
    ctx.fill();

    ctx.lineCap = 'round';
    // 바닥층: 색·굵기별로 묶어서 한 번에
    for (let k = 0; k < SHADES.length; k++) {
      ctx.strokeStyle = SHADES[k];
      for (const thin of [true, false]) {
        ctx.lineWidth = thin ? 1.5 : 2.1;
        ctx.beginPath();
        for (const h of head.base) if (h.shade === k && (h.w < 1.85) === thin) pathHair(ctx, h);
        ctx.stroke();
      }
    }
    // 윗층 검은 머리, 그 위에 드러난 흰머리
    for (let k = 0; k < SHADES.length; k++) {
      ctx.strokeStyle = SHADES[k];
      for (const thin of [true, false]) {
        ctx.lineWidth = thin ? 1.4 : 2.0;
        ctx.beginPath();
        for (const h of head.topBlack) if (h.shade === k && (h.w < 1.85) === thin) pathHair(ctx, h);
        ctx.stroke();
      }
    }
    for (const h of head.top) if (h.white && !h.removed && h !== skip) drawWhite(ctx, h);
    // 숨은 흰머리와 그 위를 덮은 검은 머리
    for (const h of head.hiddenWhites) if (!h.removed && h !== skip) drawWhite(ctx, h);
    for (let k = 0; k < SHADES.length; k++) {
      ctx.strokeStyle = SHADES[k];
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      for (const h of head.covers) if (h.shade === k) pathHair(ctx, h);
      ctx.stroke();
    }
    // 윤기: 흰머리가 줄수록 진해지는 결 방향 하이라이트
    const gloss = head.style.gloss || 1;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(0.5, (0.04 + progress * 0.16) * gloss);
    ctx.strokeStyle = '#8f7a6a';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const h of head.base) if (h.shade < 2) pathHair(ctx, h);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- 스타일 미리보기 ---------- */
  const thumbCache = {};
  S.renderThumb = function (canvas, styleId) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = canvas.clientWidth || 56, ch = canvas.clientHeight || 56;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    if (!thumbCache[styleId]) {
      const head = generate(20241118, 1000, styleId);
      thumbCache[styleId] = { head, mass: buildMass(head) };
    }
    const { head, mass } = thumbCache[styleId];
    const f = head.g.focus || [];
    const fx = f[0] != null ? f[0] : head.W / 2, fy = f[1] != null ? f[1] : head.H / 2;
    const sc = cw / 230;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(cw / 2 - fx * sc, ch / 2 - fy * sc);
    ctx.scale(sc, sc);
    drawHead(ctx, head, mass, null, 0.3);
  };

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
      this.head = null;
      this.lastT = 0;
      this._loop = this._loop.bind(this);
      this._bind();
    }

    /* ---------- 판 시작/저장 ---------- */
    newRound(opts) {
      const rect = this.cv.getBoundingClientRect();
      const aspect = (rect.height || 800) / (rect.width || 400);
      const H = Math.round(clamp(W * aspect, 760, 1400));
      this.load({ v: 1, mode: opts.mode, style: opts.style || 'part', seed: opts.seed >>> 0, date: opts.date || null, H, removed: [], cuts: {}, broken: [], tissue: [], stats: { clean: 0, removed: 0, breaks: 0 } });
    }

    load(st) {
      st.style = st.style || 'part';
      this.st = st;
      this.head = generate(st.seed, st.H, st.style);
      this.mass = buildMass(this.head);
      st.removed.forEach((id) => { this.head.hairs[id].removed = true; });
      Object.keys(st.cuts).forEach((id) => { this.head.hairs[id].cut = st.cuts[id]; });
      (st.broken || []).forEach((id) => { this.head.hairs[id].broken = true; });
      this.flies = []; this.fx = []; this.grab = null; this.snap = null; this.mode = 'idle';
      this.finishing = null;
      this.resize();
      if (st.cam) { this.s = st.cam.s * this.minS; this.tx = st.cam.x * this.vw; this.ty = st.cam.y * this.vh; this._clampCam(); }
      else this._initCam();
      this._drawTissue();
      this._emitRemain();
    }

    getState() {
      if (!this.st) return null;
      this.st.cam = { s: this.s / this.minS, x: this.tx / this.vw, y: this.ty / this.vh };
      return this.st;
    }

    get total() { return this.head ? this.head.whites.length : 0; }
    get remain() { return this.head ? this.head.whites.filter((h) => !h.removed).length : 0; }
    get isComplete() { return this.head && this.remain === 0; }
    get style() { return this.st ? this.st.style : null; }

    start() { if (!this.running) { this.running = true; this.lastT = 0; requestAnimationFrame(this._loop); } }
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
    }
    _initCam() {
      const f = this.head.g.focus || [];
      const fx = f[0] != null ? f[0] : this.head.W / 2, fy = f[1] != null ? f[1] : this.head.H / 2;
      this.s = this.minS * 1.35;
      this.tx = this.vw / 2 - fx * this.s;
      this.ty = this.vh / 2 - fy * this.s;
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
    }
    _animZoom(sx, sy, ns) {
      const [wx, wy] = this.toWorld(sx, sy);
      this.camAnim = { t0: performance.now(), dur: 260, s0: this.s, s1: ns, wx, wy, sx, sy };
    }

    /* ---------- 입력 ----------
       손가락마다 따로 동작한다 (여러 손가락으로 시간차를 두고 대도 됨)
       - 쓸기: 머리카락 뒤적이기. 대고 있는 동안 그 자리는 갈라진 채 유지
       - 꾹 누르기 / 뒤적이다 멈추기: 흰머리를 핀셋으로 집기 (한 번에 한 가닥)
       - 두 손가락을 거의 동시에 대면: 이동·확대
       마우스: 오른쪽 버튼·Shift 드래그로 이동, 휠로 확대 */
    _bind() {
      const cv = this.cv;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      cv.addEventListener('pointerdown', (e) => {
        if (!this.head || this.finishing) return;
        e.preventDefault();
        this.fb.unlock();
        try { cv.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
        const [x, y] = pos(e);
        const now = performance.now();
        const p = { id: e.pointerId, x, y, t: now, tDown: now, mode: 'pending', x0: x, y0: y, t0: now, timer: 0 };
        this.pointers.set(e.pointerId, p);
        if (this.hooks.onTouch) this.hooks.onTouch();
        if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || e.shiftKey)) { p.mode = 'pan'; return; }
        if (this.pinchIds) { p.mode = 'none'; return; }
        const buddy = [...this.pointers.values()].find((q) => q !== p && q.mode === 'pending' && now - q.tDown < PINCH_WINDOW_MS);
        if (buddy && !this.grab) { this._startPinch(buddy, p); return; }
        this._arm(p, LONG_PRESS_MS, false);
      });
      cv.addEventListener('pointermove', (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        e.preventDefault();
        const [x, y] = pos(e);
        const now = performance.now();
        const dx = x - p.x, dy = y - p.y, dt = Math.max(8, now - p.t) / 1000;
        p.x = x; p.y = y; p.t = now;
        this._move(p, dx, dy, dt);
      });
      const up = (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        this.pointers.delete(e.pointerId);
        this._up(p, e.type === 'pointercancel');
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

    // 이 손가락이 지금 자리에서 ms 동안 머물면 집기 시도
    _arm(p, ms, quiet) {
      clearTimeout(p.timer);
      p.x0 = p.x; p.y0 = p.y; p.t0 = performance.now();
      p.timer = setTimeout(() => this._tryGrab(p, quiet), ms);
    }

    _startPinch(a, b) {
      clearTimeout(a.timer); clearTimeout(b.timer);
      a.mode = b.mode = 'pinch';
      this.pinchIds = [a.id, b.id];
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: this.s };
      const [wx, wy] = this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinch.wx = wx; this.pinch.wy = wy;
    }

    _move(p, dx, dy, dt) {
      const x = p.x, y = p.y;
      if (p.mode === 'pending' && Math.hypot(x - p.x0, y - p.y0) > MOVE_SLOP) {
        p.mode = 'rummage';
        if (this.hooks.onRummage) this.hooks.onRummage();
        this._brush(p.x0, p.y0, x - p.x0 - dx, y - p.y0 - dy, dt);
        this._arm(p, STILL_MS, true);
      }
      if (p.mode === 'rummage') {
        this._brush(x, y, dx, dy, dt);
        if (Math.hypot(x - p.x0, y - p.y0) > MOVE_SLOP) this._arm(p, STILL_MS, true);
      } else if (p.mode === 'pan') {
        this.tx += dx; this.ty += dy; this._clampCam();
      } else if (p.mode === 'pinch' && this.pinchIds) {
        const a = this.pointers.get(this.pinchIds[0]), b = this.pointers.get(this.pinchIds[1]);
        if (!a || !b) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.s = clamp(this.pinch.s0 * (d / this.pinch.d0), this.minS, this.minS * MAX_ZOOM);
        this.tx = mx - this.pinch.wx * this.s;
        this.ty = my - this.pinch.wy * this.s;
        this._clampCam();
      } else if (p.mode === 'grab' && this.grab && this.grab.pid === p.id) {
        this._pull(x, y);
      }
    }

    _up(p, cancelled) {
      clearTimeout(p.timer);
      if (p.mode === 'pending' && !cancelled && this.pointers.size === 0) {
        const now = performance.now();
        const lt = this.lastTap;
        if (lt && now - lt.t < 320 && Math.hypot(lt.x - p.x0, lt.y - p.y0) < 40) {
          const target = this.s < this.minS * 2 ? this.minS * 2.6 : this.minS;
          this._animZoom(p.x0, p.y0, target);
          this.lastTap = null;
        } else this.lastTap = { t: now, x: p.x0, y: p.y0 };
      }
      if (this.grab && this.grab.pid === p.id) this._release(false);
      if (p.mode === 'pinch') {
        // 확대하던 손가락 중 하나를 떼면 남은 손가락은 이동만 (실수로 뒤적이지 않게)
        this.pinchIds = null;
        for (const q of this.pointers.values()) if (q.mode === 'pinch') q.mode = 'pan';
      }
    }

    _cancelGesture() {
      for (const p of this.pointers.values()) clearTimeout(p.timer);
      if (this.grab) this._release(true);
      this.pointers.clear();
      this.pinchIds = null;
    }

    /* ---------- 뒤적이기: 손가락 근처 머리카락을 민다 ---------- */
    _brush(sx, sy, dx, dy, dt) {
      if (!dx && !dy) return;
      const [wx, wy] = this.toWorld(sx, sy);
      const dwx = dx / this.s, dwy = dy / this.s;
      const R = clamp(BRUSH_PX / this.s, 10, 90), R2 = R * R;
      let fvx = dwx / dt, fvy = dwy / dt;
      const fv = Math.hypot(fvx, fvy);
      if (fv > 1400) { fvx *= 1400 / fv; fvy *= 1400 / fv; }
      const skip = this.grab ? this.grab.h : null;
      let moved = 0;
      for (const h of this.head.hairs) {
        if (h.removed || h === skip) continue;
        const bb = h.bb;
        if (wx < bb[0] - R || wx > bb[2] + R || wy < bb[1] - R || wy > bb[3] + R) continue;
        // 머리카락 전체를 따라 촘촘히 재서 손가락이 사이로 빠지지 않게
        let d2 = Infinity, bt = 1;
        const n = Math.min(14, 4 + Math.ceil(h.len / 22));
        for (let i = 1; i <= n; i++) {
          const t = 0.12 + (0.88 * i) / n;
          const [px, py] = bez(h, t);
          const e = (px - wx) * (px - wx) + (py - wy) * (py - wy);
          if (e < d2) { d2 = e; bt = t; }
        }
        if (d2 >= R2) continue;
        let f = 1 - Math.sqrt(d2) / R;
        f = Math.pow(f, 1.1) * h.give;
        // 닿은 지점이 손가락을 따라가도록 (뿌리 쪽을 건드리면 끝은 더 크게 움직임)
        const u = 1 - bt, wt = 0.3 * u * u * bt + 1.35 * u * bt * bt + bt * bt * bt;
        const gain = Math.min(1.15 / Math.max(wt, 0.05), 3.5);
        h.ox += dwx * f * gain; h.oy += dwy * f * gain;
        h.vx += (fvx - h.vx) * f * 0.3; h.vy += (fvy - h.vy) * f * 0.3;
        const m = Math.hypot(h.ox, h.oy), lim = h.len * 1.1;
        if (m > lim) { h.ox *= lim / m; h.oy *= lim / m; }
        // 쓸린 쪽으로 결이 잠시 남는다 (갈라진 채 찰랑이다 천천히 돌아옴)
        h.rx += (h.ox - h.rx) * Math.min(1, f * 1.2); h.ry += (h.oy - h.ry) * Math.min(1, f * 1.2);
        moved += f;
      }
      if (moved > 0.5) this.fb.rustle(clamp(fv / 900, 0, 1));
    }

    /* ---------- 찰랑: 스프링 + 잔잔한 바람결 ---------- */
    _physics(dt, now) {
      const skip = this.grab ? this.grab.h : this.snap ? this.snap.g.h : null;
      const t = now * 0.001;
      // 대고 있는 손가락들: 머리카락이 넘어오지 못하게 막는다 → 여러 손가락으로 가르기
      const fingers = [];
      for (const p of this.pointers.values()) {
        if (p.mode === 'pending' || p.mode === 'rummage') fingers.push(this.toWorld(p.x, p.y));
      }
      const Ro = clamp(HOLD_PX / this.s, 6, 60);
      for (const h of this.head.hairs) {
        if (h.removed || h === skip) continue;
        for (const [fx, fy] of fingers) {
          const bb = h.bb;
          if (fx < bb[0] - Ro || fx > bb[2] + Ro || fy < bb[1] - Ro || fy > bb[3] + Ro) continue;
          const pts = [[h.x2, h.y2, 0.45], [(h.x2 + h.x3) / 2, (h.y2 + h.y3) / 2, 0.72], [h.x3, h.y3, 1]];
          for (const [px, py, w] of pts) {
            const ddx = px - fx, ddy = py - fy, d = Math.hypot(ddx, ddy);
            if (d >= Ro) continue;
            let nx, ny;
            if (d > 0.01) { nx = ddx / d; ny = ddy / d; } else { nx = -Math.sin(h.ang); ny = Math.cos(h.ang); }
            const push = ((Ro - d) / w) * 0.5;
            h.ox += nx * push; h.oy += ny * push;
            h.rx += nx * push; h.ry += ny * push;
            h.vx *= 0.85; h.vy *= 0.85;
          }
        }
        if (h.ox || h.oy || h.vx || h.vy || h.rx || h.ry) {
          const decay = 1 - (h.white ? 2 : 0.13) * dt;     // 치운 머리는 ~8초에 걸쳐 천천히 돌아옴
          h.rx *= decay; h.ry *= decay;
          h.vx += (-h.k * (h.ox - h.rx) - 3.0 * h.vx) * dt;
          h.vy += (-h.k * (h.oy - h.ry) - 3.0 * h.vy) * dt;
          h.ox += h.vx * dt; h.oy += h.vy * dt;
          if (Math.abs(h.ox) + Math.abs(h.oy) + Math.abs(h.rx) + Math.abs(h.ry) < 0.05 && Math.abs(h.vx) + Math.abs(h.vy) < 0.05) {
            h.ox = h.oy = h.vx = h.vy = h.rx = h.ry = 0;
          }
        }
        const b = (Math.sin(t * 1.1 + h.y0 * 0.011 + h.x0 * 0.004) * 0.6 + Math.sin(t * 2.3 + h.ph) * 0.4) * h.len * 0.018;
        const ex = h.ox - Math.sin(h.ang) * b, ey = h.oy + Math.cos(h.ang) * b;
        h.x1 = h.bx1 + ex * 0.1; h.y1 = h.by1 + ey * 0.1;
        h.x2 = h.bx2 + ex * 0.45; h.y2 = h.by2 + ey * 0.45;
        h.x3 = h.bx3 + ex; h.y3 = h.by3 + ey;
      }
    }

    /* ---------- 집기 ---------- */
    _tryGrab(p, quiet) {
      if (this.pointers.get(p.id) !== p || (p.mode !== 'pending' && p.mode !== 'rummage')) return;
      if (this.grab) return; // 핀셋은 하나
      const x0 = p.x, y0 = p.y;
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
        const t = Math.max(best.t, Math.min(h.cut, 0.08));
        const [gx, gy] = bez(h, t);
        const [rsx, rsy] = this.toScreen(h.x0, h.y0);
        const [gsx, gsy] = this.toScreen(gx, gy);
        h.vx = h.vy = 0;
        this.grab = {
          h, t, gx, gy, pid: p.id, fx: gx, fy: gy, tension: 0,
          base: Math.hypot(gsx - rsx, gsy - rsy),
          hist: [[performance.now(), 0]], lastBuzz: 0
        };
        p.mode = 'grab';
        this.fb.grab();
        if (this.hooks.onGrab) this.hooks.onGrab();
        return;
      }
      if (quiet) return; // 뒤적이는 중엔 조용히 계속
      const tolB = OOPS_PX / this.s;
      let hitBlack = false;
      for (const h of this.head.blacks) {
        const bb = h.bb;
        if (wx < bb[0] || wx > bb[2] || wy < bb[1] || wy > bb[3]) continue;
        for (let i = 0; i <= 6 && !hitBlack; i++) {
          const [px, py] = bez(h, i / 6);
          if (Math.abs(px - wx) < tolB && Math.abs(py - wy) < tolB) hitBlack = true;
        }
        if (hitBlack) break;
      }
      if (hitBlack) {
        this.fx.push({ kind: 'oops', x: x0, y: y0 - 26, t0: performance.now(), dur: 750 });
        this.fb.oops();
      }
      p.mode = 'rummage'; // 그대로 대고 있으면 가르는 손가락
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
      // 천천히 당기면 뿌리째. 빠를수록 끊길 확률 ↑ (대부분 뿌리째)
      let breakP = v < 0.8 ? 0.02 : v < 1.6 ? 0.06 : v < 2.6 ? 0.15 : 0.3;
      if (h.cut < 1) breakP = 0; // 남은 짧은 머리는 항상 뿌리째
      const broken = Math.random() < breakP;

      const t0 = broken ? STUB_T : 0;
      const pts = samples(h, t0, h.cut, 16).map(([x, y]) => this.toScreen(x - g.gx + g.fx, y - g.gy + g.fy));
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

      const gp = this.pointers.get(g.pid);
      if (gp) gp.mode = 'rummage';
      this.grab = null;
      this._emitRemain();
      if (this.hooks.onPluck) this.hooks.onPluck({ root: !broken, speed: v });
      if (!broken && this.hooks.onRemove) this.hooks.onRemove({ clean: !h.broken });
      if (this.hooks.onState) this.hooks.onState(this.getState());
      if (this.isComplete) this._finish();
    }

    _release(instant) {
      const g = this.grab;
      if (!g) return;
      if (instant) { this.grab = null; return; }
      this.snap = { g, t0: performance.now(), dur: 200, fx: g.fx, fy: g.fy, ten: g.tension };
      if (this.hooks.onRelease) this.hooks.onRelease(g.tension);
      this.grab = null;
      const gp = this.pointers.get(g.pid);
      if (gp) gp.mode = 'rummage';
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
      items.forEach((it, i) => {
        const [x, y] = this._slot(i, items.length);
        drawLaidHair(g, x, y, it);
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
      const dt = this.lastT ? clamp((now - this.lastT) / 1000, 0.001, 0.034) : 0.016;
      this.lastT = now;
      if (this.camAnim) {
        const a = this.camAnim, p = clamp((now - a.t0) / a.dur, 0, 1), e = easeOut(p);
        this.s = clamp(lerp(a.s0, a.s1, e), this.minS, this.minS * MAX_ZOOM);
        this.tx = a.sx - a.wx * this.s; this.ty = a.sy - a.wy * this.s;
        this._clampCam();
        if (p >= 1) this.camAnim = null;
      }
      if (this.head) {
        this._physics(dt, now);
        this._draw(now);
      }
      requestAnimationFrame(this._loop);
    }

    _draw(now) {
      const ctx = this.ctx, head = this.head, d = this.dpr;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.fillStyle = '#e8c7b0';
      ctx.fillRect(0, 0, this.vw, this.vh);
      const progress = this.total ? 1 - this.remain / this.total : 0;

      ctx.save();
      ctx.translate(this.tx, this.ty);
      ctx.scale(this.s, this.s);
      const grabbed = this.grab ? this.grab.h : this.snap ? this.snap.g.h : null;
      drawHead(ctx, head, this.mass, grabbed, progress);

      if (this.grab) this._drawPulled(ctx, this.grab.h, this.grab.t, this.grab.gx, this.grab.gy, this.grab.fx, this.grab.fy, this.grab.tension);
      else if (this.snap) {
        const sn = this.snap, p = clamp((now - sn.t0) / sn.dur, 0, 1), e = easeOut(p);
        const g = sn.g;
        const k = 1 - e + Math.sin(e * Math.PI) * -0.08;
        this._drawPulled(ctx, g.h, g.t, g.gx, g.gy, lerp(g.gx, sn.fx, k), lerp(g.gy, sn.fy, k), sn.ten * (1 - e));
        if (p >= 1) this.snap = null;
      }
      ctx.restore();

      if (this.grab) this._drawTweezers(ctx, ...this.toScreen(this.grab.fx, this.grab.fy), this.grab.tension);

      for (const pt of this.pointers.values()) {
        if (pt.mode !== 'pending' || this.grab) continue;
        const p = clamp((now - pt.t0 - 60) / (LONG_PRESS_MS - 60), 0, 1);
        if (p > 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pt.x0, pt.y0, 22, -Math.PI / 2, -Math.PI / 2 + p * TAU);
          ctx.stroke();
        }
      }

      if (this.coachTarget && !this.grab && !this.finishing) this._drawCoachTarget(ctx, now);
      this._drawFlies(ctx, now);
      this._drawFx(ctx, now);
      if (this.finishing) this._drawFinish(ctx, now);
    }

    // 따라하기: 화면 안의 드러난 흰머리 하나에 반짝이는 동그라미
    _drawCoachTarget(ctx, now) {
      let h = this._coachHair;
      const onScreen = (hh) => {
        const [x, y] = this.toScreen(...bez(hh, hh.cut * 0.55));
        return x > 40 && x < this.vw - 40 && y > 150 && y < this.vh - 140 ? [x, y] : null;
      };
      if (!h || h.removed || !onScreen(h)) {
        let best = null, bd = Infinity;
        for (const w of this.head.whites) {
          if (w.removed || w.hidden) continue;
          const p = onScreen(w);
          if (!p) continue;
          const d = Math.hypot(p[0] - this.vw / 2, p[1] - this.vh / 2);
          if (d < bd) { bd = d; best = w; }
        }
        h = this._coachHair = best;
      }
      if (!h) return;
      const [x, y] = onScreen(h) || this.toScreen(...bez(h, h.cut * 0.55));
      const ph = (now % 1400) / 1400;
      ctx.strokeStyle = `rgba(255,214,190,${0.9 * (1 - ph)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 16 + ph * 22, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,214,190,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.stroke();
    }

    _drawPulled(ctx, h, t, gx, gy, fx, fy, ten) {
      ctx.fillStyle = `rgba(250,226,210,${0.5 + ten * 0.4})`;
      ctx.beginPath(); ctx.ellipse(h.x0, h.y0, 1.6 + ten * 3.2, 1.3 + ten * 2.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(160,110,90,${0.15 + ten * 0.3})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      const left = samples(h, 0, t, 12);
      const ox = fx - gx, oy = fy - gy;
      const k = clamp(ten * 1.2 + 0.25, 0, 1);
      const pts = left.map(([x, y], i) => {
        const u = i / 12;
        const sx = lerp(h.x0, fx, u), sy = lerp(h.y0, fy, u);
        const cx = x + ox * u, cy = y + oy * u;
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
      const ang = -Math.PI / 4 - 0.2;
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
        const pop = clamp(p / 0.18, 0, 1);
        const fly = easeInOut(clamp((p - 0.12) / 0.88, 0, 1));
        const cx = lerp(f.cx, f.tx, fly);
        const cy = lerp(f.cy, f.ty, fly) - Math.sin(fly * Math.PI) * 50 - (1 - fly) * easeOut(pop) * 10;
        const sc = lerp(1, f.sc, fly);
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(-f.ang * fly); ctx.scale(sc, sc);
        ctx.translate(-f.cx, -f.cy);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const w = lerp(f.w, 1.8, fly);
        const line = (style, lw) => {
          ctx.strokeStyle = style; ctx.lineWidth = lw / sc;
          ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]);
          for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]);
          ctx.stroke();
        };
        line('rgba(40,28,22,0.3)', w + 1.2);
        line('#f4f0e9', w);
        if (f.item.root) { // 하얀 모근
          const [rx, ry] = f.pts[0];
          const bx = Math.cos(f.ang), by = Math.sin(f.ang);
          const brx = lerp(w * 1.4, 2.6, fly) / sc, bry = lerp(w * 0.95, 1.8, fly) / sc;
          ctx.fillStyle = '#fffdf8';
          ctx.strokeStyle = 'rgba(120,95,80,0.4)';
          ctx.lineWidth = 0.8 / sc;
          ctx.beginPath();
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
      const span = this.vw + this.vh;
      const c = lerp(-0.3, 1.3, easeInOut(p)) * span;
      const g = ctx.createLinearGradient(c - 160, c - 160, c + 160, c + 160);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,246,230,0.42)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.vw, this.vh);
      ctx.restore();
      if (!f.sparks) {
        f.sparks = Array.from({ length: 18 }, () => ({ x: Math.random() * this.vw, y: Math.random() * this.vh, o: Math.random() * 0.7, r: 3 + Math.random() * 6 }));
      }
      for (const s of f.sparks) {
        const q = clamp((p - s.o * 0.8) / 0.3, 0, 1);
        const a = Math.sin(q * Math.PI);
        if (a > 0) drawSpark(ctx, s.x, s.y, s.r * (0.6 + a * 0.6), a);
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
  function drawLaidHair(g, x, y, it) {
    g.save();
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

  S.Game = Game;
})();
