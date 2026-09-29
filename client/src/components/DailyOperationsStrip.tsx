import React, { useEffect, useState } from "react";
import { ApiFailure, apiOrigin } from "./ApiState";
import {
  fetchDailyOperations,
  fetchLabHealth,
  type LabDailyOperations,
  type LabHealth,
} from "@/lib/singlePickAi";
const time = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("ja-JP", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Tokyo",
      })
    : "取得不能";
export function DailyOperationsStrip({
  selectedDate,
}: {
  selectedDate: string | null;
  onLatestDate?: (date: string) => void;
}) {
  const [daily, setDaily] = useState<{
    date: string;
    value: LabDailyOperations;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [health, setHealth] = useState<LabHealth | null>(null);
  const [healthError, setHealthError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setHealth(null);
    setHealthError(null);
    void fetchLabHealth()
      .then(value => {
        if (active) setHealth(value);
      })
      .catch(reason => {
        if (active) setHealthError(reason);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    let active = true;
    setError(null);
    setLoading(Boolean(selectedDate));
    if (selectedDate)
      void fetchDailyOperations(selectedDate)
        .then(value => {
          if (value.race_date !== selectedDate)
            throw new Error("Date mismatch");
          if (active) setDaily({ date: selectedDate, value });
        })
        .catch(reason => {
          if (active) setError(reason);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [selectedDate, retry]);
  const current =
    !loading && !error && daily?.date === selectedDate ? daily.value : null;
  const missing = loading ? "読込中" : "取得不能";
  const count = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : missing;
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
  }).format(new Date());
  const healthLabel =
    health?.reachable === true &&
    health.schema_version === "lab-api-v2" &&
    health.auth_state === "NOT_REQUIRED_READ_ONLY"
      ? "正常"
      : health || healthError
        ? "要確認"
        : "確認中";
  return (
    <section className="daily-operations-strip" aria-label="日次運用ステータス">
      <header className="broadcast-heading">
        <div>
          <span className="eyebrow">KEIBA TRACE / OPERATIONS</span>
          <h1>
            {selectedDate === today
              ? "今日の競馬運用状況"
              : "開催日の競馬運用状況"}
          </h1>
          <p>
            {selectedDate ?? "開催日を確認中"}{" "}
            <span>· 予測から公式結果まで</span>
          </p>
        </div>
        <span className="broadcast-edition">
          RACE DAY
          <br />
          MONITOR
        </span>
      </header>
      <div className="daily-operations-grid" aria-busy={loading}>
        <div>
          <small>Today's predictions</small>
          <span>予測 JRA / NAR</span>
          <strong>
            {current?.prediction_counts
              ? `${count(current.prediction_counts.JRA)} / ${count(current.prediction_counts.NAR)}`
              : missing}
          </strong>
        </div>
        <div>
          <small>Official results</small>
          <span>公式結果</span>
          <strong>{count(current?.official_result_count)}</strong>
        </div>
        <div>
          <small>Pending</small>
          <span>未確定</span>
          <strong className="status-pending">
            {count(current?.pending_count)}
          </strong>
        </div>
        <div>
          <small>Review required</small>
          <span>確認中</span>
          <strong className="status-review">
            {count(current?.review_required_count)}
          </strong>
        </div>
        <div>
          <small>Last prediction</small>
          <span>最終予測</span>
          <strong className="metric-time">
            {current ? time(current.last_prediction_at) : missing}
          </strong>
        </div>
        <div>
          <small>Last result</small>
          <span>最終結果</span>
          <strong className="metric-time">
            {current ? time(current.last_result_at) : missing}
          </strong>
        </div>
      </div>
      {Boolean(error) && (
        <ApiFailure
          error={error}
          onRetry={() => setRetry(value => value + 1)}
        />
      )}
      <div className="operations-secondary">
        <span>
          System health <b>{healthLabel}</b>
        </span>
        <span>
          Next automation{" "}
          <b>{current ? time(current.next_scheduled_at) : missing}</b>
        </span>
        <details className="daily-diagnostic">
          <summary>接続診断</summary>
          <p>API origin: {apiOrigin()}</p>
          <p>
            schema:{" "}
            {typeof health?.schema_version === "string"
              ? health.schema_version
              : "確認中"}
          </p>
          {healthError ? (
            <ApiFailure error={healthError} />
          ) : (
            <p>接続状態: {healthLabel}</p>
          )}
          <button type="button" onClick={() => setRetry(value => value + 1)}>
            診断を更新
          </button>
        </details>
      </div>
    </section>
  );
}
