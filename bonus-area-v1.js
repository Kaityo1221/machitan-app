(() => {
  const OFFICIAL_AREAS = {
    '佐賀県': { value: 2440.64, decimals: 2, source: '国土地理院・令和8年4月1日時点' },
    '福井県': { value: 4190.56, decimals: 2, source: '国土地理院・令和8年4月1日時点' },
    '鳥取県': { value: 3507.00, decimals: 2, source: '国土地理院・令和8年4月1日時点' },
    '徳島県': { value: 4146.96, decimals: 2, source: '国土地理院・令和8年4月1日時点' },
    '秋田県': { value: 11637.69, decimals: 2, source: '国土地理院・令和8年4月1日時点' },
    '山梨県': { value: 4465.27, decimals: 2, source: '国土地理院・令和8年4月1日時点' },
    'サンマリノ': { value: 61, decimals: 0, source: '国連統計部・総面積' },
    'リヒテンシュタイン': { value: 160, decimals: 0, source: '国連統計部・総面積' },
    'アンドラ': { value: 468, decimals: 0, source: '国連統計部・総面積' },
    'ツバル': { value: 26, decimals: 0, source: '国連統計部・総面積' },
    'ナウル': { value: 21, decimals: 0, source: '国連統計部・総面積' },
    'パラオ': { value: 459, decimals: 0, source: '国連統計部・総面積' },
    'アイスランド': { value: 103000, decimals: 0, source: '国連統計部・総面積' },
    'ポルトガル': { value: 91982, decimals: 0, source: '国連統計部・総面積' },
    'ニュージーランド': { value: 270534, decimals: 0, source: '国連統計部・総面積' },
    'モロッコ': { value: 446550, decimals: 0, source: '国連統計部・総面積' },
    'フィンランド': { value: 338145, decimals: 0, source: '国連統計部・総面積' },
    'チリ': { value: 756096, decimals: 0, source: '国連統計部・総面積' },
    'アメリカ合衆国': { value: 9629091, decimals: 0, source: '国連統計部・総面積' },
    'カナダ': { value: 9970610, decimals: 0, source: '国連統計部・総面積' }
  };

  const style = document.createElement('style');
  style.textContent = `
    .bonus-official-area-v1 {
      margin-top: 10px;
      padding: 10px 11px;
      border-radius: 13px;
      background: rgba(240,184,63,.14);
      color: #6e4b0d;
    }
    .bonus-official-area-v1 .label {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .02em;
    }
    .bonus-official-area-v1 .value {
      margin-top: 2px;
      font-size: 20px;
      font-weight: 900;
    }
    .bonus-official-area-v1 .source {
      margin-top: 2px;
      color: #8a7b63;
      font-size: 9px;
      line-height: 1.4;
    }
    .bonus-mini-area-v1 {
      margin-top: 3px;
      color: #6d5b3a;
      font-size: 11px;
      font-weight: 800;
    }
    .bonus-modal-area-v1 {
      margin-top: 4px;
      color: #6d5b3a;
      font-size: 13px;
      font-weight: 800;
    }
    .bonus-modal-source-v1 {
      margin-top: 2px;
      color: #8a7b63;
      font-size: 10px;
    }
  `;
  document.head.appendChild(style);

  function formatArea(placeName) {
    const item = OFFICIAL_AREAS[placeName];
    if (!item) return null;
    return {
      value: `${item.value.toLocaleString('ja-JP', {
        minimumFractionDigits: item.decimals,
        maximumFractionDigits: item.decimals
      })} km²`,
      source: item.source
    };
  }

  function updateWalkedAreaLabel() {
    const resultArea = document.getElementById('resultArea');
    const box = resultArea?.closest('.result-box');
    const label = box?.querySelector('.stat-label');
    if (label && label.textContent.trim() === '育てた緑') {
      label.textContent = 'あなたが歩いて育てた面積';
    }
  }

  function updateBonusCard() {
    const placeEl = document.getElementById('bonusPlace');
    const placeName = placeEl?.textContent?.trim();
    const data = formatArea(placeName);
    if (!data) return;

    const commentEl = document.getElementById('bonusComment');
    const parent = commentEl?.parentElement;
    if (!parent) return;

    let box = parent.querySelector('.bonus-official-area-v1');
    if (!box) {
      box = document.createElement('div');
      box.className = 'bonus-official-area-v1';
      commentEl.insertAdjacentElement('afterend', box);
    }

    box.innerHTML = `
      <div class="label">${placeName}の公式面積</div>
      <div class="value">${data.value}</div>
      <div class="source">出典：${data.source}</div>
    `;
  }

  function updateMiniWindow() {
    const placeEl = document.querySelector('#bonusMiniWindow .bonus-mini-place');
    const placeName = placeEl?.textContent?.trim();
    const data = formatArea(placeName);
    if (!data) return;

    let areaEl = document.querySelector('#bonusMiniWindow .bonus-mini-area-v1');
    if (!areaEl) {
      areaEl = document.createElement('div');
      areaEl.className = 'bonus-mini-area-v1';
      placeEl.insertAdjacentElement('afterend', areaEl);
    }
    areaEl.textContent = `面積 ${data.value}`;
  }

  function updateModal() {
    const titleEl = document.getElementById('bonusModalTitle');
    const placeName = titleEl?.textContent?.trim();
    const data = formatArea(placeName);
    if (!data) return;

    let areaEl = document.querySelector('#bonusMapModal .bonus-modal-area-v1');
    let sourceEl = document.querySelector('#bonusMapModal .bonus-modal-source-v1');

    if (!areaEl) {
      areaEl = document.createElement('div');
      areaEl.className = 'bonus-modal-area-v1';
      titleEl.insertAdjacentElement('afterend', areaEl);
    }
    if (!sourceEl) {
      sourceEl = document.createElement('div');
      sourceEl.className = 'bonus-modal-source-v1';
      areaEl.insertAdjacentElement('afterend', sourceEl);
    }

    areaEl.textContent = `公式面積 ${data.value}`;
    sourceEl.textContent = `出典：${data.source}`;
  }

  function refresh() {
    updateWalkedAreaLabel();
    updateBonusCard();
    updateMiniWindow();
    updateModal();
  }

  refresh();
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class']
  });
})();
