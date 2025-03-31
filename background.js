// バックグラウンドスクリプト - Alpha Vantage APIへのリクエストを処理

// メッセージリスナーを設定
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // APIキー取得リクエストを処理
  if (request.action === 'getApiKey') {
    chrome.storage.local.get(['alphavantageApiKey'], function(result) {
      sendResponse({ success: true, apiKey: result.alphavantageApiKey || '' });
    });
    return true;
  }
  
  // APIキー保存リクエストを処理
  if (request.action === 'saveApiKey') {
    const apiKey = request.apiKey;
    chrome.storage.local.set({ alphavantageApiKey: apiKey }, function() {
      sendResponse({ success: true });
    });
    return true;
  }
  
  // 株価データ取得リクエストを処理
  if (request.action === 'fetchStockData') {
    const stockCode = request.stockCode;
    const apiKey = request.apiKey;
    
    if (!apiKey) {
      sendResponse({
        success: false,
        error: 'APIキーが設定されていません。APIキーを設定してください。'
      });
      return true;
    }
    
    // Alpha Vantage APIのURLを構築
    // 日足データを取得するTIME_SERIES_DAILYエンドポイントを使用
    const apiUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${stockCode}&outputsize=compact&apikey=${apiKey}`;
    
    // Alpha Vantage APIにリクエストを送信
    fetch(apiUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        // エラーチェック
        if (data['Error Message']) {
          throw new Error(data['Error Message']);
        }
        
        if (data['Information']) {
          // APIの使用制限に達した場合など
          throw new Error(data['Information']);
        }
        
        if (!data['Time Series (Daily)']) {
          throw new Error('データが見つかりませんでした。株式コードを確認してください。');
        }
        
        // Alpha Vantageのデータ形式をChart.jsで使用できる形式に変換
        const timeSeriesData = data['Time Series (Daily)'];
        const formattedData = {
          chart: {
            result: [{
              timestamp: [],
              indicators: {
                quote: [{
                  close: []
                }]
              }
            }]
          }
        };
        
        // 日付でソートするために日付の配列を作成
        const dates = Object.keys(timeSeriesData).sort();
        
        // 日付順にデータを配列に追加
        dates.forEach(date => {
          // Unix timestamp（秒）に変換
          const timestamp = Math.floor(new Date(date).getTime() / 1000);
          formattedData.chart.result[0].timestamp.push(timestamp);
          
          // 終値を取得
          const closePrice = parseFloat(timeSeriesData[date]['4. close']);
          formattedData.chart.result[0].indicators.quote[0].close.push(closePrice);
        });
        
        // 成功した場合、変換したデータをポップアップに返す
        sendResponse({ success: true, data: formattedData });
      })
      .catch(error => {
        // エラーが発生した場合、エラーメッセージを返す
        console.error(`Error fetching data for ${stockCode}:`, error);
        sendResponse({ success: false, error: error.message });
      });
    
    // 非同期レスポンスを使用するために true を返す
    return true;
  }
});

// 拡張機能がインストールされたときの処理
chrome.runtime.onInstalled.addListener(() => {
  console.log('Stock Chart Extension installed with Alpha Vantage API support');
});