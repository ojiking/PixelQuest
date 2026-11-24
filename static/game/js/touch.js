// 모바일 터치 조작: 휴대폰/태블릿(마우스 호버가 없고 손가락이 주 입력인 기기)에서만 표시
// 버튼은 키보드 이벤트를 흉내 내서 기존 입력 처리(Input, 메뉴 단축키)를 그대로 사용

export const IS_MOBILE = matchMedia('(hover: none) and (pointer: coarse)').matches;

function sendKey(type, code) {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
}

export function setupTouch(stage, input) {
  if (!IS_MOBILE) return null;
  document.documentElement.classList.add('mobile');

  const root = document.createElement('div');
  root.id = 'touch';
  root.className = 'hidden';
  root.innerHTML = `
    <div id="stick-zone"><div id="stick-base"><div id="stick-knob"></div></div></div>
    <div id="tbtns">
      <button class="tb tb-atk" data-key="KeyJ">공격</button>
      <button class="tb tb-jump" data-key="KeyK">점프</button>
      <button class="tb tb-grab" data-key="KeyL" id="tb-grab">줍기</button>
      <button class="tb tb-dash" data-key="KeyI">대쉬</button>
      <button class="tb tb-tac" data-key="KeyT">전술</button>
    </div>
    <button class="tb tb-pause" data-key="Escape" aria-label="일시정지">❚❚</button>`;
  stage.appendChild(root);

  const rotate = document.createElement('div');
  rotate.id = 'rotate';
  rotate.innerHTML = '<div>📱↻</div><p>화면을 가로로 돌려주세요</p>';
  document.body.appendChild(rotate);

  // ---------------- 버튼 (여러 손가락 동시 입력 지원)
  for (const b of root.querySelectorAll('[data-key]')) {
    const code = b.dataset.key;
    let pid = null;
    const release = () => {
      if (pid === null) return;
      pid = null;
      b.classList.remove('on');
      sendKey('keyup', code);
    };
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (pid !== null) return;
      pid = e.pointerId;
      try { b.setPointerCapture(e.pointerId); } catch { /* 캡처 미지원 */ }
      b.classList.add('on');
      sendKey('keydown', code);
      if (navigator.vibrate && code === 'KeyJ') navigator.vibrate(8);
    });
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
  }

  // ---------------- 가상 조이스틱 (엄지를 댄 곳이 중심)
  const zone = root.querySelector('#stick-zone');
  const base = root.querySelector('#stick-base');
  const knob = root.querySelector('#stick-knob');
  let sid = null, cx = 0, cy = 0;
  const radius = () => base.offsetWidth * 0.42;
  const setKnob = (dx, dy) => { knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };
  const resetStick = () => {
    sid = null;
    input.touchX = 0; input.touchZ = 0;
    base.classList.remove('active');
    base.style.left = ''; base.style.top = '';
    setKnob(0, 0);
  };
  zone.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (sid !== null) return;
    sid = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch { /* 캡처 미지원 */ }
    const r = zone.getBoundingClientRect();
    cx = e.clientX; cy = e.clientY;
    base.style.left = (cx - r.left) + 'px';
    base.style.top = (cy - r.top) + 'px';
    base.classList.add('active');
    setKnob(0, 0);
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== sid) return;
    e.preventDefault();
    const R = radius();
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = dx / len * R; dy = dy / len * R; }
    setKnob(dx, dy);
    const n = Math.min(1, len / R);
    const dead = 0.22;
    const mag = n < dead ? 0 : (n - dead) / (1 - dead);
    input.touchX = len ? dx / Math.hypot(dx, dy) * mag : 0;
    input.touchZ = len ? dy / Math.hypot(dx, dy) * mag : 0;
  });
  zone.addEventListener('pointerup', resetStick);
  zone.addEventListener('pointercancel', resetStick);
  zone.addEventListener('lostpointercapture', () => { if (sid !== null) resetStick(); });

  // 길게 눌러서 뜨는 메뉴·확대 방지
  stage.addEventListener('contextmenu', e => e.preventDefault());

  return {
    show(on) { root.classList.toggle('hidden', !on); if (!on) resetStick(); },
    setGrabLabel(text) { const g = root.querySelector('#tb-grab'); if (g.textContent !== text) g.textContent = text; },
  };
}
