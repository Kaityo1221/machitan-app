(() => {
  let flowTimers = [];
  let flowFrame = null;
  let setupQueued = false;

  function clearFlowTimers() {
    flowTimers.forEach(clearTimeout);
    flowTimers = [];
    if (flowFrame) {
      cancelAnimationFrame(flowFrame);
      flowFrame = null;
    }
  }

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    flowTimers.push(id);
    return id;
  }

  function parseKm2(text) {
    const n = Number(String(text || '').replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/)?.[0]);
    return Number.isFinite(n) ? n : 0;
  }

  function fmt(value) {
    return Number(value || 0).toLocaleString('ja-JP', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    });
  }

  function animateCounter(from, to, duration, done) {
    const counter = document.getElementById('areaFinaleCounter');
    const number = counter?.querySelector('span');
    if (!counter || !number) return;

    counter.classList.remove('is-settled');
    counter.classList.add('is-spinning');
    const started = performance.now();

    const tick = (now) => {
      const p = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      const value = from + (to - from) * eased;
      number.textContent = fmt(value);

      if (p < 1) {
        flowFrame = requestAnimationFrame(tick);
      } else {
        number.textContent = fmt(to);
        counter.classList.remove('is-spinning');
        counter.classList.add('is-settled');
        flowFrame = null;
        done?.();
      }
    };

    flowFrame = requestAnimationFrame(tick);
  }

  function showSequence({ kicker = '', main = '', place = '', note = '', bonus = false }) {
    const overlay = document.getElementById('machitanResultSequenceOverlay');
    if (!overlay) return;
    const kickerEl = document.getElementById('machitanSequenceKicker');
    const mainEl = document.getElementById('machitanSequenceMain');
    const placeEl = document.getElementById('machitanSequencePlace');
    const noteEl = document.getElementById('machitanSequenceNote');

    if (kickerEl) kickerEl.textContent = kicker;
    if (mainEl) {
      mainEl.textContent = main;
      mainEl.classList.toggle('bonus', bonus);
    }
    if (placeEl) placeEl.textContent = place;
    if (noteEl) noteEl.textContent = note;
    overlay.classList.add('is-visible');
  }

  function hideSequence() {
    document.getElementById('machitanResultSequenceOverlay')?.classList.remove('is-visible');
  }

  function getOwnKm2() {
    try {
      return (Number(growthAreaValue()) || 0) / 1000000;
    } catch (_) {
      return 0;
    }
  }

  function getBonusInfo() {
    let bonus = null;
    try {
      bonus = getBonusResult(currentEvent.code);
    } catch (_) {}

    const areaText = document.querySelector('.bonus-official-area-value')?.textContent || '';
    return {
      place: bonus?.place?.name || document.getElementById('bonusPlace')?.textContent || 'どこかの土地',
      comment: bonus?.comment || document.getElementById('bonusComment')?.textContent || '',
      areaKm2: parseKm2(areaText)
    };
  }

  function concealBonus() {
    const bonusCard = document.querySelector('#resultScreen .bonus-card');
    if (bonusCard) bonusCard.style.setProperty('display', 'none', 'important');

    const mini = document.getElementById('bonusMiniWindow');
    if (mini) {
      mini.style.setProperty('visibility', 'hidden', 'important');
      mini.style.setProperty('pointer-events', 'none', 'important');
    }
  }

  function revealBonus() {
    document.body.classList.remove('machitan-result-sequence-pending');

    const bonusCard = document.querySelector('#resultScreen .bonus-card');
    if (bonusCard) bonusCard.style.removeProperty('display');

    const mini = document.getElementById('bonusMiniWindow');
    if (mini) {
      mini.style.removeProperty('visibility');
      mini.style.removeProperty('pointer-events');
    }
  }

  function runAfterOwnCounter() {
    const bonus = getBonusInfo();
    const ownKm2 = getOwnKm2();

    later(() => {
      showSequence({ kicker: 'EVENT RESULT', main: 'おや？' });
    }, 1500);

    later(() => hideSequence(), 2800);

    later(() => {
      showSequence({
        kicker: '飛び地ボーナス',
        main: '賛同した土地が見つかりました',
        place: bonus.place,
        note: bonus.comment,
        bonus: true
      });
    }, 3050);

    later(() => {
      hideSequence();
      revealBonus();

      const breakdown = document.querySelector('#areaFinaleContent .area-finale-breakdown');
      const note = document.querySelector('#areaFinaleContent .area-finale-note');
      const replay = document.getElementById('areaFinaleReplay');
      const walked = document.getElementById('areaFinaleWalked');
      const bonusValue = document.getElementById('areaFinaleBonus');
      const totalLabel = document.querySelector('#areaFinaleContent .area-finale-total-label');

      if (breakdown) breakdown.style.display = 'grid';
      if (note) note.style.display = 'block';
      if (replay) replay.style.display = 'none';
      if (walked) walked.textContent = `${fmt(ownKm2)} km²`;
      if (bonusValue) bonusValue.textContent = `${fmt(bonus.areaKm2)} km²`;
      if (totalLabel) totalLabel.textContent = 'あなたが広げた範囲';

      animateCounter(ownKm2, ownKm2 + bonus.areaKm2, 2100, () => {
        if (replay) replay.style.display = 'block';
      });
    }, 4400);
  }

  function startOwnCounter() {
    clearFlowTimers();
    concealBonus();

    const reveal = document.getElementById('areaFinaleReveal');
    const content = document.getElementById('areaFinaleContent');
    const breakdown = document.querySelector('#areaFinaleContent .area-finale-breakdown');
    const note = document.querySelector('#areaFinaleContent .area-finale-note');
    const replay = document.getElementById('areaFinaleReplay');
    const totalLabel = document.querySelector('#areaFinaleContent .area-finale-total-label');
    const number = document.querySelector('#areaFinaleCounter span');

    if (reveal) reveal.style.setProperty('display', 'none', 'important');
    if (content) content.style.setProperty('display', 'block', 'important');
    if (breakdown) breakdown.style.setProperty('display', 'none', 'important');
    if (note) note.style.setProperty('display', 'none', 'important');
    if (replay) replay.style.setProperty('display', 'none', 'important');
    if (totalLabel) totalLabel.textContent = 'あなたが歩いて広げた範囲';
    if (number) number.textContent = '';

    const ownKm2 = getOwnKm2();
    animateCounter(0, ownKm2, 2100, runAfterOwnCounter);
  }

  function setupFlow() {
    setupQueued = false;
    clearFlowTimers();
    hideSequence();
    document.body.classList.add('machitan-result-sequence-pending');
    concealBonus();

    const reveal = document.getElementById('areaFinaleReveal');
    const content = document.getElementById('areaFinaleContent');
    const button = document.getElementById('areaFinaleStart');
    const number = document.querySelector('#areaFinaleCounter span');

    if (reveal) reveal.style.setProperty('display', 'grid', 'important');
    if (content) content.style.setProperty('display', 'none', 'important');
    if (number) number.textContent = '';

    if (button && !button.dataset.flowV3) {
      const cleanButton = button.cloneNode(true);
      cleanButton.dataset.flowV3 = '1';
      button.replaceWith(cleanButton);
      cleanButton.addEventListener('click', startOwnCounter);
    }
  }

  function queueSetup() {
    if (setupQueued) return;
    setupQueued = true;
    requestAnimationFrame(() => requestAnimationFrame(setupFlow));
  }

  const previousShowResult = window.showResult;
  if (typeof previousShowResult === 'function') {
    window.showResult = function (...args) {
      const result = previousShowResult.apply(this, args);
      queueSetup();
      return result;
    };
  }

  const resultScreen = document.getElementById('resultScreen');
  if (resultScreen) {
    new MutationObserver(() => {
      if (!resultScreen.classList.contains('hidden')) queueSetup();
      else clearFlowTimers();
    }).observe(resultScreen, { attributes: true, attributeFilter: ['class'] });
  }
})();
