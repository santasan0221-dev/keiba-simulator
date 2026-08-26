/* Velvet Turf design: the root stays intentionally minimal so the race-lab page owns the visual hierarchy. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { AccessCodeForm } from "@/components/AccessTierUI";
import { Route, Router as WouterRouter, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import RacePage from "./pages/RacePage";
import FreeRacesPage from "./pages/FreeRacesPage";
import RaceHistoryPage from "./pages/RaceHistoryPage";
import ResearchWorkbenchPage from "./pages/ResearchWorkbenchPage";
import BettingCandidatesPage from "./pages/BettingCandidatesPage";
import PerformanceAnalysisPage from "./pages/PerformanceAnalysisPage";
import MemberPage from "./pages/MemberPage";
import { BetaAnalyticsObserver } from "./components/BetaAnalyticsObserver";
import { BetaSurvey } from "./components/BetaSurvey";

function Router() {
  // Base path follows Vite's build base so the app works both at the site root
  // and when served under a sub-path (e.g. single_pick_ai serves it at /sim/).
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return <WouterRouter base={base}><BetaAnalyticsObserver /><Switch><Route path="/" component={Home} /><Route path="/race/:org/:date/:venue/:no" component={RacePage} /><Route path="/access-code" component={AccessCodeForm} /><Route path="/free" component={FreeRacesPage} /><Route path="/betting-candidates" component={BettingCandidatesPage} /><Route path="/performance-analysis" component={PerformanceAnalysisPage} /><Route path="/member" component={MemberPage} /><Route path="/research-workbench" component={ResearchWorkbenchPage} /><Route path="/ai-history" component={RaceHistoryPage} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch><BetaSurvey /></WouterRouter>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
