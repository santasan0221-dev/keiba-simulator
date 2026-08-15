# single_pick_ai 表示統合・検証記録

## ローカル検証

- REAL RACE INPUTを左のSETUPレール内へ配置し、旧来の右下フローティングパネルを置き換えた。
- 実AI予測はTRUTH PANEL、条件を変更する計算結果はWHAT-IF SANDBOXとして別色・別ラベルで表示する。
- `calibration_status` が `READY` でない場合は、校正済み確率を数値化・補間・代替表示せず、APIステータスだけを表示する。
- `/api/lab` がJSON以外を返す場合は、接続先または公開状態を確認する明示エラーを表示する。
- `pnpm check`、`pnpm test`（31件）、`pnpm build`を成功させ、デスクトップ・モバイルの表示を確認した。

## 公開前提

Manusの公開環境からローカルで稼働するsingle_pick_aiへは直接接続できない。そのため公開版では、APIが利用できない場合にエラーを隠さず、HTTPSの接続先設定またはサーバー公開状態を確認するよう案内する。
