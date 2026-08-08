(() => {
  // 公式面積の表示は bonus-map.js 側へ統合済みです。
  // 旧版では MutationObserver が自身のDOM更新を再検知して
  // 計測終了時に無限ループすることがあったため、
  // このファイルは互換用の安全な補助処理だけにします。

  const resultArea = document.getElementById('resultArea');
  const box = resultArea?.closest('.result-box');
  const label = box?.querySelector('.stat-label');

  if (label && label.textContent.trim() === '育てた緑') {
    label.textContent = 'あなたが歩いて育てた面積';
  }
})();
