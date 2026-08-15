# single_pick_ai 公式結果表示・検証記録

## 実API確認

2026年8月15日、ユーザー提供の `https://unburned-dispose-outlast.ngrok-free.dev` を接続先に用い、`/api/lab/races?date=2026-08-15&organization=NAR` から閉場済みの帯広ば1Rを読み込んだ。APIレスポンスの `result` は `null` であり、TRUTH PANELには「OFFICIAL RESULT / 未確定」と「結果はまだ確定していません。公式着順・AI本命の着順・払戻を推定または代替表示しません。」を表示した。

この実地確認では、未確定レースを「見送り」「的中」または0件として扱わず、公式データ未提供を明示できることを確認した。確定済み・本命着順データなし・的中・複勝圏内・圏外の各分岐は、固定レスポンスを使うユニットテストで保護する。
