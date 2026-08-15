# ngrok経由 single_pick_ai 接続検証

2026年8月15日、ユーザー提供の読み取り専用HTTPS接続先 `https://unburned-dispose-outlast.ngrok-free.dev` を確認した。`/api/lab/races?date=2026-08-15&organization=JRA` はJSONを返すが、通常のブラウザGETはngrokのブラウザ警告により失敗した。`ngrok-skip-browser-warning: true` を付与した同一GETはJSONを返したため、`*.ngrok-free.dev` と `*.ngrok.io` に限定してこのヘッダーを付与するクライアント対応を追加した。

ローカルプレビューで、2026年8月15日・NARの32件のレース候補を取得し、帯広ば1Rを読み込んだ。TRUTH PANELは `UNCALIBRATED_SHADOW_SCORE` を「参考・未校正」と表示し、校正済み確率を数値として表示・補間・代用しないことを確認した。WHAT-IF SANDBOXの結果は別区画で表示され、ランキングには `REAL SEED / v23k実値` の出所が表示された。

2026年8月15日、開発プレビューを再確認した。接続先を保持した状態でNARの32件のレース候補（CLOSEDおよびPREDICTED）を正常に一覧表示できた。実レースの読込前はTRUTH PANELを「実AI予測は未読込」と明示し、WHAT-IF結果と混同させない構成であることを確認した。

同日の帯広ば1R（CLOSED）を読み込んだところ、API応答には `result` が提供されていなかった。TRUTH PANELは「OFFICIAL RESULT / 未確定」と表示し、公式着順・AI本命結果・払戻を代替表示しないことを確認した。この状態ではRANK ACCURACYおよびVIRTUAL ROIも表示・算出しない仕様としている。

精度比較・仮想ROIの追加後、1280pxデスクトップおよび390pxモバイル幅を確認した。REAL RACE INPUT、未読込TRUTH PANEL、WHAT-IF SANDBOX、LIVE COURSE REPLAYの情報階層に横方向の崩れはなかった。確定結果を模したサーバー描画テストでは、RANK ACCURACYの照合頭数・順位一致・平均順位差、ならびに単勝・複勝の対象馬払戻に紐づくVIRTUAL ROIを確認した。APIが現時点で返す全18件のCLOSED候補は `result: null` のため、実データ画面で数値を表示しないことも確認した。

CSV・PDF出力検証の前に、開発プレビューでHTTPS接続先からNAR・2026年8月15日の32件の候補を再取得できることを確認した。

帯広ば1Rの実レース入力を保存して、DATA ROOMから詳細比較CSVを生成した。生成ファイル `keiba-lab-scenario-summary-detailed-1786786206625.csv` のヘッダーには `provenanceKind`、`raceKey`、`calibrationStatus`、`officialResultStatus`、`payouts` と新規の `virtualRoi` が含まれていた。実データ由来の行には `single_pick_ai`、`NAR|2026-08-15|帯広ば|01`、`COLLECTING`、および `result: null` に対応する「結果はまだ確定していません」が記録され、未確定のROI数値を作成していないことを確認した。

同じ保存済み実レースシナリオについて、DATA ROOM内の「詳細PDFレポート」操作を確認し、PDF出力検証を続行する準備を整えた。

PDF出力操作の位置を確認し、保存済み実レースシナリオの「詳細PDFレポート」を実行可能な状態であることを確認した。

同操作を実行したが、ブラウザのダウンロード先には直後のPDFファイルが現れなかった。シナリオ選択または出力処理状態を追加確認してから、PDF内容の検証結果を記録する。

保存済み実レースシナリオは未選択だったため、選択状態に変更して詳細PDFの出力対象へ設定した。

選択後に `keiba-lab-detailed-report-1786786393334.pdf` を生成できた。1ページ目には `実データ元: single_pick_ai`、race_key、venue、校正状態、as_of、取得時刻、公式結果状態、払戻、`仮想ROI: 結果はまだ確定していません` が記載され、what-ifであることと実際のレース結果・利益を保証しない旨の免責も保持されていることを確認した。

保存結果カードと選択後のComparison詳細にも `仮想ROI / 結果はまだ確定していません` が表示されることを確認した。API応答の `result` が未提供であるため、保存時点でも回収率数値を表示していない。
