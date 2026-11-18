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
    settings: { vib: 'normal', sound: false, notify: false, seenHint: false },
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
  const hint = $('hint');
  const game = new S.Game($('stage'), $('tissue-canvas'), {
    onRemain(remain) { $('remain').textContent = remain; },
    onTouch() {
      if (!hint.hidden) { hint.hidden = true; data.settings.seenHint = true; save(); }
    },
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
    hint.hidden = data.settings.seenHint;
    show('play'); // 먼저 보여야 캔버스 크기를 잴 수 있다
    const cur = data.current[m];
    if (cur && cur.v === 1 && (m !== 'daily' || cur.date === today())) game.load(cur);
    else if (m === 'daily') game.newRound({ mode: m, seed: S.hashStr('ssok-daily-' + today()), date: today() });
    else game.newRound({ mode: m, seed: (Math.random() * 2 ** 32) >>> 0 });
    data.current[m] = game.getState();
    save();
    $('mode-tag').textContent = m === 'daily' ? '오늘의 한 판' : '';
  }

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

  S.app = { data, play, game }; // 디버그용
})();
