# 命運之星・108星辰錄 — 開發記錄

## 專案資訊
- **GitHub**: https://github.com/a4622741/fate-stars
- **線上版**: https://a4622741.github.io/fate-stars/
- **本地開發**: `/Users/allen/Desktop/test/`
- **Git Repo**: `/Users/allen/Desktop/fate-stars/` (docs/ = 部署目錄)
- **部署方式**: 雙擊桌面「更新遊戲.command」→ 自動 cp + commit + push → GitHub Pages

---

## 2026-04-07 Session 1 — 全面重構

### Bug 修復（原始檔案）
- `confirmDiceResult` 重複推入 history
- `buildRelicSection` 輸出字面 `false`
- `doGoToPoi` 商店重複合併（全部商品誤標 NEW）
- `compressHistory` 的 assistant 訊息非 JSON
- 橘子怒氣文字括號不匹配
- `applyGold` 只在有系統訊息時才套用

### UI 與 AI 同步修復
- **根本問題**: 本地互動（翻肚/餵魚/聊天等）不告知 AI，AI 不知道發生過這些事
- 5 個互動函式加入 `pushLocalEvent()` 推送 history
- 狀態快照從部分發送改為完整（金幣+好感+道具+翻肚+任務）
- 系統提示詞加入**絕對規則 A-I**（JSON 欄位必須與敘述同步）
- 金幣自動同步安全網（偵測敘述中的金額變動）
- 道具自動同步安全網（偵測敘述中的購買/獲得）

### 邏輯謬誤修復
- `applyGold` 借位連鎖失敗 → 改為統一銅幣計算再拆回三幣制
- `advanceTime` 接受負數/小數 → 加入防護
- `addQuest` 強制覆蓋 status → 尊重 AI 指定的狀態
- `initStory` 連續兩條 user 訊息 → 補上 assistant JSON

### 安全性
- XSS 修復：對話 innerHTML 加入 `escHtml()` 轉義
- `sellItem` 索引錯誤 → 改用物件引用 `_ref`

### API 節流
- 全域節流閘門 `apiGate()`：最小間隔 1.5s，同時只允許 1 個請求
- 429 指數退避：15→30→60→120 秒
- JSON 重試從 3 次降為 1 次
- 背景呼叫（商店刷新/自動壓縮）在退避中自動跳過
- 429 錯誤後：撤銷行動文字 + 恢復原本選項 + 顯示「↩ 重試」按鈕

### Token 節流
- System prompt 首次完整發送，之後只發精簡版（省 ~2000 tokens/次）
- 狀態快照壓縮：金幣僅在變動時發送，道具/任務只發數量
- 本地戰鬥系統 `localCombat()`：簡單遭遇不呼叫 API

### 介面優化
- 故事文字放大（敘述 0.95rem、對話 0.92rem、系統 0.76rem）
- WCAG AA 對比度修復（對話斜體、非活躍 Tab、標題）
- 選項按鈕最小高度 44px + 觸控回饋
- 面板 Tab 放大 + 手機端水平捲動
- 角色卡按鈕從 inline style 改為 CSS class `.pa`
- 思考動畫放大 + 「✦ AI 思考中…」文字
- Toast 上滑動畫 + 點擊關閉
- 回頂按鈕（捲動 300px 後顯示）
- Drawer 手機端優化（max-height 65vh、觸控把手加大）

### 故事系統
- 系統提示詞融入水滸傳 + 幻想水滸傳原則
  - 逼上梁山、義氣為核、連環敘事、天罡/地煞分量差異
  - 六種招募模式、據點成長、稱號系統、內部張力
- 文風改為「帶刺的幽默與冷面笑匠」
- 選項設計要求有個性、帶提示、至少一個幽默選項
- 序章完全重寫（序幕天象 → 解僱 → 求生 → 紅髮女人）
- UI 互動標記為「不推進劇情」（規則 I）

### 世界擴充
- 地圖從 8 座城市擴充至 16 座
- 新增王國：霜嶺、影沼地
- 路線從 9 條增至 24 條
- 大陸地圖用 Pollinations AI 圖片做背景
- 區域地圖每個王國有對應的 AI 背景圖
- 遊戲背景浮水印（暗色奇幻星空，opacity 8%）
- 地煞星修正為完整 72 顆（原本少 2 顆）

### 新系統
- **據點系統**: 招募 10 人後解鎖，12 座設施隨人數開放（10→108）
- **百科系統**: 5 大分類 34 條目（世界/勢力/星辰/角色/系統），可展開收合
- **星辰篩選修復**: `setStarFilter()` / `setIntelFilter()` 獨立函式 + `markDirty`

### PWA 改造
- 從單檔 HTML 拆為 PWA 結構（index.html + css/ + js/ + sw.js + manifest.json）
- Service Worker 離線快取 + 自動更新通知
- 安裝提示（beforeinstallprompt）
- 設定頁加入「清除快取並重新載入」按鈕
- 部署到 GitHub Pages: https://a4622741.github.io/fate-stars/

---

## 常用指令

```bash
# 本地測試
cd ~/Desktop/test && python3 -m http.server 8765

# 部署到線上（或雙擊桌面「更新遊戲.command」）
cp -r ~/Desktop/test/* ~/Desktop/fate-stars/docs/
cd ~/Desktop/fate-stars
git add -A && git commit -m "更新遊戲" && git push origin main

# GitHub CLI 登入（首次）
gh auth login
```

## 檔案結構

```
~/Desktop/test/          ← 開發用
~/Desktop/fate-stars/    ← Git repo
  └── docs/              ← GitHub Pages 部署目錄
      ├── index.html
      ├── css/style.css
      ├── js/app.js
      ├── sw.js
      ├── manifest.json
      └── assets/
```
