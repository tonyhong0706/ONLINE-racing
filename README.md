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

### 第一次部署：取得可以分享的公開網址

1. **登入 GitHub**：[前往 GitHub 登入](https://github.com/login)。如果尚未有帳號，請先[建立 GitHub 帳號](https://github.com/signup)。請勿把密碼或驗證碼傳給別人。
2. **確認遊戲專案**：[開啟 ONLINE-racing GitHub repository](https://github.com/tonyhong0706/ONLINE-racing)。Render 會從這個 repository 取得遊戲程式。
3. **登入 Render**：[前往 Render Dashboard](https://dashboard.render.com/login)，選擇 **Continue with GitHub**，並依照畫面授權 Render 存取 repository。
4. **建立 Blueprint**：登入後打開 [Render Dashboard](https://dashboard.render.com)，按 **New → Blueprint**，選擇 `tonyhong0706/ONLINE-racing`。
5. **確認並部署**：Render 會讀取專案中的 [`render.yaml`](./render.yaml)，顯示服務設定；按 **Apply**／**Deploy Blueprint** 開始部署。等待服務狀態變成 **Live**。
6. **複製公開網址**：在 Render 服務頁面按 **Visit**，或複製服務名稱下方的 `https://...onrender.com` 網址。這才是可以傳給外部玩家的公開遊戲連結。

詳細步驟也可參考 [Render Blueprint 官方文件](https://render.com/docs/blueprint-spec)。遊戲已在 GitHub 上，通常不需要再手動推送程式碼。

### 開房及邀請玩家

1. 開啟你的 Render 公開網址。
2. 按 **建立房間並開始**。
3. 在賽道畫面按右上角 **邀請好友**，複製房間邀請連結。
4. 把連結傳給好友。好友開啟後，確認畫面顯示相同房號，再按 **加入房間並開始**。

也可以傳送 Render 公開網址給好友，請對方輸入相同房號加入。分享 `localhost` 或 `127.0.0.1` 只會連到你自己的裝置，不能當成公開網址。

請使用支援持續連線與 WebSocket 的 Node.js 主機；不要將此遊戲部署到不支援 WebSocket 的靜態網站或 serverless 服務。Render 免費方案閒置時可能休眠，首次開啟需要等待伺服器喚醒。

遊戲透過 CDN 載入 Three.js 和字型，因此遊玩時需要網際網路連線。

## 操作方式

- `W` / `↑`：加速
- `S` / `↓`：煞車／倒車
- `A`、`D` / `←`、`→`：轉向
- `Space`：漂移
- 手機：使用畫面右下角的觸控按鈕
