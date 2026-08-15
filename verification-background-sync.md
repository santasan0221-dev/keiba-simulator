# バックグラウンド同期・履歴ダッシュボード検証記録

## 開発環境の初期確認

- `SINGLE_PICK_AI_BASE_URL` のHTTPS接続テストは成功した。
- 手動同期では、11件のレース詳細を保存し、7件の個別タイムアウトを `partial` として実行履歴に残した。部分失敗時にも最終同期成功時刻は更新され、全体のバックオフ状態には入らない。
- `/ai-history` は最終同期成功時刻、正常状態、確定済みレース数、未確定時の精度・ROI非表示、直近の同期実行履歴を表示した。
- 現在取得できるAPI応答は `result: null` のため、CONFIRMED RACES は0件であり、精度・ROIの代替値は表示されない。

## 本番Heartbeat確認

プロジェクト所有者Heartbeat `single-pick-ai-race-sync-v1` を15分間隔で登録した。初回はコールバックパスの不一致により静的HTMLへ到達したため、正しい `/api/scheduled/race-sync` へ更新した。修正後の実行 `FgDKUSqFcQni9s8jaWhsvJ` はHTTP 200で完了し、約12.5秒で `{"ok":true,"outcome":"success","message":"18件を同期しました","racesChecked":18,"racesUpdated":18}` を返した。これにより、本番のcron認証済みコールバックとsingle_pick_aiの定期取得が動作していることを確認した。

同期状態UIは、成功時に最終成功時刻と通常の更新間隔を示す。再試行時は次回確認時刻、失敗時は直近エラー本文を表示する。初期・成功・失敗の文言は単体テストで確認しており、実レースAPIが`result: null`の間は履歴ダッシュボード・TRUTH PANELとも精度やROIを数値化しない。

## CONFIRMED反映の統制検証とGitHub状況

`singlePickSyncUpdate.test.ts` では、同一race_keyの未確定データにCONFIRMED結果・払戻を伴う更新が到着した場合だけ、TRUTH PANEL置換対象と判定することを確認した。既存の`TruthPanel.test.tsx`は確定結果セクションを描画し、履歴ダッシュボードは確定済みスナップショットだけを集計する。このため、公開APIがまだ`result: null`のみを返す期間も、確定結果が来るまで数値を表示しないまま、到着後には同一レースのTRUTH PANELと集計対象が更新される。

バックグラウンド同期の本体はチェックポイント`488b8769`でManus本番へ公開済みである。GitHubの`main`は同じコミットを含み、状態表示と回帰テストの追補は[PR #13](https://github.com/santasan0221-dev/keiba-simulator/pull/13)（`feat/background-sync-history-dashboard`）として作成済みである。PR #13はレビュー用に未マージであり、本番にはチェックポイント版が反映されている。プロジェクト所有者Heartbeat `DNGAzBcmgCdTRPNCkPheoA` は本番の`/api/scheduled/race-sync`を15分間隔で呼び出し、実行結果はManusのスケジュール管理画面またはHeartbeatログから確認できる。

## 履歴フィルター・CSV出力・同期中表示

AI履歴画面では、期間（開始・終了）と競馬場で履歴を絞り込み、表示対象件数・KPI・推移・台帳を同じフィルター後データへ統一した。CSV出力はBOM付きUTF-8で、適用中の期間・競馬場・件数を先頭メタデータとして記録し、未確定レースの状態は数値に置き換えずそのまま出力する。デスクトップ1280pxとモバイル390pxで、フィルターとCSV操作が重ならないことを確認した。`syncStartedAt`が存在する場合はREAL RACE INPUTとAI履歴の双方にローディングアニメーションと「バックグラウンド同期中」を表示することを統制テストで確認した。

ヘッドレスブラウザでAI履歴のCSV出力ボタンを実行し、`keiba-lab-ai-outcome-archive-2026-08-15.csv`（7.3KB）をダウンロードした。先頭には「対象期間: 開始指定なし〜終了指定なし」「競馬場: すべて」「出力件数: 48」が記録され、CSVはraceKey、開催日、競馬場、公式結果、AI本命結果、順位精度、単勝・複勝ROI、同期時刻を含む。CONFIRMEDの行と、未確定の数値欄を空欄にした行がいずれも保持され、推定値は出力されていない。
