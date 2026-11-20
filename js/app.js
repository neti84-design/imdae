/* 쏙 — 화면 전환, 기록, 설정, 저장 */
(function () {
  'use strict';
  const S = window.Ssok;
  const KEY = 'ssok:v1';
  const $ = (id) => document.getElementById(id);

  /* ---------- 날짜 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dayStr(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); };

  /* ---------- 저장 ---------- */
  const defaults = () => ({
    settings: { vib: 'normal', sound: false, notify: false, seenGuide: false, style: 'part', styleFolded: false },
    records: { days: {}, total: 0, streak: 0, lastDaily: null },
    current: { free: null, daily: null }
  });
  let data;
  try {
    data = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}'));
    data.settings = Object.assign(defaults().settings, data.settings);
    data.records = Object.assign(defaults().records, data.records);
    data.current = Object.assign(defaults().current, data.current);
  } catch (e) { data = defaults(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 저장 공간 없음 */ } };

  const dayRec = (d) => (data.records.days[d] = data.records.days[d] || { count: 0, clean: 0 });

  /* ---------- 화면 ---------- */
  function show(name) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === 'screen-' + name));
    if (name === 'play') { game.resize(); game.start(); } else game.stop();
    if (name === 'home') renderHome();
  }

  function renderHome() {
    const r = data.records.days[today()];
    const line = $('today-line');
    if (r && r.count) {
      const pct = Math.round((r.clean / r.count) * 100);
      line.textContent = `오늘 ${r.count}개 · 뿌리째 ${pct}% · 누적 ${data.records.total}개`;
    } else if (data.records.total) {
      line.textContent = `누적 ${data.records.total}개 뽑았어요`;
    } else line.textContent = '천천히 당기면 뿌리째 쏙 뽑혀요';

    $('btn-play').textContent = data.current.free ? '이어서 뽑기' : '뽑으러 가기';

    const doneToday = data.records.lastDaily === today();
    const streakAlive = data.records.lastDaily === today() || data.records.lastDaily === yesterday();
    const streak = streakAlive ? data.records.streak : 0;
    const btn = $('btn-daily');
    btn.disabled = doneToday;
    btn.querySelector('.label').textContent = doneToday ? '오늘의 한 판 완료' : data.current.daily ? '오늘의 한 판 이어서' : '오늘의 한 판';
    btn.querySelector('.sub').textContent = streak ? `연속 ${streak}일` : '';
  }

  /* ---------- 게임 ---------- */
  let mode = 'free';

  /* ---------- 첫 판 따라하기 ---------- */
  const coachEl = $('coach');
  const COACH = [
    { text: '손가락으로 머리카락을 <b>쓱 쓸어</b> 보세요' },
    { text: '반짝이는 흰머리 위를 <b>꾹 누르고</b> 기다리세요', target: true },
    { text: '집은 채로 <b>바깥쪽으로 천천히</b> 당기세요' },
    { text: '잘했어요! 여러 손가락으로 가른 채 <b>다른 손가락</b>으로 뽑아도 돼요', done: true }
  ];
  let coachStep = -1, coachTimer = 0;
  function coach(step, override) {
    clearTimeout(coachTimer);
    coachStep = step;
    if (step < 0 || step >= COACH.length) { coachEl.hidden = true; game.coachTarget = false; return; }
    const c = COACH[step];
    coachEl.hidden = false;
    coachEl.classList.toggle('ok', !!c.done);
    $('coach-step').textContent = c.done ? '✓' : step + 1;
    $('coach-text').innerHTML = override || c.text;
    game.coachTarget = !!c.target;
    if (c.done) coachTimer = setTimeout(() => coach(-1), 4500);
  }
  const game = new S.Game($('stage'), $('tissue-canvas'), {
    onRemain(remain) { $('remain').textContent = remain; },
    onRummage() { if (coachStep === 0) coach(1); },
    onGrab() { if (coachStep === 0 || coachStep === 1) coach(2); },
    onRelease(ten) {
      if (coachStep === 2) coach(1, ten > 0.3 ? '아까워요! 조금만 더 <b>멀리</b> 당기면 뽑혀요. 다시 꾹 눌러 보세요' : '손을 떼면 놓쳐요. 다시 <b>꾹 눌러</b> 집어 보세요');
    },
    onPluck() { if (coachStep >= 0 && coachStep <= 2) coach(3); },
    onRemove({ clean }) {
      const r = dayRec(today());
      r.count++; if (clean) r.clean++;
      data.records.total++;
      save();
    },
    onState(st) { data.current[mode] = st; save(); },
    onComplete(stats) {
      data.current[mode] = null;
      if (mode === 'daily') {
        const rec = data.records;
        if (rec.lastDaily !== today()) {
          rec.streak = rec.lastDaily === yesterday() ? rec.streak + 1 : 1;
          rec.lastDaily = today();
        }
      }
      save();
      const pct = stats.removed ? Math.round((stats.clean / stats.removed) * 100) : 100;
      $('done-count').textContent = stats.removed;
      $('done-root').textContent = pct;
      $('done-extra').textContent = mode === 'daily' ? `오늘의 한 판 완료 · 연속 ${data.records.streak}일` : '';
      $('btn-again').textContent = mode === 'daily' ? '그냥 뽑기 한 판' : '한 판 더';
      $('done').hidden = false;
    }
  });

  function play(m) {
    mode = m;
    $('done').hidden = true;
    $('pause-menu').hidden = true;
    show('play'); // 먼저 보여야 캔버스 크기를 잴 수 있다
    const cur = data.current[m];
    if (cur && cur.v === 1 && (m !== 'daily' || cur.date === today())) game.load(cur);
    else newHead(m, data.settings.style);
    data.current[m] = game.getState();
    save();
    renderStyleBar();
    $('mode-tag').textContent = m === 'daily' ? '오늘의 한 판' : '';
    coach(-1);
    if (!data.settings.seenGuide) openGuide(true);
  }

  function newHead(m, style) {
    if (m === 'daily') game.newRound({ mode: m, style, seed: S.hashStr('ssok-daily-' + today()), date: today() });
    else game.newRound({ mode: m, style, seed: (Math.random() * 2 ** 32) >>> 0 });
  }

  /* ---------- 머리 스타일 고르기 (상단 미리보기) ---------- */
  const styleBar = $('style-bar');
  const styleList = $('style-list');
  S.STYLES.forEach((st) => {
    const b = document.createElement('button');
    b.className = 'style-opt';
    b.dataset.id = st.id;
    b.setAttribute('role', 'radio');
    b.innerHTML = '<canvas></canvas><span></span>';
    b.querySelector('span').textContent = st.name;
    b.addEventListener('click', () => {
      if (styleBar.classList.contains('folded')) { setFolded(false); return; }
      if (game.style === st.id) return;
      data.settings.style = st.id;
      newHead(mode, st.id);
      data.current[mode] = game.getState();
      save();
      renderStyleBar();
    });
    styleList.appendChild(b);
  });
  let thumbsDrawn = false;
  function renderStyleBar() {
    if (!thumbsDrawn) {
      styleList.querySelectorAll('.style-opt').forEach((b) => S.renderThumb(b.querySelector('canvas'), b.dataset.id));
      thumbsDrawn = true;
    }
    const cur = game.style || data.settings.style;
    styleList.querySelectorAll('.style-opt').forEach((b) => {
      b.classList.toggle('on', b.dataset.id === cur);
      b.setAttribute('aria-checked', b.dataset.id === cur);
    });
    styleBar.classList.toggle('folded', !!data.settings.styleFolded);
  }
  function setFolded(f) { data.settings.styleFolded = f; save(); renderStyleBar(); }
  $('style-fold').addEventListener('click', () => setFolded(!data.settings.styleFolded));

  /* ---------- 사용법 (움직이는 그림) ---------- */
  const guideEl = $('guide');
  const slides = [...document.querySelectorAll('#guide .slide')];
  const dots = $('guide-dots');
  slides.forEach(() => dots.appendChild(document.createElement('i')));
  let gi = 0, guideCoach = false;
  function guideGo(i) {
    gi = Math.max(0, Math.min(slides.length - 1, i));
    $('guide-track').style.transform = `translateX(${-gi * 100}%)`;
    slides.forEach((sl, k) => sl.classList.toggle('active', k === gi));
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === gi));
    $('guide-prev').disabled = gi === 0;
    $('guide-next').textContent = gi === slides.length - 1 ? (guideCoach ? '따라 해 보기' : '닫기') : '다음';
  }
  function openGuide(withCoach) {
    guideCoach = withCoach;
    guideEl.hidden = false;
    guideGo(0);
  }
  function closeGuide(startCoach) {
    guideEl.hidden = true;
    data.settings.seenGuide = true; save();
    if (startCoach && document.getElementById('screen-play').classList.contains('active')) coach(0);
  }
  $('guide-next').addEventListener('click', () => (gi === slides.length - 1 ? closeGuide(guideCoach) : guideGo(gi + 1)));
  $('guide-prev').addEventListener('click', () => guideGo(gi - 1));
  $('guide-skip').addEventListener('click', () => closeGuide(false));
  // 옆으로 밀어서 넘기기
  let swipeX = null;
  guideEl.querySelector('.guide-viewport').addEventListener('pointerdown', (e) => { swipeX = e.clientX; });
  guideEl.querySelector('.guide-viewport').addEventListener('pointerup', (e) => {
    if (swipeX == null) return;
    const d = e.clientX - swipeX; swipeX = null;
    if (Math.abs(d) > 40) guideGo(gi + (d < 0 ? 1 : -1));
  });
  $('btn-help').addEventListener('click', () => { persist(); openGuide(true); });
  $('btn-howto').addEventListener('click', () => openGuide(false));

  function persist() {
    if (game.head && !game.isComplete) { data.current[mode] = game.getState(); save(); }
  }

  /* ---------- 설정 ---------- */
  function applySettings() {
    S.feedback.configure(data.settings);
    document.querySelectorAll('#vib-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === data.settings.vib));
    $('opt-sound').checked = data.settings.sound;
    $('opt-notify').checked = data.settings.notify;
    $('vib-note').textContent = S.feedback.canVibrate ? '' : '이 브라우저는 세기 조절을 지원하지 않아요 (아이폰은 뽑을 때 짧게만 울려요)';
  }

  /* ---------- 이벤트 ---------- */
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
  $('btn-play').addEventListener('click', () => play('free'));
  $('btn-daily').addEventListener('click', () => play('daily'));
  $('btn-settings').addEventListener('click', () => show('settings'));
  $('btn-settings-back').addEventListener('click', () => show('home'));
  $('btn-pause').addEventListener('click', () => { persist(); game.stop(); $('pause-menu').hidden = false; });
  $('btn-resume').addEventListener('click', () => { $('pause-menu').hidden = true; game.start(); });
  $('btn-quit').addEventListener('click', () => { persist(); $('pause-menu').hidden = true; show('home'); });
  $('btn-again').addEventListener('click', () => play('free'));
  $('btn-stop').addEventListener('click', () => { $('done').hidden = true; show('home'); });

  document.querySelectorAll('#vib-seg button').forEach((b) => b.addEventListener('click', () => {
    data.settings.vib = b.dataset.v; save(); applySettings(); S.feedback.test();
  }));
  $('opt-sound').addEventListener('change', (e) => {
    data.settings.sound = e.target.checked; save(); applySettings();
    if (e.target.checked) { S.feedback.unlock(); S.feedback.test(); }
  });
  $('opt-notify').addEventListener('change', async (e) => {
    data.settings.notify = e.target.checked;
    if (e.target.checked && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (_) { /* noop */ }
    }
    save();
  });
  $('btn-reset').addEventListener('click', () => {
    if (!confirm('기록과 진행 중인 판을 모두 지울까요?')) return;
    const s = data.settings;
    data = defaults(); data.settings = s; save(); renderHome(); show('home');
  });

  window.addEventListener('resize', () => game.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  window.addEventListener('pagehide', persist);

  applySettings();
  show('home');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  S.app = { data, play, game, show }; // 디버그용
})();
