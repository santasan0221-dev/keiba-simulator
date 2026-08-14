# レースビュー構成

`Home.tsx` 内の `RaceReplay` は、既存シミュレーションの `horses`、`liveRanks`、`progress`、`isRunning`、`isPaused` を受け取る表示専用コンポーネントである。SVGコースの座標は進捗率と順位から算出し、既存の `run` と `resetAnimation` をコントロールに接続する。分析ロジック、馬券計算、Managementのデータ管理には変更を加えない。
