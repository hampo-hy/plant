/* ==========================================================================
   EV 기가팩토리 발표 자료 — 게임 그림
   게임의 실제 스프라이트(vendor/sprites.js = src/assets/sprites.js 사본)로
   발표 자료 안의 게임 그림과 움직이는 시연 공장을 그린다.
   ========================================================================== */
(() => {
  'use strict';
  const SP = window.EVG && window.EVG.SPRITES;
  if (!SP) return;
  SP.init();

  const T = 32;
  const noSmooth = (ctx) => { ctx.imageSmoothingEnabled = false; return ctx; };

  /* ---------- 1. 낱개 스프라이트: <canvas data-sprite="building:miner" data-port="S"> ---------- */
  const spriteOf = (spec) => {
    const [kind, a, b] = spec.split(':');
    if (kind === 'building') return SP.getBuildingSprite(a);
    if (kind === 'item') return SP.getItemSprite(a, b === 'defect');
    if (kind === 'belt') return SP.getBeltSprite(a || 'E', 0);
    if (kind === 'player') return SP.getPlayerSprite(a || 'S');
    if (kind === 'tile') return SP.getTileSprite(a, +b || 1);
    return null;
  };
  document.querySelectorAll('canvas[data-sprite]').forEach((cv) => {
    const s = spriteOf(cv.dataset.sprite);
    if (!s || s.isMock) return;
    cv.width = s.width; cv.height = s.height;
    const ctx = noSmooth(cv.getContext('2d'));
    ctx.drawImage(s, 0, 0);
    if (cv.dataset.port) {
      const [, type] = cv.dataset.sprite.split(':');
      const rule = type === 'sensor' ? { normalDir: 'S', defectDir: 'E' } : null;
      ctx.drawImage(SP.getPortOverlaySprite(type, cv.dataset.port, rule), 0, 0);
    }
  });

  /* ---------- 2. 바닥 무늬: data-tile="ground:3" → 배경 이미지 ---------- */
  document.querySelectorAll('[data-tile]').forEach((el) => {
    const [terrain, zone] = el.dataset.tile.split(':');
    const s = SP.getTileSprite(terrain, +zone || 1);
    if (s && s.toDataURL) el.style.backgroundImage = `url(${s.toDataURL('image/png')})`;
  });

  /* ---------- 3. 배치 규칙 그림 (9×3칸) ---------- */
  const ground = (ctx, cols, rows, zone) => {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) ctx.drawImage(SP.getTileSprite('ground', zone), x * T, y * T);
  };
  const building = (ctx, type, tx, ty, dir, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(SP.getBuildingSprite(type), tx * T, ty * T);
    if (dir) ctx.drawImage(SP.getPortOverlaySprite(type, dir, type === 'sensor' ? { normalDir: 'S', defectDir: 'E' } : null), tx * T, ty * T);
    ctx.restore();
  };
  const corners = (ctx, tx, ty, color) => {
    const x = tx * T, y = ty * T, L = 9;
    ctx.fillStyle = color;
    [[x + 2, y + 2, 1, 1], [x + T - 2, y + 2, -1, 1], [x + 2, y + T - 2, 1, -1], [x + T - 2, y + T - 2, -1, -1]].forEach(([cx, cy, sx, sy]) => {
      ctx.fillRect(sx > 0 ? cx : cx - L, sy > 0 ? cy : cy - 2, L, 2);
      ctx.fillRect(sx > 0 ? cx : cx - 2, sy > 0 ? cy : cy - L, 2, L);
    });
  };
  const hatch = (ctx, tx, ty) => {
    const x = tx * T, y = ty * T;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();
    ctx.fillStyle = 'rgba(234,67,53,.45)'; ctx.fillRect(x, y, T, T);
    ctx.strokeStyle = '#EA4335'; ctx.lineWidth = 3;
    for (let k = -T; k < T * 2; k += 9) { ctx.beginPath(); ctx.moveTo(x + k, y + T); ctx.lineTo(x + k + T, y); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = '#EA4335'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
  };
  const SCENES = {
    'place-ok'(ctx) {
      ground(ctx, 9, 3, 3);
      building(ctx, 'packager', 1, 0, 'E');
      ctx.drawImage(SP.getBeltSprite('E', 0), 3 * T, 0);
      ctx.drawImage(SP.getBeltSprite('E', 0), 4 * T, 0);
      building(ctx, 'miner', 6, 1, 'S', 0.6);
      [[6, 1], [7, 1], [6, 2], [7, 2]].forEach(([x, y]) => corners(ctx, x, y, '#FFFFFF'));
    },
    'place-hit'(ctx) {
      ground(ctx, 9, 3, 3);
      building(ctx, 'packager', 3, 0, 'E');
      building(ctx, 'sensor', 4, 1, 'S', 0.55);
      [[5, 1], [4, 2], [5, 2]].forEach(([x, y]) => corners(ctx, x, y, '#FFFFFF'));
      hatch(ctx, 4, 1);
    },
    'demolish'(ctx) {
      ground(ctx, 9, 3, 1);
      [0, 1, 2].forEach((x) => ctx.drawImage(SP.getBeltSprite('E', 0), x * T, T));
      [5, 6, 7, 8].forEach((x) => ctx.drawImage(SP.getBeltSprite('E', 0), x * T, T));
      building(ctx, 'assembler', 3, 0, 'E');
      ctx.strokeStyle = '#EA4335'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
      ctx.strokeRect(3 * T + 1.5, 1.5, 2 * T - 3, 2 * T - 3);
      ctx.setLineDash([]);
    },
  };
  document.querySelectorAll('canvas[data-scene]').forEach((cv) => {
    const draw = SCENES[cv.dataset.scene];
    if (!draw) return;
    cv.width = 9 * T; cv.height = 3 * T;
    draw(noSmooth(cv.getContext('2d')));
  });

  /* ---------- 4. 움직이는 시연 공장 (기획서의 x=14~30, y=10~20 배치 그대로) ---------- */
  const demo = document.getElementById('demoCanvas');
  if (!demo) return;
  const X0 = 14, Y0 = 10, COLS = 17, ROWS = 11;
  demo.width = COLS * T; demo.height = ROWS * T;
  const dctx = noSmooth(demo.getContext('2d'));
  const px = (x) => (x - X0) * T, py = (y) => (y - Y0) * T;

  // 바닥은 한 번만 그려 둔다
  const base = document.createElement('canvas');
  base.width = demo.width; base.height = demo.height;
  (() => {
    const c = noSmooth(base.getContext('2d'));
    for (let y = Y0; y < Y0 + ROWS; y++) for (let x = X0; x < X0 + COLS; x++) {
      const zone = y >= 15 ? 1 : x >= 15 ? 3 : 2;
      let terrain = 'ground';
      if (x >= 15 && x <= 16 && y >= 10 && y <= 11) terrain = 'ore_lithium';
      if (x >= 29 && y >= 17 && y <= 18) terrain = 'port';
      c.drawImage(SP.getTileSprite(terrain, zone), px(x), py(y));
    }
    // 배선(폭 6px): 태양광 → 패키징기 → 센서 → 채굴기, 그리고 조립기 → 수출항
    const wire = (x1, y1, x2, y2) => {
      c.fillStyle = '#3e2723'; c.fillRect(px(Math.min(x1, x2)) - 4, py(Math.min(y1, y2)) - 4, Math.abs(px(x2) - px(x1)) + 8, Math.abs(py(y2) - py(y1)) + 8);
      c.fillStyle = '#ffd54f'; c.fillRect(px(Math.min(x1, x2)) - 3, py(Math.min(y1, y2)) - 3, Math.abs(px(x2) - px(x1)) + 6, Math.abs(py(y2) - py(y1)) + 6);
    };
    wire(15.5, 11.5, 15.5, 19.5);
    wire(15.5, 18.5, 29.5, 18.5);
    wire(18.5, 13.5, 18.5, 18.5);
  })();

  const BELTS = [[15, 12, 'S'], [17, 13, 'E'], [15, 15, 'S'], [17, 16, 'E']];
  for (let x = 20; x <= 28; x++) BELTS.push([x, 17, 'E']);
  const MACHINES = [['miner', 15, 10, 'S'], ['sensor', 15, 13, 'S'], ['bin', 18, 13, 'N'], ['packager', 15, 16, 'E'], ['assembler', 18, 16, 'E'], ['solar', 15, 19, null]];

  // 아이템 이동 구간: [시작초, 끝초, 종류, 불량, x1, y1, x2, y2]
  const MOVES = [
    [0.0, 2.0, 'lithium', true, 15.5, 11.5, 15.5, 13.5],
    [3.0, 5.0, 'lithium', true, 16.5, 13.5, 18.5, 13.5],
    [4.0, 6.0, 'lithium', false, 15.5, 11.5, 15.5, 13.5],
    [7.0, 9.0, 'lithium', false, 15.5, 14.5, 15.5, 16.5],
    [11.5, 13.5, 'battery', false, 16.5, 16.5, 18.5, 16.5],
    [16.0, 21.0, 'ev', false, 19.5, 17.5, 29.5, 17.5],
  ];
  // 진행 막대: [시작초, 끝초, 기계 좌상단 x, y]
  const WORKS = [[9.0, 11.5, 15, 16], [13.5, 16.0, 18, 16]];
  const LOOP = 25;
  const bubbles = [...document.querySelectorAll('#sDemo .gbub')];
  bubbles.forEach((b) => { b.style.left = (px(+b.dataset.x) / demo.width * 100) + '%'; b.style.top = (py(+b.dataset.y) / demo.height * 100) + '%'; });

  let t0 = null, wasOn = false;
  const frame = (now) => {
    requestAnimationFrame(frame);
    const on = demo.closest('.slide').classList.contains('on');
    if (!on) { wasOn = false; return; }
    if (!wasOn) { t0 = now; wasOn = true; }
    const still = document.documentElement.classList.contains('preview');
    const t = still ? 12.5 : ((now - t0) / 1000) % LOOP;
    const beltFrame = still ? 0 : Math.floor((now - t0) / 140) % 4;

    dctx.drawImage(base, 0, 0);
    BELTS.forEach(([x, y, d]) => dctx.drawImage(SP.getBeltSprite(d, beltFrame), px(x), py(y)));
    MOVES.forEach(([a, b, type, bad, x1, y1, x2, y2]) => {
      if (t < a || t > b) return;
      const p = (t - a) / (b - a);
      const s = SP.getItemSprite(type, bad);
      dctx.drawImage(s, Math.round(px(x1 + (x2 - x1) * p)) - 8, Math.round(py(y1 + (y2 - y1) * p)) - 8);
    });
    MACHINES.forEach(([type, x, y, d]) => {
      dctx.drawImage(SP.getBuildingSprite(type), px(x), py(y));
      if (d) dctx.drawImage(SP.getPortOverlaySprite(type, d, type === 'sensor' ? { normalDir: 'S', defectDir: 'E' } : null), px(x), py(y));
    });
    WORKS.forEach(([a, b, x, y]) => {
      if (t < a || t > b) return;
      const p = (t - a) / (b - a);
      dctx.fillStyle = '#141820'; dctx.fillRect(px(x) + 6, py(y) - 9, 52, 7);
      dctx.fillStyle = '#34A853'; dctx.fillRect(px(x) + 7, py(y) - 8, Math.round(50 * p), 5);
    });
    dctx.drawImage(SP.getPlayerSprite('E'), px(14), py(16.5));
    bubbles.forEach((b) => b.classList.toggle('show', t >= +b.dataset.from && t < +b.dataset.to));
  };
  requestAnimationFrame(frame);
})();
