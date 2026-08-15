# single_pick_ai 表示統合・検証記録

## ローカル検証

- REAL RACE INPUTを左のSETUPレール内へ配置し、旧来の右下フローティングパネルを置き換えた。
- 実AI予測はTRUTH PANEL、条件を変更する計算結果はWHAT-IF SANDBOXとして別色・別ラベルで表示する。
- `calibration_status` が `READY` でない場合は、校正済み確率を数値化・補間・代替表示せず、APIステータスだけを表示する。
- `/api/lab` がJSON以外を返す場合は、接続先または公開状態を確認する明示エラーを表示する。
- `pnpm check`、`pnpm test`（31件）、`pnpm build`を成功させ、デスクトップ・モバイルの表示を確認した。

## 公開前提

Manusの公開環境からローカルで稼働するsingle_pick_aiへは直接接続できない。そのため公開版では、APIが利用できない場合にエラーを隠さず、HTTPSの接続先設定またはサーバー公開状態を確認するよう案内する。

## Manus本番確認

2026年8月15日に `https://keibasim-8b2aebi6.manus.space` で確認した。REAL RACE INPUT、TRUTH PANELの未読込表示、WHAT-IF SANDBOXの区分、ならびに「single_pick_ai APIがJSONを返しません」という接続先確認エラーが表示された。これは、公開版からローカルのsingle_pick_aiへ接続できない現状をゼロ値や空欄へ置き換えず、明示していることを確認するものです。
