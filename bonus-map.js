(() => {
  const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

  const OFFICIAL_AREAS = {
    '佐賀県': { areaKm2: 2440.64, decimals: 2, source: '国土地理院', asOf: '2026年4月1日時点' },
    '福井県': { areaKm2: 4190.56, decimals: 2, source: '国土地理院', asOf: '2026年4月1日時点' },
    '鳥取県': { areaKm2: 3507.00, decimals: 2, source: '国土地理院', asOf: '2026年4月1日時点' },
    '徳島県': { areaKm2: 4146.96, decimals: 2, source: '国土地理院', asOf: '2026年4月1日時点' },
    '秋田県': { areaKm2: 11637.69, decimals: 2, source: '国土地理院', asOf: '2026年4月1日時点' },
    '山梨県': { areaKm2: 4465.27, decimals: 2, source: '国土地理院', asOf: '2026年4月1日時点' },
    'サンマリノ': { areaKm2: 61, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'リヒテンシュタイン': { areaKm2: 160, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'アンドラ': { areaKm2: 468, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'ツバル': { areaKm2: 26, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'ナウル': { areaKm2: 21, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'パラオ': { areaKm2: 459, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'アイスランド': { areaKm2: 103000, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'ポルトガル': { areaKm2: 91982, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'ニュージーランド': { areaKm2: 270534, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'モロッコ': { areaKm2: 446550, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'フィンランド': { areaKm2: 338145, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'チリ': { areaKm2: 756096, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'アメリカ合衆国': { areaKm2: 9629091, decimals: 0, source: '国連統計部', asOf: '総面積データ' },
    'カナダ': { areaKm2: 9970610, decimals: 0, source: '国連統計部', asOf: '総面積データ' }
  };

  const style = document.createElement('style');
  style.textContent = `
    #bonusMiniWindow {
      position: fixed;
      right: 14px;
      bottom: calc(14px + env(safe-area-inset-bottom));
      width: 168px;
      border: 1px solid rgba(154,104,16,.22);
      border-radius: 18px;
      overflow: hidden;
      background: rgba(255,252,244,.97);
      box-shadow: 0 14px 34px rgba(54,49,34,.24);
      z-index: 5000;
      opacity: 0;
      transform: translateY(18px) scale(.96);
      pointer-events: none;
      transition: opacity .22s ease, transform .22s ease;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }
    #bonusMiniWindow.is-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    #bonusMiniWindow button { font: inherit; }
    .bonus-mini-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 9px 10px 7px;
      color: #6e4b0d;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .04em;
    }
    .bonus-mini-close {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgba(110,75,13,.09);
      color: #6e4b0d;
      font-size: 15px;
      line-height: 24px;
    }
    #bonusMiniMap {
      height: 108px;
      background: #dce9ef;
      cursor: pointer;
    }
    .bonus-mini-foot {
      padding: 8px 10px 10px;
      cursor: pointer;
    }
    .bonus-mini-place {
      color: #6e4b0d;
      font-size: 15px;
      font-weight: 900;
      line-height: 1.25;
    }
    .bonus-mini-area {
      margin-top: 3px;
      color: #6d5b3a;
      font-size: 11px;
      font-weight: 800;
    }
    .bonus-mini-hint {
      margin-top: 4px;
      color: #81725a;
      font-size: 10px;
    }
    #bonusMapModal {
      position: fixed;
      inset: 0;
      display: none;
      align-items: flex-end;
      justify-content: center;
      padding: 18px 12px calc(18px + env(safe-area-inset-bottom));
      background: rgba(24,31,26,.54);
      z-index: 9000;
    }
    #bonusMapModal.is-open { display: flex; }
    .bonus-modal-card {
      width: min(100%, 560px);
      max-height: 88vh;
      overflow: hidden;
      border-radius: 26px;
      background: #fffdf7;
      box-shadow: 0 24px 70px rgba(16,24,18,.34);
      animation: bonusModalIn .2s ease-out;
    }
    @keyframes bonusModalIn {
      from { transform: translateY(24px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .bonus-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 15px 16px 12px;
    }
    .bonus-modal-kicker {
      color: #9a6810;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .08em;
    }
    .bonus-modal-title {
      margin-top: 2px;
      color: #44351c;
      font-size: 22px;
      font-weight: 900;
    }
    .bonus-modal-area {
      margin-top: 4px;
      color: #6d5b3a;
      font-size: 13px;
      font-weight: 800;
    }
    .bonus-modal-source {
      margin-top: 2px;
      color: #8a7b63;
      font-size: 10px;
    }
    .bonus-modal-close {
      flex: 0 0 auto;
      width: 38px;
      height: 38px;
      border: 0;
      border-radius: 50%;
      background: #efe7d6;
      color: #6e4b0d;
      font-size: 22px;
      line-height: 38px;
    }
    #bonusLargeMap {
      height: min(58vh, 470px);
      background: #dce9ef;
    }
    .bonus-modal-note {
      padding: 11px 16px 15px;
      color: #766a58;
      font-size: 11px;
      line-height: 1.55;
    }
    .bonus-map-loading,
    .bonus-map-error {
      display: grid;
      place-items: center;
      height: 100%;
      padding: 16px;
      text-align: center;
      font-size: 12px;
      font-weight: 800;
    }
    .bonus-map-loading {
      color: #6e4b0d;
      background: linear-gradient(145deg,#fff8e7,#eef5ea);
    }
    .bonus-map-error {
      color: #7b4d45;
      background: #fff4f1;
    }
    .leaflet-control-attribution { font-size: 9px !important; }
    .bonus-highlight-path { filter: drop-shadow(0 4px 7px rgba(80,61,19,.24)); }
    .bonus-official-area {
      margin-top: 8px;
      padding: 9px 10px;
      border-radius: 12px;
      background: rgba(240,184,63,.14);
      color: #6e4b0d;
    }
    .bonus-official-area-label {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .03em;
    }
    .bonus-official-area-value {
      margin-top: 2px;
      font-size: 18px;
      font-weight: 900;
    }
    .bonus-official-area-source {
      margin-top: 2px;
      color: #8a7b63;
      font-size: 9px;
    }
    .walked-area-note {
      margin-top: 5px;
      color: #6b756d;
      font-size: 10px;
      line-height: 1.45;
    }
    .walked-area-preview-card {
      margin-top: 12px;
      padding: 16px;
      border-radius: 22px;
      background: #fff;
      box-shadow: 0 14px 40px rgba(45,72,48,.1);
    }
    .walked-area-preview-label {
      color: #6b756d;
      font-size: 12px;
    }
    .walked-area-preview-value {
      margin-top: 6px;
      color: #243325;
      font-size: 24px;
      font-weight: 900;
    }
  `;
  document.head.appendChild(style);

  const mini = document.createElement('aside');
  mini.id = 'bonusMiniWindow';
  mini.innerHTML = `
    <div class="bonus-mini-head">
      <span>当たった土地はここ</span>
      <button type="button" class="bonus-mini-close" aria-label="小窓を閉じる">×</button>
    </div>
    <div id="bonusMiniMap"><div class="bonus-map-loading">地図を準備中…</div></div>
    <div class="bonus-mini-foot">
      <div id="bonusMiniPlace" class="bonus-mini-place"></div>
      <div id="bonusMiniArea" class="bonus-mini-area"></div>
      <div class="bonus-mini-hint">タップで拡大・ズーム</div>
    </div>
  `;
  document.body.appendChild(mini);

  const modal = document.createElement('div');
  modal.id = 'bonusMapModal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <section class="bonus-modal-card">
      <div class="bonus-modal-head">
        <div>
          <div class="bonus-modal-kicker">飛び地ボーナス</div>
          <div id="bonusModalTitle" class="bonus-modal-title"></div>
          <div id="bonusModalArea" class="bonus-modal-area"></div>
          <div id="bonusModalSource" class="bonus-modal-source"></div>
        </div>
        <button type="button" class="bonus-modal-close" aria-label="地図を閉じる">×</button>
      </div>
      <div id="bonusLargeMap"><div class="bonus-map-loading">塗りつぶし地図を準備中…</div></div>
      <div class="bonus-modal-note">当たった県・国の輪郭を塗っています。ピンチ操作やダブルタップでズームできます。地図データ © OpenStreetMap contributors</div>
    </section>
  `;
  document.body.appendChild(modal);

  let miniMap = null;
  let largeMap = null;
  let currentBonus = null;
  let currentGeometry = null;
  let leafletReadyPromise = null;

  function getOfficialArea(placeName) {
    return OFFICIAL_AREAS[placeName] || null;
  }

  function formatOfficialArea(areaInfo) {
    if (!areaInfo) return '面積情報なし';
    return `${areaInfo.areaKm2.toLocaleString('ja-JP', {
      minimumFractionDigits: areaInfo.decimals,
      maximumFractionDigits: areaInfo.decimals
    })} km²`;
  }

  function formatWalkedArea(squareMeters) {
    if (!Number.isFinite(squareMeters)) return '0 m²';
    if (squareMeters >= 10000) return `${(squareMeters / 10000).toFixed(2)} ha`;
    return `${Math.round(squareMeters).toLocaleString('ja-JP')} m²`;
  }

  function normalizeBonus(bonus) {
    if (!bonus?.place?.name) return bonus;
    return {
      ...bonus,
      comment: `あなたの想いに${bonus.place.name}の住民が賛同しました。`,
      officialArea: getOfficialArea(bonus.place.name)
    };
  }

  function updateResultAreaLabels() {
    const resultArea = document.getElementById('resultArea');
    if (resultArea) {
      const box = resultArea.closest('.result-box');
      const label = box?.querySelector('.stat-label');
      if (label) label.textContent = 'あなたが歩いて育てた面積';

      let note = box?.querySelector('.walked-area-note');
      if (!note && box) {
        note = document.createElement('div');
        note.className = 'walked-area-note';
        note.textContent = '発見したポイポイ周辺の、重なりを除いた範囲です。';
        box.appendChild(note);
      }
      return;
    }

    const previewResult = document.querySelector('#resultScreen .result');
    if (previewResult && !document.getElementById('walkedAreaPreviewCard')) {
      const card = document.createElement('section');
      card.id = 'walkedAreaPreviewCard';
      card.className = 'walked-area-preview-card';
      card.innerHTML = `
        <div class="walked-area-preview-label">あなたが歩いて育てた面積</div>
        <div id="walkedAreaPreviewValue" class="walked-area-preview-value">8,481 m²</div>
        <div class="walked-area-note">Webテストでは3つのポイポイを発見した想定です。</div>
      `;
      previewResult.insertAdjacentElement('afterend', card);
    }
  }

  function updateBonusCard(bonus) {
    const placeEl = document.getElementById('bonusPlace');
    const commentEl = document.getElementById('bonusComment');
    if (placeEl) placeEl.textContent = bonus.place.name;
    if (commentEl) commentEl.textContent = bonus.comment;

    const card = document.querySelector('.bonus-card, .bonus');
    if (!card) return;

    let areaBox = card.querySelector('.bonus-official-area');
    if (!areaBox) {
      areaBox = document.createElement('div');
      areaBox.className = 'bonus-official-area';
      const commentTarget = commentEl || card.querySelector('.bonus-comment');
      if (commentTarget) commentTarget.insertAdjacentElement('afterend', areaBox);
      else card.appendChild(areaBox);
    }

    const areaInfo = bonus.officialArea;
    areaBox.innerHTML = `
      <div class="bonus-official-area-label">${bonus.place.name}の公式面積</div>
      <div class="bonus-official-area-value">${formatOfficialArea(areaInfo)}</div>
      <div class="bonus-official-area-source">出典：${areaInfo?.source || '未設定'}${areaInfo?.asOf ? `（${areaInfo.asOf}）` : ''}</div>
    `;
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletReadyPromise) return leafletReadyPromise;

    leafletReadyPromise = new Promise((resolve, reject) => {
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = LEAFLET_CSS;
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = LEAFLET_JS;
      script.async = true;
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error('Leafletを読み込めませんでした'));
      document.head.appendChild(script);
    });

    return leafletReadyPromise;
  }

  function queryForBonus(bonus) {
    return bonus.category === 'prefecture' ? `${bonus.place.name}, 日本` : bonus.place.name;
  }

  function cacheKey(bonus) {
    return `machitan-bonus-geometry-v1:${bonus.category}:${bonus.place.name}`;
  }

  async function fetchGeometry(bonus) {
    const key = cacheKey(bonus);
    const cached = localStorage.getItem(key);
    if (cached) {
      try { return JSON.parse(cached); } catch (_) {}
    }

    const params = new URLSearchParams({
      q: queryForBonus(bonus),
      format: 'jsonv2',
      polygon_geojson: '1',
      polygon_threshold: '0.01',
      limit: '1',
      'accept-language': 'ja'
    });
    if (bonus.category === 'prefecture') params.set('countrycodes', 'jp');

    const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`境界データ取得エラー: ${response.status}`);

    const results = await response.json();
    const result = {
      geometry: results?.[0]?.geojson || null,
      lat: Number(results?.[0]?.lat ?? bonus.place.lat),
      lng: Number(results?.[0]?.lon ?? bonus.place.lng),
      displayName: results?.[0]?.display_name || bonus.place.name
    };
    localStorage.setItem(key, JSON.stringify(result));
    return result;
  }

  function destroyMap(map) {
    if (!map) return null;
    map.remove();
    return null;
  }

  function createMap(targetId, interactive) {
    const map = window.L.map(targetId, {
      zoomControl: interactive,
      attributionControl: true,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      tap: interactive
    });

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    return map;
  }

  function addHighlight(map, bonus, data, compact) {
    let layer = null;

    if (data.geometry) {
      layer = window.L.geoJSON(data.geometry, {
        style: {
          color: '#8a5b00',
          weight: compact ? 2 : 3,
          opacity: 1,
          fillColor: '#f0b83f',
          fillOpacity: compact ? 0.72 : 0.78,
          className: 'bonus-highlight-path'
        }
      }).addTo(map);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: compact ? [8, 8] : [28, 28],
          maxZoom: bonus.category === 'prefecture' ? (compact ? 6 : 8) : (compact ? 4 : 6)
        });
      }
    }

    if (!layer) {
      const center = [data.lat || bonus.place.lat, data.lng || bonus.place.lng];
      window.L.circle(center, {
        radius: bonus.category === 'prefecture' ? 35000 : 90000,
        color: '#8a5b00',
        weight: compact ? 2 : 3,
        fillColor: '#f0b83f',
        fillOpacity: .75
      }).addTo(map);
      map.setView(center, bonus.category === 'prefecture' ? (compact ? 6 : 8) : (compact ? 4 : 6));
    }

    setTimeout(() => map.invalidateSize(), 60);
  }

  async function renderMiniMap(bonus) {
    const target = document.getElementById('bonusMiniMap');
    target.innerHTML = '<div class="bonus-map-loading">地図を準備中…</div>';
    document.getElementById('bonusMiniPlace').textContent = bonus.place.name;
    document.getElementById('bonusMiniArea').textContent = `面積 ${formatOfficialArea(bonus.officialArea)}`;

    try {
      await loadLeaflet();
      currentGeometry = await fetchGeometry(bonus);
      miniMap = destroyMap(miniMap);
      target.innerHTML = '';
      miniMap = createMap('bonusMiniMap', false);
      addHighlight(miniMap, bonus, currentGeometry, true);
    } catch (error) {
      target.innerHTML = '<div class="bonus-map-error">地図を表示できませんでした</div>';
      console.error(error);
    }
  }

  async function openModal() {
    if (!currentBonus) return;
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    document.getElementById('bonusModalTitle').textContent = currentBonus.place.name;
    document.getElementById('bonusModalArea').textContent = `公式面積 ${formatOfficialArea(currentBonus.officialArea)}`;
    document.getElementById('bonusModalSource').textContent = currentBonus.officialArea
      ? `出典：${currentBonus.officialArea.source}（${currentBonus.officialArea.asOf}）`
      : '';

    const target = document.getElementById('bonusLargeMap');
    target.innerHTML = '<div class="bonus-map-loading">塗りつぶし地図を準備中…</div>';

    try {
      await loadLeaflet();
      if (!currentGeometry) currentGeometry = await fetchGeometry(currentBonus);
      largeMap = destroyMap(largeMap);
      target.innerHTML = '';
      largeMap = createMap('bonusLargeMap', true);
      addHighlight(largeMap, currentBonus, currentGeometry, false);
    } catch (error) {
      target.innerHTML = '<div class="bonus-map-error">境界地図を表示できませんでした</div>';
      console.error(error);
    }
  }

  function closeModal() {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function showMiniWindow(rawBonus) {
    const bonus = normalizeBonus(rawBonus);
    currentBonus = bonus;
    currentGeometry = null;
    updateResultAreaLabels();
    updateBonusCard(bonus);
    mini.classList.add('is-visible');
    renderMiniMap(bonus);
  }

  function hideMiniWindow() {
    mini.classList.remove('is-visible');
    closeModal();
  }

  mini.querySelector('.bonus-mini-close').addEventListener('click', (event) => {
    event.stopPropagation();
    hideMiniWindow();
  });
  mini.querySelector('#bonusMiniMap').addEventListener('click', openModal);
  mini.querySelector('.bonus-mini-foot').addEventListener('click', openModal);
  modal.querySelector('.bonus-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  updateResultAreaLabels();

  const originalShowResult = window.showResult;
  if (typeof originalShowResult === 'function') {
    window.showResult = function (...args) {
      const result = originalShowResult.apply(this, args);
      try {
        if (typeof getBonusResult === 'function' && typeof currentEvent !== 'undefined' && currentEvent) {
          const bonus = normalizeBonus(getBonusResult(currentEvent.code));
          updateBonusCard(bonus);
          showMiniWindow(bonus);
        }
      } catch (error) {
        console.error(error);
      }
      return result;
    };
  }

  const originalReturnToApp = window.returnToApp;
  if (typeof originalReturnToApp === 'function') {
    window.returnToApp = function (...args) {
      hideMiniWindow();
      return originalReturnToApp.apply(this, args);
    };
  }

  const observer = new MutationObserver(() => {
    const resultScreen = document.getElementById('resultScreen');
    if (resultScreen?.classList.contains('hidden')) hideMiniWindow();
  });
  const resultScreen = document.getElementById('resultScreen');
  if (resultScreen) observer.observe(resultScreen, { attributes: true, attributeFilter: ['class'] });
})();
