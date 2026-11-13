(function (root) {
  'use strict';

  const EVG = (root.EVG = root.EVG || {});

  const DIRS = ['N', 'E', 'S', 'W'];
  const DIR_INDEX = { N: 0, E: 1, S: 2, W: 3 };
  const OPPOSITE_DIR = { N: 'S', E: 'W', S: 'N', W: 'E' };
  const NEXT_DIR = { N: 'E', E: 'S', S: 'W', W: 'N' };
  const PREV_DIR = { N: 'W', E: 'N', S: 'E', W: 'S' };

  const ALL_TERRAINS = [
    'ground',
    'ore_aluminum',
    'ore_iron',
    'ore_copper',
    'ore_magnet',
    'ore_lithium',
    'ore_silicon',
    'ore_rare_earth',
    'port',
    'sea'
  ];

  const ALL_BUILDINGS = [
    'belt',
    'wire',
    'miner',
    'arm',
    'sensor',
    'bin',
    'press',
    'winder',
    'packager',
    'chip_fab',
    'assembler',
    'solar',
    'launchpad'
  ];

  const ALL_ITEMS = [
    'aluminum',
    'iron',
    'copper',
    'magnet',
    'lithium',
    'silicon',
    'rare_earth',
    'body',
    'motor',
    'battery',
    'chip',
    'ev'
  ];

  const ZONE_PALETTES = {
    1: { base: '#8c8672', alt: '#827c68', speck: '#98927d', grid: '#746e5d' }, // 남쪽 해안 (차분한 모래/암석톤)
    2: { base: '#7d5246', alt: '#72493e', speck: '#8a5d50', grid: '#643f35' }, // 붉은 협곡 (저채도 적갈색)
    3: { base: '#496e61', alt: '#406357', speck: '#557c6e', grid: '#36554a' }, // 에메랄드 분지 (저채도 청록)
    4: { base: '#a58e66', alt: '#99825c', speck: '#b19a72', grid: '#87724f' }, // 실리콘 사막 (저채도 사막 모래)
    5: { base: '#9399a3', alt: '#878d97', speck: '#a1a7b1', grid: '#757b85' }  // 태양의 언덕 (밝은 고원 석재)
  };

  const ORE_PALETTES = {
    ore_aluminum: { dark: '#546e7a', mid: '#90a4ae', light: '#eceff1' },
    ore_iron: { dark: '#454e59', mid: '#788496', light: '#c48b69' },
    ore_copper: { dark: '#8d3f16', mid: '#d97236', light: '#f6b26b' },
    ore_magnet: { dark: '#372948', mid: '#c62828', light: '#42a5f5' },
    ore_lithium: { dark: '#00796b', mid: '#26e6b8', light: '#d7fff6' },
    ore_silicon: { dark: '#3949ab', mid: '#64b5f6', light: '#e1f5fe' },
    ore_rare_earth: { dark: '#6a1b9a', mid: '#e040fb', light: '#ffd54f' }
  };

  const cache = {
    tiles: {},
    belts: {},
    buildings: {},
    ports: {},
    items: {},
    player: {},
    icons: {},
    wireIcon: null
  };

  function isHeadless() {
    return typeof document === 'undefined' || typeof document.createElement !== 'function';
  }

  function createMockSprite(w, h) {
    return { width: w, height: h, isMock: true };
  }

  /**
   * 픽셀 선명도를 유지한 오프스크린 캔버스를 생성해 드로잉 콜백을 실행한다.
   */
  function buildSprite(w, h, drawFn) {
    if (isHeadless()) {
      return createMockSprite(w, h);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      drawFn(ctx, w, h);
    }
    return canvas;
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }

  function px(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  }

  function outline(ctx, x, y, w, h, color) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iw = Math.floor(w);
    const ih = Math.floor(h);
    rect(ctx, ix, iy, iw, 1, color);
    rect(ctx, ix, iy + ih - 1, iw, 1, color);
    rect(ctx, ix, iy, 1, ih, color);
    rect(ctx, ix + iw - 1, iy, 1, ih, color);
  }

  function drawMatrix(ctx, ox, oy, rows, palette) {
    const baseX = Math.floor(ox);
    const baseY = Math.floor(oy);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        const color = palette[ch];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(baseX + c, baseY + r, 1, 1);
        }
      }
    }
  }

  /**
   * 짝수 크기 정사각형 캔버스를 90도 단위로 회전한 새 캔버스를 반환한다.
   */
  function rotate90(srcCanvas, quarterTurns) {
    const turns = ((quarterTurns % 4) + 4) % 4;
    if (turns === 0 || (srcCanvas && srcCanvas.isMock)) {
      return srcCanvas;
    }
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    return buildSprite(w, h, function (ctx) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate((turns * Math.PI) / 2);
      ctx.drawImage(srcCanvas, -w / 2, -h / 2);
      ctx.restore();
    });
  }

  function normalizeDir(dir) {
    return DIR_INDEX[dir] !== undefined ? dir : 'E';
  }

  // ---------------------------------------------------------------------------
  // 1. 지형 타일 (32x32)
  // ---------------------------------------------------------------------------

  function drawZoneGround(ctx, zoneId) {
    const pal = ZONE_PALETTES[zoneId] || ZONE_PALETTES[1];
    rect(ctx, 0, 0, 32, 32, pal.base);

    // 저채도 바닥 질감용 미세 픽셀 점 패턴
    const altDots = [
      [3, 5], [7, 14], [12, 4], [18, 9], [25, 6], [28, 17],
      [5, 22], [11, 27], [16, 19], [21, 25], [27, 29], [9, 10]
    ];
    const speckDots = [
      [4, 6], [13, 12], [22, 14], [8, 24], [19, 21], [26, 11], [15, 28]
    ];
    for (let i = 0; i < altDots.length; i++) {
      rect(ctx, altDots[i][0], altDots[i][1], 2, 1, pal.alt);
    }
    for (let i = 0; i < speckDots.length; i++) {
      px(ctx, speckDots[i][0], speckDots[i][1], pal.speck);
    }

    // 1px 미세 타일 격자 경계
    rect(ctx, 0, 31, 32, 1, pal.grid);
    rect(ctx, 31, 0, 1, 32, pal.grid);
  }

  function drawOreTile(ctx, terrainType, zoneId) {
    drawZoneGround(ctx, zoneId);
    const ore = ORE_PALETTES[terrainType] || ORE_PALETTES.ore_iron;

    // 암반 기저부
    const rockBase = '#3b4048';
    const rockEdge = '#252930';
    rect(ctx, 6, 8, 10, 8, rockEdge);
    rect(ctx, 7, 9, 8, 6, rockBase);
    rect(ctx, 16, 14, 11, 10, rockEdge);
    rect(ctx, 17, 15, 9, 8, rockBase);
    rect(ctx, 7, 19, 8, 7, rockEdge);
    rect(ctx, 8, 20, 6, 5, rockBase);

    // 광물 결정체 도트 군집
    const clusters = [
      { x: 8, y: 9, w: 6, h: 5 },
      { x: 18, y: 15, w: 7, h: 7 },
      { x: 9, y: 20, w: 5, h: 4 },
      { x: 20, y: 6, w: 5, h: 5 }
    ];
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      rect(ctx, c.x, c.y, c.w, c.h, ore.dark);
      rect(ctx, c.x + 1, c.y + 1, c.w - 2, c.h - 2, ore.mid);
      px(ctx, c.x + 1, c.y + 1, ore.light);
      if (c.w >= 6) {
        px(ctx, c.x + 2, c.y + 1, ore.light);
      }
    }

    // 자석 광맥은 N/S 극성 반짝임 추가
    if (terrainType === 'ore_magnet') {
      rect(ctx, 10, 11, 2, 2, '#ef5350');
      rect(ctx, 20, 17, 2, 2, '#42a5f5');
      px(ctx, 21, 7, '#ef5350');
    }
  }

  function drawPortTile(ctx) {
    // 목재/강철 부두 데크
    rect(ctx, 0, 0, 32, 32, '#5a4636');
    for (let y = 0; y < 26; y += 5) {
      rect(ctx, 0, y, 32, 1, '#3d2f24');
      rect(ctx, 0, y + 1, 32, 1, '#6d5542');
    }
    // 데크 못(리벳) 및 판자 이음새
    for (let y = 2; y < 24; y += 5) {
      px(ctx, 6, y, '#2b211a');
      px(ctx, 24, y, '#2b211a');
      rect(ctx, 15, y - 1, 1, 4, '#443428');
    }

    // 하단 강철 부두 빔 & 노란/검정 안전 사선
    rect(ctx, 0, 25, 32, 7, '#263238');
    rect(ctx, 0, 25, 32, 1, '#546e7a');
    for (let x = 0; x < 32; x += 6) {
      rect(ctx, x, 27, 3, 4, '#fbc02d');
      rect(ctx, x + 3, 27, 3, 4, '#1b1f24');
    }

    // 중앙 화물 적재 마크 (수출항 식별)
    outline(ctx, 10, 7, 12, 12, '#212529');
    rect(ctx, 11, 8, 10, 10, '#ffb300');
    rect(ctx, 12, 9, 8, 8, '#ffd54f');
    rect(ctx, 15, 9, 2, 8, '#e65100');
    rect(ctx, 12, 12, 8, 2, '#e65100');
  }

  function drawSeaTile(ctx) {
    rect(ctx, 0, 0, 32, 32, '#132f57');
    rect(ctx, 0, 6, 32, 4, '#173866');
    rect(ctx, 0, 18, 32, 5, '#173866');

    // 물결 도트 하이라이트
    const waves = [
      [3, 5, 6], [17, 7, 7], [8, 13, 5], [22, 15, 6],
      [4, 21, 7], [18, 23, 6], [10, 28, 6]
    ];
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      rect(ctx, w[0], w[1], w[2], 1, '#2a5a99');
      rect(ctx, w[0] + 1, w[1] - 1, Math.max(2, w[2] - 3), 1, '#4b86cf');
    }
  }

  function getTileSprite(terrainType, zoneId) {
    const t = terrainType || 'ground';
    const z = zoneId >= 1 && zoneId <= 5 ? Math.floor(zoneId) : 1;
    const key = t === 'port' || t === 'sea' ? t : t + '_z' + z;
    if (cache.tiles[key]) return cache.tiles[key];

    const sprite = buildSprite(32, 32, function (ctx) {
      if (t === 'port') {
        drawPortTile(ctx);
      } else if (t === 'sea') {
        drawSeaTile(ctx);
      } else if (t.indexOf('ore_') === 0) {
        drawOreTile(ctx, t, z);
      } else {
        drawZoneGround(ctx, z);
      }
    });

    cache.tiles[key] = sprite;
    return sprite;
  }

  // ---------------------------------------------------------------------------
  // 2. 컨베이어 벨트 (32x32, 단일 원본 회전 + 4프레임 전진)
  // ---------------------------------------------------------------------------

  function drawBeltBaseNorth(ctx, animFrame) {
    // 어두운 금속 외곽 레일
    rect(ctx, 0, 0, 32, 32, '#181c22');
    rect(ctx, 1, 0, 4, 32, '#3d4857');
    rect(ctx, 27, 0, 4, 32, '#3d4857');
    rect(ctx, 4, 0, 1, 32, '#627187');
    rect(ctx, 27, 0, 1, 32, '#627187');

    // 레일 리벳
    for (let y = 3; y < 32; y += 8) {
      px(ctx, 2, y, '#90a4ae');
      px(ctx, 29, y, '#90a4ae');
    }

    // 벨트 중앙 트랙
    rect(ctx, 5, 0, 22, 32, '#232933');

    // 프레임(0~3)별 2px씩 북쪽(-Y)으로 전진하는 롤러 및 고명도 화살표(Chevron)
    const step = animFrame * 2; // 0, 2, 4, 6
    for (let base = -8; base < 40; base += 8) {
      const sy = base - step;
      if (sy >= 0 && sy < 32) {
        rect(ctx, 6, sy, 20, 1, '#2e3644');
      }
    }

    // 16px 간격 2개의 밝은 방향 화살표 (^ 형태)
    for (let k = -1; k < 3; k++) {
      const cy = k * 16 + 8 - step;
      drawChevronUp(ctx, 16, cy);
    }
  }

  function drawChevronUp(ctx, cx, cy) {
    const pts = [
      [0, -3, '#fff9c4'],
      [-1, -2, '#ffe082'], [0, -2, '#ffd54f'], [1, -2, '#ffe082'],
      [-2, -1, '#ffd54f'], [-1, -1, '#ffca28'], [1, -1, '#ffca28'], [2, -1, '#ffd54f'],
      [-3, 0, '#ffca28'], [-2, 0, '#ffa000'], [2, 0, '#ffa000'], [3, 0, '#ffca28'],
      [-4, 1, '#ffb300'], [-3, 1, '#e65100'], [3, 1, '#e65100'], [4, 1, '#ffb300']
    ];
    for (let i = 0; i < pts.length; i++) {
      const py = cy + pts[i][1];
      if (py >= 0 && py < 32) {
        px(ctx, cx + pts[i][0], py, pts[i][2]);
      }
    }
  }

  function getBeltSprite(dir, animFrame) {
    const d = normalizeDir(dir);
    const frame = ((Math.floor(animFrame || 0) % 4) + 4) % 4;
    const key = d + '_' + frame;
    if (cache.belts[key]) return cache.belts[key];

    const baseKey = 'N_' + frame;
    if (!cache.belts[baseKey]) {
      cache.belts[baseKey] = buildSprite(32, 32, function (ctx) {
        drawBeltBaseNorth(ctx, frame);
      });
    }

    if (d === 'N') {
      return cache.belts[baseKey];
    }
    const rotated = rotate90(cache.belts[baseKey], DIR_INDEX[d]);
    cache.belts[key] = rotated;
    return rotated;
  }

  // ---------------------------------------------------------------------------
  // 3. 설비 본체 (64x64, 좌상단 (0,0) 정렬, 1px 진한 외곽선)
  // ---------------------------------------------------------------------------

  function drawMachineFrame(ctx, baseColor, rimLight, rimDark) {
    outline(ctx, 1, 1, 62, 62, '#141820');
    rect(ctx, 2, 2, 60, 60, baseColor);
    rect(ctx, 2, 2, 60, 2, rimLight);
    rect(ctx, 2, 2, 2, 60, rimLight);
    rect(ctx, 2, 60, 60, 2, rimDark);
    rect(ctx, 60, 2, 2, 60, rimDark);

    // 네 모서리 볼트 디테일
    const bolts = [[4, 4], [58, 4], [4, 58], [58, 58]];
    for (let i = 0; i < bolts.length; i++) {
      rect(ctx, bolts[i][0], bolts[i][1], 2, 2, '#90a4ae');
    }
  }

  function drawSolarBuilding(ctx) {
    drawMachineFrame(ctx, '#37474f', '#607d8b', '#263238');

    // 태양광 패널 외곽 실버 프레임
    outline(ctx, 5, 5, 54, 48, '#1a232e');
    rect(ctx, 6, 6, 52, 46, '#b0bec5');

    // 파란 태양광 패널 4x3 격자 셀
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const cx = 8 + col * 12;
        const cy = 8 + row * 14;
        rect(ctx, cx, cy, 10, 12, '#0d47a1');
        rect(ctx, cx + 1, cy + 1, 8, 10, '#1565c0');
        rect(ctx, cx + 1, cy + 1, 8, 3, '#1e88e5');
        // 수평 버스바 실선
        rect(ctx, cx + 1, cy + 6, 8, 1, '#64b5f6');
        // 대각선 유리 반짝임
        px(ctx, cx + 2, cy + 2, '#bbdefb');
        px(ctx, cx + 3, cy + 3, '#90caf9');
      }
    }

    // 하단 인버터/전력 정션 박스
    outline(ctx, 18, 53, 28, 8, '#141820');
    rect(ctx, 19, 54, 26, 6, '#455a64');
    rect(ctx, 22, 55, 6, 4, '#fbc02d');
    rect(ctx, 36, 55, 6, 4, '#4caf50');
  }

  function drawAssemblerBuilding(ctx) {
    drawMachineFrame(ctx, '#263238', '#455a64', '#161d22');

    // 상하 안전 스트라이프 레일
    for (let x = 6; x < 58; x += 6) {
      rect(ctx, x, 4, 3, 3, '#ffb300');
      rect(ctx, x + 3, 4, 3, 3, '#1c2128');
      rect(ctx, x, 57, 3, 3, '#ffb300');
      rect(ctx, x + 3, 57, 3, 3, '#1c2128');
    }

    // 중앙 차체 조립 플랫폼
    outline(ctx, 16, 12, 32, 40, '#12161c');
    rect(ctx, 17, 13, 30, 38, '#37474f');
    rect(ctx, 20, 16, 24, 32, '#1e272e');

    // 중앙EV 차체 프레임 실루엣
    outline(ctx, 24, 21, 16, 22, '#0d1117');
    rect(ctx, 25, 22, 14, 20, '#546e7a');
    rect(ctx, 27, 25, 10, 12, '#4fc3f7');
    rect(ctx, 28, 26, 8, 10, '#29b6f6');
    // 바퀴 4개
    rect(ctx, 22, 23, 2, 5, '#11161b');
    rect(ctx, 40, 23, 2, 5, '#11161b');
    rect(ctx, 22, 36, 2, 5, '#11161b');
    rect(ctx, 40, 36, 2, 5, '#11161b');

    // 좌측 로봇 팔 실루엣
    rect(ctx, 5, 22, 10, 20, '#455a64');
    outline(ctx, 5, 22, 10, 20, '#141820');
    rect(ctx, 7, 26, 12, 5, '#ffa000');
    rect(ctx, 16, 25, 6, 7, '#ffd54f');
    rect(ctx, 21, 27, 4, 3, '#cfd8dc');
    px(ctx, 25, 28, '#fff59d'); // 용접 스파크

    // 우측 로봇 팔 실루엣
    rect(ctx, 49, 22, 10, 20, '#455a64');
    outline(ctx, 49, 22, 10, 20, '#141820');
    rect(ctx, 45, 26, 12, 5, '#ffa000');
    rect(ctx, 42, 25, 6, 7, '#ffd54f');
    rect(ctx, 39, 27, 4, 3, '#cfd8dc');
    px(ctx, 38, 28, '#fff59d'); // 용접 스파크
  }

  function drawMinerBuilding(ctx) {
    drawMachineFrame(ctx, '#455a64', '#78909c', '#263238');

    // 노란/주황 채굴기 상단 섀시
    outline(ctx, 7, 7, 50, 50, '#1a1e24');
    rect(ctx, 8, 8, 48, 48, '#d97706');
    rect(ctx, 10, 10, 44, 44, '#f59e0b');
    rect(ctx, 10, 10, 44, 4, '#fbbf24');

    // 중앙 채굴 챔버
    outline(ctx, 16, 16, 32, 32, '#141820');
    rect(ctx, 17, 17, 30, 30, '#263238');

    // 드릴 헤드 (중앙 원추/나선 비트)
    rect(ctx, 26, 19, 12, 8, '#64748b');
    rect(ctx, 24, 27, 16, 6, '#94a3b8');
    rect(ctx, 27, 33, 10, 6, '#cbd5e1');
    rect(ctx, 29, 39, 6, 5, '#e2e8f0');
    rect(ctx, 31, 44, 2, 2, '#ffffff');
    // 나선 홈
    rect(ctx, 26, 23, 12, 2, '#334155');
    rect(ctx, 25, 29, 14, 2, '#475569');
    rect(ctx, 28, 35, 8, 2, '#475569');

    // 우상단 노출 기어 휠 실루엣
    outline(ctx, 43, 10, 12, 12, '#141820');
    rect(ctx, 44, 11, 10, 10, '#90a4ae');
    rect(ctx, 47, 14, 4, 4, '#37474f');
    px(ctx, 42, 15, '#cfd8dc');
    px(ctx, 55, 15, '#cfd8dc');
    px(ctx, 48, 9, '#cfd8dc');
    px(ctx, 48, 22, '#cfd8dc');
  }

  function drawSensorBuilding(ctx) {
    drawMachineFrame(ctx, '#1e293b', '#475569', '#0f172a');

    // 센서 본체 브리지 아치
    outline(ctx, 8, 12, 48, 40, '#0b111a');
    rect(ctx, 9, 13, 46, 38, '#334155');
    rect(ctx, 14, 18, 36, 28, '#17202e');

    // 중앙 청록색 광학 스캐너 렌즈 코어
    outline(ctx, 21, 21, 22, 22, '#091017');
    rect(ctx, 22, 22, 20, 20, '#00838f');
    rect(ctx, 24, 24, 16, 16, '#00bcd4');
    rect(ctx, 27, 27, 10, 10, '#00e5ff');
    rect(ctx, 29, 29, 4, 4, '#e0f7fa');

    // 가로 스캔 레이저 빔 라인
    rect(ctx, 12, 31, 9, 2, '#26c6da');
    rect(ctx, 43, 31, 9, 2, '#26c6da');

    // 상단 상태 LED 3구 (초록 / 노랑 / 빨강)
    rect(ctx, 22, 14, 4, 3, '#00e676');
    rect(ctx, 30, 14, 4, 3, '#ffd54f');
    rect(ctx, 38, 14, 4, 3, '#ff5252');
  }

  function drawBinBuilding(ctx) {
    drawMachineFrame(ctx, '#37474f', '#546e7a', '#212b30');

    // 재활용 녹색 컨테이너 외벽
    outline(ctx, 7, 7, 50, 50, '#141820');
    rect(ctx, 8, 8, 48, 48, '#2e7d32');
    rect(ctx, 10, 10, 44, 44, '#388e3c');

    // 상단 불량 투입 개구부
    outline(ctx, 13, 12, 38, 16, '#11161c');
    rect(ctx, 14, 13, 36, 14, '#1b2228');
    rect(ctx, 16, 15, 32, 4, '#263238');

    // 하단 재활용 화살표 심볼 (픽셀 도트)
    rect(ctx, 16, 33, 32, 18, '#1b5e20');
    // 화살표 순환 삼각 고리
    rect(ctx, 26, 36, 12, 2, '#a5d6a7');
    rect(ctx, 23, 38, 3, 6, '#a5d6a7');
    rect(ctx, 38, 38, 3, 6, '#a5d6a7');
    rect(ctx, 26, 45, 12, 2, '#a5d6a7');
    px(ctx, 36, 35, '#ffffff');
    px(ctx, 36, 38, '#ffffff');
    px(ctx, 26, 44, '#ffffff');
    px(ctx, 26, 47, '#ffffff');
  }

  function drawPackagerBuilding(ctx) {
    drawMachineFrame(ctx, '#263238', '#455a64', '#151c20');

    // 에메랄드/청록 패키징 하우징
    outline(ctx, 7, 8, 50, 48, '#12161c');
    rect(ctx, 8, 9, 48, 46, '#00695c');
    rect(ctx, 10, 11, 44, 42, '#00897b');

    // 중앙 배터리 셀 마크 챔버
    outline(ctx, 18, 16, 28, 32, '#11161b');
    rect(ctx, 19, 17, 26, 30, '#1e272e');

    // 배터리 셀 아이콘
    rect(ctx, 28, 20, 8, 3, '#cfd8dc'); // + 단자
    outline(ctx, 23, 23, 18, 21, '#0d1117');
    rect(ctx, 24, 24, 16, 19, '#37474f');
    rect(ctx, 26, 26, 12, 4, '#8bc34a');
    rect(ctx, 26, 32, 12, 4, '#4caf50');
    rect(ctx, 26, 38, 12, 3, '#43a047');

    // 좌우 실링 프레스 암
    rect(ctx, 10, 26, 7, 12, '#b0bec5');
    rect(ctx, 47, 26, 7, 12, '#b0bec5');
  }

  function drawPressBuilding(ctx) {
    drawMachineFrame(ctx, '#37474f', '#607d8b', '#1c2429');

    // 진홍색 대형 프레스 프레임 기둥
    outline(ctx, 8, 6, 48, 52, '#141820');
    rect(ctx, 9, 7, 12, 50, '#b71c1c');
    rect(ctx, 43, 7, 12, 50, '#b71c1c');
    rect(ctx, 9, 7, 46, 10, '#c62828');
    rect(ctx, 11, 9, 42, 4, '#e53935');

    // 중앙 프레스 작업 공간
    rect(ctx, 21, 17, 22, 38, '#1e242b');

    // 상단 유압 해머 피스톤 & 다이
    rect(ctx, 28, 17, 8, 8, '#78909c');
    outline(ctx, 23, 25, 18, 9, '#11161b');
    rect(ctx, 24, 26, 16, 7, '#b0bec5');
    rect(ctx, 25, 27, 14, 2, '#eceff1');

    // 하단 차체 성형 모루(Anvil)
    rect(ctx, 22, 41, 20, 12, '#455a64');
    rect(ctx, 24, 38, 16, 3, '#90a4ae'); // 가공 중인 알루미늄 판재
  }

  function drawWinderBuilding(ctx) {
    drawMachineFrame(ctx, '#37474f', '#546e7a', '#1e272c');

    // 산업용 호박/구리색 모터 권선 프레임
    outline(ctx, 7, 8, 50, 48, '#141820');
    rect(ctx, 8, 9, 48, 46, '#2e3842');

    // 중앙 로터 샤프트
    rect(ctx, 10, 29, 44, 6, '#90a4ae');
    rect(ctx, 10, 30, 44, 2, '#eceff1');

    // 좌측/우측 구리 코일 스풀
    const spools = [14, 36];
    for (let s = 0; s < spools.length; s++) {
      const sx = spools[s];
      outline(ctx, sx, 16, 14, 32, '#141820');
      rect(ctx, sx + 1, 17, 12, 3, '#78909c');
      rect(ctx, sx + 1, 44, 12, 3, '#78909c');
      // 촘촘한 구리선 권선 줄무늬
      for (let y = 20; y < 44; y += 2) {
        rect(ctx, sx + 1, y, 12, 1, '#d97706');
        rect(ctx, sx + 1, y + 1, 12, 1, '#f59e0b');
        rect(ctx, sx + 4, y + 1, 4, 1, '#fde68a');
      }
    }
  }

  function drawChipFabBuilding(ctx) {
    drawMachineFrame(ctx, '#cfd8dc', '#ffffff', '#78909c');

    // 클린룸 내부 웨이퍼 공정실
    outline(ctx, 9, 9, 46, 46, '#263238');
    rect(ctx, 10, 10, 44, 44, '#3949ab');
    rect(ctx, 12, 12, 40, 40, '#283593');

    // 웨이퍼 칩 격자 패턴
    outline(ctx, 18, 18, 28, 28, '#1a237e');
    rect(ctx, 19, 19, 26, 26, '#5c6bc0');
    for (let y = 21; y < 43; y += 6) {
      for (let x = 21; x < 43; x += 6) {
        rect(ctx, x, y, 4, 4, '#90caf9');
        px(ctx, x + 1, y + 1, '#ffd54f');
      }
    }

    // 금색 반도체 핀 트레이스
    for (let i = 20; i <= 42; i += 4) {
      rect(ctx, i, 15, 2, 3, '#ffd54f');
      rect(ctx, i, 46, 2, 3, '#ffd54f');
      rect(ctx, 15, i, 3, 2, '#ffd54f');
      rect(ctx, 46, i, 3, 2, '#ffd54f');
    }
  }

  function drawArmBuilding(ctx) {
    // 원형 베이스를 강조하기 위해 투명 배경 위 중심 기계 베이스
    outline(ctx, 10, 10, 44, 44, '#141820');
    rect(ctx, 11, 11, 42, 42, '#37474f');
    rect(ctx, 12, 12, 40, 2, '#607d8b');
    rect(ctx, 12, 50, 40, 2, '#263238');

    // 회전 턴테이블 링
    outline(ctx, 17, 17, 30, 30, '#141820');
    rect(ctx, 18, 18, 28, 28, '#546e7a');
    outline(ctx, 23, 23, 18, 18, '#141820');
    rect(ctx, 24, 24, 16, 16, '#f59e0b');
    rect(ctx, 27, 27, 10, 10, '#ffd54f');

    // 관절 매니퓰레이터 암 실루엣 (대각/우향)
    outline(ctx, 28, 28, 24, 8, '#141820');
    rect(ctx, 29, 29, 22, 6, '#90a4ae');
    rect(ctx, 30, 30, 20, 2, '#eceff1');

    // 집게 집기(Gripper)
    rect(ctx, 50, 25, 6, 4, '#ff8f00');
    rect(ctx, 50, 35, 6, 4, '#ff8f00');
    rect(ctx, 55, 26, 4, 2, '#cfd8dc');
    rect(ctx, 55, 36, 4, 2, '#cfd8dc');
  }

  function drawLaunchpadBuilding(ctx) {
    drawMachineFrame(ctx, '#455a64', '#78909c', '#263238');

    // 주변 안전 해저드 테두리
    for (let x = 4; x < 60; x += 6) {
      rect(ctx, x, 4, 3, 3, '#fbc02d');
      rect(ctx, x + 3, 4, 3, 3, '#141820');
      rect(ctx, x, 57, 3, 3, '#fbc02d');
      rect(ctx, x + 3, 57, 3, 3, '#141820');
    }

    // 화염 배출 패드 & 점화 배기 트렌치
    outline(ctx, 20, 18, 34, 32, '#141820');
    rect(ctx, 21, 19, 32, 30, '#1f262e');
    // 중앙 원형 발사 노즐 화염 링
    outline(ctx, 28, 25, 18, 18, '#11161b');
    rect(ctx, 29, 26, 16, 16, '#bf360c');
    rect(ctx, 32, 29, 10, 10, '#ff7043');
    rect(ctx, 34, 31, 6, 6, '#ffd54f');

    // 좌측 로켓 발사 타워(Gantry Truss)
    outline(ctx, 8, 8, 14, 48, '#141820');
    rect(ctx, 9, 9, 12, 46, '#90a4ae');
    for (let y = 12; y < 52; y += 8) {
      rect(ctx, 11, y, 8, 5, '#37474f');
      rect(ctx, 13, y + 2, 4, 1, '#cfd8dc');
    }
    // 붉은 연료 공급 암
    rect(ctx, 22, 16, 14, 4, '#e53935');
    rect(ctx, 22, 17, 12, 1, '#ff8a80');
  }

  function drawWirePreview64(ctx) {
    outline(ctx, 14, 14, 36, 36, '#141820');
    rect(ctx, 15, 15, 34, 34, '#263238');
    rect(ctx, 29, 6, 6, 52, '#3e2723');
    rect(ctx, 30, 6, 4, 52, '#ffd54f');
    rect(ctx, 6, 29, 52, 6, '#3e2723');
    rect(ctx, 6, 30, 52, 4, '#ffd54f');
    outline(ctx, 24, 24, 16, 16, '#141820');
    rect(ctx, 25, 25, 14, 14, '#ffb300');
    rect(ctx, 28, 28, 8, 8, '#fff59d');
  }

  function getBuildingSprite(buildingType) {
    const type = buildingType || 'assembler';
    if (cache.buildings[type]) return cache.buildings[type];

    const sprite = buildSprite(64, 64, function (ctx) {
      switch (type) {
        case 'solar':
          drawSolarBuilding(ctx);
          break;
        case 'assembler':
          drawAssemblerBuilding(ctx);
          break;
        case 'miner':
          drawMinerBuilding(ctx);
          break;
        case 'sensor':
          drawSensorBuilding(ctx);
          break;
        case 'bin':
          drawBinBuilding(ctx);
          break;
        case 'packager':
          drawPackagerBuilding(ctx);
          break;
        case 'press':
          drawPressBuilding(ctx);
          break;
        case 'winder':
          drawWinderBuilding(ctx);
          break;
        case 'chip_fab':
          drawChipFabBuilding(ctx);
          break;
        case 'arm':
          drawArmBuilding(ctx);
          break;
        case 'launchpad':
          drawLaunchpadBuilding(ctx);
          break;
        case 'wire':
          drawWirePreview64(ctx);
          break;
        case 'belt': {
          const b = getBeltSprite('E', 0);
          if (b && !b.isMock) {
            ctx.drawImage(b, 16, 16, 32, 32);
          }
          break;
        }
        default:
          drawMachineFrame(ctx, '#455a64', '#78909c', '#263238');
          break;
      }
    });

    cache.buildings[type] = sprite;
    return sprite;
  }

  // ---------------------------------------------------------------------------
  // 4. 분리된 IN / OUT 포트 오버레이 레이어 (64x64)
  // ---------------------------------------------------------------------------

  const ARROW_STYLE = {
    in: { outline: '#091926', fill: '#38bdf8', hi: '#bae6fd' },
    out: { outline: '#241304', fill: '#ff9800', hi: '#ffe082' },
    normal: { outline: '#062614', fill: '#00e676', hi: '#b9f6ca' },
    defect: { outline: '#2b0505', fill: '#ff3d3d', hi: '#ff9e80' }
  };

  /**
   * 북쪽('N') 가장자리 중앙(x=32)에 기준 화살표를 그린 뒤 회전해 각 변에 배치한다.
   */
  function drawNorthEdgeMarker(ctx, kind, isInward, compact) {
    const st = ARROW_STYLE[kind] || ARROW_STYLE.out;
    // isInward=true: 북쪽 경계에서 아래(안쪽)로 향함, false: 북쪽 경계에서 위(바깥)로 향함
    const rowsOutward = compact
      ? [
          '....oo....',
          '...oHHo...',
          '..oHFFHo..',
          '.oFFFFFFo.',
          '..ooFFoo..',
          '...oFFo...',
          '...oooo...'
        ]
      : [
          '.....oo.....',
          '....oHHo....',
          '...oHFFHo...',
          '..oHFFFFHo..',
          '.oFFFFFFFFo.',
          '.oooFFFFooo.',
          '...oFFFFo...',
          '...oFFFFo...',
          '...oooooo...'
        ];

    const rows = isInward ? rowsOutward.slice().reverse() : rowsOutward;
    const w = rows[0].length;
    const ox = Math.floor(32 - w / 2);
    const oy = 1;
    drawMatrix(ctx, ox, oy, rows, {
      o: st.outline,
      F: st.fill,
      H: st.hi
    });

    // 불량 출구(defect)에는 선명한 흰/붉은 테두리 '×' 배지 추가
    if (kind === 'defect') {
      const xBadge = [
        'o...o',
        '.o.o.',
        '..o..',
        '.o.o.',
        'o...o'
      ];
      drawMatrix(ctx, 40, 2, [
        'oo.oo',
        'ooooo',
        '.ooo.',
        'ooooo',
        'oo.oo'
      ], { o: '#2b0505' });
      drawMatrix(ctx, 40, 2, xBadge, { o: '#ffffff' });
    }
  }

  function drawEdgePort(ctx, edgeDir, kind, isInward, compact) {
    const turns = DIR_INDEX[normalizeDir(edgeDir)];
    const markerCanvas = buildSprite(64, 64, function (mCtx) {
      drawNorthEdgeMarker(mCtx, kind, isInward, compact);
    });
    const rotated = rotate90(markerCanvas, turns);
    if (rotated && !rotated.isMock) {
      ctx.drawImage(rotated, 0, 0);
    }
  }

  function resolveSensorDirections(dir, sensorRule) {
    const d = normalizeDir(dir);
    if (!sensorRule) return null;
    const normalDir = sensorRule.normalDir ? normalizeDir(sensorRule.normalDir) : d;
    let defectDir = null;
    if (sensorRule.defectDir) {
      defectDir = normalizeDir(sensorRule.defectDir);
    } else if (sensorRule.defectSide === 'left') {
      defectDir = PREV_DIR[d];
    } else if (sensorRule.defectSide === 'right') {
      defectDir = NEXT_DIR[d];
    } else {
      defectDir = NEXT_DIR[d];
    }
    return { normalDir: normalDir, defectDir: defectDir };
  }

  function getPortOverlaySprite(buildingType, dir, sensorRule) {
    const type = buildingType || 'assembler';
    const d = normalizeDir(dir);
    const resolved = type === 'sensor' ? resolveSensorDirections(d, sensorRule) : null;
    const ruleKey = resolved ? resolved.normalDir + '_' + resolved.defectDir : 'none';
    const key = type + '_' + d + '_' + ruleKey;
    if (cache.ports[key]) return cache.ports[key];

    const sprite = buildSprite(64, 64, function (ctx) {
      if (type === 'solar' || type === 'launchpad' || type === 'wire') {
        return;
      }

      if (type === 'bin') {
        // 회수함은 4면 모두 불량 유입 가능
        for (let i = 0; i < DIRS.length; i++) {
          drawEdgePort(ctx, DIRS[i], 'in', true, true);
        }
        return;
      }

      if (type === 'belt') {
        drawEdgePort(ctx, d, 'out', false, true);
        return;
      }

      if (type === 'miner') {
        drawEdgePort(ctx, d, 'out', false, false);
        return;
      }

      if (type === 'arm') {
        drawEdgePort(ctx, OPPOSITE_DIR[d], 'in', true, false);
        drawEdgePort(ctx, d, 'out', false, false);
        return;
      }

      if (type === 'sensor') {
        drawEdgePort(ctx, OPPOSITE_DIR[d], 'in', true, false);
        if (resolved) {
          drawEdgePort(ctx, resolved.normalDir, 'normal', false, false);
          drawEdgePort(ctx, resolved.defectDir, 'defect', false, false);
        } else {
          drawEdgePort(ctx, d, 'out', false, false);
        }
        return;
      }

      // 가공기 및 조립기: 주 OUT(dir), 주 IN(반대편), 측면 보조 IN 표시
      drawEdgePort(ctx, d, 'out', false, false);
      drawEdgePort(ctx, OPPOSITE_DIR[d], 'in', true, false);
      drawEdgePort(ctx, NEXT_DIR[d], 'in', true, true);
      drawEdgePort(ctx, PREV_DIR[d], 'in', true, true);
    });

    cache.ports[key] = sprite;
    return sprite;
  }

  // ---------------------------------------------------------------------------
  // 5. 플레이어 캐릭터 (32x32, 안전모 + 작업복 엔지니어)
  // ---------------------------------------------------------------------------

  function drawPlayerEngineer(ctx, facing) {
    const f = normalizeDir(facing);
    // 발밑 그림자
    rect(ctx, 9, 27, 14, 3, 'rgba(0, 0, 0, 0.35)');

    // 다리 및 작업화 (하체)
    rect(ctx, 10, 21, 5, 6, '#1565c0');
    rect(ctx, 17, 21, 5, 6, '#1565c0');
    outline(ctx, 10, 21, 5, 7, '#11161d');
    outline(ctx, 17, 21, 5, 7, '#11161d');
    rect(ctx, 10, 25, 5, 3, '#263238');
    rect(ctx, 17, 25, 5, 3, '#263238');

    // 상체 파란 작업복 + 오렌지 안전 조끼 스트라이프
    outline(ctx, 8, 13, 16, 10, '#11161d');
    rect(ctx, 9, 14, 14, 8, '#1e88e5');
    rect(ctx, 11, 14, 3, 7, '#fb8c00');
    rect(ctx, 18, 14, 3, 7, '#fb8c00');
    rect(ctx, 12, 16, 2, 2, '#ffe082');
    rect(ctx, 18, 16, 2, 2, '#ffe082');

    // 방향별 팔 / 장갑 / 백팩
    if (f === 'S' || f === 'N') {
      outline(ctx, 6, 14, 3, 7, '#11161d');
      rect(ctx, 7, 15, 1, 5, '#1976d2');
      px(ctx, 7, 19, '#eceff1'); // 흰 작업 장갑
      outline(ctx, 23, 14, 3, 7, '#11161d');
      rect(ctx, 24, 15, 1, 5, '#1976d2');
      px(ctx, 24, 19, '#eceff1');
      if (f === 'N') {
        // 뒷모습 도구 백팩
        outline(ctx, 11, 14, 10, 7, '#11161d');
        rect(ctx, 12, 15, 8, 5, '#455a64');
        rect(ctx, 14, 16, 4, 2, '#ffd54f');
      }
    } else if (f === 'E') {
      outline(ctx, 8, 14, 3, 6, '#11161d');
      rect(ctx, 9, 15, 1, 4, '#455a64'); // 등 백팩
      outline(ctx, 16, 15, 8, 4, '#11161d');
      rect(ctx, 17, 16, 6, 2, '#1976d2');
      rect(ctx, 22, 16, 2, 2, '#eceff1');
    } else if (f === 'W') {
      outline(ctx, 21, 14, 3, 6, '#11161d');
      rect(ctx, 22, 15, 1, 4, '#455a64');
      outline(ctx, 8, 15, 8, 4, '#11161d');
      rect(ctx, 9, 16, 6, 2, '#1976d2');
      rect(ctx, 8, 16, 2, 2, '#eceff1');
    }

    // 머리 & 얼굴
    outline(ctx, 10, 7, 12, 8, '#11161d');
    if (f === 'N') {
      rect(ctx, 11, 8, 10, 6, '#3e2723');
    } else {
      rect(ctx, 11, 8, 10, 6, '#ffcc99');
      if (f === 'S') {
        px(ctx, 13, 11, '#1e293b');
        px(ctx, 18, 11, '#1e293b');
      } else if (f === 'E') {
        px(ctx, 18, 11, '#1e293b');
      } else if (f === 'W') {
        px(ctx, 13, 11, '#1e293b');
      }
    }

    // 노란 안전모 (헬멧)
    outline(ctx, 9, 3, 14, 6, '#11161d');
    rect(ctx, 10, 4, 12, 4, '#fdd835');
    rect(ctx, 11, 4, 10, 2, '#fff59d');
    rect(ctx, 14, 4, 4, 4, '#fbc02d');
    // 방향별 헬멧 챙(Brim)
    if (f === 'S') {
      rect(ctx, 9, 8, 14, 2, '#f59e0b');
    } else if (f === 'E') {
      rect(ctx, 12, 8, 13, 2, '#f59e0b');
    } else if (f === 'W') {
      rect(ctx, 7, 8, 13, 2, '#f59e0b');
    } else {
      rect(ctx, 9, 7, 14, 2, '#f59e0b');
    }
  }

  function getPlayerSprite(facing) {
    const f = normalizeDir(facing || 'S');
    if (cache.player[f]) return cache.player[f];

    const sprite = buildSprite(32, 32, function (ctx) {
      drawPlayerEngineer(ctx, f);
    });
    cache.player[f] = sprite;
    return sprite;
  }

  // ---------------------------------------------------------------------------
  // 6. 아이템 (16x16, 정상 반짝임 / 불량 깨진 모서리 + X 표시)
  // ---------------------------------------------------------------------------

  const ITEM_MATRICES = {
    aluminum: {
      palette: { o: '#141820', d: '#607d8b', m: '#b0bec5', l: '#eceff1' },
      rows: [
        '................',
        '................',
        '.....oooooo.....',
        '...oommlllloo...',
        '..ommmllllllmo..',
        '.ommmmllllmmmdo.',
        '.ommmmmmmmmmddo.',
        '.odmmmmmmmmmddo.',
        '.odddmmmmdddddo.',
        '..oddddddddddo..',
        '...ooddddddoo...',
        '.....oooooo.....',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    iron: {
      palette: { o: '#141820', d: '#454e59', m: '#788496', l: '#b0bec5', r: '#b56e4d' },
      rows: [
        '................',
        '................',
        '....ooooooo.....',
        '...ommmlllmo....',
        '..ommmllllmmo...',
        '.ommrrmmmmmmmo..',
        '.ommrrrmmmmddo..',
        '.odmmmmmmddddo..',
        '.odddmmddddddo..',
        '..odddddddddo...',
        '...oodddddoo....',
        '.....oooooo.....',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    copper: {
      palette: { o: '#141820', d: '#8d3f16', m: '#d97236', l: '#f6b26b' },
      rows: [
        '................',
        '................',
        '.....oooooo.....',
        '...oommllmoo....',
        '..ommmlllmmmo...',
        '.ommmllllmmddo..',
        '.ommmmmmmmmddo..',
        '.odmmmmmdddddo..',
        '..odmmmdddddo...',
        '...odddddddo....',
        '....ooooooo.....',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    magnet: {
      palette: { o: '#141820', d: '#372948', m: '#6d597a', r: '#e53935', b: '#1e88e5', l: '#cfd8dc' },
      rows: [
        '................',
        '................',
        '....oooooooo....',
        '...ommmllmmmo...',
        '..ommmmmmmmmmo..',
        '.orrrmmmmmbbbmo.',
        '.orrrdddddbbbdo.',
        '.oddddddddddddo.',
        '..oddddddddddo..',
        '...ooddddddoo...',
        '.....oooooo.....',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    lithium: {
      palette: { o: '#141820', d: '#00796b', m: '#1de9b6', l: '#c8fff4' },
      rows: [
        '................',
        '.......oo.......',
        '......ollo......',
        '.....ommlmo.....',
        '....ommmllmo....',
        '...oommmmmdoo...',
        '..ommlmmmddmmo..',
        '..ommmmmddddmo..',
        '..odmmmmdddddo..',
        '...oddddddddo...',
        '....ooddddoo....',
        '......oooo......',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    silicon: {
      palette: { o: '#141820', d: '#3949ab', m: '#64b5f6', l: '#e1f5fe' },
      rows: [
        '................',
        '......oooo......',
        '.....ollllo.....',
        '....ollmmllo....',
        '...ommmmmmmdo...',
        '..ommlmmmmdddo..',
        '..ommddddddddo..',
        '...oddddddddo...',
        '....oddddddo....',
        '.....oddddo.....',
        '......oooo......',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    rare_earth: {
      palette: { o: '#141820', d: '#6a1b9a', m: '#e040fb', l: '#ffd54f' },
      rows: [
        '................',
        '......oooo......',
        '....oolllmoo....',
        '...ommmlmmmdo...',
        '..ommmllmmmddo..',
        '..ommmmmmmdddo..',
        '..odmmlmmddddo..',
        '...oddddddddo...',
        '....ooddddoo....',
        '......oooo......',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    body: {
      palette: { o: '#141820', d: '#455a64', m: '#90a4ae', l: '#eceff1', g: '#4fc3f7' },
      rows: [
        '................',
        '................',
        '................',
        '....oooooooo....',
        '...ollllllllo...',
        '..omggggggggmo..',
        '.oommmmmmmmmmmo.',
        '.omddddddddddmo.',
        '.oddddddddddddo.',
        '..oooooooooooo..',
        '..ooo......ooo..',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    motor: {
      palette: { o: '#141820', d: '#37474f', m: '#78909c', c: '#f59e0b', l: '#eceff1' },
      rows: [
        '................',
        '................',
        '................',
        '....oooooooo....',
        '...omccccccmo...',
        '..omllccccllmo..',
        '.oommccccccmmoo.',
        '.ollmccccccmllo.',
        '..oomccccccmmo..',
        '...oddddddddo...',
        '....oooooooo....',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    battery: {
      palette: { o: '#141820', d: '#263238', g: '#4caf50', l: '#aeea00', s: '#cfd8dc' },
      rows: [
        '................',
        '....ooo..ooo....',
        '....oso..oso....',
        '..oooooooooooo..',
        '..oddddddddddo..',
        '..odlllllllllo..',
        '..odggggggggdo..',
        '..odlllllllllo..',
        '..odggggggggdo..',
        '..oddddddddddo..',
        '..oooooooooooo..',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    },
    chip: {
      palette: { o: '#141820', d: '#212529', c: '#3949ab', g: '#ffd54f', l: '#4dd0e1' },
      rows: [
        '................',
        '....o.o..o.o....',
        '....g.g..g.g....',
        '..oooooooooooo..',
        '.ogoddddddddog..',
        '..oodccccccdoo..',
        '.ogodcllllcdoog.',
        '..oodcllllcdoo..',
        '.ogodccccccdoog.',
        '..ooddddddddoo..',
        '..oooooooooooo..',
        '....g.g..g.g....',
        '....o.o..o.o....',
        '................',
        '................',
        '................'
      ]
    },
    ev: {
      palette: { o: '#141820', r: '#e53935', l: '#ff8a80', g: '#80deea', w: '#263238', y: '#fff59d' },
      rows: [
        '................',
        '................',
        '.....ooooooo....',
        '....orgggggro...',
        '...orgggggggro..',
        '..oorrrrrrrrrro.',
        '.orllrrrrrrrryo.',
        '.orrrrrrrrrrrro.',
        '..oowwoooowwoo..',
        '...oo......oo...',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    }
  };

  function drawNormalSparkle(ctx) {
    // 우상단 흰색 '+' 반짝임 하이라이트
    px(ctx, 12, 1, '#e0f7fa');
    px(ctx, 12, 2, '#ffffff');
    px(ctx, 12, 3, '#e0f7fa');
    px(ctx, 11, 2, '#e0f7fa');
    px(ctx, 13, 2, '#e0f7fa');
  }

  function applyDefectOverlay(ctx) {
    // 1) 좌상단/우상단 깨진 모서리 실루엣 (조각 떨어짐 + 균열선)
    ctx.clearRect(2, 2, 4, 4);
    ctx.clearRect(10, 2, 3, 3);
    px(ctx, 6, 3, '#141820');
    px(ctx, 5, 4, '#141820');
    px(ctx, 4, 5, '#141820');
    px(ctx, 6, 5, '#2b2d42');
    px(ctx, 7, 6, '#141820');
    px(ctx, 8, 7, '#2b2d42');

    // 2) 소형 화면/색각 이상에서도 즉시 식별 가능한 선명한 빨간/흰 테두리 '×' 기호
    const xPosX = 8;
    const xPosY = 8;
    const xMask = [
      'oo...oo',
      'ooo.ooo',
      '.ooooo.',
      '..ooo..',
      '.ooooo.',
      'ooo.ooo',
      'oo...oo'
    ];
    const xWhite = [
      '.o...o.',
      'o.o.o.o',
      '.o.o.o.',
      '..o.o..',
      '.o.o.o.',
      'o.o.o.o',
      '.o...o.'
    ];
    const xRed = [
      'o.....o',
      '.o...o.',
      '..o.o..',
      '...o...',
      '..o.o..',
      '.o...o.',
      'o.....o'
    ];
    drawMatrix(ctx, xPosX, xPosY, xMask, { o: '#2b0505' });
    drawMatrix(ctx, xPosX, xPosY, xWhite, { o: '#ffffff' });
    drawMatrix(ctx, xPosX, xPosY, xRed, { o: '#ff1744' });
  }

  function getItemSprite(itemType, isDefect) {
    const type = ITEM_MATRICES[itemType] ? itemType : 'iron';
    const defectFlag = Boolean(isDefect);
    const key = type + '_' + (defectFlag ? 'defect' : 'normal');
    if (cache.items[key]) return cache.items[key];

    const spec = ITEM_MATRICES[type];
    const sprite = buildSprite(16, 16, function (ctx) {
      drawMatrix(ctx, 0, 0, spec.rows, spec.palette);
      if (defectFlag) {
        applyDefectOverlay(ctx);
      } else {
        drawNormalSparkle(ctx);
      }
    });

    cache.items[key] = sprite;
    return sprite;
  }

  // ---------------------------------------------------------------------------
  // 7. HUD/모달용 Data URL 캐시 헬퍼
  // ---------------------------------------------------------------------------

  function getWireIconSprite() {
    if (cache.wireIcon) return cache.wireIcon;
    cache.wireIcon = buildSprite(32, 32, function (ctx) {
      outline(ctx, 4, 4, 24, 24, '#141820');
      rect(ctx, 5, 5, 22, 22, '#263238');
      rect(ctx, 13, 2, 6, 28, '#3e2723');
      rect(ctx, 14, 2, 4, 28, '#ffd54f');
      rect(ctx, 2, 13, 28, 6, '#3e2723');
      rect(ctx, 2, 14, 28, 4, '#ffd54f');
      outline(ctx, 10, 10, 12, 12, '#141820');
      rect(ctx, 11, 11, 10, 10, '#ffb300');
      rect(ctx, 13, 13, 6, 6, '#fff59d');
    });
    return cache.wireIcon;
  }

  function getIconDataURL(buildingTypeOrItem, isDefect) {
    const key = String(buildingTypeOrItem || '') + (isDefect ? '_defect' : '');
    if (cache.icons[key] !== undefined) return cache.icons[key];

    let sprite = null;
    if (ITEM_MATRICES[buildingTypeOrItem]) {
      sprite = getItemSprite(buildingTypeOrItem, Boolean(isDefect));
    } else if (buildingTypeOrItem === 'belt') {
      sprite = getBeltSprite('E', 0);
    } else if (buildingTypeOrItem === 'wire') {
      sprite = getWireIconSprite();
    } else {
      sprite = getBuildingSprite(buildingTypeOrItem);
    }

    if (!sprite || sprite.isMock || typeof sprite.toDataURL !== 'function') {
      cache.icons[key] = '';
      return '';
    }

    const url = sprite.toDataURL('image/png');
    cache.icons[key] = url;
    return url;
  }

  // ---------------------------------------------------------------------------
  // 8. 전체 아틀라스 사전 초기화
  // ---------------------------------------------------------------------------

  function init() {
    for (let z = 1; z <= 5; z++) {
      for (let i = 0; i < ALL_TERRAINS.length; i++) {
        getTileSprite(ALL_TERRAINS[i], z);
      }
    }

    for (let d = 0; d < DIRS.length; d++) {
      for (let f = 0; f < 4; f++) {
        getBeltSprite(DIRS[d], f);
      }
      getPlayerSprite(DIRS[d]);
    }

    for (let b = 0; b < ALL_BUILDINGS.length; b++) {
      const bType = ALL_BUILDINGS[b];
      getBuildingSprite(bType);
      for (let d = 0; d < DIRS.length; d++) {
        getPortOverlaySprite(bType, DIRS[d], null);
      }
    }

    // 시연 센서 대표 분기 프리셋 사전 캐싱
    getPortOverlaySprite('sensor', 'S', { normalDir: 'S', defectDir: 'E' });

    for (let m = 0; m < ALL_ITEMS.length; m++) {
      getItemSprite(ALL_ITEMS[m], false);
      getItemSprite(ALL_ITEMS[m], true);
    }

    return cache;
  }

  EVG.SPRITES = {
    init: init,
    getTileSprite: getTileSprite,
    getBeltSprite: getBeltSprite,
    getBuildingSprite: getBuildingSprite,
    getPortOverlaySprite: getPortOverlaySprite,
    getItemSprite: getItemSprite,
    getPlayerSprite: getPlayerSprite,
    getIconDataURL: getIconDataURL
  };
})(typeof window !== 'undefined' ? window : globalThis);
