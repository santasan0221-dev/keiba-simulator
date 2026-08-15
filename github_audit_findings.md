# KEIBA LAB 外部監査メモ

監査対象: [santasan0221-dev/keiba-simulator](https://github.com/santasan0221-dev/keiba-simulator)

2026-08-15時点で、公開リポジトリのデフォルトブランチは `main`、最新コミットは `4eb4ca6`（single_pick_aiの既定ベースURLを同一オリジン相対パスへ変更）だった。リポジトリには `client`、`server`、`shared`、`INTEGRATION.md`、`.env.example` が存在する。[GitHubリポジトリ](https://github.com/santasan0221-dev/keiba-simulator)

公開リポジトリの直近統合コミット説明では、`client/src/lib/singlePickAi.ts` が `/api/lab/races` と `/api/lab/race/{race_key}` の型付きクライアント、`client/src/components/RealRaceLoader.tsx` が日付・主催・レース選択用の浮遊ローダー、`Home.tsx` が `RealRaceLoader` をマウントする最小改変であることが示されている。[GitHubリポジトリ](https://github.com/santasan0221-dev/keiba-simulator)

公開READMEのリポジトリ説明は「競走馬の能力・脚質・馬場・展開を設定してレース結果を反復シミュレーションするWebアプリ」で、既存のVelvet Turfデザインとsingle_pick_ai統合が前提になっている。[GitHubリポジトリ](https://github.com/santasan0221-dev/keiba-simulator)

今回の実装方針は、single_pick_aiがローカルのみで稼働する制約を維持しつつ、実データ未接続時も空欄や0へ静かにフォールバックせず、接続エラーを既存ローダー内で表示すること。`win_prob_calibrated` と `top3_prob` はnullのとき「未校正」と表示し、数値を生成・補間しないこと。ブラウザ内のランキング・グラフは、実データを種にしたwhat-if sandboxとして実AI予測と別表示にすること。

Sources:
- [GitHub - santasan0221-dev/keiba-simulator](https://github.com/santasan0221-dev/keiba-simulator)

## ローカル表示確認

ローカル開発サーバー（3001番ポート）でページを確認した。Truth Panelは、未接続時に「実AI予測を読み込むと、what-ifと分けて確認できます。」と表示され、RealRaceLoaderの「本物のレースを読み込む」ボタンが表示される。既存のVelvet Turf本体レイアウト、シミュレーター、Quick Tourも描画されている。初回表示ではQuick Tourのダイアログが画面中央に重なるため、視覚確認時は「スキップ」または「次へ」で閉じてTruth Panelと本体レイアウトを確認する必要がある。

型チェックと本番ビルドは成功した。開発サーバーは3000番ポートが既存プロセスで使用中のため、3001番ポートで起動した。

## 実データ未接続時の動作確認

ブラウザ上でRealRaceLoaderを開くと、`single_pick_ai`接続先の入力、日付、NAR/JRA切替、レース選択領域が表示された。ローカルの同一オリジンへ接続したところ、HTMLがJSONとして返ったため `SyntaxError: Unexpected token '<'` が発生したが、画面には「接続エラー」と「single_pick_aiを起動してください」が明示された。空欄や0への静かなフォールバックは発生していない。

Truth Panelは未接続時の入力案内を表示し、実データ読込後に実AI出力へ切り替わる設計である。既存シミュレーターの結果はTruth Panel下部のWHAT-IF SANDBOX説明と既存の「実際のレース結果を保証しない」注意書きで分離されている。
