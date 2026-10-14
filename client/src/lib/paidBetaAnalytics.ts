import type { LandingState } from './paidBetaLanding';
export const LANDING_EVENTS=['landing_view','sample_cta','beta_interest_cta','faq_open','note_cta','simulator_cta'] as const;
export type LandingEventName=(typeof LANDING_EVENTS)[number];
export function sanitizeLandingEvent(event:{name:string;properties:Record<string,string>}) {
 if(!LANDING_EVENTS.includes(event.name as LandingEventName)||!['PRELAUNCH','INVITE_OPEN','FULL','PAUSED'].includes(event.properties.state))return null;
 return {name:event.name as LandingEventName,properties:{state:event.properties.state}};
}
// Same existing Umami client and globally installed privacy hook, no new tracker.
// Events are best-effort: tracker unavailable => no send, no product failure.
export function trackLandingEvent(name:LandingEventName,state:LandingState) {
 const event=sanitizeLandingEvent({name,properties:{state}});
 if(!event||typeof window==='undefined'||!window.umami?.track)return false;
 try{window.umami.track(event.name,event.properties);return true;}catch{return false;}
}
