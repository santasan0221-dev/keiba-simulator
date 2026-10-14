// Isolated screenshot fixture ONLY. Not linked from production App or build input.
import React from 'react';import {createRoot} from 'react-dom/client';import {Router} from 'wouter';
import PaidBetaLanding from '../../../client/src/pages/PaidBetaLanding';
import {landingConfig,LANDING_STATES,type LandingState} from '../../../client/src/lib/paidBetaLanding';
import '../../../client/src/index.css';
const state=new URLSearchParams(location.search).get('fixture_state') as LandingState;
const config={...landingConfig(),enabled:true,state:LANDING_STATES.includes(state)?state:'PRELAUNCH' as LandingState,interestUrl:'https://forms.gle/isolated-fixture-not-live',noteUrl:null,purchaseApproved:false};
createRoot(document.getElementById('root')!).render(<Router><PaidBetaLanding config={config}/></Router>);
