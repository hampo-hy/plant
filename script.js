/* ==========================================================================
   EV 기가팩토리 발표 자료 — 장 넘김과 애니메이션
   → / Space / Enter / 클릭(오른쪽 2/3): 다음   ← / 클릭(왼쪽 1/3): 이전
   F: 전체 화면   M: 영상 소리   숫자 뒤 #: index.html#6 처럼 장 번호로 바로 열기
   ========================================================================== */
(() => {
  'use strict';
  const stage = document.getElementById('stage');
  const pg = document.getElementById('pg');
  const prog = document.querySelector('#prog i');
  const slides = [...document.querySelectorAll('.slide')];
  const preview = new URLSearchParams(location.search).has('preview');
  if (preview) document.documentElement.classList.add('preview');

  /* 무대(1600×900)를 창 크기에 맞춤 */
  const fit = () => {
    const s = Math.min(innerWidth / 1600, innerHeight / 900);
    stage.style.transform = `translate(-50%,-50%) scale(${s})`;
  };
  addEventListener('resize', fit);

  /* 숫자 올라가기 */
  const COUNT_MS = 500, COUNT_AT = 0.375, OUT_SPEED = 0.29; // 나갈 때는 들어올 때 시간의 29%, 순서는 정반대
  const fmt = (v, dec) => (dec > 0 ? v.toFixed(dec) : Math.round(v).toLocaleString('ko-KR'));
  const ownDelay = (el) => { const a = el.closest('[data-a]'); const v = a ? parseFloat(a.style.transitionDelay) : 0; return Number.isFinite(v) ? v : 0; };
  const countStart = (el) => (ownDelay(el) > 0.5 ? ownDelay(el) : COUNT_AT);
  const decOf = (el) => +(el.dataset.dec ?? (String(el.dataset.count).includes('.') ? 1 : 0));
  const countUp = (el) => {
    const to = +el.dataset.count, dec = decOf(el);
    if (preview) { el.textContent = fmt(to, dec); return; }
    const t0 = performance.now(), run = el.dataset.run;
    const step = (t) => {
      if (el.dataset.run !== run) return;
      const p = Math.min(1, (t - t0) / COUNT_MS), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * e, dec);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* 나가는 애니메이션: 요소마다 들어올 때의 정반대 순서로, 빠르게 */
  const secs = (v) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1)));
  const planOut = (slide) => {
    const items = [...slide.querySelectorAll('*')].map((el) => {
      const cs = getComputedStyle(el);
      return { el, d: secs(cs.transitionDelay), t: secs(cs.transitionDuration), od: el.style.transitionDelay, ot: el.style.transitionDuration };
    }).filter((x) => x.t > 0 && !x.el.closest('.gbub,.chap div,.vhint,.nb'));
    const counts = [...slide.querySelectorAll('[data-count]')];
    const cd = counts.length ? Math.max(...counts.map(countStart)) : 0, ct = COUNT_MS / 1000;
    const end = Math.max(0, ...items.map((x) => x.d + x.t), counts.length ? cd + ct : 0);
    const timer = counts.length ? setTimeout(() => {
      const dur = ct * OUT_SPEED * 1000;
      counts.forEach((el) => {
        const from = parseFloat(el.textContent.replace(/,/g, '')) || 0, dec = decOf(el), t0 = performance.now(), run = el.dataset.run;
        const step = (t) => { if (el.dataset.run !== run) return; const p = Math.min(1, (t - t0) / dur); el.textContent = fmt(from * (1 - p * p * p), dec); if (p < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    }, (end - cd - ct) * OUT_SPEED * 1000) : null;
    items.forEach(({ el, d, t }) => {
      el.style.setProperty('transition-delay', ((end - d - t) * OUT_SPEED).toFixed(3) + 's', 'important');
      el.style.setProperty('transition-duration', (t * OUT_SPEED).toFixed(3) + 's', 'important');
    });
    return { ms: end * OUT_SPEED * 1000, clear: () => {
      clearTimeout(timer);
      items.forEach(({ el, od, ot }) => {
        el.style.removeProperty('transition-delay'); el.style.removeProperty('transition-duration');
        if (od) el.style.transitionDelay = od; if (ot) el.style.transitionDuration = ot;
      });
    } };
  };

  /* 소개 영상: 이 장이 나타나고 1초 뒤 자동 재생 */
  const VIDEO_DELAY_MS = 1000;
  const video = document.getElementById('demo');
  const vprog = document.getElementById('vprog');
  const vhint = document.getElementById('vhint');
  const chapters = [...document.querySelectorAll('#sVideo .chap div')];
  const playVideo = () => {
    video.muted = false;
    const p = video.play();
    // 브라우저가 소리 있는 자동 재생을 막으면 소리를 끄고 재생(M으로 켬)
    if (p && p.catch) p.catch(() => { video.muted = true; video.play().catch(() => {}); });
  };
  video.addEventListener('timeupdate', () => {
    let now = 0;
    chapters.forEach((d, i) => { if (video.currentTime >= +d.dataset.t) now = i; });
    chapters.forEach((d, i) => d.classList.toggle('now', i === now));
    if (video.duration) vprog.style.width = (video.currentTime / video.duration * 100) + '%';
  });
  video.addEventListener('playing', () => setTimeout(() => vhint.classList.add('hide'), 2500));
  video.closest('.vframe').addEventListener('click', () => { if (video.paused) playVideo(); else video.pause(); });
  chapters.forEach((d) => d.addEventListener('click', (e) => { e.stopPropagation(); video.currentTime = +d.dataset.t; playVideo(); }));

  /* 홍보 페이지: 장에 들어올 때 처음 한 번 불러옴 */
  const promo = document.getElementById('promo');
  const loadPromo = (force) => { if (force || !promo.getAttribute('src')) promo.src = promo.dataset.src; };
  document.getElementById('promoReload').addEventListener('click', () => loadPromo(true));

  /* 장 넘김 */
  let cur = -1, outPlan = null;
  const startSlide = (n) => {
    const s = slides[n];
    const later = (fn, sec) => go.ts.push(setTimeout(fn, preview ? 0 : sec * 1000));
    s.querySelectorAll('[data-count]').forEach((el) => later(() => countUp(el), countStart(el)));
    if (s.id === 'sVideo' && !preview) {
      video.pause(); video.currentTime = 0; vprog.style.width = '0'; vhint.classList.remove('hide');
      chapters.forEach((d, i) => d.classList.toggle('now', i === 0));
      go.ts.push(setTimeout(playVideo, VIDEO_DELAY_MS));
    }
    if (s.id === 'sPromo') loadPromo(false);
  };
  const go = (n) => {
    n = Math.max(0, Math.min(slides.length - 1, n));
    if (n === cur) return;
    (go.ts || []).forEach(clearTimeout); go.ts = []; clearTimeout(go.t3);
    const old = slides[cur];
    slides.forEach((x) => x.classList.remove('leaving'));
    if (outPlan) { outPlan.clear(); outPlan = null; }
    if (old) {
      if (old.id === 'sVideo') video.pause();
      if (old.id === 'sPromo') { promo.blur(); window.focus(); }
    }
    if (old && !preview) {
      outPlan = planOut(old);
      old.classList.add('leaving'); old.classList.remove('on');
    }
    const enter = () => {
      if (old) old.classList.remove('leaving');
      if (outPlan) { outPlan.clear(); outPlan = null; }
      document.querySelectorAll('[data-count]').forEach((el) => { el.dataset.run = +(el.dataset.run || 0) + 1; el.textContent = '0'; });
      slides.forEach((x, i) => x.classList.toggle('on', i === n));
      startSlide(n);
    };
    cur = n;
    pg.textContent = `${slides[n].dataset.sec || ''} · ${n + 1} / ${slides.length}`;
    prog.style.width = ((n + 1) / slides.length * 100) + '%';
    if (old && !preview) go.t3 = setTimeout(enter, Math.min(1800, outPlan.ms)); else enter();
    if (!preview) history.replaceState(null, '', '#' + (n + 1));
  };

  addEventListener('keydown', (e) => {
    if (preview) return;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(cur + 1); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
    else if (e.key === 'f' || e.key === 'F') document.documentElement.requestFullscreen?.();
    else if (e.key === 'm' || e.key === 'M') video.muted = !video.muted;
  });
  // 영상·홍보 페이지처럼 직접 조작하는 영역(data-nonav)은 클릭해도 장이 넘어가지 않음
  addEventListener('click', (e) => {
    if (preview) return;
    const btn = e.target.closest('[data-go]');
    if (btn) { go(cur + +btn.dataset.go); return; }
    if (e.target.closest('[data-nonav]')) return;
    go(cur + (e.clientX > innerWidth / 3 ? 1 : -1));
  });
  // 홍보 페이지 안에서 누른 Esc·←·→ (promo/index.html이 전달)
  addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type !== 'deck-key' || e.source !== promo.contentWindow) return;
    promo.blur(); window.focus();
    if (d.key === 'ArrowRight') go(cur + 1);
    if (d.key === 'ArrowLeft') go(cur - 1);
  });

  fit();
  go((parseInt(location.hash.slice(1), 10) || 1) - 1);
  addEventListener('hashchange', () => go((parseInt(location.hash.slice(1), 10) || 1) - 1));
})();
