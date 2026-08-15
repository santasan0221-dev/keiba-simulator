# KEIBA LAB 公開・single_pick_ai 接続計画

## 結論

KEIBA LABは、クライアントだけをGitHub Pagesへ置く構成ではなく、リポジトリ内のViteクライアントとNodeサーバーを同じデプロイ単位で公開する構成を推奨する。`pnpm build`で生成される`dist/public`がフロントエンド、`dist/index.js`がサーバーエントリである。これにより、同一オリジン配信・将来のAPIプロキシ・環境変数管理を取りやすい。

ただし、現在のsingle_pick_aiはローカル稼働のみであるため、公開先から実レースを取得するには別途HTTPSで到達可能なAPIを用意する必要がある。APIが未公開の間は、RealRaceLoaderに接続エラーを表示し、静的なwhat-ifシミュレーションだけを実AI予測と誤認させず利用できる状態を維持する。

## 推奨構成

1. KEIBA LABをフルスタック構成で公開する。
2. `VITE_SINGLE_PICK_AI_BASE`へsingle_pick_aiのHTTPSベースURLを設定する。
3. single_pick_ai側で`/api/lab/races`と`/api/lab/race/{race_key}`を公開し、KEIBA LABの公開オリジンをCORS許可する。
4. 本番HTTPS、認証またはレート制限、タイムアウト、監視をsingle_pick_ai側で設定する。
5. 予測値の校正が承認されていない場合、`win_prob_calibrated`と`top3_prob`はnullのまま返す。フロントエンドは数字を生成・補間しない。

## 環境変数

| 変数 | 設定例 | 役割 |
|---|---|---|
| `VITE_SINGLE_PICK_AI_BASE` | `https://ai.example.com` | ブラウザからsingle_pick_aiへ接続するベースURL。末尾の`/`は任意。 |
| `SINGLE_PICK_AI_URL` | `http://127.0.0.1:8000` | Vite開発時の`/single-pick-ai`プロキシ先。公開時の直接接続には依存しない。 |

公開環境ではViteの開発プロキシは動作しないため、`SINGLE_PICK_AI_URL`だけ設定してもブラウザ接続は成立しない。`VITE_SINGLE_PICK_AI_BASE`とCORS設定が必要である。機密情報をフロントエンド変数に入れてはならない。

## API公開前チェックリスト

- [ ] single_pick_aiをHTTPSで公開する。
- [ ] `GET /api/lab/races`が公開環境から200を返す。
- [ ] `GET /api/lab/race/{race_key}`が公開環境から200を返す。
- [ ] CORSの許可オリジンをKEIBA LABの本番ドメインだけに限定する。
- [ ] レスポンスに`prob_status`を必ず含める。
- [ ] 未校正時の確率フィールドをnullで返す。
- [ ] タイムアウト・5xx・空レスポンスをログ監視する。
- [ ] race dataの出所とas-of日付をレスポンスへ残す。

## 動作確認

ローカル開発では、single_pick_aiを`127.0.0.1:8000`で起動し、KEIBA LABを`pnpm dev -- --port 3001`で起動する。Viteの`/single-pick-ai`プロキシ経由でレース一覧を取得し、レースを選択する。実データ取得失敗時はTruth Panelにエラーを表示する。

本番では、RealRaceLoaderの接続先入力欄へHTTPSのsingle_pick_ai URLを設定し、レース一覧取得・対象レース取得・未校正表示・API停止時のエラー表示を順に確認する。取得した数値はTruth Panel、ユーザーが条件を変えた結果はwhat-if領域として、別の見出し・色・説明で表示する。

## 公開判断

single_pick_aiが公開できない段階では、KEIBA LABを「実AI予測が常時利用できるサービス」として告知しない。公開版はシミュレーターとTruth PanelのUI品質を先に提供し、実AIデータは接続できた時だけ表示する。接続できない場合に空欄や0へフォールバックしない現在の方針を維持する。
