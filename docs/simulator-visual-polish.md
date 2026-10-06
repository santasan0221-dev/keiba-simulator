# Simulator V3 Visual Polish — 2026-10-06

**KEIBA_TRACE_SIMULATOR_V3_VISUAL_POLISH_READY**

2026-10-07 の閉鎖監査（headed Chrome 154・ローカルfixture）で READY。性能は5コース×1440/390で60fps・p95約17ms・>50ms 0・long task 0・camera jump 0。注記衝突回避（GOAL/コーナー固定、START/坂/残距離を退避）を追加し、5コース×2viewport×全フェーズで重なり0・非表示0。simロジックはbaselineとバイト一致、358点の走行位置・順序・通過順が完全一致。

残WARN: `FIXED_ASPECT_EXPORT_NOT_IMPLEMENTED`（Share Viewは幅追従。16:9/1:1/9:16固定書出しは未提供）、OS前景は未検証（`BROWSER_FOREGROUND_NOT_VERIFIED`）、障害コース・残り5場は未検証。

以下は初期実装時の記録（性能・注記に関する「未完了」記述は上記監査で解消）。

- 作業場所: `C:/Users/santa/Documents/single_pick_ai/tmp/ksim_visual_polish`
- ブランチ: `feat/simulator-v3-visual-polish`
- 基準および現在HEAD: `fbb0ed56184944a785bc2b96af4ac44b70e29ab0`
- 新commit SHA: なし。
- 元の `C:/t/ksim_finish` と本番・runtime・DATA_ROOTは変更していない。
- 依存追加なし。既存node_modulesを読取利用するjunctionあり。

## 依頼項目別の結果

| 項目 | 実装・検証 |
| --- | --- |
| 1. course rendering | 芝・ダート・障害の表示スタイル、レール、GOAL、START、1C〜4C、距離標のコントラストを改修。既存パスと走行点は維持。Atlasに座標があるコース外ゲートを表示し、接続線はSTYLIZEDとして区別。 |
| 2. racecourse identity | Atlas既存の各場形状・内外区分・直線長・高低差表示を維持。東京芝2000／京都ダ1800／中山芝2500／新潟芝1000／小倉芝1800で実画面確認。残り5場と障害は実画面未検証。 |
| 3. runner / horse-number colors | 枠番のない現行入力にはVISUAL_ONLY配色を採用。馬番から枠番を推測しない。番号ラベルをスクリーン座標に配置し、衝突を回避。線の先が元の走行位置。ズームでも番号のサイズは一定。選択は白枠＋三角印、通過済みは薄く表示。 |
| 4. Scenario Order | 共通配色ヘルパーでtrackと色を統一。選択状態を親で共有。選択馬の描画を最前面にする。画面で選択・色一致を確認。 |
| 5. crossing order | 既存順序のまま番号チップ＋矢印を表示。仮想ゴール通過順の注意書きを維持。 |
| 6. broadcast overlay | AUTO / BROADCASTで開催場・距離・区間・ペース・STANDARD・選択番号を表示。残距離の新計算は導入していない。 |
| 7. Terrain visual | 既存Atlasの坂表示・断面図を維持。追加の地形計算なし。未確認値を補完していない。 |
| 8. Share View | ナビ・再生／カメラ操作・補助表示を隠し、ブランド・レース情報・シナリオ注意書き・選択馬を表示。端末幅に合わせた撮影用レイアウト。固定比率の選択肢は採用せず、16:9 / 1:1 / 9:16の書出しや固定枠は未提供。アップロード機能なし。 |
| 9. mobile | 390 / 430 / 768 / 1024 / 1440pxで東京コースの横overflow 0。代表5コースの1440 / 390pxでも0。 |
| 10. accessibility | 配色文字コントラスト4.5:1以上のテスト成功。対象camera/order/share/playback/speedボタンは5幅ですべて44px以上。色以外の番号・枠・選択印あり。最終200条件で馬番ラベル同士の重なり0・枠外表示0。 |
| 11. logic invariance | 基準版とのソース一致検査でscenarioReplay / scenarioOrder / scenarioMotion / camera / courseAtlas / courseDiagramData / courseSections / progressStoreを検証。TrackStageの計算パイプラインは、独立した表示ラベル処理を除き基準版と一致。最終TRACK50組で走行点・一覧順・通過順一致。 |
| 12. performance | 最終版の前景60fps / p95<20msは未確認。途中版の測定はブラウザーがバックグラウンドとなり、300フレームでp95約1016.6ms・50ms超166。性能判定には使用できない。前景にできるかユーザーへ質問済み。 |
| 13. bundle impact | 下表参照。JS+CSS gzip合計で2503 bytes増。画像追加なし。 |
| 14. screenshots | `artifacts/visual-polish/`。変更前50状態、最終通常TRACK/AUTO各50・reduced AUTO50・通常BROADCAST50を記録。最終共有画面は`final-share-desktop.jpg` / `final-share-mobile.jpg`。 |
| 15. exact files | 下記一覧。 |
| 16. SHA | 上記基準SHA。未コミットのため新SHAなし。 |
| 17. remaining risks | 前景性能、全コース・最大頭数での長時間連続再生、角・坂・距離標同士の全ズームでの干渉、障害コースの実表示は追加確認が必要。 |

## 検証

- Vite本番ビルド成功。既存の500kB超chunk警告は残る。
- `tsc --noEmit`: 成功。
- 対象Vitest: 12ファイル、154テスト成功。
- 18頭が同一点に密集したケースでも、番号ラベルの衝突・枠外表示なし（360×320 / 640×300、中央と端）。元の座標は変化しない。
- `node --check scripts/visualPolishPreview.mjs`: 成功。
- `git diff --check`: 成功。
- 最後に距離・坂・コーナー注記をTRACK表示の枠内へ補正。変更後の関連21テスト・型検証・ビルド成功。200条件の馬番検証後にこの注記補正を追加したため、全注記の全条件再確認は未完了。前景性能に加え、注記の干渉確認もREADY判定前に残る。
- 専用lint設定によるlintは未実施。
- Windows Chrome headed。ローカルfixture APIを使用し、本番APIへ接続しない。固定8頭のfixtureに各コース条件を適用した。実レースの出走表検証ではない。
- START / BACKSTRETCH / TURN / FINAL / FINISHを確認。FINISHにはCROSSING ORDERも含む。
- `final-runtime.json`: 最終150条件（通常TRACK / AUTO・reduced AUTO）、`broadcast.json`: 最終通常BROADCAST50条件。すべて馬番ラベル重なり0・枠外表示0・ページ横overflow 0。
- reduced-motionは検証サーバーでmatchMedia結果と該当CSSメディア条件を再現。OS設定は変更していない。背景視差非表示、AUTO→TRACKを実画面で確認。
- `runtime.json`は途中版の比較記録。正式な最終描画検証は`final-runtime.json`と`broadcast.json`。前後比較のbefore行はそのまま利用できる。
- `share-checks.json` / `share-final-checks.json` / `share-final-9-16.jpg`は不採用となった固定比率試作の記録。現在のShare Viewは端末幅への追従表示。
- 初期全ページ画像の待機失敗後、通常viewport画像で再記録した。

## サイズ比較（bytes）

| 指標 | before | after | 差分 |
| --- | ---: | ---: | ---: |
| 全JSファイル gzip合計 | 350370 | 352024 | +1654 |
| 全CSSファイル gzip合計 | 58685 | 59534 | +849 |
| 画像2ファイル合計 | 3616275 | 3616275 | 0 |
| 配信ディレクトリ全体・非圧縮 | 15168823 | 15179573 | +10750 |

ディレクトリ全体のサイズは実際の1ページ転送量ではない。ネットワーク条件を揃えたtotal page weightは未測定。

## 変更ファイル

- `client/src/components/trace/TrackStage.tsx`
- `client/src/components/trace/ScenarioOrderPanel.tsx`
- `client/src/components/trace/runnerPresentation.ts`（新規）
- `client/src/components/trace/runnerPresentation.test.ts`（新規）
- `client/src/components/trace/runnerLabels.ts`（新規）
- `client/src/components/trace/runnerLabels.test.ts`（新規）
- `client/src/components/trace/visualInvariance.test.ts`（新規）
- `client/src/pages/SimulatorShell.tsx`
- `client/src/pages/SimulatorShell.contract.test.tsx`
- `client/src/trace.css`
- `scripts/visualPolishPreview.mjs`（新規、ローカルfixture配信・計測・reduced-motion再現専用）
- `docs/simulator-visual-polish.md`（本報告）

配色ヘルパーは明示的な枠番1〜8を検証・配色できるが、現行API型に枠番がないため本画面はVISUAL_ONLYを利用。枠番の推測・API契約変更はしていない。

## 続行手順

隔離複製で `node scripts/visualPolishPreview.mjs dist/public 4478` を起動し、前景Chromeで `/simulator?audit=1` を開いて再生する。600フレームの出力を確認し、正常な前景条件で性能目標を満たした場合に最終判定を再開する。依頼どおり全GREENの場合のみfeature branchへ1commit。mainへのmerge/pushは禁止。
