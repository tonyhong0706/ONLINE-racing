# Neon Circuit

瀏覽器裡的 3D 線上賽車遊戲，支援分享連結加入好友房間、即時玩家同步、電腦對手與手機觸控操作。

## 開始遊戲

```bash
npm install
npm start
```

開啟 http://localhost:3000。

## 建立房間與邀請好友

1. 在遊戲首頁按「建立新房間並開始」建立房間。
2. 進入賽道後，按右上角「邀請好友」複製房間邀請連結。
3. 把連結傳給好友；好友開啟連結後，會自動填入相同房號，再按「加入房間並開始」即可一起遊玩。
4. 也可以直接輸入好友提供的房號加入。

房間會在第一位玩家連線後建立，所有玩家必須使用同一個已部署的遊戲網址。分享 `localhost` 只會指向分享者自己的裝置，不能用來邀請外網玩家。

## 部署公開網址

專案附有 Render Blueprint 設定。將專案推送到 GitHub，登入 [Render](https://render.com)，選擇 **New → Blueprint** 並連結此 repository，Render 會依照 `render.yaml` 部署 Node.js 與 WebSocket 伺服器。部署完成後，把 Render 提供的 `https://...onrender.com` 網址分享給玩家。

請使用支援持續連線與 WebSocket 的 Node.js 主機；不要將此遊戲部署到不支援 WebSocket 的靜態網站或 serverless 服務。Render 免費方案閒置時可能休眠，首次開啟需要等待伺服器喚醒。

遊戲透過 CDN 載入 Three.js 和字型，因此遊玩時需要網際網路連線。

## 操作方式

- `W` / `↑`：加速
- `S` / `↓`：煞車／倒車
- `A`、`D` / `←`、`→`：轉向
- `Space`：漂移
- 手機：使用畫面右下角的觸控按鈕
