// Chart.jsとchartjs-adapter-date-fnsはHTMLでローカルファイルから読み込まれています

document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyButton = document.getElementById('saveApiKeyButton');
  const stockCodeInput = document.getElementById('stockCodeInput');
  const addCodeButton = document.getElementById('addCodeButton');
  const codeListElement = document.getElementById('codeList');
  const chartCanvas = document.getElementById('stockChart').getContext('2d');
  const loadingIndicator = document.getElementById('loadingIndicator');

  let apiKey = ''; // Alpha Vantage APIキー
  let stockCodes = []; // 管理する株コードの配列
  let chartInstance = null; // Chart.jsのインスタンスを保持

  // --- データ管理 ---

  // APIキーを取得する
  function loadApiKey() {
    chrome.runtime.sendMessage({ action: 'getApiKey' }, function(response) {
      if (response && response.success) {
        apiKey = response.apiKey || ''; // APIキーがない場合は空文字を設定
        apiKeyInput.value = apiKey;

        // 先にストレージからコードを読み込む
        loadCodesFromStorage();

        // APIキーがない場合は警告を表示
        if (!apiKey) {
          alert('Alpha Vantage APIキーを設定してください。');
        }
        // APIキーがある場合は、コード読み込み後にチャートをロード
        // (loadCodesFromStorage内でチャートロードが呼ばれる)
      } else {
        // エラーの場合やレスポンスがない場合もコードは読み込む
        loadCodesFromStorage();
        alert('APIキーの取得に失敗しました。');
      }
    });
  }

  // APIキーを保存する
  function saveApiKey() {
    const newApiKey = apiKeyInput.value.trim();
    if (newApiKey) {
      chrome.runtime.sendMessage(
        { action: 'saveApiKey', apiKey: newApiKey },
        function(response) {
          if (response && response.success) {
            apiKey = newApiKey;
            alert('APIキーが保存されました。');
            loadCodesFromStorage(); // APIキーが更新されたので株価データを再読み込み
          }
        }
      );
    } else {
      alert('有効なAPIキーを入力してください。');
    }
  }

  // ストレージからコードを読み込む
  function loadCodesFromStorage() {
    chrome.storage.local.get(['stockCodes'], function(result) {
      // ストレージにデータがあり、それが配列の場合
      if (result.stockCodes && Array.isArray(result.stockCodes)) {
        stockCodes = result.stockCodes; // 読み込んだコードを代入
      } else {
        // ストレージにデータがない、または形式が不正な場合は空にする
        stockCodes = [];
      }

      renderCodeList(); // UIにリストを描画

      // APIキーが設定されていれば株価データを読み込む
      if (apiKey) {
        loadAndRenderChart(); // 保存されているコードでチャートを初期表示
      }
    });
  }

  // ストレージにコードを保存する
  function saveCodesToStorage() {
    chrome.storage.local.set({ stockCodes: stockCodes });
  }

  // --- UI更新 ---

  // コードリストをUIに描画する
  function renderCodeList() {
    codeListElement.innerHTML = ''; // リストをクリア
    stockCodes.forEach(code => {
      const listItem = document.createElement('li');
      listItem.textContent = code;

      const removeButton = document.createElement('button');
      removeButton.textContent = 'Remove';
      removeButton.classList.add('removeButton');
      removeButton.dataset.code = code; // 削除対象のコードを特定するため

      listItem.appendChild(removeButton);
      codeListElement.appendChild(listItem);
    });
  }

  // --- イベントリスナー ---

  // コード追加ボタンの処理
  addCodeButton.addEventListener('click', function() {
    let newCode = stockCodeInput.value.trim().toUpperCase();
    
    
    
    if (newCode && !stockCodes.includes(newCode)) {
      stockCodes.push(newCode);
      stockCodeInput.value = ''; // 入力欄をクリア
      renderCodeList();
      saveCodesToStorage();
      loadAndRenderChart(); // チャートを更新
    } else if (stockCodes.includes(newCode)) {
      alert(`${newCode} is already in the list.`);
    } else {
        alert('Please enter a stock code.');
    }
  });

  // Enterキーでも追加できるようにする
  stockCodeInput.addEventListener('keypress', function(event) {
      if (event.key === 'Enter') {
          addCodeButton.click(); // 追加ボタンのクリックイベントを発火
          // 注: addCodeButtonのクリックイベントで日本の株式コード処理が行われます
      }
  });

  // コード削除ボタンの処理（イベント委任）
  codeListElement.addEventListener('click', function(event) {
    if (event.target.classList.contains('removeButton')) {
      const codeToRemove = event.target.dataset.code;
      stockCodes = stockCodes.filter(code => code !== codeToRemove);
      renderCodeList();
      saveCodesToStorage();
      loadAndRenderChart(); // チャートを更新
    }
  });

  // --- チャート処理 ---

  // 指定されたコードの株価データを取得する関数
  async function fetchStockData(stockCode) {
    try {
      // APIキーが設定されていない場合はnullを返す
      if (!apiKey) {
        alert('Alpha Vantage APIキーを設定してください。');
        return null;
      }
      
      // バックグラウンドスクリプトにメッセージを送信
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: 'fetchStockData',
            stockCode: stockCode,
            apiKey: apiKey
          },
          response => {
            // レスポンスを処理
            if (response && response.success) {
              const data = response.data;
              
              if (data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].timestamp && data.chart.result[0].indicators.quote[0].close) {
                const timestamps = data.chart.result[0].timestamp;
                const prices = data.chart.result[0].indicators.quote[0].close;

                // タイムスタンプと価格のペアの配列を作成 (nullを除外)
                const validData = timestamps.map((timestamp, index) => {
                    const price = prices[index];
                    // timestampとpriceの両方が有効な数値である場合のみ採用
                    if (timestamp != null && price != null && !isNaN(price)) {
                        return { x: new Date(timestamp * 1000), y: price };
                    }
                    return null;
                }).filter(item => item !== null); // nullのエントリを除外

                resolve({
                  code: stockCode,
                  data: validData
                });
              } else {
                console.error(`Invalid data format for ${stockCode}`, data);
                resolve(null);
              }
            } else {
              // エラーの場合
              const errorMsg = response ? response.error : 'Unknown error';
              console.error(`Error fetching data for ${stockCode}: ${errorMsg}`);
              
              // APIキーに関するエラーの場合は特別なメッセージを表示
              if (errorMsg.includes('API key')) {
                alert('APIキーが無効または制限に達しました。APIキーを確認してください。');
              }
              
              resolve(null);
            }
          }
        );
      });
    } catch (error) {
      console.error(`Error processing data for ${stockCode}:`, error);
      return null;
    }
  }

  // 複数のコードのデータを取得し、チャートを描画する関数
  async function loadAndRenderChart() {
    if (chartInstance) {
      chartInstance.destroy(); // 既存のチャートを破棄
      chartInstance = null;
    }

    if (stockCodes.length === 0) {
      loadingIndicator.style.display = 'none'; // コードがない場合はローディングも消す
      // オプション：チャートエリアにメッセージを表示するなど
      // chartCanvas.clearRect(0, 0, chartCanvas.canvas.width, chartCanvas.canvas.height); // キャンバスをクリア
      return; // コードがなければ処理終了
    }

    loadingIndicator.style.display = 'block'; // ローディング表示開始

    const chartDatasets = [];
    const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40']; // データセットの色

    // 各コードのデータを並行して取得
    const promises = stockCodes.map(code => fetchStockData(code));
    const results = await Promise.all(promises);

    results.forEach((result, index) => {
      if (result && result.data && result.data.length > 0) { // データが取得できた場合のみ
        chartDatasets.push({
          label: result.code,
          data: result.data, // {x: Date, y: price} の形式
          borderColor: colors[index % colors.length], // 色を循環させる
          borderWidth: 1.5,
          fill: false,
          tension: 0.1 // 少し滑らかな線にする
        });
      } else {
        // データ取得失敗時のフィードバック（リスト項目に印をつけるなど）も検討可能
        console.warn(`Could not load data for ${stockCodes[index]}`);
      }
    });

    loadingIndicator.style.display = 'none'; // ローディング表示終了

    if (chartDatasets.length > 0) {
      chartInstance = new Chart(chartCanvas, {
        type: 'line',
        data: {
          datasets: chartDatasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false, // コンテナに合わせて高さを調整
          scales: {
            x: {
              type: 'time', // 時系列スケールを使用
              time: {
                unit: 'day', // 表示単位（必要に応じて調整）
                tooltipFormat: 'yyyy/MM/dd', // ツールチップのフォーマット
                displayFormats: {
                   day: 'MM/dd' // 軸ラベルのフォーマット
                }
              },
              title: {
                display: true,
                text: 'Date'
              }
            },
            y: {
              display: true,
              title: {
                display: true,
                text: 'Price'
              }
              // beginAtZero: false // Y軸を0から始めない（株価の場合）
            }
          },
          plugins: {
            tooltip: {
              mode: 'index', // 同じX軸上の全データセットのツールチップを表示
              intersect: false,
            },
            legend: {
                position: 'top', // 凡例を上に表示
            }
          },
          interaction: {
              mode: 'nearest',
              axis: 'x',
              intersect: false
          }
        }
      });
    } else {
        // 全てのコードでデータ取得に失敗した場合
        alert('Failed to load chart data for all selected stocks.');
    }
  }

  // APIキー保存ボタンの処理
  saveApiKeyButton.addEventListener('click', function() {
    saveApiKey();
  });

  // APIキー入力欄でEnterキーを押したときの処理
  apiKeyInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
      saveApiKey();
    }
  });

  // --- 初期化 ---
  loadApiKey(); // 起動時にAPIキーを読み込む

});