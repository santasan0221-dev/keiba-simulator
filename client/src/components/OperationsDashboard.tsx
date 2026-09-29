import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RefreshCw } from "lucide-react";
import { DailyOperationsStrip } from "./DailyOperationsStrip";
import { ApiFailure, ApiState } from "./ApiState";
import { formatCoverageRatio, formatSpecialStatuses } from "@/lib/resultFormat";
import {
  fetchAvailablePredictionDates,
  fetchLabResults,
  type LabResultListItem,
  type LabResultPredictionHorse,
} from "@/lib/singlePickAi";

type Filters = {
  date: string | null;
  organization: "" | "JRA" | "NAR";
  venue: string;
};
const dateTime = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Tokyo",
      }).format(new Date(value))
    : "取得不能";
export function statusText(status: string | null): string {
  const labels: Record<string, string> = {
    CONFIRMED: "確定",
    DEAD_HEAT: "同着",
    PENDING: "未確定",
    REVIEW_REQUIRED: "確認中",
    FAILED: "取得失敗",
    RACE_STOPPED: "競走中止",
  };
  return status ? (labels[status] ?? status) : "取得不能";
}
export function requestedResultValue(
  status: string | null,
  value: number | null,
  kind: "finish" | "coverage"
): string {
  const formatted =
    kind === "coverage"
      ? formatCoverageRatio(value)
      : typeof value === "number" && Number.isInteger(value) && value > 0
        ? `${value}着`
        : null;
  return (
    formatted ??
    (status === "PENDING"
      ? "未確定"
      : status === "CONFIRMED" || status === "DEAD_HEAT"
        ? "取得不能"
        : statusText(status))
  );
}
export function predictedMarkLabel(entry: LabResultPredictionHorse): string {
  return `${entry.mark}#${entry.horse_no}`;
}
function horseLabel(value: unknown, index: number): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0)
    return `${index + 1}着 #${value}`;
  if (value && typeof value === "object") {
    const horse = value as {
      horse_no?: unknown;
      horse_name?: unknown;
      finish?: unknown;
    };
    const rank =
      typeof horse.finish === "number" && horse.finish > 0
        ? horse.finish
        : index + 1;
    return `${rank}着 ${typeof horse.horse_no === "number" ? "#" + horse.horse_no : ""} ${typeof horse.horse_name === "string" ? horse.horse_name : ""}`.trim();
  }
  return "取得不能";
}
export function ResultRow({ item }: { item: LabResultListItem }) {
  const picks = item.predicted_top3?.filter(entry => entry.mark === "◎") ?? [];
  const honmei = picks.length === 1 ? picks[0] : null;
  const confirmed =
    item.result_status === "CONFIRMED" || item.result_status === "DEAD_HEAT";
  const state = confirmed
    ? "confirmed"
    : item.result_status === "PENDING"
      ? "pending"
      : item.result_status === "REVIEW_REQUIRED"
        ? "review"
        : "unavailable";
  const special = formatSpecialStatuses(item.special_statuses);
  return (
    <article className={`race-result-card is-${state}`}>
      <header className="race-trace-rail">
        <div>
          <span className="broadcast-badge">
            {item.organization ?? "主催未取得"}
          </span>
          <h3>
            {item.venue ?? "会場未取得"} <b>{item.race_no ?? "—"}R</b>
          </h3>
        </div>
        <span className={`broadcast-badge status-${state}`}>
          {statusText(item.result_status)}
        </span>
      </header>
      <div className="race-start">
        発走 <time>{dateTime(item.scheduled_start_at)}</time>
      </div>
      <div className="result-card-main">
        <section className="publication-pick">
          <small>公開本命</small>
          <strong>
            {honmei ? (
              <>
                <span className="honmei-mark">◎#{honmei.horse_no}</span>{" "}
                {honmei.horse_name ?? ""}
              </>
            ) : (
              "公開本命を確認中"
            )}
          </strong>
        </section>
        <section className="official-order">
          <small>公式1〜3着</small>
          <div>
            {item.official_top3?.length ? (
              item.official_top3.map((horse, index) => (
                <span key={index}>{horseLabel(horse, index)}</span>
              ))
            ) : (
              <span>
                {item.result_status === "PENDING" ? "未確定" : "取得不能"}
              </span>
            )}
          </div>
        </section>
      </div>
      <div className="result-metrics">
        <div>
          <small>◎着順</small>
          <strong>
            {requestedResultValue(
              item.result_status,
              honmei ? item.ai_pick_finish : null,
              "finish"
            )}
          </strong>
        </div>
        <div>
          <small>top3 coverage</small>
          <strong className="probability-value">
            {requestedResultValue(
              item.result_status,
              item.top3_coverage,
              "coverage"
            )}
          </strong>
        </div>
      </div>
      {special && <p className="special-status">{special}</p>}
      <details className="result-secondary">
        <summary>記録の詳細</summary>
        <dl>
          <div>
            <dt>予測生成</dt>
            <dd>{dateTime(item.prediction_created_at)}</dd>
          </div>
          <div>
            <dt>結果取得</dt>
            <dd>{dateTime(item.result_fetched_at)}</dd>
          </div>
          <div>
            <dt>detail ID</dt>
            <dd>{item.prediction_id ?? "取得不能"}</dd>
          </div>
        </dl>
      </details>
    </article>
  );
}
export function OperationsDashboard() {
  const [dates, setDates] = useState<string[] | null>(null);
  const [datesError, setDatesError] = useState<unknown>(null);
  const [datesLoading, setDatesLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    date: null,
    organization: "",
    venue: "",
  });
  const [snapshot, setSnapshot] = useState<{
    key: string;
    rows: LabResultListItem[];
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    error: unknown;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef(0);
  const key = JSON.stringify(filters);
  const refreshDates = useCallback(async () => {
    setDatesLoading(true);
    setDatesError(null);
    try {
      const response = await fetchAvailablePredictionDates();
      const values = response.available_dates;
      if (
        !Array.isArray(values) ||
        values.some(
          date => typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)
        )
      )
        throw new Error("Invalid dates");
      setDates(values);
      setFilters(current => ({
        ...current,
        date:
          current.date && values.includes(current.date)
            ? current.date
            : response.latest_prediction_date &&
                values.includes(response.latest_prediction_date)
              ? response.latest_prediction_date
              : (values[0] ?? null),
      }));
    } catch (error) {
      setDates(null);
      setDatesError(error);
      setFilters(current => ({ ...current, date: null }));
    } finally {
      setDatesLoading(false);
    }
  }, []);
  useEffect(() => {
    void refreshDates();
  }, [refreshDates]);
  useEffect(() => {
    const id = ++requestId.current;
    if (!filters.date) return;
    setLoading(true);
    setFailure(null);
    void fetchLabResults({
      date: filters.date,
      organization: filters.organization || undefined,
      venue: filters.venue || undefined,
    })
      .then(response => {
        if (id === requestId.current)
          setSnapshot({ key, rows: response.results });
      })
      .catch(error => {
        if (id === requestId.current) setFailure({ key, error });
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    return () => {
      requestId.current++;
    };
  }, [key, refresh, filters.date, filters.organization, filters.venue]);
  const rows = snapshot?.key === key ? snapshot.rows : null;
  const error = failure?.key === key ? failure.error : null;
  const venues = useMemo(
    () =>
      Array.from(
        new Set(
          (rows ?? [])
            .map(row => row.venue)
            .filter((v): v is string => Boolean(v))
        )
      ),
    [rows]
  );
  const waiting =
    datesLoading || Boolean(filters.date && (loading || (!rows && !error)));
  return (
    <section
      className="ops-dashboard broadcast"
      aria-label="公式結果の運用ダッシュボード"
    >
      <DailyOperationsStrip
        selectedDate={filters.date}
        onLatestDate={date => setFilters({ date, organization: "", venue: "" })}
      />
      <header className="broadcast-ledger-heading">
        <div>
          <span className="eyebrow">RACE RESULT LEDGER</span>
          <h2>予測の先を、確かめる。</h2>
          <p>公開本命と公式結果を、レースごとに。</p>
        </div>
        <button
          type="button"
          className="ops-dashboard-refresh"
          disabled={waiting}
          onClick={() => {
            void refreshDates();
            setRefresh(value => value + 1);
          }}
        >
          <RefreshCw size={16} />
          再取得
        </button>
      </header>
      <section className="ops-filter-panel" aria-label="公式結果の絞り込み">
        <label>
          開催日
          <select
            aria-label="開催日"
            value={filters.date ?? ""}
            disabled={!dates?.length}
            onChange={event =>
              setFilters({ ...filters, date: event.target.value, venue: "" })
            }
          >
            <option value="">
              {datesLoading
                ? "読み込み中"
                : datesError
                  ? "取得不能"
                  : "開催日なし"}
            </option>
            {dates?.map(date => (
              <option key={date}>{date}</option>
            ))}
          </select>
        </label>
        <label>
          主催
          <select
            aria-label="主催"
            value={filters.organization}
            onChange={event =>
              setFilters({
                ...filters,
                organization: event.target.value as Filters["organization"],
                venue: "",
              })
            }
          >
            <option value="">JRA / NAR</option>
            <option>JRA</option>
            <option>NAR</option>
          </select>
        </label>
        <label>
          競馬場
          <select
            aria-label="競馬場"
            value={filters.venue}
            onChange={event =>
              setFilters({ ...filters, venue: event.target.value })
            }
          >
            <option value="">すべて</option>
            {Array.from(
              new Set([...venues, ...(filters.venue ? [filters.venue] : [])])
            ).map(venue => (
              <option key={venue}>{venue}</option>
            ))}
          </select>
        </label>
      </section>
      {datesError ? (
        <ApiFailure error={datesError} onRetry={() => void refreshDates()} />
      ) : waiting ? (
        <ApiState kind="loading" />
      ) : error ? (
        <ApiFailure
          error={error}
          onRetry={() => setRefresh(value => value + 1)}
        />
      ) : rows?.length ? (
        <div className="ops-result-ledger">
          {rows.map(item => (
            <ResultRow key={item.race_key} item={item} />
          ))}
        </div>
      ) : (
        <ApiState kind="empty" />
      )}
    </section>
  );
}
