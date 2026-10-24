// ==========================================
// 1. 基本設定區（八里新育 3D 學習步道群島 & 課程推手）
// ==========================================
const CONFIG = {
  FOLDER_NAME: '新育幸福學校',
  SHEET_FILE_NAME: '瀏覽標籤與連結',
  SHEET_NAME: 'Locate'
};

// ==========================================
// 【效能優化】：快取機制 (CacheService)
// ==========================================
function getFolderByNameCached_(folderName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "F_ID_" + folderName;
  const cachedId = cache.get(cacheKey);
  if (cachedId) {
    try {
      const folder = DriveApp.getFolderById(cachedId);
      if (!folder.isTrashed()) return folder;
    } catch (e) {}
  }
  const folders = DriveApp.getFoldersByName(folderName);
  if (!folders.hasNext()) throw new Error(`找不到資料夾：「${folderName}」`);
  const folder = folders.next();
  cache.put(cacheKey, folder.getId(), 3600);
  return folder;
}

function getFileByFolderAndNameCached_(folderName, fileName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "FILE_ID_" + folderName + "_" + fileName;
  const cachedId = cache.get(cacheKey);
  if (cachedId) {
    try {
      const file = DriveApp.getFileById(cachedId);
      if (!file.isTrashed()) return file;
    } catch (e) {}
  }
  const folder = getFolderByNameCached_(folderName);
  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) throw new Error(`在「${folderName}」中找不到檔案：「${fileName}」`);
  const file = files.next();
  cache.put(cacheKey, file.getId(), 3600);
  return file;
}

// ==========================================
// 2. 網頁進入點 (SPA 單頁應用程式架構 + JSON API 支援)
// ==========================================
function doGet(e) {
  try {
    // 若前端（如 Google Sites 獨立嵌入版）透過 ?action=api 請求 JSON 資料
    if (e && e.parameter && e.parameter.action === 'api') {
      const labels = getLabelsFromSheet_(CONFIG.FOLDER_NAME, CONFIG.SHEET_FILE_NAME, CONFIG.SHEET_NAME);
      const teamResult = getDesignerData();
      const payload = {
        status: 'success',
        labels: labels,
        team: teamResult.status === 'success' ? teamResult.data : []
      };
      return ContentService.createTextOutput(JSON.stringify(payload))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 檢查使用者是否透過網址參數指定直接進入設計團隊 (?page=designer)
    const isTeam = (e && e.parameter && e.parameter.page === 'designer');

    // 取得試算表步道標籤資料（3D 群島直接即時渲染，不再需要載入舊版 2D 底圖，大幅提升載入速度！）
    const labels = getLabelsFromSheet_(CONFIG.FOLDER_NAME, CONFIG.SHEET_FILE_NAME, CONFIG.SHEET_NAME);

    // 生成模塊 A：3D 學習步道群島前端 (Ln_Trails.html)
    const mapTemplate = HtmlService.createTemplateFromFile('Ln_Trails');
    mapTemplate.labelsJson = JSON.stringify(labels);
    const mapHtml = mapTemplate.evaluate().getContent();

    // 生成模塊 B：課程推手前端 (Team.html)
    const teamTemplate = HtmlService.createTemplateFromFile('Team');
    const teamHtml = teamTemplate.evaluate().getContent();

    // ★ 將兩個模塊合併到同一個 HTML 中 (突破 Google Sites 阻擋)
    const finalHtml = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <base target="_blank">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>八里新育｜3D 學習步道群島與課程推手</title>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
    }
  }
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body style="margin: 0; padding: 0; overflow: hidden; font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif; background: #e7d9cd;">
  
  <!-- 畫面 1：3D 學習步道群島 -->
  <div id="view-map" style="display: ${isTeam ? 'none' : 'block'}; width: 100vw; height: 100dvh; position: relative;">
    ${mapHtml}
  </div>

  <!-- 畫面 2：課程推手 -->
  <div id="view-team" style="display: ${isTeam ? 'block' : 'none'}; width: 100vw; height: 100dvh; overflow-y: auto; background: radial-gradient(circle at 50% 30%, #7a1c22 0%, #3a0a0d 70%, #1a0204 100%); color: white; position: relative; padding-bottom: 4rem;">
    ${teamHtml}
  </div>

  <!-- SPA 瞬間切換邏輯 -->
  <script>
    window.teamLoaded = ${isTeam ? 'true' : 'false'};
    if (window.teamLoaded && typeof loadTeamData === 'function') {
      loadTeamData();
    }

    function showTeamView() {
      document.getElementById('view-map').style.display = 'none';
      document.getElementById('view-team').style.display = 'block';
      if (typeof window.setIslandPaused === 'function') window.setIslandPaused(true);
      if (typeof loadTeamData === 'function' && !window.teamLoaded) {
        window.teamLoaded = true;
        loadTeamData();
      }
    }

    function showMapView() {
      document.getElementById('view-team').style.display = 'none';
      document.getElementById('view-map').style.display = 'block';
      if (typeof window.setIslandPaused === 'function') window.setIslandPaused(false);
      window.dispatchEvent(new Event('resize'));
    }
  </script>
</body>
</html>`;

    return HtmlService.createHtmlOutput(finalHtml)
      .setTitle('八里新育｜3D 學習步道群島與課程推手')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (error) {
    const errorHtml = `
      <div style="font-family: sans-serif; padding: 40px; background: #ffebee; color: #c62828; border-radius: 8px; margin: 20px;">
        <h2 style="margin-top:0;">🛑 糟糕，發生錯誤了！</h2>
        <p style="font-size: 16px; line-height: 1.5;">${error.message}</p>
        <hr style="border: 0; border-top: 1px solid #ef9a9a; margin: 20px 0;">
        <p style="font-size: 14px;">請檢查「程式碼.gs」與雲端硬碟試算表設定。</p>
      </div>
    `;
    return HtmlService.createHtmlOutput(errorHtml)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

// ==========================================
// 【系統 A】：學習步道 - 試算表資料讀取邏輯
// 支援原有欄位：名稱, X (px), Y (px), 網址, 長度, color, 底色, 字體顏色, 呈現
// 並支援選填擴充欄位：分類, 簡介, 亮點, 主題
// ==========================================
function getLabelsFromSheet_(folderName, fileName, sheetName) {
  let ss;
  try {
    const file = getFileByFolderAndNameCached_(folderName, fileName);
    ss = SpreadsheetApp.open(file);
  } catch (e) {
    throw new Error(`找不到 Google Sheet 檔案或讀取失敗。<br>詳細原因：${e.message}`);
  }

  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error(`找不到工作表：「${sheetName}」`);

  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  const header = data[0].map(h => String(h).trim());
  const idxName      = header.indexOf('名稱');
  const idxX         = header.indexOf('X (px)');
  const idxY         = header.indexOf('Y (px)');
  const idxUrl       = header.indexOf('網址');
  const idxLength    = header.indexOf('長度');
  const idxColor     = header.indexOf('color');
  const idxBgColor   = header.indexOf('底色');
  const idxFontColor = header.indexOf('字體顏色');
  const idxTarget    = header.indexOf('呈現');

  // 選填擴充欄位（若試算表有新增即可直接覆寫 3D 島嶼設定）
  const idxCategory  = header.indexOf('分類') !== -1 ? header.indexOf('分類') : header.indexOf('願景');
  const idxSummary   = header.indexOf('簡介') !== -1 ? header.indexOf('簡介') : header.indexOf('說明');
  const idxPoints    = header.indexOf('亮點') !== -1 ? header.indexOf('亮點') : header.indexOf('特色');
  const idxTheme     = header.indexOf('主題') !== -1 ? header.indexOf('主題') : header.indexOf('模型');

  if (idxName === -1 || idxUrl === -1) {
    throw new Error('標題列缺少必要欄位（名稱、網址）。');
  }

  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[idxName] && row[idxUrl]) {
      let pLen = 120;
      if (idxLength !== -1 && row[idxLength] !== '') {
        const parsedLen = parseInt(row[idxLength], 10);
        pLen = isNaN(parsedLen) ? 120 : parsedLen;
      }
      let pColor = (idxColor !== -1 && row[idxColor]) ? row[idxColor].toString().trim() : '#A94B5C';
      let pBgColor = (idxBgColor !== -1 && row[idxBgColor]) ? row[idxBgColor].toString().trim() : '#F9E9ED';
      let pFontColor = (idxFontColor !== -1 && row[idxFontColor]) ? row[idxFontColor].toString().trim() : '#3E2027';
      let pTarget = (idxTarget !== -1 && row[idxTarget] && row[idxTarget].toString().trim().toLowerCase() === 'self') ? '_self' : '_blank';

      const item = {
        rowNum: i + 1,
        text: row[idxName].toString().trim(),
        x: idxX !== -1 ? (parseFloat(row[idxX]) || 0) : 0,
        y: idxY !== -1 ? (parseFloat(row[idxY]) || 0) : 0,
        url: row[idxUrl].toString().trim(),
        poleLength: pLen,
        poleColor: pColor,
        bgColor: pBgColor,
        fontColor: pFontColor,
        target: pTarget
      };

      if (idxCategory !== -1 && row[idxCategory]) item.category = row[idxCategory].toString().trim();
      if (idxSummary !== -1 && row[idxSummary]) item.summary = row[idxSummary].toString().trim();
      if (idxPoints !== -1 && row[idxPoints]) item.highlights = row[idxPoints].toString().trim();
      if (idxTheme !== -1 && row[idxTheme]) item.theme = row[idxTheme].toString().trim();

      out.push(item);
    }
  }
  return out;
}

// ==========================================
// 【系統 B】：課程推手 - 資料讀取邏輯
// ==========================================
function buildImageIndex_(folder) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "imageIndex_" + folder.getId();
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  var index = {};
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var name = String(f.getName()).trim().normalize('NFC');
    var fileId = f.getId();
    if (!index[name]) index[name] = fileId;
    var lower = name.toLowerCase();
    if (!index[lower]) index[lower] = fileId;
  }
  try { cache.put(cacheKey, JSON.stringify(index), 600); } catch (e) {}
  return index;
}

function getDesignerData() {
  try {
    var folder = getFolderByNameCached_(CONFIG.FOLDER_NAME);
    var imageIndex = buildImageIndex_(folder);
    var sheetFile = getFileByFolderAndNameCached_(CONFIG.FOLDER_NAME, "designer");
    var ss = SpreadsheetApp.openById(sheetFile.getId());
    var sheet = ss.getSheetByName("people");
    if (!sheet) throw new Error("找不到名為「people」的工作表。");

    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { status: "success", data: [] };

    var headers = data[0].map(h => String(h).toLowerCase().trim());
    var nameIdx = headers.indexOf("name");
    var titleIdx = headers.indexOf("title");
    var imageIdx = headers.indexOf("image");

    if (nameIdx === -1 || titleIdx === -1 || imageIdx === -1) throw new Error("缺少必要欄位。");

    var result = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[nameIdx] && !row[titleIdx]) continue;

      var imageFileName = row[imageIdx];
      var imageUrl = "";

      if (imageFileName) {
        var cleanName = String(imageFileName).trim().normalize('NFC');
        var lowerName = cleanName.toLowerCase();
        var fileId = imageIndex[cleanName] || imageIndex[lowerName];

        if (!fileId) {
          var lastDotIndex = cleanName.lastIndexOf(".");
          if (lastDotIndex !== -1) {
            var baseName = cleanName.substring(0, lastDotIndex);
            var ext = cleanName.substring(lastDotIndex);
            var lowerExtName = (baseName + ext.toLowerCase()).normalize('NFC');
            var upperExtName = (baseName + ext.toUpperCase()).normalize('NFC');
            fileId = imageIndex[lowerExtName] || imageIndex[upperExtName] || imageIndex[lowerExtName.toLowerCase()] || imageIndex[upperExtName.toLowerCase()];
          }
        }
        if (fileId) imageUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w500";
      }

      result.push({
        name: row[nameIdx] ? String(row[nameIdx]).trim() : "",
        title: row[titleIdx] ? String(row[titleIdx]).trim() : "",
        image: imageUrl,
      });
    }

    return { status: "success", data: result };
  } catch (error) {
    return { status: "error", message: error.toString() };
  }
}
