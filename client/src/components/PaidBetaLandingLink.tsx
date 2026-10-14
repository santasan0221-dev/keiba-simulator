import React from "react";
import { Link } from "wouter";
import { paidBetaLandingEnabled } from "@/lib/paidBetaLandingFlag";
export function PaidBetaLandingLink({enabled=paidBetaLandingEnabled()}:{enabled?:boolean}) {
 if(!enabled)return null;
 return <p className="lab-related-links"><Link href="/beta" className="real-race-history-link">KEIBA TRACE 分析βについて<span aria-hidden="true"> ＞</span></Link></p>;
}
