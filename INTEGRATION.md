# single_pick_ai 統合

KEIBA LAB(このリポ)を消費者向けフロントとし、**single_pick_ai の実予測**で駆動する。

## 役割分担(2リポ構成)

- **keiba-simulator(このリポ)** = フロント製品。クライアント側 what-if シミュレーション。
- **single_pick_ai** = 予測の頭脳。read-only の KEIBA LAB API(`/api/lab/races`, `/api/lab/race/{race_key}`)を公開。

## データの流れ

クライアントが single_pick_ai の `/api/lab/*` を**直接 fetch** し、実レースの馬情報を取得 → シミュレーターの `Horse[]` にマッピング(`client/src/lib/singlePickAi.ts`)→ 既存のシミュレーションのシードにする。

- **末脚(speed)** = v23k 実値
- **馬場適性・出走成績** = as-of 履歴(対象日より前)の実値
- **持久力・スタート・近況** = 暫定値(single_pick_ai P2 で実データ化予定)
- **校正確率** = single_pick_ai が `calibration_status === "READY"` を返すときのみ。未確定時は「参考」。**捏造しない。**

読み込んだ数値はブラウザ内 what-if のシードであり、実際の予測・的中を保証しない(UI 明記)。

## 使い方(推奨: 1台のサーバで全部)

single_pick_ai が API とシミュレーター両方を配信するので、**起動は single_pick_ai だけ**。CORS も別サーバも不要。

1. simulator をサブパス `/sim/` 用にビルド(Git Bash はパス変換で `/sim/` が化けるため `MSYS_NO_PATHCONV=1` を付ける):
   ```bash
   MSYS_NO_PATHCONV=1 npx vite build --base=/sim/
   ```
   → `dist/public` が生成される。
2. single_pick_ai を起動(既定でこのリポの `dist/public` を `/sim` に配信。パスは env `KEIBA_SIMULATOR_DIST` で変更可)。
3. ブラウザで `http://<single_pick_ai>/sim/` を開く → 右下「本物のレースを読み込む」。
   - 同一オリジンなのでクライアントは相対 `/api/lab` を叩く(`VITE_SINGLE_PICK_AI_BASE` 不要)。

App のルーターは Vite の base を自動追従(`client/src/App.tsx`)。ルート直下配信(`--base=/`)でもそのまま動く。

## 使い方(別オリジン: クライアント直 fetch)

1. single_pick_ai を起動(FastAPI, 既定 `http://127.0.0.1:8000`)。CORS で本アプリのオリジンを許可(single_pick_ai 側で対応済み)。
2. このアプリ:
   - **Dev**: `SINGLE_PICK_AI_URL` を設定すれば Vite が `/api/lab` をプロキシ。`VITE_SINGLE_PICK_AI_BASE` は空でよい。
   - **Prod**: `VITE_SINGLE_PICK_AI_BASE` に single_pick_ai の公開 URL を設定(クライアントが直接叩く)。
3. 画面右下の「**本物のレースを読み込む**」→ 日付・主催(NAR/JRA)・レースを選ぶと、実データが反映される。

## 実装ファイル

- `client/src/lib/singlePickAi.ts` — API クライアント + `toHorses()` マッパー
- `client/src/components/RealRaceLoader.tsx` — 右下のフローティング読み込み UI
- `client/src/pages/Home.tsx` — `Style`/`Going`/`Horse` を export、`<RealRaceLoader onLoad={setHorses} />` を配置
- `vite.config.ts` — dev プロキシ `/api/lab`
