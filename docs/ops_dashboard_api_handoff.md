# KEIBA LAB 正本read-only API 接続運用

## 接続先

KEIBA LABのstandalone frontendでは、`VITE_SINGLE_PICK_AI_BASE`へ**single_pick_ai read-only APIの公開HTTPS origin**を設定します。Manus画面のURLを設定してはいけません。

```dotenv
VITE_SINGLE_PICK_AI_BASE=https://<single-pick-ai-read-only-api-origin>
```

KEIBA LABの本番originは次です。

```text
https://keibasim-8b2aebi6.manus.space
```

single_pick_ai側の`KEIBA_LAB_CORS_ORIGINS`には、上記originだけを既定許可します。Manusの公開URLが変わった場合、single_pick_ai側のCORS allowlistを更新します。

## 使用する固定GET API

| Endpoint | KEIBA LABでの用途 |
|---|---|
| `GET /api/lab/operations/daily?date=YYYY-MM-DD` | 日次運用、予測数、結果数、PDCA鮮度、自動処理状態 |
| `GET /api/lab/results?date=YYYY-MM-DD&organization=JRA&venue=札幌` | 結果一覧、◎○▲、公式top3、top3 coverage、special status |
| `GET /api/lab/available-dates?kind=prediction` | `latest_prediction_date`による初期日・最新日移動 |
| `GET /api/lab/health` | origin、到達可否、`lab-api-v2`、認証状態、応答時間、利用機能 |
| `GET /api/lab/races` | 実レース選択 |
| `GET /api/lab/race/{race_key}` | TRUTH PANELの個別予測・結果 |

`auth_state=NOT_REQUIRED_READ_ONLY`はread-only APIとして**正常**です。

## UI上の安全な扱い

`next_scheduled_at=null`は`取得不能`と表示します。時刻を推定しません。

`result_status`は`CONFIRMED`、`DEAD_HEAT`、`PENDING`、`REVIEW_REQUIRED`、`FAILED`、`RACE_STOPPED`を正本値のまま表示します。`special_statuses`の`CANCELLED`、`EXCLUDED`等も不的中・0・winner falseへ変換しません。

`official_top3`、`top3_coverage`、`ai_pick_finish`、`prediction_id`がnullまたは空の場合、UIは`取得不能`、`未確定`、`正本データ不整合`を表示し、数値を補完しません。

## write操作の境界

今回接続するAPIはすべてGETのread-only APIです。`公式結果を取得`は**実行可能にしません**。認証付きのwrite運用API、固定コマンド実行基盤、監査ログ、日付排他が接続されるまではdisabledを維持します。

## 確認手順

1. `VITE_SINGLE_PICK_AI_BASE`を正本HTTPS originへ設定します。
2. `/api/lab/health`で`schema_version=lab-api-v2`、`auth_state=NOT_REQUIRED_READ_ONLY`、`reachable=true`を確認します。
3. `/api/lab/available-dates?kind=prediction`の`latest_prediction_date`へ初期日・最新日ボタンが移動することを確認します。
4. `2026-08-17`、`organization=NAR`の結果一覧で正本件数を確認します。
5. `DEAD_HEAT`と`special_statuses`が独立表示され、結果値が補完されないことを確認します。
6. 未接続時はAPI未接続・JSON以外の応答・401/403等を原因別に表示し、結果取得ボタンはdisabledのままであることを確認します。

## 現時点のブロッカー

この作業ツリーとGitHubの確認時点では、Codex実装済みAPIの**公開HTTPS originまたはcommit/branch**が共有されていません。また、`single_pick_ai`の現在取得可能な`origin/master`には新endpointが含まれていません。実データE2Eには、公開originまたはGitHub上のcommit/branchを指定してください。
