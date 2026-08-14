import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartDatum = Record<string, string | number>;
export type ChartHorse = { no: number; name: string; color: string };

export type LazyAnalysisChartsProps =
  | { variant: "probability"; data: ChartDatum[] }
  | { variant: "horse-profile"; radarData: ChartDatum[]; barData: ChartDatum[]; horses: ChartHorse[] }
  | { variant: "log-summary"; segmentData: ChartDatum[]; leaderData: ChartDatum[] };

const tooltipStyle = { background: "#1b2431", border: "1px solid #c8a86655", color: "#f3efe5" };

export default function LazyAnalysisCharts(props: LazyAnalysisChartsProps) {
  if (props.variant === "probability") {
    return <ResponsiveContainer width="100%" height="100%"><AreaChart data={props.data}><defs><linearGradient id="brassFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8a866" stopOpacity={.4} /><stop offset="100%" stopColor="#c8a866" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#ffffff12" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#788394", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis hide /><Tooltip contentStyle={{ ...tooltipStyle, borderRadius: 4 }} /><Area type="monotone" dataKey="value" stroke="#c8a866" fill="url(#brassFill)" strokeWidth={2} /></AreaChart></ResponsiveContainer>;
  }

  if (props.variant === "horse-profile") {
    return <div className="horse-profile-charts"><div className="profile-chart"><ResponsiveContainer width="100%" height={260}><RadarChart data={props.radarData}><PolarGrid stroke="#ffffff24" /><PolarAngleAxis dataKey="metric" tick={{ fill: "#b9c3d4", fontSize: 10 }} /><PolarRadiusAxis domain={[0, 100]} tick={{ fill: "#7f8b98", fontSize: 8 }} /><Tooltip contentStyle={{ background: "#101b27", border: "1px solid #c8a86655", color: "#f3efe5" }} />{props.horses.map((horse) => <Radar key={horse.no} name={horse.name} dataKey={horse.name} stroke={horse.color} fill={horse.color} fillOpacity={.17} strokeWidth={2} />)}<Legend wrapperStyle={{ fontSize: 10 }} /></RadarChart></ResponsiveContainer></div><div className="profile-chart"><ResponsiveContainer width="100%" height={260}><BarChart data={props.barData}><CartesianGrid stroke="#ffffff14" vertical={false} /><XAxis dataKey="metric" tick={{ fill: "#b9c3d4", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: "#7f8b98", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "#101b27", border: "1px solid #c8a86655", color: "#f3efe5" }} />{props.horses.map((horse) => <Bar key={horse.no} name={horse.name} dataKey={horse.name} fill={horse.color} radius={[2, 2, 0, 0]} />)}<Legend wrapperStyle={{ fontSize: 10 }} /></BarChart></ResponsiveContainer></div></div>;
  }

  return <div className="dashboard-chart-grid"><div className="dashboard-chart-card"><div className="card-label"><span>SECTION ACTIVITY</span><span>区間別ログ数</span></div><div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={props.segmentData}><CartesianGrid stroke="#ffffff12" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#788394", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis hide /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="通過数" fill="#c8a866" radius={[2, 2, 0, 0]} /></BarChart></ResponsiveContainer></div></div><div className="dashboard-chart-card"><div className="card-label"><span>LEADER FREQUENCY</span><span>先頭馬の出現回数</span></div><div className="dashboard-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={props.leaderData} layout="vertical"><CartesianGrid stroke="#ffffff12" horizontal={false} /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={100} tick={{ fill: "#b9c3d4", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="先頭回数" fill="#95c6b0" radius={[0, 2, 2, 0]} /></BarChart></ResponsiveContainer></div></div></div>;
}
