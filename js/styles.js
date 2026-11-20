/* 머리 스타일: 뿌리 위치, 결 방향, 길이, 두피가 보이는 곳 */
(function () {
  'use strict';
  const S = (window.Ssok = window.Ssok || {});
  const TAU = Math.PI * 2;

  // 공통: 가르마형 스타일의 뿌리 배치
  function partRoot(g, r, W, H, white, spread) {
    const y0 = -30 + r() * (H + 60);
    const side = r() < g.leftBias ? -1 : 1;
    const d = white ? 9 + r() * 110 : 3 + Math.pow(r(), 1.5) * W * spread;
    return { x0: g.partX(y0) + side * d, y0, side, d };
  }

  S.STYLES = [
    {
      id: 'part', name: '가르마', hidden: 0.35, black: [850, 1100],
      setup(r, W) {
        const amp = 5 + r() * 14, per = 140 + r() * 170, ph = r() * TAU;
        return { leftBias: 0.5, partX: (y) => W / 2 + amp * Math.sin(y / per + ph), focus: [W / 2, null] };
      },
      scalpDist: (g, x, y) => Math.abs(x - g.partX(y)),
      root: (g, r, W, H, white) => partRoot(g, r, W, H, white, 0.56),
      dir(g, r, p, white) {
        let ang = p.side < 0 ? Math.PI - (0.12 + r() * 0.6) : 0.12 + r() * 0.6;
        ang += (r() - 0.5) * 0.35;
        return { ang, len: white ? 80 + r() * 70 : 60 + r() * 105, bend: (r() - 0.5) * 0.9 };
      }
    },
    {
      id: 'side', name: '옆가르마', hidden: 0.4, black: [850, 1100],
      setup(r, W) {
        const amp = 4 + r() * 8, per = 160 + r() * 160, ph = r() * TAU;
        return { leftBias: 0.32, partX: (y) => W * 0.34 + amp * Math.sin(y / per + ph), focus: [W * 0.34, null] };
      },
      scalpDist: (g, x, y) => Math.abs(x - g.partX(y)),
      root: (g, r, W, H, white) => partRoot(g, r, W, H, white, 0.66),
      dir(g, r, p, white) {
        if (p.side < 0) {
          const ang = Math.PI - (0.3 + r() * 0.6) + (r() - 0.5) * 0.3;
          return { ang, len: white ? 70 + r() * 60 : 55 + r() * 80, bend: (r() - 0.5) * 0.8 };
        }
        const ang = 0.2 + r() * 0.45 + (r() - 0.5) * 0.25;
        return { ang, a0: ang - 0.25, len: white ? 100 + r() * 90 : 90 + r() * 130, bend: 0.25 + r() * 0.4 };
      }
    },
    {
      id: 'whorl', name: '가마', hidden: 0.4, black: [950, 1200],
      setup(r, W, H) {
        const cx = W * 0.5 + (r() - 0.5) * 60, cy = H * 0.4 + (r() - 0.5) * 60;
        return { cx, cy, focus: [cx, cy] };
      },
      scalpDist: (g, x, y) => Math.max(0, Math.hypot(x - g.cx, y - g.cy) - 5) * 1.6,
      root(g, r, W, H, white) {
        for (let k = 0; k < 20; k++) {
          const rr = white ? 12 + r() * 140 : 3 + Math.pow(r(), 1.25) * Math.max(W, H) * 0.8;
          const th = r() * TAU;
          const x0 = g.cx + Math.cos(th) * rr, y0 = g.cy + Math.sin(th) * rr;
          if (x0 > -40 && x0 < W + 40 && y0 > -40 && y0 < H + 40) return { x0, y0, th, d: rr * 1.6 };
        }
        return { x0: g.cx, y0: g.cy, th: 0, d: 0 };
      },
      dir(g, r, p, white) {
        const ang = p.th + 0.8 + (r() - 0.5) * 0.3; // 시계 방향 소용돌이
        return { ang, a0: p.th + 0.35, len: white ? 80 + r() * 70 : 60 + r() * 100, bend: 0.45 + r() * 0.4 };
      }
    },
    {
      id: 'long', name: '긴 생머리', hidden: 0.5, black: [750, 1000], gloss: 1.6,
      setup(r, W) {
        const amp = 4 + r() * 10, per = 160 + r() * 160, ph = r() * TAU;
        return { leftBias: 0.5, partX: (y) => W / 2 + amp * Math.sin(y / per + ph), focus: [W / 2, null] };
      },
      scalpDist: (g, x, y) => Math.abs(x - g.partX(y)),
      root: (g, r, W, H, white) => partRoot(g, r, W, H, white, 0.5),
      dir(g, r, p, white) {
        const out = 0.3 + r() * 0.4;
        const ang = Math.PI / 2 - p.side * out;
        return {
          ang, a0: p.side > 0 ? 0.15 : Math.PI - 0.15,
          len: white ? 150 + r() * 120 : 170 + r() * 160, bend: (r() - 0.5) * 0.35, w: 1.1 + r() * 0.8
        };
      }
    },
    {
      id: 'curly', name: '곱슬', hidden: 0.3, black: [950, 1200],
      setup(r) { return { ph: r() * TAU, focus: [null, null] }; },
      scalpDist: (g, x, y) => 40 + 30 * Math.sin(x / 37 + g.ph) * Math.sin(y / 29),
      root(g, r, W, H) {
        return { x0: -20 + r() * (W + 40), y0: -20 + r() * (H + 40), d: 99 };
      },
      dir(g, r, p, white) {
        const ang = Math.PI / 2 + Math.sin(p.x0 / 120 + g.ph) * 0.8 + (r() - 0.5) * 1.2;
        const sgn = r() < 0.5 ? -1 : 1;
        return {
          ang, len: white ? 55 + r() * 45 : 45 + r() * 50,
          bend: sgn * (1.4 + r() * 1.2), curl: sgn * (0.35 + r() * 0.3), w: 1.5 + r() * 0.9
        };
      }
    }
  ];
  S.styleById = (id) => S.STYLES.find((s) => s.id === id) || S.STYLES[0];
})();
