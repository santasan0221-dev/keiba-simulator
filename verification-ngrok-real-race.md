# ngrok経由 single_pick_ai 接続検証

2026年8月15日、ユーザー提供の読み取り専用HTTPS接続先 `https://unburned-dispose-outlast.ngrok-free.dev` を確認した。`/api/lab/races?date=2026-08-15&organization=JRA` はJSONを返すが、通常のブラウザGETはngrokのブラウザ警告により失敗した。`ngrok-skip-browser-warning: true` を付与した同一GETはJSONを返したため、`*.ngrok-free.dev` と `*.ngrok.io` に限定してこのヘッダーを付与するクライアント対応を追加した。

ローカルプレビューで、2026年8月15日・NARの32件のレース候補を取得し、帯広ば1Rを読み込んだ。TRUTH PANELは `UNCALIBRATED_SHADOW_SCORE` を「参考・未校正」と表示し、校正済み確率を数値として表示・補間・代用しないことを確認した。WHAT-IF SANDBOXの結果は別区画で表示され、ランキングには `REAL SEED / v23k実値` の出所が表示された。
