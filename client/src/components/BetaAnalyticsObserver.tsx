import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  initializeBetaAnalytics,
  routeName,
  trackBetaEvent,
} from "@/lib/betaAnalytics";

export function BetaAnalyticsObserver() {
  const [location] = useLocation();

  useEffect(() => {
    initializeBetaAnalytics();
  }, []);

  useEffect(() => {
    trackBetaEvent({
      name: "beta_page_view",
      properties: { route: routeName(window.location.pathname, import.meta.env.BASE_URL) },
    });
  }, [location]);

  return null;
}
