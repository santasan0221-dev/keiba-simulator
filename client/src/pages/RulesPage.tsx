import React from "react";
import { Link } from "wouter";
import { PublicLabHeader } from "@/components/LabServiceNavigation";

// 記録ルール (/rules). Plain-language statement of what KEIBA TRACE records and
// how it counts. Rules for things that are not built yet say "準備中" -- this page
// must never promise more than the product does today.
//
// The counting rules below are the same ones lib/todayRecord.ts applies to the
// "今日の記録" panel on Home.

type Row = [string, string, string];

const COUNTING_ROWS: Row[] = [
  ["◎が出走取消・競走除外（出走しなかった）", "含めない", "「非出走」として件数を別に表示します。"],
  ["◎が競走中止（出走したが完走できなかった）", "含める", "1着・3着内には数えません。件数を別に表示します。"],
  ["レースが取止（不成立）", "含めない", "「レース不成立」として件数を別に表示します。"],
  ["同着", "含める", "公式の着順のとおりに扱います。"],
  ["結果が確定していない（確定待ち・要確認・取得失敗）", "含める", "確定するまで、的中にも外れにも数えません。内訳は常に表示します。"],
];

const RESULT_ROWS: Row[] = [
  ["確定", "公式結果を取得し、照合が済んだレースです。", ""],
  ["確定待ち", "まだ公式結果を取得していないレースです。", "母数から外しません。"],
  ["要確認（REVIEW_REQUIRED）", "取得した結果の照合が済んでいないレースです。人が確認します。", "母数から外しません。"],
  ["取得失敗", "結果を取得できなかったレースです。", "母数から外しません。"],
  ["特殊な結果", "出走取消・競走除外・競走中止・レース取止などです。", "下の表のとおりに扱います。"],
];

function Table({ head, rows, label }: { head: [string, string, string]; rows: Row[]; label: string }) {
  return <div className="kt-rules-table" role="table" aria-label={label}>
    <div className="kt-rules-row kt-rules-head" role="row">{head.map(cell => <span key={cell} role="columnheader">{cell}</span>)}</div>
    {rows.map(row => <div className="kt-rules-row" role="row" key={row[0]}>{row.map((cell, index) => <span key={index} role="cell">{cell}</span>)}</div>)}
  </div>;
}

export default function RulesPage() {
  return <PublicLabHeader active="rules" eyebrow="RULES / 記録ルール" title="KEIBA TRACEの記録ルール" description="何を記録し、どう数えるか。外れも、確定待ちも、同じルールで残します。">
    <article className="kt-rules">
      <section aria-labelledby="rules-about">
        <h2 id="rules-about">このサイトについて</h2>
        <p>KEIBA TRACEは、AIの競馬予想を<strong>発走前に記録し、市場と比べ、結果まで検証する</strong>サイトです。当たる予想を売るサイトではありません。的中や利益は保証しません。</p>
        <p className="kt-rules-callout">◎は購入推奨ではありません。馬券の購入は20歳になってから。無理のない範囲で、最終的な判断はご自身でお願いします。</p>
      </section>

      <section aria-labelledby="rules-trio">
        <h2 id="rules-trio">◎・AI TOP・MARKET TOPの違い</h2>
        <ul className="kt-rules-list">
          <li><strong>◎（公開本命）</strong> — サイトが公開した、各レースの本命です。結果の採点は、この馬で行います。1レースにつき1頭です。</li>
          <li><strong>AI TOP（AI評価1位）</strong> — AIの勝つ確率が最も高いと出た馬です。印はつきません。◎と同じ馬とは限りません。現在は中央競馬（JRA）のみ表示し、地方競馬（NAR）では表示しません。</li>
          <li><strong>MARKET TOP（市場評価1位）</strong> — 発走前のオッズで最も評価されている馬です。オッズが取得できたレースだけ表示し、取得できないときは「オッズ未取得」と表示します。人気順で代わりに表示することはしません。</li>
        </ul>
        <p>◎が確認できないレースは、理由つきで「◎なし」と表示します。AI TOPや市場の1位で代わりに埋めることはしません。</p>
        <p><strong>買い判定（BUY / WATCH / PASS）</strong>は、◎とは別の仕組みで出しています。◎がついていても判定がPASSのことがあります。判定は購入をすすめるものではなく、記録として表示しています。</p>
      </section>

      <section aria-labelledby="rules-free">
        <h2 id="rules-free">無料で見られる範囲</h2>
        <p>◎・AI TOP・MARKET TOP・買い判定・基本の結果と履歴は、<strong>すべてのレースで無料</strong>です。有料機能は準備中ですが、この範囲を有料に移すことはしません。MEMBER機能・決済は現在ありません（準備中）。</p>
      </section>

      <section aria-labelledby="rules-record">
        <h2 id="rules-record">記録のルール</h2>
        <ul className="kt-rules-list">
          <li><strong>発走前に記録します。</strong>予測は発走前に生成した時点で記録し、結果が出たあとに入れ替えません。レース詳細の「詳細データ」に、予測を記録した時点（AS OF）を表示しています。</li>
          <li><strong>外れも同じ形式で残します。</strong>的中も外れも確定待ちも、同じ形式で表示します。記録を削除して成績を良く見せることはしません。</li>
          <li><strong>訂正は追記で行います。</strong>誤りが見つかったときは、元の記録を残したまま訂正を追記します。</li>
        </ul>
        <p className="kt-rules-pending"><strong>準備中:</strong> 発走の何分前に記録したかを目立つ形で示す表示、訂正の一覧ページ、モデルやルールを変更した履歴の公開、記録の欠けた日の一覧は、まだありません。</p>
      </section>

      <section aria-labelledby="rules-status">
        <h2 id="rules-status">結果の見方</h2>
        <Table label="結果の状態" head={["表示", "意味", "母数での扱い"]} rows={RESULT_ROWS} />
      </section>

      <section aria-labelledby="rules-count">
        <h2 id="rules-count">「今日の記録」の数え方</h2>
        <p>Homeの「今日の記録」は、次のルールで数えています。「率の母数」は、◎の1着率・3着内率の分母です。</p>
        <Table label="特殊な結果の数え方" head={["場合", "率の母数", "扱い"]} rows={COUNTING_ROWS} />
        <ul className="kt-rules-list">
          <li><strong>確定待ちが残っているあいだは、率を表示しません。</strong>件数だけを表示し、すべて確定してから「1着 a/母数」の形で表示します。</li>
          <li>失格など、上の表にないその他の特殊な状態は、暫定的に母数に含め、1着・3着内には数えません。</li>
          <li>◎が公開されていないレースは、対象Rに含めず、別に件数を表示します。</li>
        </ul>
        <p className="kt-rules-pending"><strong>準備中:</strong> 「AI履歴」「運用状況」ページの◎成績は、現時点では「結果が確定し、◎の着順が確認できたレース」を母数にしています。取消・除外・競走中止を区別せず「取得不能」として母数に入らないため、上の数え方への統一は準備中です。</p>
      </section>

      <section aria-labelledby="rules-roi">
        <h2 id="rules-roi">仮想ROIと研究表示について</h2>
        <p>「実績・分析」ページの<strong>仮想ROI</strong>（単勝・複勝、100円固定）は、確定した払戻データから、<strong>もし100円を賭けていたら</strong>と仮に計算した参考値です。実際の購入結果ではなく、<strong>収益性や優位性の検証結果でもありません</strong>。レース数が少ないあいだは大きく変動します。</p>
        <p>「シミュレーター」は、条件を変えたときの展開を見るための<strong>研究用の仮想シナリオ</strong>です。予測の保証ではなく、表示される仮想ROIも同様に参考値です。</p>
        <p>これらを根拠に、的中や回収を約束することはしません。</p>
      </section>

      <section aria-labelledby="rules-data">
        <h2 id="rules-data">過去データについて</h2>
        <p>記録を始めた日より前のデータはありません。システムの都合で記録や結果が欠けた日・レースがある場合は、埋めたり推定したりしません。</p>
      </section>

      <section aria-labelledby="rules-play">
        <h2 id="rules-play">責任ある遊びについて</h2>
        <p>馬券は20歳になってから。のめり込みが心配なときは、無理をせず、専門の相談窓口に相談してください。</p>
      </section>

      <p className="kt-rules-back"><Link href="/">今日の予想へ戻る</Link> ／ <Link href="/ai-history">結果と履歴を見る</Link></p>
    </article>
  </PublicLabHeader>;
}
