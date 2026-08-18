# 公開正本API・ブラウザ接続確認（2026-08-18 JST）

## API直接確認

公開read-only API origin:

```text
https://unburned-dispose-outlast.ngrok-free.dev
```

Manus本番origin `https://keibasim-8b2aebi6.manus.space` をOriginヘッダーに付与して確認した。

| Endpoint | HTTP | 確認内容 |
|---|---:|---|
| `/api/lab/health` | 200 | `schema_version=lab-api-v2`、`auth_state=NOT_REQUIRED_READ_ONLY`、`reachable=true` |
| `/api/lab/available-dates?kind=prediction` | 200 | `latest_prediction_date=2026-08-18` |
| `/api/lab/operations/daily?date=2026-08-17` | 200 | JRA=0、NAR=44、official_result_count=44、`automation_status=NORMAL`、`next_scheduled_at=null` |
| `/api/lab/results?date=2026-08-17&organization=NAR` | 200 | 44件。`DEAD_HEAT`を含む。top3値は馬番配列形式。 |

レスポンスには `Access-Control-Allow-Origin: https://keibasim-8b2aebi6.manus.space` が付与されている。

## 公開Manus画面からの確認

公開Manus画面のブラウザコンテキストから、healthとavailable-datesへ`ngrok-skip-browser-warning: true`ヘッダー付きfetchを実行した。ともにJSONとして200で取得でき、CORSが許可されることを確認した。

ただし、公開Manus画面のバンドルはPR #21の変更前である。画面に表示される固定日付、旧AI履歴、旧raceSync表示は、PR #21の変更を反映していない既存デプロイの状態であり、PR #21のE2E合格を意味しない。

ローカル開発origin（`http://localhost:3000`）から公開APIへ接続するとCORS allowlistに含まれないため`Failed to fetch`となる。これは正本CORS設定どおりのfail-closed動作である。

## 配備後の再確認項目

1. Frontend環境変数 `VITE_SINGLE_PICK_AI_BASE=https://unburned-dispose-outlast.ngrok-free.dev` を設定する。
2. PR #21のバンドルをManus本番へデプロイする。
3. 公開Manus URLで最新日が`2026-08-18`となることを確認する。
4. 2026-08-17 NARで44件の結果、`DEAD_HEAT`、馬番top3、`NOT_REQUIRED_READ_ONLY`を確認する。
5. 390px viewportで横スクロール結果一覧、公式結果取得ボタンdisabled、console error 0件を確認する。

## レスポンシブ視覚確認（ローカル・未接続fail-closed状態）

`http://localhost:3000/ai-history`をChromium headlessで確認した。localhostはCORS allowlist外のため正本APIは意図どおり`Failed to fetch`となり、UIは値を0で補完せず`取得不能`を表示した。

| Viewport | 確認結果 |
|---|---|
| 390×844 | 日次運用表示は2列に折り返され、接続診断ボタン、CSVボタン、更新ボタン、日付・主催・競馬場の各入力に重なりは確認されなかった。 |
| 1440×1000 | 日次運用表示は横一列、フィルターとKPIは整列し、はみ出しや重なりは確認されなかった。 |

スクリーンショットは`artifacts/ai-history-390.png`と`artifacts/ai-history-desktop.png`に保存した。これらはCORS fail-closed状態のレイアウト確認であり、正本API成功時のUI E2EはPR #21のデプロイ後に公開Manus originから再確認する必要がある。
