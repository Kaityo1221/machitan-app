(() => {
  const style = document.createElement('style');
  style.textContent = `
    body.machitan-result-sequence-pending #bonusMiniWindow.is-visible {
      opacity: 0 !important;
      transform: translateY(18px) scale(.96) !important;
      pointer-events: none !important;
    }
    body.machitan-result-sequence-pending #resultScreen .bonus-card {
      opacity: 0;
      transform: translateY(14px);
      pointer-events: none;
    }
    body.machitan-result-sequence-pending #areaFinaleCard .area-finale-breakdown,
    body.machitan-result-sequence-pending #areaFinaleCard .area-finale-note,
    body.machitan-result-sequence-pending #areaFinaleCard .area-finale-replay {
      display: none !important;
    }
    #resultScreen .bonus-card {
      transition: opacity .45s ease, transform .45s ease;
    }
    #machitanResultSequenceOverlay {
      position: fixed;
      inset: 0;
      z-index: 12000;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(247,248,242,.74);
      backdrop-filter: blur(9px);
      -webkit-backdrop-filter: blur(9px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .25s ease;
    }
    #machitanResultSequenceOverlay.is-visible {
      opacity: 1;
    }
    .machitan-result-sequence-card {
      width: min(88vw, 390px);
      padding: 28px 22px;
      border-radius: 26px;
      background: rgba(255,255,255,.97);
      box-shadow: 0 22px 70px rgba(36,51,37,.18);
      text-align: center;
      transform: scale(.94) translateY(8px);
      transition: transform .28s cubic-bezier(.2,.85,.25,1);
    }
    #machitanResultSequenceOverlay.is-visible .machitan-result-sequence-card {
      transform: scale(1) translateY(0);
    }
    .machitan-sequence-kicker {
      color: #7b827c;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .12em;
    }
    .machitan-sequence-main {
      margin-top: 8px;
      color: #243325;
      font-size: 38px;
      line-height: 1.2;
      font-weight: 950;
      letter-spacing: -.04em;
    }
    .machitan-sequence-main.bonus {
      color: #6e4b0d;
      font-size: 30px;
    }
    .machitan-sequence-place {
      margin-top: 10px;
      color: #9a6810;
      font-size: 42px;
      line-height: 1.1;
      font-weight: 950;
      letter-spacing: -.03em;
    }
    .machitan-sequence-note {
      margin-top: 10px;
      color: #6b756d;
      font-size: 12px;
      line-height: 1.55;
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'machitanResultSequenceOverlay';
  overlay.innerHTML = `
    <div class="machitan-result-sequence-card">
      <div id="machitanSequenceKicker" class="machitan-sequence-kicker"></div>
      <div id="machitanSequenceMain" class="machitan-sequence-main"></div>
      <div id="machitanSequencePlace" class="machitan-sequence-place"></div>
      <div id="machitanSequenceNote" class="machitan-sequence-note"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  let timers = [];
  let sequenceArmed = false;
  let sequencePlayed = false;

  function clearTimers() {
    timers.forEach((timer) => clearTimeout(timer));
    timers = [];
  }

  function schedule(callback, delay) {
    const timer = setTimeout(callback, delay);
    timers.push(timer);
    return timer;
  }

  function setOverlayContent({ kicker = '', main = '', place = '', note = '', bonus = false }) {
    document.getElementById('machitanSequenceKicker').textContent = kicker;
    const mainEl = document.getElementById('machitanSequenceMain');
    mainEl.textContent = main;
    mainEl.classList.toggle('bonus', bonus);
    document.getElementById('machitanSequencePlace').textContent = place;
    document.getElementById('machitanSequenceNote').textContent = note;
  }

  function showOverlay() {
    overlay.classList.add('is-visible');
  }

  function hideOverlay() {
    overlay.classList.remove('is-visible');
  }

  function getCurrentBonus() {
    try {
      if (typeof getBonusResult === 'function' && typeof currentEvent !== 'undefined' && currentEvent) {
        return getBonusResult(currentEvent.code);
      }
    } catch (error) {
      console.error(error);
    }
    return null;
  }

  function revealBonusResult() {
    document.body.classList.remove('machitan-result-sequence-pending');
  }

  function runResultSequence() {
    if (!sequenceArmed || sequencePlayed) return;
    sequencePlayed = true;
    clearTimers();
    hideOverlay();

    const bonus = getCurrentBonus();

    // カウンター停止後、少し余韻を置いてから「おや？」。
    schedule(() => {
      setOverlayContent({
        kicker: 'EVENT RESULT',
        main: 'おや？'
      });
      showOverlay();
    }, 1000);

    schedule(() => {
      hideOverlay();
    }, 1800);

    schedule(() => {
      setOverlayContent({
        kicker: '飛び地ボーナス',
        main: '賛同した土地が見つかりました',
        place: bonus?.place?.name || 'どこかの土地',
        note: bonus?.place?.name
          ? `あなたの想いに${bonus.place.name}の住民が賛同しました。`
          : '',
        bonus: true
      });
      showOverlay();
    }, 2050);

    schedule(() => {
      hideOverlay();
      revealBonusResult();
      window.dispatchEvent(new CustomEvent('machitan:bonus-revealed'));
    }, 3400);
  }

  window.addEventListener('machitan:area-counter-settled', runResultSequence);

  const previousShowResult = window.showResult;
  if (typeof previousShowResult === 'function') {
    window.showResult = function (...args) {
      clearTimers();
      hideOverlay();
      sequenceArmed = true;
      sequencePlayed = false;
      document.body.classList.add('machitan-result-sequence-pending');
      return previousShowResult.apply(this, args);
    };
  }

  const previousReturnToApp = window.returnToApp;
  if (typeof previousReturnToApp === 'function') {
    window.returnToApp = function (...args) {
      clearTimers();
      hideOverlay();
      sequenceArmed = false;
      sequencePlayed = false;
      document.body.classList.remove('machitan-result-sequence-pending');
      return previousReturnToApp.apply(this, args);
    };
  }
})();
