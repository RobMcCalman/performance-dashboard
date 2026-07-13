'use strict';
const fs = require('fs');
const DIR = __dirname;
const D = JSON.parse(fs.readFileSync(DIR + '/data.json', 'utf8'));

// ---------- constants ----------
const TODAY = D.today;                 // header "as of"
const ASOF = D.asOf;                   // last fully-landed day
const _AD = new Date(ASOF+'T00:00:00Z');
const CUR_MO = _AD.getUTCMonth()+1;    // month of ASOF = the current/latest month
const DIM = new Date(Date.UTC(_AD.getUTCFullYear(), CUR_MO, 0)).getUTCDate(); // days in that month
const DAYS_ELAPSED = _AD.getUTCDate(); // day-of-month of ASOF
const DD = DAYS_ELAPSED;
const YEAR_ELAPSED_DAYS = Math.round((_AD - new Date(Date.UTC(_AD.getUTCFullYear(),0,0)))/86400000);
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// ---------- reference-month framing ----------
// NM = months that have any data (1..CUR_MO). RM = the headline "reference month":
// during the first week of a new month we keep the just-completed month as the story anchor
// (its calendar-MTD panels are meaningful), while YTD/daily/this-week still advance to ASOF.
const NM = CUR_MO;
const RM = DAYS_ELAPSED>=7 ? CUR_MO : CUR_MO-1;
const RMdim = new Date(Date.UTC(_AD.getUTCFullYear(), RM, 0)).getUTCDate();
const RMcomplete = RM < CUR_MO;                 // reference month fully landed?
const MD = RMcomplete ? RMdim : DAYS_ELAPSED;   // days elapsed within the reference month
const MO_CUR = MONTHS[RM-1], MO_PREV = MONTHS[(RM-2+12)%12];
const GAPLBL = DAYS_ELAPSED + ' ' + MONTHS[CUR_MO-1]; // the lagging/as-of day label (e.g. "1 Jul")
const RMSTART = _AD.getUTCFullYear()+'-'+String(RM).padStart(2,'0')+'-01';
const RMEND = RMcomplete ? _AD.getUTCFullYear()+'-'+String(RM).padStart(2,'0')+'-'+String(RMdim).padStart(2,'0') : ASOF;
const CH_ORDER_PAID = ['Affiliate','ATL','PPC Brand','Google UAC','Meta App','Meta Paid Social','PPC Generic','Apple Ads Brand','Apple Ads Non Brand'];
const PAID = new Set(CH_ORDER_PAID);

// ---------- helpers ----------
const r0 = n => Math.round(n);
const gbp = n => '£' + r0(n).toLocaleString('en-GB');
const gbpM = n => '£' + (n/1e6).toFixed(2) + 'm';
const gbpK = n => '£' + r0(n/1000).toLocaleString('en-GB') + 'k';
const num = n => r0(n).toLocaleString('en-GB');
const f2 = n => (isFinite(n)? n.toFixed(2) : '–');
const pct = n => (n*100).toFixed(0) + '%';
const pct1 = n => (n*100).toFixed(1) + '%';
const div = (a,b) => b ? a/b : 0;
function ragLtv(v){ return v>=1.0 ? 'green' : v>=0.8 ? 'amber' : 'red'; }
// Affiliate profile username map — full list loaded from affiliate_names.json
// (derived from the affiliate_groups export, matched on Affiliate Profile ID -> Username)
let AFF_NAMES = {};
try { AFF_NAMES = JSON.parse(fs.readFileSync(DIR + '/affiliate_names.json','utf8')); } catch(e){ console.log('WARN no affiliate_names.json'); }
function affLabel(aid){ return AFF_NAMES[aid] ? `${AFF_NAMES[aid]} <span style="color:var(--muted)">(${aid})</span>` : `${aid} <span style="color:var(--muted)">(unmapped)</span>`; }
function affName(aid){ return AFF_NAMES[aid] || aid; }
function ragPace(v){ return v>=1.0 ? 'green' : v>=0.9 ? 'amber' : 'red'; }
function pill(cls, txt){ return `<span class="pill ${cls}">${txt}</span>`; }

// ---------- monthly channel aggregation ----------
const monByMo = {}; // mo -> {channel->row}
D.monch.forEach(r => { (monByMo[r.mo] = monByMo[r.mo] || {})[r.channel] = r; });
function moTotals(mo){
  let s=0,f=0,p=0,apd=0; Object.values(monByMo[mo]).forEach(r=>{s+=r.s;f+=r.f;p+=r.pn;apd+=r.apd;});
  return {s,f,p,apd};
}
const moTot = {}; for(let m=1;m<=NM;m++) moTot[m]=moTotals(m);

// ---------- YTD 2026 ----------
const ytd = {s:0,f:0,p:0,apd:0};
for(let m=1;m<=NM;m++){ ytd.s+=moTot[m].s; ytd.f+=moTot[m].f; ytd.p+=moTot[m].p; ytd.apd+=moTot[m].apd; }

// ---------- affiliate trailing CPA & gap-fill ----------
let aS=0,aF=0;
D.affDaily.forEach(d=>{ if(d.date>='2026-06-01' && d.date<=ASOF && d.s>0){ aS+=d.s; aF+=d.f; } });
const AFF_CPA = aS/aF;
const aff28 = D.affDaily.find(d=>d.date===ASOF); // Jun28 affiliate ftds, spend 0
const AFF_GAP_28 = (aff28 && aff28.s<=0 && aff28.f>0) ? aff28.f*AFF_CPA : 0;

// gap-filled daily (add Jun28 affiliate est to total spend)
const dailyG = D.daily.map(d=>({...d, sg: d.s + (d.date===ASOF? AFF_GAP_28:0)}));

// ---------- weekly rollup (ISO Monday) ----------
function weekStart(ds){ const d=new Date(ds+'T00:00:00Z'); const day=d.getUTCDay(); const diff=(day===0?6:day-1); d.setUTCDate(d.getUTCDate()-diff); return d.toISOString().slice(0,10); }
const wkMap = {};
dailyG.forEach(d=>{ const w=weekStart(d.date); const o=wkMap[w]||(wkMap[w]={wk:w,s:0,f:0,p:0,apd:0,days:0}); o.s+=d.sg; o.f+=d.f; o.p+=d.p; o.apd+=d.apd; o.days++; });
let weeks = Object.values(wkMap).sort((a,b)=>a.wk<b.wk?-1:1).filter(w=>w.days===7); // complete weeks only
weeks.forEach(w=>{ w.cpa=div(w.s,w.f); w.ltv=div(w.p,w.s); w.ppf=div(w.p,w.f); });
const last26 = weeks.slice(-26);

// ---------- current ISO week + trailing 4 COMPLETE weeks (dynamic window) ----------
const curWeekStart = weekStart(ASOF);
const _t4e = new Date(curWeekStart+'T00:00:00Z'); _t4e.setUTCDate(_t4e.getUTCDate()-1);   // last Sunday before this week
const _t4s = new Date(_t4e); _t4s.setUTCDate(_t4s.getUTCDate()-27);                        // 28 days back
const T4S=_t4s.toISOString().slice(0,10), T4E=_t4e.toISOString().slice(0,10);
let t4s=0,t4f=0,t4p=0;
dailyG.forEach(d=>{ if(d.date>=T4S && d.date<=T4E){ t4s+=d.sg; t4f+=d.f; t4p+=d.p; } });
const trailWk = {s:t4s/4, f:t4f/4, p:t4p/4};
trailWk.cpa=div(trailWk.s,trailWk.f); trailWk.ltv=div(trailWk.p,trailWk.s);
const dailyAvg = {s:t4s/28, f:t4f/28, p:t4p/28};

// ---------- day-of-week FTD shape (from last 8 complete weeks; stable) ----------
const DOW=d=>(new Date(d+'T00:00:00Z').getUTCDay()+6)%7;   // 0=Mon..6=Sun
const _8s=new Date(_t4e); _8s.setUTCDate(_8s.getUTCDate()-55);  // 8 weeks back from last complete Sun
const _8start=_8s.toISOString().slice(0,10);
const dwSum=[0,0,0,0,0,0,0], dwN=[0,0,0,0,0,0,0];
dailyG.forEach(d=>{ if(d.date>=_8start && d.date<=T4E){ const k=DOW(d.date); dwSum[k]+=d.f; dwN[k]++; } });
const _8mean = dailyG.filter(d=>d.date>=_8start&&d.date<=T4E).reduce((a,d)=>a+d.f,0) / dwN.reduce((a,b)=>a+b,0);
const dowIdx = dwSum.map((s,i)=> dwN[i]&&_8mean ? (s/dwN[i])/_8mean : 1);  // index vs daily mean, ~mean 1
// ---------- THIS-WEEK forecast (remaining days weighted by day-of-week shape) ----------
const wtdDays = dailyG.filter(d=>d.date>=curWeekStart && d.date<=ASOF);
const DAYS_LANDED_WK = wtdDays.length;
const landedDows = wtdDays.map(d=>DOW(d.date));
const DOWNM=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const remDows=[0,1,2,3,4,5,6].filter(k=>!landedDows.includes(k));
const REMW = remDows.reduce((a,k)=>a+dowIdx[k],0); // Σ dow-index over remaining days (flat = 7−landed)
const REM_SHAPE = remDows.map(k=>`${DOWNM[k]} ${dowIdx[k].toFixed(2)}×`).join(', ');
const wtd = {s:0,f:0,p:0}; wtdDays.forEach(d=>{ wtd.s+=d.sg; wtd.f+=d.f; wtd.p+=d.p; });
const wkFcst = { s: wtd.s + REMW*dailyAvg.s, f: wtd.f + REMW*dailyAvg.f, p: wtd.p + REMW*dailyAvg.p };
wkFcst.cpa=div(wkFcst.s,wkFcst.f); wkFcst.ltv=div(wkFcst.p,wkFcst.s);

// ---------- MTD June (gap-filled) + full-month forecast ----------
const mtd = {s: moTot[RM].s + (RMcomplete?0:AFF_GAP_28), f: moTot[RM].f, p: moTot[RM].p, apd: moTot[RM].apd};
mtd.cpa=div(mtd.s,mtd.f); mtd.ltv=div(mtd.p,mtd.s); mtd.ppf=div(mtd.p,mtd.f);
const moFcst = RMcomplete ? {s:mtd.s,f:mtd.f,p:mtd.p}
  : { s: mtd.s+(RMdim-DAYS_ELAPSED)*dailyAvg.s, f: mtd.f+(RMdim-DAYS_ELAPSED)*dailyAvg.f, p: mtd.p+(RMdim-DAYS_ELAPSED)*dailyAvg.p };
moFcst.cpa=div(moFcst.s,moFcst.f); moFcst.ltv=div(moFcst.p,moFcst.s);

// ---------- PLAN (June net, FY, YTD-to-date) ----------
const PLAN = D.plan;
function planMo(mo){ // 0-indexed month
  let s=0,f=0,p=0;
  for(const ch in PLAN){ const c=PLAN[ch]; s+=c.s[mo]; f+=c.f[mo]; p+= (ch==='Affiliate'? c.p[mo]*0.85 : c.p[mo]); }
  return {s,f,p};
}
const planRef = planMo(RM-1);
let planFY={s:0,f:0,p:0}; for(let m=0;m<12;m++){ const x=planMo(m); planFY.s+=x.s; planFY.f+=x.f; planFY.p+=x.p; }
// plan to-date = full completed months (0..CUR_MO-2) + current month pro-rated by days elapsed
let planYTD={s:0,f:0,p:0}; for(let m=0;m<CUR_MO-1;m++){ const x=planMo(m); planYTD.s+=x.s; planYTD.f+=x.f; planYTD.p+=x.p; }
{ const j=planMo(CUR_MO-1); planYTD.s+=j.s*DAYS_ELAPSED/DIM; planYTD.f+=j.f*DAYS_ELAPSED/DIM; planYTD.p+=j.p*DAYS_ELAPSED/DIM; }
// per-channel plan helper (net)
function planCh(ch,mo){ const c=PLAN[ch]; if(!c) return {s:0,f:0,p:0}; return {s:c.s[mo],f:c.f[mo],p:(ch==='Affiliate'?c.p[mo]*0.85:c.p[mo])}; }
const planMonthlyF = []; for(let m=0;m<12;m++) planMonthlyF.push(planMo(m).f);
// per-channel annual net PLTV-per-FTD ratio (for deriving weekly PLTV targets by channel)
const PLAN_RATIO = {}; for(const ch in PLAN){ let tp=0,tf=0; for(let m=0;m<12;m++){ tp+=(ch==='Affiliate'?PLAN[ch].p[m]*0.85:PLAN[ch].p[m]); tf+=PLAN[ch].f[m]; } PLAN_RATIO[ch]=tf?tp/tf:0; }

// pace
const paceP = div(moFcst.p, planRef.p), paceF = div(moFcst.f, planRef.f), paceS = div(moFcst.s, planRef.s);

// ---------- YoY (YTD like-for-like Jan1-Jun28) ----------
const y25spendYTD = D.y2025spend.slice(0,CUR_MO-1).reduce((a,b)=>a+b,0) + D.y2025spend[CUR_MO-1]*DAYS_ELAPSED/DIM;
const yoy = {
  ftds26: ytd.f, ftds25: D.y2025ytd.f,
  cpa26: div(ytd.s, ytd.f), cpa25: div(y25spendYTD, D.y2025ytd.f),
  ltv26: div(ytd.p, ytd.s), ltv25: div(D.y2025ytd.pg, y25spendYTD),
  spend26: ytd.s, spend25: y25spendYTD,
  pltv26: ytd.p, pltv25: D.y2025ytd.pg
};
yoy.ftdsD = yoy.ftds26/yoy.ftds25-1; yoy.cpaD = yoy.cpa26/yoy.cpa25-1; yoy.ltvD = yoy.ltv26/yoy.ltv25-1;
// CPA bridge 2025->2026: ΔCPA split into spend effect (more spend, adverse) + volume effect (more FTDs, favourable)
const cpaSpendEff = (yoy.spend26 - yoy.spend25)/yoy.ftds25;          // S26/F25 − S25/F25
const cpaVolEff = yoy.spend26*(1/yoy.ftds26 - 1/yoy.ftds25);          // S26/F26 − S26/F25

// ---------- Paid vs Organic YoY (2025 paid spend = tracker total; organic ~free) ----------
const PAID_SEG = new Set([...CH_ORDER_PAID, 'Affiliate App', 'Display/Programmatic']);
const F25CH = {Affiliate:49157,Unattributed:25448,RAF:14171,'PPC Generic':7879,'iOS Organic':7681,'PPC Brand':6846,'Android Organic':4454,'Meta Paid Social':2608,'Affiliate App':932,'Display/Programmatic':209,'Google UAC':0};
const ch26={}; D.monch.forEach(r=>{const o=ch26[r.channel]||(ch26[r.channel]={s:0,f:0});o.s+=r.s;o.f+=r.f;}); if(ch26['Affiliate']) ch26['Affiliate'].s+=AFF_GAP_28;
const seg={p26:{s:0,f:0},o26:{s:0,f:0},p25f:0,o25f:0};
Object.entries(ch26).forEach(([c,v])=>{ if(PAID_SEG.has(c)){seg.p26.s+=v.s;seg.p26.f+=v.f;} else {seg.o26.s+=v.s;seg.o26.f+=v.f;} });
Object.entries(F25CH).forEach(([c,v])=>{ if(PAID_SEG.has(c)) seg.p25f+=v; else seg.o25f+=v; });
seg.paid25cpa=div(y25spendYTD,seg.p25f); seg.paid26cpa=div(seg.p26.s,seg.p26.f);
seg.org26cpa=div(seg.o26.s,seg.o26.f);
seg.paidFD=div(seg.p26.f,seg.p25f)-1; seg.orgFD=div(seg.o26.f,seg.o25f)-1;

// ---------- MoM May1-28 vs Jun1-28 (matched) ----------
const mayCh = {}; D.mayMTD.forEach(r=>mayCh[r.channel]=r);
const junCh = monByMo[RM];
const mayTot = D.mayMTD.reduce((a,r)=>({s:a.s+r.s,f:a.f+r.f,p:a.p+r.p}),{s:0,f:0,p:0});
const junMTDraw = {s:moTot[RM].s,f:moTot[RM].f,p:moTot[RM].p};
// PLTV drivers compare the two most recent COMPLETE months (never a partial live month)
const DRV_CUR = (DAYS_ELAPSED>=DIM) ? CUR_MO : CUR_MO-1;   // last fully-landed month
const DRV_PREV = DRV_CUR-1;
const drvPrevCh = monByMo[DRV_PREV]||{}, drvCurCh = monByMo[DRV_CUR]||{};
const MO_DRVCUR = MONTHS[DRV_CUR-1], MO_DRVPREV = MONTHS[DRV_PREV-1];
const momMovers = [];
const allChD = new Set([...Object.keys(drvPrevCh), ...Object.keys(drvCurCh)]);
allChD.forEach(ch=>{ const m=drvPrevCh[ch]||{pn:0,f:0}; const j=drvCurCh[ch]||{pn:0,f:0}; momMovers.push({ch, dP:(j.pn||0)-(m.pn||0), mp:m.pn||0, jp:j.pn||0}); });
momMovers.sort((a,b)=>b.dP-a.dP);
const _pT=moTot[DRV_PREV], _cT=moTot[DRV_CUR];
const mom = {
  mayPPF: div(_pT.p,_pT.f), junPPF: div(_cT.p,_cT.f),
  dPLTV: _cT.p-_pT.p, dF: _cT.f-_pT.f,
  mayP: _pT.p, junP: _cT.p, mayF: _pT.f, junF: _cT.f
};
mom.volEffect = mom.dF * mom.mayPPF;
mom.rateEffect = _cT.f * (mom.junPPF - mom.mayPPF);
// standout low-value channel in the reference complete month
let standoutDrv=null;
Object.values(drvCurCh).forEach(r=>{ const share=r.f/_cT.f, ppf=div(r.pn,r.f); if(share>=0.03 && r.f>=100){ if(!standoutDrv||ppf<standoutDrv.ppf) standoutDrv={ch:r.channel,ppf,share,f:r.f}; } });

// ---------- monthly blended ppf + look-alike ----------
const moBlend = []; for(let m=1;m<=NM;m++){ moBlend.push({mo:m, ppf: div(moTot[m].p, moTot[m].f), f: moTot[m].f}); }
// standout low-value channel in June (share>=3%, ftd>=100, min ppf)
let standout=null;
Object.values(junCh).forEach(r=>{ const share=r.f/moTot[RM].f; const ppf=div(r.pn,r.f); if(share>=0.03 && r.f>=100){ if(!standout||ppf<standout.ppf) standout={ch:r.channel,ppf,share,f:r.f}; } });

// ---------- channel mix last-4-week (June) ----------
const mixRows = Object.values(junCh).map(r=>({ch:r.channel,s:r.s,f:r.f,p:r.pn,apd:r.apd})).sort((a,b)=>b.s-a.s);

// ---------- APD2+ by channel YTD ----------
const apdYTD = {};
D.monch.forEach(r=>{ const o=apdYTD[r.channel]||(apdYTD[r.channel]={s:0,apd:0,f:0}); o.s+=r.s; o.apd+=r.apd; o.f+=r.f; });
const apdRows = Object.entries(apdYTD).map(([ch,o])=>({ch,...o,cpa:div(o.s,o.apd),ratio:div(o.apd,o.f)})).filter(r=>r.apd>0).sort((a,b)=>b.apd-a.apd);
const apdBlendCost = div(ytd.s, ytd.apd);

// ---------- Web vs App ----------
const platYTD = {};
D.plat.forEach(r=>{ const o=platYTD[r.plat]||(platYTD[r.plat]={s:0,f:0,p:0,apd:0}); o.s+=r.s;o.f+=r.f;o.p+=r.p;o.apd+=r.apd; });
const platMonthly = {Web:[],App:[],Other:[]};
for(let m=1;m<=RM;m++){ ['Web','App','Other'].forEach(pl=>{ const row=D.plat.find(r=>r.mo===m&&r.plat===pl); platMonthly[pl].push(row?row.f:0); }); }

// ---------- ATL implied cost/FTD ----------
const atlYTD = D.monch.filter(r=>r.channel==='ATL').reduce((a,r)=>a+r.s,0);
const atlMonthly = []; for(let m=1;m<=RM;m++){ const r=monByMo[m]['ATL']; atlMonthly.push(r?r.s:0); }
const atlCostPerFtd = div(atlYTD, ytd.f);

// ---------- channel optimisation trailing-4wk (June) ----------
const optRows = Object.values(junCh).map(r=>{ const s = r.channel==='Affiliate'? r.s+AFF_GAP_28 : r.s; return {ch:r.channel,s,f:r.f,p:r.pn,ltv:div(r.pn,s),cpa:div(s,r.f),paid:PAID.has(r.channel)}; }).filter(r=>r.s>0).sort((a,b)=>b.ltv-a.ltv);

// ---------- threshold alerts ----------
const chanAlerts = optRows.filter(r=>r.s>=5000 && r.f>0 && r.ltv<0.8);
const affAlerts = D.aff.filter(a=>a.s>=20000 && div(a.p,a.s)<0.8).map(a=>({aid:a.aid,s:a.s,ltv:div(a.p,a.s)}));

// ---------- time-decay ----------
const tdLC={}, tdTD={};
D.td.forEach(r=>{ (r.mv==='last_click'?tdLC:tdTD)[r.channel]={f:r.f,p:r.p,s:r.s}; });
const tdChannels = [...new Set(D.td.map(r=>r.channel))];

// ---------- ad-group leaderboard ----------
const adgRows = D.adg.map(r=>({...r, ltv:div(r.p,r.s), cpa:div(r.s,r.f)})).sort((a,b)=>b.ltv-a.ltv);
const adgBest = adgRows.slice(0,10);
const adgWorst = adgRows.slice(-10).reverse();

// ---------- affiliate leaderboard ----------
const affRows = D.aff.map(a=>({...a, ltv:div(a.p,a.s), cpa:div(a.s,a.f), cpapd:div(a.s,a.apd)}));

// ---------- affiliate MoM (matched May 1-DD vs Jun 1-DD) ----------
const AFF_MOM = D.affMom.map(a=>({...a, name:affName(a.aid), mayL:div(a.may_p,a.may_s), junL:div(a.jun_p,a.jun_s), dP:a.jun_p-a.may_p, dF:a.jun_f-a.may_f, dS:a.jun_s-a.may_s}));
// channel-total affiliate May vs June (matched 1-28) for KPI row
const affMayTot = mayCh['Affiliate']; // {s,f,p}
const affJunTot = {s:junCh['Affiliate'].s, f:junCh['Affiliate'].f, p:junCh['Affiliate'].pn};
const affMomMovers = [...AFF_MOM].sort((a,b)=>Math.abs(b.dP)-Math.abs(a.dP)).slice(0,12).sort((a,b)=>b.dP-a.dP);

// ---------- per-channel monthly trends (selector) ----------
const trendCh = {};
Object.keys(apdYTD).filter(ch=>apdYTD[ch].f>50).forEach(ch=>{
  const s=[],f=[],p=[],cpa=[],ltv=[];
  for(let m=1;m<=RM;m++){ const r=monByMo[m][ch]; const ss=r?r.s:0, ff=r?r.f:0, pp=r?r.pn:0; s.push(ss);f.push(ff);p.push(pp);cpa.push(div(ss,ff));ltv.push(div(pp,ss)); }
  trendCh[ch]={s,f,p,cpa,ltv};
});

// ---------- anomaly / data-health ----------
const LAST2 = D.last2||[];  // last complete week vs prior, by channel FTDs (anomaly scan)
const swings = LAST2.map(x=>({ch:x.ch, d: x.f15? (x.f22-x.f15)/x.f15 : (x.f22>0?1:0), f15:x.f15, f22:x.f22})).filter(x=>Math.abs(x.d)>0.40 && (x.f15>=50||x.f22>=50)).sort((a,b)=>a.d-b.d);

// ---------- reconciliation check ----------
const reconErr = Math.abs(ytd.s - D.ytdProbe.spend)/D.ytdProbe.spend;
console.log('RECON spend ytd', r0(ytd.s), 'vs probe', D.ytdProbe.spend, 'err', (reconErr*100).toFixed(3)+'%');
console.log('RECON ftds', ytd.f, 'pltvNet', r0(ytd.p), 'vs', D.ytdProbe.pltvNet);
console.log('AFF_CPA', AFF_CPA.toFixed(2), 'gap28', r0(AFF_GAP_28));
console.log('thisweek fcst f', r0(wkFcst.f), 'ltv', wkFcst.ltv.toFixed(3));
console.log('MTD f', mtd.f, 'fullmo fcst f', r0(moFcst.f), 'paceF', pct(paceF), 'paceP', pct(paceP));
console.log('YoY ftds', pct1(yoy.ftdsD), 'cpa', pct1(yoy.cpaD), 'ltv', pct1(yoy.ltvD));
console.log('weeks complete', weeks.length, 'standout', standout && standout.ch);

// ====================================================================
// HTML rendering helpers
// ====================================================================
function kpi(lbl,val,rng){ return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="rng">${rng||''}</div></div>`; }
function chartbox(id,h){ return `<div class="chartbox"${h?` style="height:${h}px"`:''}><canvas id="${id}"></canvas></div>`; }
function tbl(headers, rows, opts={}){
  const th = headers.map(h=>`<th class="${h.r?'r':''}">${h.t}</th>`).join('');
  const body = rows.map(rw=>`<tr class="${rw.cls||''}">`+rw.cells.map((c,i)=>`<td class="${headers[i].r?'r':''} ${c.cls||''}">${c.v!==undefined?c.v:c}</td>`).join('')+`</tr>`).join('');
  return `<div class="tablewrap"><table>${opts.minw?`<colgroup></colgroup>`:''}<thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function chRow(r,extra){ return r; }

// ---------- WEATHER (reconstructed approx mean temp from Met Office reporting) ----------
// May1..Jun29 daily approx mean temp (°C). Heatwave peaked 24-27 Jun (Red Extreme Heat ~38C SE
// England), eased from 28 Jun; 29 Jun ~23C as the hot spell broke ("changeable" per Met Office).
const WX_TEMPS = D.wxTemps||{}; // {date: approx mean temp °C} — reconstructed/Open-Meteo; daily run appends new day
const wxDays = dailyG.filter(d=>d.date>='2026-05-01' && d.date<=ASOF && WX_TEMPS[d.date]!=null).map(d=>({date:d.date, t:WX_TEMPS[d.date], f:d.f, ppf:div(d.p,d.f), dow:(new Date(d.date+'T00:00:00Z').getUTCDay()+6)%7}));
// day-of-week FTD norm across window
const dowSum={}, dowN={}; wxDays.forEach(d=>{ dowSum[d.dow]=(dowSum[d.dow]||0)+d.f; dowN[d.dow]=(dowN[d.dow]||0)+1; });
wxDays.forEach(d=>{ d.norm=dowSum[d.dow]/dowN[d.dow]; d.idx=d.f/d.norm*100; });
function pearson(xs,ys){ const n=xs.length, mx=xs.reduce((a,b)=>a+b,0)/n, my=ys.reduce((a,b)=>a+b,0)/n; let num=0,dx=0,dy=0; for(let i=0;i<n;i++){const a=xs[i]-mx,b=ys[i]-my;num+=a*b;dx+=a*a;dy+=b*b;} return num/Math.sqrt(dx*dy); }
const wxCorrIdx = pearson(wxDays.map(d=>d.t), wxDays.map(d=>d.idx));
const wxCorrPpf = pearson(wxDays.map(d=>d.t), wxDays.map(d=>d.ppf));
function windowDev(from,to){ const w=wxDays.filter(d=>d.date>=from&&d.date<=to); return w.reduce((a,d)=>a+(d.idx-100),0)/w.length/100; }
const wxHeatwave = windowDev('2026-06-19', ASOF);        // full episode incl easing tail
const wxPeak = windowDev('2026-06-24','2026-06-27');      // peak-heat days 28-29C
const wxWeekend = windowDev('2026-06-27','2026-06-28');   // Sat+Sun at the peak
const wxLastT = WX_TEMPS[WX_TEMPS.length-1];
console.log('WX corr idx', wxCorrIdx.toFixed(2), 'ppf', wxCorrPpf.toFixed(2), 'heatwave', pct1(wxHeatwave), 'peak', pct1(wxPeak), 'wknd', pct1(wxWeekend));

// ---------- this-week heatwave forecast ----------
const WX_FC = D.wxForecast || {};
let wxFc=null;
if(Object.keys(WX_FC).length && wxDays.length>=10){
  const xs=wxDays.map(d=>d.t), ys=wxDays.map(d=>d.idx), n=xs.length;
  const mx=xs.reduce((p,c)=>p+c,0)/n, my=ys.reduce((p,c)=>p+c,0)/n;
  let sxy=0,sxx=0; for(let i=0;i<n;i++){ sxy+=(xs[i]-mx)*(ys[i]-my); sxx+=(xs[i]-mx)*(xs[i]-mx); }
  const b=sxy/sxx, a=my-b*mx;   // idx = a + b*t
  const DN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const fdays=Object.keys(WX_FC).sort().map(dt=>{
    const dow=(new Date(dt+'T00:00:00Z').getUTCDay()+6)%7, norm=dowSum[dow]/dowN[dow], t=WX_FC[dt];
    const idx=a+b*t, dev=idx/100-1; return {date:dt,dow:DN[dow],t,norm,idx,dev,exp:norm*idx/100};
  });
  const totNorm=fdays.reduce((p,c)=>p+c.norm,0), totExp=fdays.reduce((p,c)=>p+c.exp,0);
  wxFc={ slope:b, days:fdays, totNorm, totExp, pct:totExp/totNorm-1, short:totNorm-totExp, peakT:Math.max(...fdays.map(d=>d.t)),
    emb:{ labels:fdays.map(d=>d.dow), norm:fdays.map(d=>r0(d.norm)), exp:fdays.map(d=>r0(d.exp)), temps:fdays.map(d=>d.t) } };
  console.log('WX forecast slope', b.toFixed(2), 'wk pct', pct1(wxFc.pct), 'short', r0(wxFc.short));
}

// ---------- WORLD CUP (fixtures vs FTD volume) ----------
// 2026 WC group stage 11-27 Jun (USA/CAN/MEX); England Group L: 17 Jun v Croatia W4-2,
// 23 Jun v Ghana D0-0, 27 Jun v Panama W2-0 (all UK prime-time evening kick-offs).
const WC_FIX = { // matches per calendar day (group stage from kickoffadventures schedule; 28 Jun = R32 begins)
  '2026-06-11':2,'2026-06-12':2,'2026-06-13':4,'2026-06-14':4,'2026-06-15':4,'2026-06-16':3,
  '2026-06-17':5,'2026-06-18':4,'2026-06-19':4,'2026-06-20':3,'2026-06-21':5,'2026-06-22':4,
  '2026-06-23':4,'2026-06-24':6,'2026-06-25':6,'2026-06-26':6,'2026-06-27':6,
  '2026-06-28':1,'2026-06-29':3,'2026-06-30':3,'2026-07-01':3,'2026-07-02':3,'2026-07-03':3,
  '2026-07-04':2,'2026-07-05':2,'2026-07-06':2,'2026-07-07':2 }; // 28 Jun–3 Jul = Round of 32; 4–7 Jul = Round of 16
const WC_ENG = {'2026-06-17':'v Croatia (W 4-2)','2026-06-23':'v Ghana (D 0-0)','2026-06-27':'v Panama (W 2-0)','2026-07-01':'v DR Congo (W 2-1, Kane ×2 — R32)','2026-07-05':'v Mexico (W 3-1, Kane — R16)'};
// 2026 World Cup Round of 32 — fixtures & results (US match dates; results confirmed through 1 Jul, later ties scheduled)
const WC_R32 = [
  {d:'2026-06-28', m:'South Africa v Canada', r:'0–1'},
  {d:'2026-06-29', m:'Brazil v Japan', r:'2–1'},
  {d:'2026-06-29', m:'Germany v Paraguay', r:'1–1 (3–4 pens)'},
  {d:'2026-06-29', m:'Netherlands v Morocco', r:'1–1 (2–3 pens)'},
  {d:'2026-06-30', m:'Ivory Coast v Norway', r:'1–2'},
  {d:'2026-06-30', m:'France v Sweden', r:'3–0'},
  {d:'2026-06-30', m:'Mexico v Ecuador', r:'2–0'},
  {d:'2026-07-01', m:'England v DR Congo', r:'2–1'},
  {d:'2026-07-01', m:'Belgium v Senegal', r:'3–2 (AET)'},
  {d:'2026-07-01', m:'United States v Bosnia & Herz.', r:'2–0'},
  {d:'2026-07-02', m:'Spain v Austria', r:'2–0'},
  {d:'2026-07-02', m:'Portugal v Croatia', r:'2–1'},
  {d:'2026-07-02', m:'Switzerland v Algeria', r:'1–0'},
  {d:'2026-07-03', m:'Australia v Egypt', r:'1–2'},
  {d:'2026-07-03', m:'Argentina v Cape Verde', r:'3–0'},
  {d:'2026-07-03', m:'Colombia v Ghana', r:'1–0'},
];
// 2026 World Cup Round of 16 — 4–7 Jul (US match dates); results in through ASOF, later ties scheduled
const WC_R16 = [
  {d:'2026-07-04', m:'Brazil v Paraguay', r:'2–1'},
  {d:'2026-07-04', m:'France v Norway', r:'3–1'},
  {d:'2026-07-05', m:'England v Mexico', r:'3–1'},
  {d:'2026-07-05', m:'Belgium v United States', r:'2–2 (4–3 pens)'},
  {d:'2026-07-06', m:'Spain v Morocco', r:''},
  {d:'2026-07-06', m:'Argentina v Colombia', r:''},
  {d:'2026-07-07', m:'Portugal v Switzerland', r:''},
  {d:'2026-07-07', m:'Egypt v Canada', r:''},
];
const WC_START='2026-06-11';
// baseline: pre-tournament & pre-heat (May 12 - Jun 10) day-of-week FTD norms
const wcBaseSum={}, wcBaseN={};
dailyG.filter(d=>d.date>='2026-05-12'&&d.date<='2026-06-10').forEach(d=>{const k=(new Date(d.date+'T00:00:00Z').getUTCDay()+6)%7; wcBaseSum[k]=(wcBaseSum[k]||0)+d.f; wcBaseN[k]=(wcBaseN[k]||0)+1;});
const wcNorm=k=>wcBaseSum[k]/wcBaseN[k];
const DOWL=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const wcRows = dailyG.filter(d=>d.date>=WC_START&&d.date<=ASOF).map(d=>{ const k=(new Date(d.date+'T00:00:00Z').getUTCDay()+6)%7; const n=wcNorm(k); return {date:d.date, dd:parseInt(d.date.slice(8),10), dow:DOWL[k], fix:WC_FIX[d.date]||0, eng:WC_ENG[d.date]||'', heat:d.date>='2026-06-19', f:d.f, idx:d.f/n*100, norm:Math.round(n)}; });
const wcMean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const wcAll = wcMean(wcRows.map(r=>r.idx));
const wcPreHeat = wcMean(wcRows.filter(r=>!r.heat).map(r=>r.idx));
const wcHeatSeg = wcMean(wcRows.filter(r=>r.heat).map(r=>r.idx));
const wcEng = wcMean(wcRows.filter(r=>r.eng).map(r=>r.idx));
const wcCorrFix = pearson(wcRows.map(r=>r.fix), wcRows.map(r=>r.idx));
const wcPreWCavg = wcMean(dailyG.filter(d=>d.date>='2026-05-12'&&d.date<='2026-06-10').map(d=>d.f/wcNorm((new Date(d.date+'T00:00:00Z').getUTCDay()+6)%7)*100));
console.log('WC allIdx',wcAll.toFixed(1),'preHeat',wcPreHeat.toFixed(1),'heat',wcHeatSeg.toFixed(1),'eng',wcEng.toFixed(1),'corrFix',wcCorrFix.toFixed(2));
// ---- WC VALUE CHECK: PLTV/FTD (value per depositor) vs fixtures ----
const wcPpfBase={}, wcPpfBaseN={};
dailyG.filter(d=>d.date>='2026-05-12'&&d.date<='2026-06-10').forEach(d=>{const k=(new Date(d.date+'T00:00:00Z').getUTCDay()+6)%7; wcPpfBase[k]=(wcPpfBase[k]||0)+d.p/d.f; wcPpfBaseN[k]=(wcPpfBaseN[k]||0)+1;});
const wcPpfNorm=k=>wcPpfBase[k]/wcPpfBaseN[k];
const dgMap={}; dailyG.forEach(d=>dgMap[d.date]=d);
wcRows.forEach(r=>{const k=(new Date(r.date+'T00:00:00Z').getUTCDay()+6)%7; const d=dgMap[r.date]; r.ppf=d.p/d.f; r.ppfIdx=r.ppf/wcPpfNorm(k)*100;});
const wcBasePpf=wcMean(dailyG.filter(d=>d.date>='2026-05-12'&&d.date<='2026-06-10').map(d=>d.p/d.f));
const wcWinPpf=wcMean(wcRows.map(r=>r.ppf));
const wcCorrPpf=pearson(wcRows.map(r=>r.fix), wcRows.map(r=>r.ppfIdx));
const wcPeakPpf=wcMean(wcRows.filter(r=>r.date>='2026-06-24'&&r.date<='2026-06-27').map(r=>r.ppf));
const wcEarlyPpf=wcMean(wcRows.filter(r=>r.date>='2026-06-11'&&r.date<='2026-06-18').map(r=>r.ppf));
console.log('WC value: basePpf',r0(wcBasePpf),'winPpf',r0(wcWinPpf),'corrFixPpf',wcCorrPpf.toFixed(2),'peak',r0(wcPeakPpf),'early',r0(wcEarlyPpf));

// ---------- SITE TRAFFIC / SESSIONS ----------
const TRAF_KPI = (D.traffic&&D.traffic.kpi)||{sess:0,snew:0,sret:0,reg:0,legreg:0,ftd:0};
const TRAF_WK = ((D.traffic&&D.traffic.wk)||[]).map(r=>({w:r[0],sn:r[1],sr:r[2],sess:r[1]+r[2],reg:r[3],ftd:r[4]}));
const TRAF_CH = ((D.traffic&&D.traffic.chan)||[]).map(r=>({ch:r[0],sess:r[1],snew:r[2],reg:r[3],ftd:r[4],newPct:r[2]/r[1],n2f:div(r[4],r[2])}));

// ---- EMBED for client charts ----
const FTDQ = (D.ftdq||[]).map(r=>({
  w:r.wk.slice(5), ftd:r.ftd, apd2:r.apd2, not2:r.ftd-r.apd2, imm:r.imm, conv:r.conv,
  immR:+(div(r.imm,r.ftd)*100).toFixed(1), apd2R:+(div(r.apd2,r.ftd)*100).toFixed(1),
  savR:+(div(r.savvy,r.ftd)*100).toFixed(1), avgapd:+(div(r.apdwk,r.ftd)).toFixed(2),
  ppf:r0(div(r.pltvNet,r.ftd)), cpf:r0(div(r.spend,r.ftd)), cpa2:r0(div(r.spend,r.apd2)) }));
const FTDQCH = (()=>{
  const rows=D.ftdqCh||[]; if(!rows.length) return null;
  const weeks=[...new Set(rows.map(r=>r.wk))].sort(), wi={}; weeks.forEach((w,i)=>wi[w]=i);
  const chs=[...new Set(rows.map(r=>r.ch))], byCh={};
  chs.forEach(c=>byCh[c]={ftd:weeks.map(()=>0),imm:weeks.map(()=>0),apd2:weeks.map(()=>0),savvy:weeks.map(()=>0),apdwk:weeks.map(()=>0),pltv:weeks.map(()=>0),spend:weeks.map(()=>0)});
  rows.forEach(r=>{const o=byCh[r.ch],k=wi[r.wk];o.ftd[k]+=r.ftd;o.imm[k]+=r.imm;o.apd2[k]+=r.apd2;o.savvy[k]+=r.savvy;o.apdwk[k]+=r.apdwk;o.pltv[k]+=r.pltvNet;o.spend[k]+=r.spend;});
  const tot={}; chs.forEach(c=>tot[c]=byCh[c].ftd.reduce((a,b)=>a+b,0));
  const order=chs.slice().sort((a,b)=>tot[b]-tot[a]);
  const series={}; order.forEach(c=>{const o=byCh[c]; series[c]={ftd:o.ftd, apd2R:o.apd2.map((v,i)=>+(div(v,o.ftd[i])*100).toFixed(1)), ppf:o.ftd.map((f,i)=>r0(div(o.pltv[i],f))), immR:o.imm.map((v,i)=>+(div(v,o.ftd[i])*100).toFixed(1))};});
  const last4=weeks.slice(-4);
  const t4=order.map(c=>{const o=byCh[c];let ftd=0,imm=0,apd2=0,savvy=0,apdwk=0,pltv=0,spend=0;last4.forEach(w=>{const k=wi[w];ftd+=o.ftd[k];imm+=o.imm[k];apd2+=o.apd2[k];savvy+=o.savvy[k];apdwk+=o.apdwk[k];pltv+=o.pltv[k];spend+=o.spend[k];});return {ch:c,ftd,immR:div(imm,ftd)*100,apd2R:div(apd2,ftd)*100,savR:div(savvy,ftd)*100,ppf:r0(div(pltv,ftd)),cpf:spend>0?r0(div(spend,ftd)):0,cpa2:spend>0?r0(div(spend,apd2)):0,avgapd:+(div(apdwk,ftd)).toFixed(2)};}).filter(r=>r.ftd>0);
  return {weeks:weeks.map(w=>w.slice(5)), order, series, t4, last4:[last4[0].slice(5),last4[last4.length-1].slice(5)]};
})();
// ---- INCREMENTAL / MARGINAL CPA (spend-response elasticity) ----
const INCR = (()=>{
  const rows = D.wkCh||[]; if(!rows.length) return null;
  const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
  const by={}; rows.forEach(r=>{ if(!PAID.has(r.channel)||r.channel==='ATL')return; (by[r.channel]=by[r.channel]||[]).push(r); });
  const out=[];
  Object.entries(by).forEach(([ch,rs])=>{
    rs.sort((a,b)=>a.wk<b.wk?-1:1);
    const pts=rs.filter(r=>r.s>0&&r.f>0); if(pts.length<4) return;
    const xs=pts.map(p=>Math.log(p.s)), ys=pts.map(p=>Math.log(p.f)), n=xs.length;
    const mx=xs.reduce((a,b)=>a+b,0)/n, my=ys.reduce((a,b)=>a+b,0)/n;
    let sxy=0,sxx=0,syy=0; for(let i=0;i<n;i++){ sxy+=(xs[i]-mx)*(ys[i]-my); sxx+=(xs[i]-mx)**2; syy+=(ys[i]-my)**2; }
    const braw = sxx? sxy/sxx : 0, r2 = (sxx&&syy)? (sxy*sxy)/(sxx*syy) : 0, b = clamp(braw,0.1,1.0);
    const l4=rs.slice(-4), s=l4.reduce((a,r)=>a+r.s,0)/l4.length, f=l4.reduce((a,r)=>a+r.f,0)/l4.length, p=l4.reduce((a,r)=>a+r.p,0)/l4.length;
    const avgCPA=div(s,f), avgLTV=div(p,s);
    out.push({ ch, s:r0(s), avgCPA:r0(avgCPA), avgLTV:+avgLTV.toFixed(2), b:+b.toFixed(2), braw:+braw.toFixed(2), r2:+r2.toFixed(2), margCPA:r0(div(avgCPA,b)), margLTV:+(b*avgLTV).toFixed(2) });
  });
  out.sort((a,b)=>b.margLTV-a.margLTV);
  return out.length? out : null;
})();
// ---- ATL: brand spend vs TOTAL FTDs (fixed-overhead framing) ----
const ATLX = (()=>{
  const rows=D.wkCh||[]; if(!rows.length) return null;
  const wk={}; rows.forEach(r=>{ const o=wk[r.wk]=wk[r.wk]||{atl:0,f:0,s:0}; if(r.channel==='ATL')o.atl+=r.s; o.f+=r.f; o.s+=r.s; });
  const weeks=Object.keys(wk).sort(); if(weeks.length<4) return null;
  const arr=weeks.map(w=>({wk:w.slice(5), atl:wk[w].atl, f:wk[w].f, s:wk[w].s}));
  const l4=arr.slice(-4);
  const atlAvg=l4.reduce((a,r)=>a+r.atl,0)/l4.length, fAvg=l4.reduce((a,r)=>a+r.f,0)/l4.length, sAvg=l4.reduce((a,r)=>a+r.s,0)/l4.length;
  const mean=arr.reduce((a,r)=>a+r.atl,0)/arr.length, sd=Math.sqrt(arr.reduce((a,r)=>a+(r.atl-mean)**2,0)/arr.length);
  const a0=arr[0].atl, f0=arr[0].f;
  return { atlAvg:r0(atlAvg), fAvg:r0(fAvg), sAvg:r0(sAvg), cov:+(sd/mean).toFixed(2),
    atlShare:+(atlAvg/sAvg).toFixed(3), costPerFtd:r0(div(atlAvg,fAvg)), blendedCPA:r0(div(sAvg,fAvg)), exAtlCPA:r0(div(sAvg-atlAvg,fAvg)),
    labels:arr.map(r=>r.wk), atlIdx:arr.map(r=>r0(100*r.atl/a0)), fIdx:arr.map(r=>r0(100*r.f/f0)) };
})();
const EMBED = {
  atl: ATLX,
  ftdq: FTDQ,
  ftdqCh: FTDQCH,
  cohMat: D.cohortMat || null,
  incr: INCR,
  daily30: dailyG.slice(-30).map(d=>({d:d.date.slice(5), s:d.sg, f:d.f, p:d.p})),
  mtdDaily: dailyG.filter(d=>d.date>=RMSTART&&d.date<=RMEND).map(d=>({d:d.date.slice(8), s:d.sg, f:d.f, p:d.p, ppf:div(d.p,d.f), cpa:div(d.sg,d.f)})),
  mtdCpaAvg: mtd.cpa,
  mtdBlendPPF: mtd.ppf,
  weeks: last26.map(w=>({w:w.wk.slice(5), s:w.s, f:w.f, p:w.p, cpa:w.cpa, ltv:w.ltv, ppf:w.ppf})),
  apdWk: last26.slice(-12).map(w=>({w:w.wk.slice(5), cost:r0(div(w.s,w.apd)), cpa:r0(w.cpa)})),
  apdRatioWk: last26.map(w=>({w:w.wk.slice(5), r:+(div(w.apd,w.f)*100).toFixed(1)})),
  traffic: { wk:TRAF_WK, chan:TRAF_CH },
  apdScatter: (()=>{ const ch={}; D.monch.forEach(r=>{const o=ch[r.channel]||(ch[r.channel]={f:0,p:0,apd:0});o.f+=r.f;o.p+=r.pn;o.apd+=r.apd;}); return Object.entries(ch).filter(([k,v])=>v.f>=500&&v.apd>=50).map(([k,v])=>({ch:k, x:+(div(v.apd,v.f)*100).toFixed(1), y:r0(div(v.p,v.f)), f:v.f, r:Math.max(4,Math.round(Math.sqrt(v.f)/14))})); })(),
  months: MONTHS.slice(0,RM),
  monthlyFtd26: Array.from({length:RM},(_,i)=>moTot[i+1].f),
  monthlyFtd25: D.y2025mon.slice(0,RM).map(r=>r.f),
  monthlyFtdPlan: planMonthlyF.slice(0,RM),
  weeklyFtdPlan: last26.map(w=>{ const mo=parseInt(w.wk.slice(5,7),10); const dim=new Date(Date.UTC(2026,mo,0)).getUTCDate(); return planMonthlyF[mo-1]*7/dim; }),
  mix: mixRows.filter(r=>r.f>0).map(r=>({ch:r.ch, s:r.s, f:r.f})),
  platMonthly, atlMonthly,
  trendCh,
  td: tdChannels.map(ch=>({ch, lc:(tdLC[ch]||{f:0}).f, td:(tdTD[ch]||{f:0}).f})).filter(x=>x.lc+x.td>50),
  momMovers: momMovers.filter(m=>Math.abs(m.dP)>5000),
  moBlendPPF: moBlend.map(b=>b.ppf),
  wx: {
    lbl: wxDays.map(d=>{const dd=new Date(d.date+'T00:00:00Z');return dd.getUTCDate()+' '+MONTHS[dd.getUTCMonth()];}),
    t: wxDays.map(d=>d.t), f: wxDays.map(d=>d.f), ppf: wxDays.map(d=>r0(d.ppf)),
    scatter: wxDays.map(d=>({x:d.t, y:+d.idx.toFixed(1), hw: d.date>='2026-06-19'}))
  },
  wxFc: wxFc?wxFc.emb:null,
  affMom: affMomMovers.map(m=>({n:m.name, dP:r0(m.dP)})),
  cpaBridge: {c25:yoy.cpa25, se:cpaSpendEff, ve:cpaVolEff, c26:yoy.cpa26},
  seg: {paid25:seg.paid25cpa, paid26:seg.paid26cpa, blend25:yoy.cpa25, blend26:yoy.cpa26,
        pf25:seg.p25f, pf26:seg.p26.f, of25:seg.o25f, of26:seg.o26.f},
  wc: {
    lbl: wcRows.map(r=>`${r.dd} ${r.dow[0]}`),
    idx: wcRows.map(r=>+r.idx.toFixed(1)),
    fix: wcRows.map(r=>r.fix),
    eng: wcRows.map(r=>r.eng?+r.idx.toFixed(1):null),
    scatter: wcRows.map(r=>({x:r.fix, y:+r.idx.toFixed(1), eng:!!r.eng})),
    ppfScatter: wcRows.map(r=>({x:r.fix, y:+r.ppfIdx.toFixed(1), eng:!!r.eng}))
  }
};

// ====================================================================
// PANES
// ====================================================================
let panes = {};

// ---- SUMMARY ----
panes.summary = `
<div class="kpis">
${kpi('This-week FTDs (fcst)', num(wkFcst.f), `WTD ${num(wtd.f)} · trailing wk ${num(trailWk.f)}`)}
${kpi('This-week LTV:CAC (fcst)', f2(wkFcst.ltv), `CPA ${gbp(wkFcst.cpa)} · net`)}
${kpi('MTD FTDs', num(mtd.f), `full-month fcst ${num(moFcst.f)}`)}
${kpi('MTD LTV:CAC', f2(mtd.ltv), `net · CPA ${gbp(mtd.cpa)}`)}
</div>
<div class="kpis" style="margin-top:14px">
${kpi('June pace — PLTV', `<span class="pill ${ragPace(paceP)} big">${pct(paceP)}</span>`, `fcst ${gbpM(moFcst.p)} vs plan ${gbpM(planRef.p)}`)}
${kpi('June pace — FTDs', `<span class="pill ${ragPace(paceF)} big">${pct(paceF)}</span>`, `fcst ${num(moFcst.f)} vs plan ${num(planRef.f)}`)}
${kpi('YoY FTDs', (yoy.ftdsD>=0?'+':'')+pct(yoy.ftdsD), `CPA ${pct1(yoy.cpaD)} · LTV:CAC ${(yoy.ltvD>=0?'+':'')+pct(yoy.ltvD)}`)}
${kpi('Budget used (spend)', pct(div(ytd.s,planFY.s)), `${pct(YEAR_ELAPSED_DAYS/365)} of year elapsed`)}
</div>
<div class="rec"><h3>Recommended optimisations</h3><ol>
<li><b>Tighten the softest affiliates.</b> ${affAlerts.length? `${affAlerts.length} affiliate(s) above the £20k/4-week spend bar are below 0.8 net LTV:CAC — ${affAlerts.map(a=>affName(a.aid)+' ('+f2(a.ltv)+')').join(', ')}. Renegotiate CPA before scaling.` : 'No large affiliate is below 0.8 net LTV:CAC this 4-week window — hold current deals and watch the lagging tail.'}</li>
<li><b>Lean into brand search &amp; UAC.</b> ${adgBest.slice(0,3).map(a=>a.ag).join(', ')} are the best material ad groups (LTV:CAC ${f2(adgBest[0].ltv)}–${f2(adgBest[2].ltv)}). Shift incremental budget here.</li>
<li><b>Rework the worst app placements.</b> ${adgWorst.slice(0,2).map(a=>`${a.channel} ${a.ag} (${f2(a.ltv)})`).join(', ')} convert below break-even last-click — time-decay re-credits some app value, so verify before hard-cutting.</li>
<li><b>Mind the June mix.</b> Blended PLTV/FTD is ${gbp(mtd.ppf)} (vs ${gbp(moBlend[4].ppf)} in May) — diluted by FTD growth skewing to low-value ${standout.ch} (${pct1(standout.share)} share at ${gbp(standout.ppf)}/FTD), not within-channel decay.</li>
</ol></div>
<div class="health"><h3>Data health &amp; anomaly check <span>last complete week (22 Jun) vs prior (15 Jun) + lag watch</span></h3><ul>
<li><b>Reconciliation OK.</b> YTD spend ${gbpM(ytd.s)}, FTDs ${num(ytd.f)}, net PLTV ${gbpM(ytd.p)} — channel rows reconcile to blended totals (err ${(reconErr*100).toFixed(2)}%).</li>
<li><b>Affiliate spend lag.</b> ${GAPLBL} Affiliate spend posted £0 (Raventrack lags ~2–4 days); gap-filled at trailing CPA ${gbp(AFF_CPA)} → +${gbpK(AFF_GAP_28)} for the day. The prior day has since back-filled. FTDs land on time.</li>
<li><b>APD2+ ~2-day lag.</b> ${GAPLBL} APD2+ shows only ${(dailyG.find(d=>d.date===ASOF)||{}).apd||0} vs ~500/day — recent-day quality metrics understated and will back-fill.</li>
<li><b>Email channel near-zero.</b> Email FTDs collapsed to ~1/week (was ~100/week in Q1) — likely tracking/CRM tagging break, investigate.</li>
<li><b>Affiliate App collapsed.</b> ${LAST2.find(x=>x.ch==='Affiliate App').f22} FTDs last week (was ~120/week earlier in the year) and spend ~£0 — tagging/feed issue.</li>
${swings.filter(s=>!['Affiliate App','Email'].includes(s.ch)).map(s=>`<li><b>${s.ch}</b> FTDs ${s.d>=0?'+':''}${pct(s.d)} WoW (${s.f15}→${s.f22}).</li>`).join('')}
<li>FTDs&gt;0 with £0 spend (Direct, RAF, Unattributed, Organic, Referral) is expected — these are non-paid channels.</li>
</ul></div>`;

// ---- S1 THIS-WEEK ----
{
  // Per-channel this-week forecast — SAME method as the blended headline:
  // WTD (current ISO week, by channel; affiliate spend gap-filled) + (7−landed) × trailing-4-complete-week daily avg.
  const wtdCh=D.wtdCh||{}, t4Ch=D.trail4Ch||{};
  const twc = mixRows.map(r=>{
    const w=wtdCh[r.ch]||{s:0,f:0,p:0}, t=t4Ch[r.ch]||{s:0,f:0,p:0};
    const wS=(r.ch==='Affiliate'? w.s+AFF_GAP_28 : w.s);      // WTD spend (affiliate gap-filled for the lagging day)
    const s=wS+REMW*(t.s/28), f=w.f+REMW*(t.f/28), p=w.p+REMW*(t.p/28);
    return {ch:r.ch,s,f,p,ltv:div(p,s),cpa:div(s,f)};
  }).sort((a,b)=>b.s-a.s);
  const rows = twc.filter(r=>r.s>0||r.f>0).map(r=>({cells:[
    r.ch + (r.ch==='Affiliate'?' *':''), gbpK(r.s), num(r.f),
    r.f? gbp(r.cpa):'—', gbpK(r.p),
    r.f? `<span class="pill ${ragLtv(r.ltv)}">${f2(r.ltv)}</span>` : pill('grey','n/a')
  ]}));
  panes.s1 = `<h2 class="sec">This week — week-to-date + forecast</h2>
<div class="callout">Current ISO week (from Mon 29 Jun) has <b>${DAYS_LANDED_WK} fully-landed day${DAYS_LANDED_WK===1?'':'s'}</b> so far. Forecast = week-to-date (${num(wtd.f)} FTDs) + the trailing-4-complete-week daily average applied to each remaining day, <b>weighted by its day-of-week shape</b> (8-week profile) — so the busy Fri/Sat aren't under-counted the way a flat ×(7−landed) average would. Remaining days this week: ${REM_SHAPE} (1.00× = an average day). Trailing weekly average shown for context.</div>
<h3 class="subsec">Actual week-to-date — ${DAYS_LANDED_WK} landed day${DAYS_LANDED_WK===1?'':'s'} of 7</h3>
<div class="kpis" style="margin-top:8px">
${kpi('WTD spend', gbpK(wtd.s), `${DAYS_LANDED_WK} of 7 days · affiliate gap-filled`)}
${kpi('WTD FTDs', num(wtd.f), `actuals so far this week`)}
${kpi('WTD CPA', wtd.f?gbp(div(wtd.s,wtd.f)):'—', `net`)}
${kpi('WTD PLTV/FTD', wtd.f?gbp(div(wtd.p,wtd.f)):'—', `net · value per FTD`)}
${kpi('WTD LTV:CAC', wtd.s?f2(div(wtd.p,wtd.s)):'—', `net of affiliate revshare`)}
</div>
<h3 class="subsec">Actual week-to-date by channel</h3>
${(()=>{
  const rows = Object.entries(D.wtdCh||{}).map(([ch,w])=>{
    const s=(ch==='Affiliate'? w.s+AFF_GAP_28 : w.s);
    return {ch, s, f:w.f, p:w.p, ltv:div(w.p,s), cpa:div(s,w.f)};
  }).filter(r=>r.s>0||r.f>0).sort((a,b)=>b.f-a.f)
    .map(r=>({cells:[ r.ch + (r.ch==='Affiliate'?' *':''), gbpK(r.s), num(r.f), r.f?gbp(r.cpa):'—', gbpK(r.p), r.f?gbp(div(r.p,r.f)):'—', r.f?`<span class="pill ${ragLtv(r.ltv)}">${f2(r.ltv)}</span>`:pill('grey','n/a') ]}));
  return tbl([{t:'Channel'},{t:'WTD spend',r:1},{t:'WTD FTDs',r:1},{t:'CPA',r:1},{t:'WTD net PLTV',r:1},{t:'PLTV/FTD',r:1},{t:'LTV:CAC',r:1}], rows);
})()}
<p class="note">Actual landed FTDs, spend and net PLTV so far this ISO week (${DAYS_LANDED_WK} of 7 days), by last-click channel. * Affiliate spend gap-filled for the lagging feed day at the trailing CPA; PLTV net of the 15% revshare. CPA/LTV:CAC on partial-week actuals are noisy — read the full-week forecast below and the pace table for a fuller picture.</p>
<h3 class="subsec">Full-week forecast</h3>
<div class="kpis" style="margin-top:8px">
${kpi('Forecast spend', gbpM(wkFcst.s), `trailing wk ${gbpM(trailWk.s)}`)}
${kpi('Forecast FTDs', num(wkFcst.f), `trailing wk ${num(trailWk.f)}`)}
${kpi('Forecast CPA', gbp(wkFcst.cpa), `net`)}
${kpi('Forecast PLTV/FTD', gbp(div(wkFcst.p,wkFcst.f)), `net · value per FTD`)}
${kpi('Forecast LTV:CAC', f2(wkFcst.ltv), `net of affiliate revshare`)}
</div>
<h2 class="sec">This week vs target</h2>
${(()=>{
  const wtRow=(D.weekTargets||[]).find(w=>w.mon===curWeekStart);
  let wt, ltvT, srcNote, cpaT;
  if(wtRow){
    wt={s:wtRow.spend, f:wtRow.ftds, p:wtRow.pltv}; ltvT=wtRow.ltv; cpaT=wtRow.cpa;
    srcNote=`Weekly targets from the H2 weekly plan workbook (week ${wtRow.wk}, w/c ${curWeekStart.slice(8)} Jun, ${String(wtRow.type).toLowerCase()}${wtRow.pay==='P'?', payday week':''}). FTDs, spend &amp; CPA are taken directly from the sheet; net 12m PLTV is derived as weekly FTDs × the plan's net PLTV-per-FTD by channel.`;
  } else {
    wt={s:planRef.s*7/DIM, f:planRef.f*7/DIM, p:planRef.p*7/DIM}; ltvT=div(planRef.p,planRef.s); cpaT=div(wt.s,wt.f);
    srcNote=`No weekly-plan row for this week — falling back to the monthly plan ÷ (30÷7) run-rate.`;
  }
  const pcS=div(wkFcst.s,wt.s), pcF=div(wkFcst.f,wt.f), pcP=div(wkFcst.p,wt.p), pcL=div(wkFcst.ltv,ltvT);
  const ppfT=div(wt.p,wt.f), ppfFcst=div(wkFcst.p,wkFcst.f), pcPPF=div(ppfFcst,ppfT);
  const trows=[
    {cells:['Spend', gbpM(wt.s), gbpK(wtd.s), gbpM(wkFcst.s), `<span class="pill ${ragPace(pcS)}">${pct(pcS)}</span>`]},
    {cells:['FTDs', num(wt.f), num(wtd.f), num(wkFcst.f), `<span class="pill ${ragPace(pcF)}">${pct(pcF)}</span>`]},
    {cells:['Net 12m PLTV', gbpM(wt.p), gbpK(wtd.p), gbpM(wkFcst.p), `<span class="pill ${ragPace(pcP)}">${pct(pcP)}</span>`]},
    {cells:['PLTV/FTD', gbp(ppfT), gbp(div(wtd.p,wtd.f)), gbp(ppfFcst), `<span class="pill ${ragPace(pcPPF)}">${pct(pcPPF)}</span>`]},
    {cells:['CPA', gbp(cpaT), '—', gbp(wkFcst.cpa), `<span class="pill ${wkFcst.cpa<=cpaT?'green':wkFcst.cpa<=cpaT*1.1?'amber':'red'}">${pct(div(cpaT,wkFcst.cpa))}</span>`]},
    {cells:['LTV:CAC', f2(ltvT), '—', f2(wkFcst.ltv), `<span class="pill ${ragPace(pcL)}">${pct(pcL)}</span>`]}
  ];
  return `<div class="callout">${srcNote} Pace = forecast ÷ weekly target (green ≥100, amber ≥90, red &lt;90); for CPA the pill is target ÷ forecast (lower CPA is better). WTD covers ${DAYS_LANDED_WK} landed day${DAYS_LANDED_WK===1?'':'s'} of 7.</div>
<div class="kpis" style="margin-top:14px">
${kpi('FTDs vs target', `<span class="pill ${ragPace(pcF)} big">${pct(pcF)}</span>`, `fcst ${num(wkFcst.f)} vs ${num(wt.f)}`)}
${kpi('PLTV vs target', `<span class="pill ${ragPace(pcP)} big">${pct(pcP)}</span>`, `fcst ${gbpM(wkFcst.p)} vs ${gbpM(wt.p)}`)}
${kpi('Spend vs target', `<span class="pill ${ragPace(pcS)} big">${pct(pcS)}</span>`, `fcst ${gbpM(wkFcst.s)} vs ${gbpM(wt.s)}`)}
${kpi('CPA vs target', `${gbp(wkFcst.cpa)} / ${gbp(cpaT)}`, `target ${gbp(cpaT)}`)}
</div>
${tbl([{t:'Metric'},{t:'Wk target',r:1},{t:'WTD',r:1},{t:'Fcst',r:1},{t:'Pace',r:1}], trows)}
<p class="note">Forecast uses the trailing-4-week method (WTD + (7−landed)×trailing daily avg). The plan week is Mon–Sun, matching the dashboard's ISO weeks.</p>`;
})()}
<h2 class="sec">This-week by channel — forecast vs target</h2>
${(()=>{
  const wc=(D.weekTargetsCh||[]).find(w=>w.mon===curWeekStart);
  if(!wc) return '<p class="note">No by-channel weekly target row for this week in the plan workbook.</p>';
  const fmap={}; twc.forEach(r=>fmap[r.ch]=r);
  const chs=[...new Set([...Object.keys(wc.f||{}), ...Object.keys(wc.s||{}), ...twc.map(r=>r.ch)])];
  const rws=chs.map(ch=>{
    const tf=(wc.f&&wc.f[ch])||0, ts=(wc.s&&wc.s[ch])||0, tp=tf*(PLAN_RATIO[ch]||0), tl=div(tp,ts);
    const fo=fmap[ch]||{f:0,s:0,p:0,ltv:0};
    return {ch,tf,ts,tp,tl, ff:fo.f, fs:fo.s, fp:fo.p, fl:fo.ltv, pcF:div(fo.f,tf), pcP:div(fo.p,tp)};
  }).filter(r=>r.tf>0||r.ff>0||r.ts>0).sort((a,b)=>b.ts-a.ts);
  const T={tf:0,ts:0,tp:0,ff:0,fs:0,fp:0}; rws.forEach(r=>{T.tf+=r.tf;T.ts+=r.ts;T.tp+=r.tp;T.ff+=r.ff;T.fs+=r.fs;T.fp+=r.fp;});
  const cell=(r)=>({cells:[
    r.ch + (r.ch==='Affiliate'?' *':''),
    num(r.tf), num(r.ff), r.tf?`<span class="pill ${ragPace(r.pcF)}">${pct(r.pcF)}</span>`:'—',
    gbpK(r.ts), gbpK(r.fs),
    `${r.tf?gbp(div(r.ts,r.tf)):'—'}→${r.ff?gbp(div(r.fs,r.ff)):'—'}`,
    gbpK(r.tp), gbpK(r.fp), r.tp?`<span class="pill ${ragPace(r.pcP)}">${pct(r.pcP)}</span>`:'—',
    `${r.ts?f2(r.tl):'—'}→${r.fs?f2(r.fl):'—'}`
  ]});
  const trows=rws.map(cell);
  trows.push({cls:'tot',cells:['TOTAL', num(T.tf), num(T.ff), `<span class="pill ${ragPace(div(T.ff,T.tf))}">${pct(div(T.ff,T.tf))}</span>`, gbpK(T.ts), gbpK(T.fs), `${gbp(div(T.ts,T.tf))}→${gbp(div(T.fs,T.ff))}`, gbpK(T.tp), gbpK(T.fp), `<span class="pill ${ragPace(div(T.fp,T.tp))}">${pct(div(T.fp,T.tp))}</span>`, `${f2(div(T.tp,T.ts))}→${f2(div(T.fp,T.fs))}`]});
  return tbl([{t:'Channel'},{t:'Tgt FTDs',r:1},{t:'Fcst FTDs',r:1},{t:'FTDs %',r:1},{t:'Tgt spend',r:1},{t:'Fcst spend',r:1},{t:'CPA',r:1},{t:'Tgt PLTV',r:1},{t:'Fcst PLTV',r:1},{t:'PLTV %',r:1},{t:'LTV:CAC',r:1}], trows);
})()}
<p class="note">Targets = the H2 weekly-plan workbook by channel (FTDs &amp; spend direct from the sheet; PLTV = target FTDs × plan net PLTV-per-FTD). Forecast = trailing-4-week weekly average by channel. Pace = forecast ÷ target. * Affiliate forecast spend gap-filled for ${GAPLBL} at trailing CPA ${gbp(AFF_CPA)}; ATL carries spend with 0 FTDs (brand). PLTV net of the 15% affiliate revshare.</p>`;
}

// ---- S2 MONTH-TO-DATE ----
{
  const mtdRows = mixRows.map(r=>{ const s=(r.ch==='Affiliate'? r.s+AFF_GAP_28 : r.s); return {ch:r.ch,s,f:r.f,p:r.p,apd:r.apd,ltv:div(r.p,s),cpa:div(s,r.f)}; }).filter(r=>r.s>0||r.f>0).sort((a,b)=>b.s-a.s);
  const rows = mtdRows.map(r=>({cells:[ r.ch+(r.ch==='Affiliate'?' *':''), gbpK(r.s), num(r.f), r.f?gbp(r.cpa):'—', gbpK(r.p), r.f?gbp(div(r.p,r.f)):'—', r.f?`<span class="pill ${ragLtv(r.ltv)}">${f2(r.ltv)}</span>`:pill('grey','n/a') ]}));
  rows.push({cls:'tot',cells:['TOTAL', gbpM(mtd.s), num(mtd.f), gbp(mtd.cpa), gbpM(mtd.p), `<span class="pill ${ragLtv(mtd.ltv)}">${f2(mtd.ltv)}</span>`]});
  panes.s2 = `<h2 class="sec">Reference month — ${MO_CUR} 1–${MD}${RMcomplete?' (complete)':', gap-filled'} + forecast</h2>
<div class="kpis">
${kpi('MTD spend', gbpM(mtd.s), `fcst ${gbpM(moFcst.s)}`)}
${kpi('MTD FTDs', num(mtd.f), `fcst ${num(moFcst.f)}`)}
${kpi('MTD net PLTV', gbpM(mtd.p), `fcst ${gbpM(moFcst.p)}`)}
${kpi('MTD PLTV/FTD', gbp(mtd.ppf), `fcst ${gbp(div(moFcst.p,moFcst.f))} · net`)}
${kpi('MTD LTV:CAC', f2(mtd.ltv), `CPA ${gbp(mtd.cpa)}`)}
</div>
<h2 class="sec">Full-month: plan vs forecast</h2>
${(()=>{
  const planCpa=div(planRef.s,planRef.f), fcCpa=div(moFcst.s,moFcst.f), planLtv=div(planRef.p,planRef.s);
  const rows=[
    {cells:['Spend', gbpM(planRef.s), gbpM(mtd.s), gbpM(moFcst.s), `<span class="pill ${ragPace(paceS)}">${pct(paceS)}</span>`]},
    {cells:['FTDs', num(planRef.f), num(mtd.f), num(moFcst.f), `<span class="pill ${ragPace(paceF)}">${pct(paceF)}</span>`]},
    {cells:['Net 12m PLTV', gbpM(planRef.p), gbpM(mtd.p), gbpM(moFcst.p), `<span class="pill ${ragPace(paceP)}">${pct(paceP)}</span>`]},
    {cells:['CPA', gbp(planCpa), gbp(mtd.cpa), gbp(fcCpa), `<span class="pill ${ragPace(div(planCpa,fcCpa))}">${pct(div(planCpa,fcCpa))}</span>`]},
    {cells:['LTV:CAC', f2(planLtv), f2(mtd.ltv), f2(moFcst.ltv), `<span class="pill ${ragPace(div(moFcst.ltv,planLtv))}">${pct(div(moFcst.ltv,planLtv))}</span>`]},
  ];
  return tbl([{t:'Metric'},{t:`${MO_CUR} plan`,r:1},{t:`MTD (1–${MD})`,r:1},{t:'Full-month fcst',r:1},{t:'Fcst vs plan',r:1}], rows);
})()}
<p class="note">Full-month forecast = MTD actuals + remaining days × trailing daily average (affiliate gap-filled). Plan is the ${MO_CUR} monthly target (net of the 15% affiliate revshare). For CPA, the pill is plan÷forecast (higher = cheaper than plan = good); for spend/FTDs/PLTV/LTV:CAC it is forecast÷plan. Per-channel plan-vs-forecast is on the Targets tab.</p>
<div class="grid2" style="margin-top:14px">${chartbox('c_mtd_spend')}${chartbox('c_mtd_ftd')}</div>
<h2 class="sec">CPA — daily (MTD, net)</h2>
${chartbox('c_mtd_cpa')}
<p class="note">Net CPA per day across ${MO_CUR}; dashed line = blended CPA ${gbp(mtd.cpa)}.</p>
<h2 class="sec">PLTV per FTD — daily (MTD, net of affiliate revshare)</h2>
${chartbox('c_mtd_ppf')}
<p class="note">Recent-day cohorts are least matured and typically revise <b>up</b>. MTD blended PLTV/FTD ${gbp(mtd.ppf)}.</p>
<h2 class="sec">MTD by channel</h2>
${tbl([{t:'Channel'},{t:'Spend',r:1},{t:'FTDs',r:1},{t:'CPA',r:1},{t:'12m PLTV',r:1},{t:'PLTV/FTD',r:1},{t:'LTV:CAC',r:1}], rows)}
<p class="note">* ${RMcomplete?`${MO_CUR} is a complete month — forecast equals actuals`:`Affiliate spend gap-filled for ${GAPLBL}; forecast = MTD + remaining days × trailing daily average`}.</p>
<h2 class="sec">By channel — plan vs full-month forecast</h2>
${(()=>{
  const fcCh=ch=>{ const r=junCh[ch]; if(!r) return {s:0,f:0,p:0}; if(RMcomplete) return {s:r.s,f:r.f,p:r.pn}; const t=(D.trail4Ch&&D.trail4Ch[ch])||{s:0,f:0,p:0}, k=RMdim-DAYS_ELAPSED; return {s:(ch==='Affiliate'?r.s+AFF_GAP_28:r.s)+k*(t.s/28), f:r.f+k*(t.f/28), p:r.pn+k*(t.p/28)}; };
  const chans=Object.keys(PLAN).filter(c=>c!=='Display/Programmatic');
  const rws=chans.map(ch=>{ const pl=planCh(ch,RM-1), fc=fcCh(ch); return {ch,pl,fc,pcS:div(fc.s,pl.s),pcF:div(fc.f,pl.f),pcP:div(fc.p,pl.p)}; }).filter(r=>r.pl.s>0||r.pl.f>0||r.fc.f>0).sort((a,b)=>b.pl.p-a.pl.p);
  const tot=rws.reduce((a,r)=>({ps:a.ps+r.pl.s,pf:a.pf+r.pl.f,pp:a.pp+r.pl.p,fs:a.fs+r.fc.s,ff:a.ff+r.fc.f,fp:a.fp+r.fc.p}),{ps:0,pf:0,pp:0,fs:0,ff:0,fp:0});
  const body=rws.map(r=>({cells:[ r.ch, gbpK(r.pl.s), gbpK(r.fc.s), r.pl.s?`<span class="pill ${ragPace(r.pcS)}">${pct(r.pcS)}</span>`:'—', num(r.pl.f), num(r.fc.f), r.pl.f?`<span class="pill ${ragPace(r.pcF)}">${pct(r.pcF)}</span>`:'—', gbpK(r.pl.p), gbpK(r.fc.p), r.pl.p?`<span class="pill ${ragPace(r.pcP)}">${pct(r.pcP)}</span>`:'—' ]}));
  body.push({cls:'tot',cells:['TOTAL', gbpM(tot.ps), gbpM(tot.fs), `<span class="pill ${ragPace(div(tot.fs,tot.ps))}">${pct(div(tot.fs,tot.ps))}</span>`, num(tot.pf), num(tot.ff), `<span class="pill ${ragPace(div(tot.ff,tot.pf))}">${pct(div(tot.ff,tot.pf))}</span>`, gbpM(tot.pp), gbpM(tot.fp), `<span class="pill ${ragPace(div(tot.fp,tot.pp))}">${pct(div(tot.fp,tot.pp))}</span>`]});
  return tbl([{t:'Channel'},{t:'Plan spend',r:1},{t:'Fcst spend',r:1},{t:'%',r:1},{t:'Plan FTDs',r:1},{t:'Fcst FTDs',r:1},{t:'%',r:1},{t:'Plan PLTV',r:1},{t:'Fcst PLTV',r:1},{t:'%',r:1}], body);
})()}
<p class="note">${MO_CUR} channel plan vs full-month forecast (net of the 15% affiliate revshare), ranked by planned PLTV. Same forecast basis as above. Green ≥100% of plan · amber 90–99% · red &lt;90%.</p>`;
}

// ---- S2b TARGETS ----
{
  const chans = Object.keys(PLAN).filter(c=>c!=='Display/Programmatic');
  // Table A: June plan vs full-month forecast by channel
  // forecast by channel = MTD channel * 30/28 (affiliate gap-filled)
  function fcstCh(ch){ const r=junCh[ch]; if(!r) return {s:0,f:0,p:0}; if(RMcomplete) return {s:r.s,f:r.f,p:r.pn}; const t=(D.trail4Ch&&D.trail4Ch[ch])||{s:0,f:0,p:0}, k=RMdim-DAYS_ELAPSED; return {s:(ch==='Affiliate'?r.s+AFF_GAP_28:r.s)+k*(t.s/28), f:r.f+k*(t.f/28), p:r.pn+k*(t.p/28)}; }
  const aRows = chans.map(ch=>{ const pl=planCh(ch,RM-1); const fc=fcstCh(ch); return {ch,pl,fc, pcS:div(fc.s,pl.s),pcF:div(fc.f,pl.f),pcP:div(fc.p,pl.p), lpl:div(pl.p,pl.s), lfc:div(fc.p,fc.s)}; })
    .filter(r=>r.pl.s>0||r.pl.f>0||r.fc.f>0).sort((a,b)=>b.pl.p-a.pl.p);
  const tA = aRows.map(r=>({cells:[ r.ch, gbpK(r.pl.s), gbpK(r.fc.s), r.pl.s?`<span class="pill ${ragPace(r.pcS)}">${pct(r.pcS)}</span>`:'—', num(r.pl.f), num(r.fc.f), r.pl.f?`<span class="pill ${ragPace(r.pcF)}">${pct(r.pcF)}</span>`:'—', gbpK(r.pl.p), gbpK(r.fc.p), r.pl.p?`<span class="pill ${ragPace(r.pcP)}">${pct(r.pcP)}</span>`:'—', `${f2(r.lpl)}→${f2(r.lfc)}` ]}));
  tA.push({cls:'tot',cells:['TOTAL',gbpM(planRef.s),gbpM(moFcst.s),`<span class="pill ${ragPace(paceS)}">${pct(paceS)}</span>`,num(planRef.f),num(moFcst.f),`<span class="pill ${ragPace(paceF)}">${pct(paceF)}</span>`,gbpM(planRef.p),gbpM(moFcst.p),`<span class="pill ${ragPace(paceP)}">${pct(paceP)}</span>`,`${f2(div(planRef.p,planRef.s))}→${f2(moFcst.ltv)}`]});
  // Table B: YTD pacing by channel (actual YTD vs plan-to-date)
  function ytdCh(ch){ let s=0,f=0,p=0; for(let m=1;m<=NM;m++){ const r=monByMo[m][ch]; if(r){s+=r.s;f+=r.f;p+=r.pn;} } if(ch==='Affiliate') s+=AFF_GAP_28; return {s,f,p}; }
  function planTDch(ch){ let s=0,f=0,p=0; for(let m=0;m<5;m++){ const x=planCh(ch,m); s+=x.s;f+=x.f;p+=x.p; } const j=planCh(ch,5); s+=j.s*DAYS_ELAPSED/DIM; f+=j.f*DAYS_ELAPSED/DIM; p+=j.p*DAYS_ELAPSED/DIM; return {s,f,p}; }
  const bRows = chans.map(ch=>{ const a=ytdCh(ch); const pl=planTDch(ch); return {ch,a,pl,pcF:div(a.f,pl.f),pcP:div(a.p,pl.p)}; }).filter(r=>r.pl.f>0||r.a.f>0).sort((a,b)=>b.a.p-a.a.p);
  const tB = bRows.map(r=>({cells:[ r.ch, gbpK(r.pl.s), gbpK(r.a.s), num(r.pl.f), num(r.a.f), r.pl.f?`<span class="pill ${ragPace(r.pcF)}">${pct(r.pcF)}</span>`:'—', gbpK(r.pl.p), gbpK(r.a.p), r.pl.p?`<span class="pill ${ragPace(r.pcP)}">${pct(r.pcP)}</span>`:'—' ]}));
  tB.push({cls:'tot',cells:['TOTAL',gbpM(planYTD.s),gbpM(ytd.s),num(planYTD.f),num(ytd.f),`<span class="pill ${ragPace(div(ytd.f,planYTD.f))}">${pct(div(ytd.f,planYTD.f))}</span>`,gbpM(planYTD.p),gbpM(ytd.p),`<span class="pill ${ragPace(div(ytd.p,planYTD.p))}">${pct(div(ytd.p,planYTD.p))}</span>`]});
  // Table C full-year plan by channel
  const cRows = chans.map(ch=>{ let s=0,f=0,p=0; for(let m=0;m<12;m++){const x=planCh(ch,m);s+=x.s;f+=x.f;p+=x.p;} return {ch,s,f,p,ltv:div(p,s)}; }).filter(r=>r.f>0||r.s>0).sort((a,b)=>b.p-a.p);
  const tC = cRows.map(r=>({cells:[ r.ch, gbpM(r.s), num(r.f), gbpM(r.p), r.s?f2(r.ltv):'—' ]}));
  tC.push({cls:'tot',cells:['TOTAL',gbpM(planFY.s),num(planFY.f),gbpM(planFY.p),f2(div(planFY.p,planFY.s))]});
  panes.s2b = `<h2 class="sec">Targets — plan vs actual</h2>
<div class="callout"><b>Affiliate PLTV — plan and actual — is net of the 15% revshare haircut, so pacing is like-for-like.</b> Pace % = forecast ÷ plan (green ≥100, amber ≥90, red &lt;90).</div>
<div class="kpis" style="margin-top:14px">
${kpi('June PLTV pace', `<span class="pill ${ragPace(paceP)} big">${pct(paceP)}</span>`, `${gbpM(moFcst.p)} / ${gbpM(planRef.p)}`)}
${kpi('June FTDs pace', `<span class="pill ${ragPace(paceF)} big">${pct(paceF)}</span>`, `${num(moFcst.f)} / ${num(planRef.f)}`)}
${kpi('YTD PLTV pace', `<span class="pill ${ragPace(div(ytd.p,planYTD.p))} big">${pct(div(ytd.p,planYTD.p))}</span>`, `${gbpM(ytd.p)} / ${gbpM(planYTD.p)}`)}
${kpi('YTD FTDs pace', `<span class="pill ${ragPace(div(ytd.f,planYTD.f))} big">${pct(div(ytd.f,planYTD.f))}</span>`, `${num(ytd.f)} / ${num(planYTD.f)}`)}
</div>
<h2 class="sec">Table A — June: plan vs full-month forecast by channel</h2>
${tbl([{t:'Channel'},{t:'Plan spend',r:1},{t:'Fcst spend',r:1},{t:'Spend %',r:1},{t:'Plan FTDs',r:1},{t:'Fcst FTDs',r:1},{t:'FTDs %',r:1},{t:'Plan PLTV',r:1},{t:'Fcst PLTV',r:1},{t:'PLTV %',r:1},{t:'LTV:CAC',r:1}], tA)}
<h2 class="sec">Table B — YTD pacing by channel (vs plan-to-date, ${MONTHS[CUR_MO-1]} pro-rated ${DAYS_ELAPSED}/${DIM})</h2>
${tbl([{t:'Channel'},{t:'Plan spend',r:1},{t:'Act spend',r:1},{t:'Plan FTDs',r:1},{t:'Act FTDs',r:1},{t:'FTDs %',r:1},{t:'Plan PLTV',r:1},{t:'Act PLTV',r:1},{t:'PLTV %',r:1}], tB)}
<h2 class="sec">Table C — full-year plan by channel</h2>
${tbl([{t:'Channel'},{t:'Plan spend',r:1},{t:'Plan FTDs',r:1},{t:'Plan PLTV',r:1},{t:'LTV:CAC',r:1}], tC)}`;
}

// ---- S2j JULY MTD vs PLAN ----
if(CUR_MO>RM){
  const MI=CUR_MO-1;                        // plan index for the current month (0-based)
  const kRem=DIM-DAYS_ELAPSED;              // remaining days in the current month
  const cur=monByMo[CUR_MO]||{};
  const chansJ=Object.keys(PLAN).filter(c=>c!=='Display/Programmatic');
  const jmtd=ch=>{ const r=cur[ch]; const s=(r?r.s:0)+(ch==='Affiliate'?AFF_GAP_28:0); return {s,f:r?r.f:0,p:r?r.pn:0}; };
  const jptd=ch=>{ const x=planCh(ch,MI); return {s:x.s*DAYS_ELAPSED/DIM,f:x.f*DAYS_ELAPSED/DIM,p:x.p*DAYS_ELAPSED/DIM}; };
  const jfc =ch=>{ const m=jmtd(ch); const t=(D.trail4Ch&&D.trail4Ch[ch])||{s:0,f:0,p:0}; return {s:m.s+kRem*(t.s/28),f:m.f+kRem*(t.f/28),p:m.p+kRem*(t.p/28)}; };
  const jpl =ch=>planCh(ch,MI);
  const sumT=fn=>chansJ.reduce((a,ch)=>{const x=fn(ch);return {s:a.s+x.s,f:a.f+x.f,p:a.p+x.p};},{s:0,f:0,p:0});
  const ptdT=sumT(jptd), planT=sumT(jpl), fcT=sumT(jfc);
  // all-channel MTD headline (incl organic not in plan)
  let jmAll={s:0,f:0,p:0,apd:0}; Object.values(cur).forEach(r=>{jmAll.s+=r.s;jmAll.f+=r.f;jmAll.p+=r.pn;jmAll.apd+=r.apd;}); jmAll.s+=AFF_GAP_28;
  jmAll.cpa=div(jmAll.s,jmAll.f); jmAll.ltv=div(jmAll.p,jmAll.s); jmAll.ppf=div(jmAll.p,jmAll.f);
  const jfcAll={s:jmAll.s+kRem*dailyAvg.s, f:jmAll.f+kRem*dailyAvg.f, p:jmAll.p+kRem*dailyAvg.p};
  jfcAll.cpa=div(jfcAll.s,jfcAll.f); jfcAll.ltv=div(jfcAll.p,jfcAll.s); jfcAll.ppf=div(jfcAll.p,jfcAll.f);
  const paceMtdF=div(jmAll.f,ptdT.f), paceMtdP=div(jmAll.p,ptdT.p), paceMtdS=div(jmAll.s,ptdT.s);
  const paceFcF=div(jfcAll.f,planT.f), paceFcP=div(jfcAll.p,planT.p), paceFcS=div(jfcAll.s,planT.s);
  const MOJ=MONTHS[CUR_MO-1];
  // Table A — MTD vs plan-to-date by channel
  const aR=chansJ.map(ch=>{const m=jmtd(ch),pd=jptd(ch);return {ch,m,pd,pcF:div(m.f,pd.f),pcP:div(m.p,pd.p)};}).filter(r=>r.pd.f>0||r.m.f>0).sort((a,b)=>b.m.p-a.m.p);
  const tA=aR.map(r=>({cells:[ r.ch, gbpK(r.pd.s), gbpK(r.m.s), num(r.pd.f), num(r.m.f), r.pd.f?`<span class="pill ${ragPace(r.pcF)}">${pct(r.pcF)}</span>`:'—', gbpK(r.pd.p), gbpK(r.m.p), r.pd.p?`<span class="pill ${ragPace(r.pcP)}">${pct(r.pcP)}</span>`:'—' ]}));
  tA.push({cls:'tot',cells:['TOTAL',gbpK(ptdT.s),gbpK(jmAll.s),num(ptdT.f),num(jmAll.f),`<span class="pill ${ragPace(paceMtdF)}">${pct(paceMtdF)}</span>`,gbpK(ptdT.p),gbpK(jmAll.p),`<span class="pill ${ragPace(paceMtdP)}">${pct(paceMtdP)}</span>`]});
  // Table B — full-month forecast vs full plan by channel
  const bR=chansJ.map(ch=>{const pl=jpl(ch),fc=jfc(ch);return {ch,pl,fc,pcS:div(fc.s,pl.s),pcF:div(fc.f,pl.f),pcP:div(fc.p,pl.p),lpl:div(pl.p,pl.s),lfc:div(fc.p,fc.s)};}).filter(r=>r.pl.s>0||r.pl.f>0||r.fc.f>0).sort((a,b)=>b.pl.p-a.pl.p);
  const tB=bR.map(r=>({cells:[ r.ch, gbpK(r.pl.s), gbpK(r.fc.s), r.pl.s?`<span class="pill ${ragPace(r.pcS)}">${pct(r.pcS)}</span>`:'—', num(r.pl.f), num(r.fc.f), r.pl.f?`<span class="pill ${ragPace(r.pcF)}">${pct(r.pcF)}</span>`:'—', gbpK(r.pl.p), gbpK(r.fc.p), r.pl.p?`<span class="pill ${ragPace(r.pcP)}">${pct(r.pcP)}</span>`:'—', r.fc.s?`${f2(r.lpl)}→${f2(r.lfc)}`:'—' ]}));
  tB.push({cls:'tot',cells:['TOTAL',gbpK(planT.s),gbpK(jfcAll.s),`<span class="pill ${ragPace(paceFcS)}">${pct(paceFcS)}</span>`,num(planT.f),num(jfcAll.f),`<span class="pill ${ragPace(paceFcF)}">${pct(paceFcF)}</span>`,gbpK(planT.p),gbpK(jfcAll.p),`<span class="pill ${ragPace(paceFcP)}">${pct(paceFcP)}</span>`,`${f2(div(planT.p,planT.s))}→${f2(jfcAll.ltv)}`]});
  EMBED.julPace = bR.filter(r=>r.pl.p>0).map(r=>({ch:r.ch, pcP:Math.round(r.pcP*100)})).sort((a,b)=>b.pcP-a.pcP);
  EMBED.julPaceMo = MOJ;
  panes.s2j = `<h2 class="sec">${MOJ} month-to-date vs plan — 1–${DAYS_ELAPSED} ${MOJ} (${DAYS_ELAPSED}/${DIM} days)</h2>
<div class="callout">${MOJ} is the live month (June remains the headline reference until it is 7+ days old). MTD actuals are compared with the plan pro-rated to date (plan × ${DAYS_ELAPSED}/${DIM}); the full-month forecast = MTD + remaining ${kRem} days × trailing-4-week daily average. Affiliate spend gap-filled for ${GAPLBL} at ${gbp(AFF_CPA)} CPA; PLTV net of the 15% revshare.</div>
<div class="kpis" style="margin-top:14px">
${kpi('MTD spend', gbpM(jmAll.s), `fcst ${gbpM(jfcAll.s)} · plan ${gbpM(planT.s)}`)}
${kpi('MTD FTDs', num(jmAll.f), `fcst ${num(jfcAll.f)} · plan ${num(planT.f)}`)}
${kpi('MTD net PLTV', gbpM(jmAll.p), `fcst ${gbpM(jfcAll.p)} · plan ${gbpM(planT.p)}`)}
${kpi('MTD LTV:CAC', f2(jmAll.ltv), `CPA ${gbp(jmAll.cpa)} · PLTV/FTD ${gbp(jmAll.ppf)}`)}
</div>
<h2 class="sec">Pace</h2>
<div class="kpis">
${kpi('FTDs vs plan-to-date', `<span class="pill ${ragPace(paceMtdF)} big">${pct(paceMtdF)}</span>`, `MTD ${num(jmAll.f)} vs ${num(ptdT.f)}`)}
${kpi('PLTV vs plan-to-date', `<span class="pill ${ragPace(paceMtdP)} big">${pct(paceMtdP)}</span>`, `MTD ${gbpM(jmAll.p)} vs ${gbpM(ptdT.p)}`)}
${kpi('Full-month FTDs fcst vs plan', `<span class="pill ${ragPace(paceFcF)} big">${pct(paceFcF)}</span>`, `${num(jfcAll.f)} vs ${num(planT.f)}`)}
${kpi('Full-month PLTV fcst vs plan', `<span class="pill ${ragPace(paceFcP)} big">${pct(paceFcP)}</span>`, `${gbpM(jfcAll.p)} vs ${gbpM(planT.p)}`)}
</div>
<h2 class="sec">Forecast vs plan by channel — net PLTV pace</h2>
${chartbox('c_jul_pace')}
<p class="note">Full-month net-PLTV forecast ÷ full-month plan, by channel (green ≥100%, amber 90–99%, red &lt;90%). Ranked best-to-worst pace; PLTV is under-matured this early so treat as directional.</p>
<h2 class="sec">Table A — ${MOJ} MTD vs plan-to-date by channel</h2>
${tbl([{t:'Channel'},{t:'Plan-TD spend',r:1},{t:'MTD spend',r:1},{t:'Plan-TD FTDs',r:1},{t:'MTD FTDs',r:1},{t:'FTDs %',r:1},{t:'Plan-TD PLTV',r:1},{t:'MTD PLTV',r:1},{t:'PLTV %',r:1}], tA)}
<h2 class="sec">Table B — ${MOJ} full-month forecast vs plan by channel</h2>
${tbl([{t:'Channel'},{t:'Plan spend',r:1},{t:'Fcst spend',r:1},{t:'Spend %',r:1},{t:'Plan FTDs',r:1},{t:'Fcst FTDs',r:1},{t:'FTDs %',r:1},{t:'Plan PLTV',r:1},{t:'Fcst PLTV',r:1},{t:'PLTV %',r:1},{t:'LTV:CAC',r:1}], tB)}
<p class="note">Only ${DAYS_ELAPSED} day${DAYS_ELAPSED===1?'':'s'} of ${MOJ} have landed, so MTD and the full-month forecast are volatile and recent-day PLTV is under-matured (revises up). Pace = actual ÷ plan (green ≥100, amber ≥90, red &lt;90). TOTAL rows use all-channel actuals/forecast vs the plan total.</p>`;
}

// ---- S2c BUDGET ----
{
  const yearElapsed = DAYS_ELAPSED/365 + (31+28+31+30+31)/365; // through Jun28
  function bar(lbl, actual, plan, planToDate){
    const fillPct = Math.min(100, div(actual,plan)*100);
    const markPct = Math.min(100, div(planToDate,plan)*100);
    return `<div class="prog"><div class="prog-h"><span>${lbl}</span><span>${pct(div(actual,plan))} of FY plan</span></div>
    <div class="prog-bar"><div class="prog-fill" style="width:${fillPct}%"></div><div class="prog-mark" style="left:${markPct}%"></div></div>
    <div class="prog-d">Actual ${typeof actual==='number'&&actual>1e5?gbpM(actual):num(actual)} · FY plan ${typeof plan==='number'&&plan>1e5?gbpM(plan):num(plan)} · plan-to-date marker ${pct(div(planToDate,plan))} (${pct(yearElapsed)} of year elapsed)</div></div>`;
  }
  // by-channel media budget table (paid channels w/ spend plan)
  const mediaRows = Object.keys(PLAN).filter(ch=>{let t=0;for(let m=0;m<12;m++)t+=PLAN[ch].s[m];return t>0;}).map(ch=>{
    let fy=0; for(let m=0;m<12;m++) fy+=PLAN[ch].s[m];
    let ytdA=0; for(let m=1;m<=NM;m++){const r=monByMo[m][ch]; if(r) ytdA+=r.s;} if(ch==='Affiliate') ytdA+=AFF_GAP_28;
    return {ch,fy,ytdA,used:div(ytdA,fy)};
  }).sort((a,b)=>b.fy-a.fy);
  const mr = mediaRows.map(r=>({cells:[r.ch, gbpM(r.fy), gbpM(r.ytdA), `<span class="pill ${r.used>yearElapsed+0.05?'amber':'green'}">${pct(r.used)}</span>`]}));
  mr.push({cls:'tot',cells:['TOTAL media', gbpM(planFY.s), gbpM(ytd.s), `${pct(div(ytd.s,planFY.s))}`]});
  panes.s2c = `<h2 class="sec">Budget progress — YTD actual vs full-year plan</h2>
<div class="callout">${pct(yearElapsed)} of the year has elapsed (through ${GAPLBL}). Pink marker = plan-to-date; bar fill = YTD actual ÷ FY plan.</div>
${bar('Spend', ytd.s, planFY.s, planYTD.s)}
${bar('FTDs', ytd.f, planFY.f, planYTD.f)}
${bar('Net PLTV', ytd.p, planFY.p, planYTD.p)}
<h2 class="sec">Media budget by channel (paid)</h2>
${tbl([{t:'Channel'},{t:'FY plan spend',r:1},{t:'YTD actual',r:1},{t:'% used',r:1}], mr)}
<p class="note">Spend is tracking below the time-elapsed line (${pct(div(ytd.s,planFY.s))} used vs ${pct(yearElapsed)} elapsed) — the £3m H2 ATL uplift loads spend into the back half.</p>`;
}

// ---- S3 YTD & YoY ----
{
  const rows = [];
  for(let m=1;m<=RM;m++){
    const a=moTot[m]; const pr=(m===CUR_MO?DAYS_ELAPSED/DIM:1); const s25=D.y2025spend[m-1]*pr; const f25=D.y2025mon[m-1].f*pr; const p25=D.y2025mon[m-1].pg*pr;
    const cpa26=div(a.s,a.f), cpa25=div(s25,f25), l26=div(a.p,a.s), l25=div(p25,s25);
    rows.push({cells:[ MONTHS[m-1]+(m===6?' *':''), num(a.f), num(r0(f25)), (a.f/f25-1>=0?'+':'')+pct(a.f/f25-1), gbp(cpa26), gbp(cpa25), f2(l26), f2(l25), gbp(div(a.p,a.f)), gbp(div(p25,f25)) ]});
  }
  rows.push({cls:'tot',cells:['YTD *', num(ytd.f), num(r0(yoy.ftds25)), (yoy.ftdsD>=0?'+':'')+pct(yoy.ftdsD), gbp(yoy.cpa26), gbp(yoy.cpa25), f2(yoy.ltv26), f2(yoy.ltv25), gbp(div(yoy.pltv26,yoy.ftds26)), gbp(div(yoy.pltv25,yoy.ftds25))]});
  panes.s3 = `<h2 class="sec">YTD &amp; year-on-year (hybrid 2025 baseline)</h2>
<div class="callout">2025 baseline uses <b>FY25-tracker spend</b> with <b>model FTDs &amp; PLTV (gross)</b> from BigQuery. 2026 Affiliate PLTV is net of the 15% revshare, so the <b>YoY LTV:CAC uplift is conservative</b> (2026 net vs 2025 gross). * June &amp; YTD are through ${GAPLBL} (2025 pro-rated to match).</div>
<div class="kpis" style="margin-top:14px">
${kpi('YTD FTDs', num(ytd.f), `2025 ${num(r0(yoy.ftds25))} · ${(yoy.ftdsD>=0?'+':'')+pct(yoy.ftdsD)}`)}
${kpi('YTD CPA', gbp(yoy.cpa26), `2025 ${gbp(yoy.cpa25)} · ${pct1(yoy.cpaD)}`)}
${kpi('YTD LTV:CAC', f2(yoy.ltv26), `2025 ${f2(yoy.ltv25)} · ${(yoy.ltvD>=0?'+':'')+pct(yoy.ltvD)}`)}
${kpi('YTD net PLTV', gbpM(ytd.p), `spend ${gbpM(ytd.s)}`)}
</div>
<div class="chartbox" style="margin-top:14px"><canvas id="c_yoy_ftd"></canvas></div>
<h2 class="sec">Monthly YoY — FTDs, CPA, LTV:CAC, PLTV/FTD</h2>
${tbl([{t:'Month'},{t:'FTDs 26',r:1},{t:'FTDs 25',r:1},{t:'Δ',r:1},{t:'CPA 26',r:1},{t:'CPA 25',r:1},{t:'LTV:CAC 26',r:1},{t:'LTV:CAC 25',r:1},{t:'PLTV/FTD 26',r:1},{t:'PLTV/FTD 25',r:1}], rows)}
<h2 class="sec">What drove the CPA drop — spend vs volume (YoY bridge)</h2>
<div class="chartbox"><canvas id="c_cpa_bridge"></canvas></div>
<div class="callout">CPA = spend ÷ FTDs. Bridging 2025 → 2026: spend grew +${pct(yoy.spend26/yoy.spend25-1)} which on its own would <b>raise</b> CPA by <b>+${gbp(cpaSpendEff)}</b>, but FTDs grew +${pct(yoy.ftdsD)} which <b>cuts</b> CPA by <b>${gbp(cpaVolEff)}</b>. Net ${gbp(yoy.cpa26-yoy.cpa25)} (£${r0(yoy.cpa25)} → £${r0(yoy.cpa26)}, ${pct1(yoy.cpaD)}). The <b>volume effect dominates</b> — FTDs grew about twice as fast as spend, with fixed brand/ATL investment (~${gbpM(atlYTD)} YTD, 0 attributed FTDs) amortised across a much larger base. The paid-vs-non-paid FTD mix is broadly unchanged YoY (~44% non-paid), so this is leverage, not a shift to organic.</div>
<h2 class="sec">Paid vs Organic — YoY</h2>
${(()=>{
  const p25=y25spendYTD, p26=seg.p26.s, o26=seg.o26.s;
  const rows=[
    {cells:['Paid', gbpM(p25), gbpM(p26), num(seg.p25f), num(seg.p26.f), `<span class="pill ${seg.paidFD>=0?'green':'red'}">${(seg.paidFD>=0?'+':'')+pct(seg.paidFD)}</span>`, gbp(seg.paid25cpa), gbp(seg.paid26cpa), `<span class="pill ${seg.paid26cpa<seg.paid25cpa?'green':'red'}">${pct1(div(seg.paid26cpa,seg.paid25cpa)-1)}</span>`]},
    {cells:['Organic', '~£0', gbpM(o26), num(seg.o25f), num(seg.o26.f), `<span class="pill ${seg.orgFD>=0?'green':'red'}">${(seg.orgFD>=0?'+':'')+pct(seg.orgFD)}</span>`, '~£0', gbp(seg.org26cpa), '—']},
  ];
  rows.push({cls:'tot',cells:['Blended', gbpM(p25), gbpM(p26+o26), num(seg.p25f+seg.o25f), num(seg.p26.f+seg.o26.f), `<span class="pill ${ragPace(1+yoy.ftdsD)}">+${pct(yoy.ftdsD)}</span>`, gbp(yoy.cpa25), gbp(yoy.cpa26), `<span class="pill green">${pct1(yoy.cpaD)}</span>`]});
  return `<div class="callout">2025 paid spend = the FY25 tracker total (organic media is ~£0, so the tracker is effectively all-paid); FTDs are model both years. <b>Paid CPA fell ${pct1(div(seg.paid26cpa,seg.paid25cpa)-1)} (${gbp(seg.paid25cpa)}→${gbp(seg.paid26cpa)})</b> on +${pct(seg.paidFD)} FTDs from +${pct(div(p26,p25)-1)} spend, while the near-free organic base grew +${pct(seg.orgFD)}. Paid FTD share is broadly flat (${pct(div(seg.p25f,seg.p25f+seg.o25f))}→${pct(div(seg.p26.f,seg.p26.f+seg.o26.f))}). Paid = Affiliate(+App), ATL, PPC, Google UAC, Meta, Apple Ads, Display; Organic = Organic Search, RAF, iOS/Android Organic, Direct, Unattributed, Email, Referral, Organic Social, CRM.</div>
<div class="chartbox" style="margin-top:14px"><canvas id="c_seg_cpa"></canvas></div>
${tbl([{t:'Segment'},{t:'25 spend',r:1},{t:'26 spend',r:1},{t:'25 FTDs',r:1},{t:'26 FTDs',r:1},{t:'FTDs YoY',r:1},{t:'25 CPA',r:1},{t:'26 CPA',r:1},{t:'CPA YoY',r:1}], rows)}
<p class="note">Per-channel 2025 CPA is intentionally omitted: 2025 spend by channel isn't in the tracker and BigQuery's 2025 channel spend is incomplete (~£10.5m vs £20.5m tracker, ATL missing), so it would be misleading.</p>`;
})()}`;
}

// ---- S3b PLTV DRIVERS ----
{
  const top = momMovers.slice(0,6), bot = momMovers.slice(-6).reverse();
  const mvRow = a=>({cells:[a.ch, gbpK(a.mp), gbpK(a.jp), (a.dP>=0?'+':'')+gbpK(a.dP)]});
  panes.s3b = `<h2 class="sec">Month-on-month PLTV drivers — ${MO_DRVPREV} vs ${MO_DRVCUR} (complete months)</h2>
<div class="kpis">
${kpi('Net PLTV ΔMoM', (mom.dPLTV>=0?'+':'')+gbpK(mom.dPLTV), `${MO_DRVPREV} ${gbpM(mom.mayP)} → ${MO_DRVCUR} ${gbpM(mom.junP)}`)}
${kpi('FTDs ΔMoM', (mom.dF>=0?'+':'')+num(mom.dF), `${MO_DRVPREV} ${num(mom.mayF)} → ${MO_DRVCUR} ${num(mom.junF)}`)}
${kpi('Blended PLTV/FTD', gbp(mom.junPPF), `${MO_DRVPREV} ${gbp(mom.mayPPF)}`)}
${kpi(MO_DRVCUR+' vs '+MO_DRVPREV+' PLTV', (div(mom.junP,mom.mayP)-1>=0?'+':'')+pct1(div(mom.junP,mom.mayP)-1), `full month, net`)}
</div>
<div class="callout" style="margin-top:14px"><b>Volume vs rate.</b> Of the ${(mom.dPLTV>=0?'+':'')}${gbpK(mom.dPLTV)} MoM PLTV move, volume (${mom.dF>=0?'more':'fewer'} FTDs at ${MO_DRVPREV}'s rate) contributes ${(mom.volEffect>=0?'+':'')}${gbpK(mom.volEffect)} and value-per-FTD (mix/maturity) contributes ${(mom.rateEffect>=0?'+':'')}${gbpK(mom.rateEffect)}. Blended PLTV/FTD ${mom.junPPF>=mom.mayPPF?'rose to':'slipped to'} ${gbp(mom.junPPF)} (${MO_DRVPREV} ${gbp(mom.mayPPF)}).</div>
<div class="chartbox" style="margin-top:14px"><canvas id="c_mom"></canvas></div>
<div class="grid2" style="margin-top:14px">
<div>${tbl([{t:'Top + movers'},{t:MO_DRVPREV,r:1},{t:MO_DRVCUR,r:1},{t:'ΔPLTV',r:1}], top.map(mvRow))}</div>
<div>${tbl([{t:'Top − movers'},{t:MO_DRVPREV,r:1},{t:MO_DRVCUR,r:1},{t:'ΔPLTV',r:1}], bot.map(mvRow))}</div>
</div>
<div class="callout"><b>The mix story.</b> ${MO_DRVCUR}'s blended PLTV/FTD is ${gbp(moBlend[DRV_CUR-1].ppf)} vs ${gbp(moBlend[DRV_PREV-1].ppf)} in ${MO_DRVPREV}.${standoutDrv?` It is diluted by a <b>${standoutDrv.ch}</b> shift (${pct1(standoutDrv.share)} of FTDs at ${gbp(standoutDrv.ppf)}/FTD)`:''} plus high iOS Organic (${pct1(div((drvCurCh["iOS Organic"]||{f:0}).f,_cT.f))}) and Affiliate (${pct1(div((drvCurCh["Affiliate"]||{f:0}).f,_cT.f))}) FTD shares. Premium channels (Organic Search, PPC Generic, Google UAC) lost FTD <b>share</b>, so the blend is diluted by <b>mix</b> — not within-channel value decay. <b>Caveat:</b> recent-cohort maturation understates the latest month's modelled PLTV, which revises up over the following weeks.</div>`;
}

// ---- S4 DAILY ----
panes.s4 = `<h2 class="sec">Daily view — last 30 days (gap-filled)</h2>
<div class="grid2">${chartbox('c_daily_sf')}${chartbox('c_daily_p')}</div>
<p class="note">${GAPLBL} Affiliate spend gap-filled (+${gbpK(AFF_GAP_28)}); APD2+ for the latest 1–2 days is understated by the quality-metric lag.</p>`;

// ---- S4b TIMING ----
{
  const dow=[0,0,0,0,0,0,0], dowN=[0,0,0,0,0,0,0], dowF=[0,0,0,0,0,0,0];
  const dom={}, domN={};
  dailyG.forEach(d=>{ if(d.date<'2026-01-01') return; const dt=new Date(d.date+'T00:00:00Z'); const wd=(dt.getUTCDay()+6)%7; dow[wd]+=d.sg; dowF[wd]+=d.f; dowN[wd]++; const dm=parseInt(d.date.slice(8),10); dom[dm]=(dom[dm]||0)+d.f; domN[dm]=(domN[dm]||0)+1; });
  EMBED.dowFtd = dow.map((_,i)=>r0(dowF[i]/dowN[i]));
  EMBED.dowLbl = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  EMBED.domFtd = []; EMBED.domLbl=[]; for(let i=1;i<=31;i++){ if(dom[i]){ EMBED.domLbl.push(i); EMBED.domFtd.push(r0(dom[i]/domN[i])); } }
  const peakDom = EMBED.domLbl[EMBED.domFtd.indexOf(Math.max(...EMBED.domFtd))];
  panes.s4b = `<h2 class="sec">Timing &amp; payday effects (2026 YTD)</h2>
<div class="grid2">${chartbox('c_dow')}${chartbox('c_dom')}</div>
<p class="note">Weekends and month-end carry the highest daily FTD volume (peak around day ${peakDom} — the late-month payday window). Early-week (Mon–Wed) and early-month days are systematically lowest, which is why the this-week forecast never linearly scales a part-week by 7/days-landed.</p>`;
}

// ---- SQ FTD QUALITY ----
if(FTDQ.length){
  const L=FTDQ[FTDQ.length-1];
  const qrows = FTDQ.map(r=>({cells:[ r.w, num(r.ftd), pct1(r.immR/100), num(r.apd2), `<span class="pill ${r.apd2R>=48?'green':r.apd2R>=44?'amber':'red'}">${r.apd2R}%</span>`, r.avgapd.toFixed(2), pct1(r.savR/100), gbp(r.ppf), gbp(r.cpf), gbp(r.cpa2) ]}));
  panes.sq = `<h2 class="sec">FTD quality — weekly trends (last ${FTDQ.length} complete weeks)</h2>
<div class="callout"><b>What this shows.</b> Front-loaded quality signals for each week's FTD cohort. <b>IMM ratio</b> = immediate FTDs (deposit in the registration session) ÷ all FTDs. <b>APD2+</b> = players active on 2+ days in their first week (the retained group); <b>APD 0–1</b> = the rest. <b>Avg active days/FTD</b> = first-week active player-days ÷ FTDs. <b>Savvy-staker rate</b> = flagged savvy stakers ÷ FTDs. <b>PLTV/FTD (FTDPP)</b> = net 12-month PLTV ÷ FTDs. Cost-per metrics use blended spend. All net of the 15% affiliate revshare.</div>
<div class="kpis" style="margin-top:14px">
${kpi('FTDs (latest wk)', num(L.ftd), `w/c ${L.w}`)}
${kpi('APD2+ rate', L.apd2R+'%', `${num(L.apd2)} retained`)}
${kpi('PLTV/FTD (FTDPP)', gbp(L.ppf), 'net 12m value/FTD')}
${kpi('IMM FTD ratio', L.immR+'%', 'immediate ÷ total')}
${kpi('Cost per FTD', gbp(L.cpf), `cost per APD2+ ${gbp(L.cpa2)}`)}
</div>
<div class="grid2" style="margin-top:14px">${chartbox('q_vol')}${chartbox('q_ret')}</div>
<div class="grid2" style="margin-top:14px">${chartbox('q_ppf')}${chartbox('q_imm')}</div>
${chartbox('q_cost')}
<div style="margin-top:14px">${tbl([{t:'Week'},{t:'FTDs',r:1},{t:'IMM %',r:1},{t:'APD2+',r:1},{t:'APD2+ %',r:1},{t:'Act.days/FTD',r:1},{t:'Savvy %',r:1},{t:'PLTV/FTD',r:1},{t:'Cost/FTD',r:1},{t:'Cost/APD2+',r:1}], qrows)}</div>
${FTDQCH?`<h2 class="sec">By channel — quality (last 4 complete weeks: ${FTDQCH.last4[0]}–${FTDQCH.last4[1]})</h2>
<div style="margin-top:6px">${tbl([{t:'Channel'},{t:'FTDs',r:1},{t:'IMM %',r:1},{t:'APD2+ %',r:1},{t:'Act.days/FTD',r:1},{t:'Savvy %',r:1},{t:'PLTV/FTD',r:1},{t:'Cost/FTD',r:1},{t:'Cost/APD2+',r:1}], FTDQCH.t4.map(r=>({cells:[ r.ch, num(r.ftd), pct1(r.immR/100), `<span class="pill ${r.apd2R>=48?'green':r.apd2R>=44?'amber':'red'}">${r0(r.apd2R)}%</span>`, r.avgapd.toFixed(2), pct1(r.savR/100), gbp(r.ppf), r.cpf?gbp(r.cpf):'—', r.cpa2?gbp(r.cpa2):'—' ]})))}</div>
<h2 class="sec">Channel deep-dive — weekly</h2>
<div class="selrow"><select id="qchSel">${FTDQCH.order.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
${chartbox('q_ch')}
<p class="note">Pick a channel to see its weekly FTDs (bars), APD2+ retention rate and PLTV/FTD. Organic/RAF/Direct/Unattributed carry no media cost, so their cost-per columns show "—".</p>`:''}
${EMBED.cohMat?`<h2 class="sec">Realized value maturation — cumulative NGR per player by cohort</h2>
<div class="callout"><b>Actual money, not the model.</b> Each line is a monthly cohort (players by their first-activity month); the y-axis is <b>cumulative net gaming revenue per player</b> at 7/14/30/60/90 days of tenure. Only fully-elapsed windows are drawn, so lines stop where the cohort hasn't aged that far yet (as of ${EMBED.cohMat.asOf}). Value roughly triples from day 7 (~£40) to day 90 (~£120–135); at equal ages the cohorts track closely, so recent intake quality is holding. This realized curve (~£160 by ~6 months for Jan, still rising) is broadly consistent with the ~£145–155 modelled 12-month PLTV — a useful cross-check. Unlike the modelled <code>sum_pltv</code> (a locked prediction that doesn't age), this shows genuine maturation.</div>
${chartbox('q_mat')}
<div style="margin-top:14px">${tbl([{t:'Cohort'},{t:'Players',r:1},...EMBED.cohMat.horizons.map(h=>({t:'Day '+h,r:1}))], EMBED.cohMat.rows.map(r=>({cells:[ r.mo, num(r.players), ...r.v.map(x=>x==null?'—':gbp(x)) ]})))}</div>
<p class="note">Cohort = each player's first gameplay day (proxy for FTD — the gameplay mart carries no deposit/attribution key). NGR = realized net gaming revenue, not identical to the PLTV model's definition, and <b>blended across all channels</b> (the two warehouses can't be joined via these connectors, so no channel split). Source: <code>data-delivery-prod.mart.daily_player_gameplay</code>, 2026 cohorts.</p>`:''}
<p class="note"><b>Not yet available in this view:</b> the explicit <b>APD0 vs APD1</b> split, <b>APD1→APD2+ upgrade</b> rate, and <b>FTD→Qore</b> conversion. The warehouse exposes only APD2+ at this grain (so APD 0/1 show combined as "APD 0–1"), and the gameplay mart is a separate BigQuery project with no deposit/channel key to build FTD cohorts or a player-level PLTV "Qore" tier via a single query. Wire those in once APD0/1 are surfaced in attribution (or a player-id↔user_ref bridge + the Qore threshold are available).</p>`;
}

// ---- S4c WEATHER ----
const _fd = wxFc? wxFc.days : [];
const fcLbl = _fd.length ? (parseInt(_fd[0].date.slice(8),10)+'–'+parseInt(_fd[_fd.length-1].date.slice(8),10)+' '+MONTHS[parseInt(_fd[0].date.slice(5,7),10)-1]) : '';
panes.s4c = `<h2 class="sec">Weather impact — heatwave &amp; forward forecast</h2>
<div class="kpis">
${kpi('Peak-heat FTDs (24–27 Jun)', pct1(wxPeak), 'vs same-weekday norm')}
${kpi(`Heatwave (19 Jun–${GAPLBL})`, pct1(wxHeatwave), 'vs day-of-week norm')}
${kpi('Latest weekend (27–28 Jun)', pct1(wxWeekend), 'Sat+Sun under continued heat')}
${kpi('Corr. temp vs FTD index', f2(wxCorrIdx), `temp vs PLTV/FTD ${f2(wxCorrPpf)}`)}
</div>
<div class="grid2" style="margin-top:14px">${chartbox('wxFtd')}${chartbox('wxPf')}</div>
${chartbox('wxScatter')}
<div class="callout"><b>Read:</b> the June heatwave (built from ~19 Jun, peaked 24–27 Jun with a Met Office <b>Red Extreme Heat</b> warning, ~36–38°C highs in SE England, easing from 28 Jun) tracks a clear FTD slowdown. Day-of-week adjusted, FTDs ran <b>${pct1(wxHeatwave)}</b> below normal across the 19 Jun–${GAPLBL} heatwave and <b>${pct1(wxPeak)}</b> on the peak-heat days (24–27 Jun). Spend held roughly normal, so CPA rose: heat hit conversion, not budget. The 27–28 Jun weekend — normally a volume <i>lift</i> — came in <b>${pct1(wxWeekend)}</b> below the weekend norm while temperatures stayed ~27–29°C, reinforcing the signal. Correlation of approx temperature with the day-of-week-adjusted FTD index is <b>${f2(wxCorrIdx)}</b> (negative); with PLTV/FTD only <b>${f2(wxCorrPpf)}</b>, so players who do sign up in the heat are of broadly normal value — it is a <b>volume</b> effect. A <b>second hot spell</b> rebuilt through early July: temperatures dipped to ~19–20°C on 1–2 Jul then climbed back to ~29°C by 8 Jul, so the pressure on FTD volume has returned. <b>Caveats:</b> temperature is an <i>approximation reconstructed from Met Office reporting</i> (peaked ~29°C 24–27 Jun, eased to ~20°C 1–2 Jul, rebuilt to ~29°C by 8 Jul), not a measured daily feed — swap in an exact series for precision. FTD counts are reliable but the most recent PLTV/FTD points are the least-matured cohort and revise up; the latest day's spend is understated by the affiliate-feed lag. Correlation ≠ causation — school terms, holidays and major sport can co-move with hot spells.</div>
${wxFc?`<h2 class="sec">Heatwave — forward forecast (${fcLbl})</h2>
<div class="kpis">
${kpi('Forecast FTD impact', pct1(wxFc.pct), 'vs a normal week')}
${kpi('Est. FTD shortfall', '≈'+num(wxFc.short), `${num(r0(wxFc.totExp))} vs ${num(r0(wxFc.totNorm))} normal`)}
${kpi('Peak temp (forecast)', r0(wxFc.peakT)+'°C', 'expected daily mean')}
${kpi('Sensitivity', f2(wxFc.slope)+' idx/°C', `temp↔FTD corr ${f2(wxCorrIdx)}`)}
</div>
<div class="chartbox" style="margin-top:14px"><canvas id="wxFcChart"></canvas></div>
<div class="callout"><b>Forecast:</b> applying the fitted temperature→FTD-index relationship (least-squares over ${wxDays.length} days since 1 May) to the forecast window (${fcLbl}) — peak ~${r0(wxFc.peakT)}°C early, easing from mid-window — implies FTDs run <b>${pct1(wxFc.pct)}</b> below a normal week, roughly <b>${num(wxFc.short)} fewer FTDs</b> if the heat lands as forecast. Value per FTD should hold (temp↔PLTV/FTD corr only ${f2(wxCorrPpf)}), so this is a <b>volume</b> effect, not a value one. With spend planned flat, CPA will rise on the hottest days. <b>Mitigations:</b> shift budget toward evening/in-play windows, lean on app/retargeting audiences that are less heat-sensitive, and avoid front-loading peak-day spend; expect a rebound as the spell breaks. <b>Caveat:</b> forecast temperatures are an assumption (peak ~${r0(wxFc.peakT)}°C) — swap in the exact Met Office series to refine.</div>`:''}`;

// ---- S4d WORLD CUP ----
{
  const MABBR=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtDM=ds=>`${parseInt(ds.slice(8),10)} ${MABBR[+ds.slice(5,7)-1]}`;
  const rows = wcRows.map(r=>({cells:[
    fmtDM(r.date), r.dow, num(r.fix), num(r.f), num(r.norm),
    `<span class="pill ${r.idx>=100?'green':r.idx>=90?'amber':'red'}">${r0(r.idx)}</span>`,
    r.heat?'Y':'—', r.eng? `<b>ENG</b> ${r.eng}`:''
  ]}));
  panes.s4d = `<h2 class="sec">World Cup impact — FTD volume vs fixtures (11 Jun–${GAPLBL})</h2>
<div class="callout">Index = daily FTDs ÷ the pre-tournament day-of-week norm (baseline 12 May–10 Jun, pre-WC &amp; pre-heat). 100 = a normal day for that weekday. The 2026 group stage ran 11–27 Jun (72 matches); England (Group L) played 17, 23 &amp; 27 Jun — all UK prime-time evening kick-offs. <b>The heatwave from 19 Jun overlaps the back half and is the dominant confound.</b></div>
<div class="kpis" style="margin-top:14px">
${kpi('Tournament avg index', r0(wcAll)+'%', `11 Jun–${GAPLBL} vs pre-WC norm`)}
${kpi('Pre-heat (11–18 Jun)', r0(wcPreHeat)+'%', 'WC live, heat not yet')}
${kpi(`Heat period (19 Jun–${GAPLBL})`, r0(wcHeatSeg)+'%', 'WC + heatwave')}
${kpi('England match days', r0(wcEng)+'%', '17/23/27 Jun · 1 Jul R32 · 5 Jul R16')}
</div>
<div class="chartbox" style="margin-top:14px"><canvas id="wcIdx"></canvas></div>
<div class="grid2" style="margin-top:14px">${chartbox('wcScatter')}<div class="callout" style="margin-top:0"><b>Read — all fixtures.</b> Across the whole group stage, blended FTDs ran <b>${r0(wcAll)}%</b> of the pre-tournament norm, but that shortfall is almost entirely the heatwave: <b>${r0(wcPreHeat)}%</b> before the heat (11–18 Jun, essentially normal) vs <b>${r0(wcHeatSeg)}%</b> once it hit (19 Jun–${GAPLBL}). Fixture density (2–6 games/day) shows only a weak relationship with the index (corr <b>${f2(wcCorrFix)}</b>), and the heaviest fixture days (MD3, 24–27 Jun, 6 games) coincide with peak heat — so that's confounded, not a clean "more football = fewer sign-ups" signal.<br><br><b>England specifically.</b> The cleanest read is the <b>17 Jun opener</b> (pre-heat, biggest game): FTDs came in at <b>${r0(wcRows.find(r=>r.date==='2026-06-17').idx)}%</b> of the Wednesday norm — slightly <i>above</i>. The softer England days (23rd ${r0(wcRows.find(r=>r.date==='2026-06-23').idx)}%, 27th ${r0(wcRows.find(r=>r.date==='2026-06-27').idx)}%) both fall in peak heat. <b>No evidence England matches suppress casino sign-ups</b> at a daily level.</div></div>
<h2 class="sec">Value check — does the World Cup bring lower-value players?</h2>
<div class="kpis" style="margin-top:6px">
${kpi('WC-window PLTV/FTD', gbp(wcWinPpf), `11 Jun–${GAPLBL}`)}
${kpi('Pre-WC baseline', gbp(wcBasePpf), '12 May–10 Jun norm')}
${kpi('Fixtures × PLTV/FTD corr', (wcCorrPpf>=0?'+':'')+f2(wcCorrPpf), 'mildly positive, not negative')}
</div>
<div class="grid2" style="margin-top:14px">${chartbox('wcPpfScatter')}<div class="callout" style="margin-top:0"><b>No — value per depositor is flat through the tournament.</b> PLTV/FTD across the WC window was <b>${gbp(wcWinPpf)}</b>, essentially level with the pre-tournament norm <b>${gbp(wcBasePpf)}</b>. Fixture density vs PLTV/FTD correlates <b>${wcCorrPpf>=0?'+':''}${f2(wcCorrPpf)}</b> — mildly <i>positive</i>: the heaviest football days (24–27 Jun, 6 games) ran the <i>highest</i> value (<b>${gbp(wcPeakPpf)}</b> vs <b>${gbp(wcEarlyPpf)}</b> in early WC), and England match days sat around the value norm.<br><br><b>Caveat — cohort maturation.</b> The 12-month PLTV model under-reports the most recent cohorts, so late-Jun/Jul days read artificially low and revise up over the following weeks. The <b>−8% MoM PLTV</b> is a <b>value-mix shift</b> (growth in lower-PLTV organic channels) plus the heatwave dampening volume — <b>not</b> the World Cup pulling in low-value players.</div></div>
<h2 class="sec">Day-by-day — tournament window</h2>
${tbl([{t:'Date'},{t:'Day'},{t:'Fixtures',r:1},{t:'FTDs',r:1},{t:'Norm',r:1},{t:'Index',r:1},{t:'Heat'},{t:'England'}], rows)}
<h2 class="sec">Round of 32 — fixtures &amp; results</h2>
<div class="callout">The knockout Round of 32 (32 teams, 16 ties) ran 28 Jun–3 Jul and is now <b>complete</b>. <b>England 2–1 DR Congo</b> (Atlanta, 1 Jul) — Harry Kane brace after going a goal down — set up the Round-of-16 tie with co-hosts Mexico. Dates shown are match (US local) dates.</div>
${tbl([{t:'Date'},{t:'Match'},{t:'Result'}], WC_R32.map(x=>({cells:[
  fmtDM(x.d), x.m.includes('England')?`<b>${x.m}</b>`:x.m,
  x.r? (x.m.includes('England')?`<b>${x.r}</b>`:x.r) : `<span class="pill grey">scheduled</span>`
]})))}
<h2 class="sec">Round of 16 — fixtures &amp; results</h2>
<div class="callout">The Round of 16 (16 teams, 8 ties) runs 4–7 Jul. Results in through ${GAPLBL}; the 6–7 Jul ties are scheduled. <b>England 3–1 Mexico</b> (5 Jul) — Kane again — books a quarter-final. The 4–5 Jul match days now feed the fixtures line and index above. Dates shown are match (US local) dates.</div>
${tbl([{t:'Date'},{t:'Match'},{t:'Result'}], WC_R16.map(x=>({cells:[
  fmtDM(x.d), x.m.includes('England')?`<b>${x.m}</b>`:x.m,
  x.r? (x.m.includes('England')?`<b>${x.r}</b>`:x.r) : `<span class="pill grey">scheduled</span>`
]})))}
<p class="note">World-Cup-themed UAC ad groups were among June's best acquisition performers (<b>world cup – brand focus</b> 82 FTDs @ LTV:CAC 2.34, <b>world cup – game focus</b> 62 @ 1.87) — the tournament was a positive <i>targeted</i> lever even though blended daily volume didn't lift. Caveats: daily granularity can't show an intra-evening dip during the ~2-hour match windows; the heatwave overlaps two of three England games; fixture counts are as-scheduled (Iran's Group G withdrawal noted); 28 Jun onward are Round-of-32 days (real fixtures, table above).</p>`;
}

// ---- STRAFFIC — SITE TRAFFIC & SESSIONS ----
{
  const k=TRAF_KPI;
  const s2r=div(k.reg,k.sess), r2f=div(k.ftd,k.reg), s2f=div(k.ftd,k.sess), lr2f=div(k.ftd,k.legreg);
  const chRows = TRAF_CH.map(c=>({cells:[ c.ch, num(c.sess), pct(c.newPct), num(c.snew), num(c.ftd), `<span class="pill ${c.n2f>=0.05?'green':c.n2f>=0.02?'amber':'red'}">${pct1(c.n2f)}</span>` ]}));
  panes.straffic = `<h2 class="sec">Site traffic &amp; sessions (YTD)</h2>
<div class="kpis">
${kpi('Sessions', (k.sess/1e6).toFixed(1)+'m', `${pct(div(k.snew,k.sess))} new · ${pct(div(k.sret,k.sess))} returning`)}
${kpi('New sessions', (k.snew/1e6).toFixed(2)+'m', `first-time visits`)}
${kpi('Registrations', num(k.reg), `${num(k.legreg)} legitimate`)}
${kpi('FTDs', num(k.ftd), `from ${(k.sess/1e6).toFixed(1)}m sessions`)}
</div>
<h2 class="sec">Funnel — session → registration → FTD (YTD)</h2>
<div class="kpis">
${kpi('Session → Reg', pct1(s2r), `${num(k.reg)} regs`)}
${kpi('Reg → FTD', pct(r2f), `legit reg → FTD ${pct(lr2f)}`)}
${kpi('Session → FTD', pct1(s2f), `blended`)}
${kpi('New-session share', pct(div(k.snew,k.sess)), `~80% of traffic is returning`)}
</div>
<div class="grid2" style="margin-top:14px">${chartbox('c_traf_wk')}${chartbox('c_traf_conv')}</div>
<h2 class="sec">Traffic by channel (YTD) — sessions, mix &amp; new-visitor conversion</h2>
${tbl([{t:'Channel'},{t:'Sessions',r:1},{t:'% new',r:1},{t:'New sessions',r:1},{t:'FTDs',r:1},{t:'New-sess→FTD',r:1}], chRows)}
<div class="callout">Conversion here is <b>new-session → FTD</b> (FTDs ÷ first-time sessions) — the acquisition-relevant rate. Two very different kinds of traffic: <b>returning/owned</b> (Direct, iOS/Android Organic) is the bulk of sessions — largely existing players logging in. <b>Acquisition</b> traffic is high-intent: <b>Affiliate</b> turns ${(729578/1e6).toFixed(2)}m new sessions into 71.9k FTDs (${pct1(div(71871,729578))} new-session→FTD), <b>Apple Ads Brand</b> ${pct1(div(5709,16026))} and <b>Google UAC</b> ${pct1(div(7954,27962))} convert hardest; <b>Direct</b> new sessions convert at just ${pct1(div(7308,2059509))}. So site-wide session volume is flat/returning-driven while FTD growth comes from the high-converting acquisition channels. New-visitor sessions spiked in mid-April (Meta Paid Social surge) — visible in the weekly split.</div>`;
}

// ---- S5 INSIGHTS ----
{
  const bestCh = optRows.filter(r=>r.paid && r.f>=50)[0];
  panes.s5 = `<h2 class="sec">Insights</h2>
<div class="rec"><h3>What the data is saying</h3><ol>
<li><b>Acquisition is well ahead of last year</b> — YTD FTDs ${(yoy.ftdsD>=0?'+':'')+pct(yoy.ftdsD)} vs 2025 at ${pct1(yoy.cpaD)} lower CPA. Blended LTV:CAC ${f2(yoy.ltv26)} (net) vs ${f2(yoy.ltv25)} (gross) last year.</li>
<li><b>June is pacing slightly behind plan</b> — PLTV ${pct(paceP)} and FTDs ${pct(paceF)} of target. The gap is value-mix, not volume: blended PLTV/FTD ${gbp(mtd.ppf)} vs May ${gbp(moBlend[4].ppf)}.</li>
<li><b>${standout.ch} is the June dilutant</b> — ${pct1(standout.share)} of FTDs at ${gbp(standout.ppf)}/FTD. Premium channels (Organic Search, PPC Generic) held value but lost share.</li>
<li><b>Best-returning paid channel:</b> ${bestCh? bestCh.ch+' at '+f2(bestCh.ltv)+' net LTV:CAC':'—'}. Brand search and UAC ad groups top the leaderboard.</li>
<li><b>Affiliate is the largest paid channel</b> (${pct1(div(junCh["Affiliate"].f,moTot[RM].f))} of June FTDs) and the softest premium spend — ${affAlerts.length? affAlerts.length+' large affiliate(s) below 0.8 net':'no large affiliate below 0.8 net'} this 4-week window.</li>
<li><b>Quality holding:</b> blended cost per APD2+ ${gbp(apdBlendCost)} YTD; value-per-FTD is stable week to week, so FTD volume — not per-player value — drives PLTV.</li>
</ol></div>`;
}

// ---- S6 CHANNEL MIX ----
panes.s6 = `<h2 class="sec">Channel mix — ${MO_CUR} MTD (1–${DD})</h2>
<div class="grid2">${chartbox('c_mix_s')}${chartbox('c_mix_f')}</div>
<p class="note">Spend concentrates in Affiliate, ATL and PPC Brand; FTD volume is far more diversified across non-paid channels (Organic Search, RAF, iOS Organic, Direct).</p>`;

// ---- S6b APD2+ ----
{
  const rows = apdRows.map(r=>({cells:[ r.ch, gbpK(r.s), num(r.apd), r.apd?`<span class="pill ${r.cpa<=250?'green':r.cpa>=350?'red':'amber'}">${r.s>0?gbp(r.cpa):'—'}</span>`:'—', pct(r.ratio) ]}));
  rows.push({cls:'tot',cells:['TOTAL', gbpM(ytd.s), num(ytd.apd), `<span class="pill ${apdBlendCost<=250?'green':apdBlendCost>=350?'red':'amber'}">${gbp(apdBlendCost)}</span>`, pct(div(ytd.apd,ytd.f))]});
  panes.s6b = `<h2 class="sec">APD2+ (active past day 2) — quality by channel (YTD)</h2>
<div class="kpis">${kpi('Blended cost / APD2+', gbp(apdBlendCost), `YTD · pill ≤£250 good`)}${kpi('YTD APD2+ players', num(ytd.apd), `${pct(div(ytd.apd,ytd.f))} of FTDs`)}${kpi('APD2+ : FTD', pct(div(ytd.apd,ytd.f)),'blended retention proxy')}${kpi('Note','~2-day lag','latest days understated')}</div>
<div style="margin-top:14px">${tbl([{t:'Channel'},{t:'Spend',r:1},{t:'APD2+',r:1},{t:'Cost/APD2+',r:1},{t:'APD2+/FTD',r:1}], rows)}</div>
<h2 class="sec">Cost per APD2+ — weekly trend (last 12 complete weeks)</h2>
<div class="chartbox"><canvas id="c_apd_wk"></canvas></div>
<h2 class="sec">FTD → APD2+ conversion — weekly (% of FTDs active past day 2)</h2>
<div class="chartbox"><canvas id="c_apd_ratio"></canvas></div>
<p class="note">Share of each week's FTDs that go on to be active past day 2 — a leading retention/quality proxy. Stable ~47–49% across the half-year (dashed = 26-week average), confirming recent cost-per-APD2+ moves are acquisition-cost driven, not quality. Latest complete week may still firm up as the ~2-day lag clears.</p>
<h2 class="sec">APD2+ rate vs value — by channel (YTD)</h2>
<div class="chartbox"><canvas id="c_apd_scatter"></canvas></div>
<p class="note">Each bubble = a channel (size = FTD volume). Day-2 activation rate (x) and net PLTV per FTD (y) are strongly correlated across channels (r ≈ 0.86) — APD2+ is a good leading proxy for value. Normalised, an APD2+ player is worth a fairly steady ~£300 regardless of channel, so lifting day-2 activation on low-converting channels (Direct, Meta Paid Social, Email) is where PLTV upside sits.</p>
<div class="callout">Cost per APD2+ = CPA ÷ (APD2+ per FTD). The recent uptick tracks <b>CPA</b> (overlaid) — APD2+-per-FTD has held ~47–49%, so it's a front-end acquisition-cost move (heatwave-suppressed FTD volume on steady spend), not a fall in player quality. <b>The current part-week is excluded</b>: with the ~2-day APD2+ lag only a fraction of day-2 actives have landed, so it currently reads ~£1,270 and will revise down toward ~£290 as the cohort matures.</div>`;
}

// ---- S7 WEB vs APP ----
{
  const rows = ['Web','App','Other'].map(pl=>{ const o=platYTD[pl]; return {cells:[pl, gbpM(o.s), num(o.f), gbpM(o.p), o.s?f2(div(o.p,o.s)):'—', gbp(div(o.s,o.f))]}; });
  rows.push({cls:'tot',cells:['TOTAL', gbpM(ytd.s), num(ytd.f), gbpM(ytd.p), f2(div(ytd.p,ytd.s)), gbp(div(ytd.s,ytd.f))]});
  panes.s7 = `<h2 class="sec">Web vs App vs Other (YTD)</h2>
<div class="chartbox">${''}<canvas id="c_platform"></canvas></div>
<div style="margin-top:14px">${tbl([{t:'Platform'},{t:'Spend',r:1},{t:'FTDs',r:1},{t:'Net PLTV',r:1},{t:'LTV:CAC',r:1},{t:'CPA',r:1}], rows)}</div>
<p class="note">"Other" is largely ATL (brand) spend with attribution credited off-platform. App FTDs (iOS/Android/UAC/Apple/Meta App) carry strong PLTV per FTD.</p>`;
}

// ---- S8 ATL ----
panes.s8 = `<h2 class="sec">ATL (brand) spend vs total FTDs</h2>
<div class="kpis">
${kpi('ATL spend YTD', gbpM(atlYTD), `${pct(div(atlYTD,ytd.s))} of total spend`)}
${kpi('Total FTDs YTD', num(ytd.f), 'all channels')}
${kpi('Implied cost / FTD', gbp(atlCostPerFtd), 'ATL spend ÷ total FTDs')}
${kpi('ATL FTDs (direct)', '0', 'brand; no last-click credit')}
</div>
<div class="chartbox" style="margin-top:14px"><canvas id="c_atl"></canvas></div>
<p class="note">ATL has no directly-attributed FTDs (brand awareness). Dividing ATL spend by total FTDs gives an implied brand contribution of ~${gbp(atlCostPerFtd)}/FTD. The £3m H2 ATL uplift will raise this in the back half.</p>`;

// ---- S9 CHANNEL OPTIMISATION ----
{
  const rows = optRows.filter(r=>r.f>0).map(r=>({cells:[ r.ch, gbpK(r.s), num(r.f), gbp(r.cpa), gbpK(r.p), `<span class="pill ${ragLtv(r.ltv)}">${f2(r.ltv)}</span>` ]}));
  const scale = optRows.filter(r=>r.paid && r.f>=50 && r.ltv>=1.2).slice(0,4);
  const cut = optRows.filter(r=>r.paid && r.f>=30 && r.ltv<0.8).slice(0,4);
  panes.s9 = `<h2 class="sec">Channel optimisation — trailing 4 weeks (net LTV:CAC)</h2>
${tbl([{t:'Channel'},{t:'Spend',r:1},{t:'FTDs',r:1},{t:'CPA',r:1},{t:'12m PLTV',r:1},{t:'LTV:CAC',r:1}], rows)}
<div class="rec" style="margin-top:14px"><h3>Reallocation</h3><ol>
<li><b>Scale:</b> ${scale.length? scale.map(r=>`${r.ch} (${f2(r.ltv)})`).join(', ') : 'no paid channel above 1.2 net this window'} — headroom to add budget.</li>
<li><b>Hold/optimise:</b> Affiliate (${f2(optRows.find(r=>r.ch==='Affiliate').ltv)} net) is the biggest spend line near break-even — tighten the worst affiliates rather than cutting the channel.</li>
<li><b>Cut/rework:</b> ${cut.length? cut.map(r=>`${r.ch} (${f2(r.ltv)})`).join(', ') : 'no paid channel below 0.8 net this window'} — verify against time-decay before hard-cutting app placements.</li>
</ol></div>`;
}

// ---- S9b TIME-DECAY ----
{
  const rows = tdChannels.map(ch=>{ const lc=tdLC[ch]||{f:0,p:0}; const td=tdTD[ch]||{f:0,p:0}; return {ch, lcf:lc.f, tdf:td.f, d: lc.f? (td.f-lc.f)/lc.f : 0}; }).filter(r=>r.lcf+r.tdf>50).sort((a,b)=>b.tdf-a.tdf);
  const tr = rows.map(r=>({cells:[ r.ch, num(r.lcf), num(r.tdf), (r.d>=0?'+':'')+pct(r.d) ]}));
  panes.s9b = `<h2 class="sec">Attribution model — time-decay vs last-click (last 4 weeks)</h2>
<div class="callout">Time-decay spreads credit across the path. It pulls FTD credit <b>toward early/assist touchpoints</b> (Direct, iOS/Android Organic) and away from last-click closers (Affiliate, Google UAC, paid app). Spend is identical across models; only credit shifts. Affiliate PLTV is haircut ×0.85 in both models.</div>
<div class="chartbox" style="margin-top:14px"><canvas id="c_td"></canvas></div>
<div style="margin-top:14px">${tbl([{t:'Channel'},{t:'Last-click FTDs',r:1},{t:'Time-decay FTDs',r:1},{t:'Δ',r:1}], tr)}</div>
<p class="note">Sensitivity check: paid app channels (Meta App, Google UAC, Apple Ads) lose FTD credit under time-decay while Direct/Organic gain — confirming much of their last-click conversion is assisted by brand/organic. Don't hard-cut paid app purely on last-click LTV:CAC.</p>`;
}

// ---- S10 AD-GROUPS ----
{
  const head=[{t:'Channel'},{t:'Campaign'},{t:'Ad group'},{t:'Spend',r:1},{t:'FTDs',r:1},{t:'CPA',r:1},{t:'PLTV',r:1},{t:'LTV:CAC',r:1}];
  const mk = a=>({cells:[ a.channel, `<span class="camp">${a.camp||'—'}</span>`, `<span class="camp">${a.ag}</span>`, gbpK(a.s), num(a.f), gbp(a.cpa), gbpK(a.p), `<span class="pill ${ragLtv(a.ltv)}">${f2(a.ltv)}</span>` ]});
  panes.s10 = `<h2 class="sec">Ad-group leaderboard — last 4 weeks (spend ≥ £500, FTDs ≥ 3)</h2>
<h2 class="sec" style="margin-top:8px">Best by LTV:CAC</h2>
${tbl(head, adgBest.map(mk))}
<h2 class="sec">Worst by LTV:CAC</h2>
${tbl(head, adgWorst.map(mk))}
<p class="note">Material paid ad groups only (non-paid channels carry no ad-group spend). Best returns are brand-search and World-Cup UAC ad groups; worst are iOS install/purchase placements.</p>`;
}

// ---- S10b AFFILIATES ----
{
  const vrd=v=>v>=1.2?['Scale','green']:(v>=0.9?['Hold','amber']:['Cut','red']);
  const vpill=v=>{const [t,c]=vrd(v);return `<span class="pill ${c}">${t}</span>`;};
  const rows = affRows.map(a=>({cells:[ affLabel(a.aid), gbpK(a.s), num(a.f), gbp(a.cpa), gbpK(a.p), gbp(div(a.p,a.f)), `<span class="pill ${ragLtv(a.ltv)}">${f2(a.ltv)}</span>`, num(a.apd), a.apd?gbp(div(a.s,a.apd)):'—', pct1(div(a.apd,a.f)), vpill(a.ltv) ]}));
  const affTot = affRows.reduce((x,a)=>({s:x.s+a.s,f:x.f+a.f,p:x.p+a.p,apd:x.apd+a.apd}),{s:0,f:0,p:0,apd:0});
  rows.push({cls:'tot',cells:['Top-20 total', gbpM(affTot.s), num(affTot.f), gbp(div(affTot.s,affTot.f)), gbpM(affTot.p), gbp(div(affTot.p,affTot.f)), `<span class="pill ${ragLtv(div(affTot.p,affTot.s))}">${f2(div(affTot.p,affTot.s))}</span>`, num(affTot.apd), gbp(div(affTot.s,affTot.apd)), pct1(div(affTot.apd,affTot.f)), vpill(div(affTot.p,affTot.s))]});
  // ---- top-10 daily FTD heatmap (trailing 30 days, by FTDs) ----
  let affHeat='';
  const AFT=(D.affTop30||[]).filter(r=>r.date<=ASOF);
  if(AFT.length){
    const MONS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dd=s=>{const p=s.split('-');return{m:+p[1],d:+p[2]};};
    const dates=[...new Set(AFT.map(r=>r.date))].sort();
    const byId={}; AFT.forEach(r=>{const o=byId[r.aid]||(byId[r.aid]={aid:r.aid,cell:{},tot:0});o.cell[r.date]=r.f;o.tot+=r.f;});
    const parts=Object.values(byId).sort((a,b)=>b.tot-a.tot);
    const maxV=Math.max(1,...AFT.map(r=>r.f));
    const dtot=dates.map(d=>parts.reduce((a,p)=>a+(p.cell[d]||0),0));
    const grand=dtot.reduce((a,b)=>a+b,0);
    let pm=null, head='<th class="hnm">Affiliate</th>';
    dates.forEach(d=>{const q=dd(d);const bl=(pm!==null&&pm!==q.m)?'border-left:2px solid var(--muted);':'';pm=q.m;head+=`<th class="hd" style="${bl}">${q.d}</th>`;});
    head+='<th class="hd" style="text-align:right">30d</th>';
    let body='';
    parts.forEach(p=>{ pm=null;
      body+=`<tr><td class="hnm" title="${affName(p.aid)} (${p.aid})">${affName(p.aid)}</td>`;
      dates.forEach(d=>{const v=p.cell[d]||0;const q=dd(d);const bl=(pm!==null&&pm!==q.m)?'border-left:2px solid var(--muted);':'';pm=q.m;const a=v<=0?0:Math.max(0.10,Math.min(1,v/maxV));body+=`<td class="hc" title="${affName(p.aid)} · ${MONS[q.m-1]} ${q.d}: ${v} FTDs" style="background:rgba(10,46,203,${a.toFixed(3)});${bl}"></td>`;});
      body+=`<td class="hd" style="text-align:right;font-weight:800;color:var(--ink)">${num(p.tot)}</td></tr>`;
    });
    pm=null; body+='<tr class="htot"><td class="hnm">All 10 / day</td>';
    dates.forEach((d,i)=>{const q=dd(d);const bl=(pm!==null&&pm!==q.m)?'border-left:2px solid var(--muted);':'';pm=q.m;body+=`<td class="hd" title="${MONS[q.m-1]} ${q.d}: ${dtot[i]}">${dtot[i]}</td>`;});
    body+=`<td class="hd" style="text-align:right;font-weight:800;color:var(--ink)">${num(grand)}</td></tr>`;
    const a0=dd(dates[0]),a1=dd(dates[dates.length-1]);
    affHeat=`<h2 class="sec">Top 10 affiliates — daily FTDs (last ${dates.length} days: ${MONS[a0.m-1]} ${a0.d} – ${MONS[a1.m-1]} ${a1.d})</h2>
<div class="tablewrap"><table class="heat"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
<div class="heatleg"><span>Fewer</span>${[0.10,0.30,0.55,0.80,1.0].map(a=>`<i style="background:rgba(10,46,203,${a})"></i>`).join('')}<span>More</span><span style="margin-left:auto">Hover a cell for date &amp; count · colour scaled 0–${maxV} FTDs/day · rows ranked by 30-day total</span></div>
<p class="note">Top 10 affiliate partners by FTDs over the trailing 30 days (to ${ASOF}), net-of-revshare value shown in the LTV:CAC table below. The final day or two may firm up as the affiliate feed lands (Raventrack lag). Volume ≠ value: the largest-volume partners (${affName('2164')}, ${affName('2630')}, ${affName('2014')}) sit below break-even on net LTV:CAC, while ${affName('2242')} and smaller ${affName('2195')}/${affName('6071')} are the profitable ones.</p>`;
  }
  panes.s10b = affHeat + `<h2 class="sec">Within Affiliate — top 20 by spend (last 4 weeks, actual net of revshare)</h2>
<div class="callout">Per-affiliate KPIs are <b>actual</b> from attribution_spend_metrics with PLTV haircut ×0.85. Profile usernames applied from the affiliate_groups export (matched on Affiliate Profile ID); affiliate_id shown in brackets.${(()=>{const u=affRows.filter(a=>!AFF_NAMES[a.aid]).map(a=>a.aid);return u.length?` Unmapped (not in export): ${u.join(', ')}.`:' All shown affiliates mapped.';})()}</div>
<div style="margin-top:14px">${tbl([{t:'Affiliate (username)'},{t:'Spend',r:1},{t:'FTDs',r:1},{t:'CPA',r:1},{t:'Net PLTV',r:1},{t:'PLTV/FTD',r:1},{t:'LTV:CAC',r:1},{t:'APD2+',r:1},{t:'Cost/APD2+',r:1},{t:'APD2+ %',r:1},{t:'Action'}], rows)}</div>
<p class="note"><b>Action</b> = net LTV:CAC verdict: <span class="pill green">Scale</span> ≥ 1.2 · <span class="pill amber">Hold</span> 0.9–1.2 · <span class="pill red">Cut</span> &lt; 0.9 (renegotiate/cap). Judgement, not automated — weigh contract terms, volume and introducer value before acting.</p>
<p class="note">${affAlerts.length? `Below 0.8 net LTV:CAC at ≥£20k spend: ${affAlerts.map(a=>affName(a.aid)+' ('+f2(a.ltv)+')').join(', ')}.` : 'No affiliate above £20k spend is below 0.8 net LTV:CAC this window.'} The three largest by spend (${affName('2164')}, ${affName('2630')}, ${affName('2014')}) drive the channel — ${affName('2014')} is the weakest of them.</p>`;
  // ---- last-7-days table (same view, fresher window) ----
  const aff7 = (D.aff7||[]).map(a=>({...a, ltv:div(a.p,a.s), cpa:div(a.s,a.f)}));
  if(aff7.length){
    const rows7 = aff7.map(a=>({cells:[ affLabel(a.aid), gbpK(a.s), num(a.f), gbp(a.cpa), gbpK(a.p), gbp(div(a.p,a.f)), `<span class="pill ${ragLtv(a.ltv)}">${f2(a.ltv)}</span>`, num(a.apd), a.apd?gbp(div(a.s,a.apd)):'—', pct1(div(a.apd,a.f)), vpill(a.ltv) ]}));
    const a7t = aff7.reduce((x,a)=>({s:x.s+a.s,f:x.f+a.f,p:x.p+a.p,apd:x.apd+a.apd}),{s:0,f:0,p:0,apd:0});
    rows7.push({cls:'tot',cells:['Top-20 total', gbpK(a7t.s), num(a7t.f), gbp(div(a7t.s,a7t.f)), gbpK(a7t.p), gbp(div(a7t.p,a7t.f)), `<span class="pill ${ragLtv(div(a7t.p,a7t.s))}">${f2(div(a7t.p,a7t.s))}</span>`, num(a7t.apd), gbp(div(a7t.s,a7t.apd)), pct1(div(a7t.apd,a7t.f)), vpill(div(a7t.p,a7t.s))]});
    panes.s10b += `<h2 class="sec">Within Affiliate — top 20 by spend (last 7 days to ${ASOF}, actual net of revshare)</h2>
<div class="callout">Same view as above but the trailing <b>7 days</b> only — a fresher read that reacts faster to recent spend/quality shifts (and is noisier than the 4-week window). The latest day or two may firm up as the affiliate feed lands (Raventrack lag); recent PLTV/FTD is the least-matured and revises up.</div>
<div style="margin-top:14px">${tbl([{t:'Affiliate (username)'},{t:'Spend',r:1},{t:'FTDs',r:1},{t:'CPA',r:1},{t:'Net PLTV',r:1},{t:'PLTV/FTD',r:1},{t:'LTV:CAC',r:1},{t:'APD2+',r:1},{t:'Cost/APD2+',r:1},{t:'APD2+ %',r:1},{t:'Action'}], rows7)}</div>
<p class="note"><b>Action</b> = net LTV:CAC verdict: <span class="pill green">Scale</span> ≥ 1.2 · <span class="pill amber">Hold</span> 0.9–1.2 · <span class="pill red">Cut</span> &lt; 0.9. Treat 7-day verdicts as directional — small samples swing week to week; confirm against the 4-week view before acting.</p>`;
  }
  // ---- MoM section ----
  const momR = AFF_MOM.map(m=>({cells:[
    affLabel(m.aid),
    gbpK(m.may_s), gbpK(m.jun_s), (m.dS>=0?'+':'')+gbpK(m.dS),
    num(m.may_f), num(m.jun_f),
    gbpK(m.may_p), gbpK(m.jun_p), (m.dP>=0?'+':'')+gbpK(m.dP),
    `${m.may_s?f2(m.mayL):'—'}→${m.jun_s?f2(m.junL):'—'}`
  ]}));
  const affMomLtvMay=div(affMayTot.p,affMayTot.s), affMomLtvJun=div(affJunTot.p,affJunTot.s);
  panes.s10b += `<h2 class="sec">Affiliate month-on-month — May vs June (matched 1–${MD}, net)</h2>
<div class="kpis">
${kpi('Net PLTV MoM', (div(affJunTot.p,affMayTot.p)-1>=0?'+':'')+pct1(div(affJunTot.p,affMayTot.p)-1), `May ${gbpM(affMayTot.p)} → Jun ${gbpM(affJunTot.p)}`)}
${kpi('FTDs MoM', (div(affJunTot.f,affMayTot.f)-1>=0?'+':'')+pct1(div(affJunTot.f,affMayTot.f)-1), `May ${num(affMayTot.f)} → Jun ${num(affJunTot.f)}`)}
${kpi('Spend MoM', (div(affJunTot.s,affMayTot.s)-1>=0?'+':'')+pct1(div(affJunTot.s,affMayTot.s)-1), `May ${gbpM(affMayTot.s)} → Jun ${gbpM(affJunTot.s)}`)}
${kpi('Net LTV:CAC', `${f2(affMomLtvMay)}→${f2(affMomLtvJun)}`, 'channel blended, net')}
</div>
<div class="chartbox" style="margin-top:14px"><canvas id="affMom"></canvas></div>
<div style="margin-top:14px">${tbl([{t:'Affiliate (username)'},{t:'May spend',r:1},{t:'Jun spend',r:1},{t:'Δ spend',r:1},{t:'May FTDs',r:1},{t:'Jun FTDs',r:1},{t:'May PLTV',r:1},{t:'Jun PLTV',r:1},{t:'Δ PLTV',r:1},{t:'LTV:CAC',r:1}], momR)}</div>
<p class="note">Matched 1–${MD} window so it is like-for-like with ${MO_CUR}. Net of the 15% revshare. ${MO_CUR} spend is marginally understated by the ${GAPLBL} affiliate-feed lag (£0 posted, back-fills). Biggest swings: ${affName('2014')} scaled up (+${gbpK(AFF_MOM.find(m=>m.aid==='2014').dS)} spend) while ${affName('2990')} pulled back sharply (${gbpK(AFF_MOM.find(m=>m.aid==='2990').dS)} spend, ${gbpK(AFF_MOM.find(m=>m.aid==='2990').dP)} PLTV); ${affName('6071')} and ${affName('2053')} are new this month.</p>`;
}

// ---- S11 PER-CHANNEL ----
{
  const opts = Object.keys(trendCh).sort((a,b)=>apdYTD[b].f-apdYTD[a].f).map(ch=>`<option value="${ch}">${ch}</option>`).join('');
  panes.s11 = `<h2 class="sec">Per-channel trends (monthly, Jan–Jun · June = partial MTD)</h2>
<div class="selrow"><select id="chanSel">${opts}</select></div>
<div class="grid2" style="margin-top:8px">${chartbox('c_pc_sf')}${chartbox('c_pc_cl')}</div>
<p class="note">${MO_CUR} is ${!RMcomplete?`a partial month (1–${MD}); the final point will rise to a full-month total`:`complete`}. Granularity is monthly for stability across all 25 channels.</p>`;
}

// ---- S12 WEEKLY TRENDS ----
// weekly FTDs by channel (stacked bars) — top 8 channels + Other
let wkChNote='';
(function(){
  const rows=D.wkCh||[]; if(!rows.length) return;
  const weeks=[...new Set(rows.map(r=>r.wk))].sort();
  const tot={}; rows.forEach(r=>tot[r.channel]=(tot[r.channel]||0)+r.f);
  const ranked=Object.keys(tot).sort((a,b)=>tot[b]-tot[a]);
  const top=ranked.slice(0,8), topSet=new Set(top);
  const pal=['#0A2ECB','#00B2FF','#1c8f53','#FF63F6','#FFDF00','#0B2595','#42D486','#7a86c9'];
  const idx={}; weeks.forEach((w,i)=>idx[w]=i);
  const series=top.map((ch,i)=>({label:ch,color:pal[i],data:weeks.map(()=>0)}));
  const byCh={}; series.forEach(s=>byCh[s.label]=s);
  const other={label:'Other',color:'#9aa3bf',data:weeks.map(()=>0)};
  let hasOther=false;
  rows.forEach(r=>{ if(topSet.has(r.channel)){byCh[r.channel].data[idx[r.wk]]+=r.f;} else {other.data[idx[r.wk]]+=r.f;hasOther=true;} });
  EMBED.wkChFtd={weeks:weeks.map(w=>w.slice(5)), series:[...series,...(hasOther?[other]:[])]};
  // per-channel small multiples — ALL channels with any FTDs, ranked by total
  const pal2=['#0A2ECB','#00B2FF','#1c8f53','#FF63F6','#FFDF00','#0B2595','#42D486','#7a86c9','#9aa3bf','#c9d0ee','#46527f','#7a5cd0','#d98ce0','#3aa0a0','#e0a500','#c01262','#6e7bd6','#00857a'];
  const totS={}; rows.forEach(r=>totS[r.channel]=(totS[r.channel]||0)+(r.s||0));
  const sepChs=[...new Set(rows.map(r=>r.channel))].filter(ch=>(tot[ch]||0)>0||(totS[ch]||0)>0).sort((a,b)=>(tot[b]||0)-(tot[a]||0));
  const sep=sepChs.map((ch,i)=>{ const data=weeks.map(()=>0), sdata=weeks.map(()=>0), pdata=weeks.map(()=>0); rows.forEach(r=>{ if(r.channel===ch){ data[idx[r.wk]]+=r.f; sdata[idx[r.wk]]+=(r.s||0); pdata[idx[r.wk]]+=(r.p||0); } }); const ldata=weeks.map((_,k)=>sdata[k]>0?+(pdata[k]/sdata[k]).toFixed(2):null); return {ch,color:pal2[i%pal2.length],data,sdata,ldata}; });
  EMBED.wkChSep={weeks:weeks.map(w=>w.slice(5)), channels:sep};
  // grouped weekly reviews (combined member channels)
  const GRP=[
    {name:'iOS — iOS Organic + Apple Ads Brand + Generics', ch:['iOS Organic','Apple Ads Brand','Apple Ads Non Brand']},
    {name:'Android — Meta App + Android Organic + Google UAC', ch:['Meta App','Android Organic','Google UAC']},
    {name:'Brand Search — PPC Brand + Organic Search', ch:['PPC Brand','Organic Search']}
  ];
  const groups=GRP.map(g=>{ const f=weeks.map(()=>0),s=weeks.map(()=>0),p=weeks.map(()=>0); rows.forEach(r=>{ if(g.ch.indexOf(r.channel)>=0){ f[idx[r.wk]]+=r.f; s[idx[r.wk]]+=(r.s||0); p[idx[r.wk]]+=(r.p||0); } }); const ltv=weeks.map((_,k)=>s[k]>0?+(p[k]/s[k]).toFixed(2):null); return {name:g.name, f:f.map(r0), s:s.map(r0), p:p.map(r0), ltv}; });
  EMBED.wkGroups={weeks:weeks.map(w=>w.slice(5)), groups};
  const d0=weeks[0].slice(5), d1=weeks[weeks.length-1].slice(5);
  wkChNote=`Weekly FTDs by channel, ${weeks.length} complete ISO weeks (w/c ${d0} – ${d1}). Top 8 channels by total FTDs shown; the rest grouped as Other. Stacked bar height = total weekly FTDs.`;
})();
panes.s12 = `<h2 class="sec">Six-month weekly trends (last 26 complete ISO weeks)</h2>
<div class="grid2">${chartbox('c_wk_sf')}${chartbox('c_wk_cl')}</div>
<h2 class="sec">Weekly PLTV per FTD — 6-month trend (net of affiliate revshare)</h2>
${chartbox('c_wk_ppf')}
<p class="note">Value-per-FTD is broadly stable across the half-year (dashed line = 26-week average ${gbp(last26.reduce((a,w)=>a+w.ppf,0)/last26.length)}), so weekly FTD volume — not per-player value — drives PLTV. Plan FTD line dashed on the FTD chart.</p>
${EMBED.wkChFtd?`<h2 class="sec">Weekly FTDs by channel</h2>${chartbox('c_wk_ch')}<p class="note">${wkChNote}</p>`:''}
${EMBED.wkGroups?`<h2 class="sec">Grouped weekly reviews — iOS · Android · Brand Search</h2><div class="gridch">${EMBED.wkGroups.groups.map((g,i)=>`<div class="chartbox"><canvas id="c_grp_${i}"></canvas></div>`).join('')}</div><p class="note">Combined weekly view per group. <b>Bars = FTDs</b> (left); <b>solid line = spend £</b>; <b>dashed green = net LTV:CAC</b> (right axes). Members — <b>iOS</b>: iOS Organic + Apple Ads Brand + Apple Ads Non Brand (generics); <b>Android</b>: Meta App + Android Organic + Google UAC; <b>Brand Search</b>: PPC Brand + Organic Search. LTV:CAC = combined net PLTV ÷ combined spend (blank weeks = no spend).</p>`:''}
${EMBED.wkChSep?`<h2 class="sec">Weekly spend vs FTDs — separate chart per channel (all channels)</h2><div class="gridch">${EMBED.wkChSep.channels.map((c,i)=>`<div class="chartbox"><canvas id="c_wkc_${i}"></canvas></div>`).join('')}</div><p class="note">One chart per channel (all ${EMBED.wkChSep.channels.length}), ordered by FTD volume; same ${EMBED.wkChSep.weeks.length}-week window. <b>Bars = FTDs</b> (left); <b>solid line = spend £</b>; <b>dashed green = net LTV:CAC</b> (right axes). Each chart auto-scales its own axes, so read shape/trend per channel; LTV:CAC is blank where there is no spend (organic), and ATL shows spend with no attributed FTDs.</p>`:''}`;

// ====================================================================
// Assemble HTML
// ====================================================================
// ---- SINC INCREMENTAL CPA ----
if(INCR){
  const accr = INCR.filter(r=>r.margLTV>=1).sort((a,b)=>a.margCPA-b.margCPA);
  const best = accr.length? accr[0] : INCR[0];
  const conf = r=> r.r2>=0.6?'good':(r.r2>=0.35?'fair':'low');
  const vrd = r=> r.margLTV>=1?['SCALE','green']:(r.margLTV>=0.85?['HOLD','amber']:['PULL BACK','red']);
  const irows = INCR.map(r=>{const [vt,vc]=vrd(r); return {cells:[
    r.ch, gbpK(r.s), gbp(r.avgCPA), `<span class="pill ${ragLtv(r.avgLTV)}">${f2(r.avgLTV)}</span>`,
    `${r.b.toFixed(2)} <span class="note">(${conf(r)})</span>`, gbp(r.margCPA),
    `<span class="pill ${r.margLTV>=1?'green':r.margLTV>=0.85?'amber':'red'}">${f2(r.margLTV)}</span>`,
    `<span class="pill ${vc}">${vt}</span>` ]};});
  panes.sinc = `<h2 class="sec">Incremental CPA — where the next £ works hardest</h2>
<div class="callout"><b>The question this answers:</b> not "which channel is most efficient on average" but "where does the <b>next</b> pound of spend do the most good". Average LTV:CAC flatters saturated channels; what matters for scaling is the <b>marginal</b> return. Method: for each paid channel we fit a spend→FTD response curve on the last 12 weeks (log-log elasticity <b>b</b>, capped at 1.0 under a diminishing-returns assumption), then <b>marginal CPA = average CPA ÷ b</b> and <b>marginal LTV:CAC = b × average LTV:CAC</b> (the net PLTV the next £ buys). Break-even at the margin = <b>1.0</b>.</div>
<div class="kpis" style="margin-top:14px">
${kpi('Next best £', best.ch, `marginal LTV:CAC ${f2(best.margLTV)} · fit ${conf(best)}`)}
${kpi('Marginal CPA there', gbp(best.margCPA), `vs avg CPA ${gbp(best.avgCPA)}`)}
${kpi('Accretive at the margin', `${accr.length} of ${INCR.length}`, 'channels with marginal LTV:CAC ≥ 1.0')}
${kpi('Most saturated', INCR.slice().sort((a,b)=>a.b-b.b)[0].ch, `elasticity ${INCR.slice().sort((a,b)=>a.b-b.b)[0].b.toFixed(2)} — next £ mostly wasted`)}
</div>
${chartbox('c_incr')}
<div style="margin-top:14px">${tbl([{t:'Channel'},{t:'Wk spend',r:1},{t:'Avg CPA',r:1},{t:'Avg LTV:CAC',r:1},{t:'Elasticity b',r:1},{t:'Marginal CPA',r:1},{t:'Marginal LTV:CAC',r:1},{t:'Verdict'}], irows)}</div>
<div class="callout"><b>Read of the moment:</b> ${accr.length? `the only channel still clearly value-accretive at the margin is <b>${best.ch}</b> (next £ → ${f2(best.margLTV)} net, marginal CPA ${gbp(best.margCPA)}) — it looks only mid-pack on <em>average</em> LTV:CAC but is far from saturated, so it should get the next increment of budget.` : `no paid channel is value-accretive at the margin right now`} High-average channels like <b>Apple Ads Brand</b> are deceptive: strong average LTV:CAC but a low elasticity means they are near saturation, so extra spend there returns well under £1. When every channel's marginal return sits below ~1, the better lever is <b>CRO / creative / offer</b> (shift the curve up) rather than more media budget.</div>
${ATLX?`<h3 class="subsec">ATL — brand spend vs total FTDs</h3>
<div class="callout"><b>Why ATL isn't in the table above:</b> ATL carries <b>0 last-click FTDs</b>, so it has no attributed spend-response curve. Its real job is to lift <em>total</em> acquisition (more Direct / Organic / Brand-search FTDs), so the fair lens is <b>ATL spend ÷ total FTDs</b>. But there's a hard limit: weekly ATL spend is effectively <b>flat</b> (~${gbpK(ATLX.atlAvg)}/wk, coefficient of variation just <b>${pct(ATLX.cov)}</b>), so there is <b>no variation to estimate an incremental effect from</b> — a marginal CPA for ATL is <b>not identifiable</b> from this data (any short-run correlation is noise, and comes out spuriously negative). The most we can say is the fully-loaded overhead it adds per FTD.</div>
<div class="kpis" style="margin-top:8px">
${kpi('ATL spend / wk', gbpK(ATLX.atlAvg), `${pct(ATLX.atlShare)} of total spend`)}
${kpi('ATL cost per total FTD', gbp(ATLX.costPerFtd), 'fixed overhead ÷ all FTDs')}
${kpi('Blended CPA incl. ATL', gbp(ATLX.blendedCPA), `vs ${gbp(ATLX.exAtlCPA)} excl. ATL`)}
${kpi('Spend variation', pct(ATLX.cov), 'too flat to fit a response curve')}
</div>
${chartbox('c_atlinc')}
<p class="note">Both series indexed to week 1 = 100: the <b>ATL line stays flat</b> while <b>total FTDs move independently</b> — visually, there's no co-movement to attribute to ATL. To actually measure ATL's incremental value you need <b>deliberate spend variation</b> (flight it up/down), a <b>geo/holdout test</b>, or a <b>media-mix model</b> that controls for the other channels, seasonality and events. Until then, treat ATL as a fixed brand investment, not a channel you can marginally optimise.</p>`:''}
<p class="note"><b>Caveats — treat as directional, not causal.</b> Elasticities are fitted on 12 weeks of observational weekly data, so they conflate seasonality, day-of-week mix, World-Cup/heatwave effects and model re-scoring; they are not a controlled spend-lift test. Fit confidence (R²) is shown per channel — <b>low</b>-confidence rows (e.g. thin spend variation) should be treated as indicative only. Elasticity is capped at 1.0 (diminishing returns assumed) so channels that appear to show increasing returns aren't over-recommended. Validate with a proper geo/holdout test before large reallocations. PLTV is the net 12-month model figure (Affiliate net of the 15% revshare).</p>`;
}

// ---- REC RECOMMENDATIONS ----
{
  const scale = optRows.filter(r=>PAID.has(r.ch)&&r.ltv>=1.2&&r.f>=20).sort((a,b)=>b.ltv-a.ltv);
  const fix = optRows.filter(r=>PAID.has(r.ch)&&r.ch!=='ATL'&&r.f>0&&r.ltv<0.8&&r.s>=5000).sort((a,b)=>b.s-a.s);
  const watch = optRows.filter(r=>PAID.has(r.ch)&&r.ch!=='ATL'&&r.f>0&&r.ltv>=0.8&&r.ltv<1.0&&r.s>=5000).sort((a,b)=>a.ltv-b.ltv);
  const affCut = affAlerts.slice().sort((a,b)=>a.ltv-b.ltv);
  const affGrow = affRows.filter(a=>a.ltv>=1.2&&a.s>=8000).sort((x,y)=>y.ltv-x.ltv).slice(0,5);
  const q = FTDQCH?FTDQCH.t4:[];
  const qBest = [...q].sort((a,b)=>b.apd2R-a.apd2R).slice(0,3);
  const qWorst = [...q].filter(r=>r.ftd>=150).sort((a,b)=>a.apd2R-b.apd2R).slice(0,3);
  const qVal = [...q].sort((a,b)=>b.ppf-a.ppf).slice(0,3);
  const lastPpf = FTDQ.length?FTDQ[FTDQ.length-1].ppf:0;
  const recCard=(n,pri,pcol,title,body)=>`<div class="rec"><div style="display:flex;align-items:center;gap:8px"><b>${n}. ${title}</b><span class="pill ${pcol}">${pri}</span></div><div style="margin-top:6px">${body}</div></div>`;
  panes.rec = `<h2 class="sec">Recommendations — data-driven (${MO_CUR} / last-4-week view)</h2>
<div class="callout">Generated from the live dashboard: last-4-week channel LTV:CAC, FTD-quality (APD2+ retention, PLTV/FTD), affiliate economics and the heatwave forecast. Net of the 15% affiliate revshare. Ordered by expected impact — revisit each refresh as figures move.</div>
${recCard(1,'biggest lever','green','Rebalance affiliate spend — cut the underwater whales, grow the profitable tail',
  `Affiliate blends to <b>~${f2(div(affRows.reduce((a,x)=>a+x.p,0),affRows.reduce((a,x)=>a+x.s,0)))} net</b> and ~two-thirds of spend sits below break-even. Renegotiate/cap the sub-0.8 partners at ≥£20k${affCut.length?': <b>'+affCut.slice(0,5).map(a=>affName(a.aid)+' '+f2(a.ltv)).join(', ')+'</b>':''}. Redirect toward the profitable tail${affGrow.length?': <b>'+affGrow.map(a=>affName(a.aid)+' '+f2(a.ltv)).join(', ')+'</b>':''} and the high-volume workhorse digadvfree. Compete on dependability + relationships, not blanket CPA increases — hold blended payback at ~12 months.`)}
${recCard(2,'scale','green','Add budget to the paid winners with headroom',
  scale.length?`<b>${scale.map(r=>r.ch+' '+f2(r.ltv)).join(', ')}</b> all clear 1.2+ net LTV:CAC — the clearest scale-up candidates. Apple Ads Brand's evening daypart and Google UAC's bingo/World-Cup ad groups have shown the most headroom.`:`No paid channel is currently ≥1.2 net at scale — hold and optimise before pushing spend.`)}
${recCard(3,'fix','red','Tighten or rework the sub-break-even paid channels before scaling',
  `${fix.length?'<b>'+fix.map(r=>r.ch+' '+f2(r.ltv)).join(', ')+'</b> sit below break-even on ≥£5k spend — cap CPAs / rework placements (Meta iOS install-vs-purchase, weakest affiliate deals) rather than adding budget.':'No material paid channel is below 0.8 net this window.'} ${watch.length?'Watch: <b>'+watch.map(r=>r.ch+' '+f2(r.ltv)).join(', ')+'</b> (0.8–1.0).':''}`)}
${recCard(4,'protect value','amber','Defend the value line — skew acquisition to high-PLTV, high-retention channels',
  `PLTV/FTD has eased to ~<b>${gbp(lastPpf)}</b>/wk (value-mix + heat, plus cohort maturation). Weight growth toward the highest value-per-FTD channels${qVal.length?' — <b>'+qVal.map(r=>r.ch+' '+gbp(r.ppf)).join(', ')+'</b>':''} and lift day-2 activation (welcome-offer/CRM) on the lower-retention lines to protect blended value.`)}
${recCard(5,'quality','amber','Lean into the highest-retention channels; investigate the laggards',
  `First-week APD2+ retention is strongest on${qBest.length?' <b>'+qBest.map(r=>r.ch+' '+r0(r.apd2R)+'%</b>').join(', '):''} and weakest on${qWorst.length?' <b>'+qWorst.map(r=>r.ch+' '+r0(r.apd2R)+'%</b>').join(', '):''}. Dig into why the low-retention channels (bonus-seeking, onboarding friction, offer mismatch) convert so few FTDs into 2+-day actives, and rework the offer/journey there.`)}
${wxFc?recCard(6,'this week','amber','Manage the forecast heatwave',
  `The heatwave is forecast to cut FTDs <b>~${pct1(wxFc.pct)}</b> this week (~<b>${num(wxFc.short)} fewer</b>). Shift budget to evening/in-play windows, lean on app/retargeting audiences that are less heat-sensitive, avoid front-loading peak-day spend, and expect a rebound as the spell breaks. Value per FTD should hold, so don't over-react on CPA.`):''}
${recCard(7,'enable','grey','Fix measurement &amp; invest in CRO over higher CPAs',
  `Given the affiliate economics, <b>CRO is a better use of marginal budget than higher CPAs</b> — it lifts every channel at zero media cost (Amplitude, heatmapping, welcome-offer testing). Fix <b>Affiliate App</b> tagging (it collapses into Affiliate, so we can't size it). Adopt <b>first-click as an analytical lens</b> to value introducer affiliates while keeping last-click for payouts.`)}
<p class="note">Recommendations are heuristic prompts from the data, not automated decisions — validate against contract terms, seasonality and RG/compliance before acting. LTV:CAC uses the 12-month net PLTV model; recent cohorts revise up as they mature.</p>`;
}

// ---------- FTD QUALITY FUNNEL (regs -> SEON/dup-auto; FTDs -> PBA/UFI/dup-manual/APD2+/PP/Qore) ----------
if(D.funnel){
  const FN=D.funnel; const pcf=(a,b)=>b?a/b*100:0;
  const moR=FN.mo.map(r=>({...r,pbaP:pcf(r.pba,r.ftds),apdP:pcf(r.apd2,r.ftds),ppP:pcf(r.pp8,r.ftds),a0P:r.apd0!=null?pcf(r.apd0,r.ftds):null,seonP:pcf(r.seon,r.regs),dupaP:pcf(r.dupa,r.regs),ufiP:pcf(r.ufi,r.ftds),dupmP:pcf(r.dupm,r.ftds),qP:r.qore!=null?pcf(r.qore,r.ftds):null}));
  const wkR=FN.wk.map(r=>({...r,pbaP:pcf(r.pba,r.ftds),apdP:pcf(r.apd2,r.ftds),ppP:pcf(r.pp8,r.ftds),seonP:pcf(r.seon,r.regs),dupaP:pcf(r.dupa,r.regs),ufiP:pcf(r.ufi,r.ftds)}));
  const chR=FN.ch.map(r=>({...r,pbaP:pcf(r.pba,r.f),ppP:pcf(r.pp8,r.f),apdP:pcf(r.apd2,r.fm),a0P:r.apd0f?pcf(r.apd0,r.apd0f):null,seonP:r.regs?pcf(r.seon,r.regs):null,dupaP:r.regs?pcf(r.dupa,r.regs):null,ufiP:pcf(r.ufi,r.f),dupmP:pcf(r.dupm,r.f)})).sort((a,b)=>b.f-a.f);
  const fyt=FN.mo.reduce((a,r)=>({ftds:a.ftds+r.ftds,pba:a.pba+(r.pba||0),apd2:a.apd2+r.apd2,pp8:a.pp8+r.pp8,regs:a.regs+r.regs,seon:a.seon+r.seon,dupa:a.dupa+r.dupa,ufi:a.ufi+r.ufi,cfr:a.cfr+r.cfr,dupm:a.dupm+r.dupm,apd0:a.apd0+(r.apd0||0),a0f:a.a0f+(r.apd0!=null?r.ftds:0)}),{ftds:0,pba:0,apd2:0,pp8:0,regs:0,seon:0,dupa:0,ufi:0,cfr:0,dupm:0,apd0:0,a0f:0});
  const qMo=moR.filter(r=>r.qore!=null); const qFtds=qMo.reduce((a,r)=>a+r.ftds,0); const qTot=qMo.reduce((a,r)=>a+r.qore,0);
  const pbaB=pcf(fyt.pba,fyt.ftds), ppB=pcf(fyt.pp8,fyt.ftds), apdB=pcf(fyt.apd2,fyt.ftds), qB=pcf(qTot,qFtds);
  const seonB=pcf(fyt.seon,fyt.regs), dupaB=pcf(fyt.dupa,fyt.regs), ufiB=pcf(fyt.ufi,fyt.ftds), dupmB=pcf(fyt.dupm,fyt.ftds), a0B=pcf(fyt.apd0,fyt.a0f);
  const wkC=wkR.slice(0,-1), lastW=wkC[wkC.length-1];
  const medi=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
  const pbaMedW=medi(wkC.map(r=>r.pbaP));
  const flags=[];
  // SEON registration-fraud wave (monthly vs YTD baseline, with containment check)
  const seonPeak=wkC.reduce((a,r)=>r.seonP>a.seonP?r:a,wkC[0]);
  moR.forEach(r=>{ if(r.qore!=null && r.seonP>1.5*seonB) flags.push({s:'red',t:`<b>${r.m} registration-fraud wave:</b> SEON closed ${num(r.seon)} accounts at registration (${r.seonP.toFixed(1)}% of regs vs ${seonB.toFixed(1)}% YTD). Weekly peak ${seonPeak.seonP.toFixed(1)}% w/c ${seonPeak.w}${lastW.seonP<1.2*medi(wkC.slice(0,20).map(x=>x.seonP))?` — wave appears contained (w/c ${lastW.w} back to ${lastW.seonP.toFixed(1)}%)`:''}.`}); });
  chR.filter(r=>r.regs>=2000).forEach(r=>{ if(r.seonP>2*seonB) flags.push({s:'red',t:`<b>${r.ch}:</b> SEON registration-fraud rate ${r.seonP.toFixed(1)}% — ${(r.seonP/seonB).toFixed(1)}× the blended ${seonB.toFixed(1)}% (${num(r.seon)} of ${num(r.regs)} regs).`}); });
  // UFI trend (post-deposit withdrawal-hold investigations)
  const u4=wkC.slice(-4), u8=wkC.slice(-12,-4);
  const u4P=pcf(u4.reduce((a,r)=>a+r.ufi,0),u4.reduce((a,r)=>a+r.ftds,0));
  const u8P=pcf(u8.reduce((a,r)=>a+r.ufi,0),u8.reduce((a,r)=>a+r.ftds,0));
  if(u8P>0 && u4P>=2*u8P) flags.push({s:'red',t:`<b>Under-fraud-investigation surge:</b> ${u4P.toFixed(1)}% of FTDs in the last 4 complete weeks vs ${u8P.toFixed(1)}% in the prior 8 (${(u4P/u8P).toFixed(1)}×) — high-risk accounts with docs requested before withdrawal.`});
  else if(u8P>0 && u4P>=1.5*u8P) flags.push({s:'amber',t:`<b>Under-fraud-investigation rising:</b> ${u4P.toFixed(1)}% of FTDs (last 4 complete wks) vs ${u8P.toFixed(1)}% (prior 8).`});
  chR.filter(r=>r.f>=1000).forEach(r=>{ if(r.ufiP>2*ufiB && r.ufi>=20) flags.push({s:'red',t:`<b>${r.ch}:</b> ${r.ufiP.toFixed(1)}% of FTDs under fraud investigation — ${(r.ufiP/ufiB).toFixed(1)}× the blended ${ufiB.toFixed(1)}% (${num(r.ufi)} accounts).`}); });
  // duplicates
  moR.forEach(r=>{ if(r.qore!=null && r.dupaP>dupaB+3) flags.push({s:'amber',t:`<b>${r.m} duplicate blocks:</b> auto-blocked duplicates ${r.dupaP.toFixed(1)}% of regs vs ${dupaB.toFixed(1)}% YTD.`}); });
  chR.filter(r=>r.regs>=2000).forEach(r=>{ if(r.dupaP>dupaB+5) flags.push({s:'amber',t:`<b>${r.ch}:</b> duplicate auto-block rate ${r.dupaP.toFixed(1)}% of regs vs blended ${dupaB.toFixed(1)}% — multi-accounting pressure at registration.`}); });
  chR.filter(r=>r.f>=1000).forEach(r=>{ if(r.dupmP>2*dupmB && r.dupm>=20) flags.push({s:'amber',t:`<b>${r.ch}:</b> manual duplicate blocks ${r.dupmP.toFixed(2)}% of FTDs vs blended ${dupmB.toFixed(2)}% (incl. Gamstop/SE breaches).`}); });
  // PBA (freeloaders)
  const pFirst=moR.find(r=>r.pba!=null), pLast=[...moR].reverse().find(r=>r.pba!=null);
  if(pFirst&&pLast&&pLast.pbaP-pFirst.pbaP>=3) flags.push({s:'amber',t:`<b>First-week PBA climbing:</b> ${pFirst.pbaP.toFixed(1)}% of FTDs in ${pFirst.m} → ${pLast.pbaP.toFixed(1)}% in ${pLast.m} (official ThoughtSpot series) — freeloader share rising.`});
  chR.filter(r=>r.f>=1000).forEach(r=>{
    if(r.a0P!=null && r.a0P>1.5*a0B) flags.push({s:'amber',t:`<b>${r.ch}:</b> APD0 (no paid playing day) rate ${r.a0P.toFixed(1)}% of Jan–May FTDs vs blended ${a0B.toFixed(1)}% — freeloader-heavy acquisition.`});
    if(r.ppP<ppB*0.75) flags.push({s:'amber',t:`<b>${r.ch}:</b> PP 8–10 share ${r.ppP.toFixed(1)}% vs blended ${ppB.toFixed(1)}% on ${num(r.f)} FTDs — high volume, low predicted quality.`});
    if(r.apdP && r.apdP<apdB*0.75) flags.push({s:'amber',t:`<b>${r.ch}:</b> APD2+ conversion ${r.apdP.toFixed(1)}% vs blended ${apdB.toFixed(1)}% — weak day-2 activation.`});
  });
  if(lastW.ppP<ppB*0.85) flags.push({s:'amber',t:`<b>PP softening:</b> w/c ${lastW.w} PP 8–10 share ${lastW.ppP.toFixed(1)}% vs YTD ${ppB.toFixed(1)}% (young cohorts still re-score — recheck next week).`});
  if(lastW.apdP<apdB*0.9) flags.push({s:'amber',t:`<b>APD2+ dip:</b> w/c ${lastW.w} at ${lastW.apdP.toFixed(1)}% vs YTD ${apdB.toFixed(1)}% (~2-day APD lag applies).`});
  if(qMo.length>=2){ const a=qMo[qMo.length-1], b2=qMo[qMo.length-2]; if(a.qP<b2.qP-1.5) flags.push({s:'amber',t:`<b>Qore conversion dip:</b> ${a.m} ${a.qP.toFixed(1)}% of FTDs vs ${b2.m} ${b2.qP.toFixed(1)}%.`}); }
  if(!flags.length) flags.push({s:'green',t:'No FTD-quality flags in the current window.'});
  flags.sort((a,b)=>(a.s==='red'?0:a.s==='amber'?1:2)-(b.s==='red'?0:b.s==='amber'?1:2));
  const regRows=moR.map(r=>({cells:[r.m, num(r.regs), num(r.seon), `<span class="pill ${r.seonP>1.5*seonB?'red':r.seonP>1.2*seonB?'amber':'green'}">${r.seonP.toFixed(1)}%</span>`, num(r.dupa), r.dupaP.toFixed(1)+'%']}));
  regRows.push({cls:'tot',cells:['YTD', num(fyt.regs), num(fyt.seon), pct1(seonB/100), num(fyt.dupa), pct1(dupaB/100)]});
  const moRows=moR.map((r,i)=>({cells:[r.m, num(r.ftds), r.pba!=null?num(r.pba):'—', r.pba!=null?`<span class="pill ${r.pbaP>=14?'red':r.pbaP>=12.5?'amber':'green'}">${r.pbaP.toFixed(1)}%</span>`:'—', num(r.apd2), pct1(r.apdP/100), num(r.pp8), pct1(r.ppP/100), r.qore!=null?num(r.qore):'—', r.qP!=null?pct1(r.qP/100):'—', gbp(div(moTot[i+1].p, r.ftds))]}));
  moRows.push({cls:'tot',cells:['YTD', num(fyt.ftds), num(fyt.pba), pct1(pbaB/100), num(fyt.apd2), pct1(apdB/100), num(fyt.pp8), pct1(ppB/100), num(qTot)+' (Jan–Jun)', pct1(qB/100), gbp(div(ytd.p,ytd.f))]});
  const a0L2=moR.filter(r=>r.apd0!=null).slice(-2);
  const a0Rate=div(a0L2.reduce((a,r)=>a+r.apd0,0), a0L2.reduce((a,r)=>a+r.ftds,0));
  const clRows=moR.map((r,i)=>{ const est=r.apd0==null; const a0=est?Math.round(r.ftds*a0Rate):r.apd0; const pv=r.pba||0; const clean=r.ftds-pv-a0; const p=moTot[i+1].p; return {cells:[r.m+(est?' ~':''), num(r.ftds), r.pba!=null?num(r.pba):'—', (est?'~':'')+num(a0), num(clean), pct1(clean/r.ftds), gbpK(p), gbp(div(p,r.ftds)), `<b>${gbp(div(p,clean))}</b>`]}; });
  const clTot=moR.reduce((a,r,i)=>{ const a0=r.apd0!=null?r.apd0:Math.round(r.ftds*a0Rate); a.f+=r.ftds; a.pba+=(r.pba||0); a.a0+=a0; a.clean+=r.ftds-(r.pba||0)-a0; a.p+=moTot[i+1].p; return a; },{f:0,pba:0,a0:0,clean:0,p:0});
  clRows.push({cls:'tot',cells:['YTD', num(clTot.f), num(clTot.pba), num(clTot.a0)+' (incl. est)', num(clTot.clean), pct1(clTot.clean/clTot.f), gbpM(clTot.p), gbp(div(clTot.p,clTot.f)), `<b>${gbp(div(clTot.p,clTot.clean))}</b>`]});
  const wkP={}; D.daily.forEach(dd=>{ if(dd.date<'2026-01-01') return; const dt=new Date(dd.date+'T00:00:00Z'); const mon=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()-((dt.getUTCDay()+6)%7))); const k=String(mon.getUTCMonth()+1).padStart(2,'0')+'-'+String(mon.getUTCDate()).padStart(2,'0'); wkP[k]=(wkP[k]||0)+dd.p; });
  const wkRows=wkR.map((r,i)=>({cells:[r.w+(i===wkR.length-1?' (WTD)':''), num(r.ftds), num(r.apd2), pct1(r.apdP/100), num(r.pp8), pct1(r.ppP/100), wkP[r.w]?gbp(div(wkP[r.w],r.ftds)):'—']}));
  const chRows=chR.map(r=>({cells:[r.ch, num(r.f), num(r.apd2), pct1(r.apdP/100), num(r.pp8), `<span class="pill ${r.ppP>=ppB?'green':r.ppP>=ppB*0.75?'amber':'red'}">${r.ppP.toFixed(1)}%</span>`, r.avgpp.toFixed(2), div(r.pn,r.fm)?gbp(div(r.pn,r.fm)):'—']}));
  panes.sfun = `<h2 class="sec">FTD quality funnel — 2026 YTD (to ${ASOF})</h2>
<div class="kpis">
${kpi('Registrations', num(fyt.regs), 'YTD')}
${kpi('SEON closed at reg', num(fyt.seon), pct1(seonB/100)+' of regs')}
${kpi('Duplicate auto-blocks', num(fyt.dupa), pct1(dupaB/100)+' of regs')}
${kpi('FTDs', num(fyt.ftds), 'YTD')}
${kpi('First-week PBA (freeloaders)', num(fyt.pba), pct1(pbaB/100)+' of FTDs')}
${kpi('Under fraud investigation', num(fyt.ufi), pct1(ufiB/100)+' of FTDs')}
${kpi('APD0 — no paid play', num(fyt.apd0), pct1(a0B/100)+' of Jan–May FTDs')}
${kpi('PP 8–10', num(fyt.pp8), pct1(ppB/100)+' of FTDs')}
${kpi('Qore FTDs', num(qTot), pct1(qB/100)+' of Jan–Jun FTDs')}
</div>
<h2 class="sec">Quality flags</h2>
<div class="callout"><ul style="margin:6px 0 2px;padding-left:0;list-style:none">${flags.map(f=>`<li style="margin:6px 0">${pill(f.s,f.s.toUpperCase())} ${f.t}</li>`).join('')}</ul></div>
<p class="note">Rules — red: monthly SEON reg-fraud >1.5× YTD, channel SEON >2× blended, UFI ≥2× the prior-8-week rate, channel UFI >2× blended. Amber: first-week PBA up ≥3pts vs January, UFI ≥1.5× baseline, duplicate auto-blocks >3pts above YTD (month) or >5pts (channel), manual duplicates >2× blended, channel PP or APD2+ >25% below blended, weekly PP >15% / APD2+ >10% below YTD, Qore down >1.5pts MoM. Thresholds live in build.js.</p>
<h2 class="sec">Registration risk — SEON &amp; duplicate auto-blocks</h2>
${chartbox('c_fun_seon')}
<div style="margin-top:14px">${tbl([{t:'Month'},{t:'Registrations',r:1},{t:'SEON closed',r:1},{t:'SEON %',r:1},{t:'Dup auto-blocks',r:1},{t:'Dup auto %',r:1}], regRows)}</div>
<p class="note">SEON closes fraudulent accounts at registration (normally ~8–10% of regs). Duplicate auto-blocks = DUPLICATE_AUTO + DUPLICATE_AUTO_ORIGINAL, also applied at registration. These populations largely never reach FTD, which is why they are shown against registrations, not FTDs.</p>
<h2 class="sec">Monthly FTD funnel</h2>
${chartbox('c_fun_mo')}
<div style="margin-top:14px">${tbl([{t:'Month'},{t:'FTDs',r:1},{t:'First-week PBA',r:1},{t:'% FTDs — First-week PBA',r:1},{t:'APD2+',r:1},{t:'APD2+ %',r:1},{t:'PP 8–10',r:1},{t:'PP %',r:1},{t:'Qore FTDs',r:1},{t:'Qore %',r:1},{t:'Net PLTV/FTD',r:1}], moRows)}</div>
<p class="note">${MONTHS[CUR_MO-1]} is partial (1–${DD}); APD2+, PP and PLTV/FTD still mature (~2-day APD lag; potential scores and PLTV re-score over the first weeks). PLTV/FTD is net of the 15% affiliate revshare. Closed-as-fraud after FTD is small (${num(fyt.cfr)} YTD) and not shown as a column. Monthly UFI, manual-duplicate and APD0 detail (YTD: UFI ${num(fyt.ufi)} · dup manual ${num(fyt.dupm)} · APD0 ${num(fyt.apd0)} Jan–May) lives in the weekly and channel tables, KPI cards and flags. Qore FTDs are published monthly in the MBR — no weekly or channel split available.</p>
<h2 class="sec">Clean FTDs — ex PBA &amp; APD0 — and true PLTV/FTD</h2>
<div style="margin-top:14px">${tbl([{t:'Month'},{t:'FTDs',r:1},{t:'First-week PBA',r:1},{t:'APD0',r:1},{t:'Clean FTDs',r:1},{t:'Clean %',r:1},{t:'Net PLTV',r:1},{t:'PLTV/FTD (all)',r:1},{t:'True PLTV/FTD (clean)',r:1}], clRows)}</div>
<p class="note">Clean FTDs = FTDs − First-week PBA (official ThoughtSpot series) − APD0 (zero paid playing days). The two populations overlap to an unknown degree (player-level PBA isn't accessible yet — DD-596), so Clean FTDs is a conservative floor and true PLTV/FTD a ceiling. ~ Jun &amp; Jul APD0 is estimated at the trailing Apr–May rate (measured APD0 unavailable — gameplay mart loaded to 22 Jun); estimates are marked ~ and replaced with actuals once the mart catches up. Net PLTV keeps the whole cohort's value (PBA/APD0 players contribute ≈£0), so true PLTV/FTD reads as net value per genuine customer.</p>
<h2 class="sec">Weekly funnel</h2>
${chartbox('c_fun_wk')}
<div style="margin-top:14px">${tbl([{t:'Week (w/c)'},{t:'FTDs',r:1},{t:'APD2+',r:1},{t:'APD2+ %',r:1},{t:'PP 8–10',r:1},{t:'PP %',r:1},{t:'Net PLTV/FTD',r:1}], wkRows)}</div>
<p class="note">PBA and Qore are published monthly only (ThoughtSpot / MBR) — no weekly or channel split. UFI, APD0, duplicate and SEON detail live in the KPI cards, the flags above and the Registration risk section.</p>
<h2 class="sec">Channel quality — YTD</h2>
${chartbox('c_fun_ch',540)}
<div style="margin-top:14px">${tbl([{t:'Channel'},{t:'FTDs',r:1},{t:'APD2+',r:1},{t:'APD2+ %',r:1},{t:'PP 8–10',r:1},{t:'PP %',r:1},{t:'Avg PP score',r:1},{t:'Net PLTV/FTD',r:1}], chRows)}</div>
<p class="note"><b>Definitions (per Fraud &amp; Payments):</b> SEON = accounts closed as fraud at registration (status CLOSED/FRAUD). UFI = RESTRICTED/UNDER_FRAUD_INVESTIGATION — high-risk accounts identified after first deposit, docs requested before withdrawal release. Duplicates: auto-blocks at registration (DUPLICATE_AUTO + AUTO_ORIGINAL) vs manual blocks after registration (DUPLICATE_OTHER + GAMSTOP_BREACH + SE_BREACH); legacy DUPLICATE_EXACT has no 2026 volume. PBA (freeloaders — deposit only for an offer): the monthly <b>% FTDs — First-week PBA</b> values are the OFFICIAL numbers from the "Bonus Abuse Metrics for FTDs" ThoughtSpot liveboard (First-Week PBA variant: FTDs flagged PBA within their first week; read 13 Jul 2026 at monthly granularity). <b>Jan–Jun are final</b>; <b>July is provisional</b> (~14.8%, applied to full-month 1–12 FTDs) because July cohorts' first weeks haven't fully elapsed and the pinboard tile wouldn't render the current July count — it will firm up. The platform PBA status on dim_player does NOT reconcile with this metric (a different source), so no weekly or channel PBA split is shown. Full automation (weekly/channel + live July) needs the PV dataset allow-listed in BigQuery (DD-596). <b>APD0</b> = FTDs with zero paid playing days (any window, from daily_player_gameplay, paid wagers only) — the strict freeloader read; shown for Jan–May cohorts only because the gameplay mart is currently loaded to 22 Jun (June/July would be overstated). The MBR's softer "no play in week 1" APD0 runs 1.3–2.0%/mo. PP = player-potential 1–10 (PP 8–10 = MBR "PPQore"); APD2+ = 2+ active playing days; Qore = paid wagering >£1,000. Statuses are current, not point-in-time, so recent cohorts revise up as reviews land. Reg-stage channel rows use last-click at registration; PBA/UFI/dup-manual/PP use last-click at FTD; APD2+ % and PLTV/FTD use the registration-anchored spend mart. Channels under 2,000 regs show "—".</p>`;
}

if(D.funnel && panes.sfun){
  const pcf2=(a,b)=>b?a/b*100:0;
  const wkP3={}; D.daily.forEach(dd=>{ if(dd.date<'2026-01-01') return; const dt=new Date(dd.date+'T00:00:00Z'); const mon=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate()-((dt.getUTCDay()+6)%7))); const k=String(mon.getUTCMonth()+1).padStart(2,'0')+'-'+String(mon.getUTCDate()).padStart(2,'0'); wkP3[k]=(wkP3[k]||0)+dd.p; });
  EMBED.funnel={
    mo:D.funnel.mo.map((r,i)=>({m:r.m,ftds:r.ftds,apd2:r.apd2,pp8:r.pp8,qore:r.qore,pba:r.pba,ppf:Math.round(div(moTot[i+1]?moTot[i+1].p:0,r.ftds))})),
    wk:D.funnel.wk.map(r=>({w:r.w,apdP:+pcf2(r.apd2,r.ftds).toFixed(1),ppP:+pcf2(r.pp8,r.ftds).toFixed(1),pbaP:+pcf2(r.pba,r.ftds).toFixed(2),seonP:+pcf2(r.seon,r.regs).toFixed(1),dupaP:+pcf2(r.dupa,r.regs).toFixed(1),ufiP:+pcf2(r.ufi,r.ftds).toFixed(2),ppf:Math.round(div(wkP3[r.w]||0,r.ftds))})),
    ch:D.funnel.ch.map(r=>({ch:r.ch,ppP:+pcf2(r.pp8,r.f).toFixed(1),apdP:+pcf2(r.apd2,r.fm).toFixed(1),pbaP:+pcf2(r.pba,r.f).toFixed(2),ufiP:+pcf2(r.ufi,r.f).toFixed(2)}))
  };
}

// ---------- ATL IMPACT MODEL (brand/TV halo, Jan-Jun 2026) ----------
if(D.atlModel){
  const AM=D.atlModel; const S=AM.ftd, T=AM.top;
  panes.satl = `<h2 class="sec">ATL impact model — Jan–Jun 2026 <span style="color:var(--muted);font-weight:600">(brand/TV halo · scenario model)</span></h2>
<div class="callout"><b>How to read this.</b> ATL (TV, radio, AVOOH, online video, sponsorship) is <b>always-on and near-flat</b> week to week, and carries <b>no directly-attributed FTDs</b>. With no on/off or geo variation in the data, a regression <b>cannot causally identify</b> ATL's effect — fitting weekly halo demand on adstocked ATL spend returns a near-zero/negative coefficient dominated by trend and other paid spend. So this is a <b>transparent benchmark-anchored scenario model</b>, not a fitted causal estimate: we attribute a plausible <b>halo share</b> of demand in the channels ATL lifts (Direct, Organic Search, brand PPC, RAF, iOS/Android Organic, Unattributed, Referral, Organic Social) and size the money. Treat as directional; the only way to measure this properly is a regional hold-out or a deliberate spend on/off test (see recommendation).</div>
<div class="kpis">
${kpi('ATL spend H1', gbpM(AM.atlH1), 'TV+radio+AVOOH+OV+sponsorship')}
${kpi('Halo-channel FTDs H1', num(AM.haloH1), `${pct1(AM.haloH1/AM.totFtd)} of all FTDs · £${AM.ppf}/FTD net`)}
${kpi('Incremental FTDs (base)', num(S.base.f), `${S.base.pctTot}% of all FTDs · ${S.low.f.toLocaleString('en-GB')}–${S.high.f.toLocaleString('en-GB')} range`)}
${kpi('12m PLTV : spend (base)', S.base.roi.toFixed(2)+'x', `cost/incr FTD £${num(S.base.cpi)}`)}
</div>
<h2 class="sec">Lower funnel — incremental FTDs &amp; 12-month value</h2>
${tbl([{t:'Scenario'},{t:'Halo share',r:1},{t:'Incr FTDs',r:1},{t:'% of all FTDs',r:1},{t:'Incr net PLTV (12m)',r:1},{t:'Cost / incr FTD',r:1},{t:'12m PLTV:spend',r:1}], [
 {cells:['Low', S.low.share+'%', num(S.low.f), S.low.pctTot+'%', gbpM(S.low.pltv), gbp(S.low.cpi), `<span class="pill red">${S.low.roi.toFixed(2)}x</span>`]},
 {cls:'tot',cells:['Base', S.base.share+'%', num(S.base.f), S.base.pctTot+'%', gbpM(S.base.pltv), gbp(S.base.cpi), `<span class="pill red">${S.base.roi.toFixed(2)}x</span>`]},
 {cells:['High', S.high.share+'%', num(S.high.f), S.high.pctTot+'%', gbpM(S.high.pltv), gbp(S.high.cpi), `<span class="pill amber">${S.high.roi.toFixed(2)}x</span>`]},
])}
<p class="note"><b>On a 12-month direct-value basis ATL is well below breakeven</b> — it would need to be driving <b>~${AM.breakevenShare}% of all halo-channel FTDs</b> (vs the 8–18% modelled) for its £${gbpM(AM.atlH1).slice(1)} H1 spend to return 1.0x on 12-month net PLTV alone. That is expected and <b>not</b> the right sole lens for brand: ATL's justification rests on (a) <b>multi-year LTV</b> beyond the 12-month PLTV window, (b) <b>cross-channel efficiency</b> — cheaper brand search, higher organic/direct conversion (the 2026 blended CPA is −20% YoY while ATL runs always-on), and (c) category presence/consideration. Those are real but not measurable from this dataset. Net PLTV per halo FTD = £${AM.ppf}.</p>
<h2 class="sec">Upper funnel — traffic &amp; registration lift</h2>
${tbl([{t:'Scenario'},{t:'Halo share',r:1},{t:'Incr new sessions',r:1},{t:'Incr registrations',r:1}], [
 {cells:['Low', T.low.share+'%', num(T.low.snew), num(T.low.reg)]},
 {cls:'tot',cells:['Base', T.base.share+'%', num(T.base.snew), num(T.base.reg)]},
 {cells:['High', T.high.share+'%', num(T.high.snew), num(T.high.reg)]},
])}
<p class="note">H1 new sessions ${num(AM.snewH1)} · registrations ${num(AM.regH1)}. Upper-funnel halo shares are set slightly below the FTD share (brand media touches many who never convert), so the implied new-session→registration→FTD ladder stays internally consistent.</p>
<h2 class="sec">Where the ATL halo lands — by channel (base case)</h2>
${(()=>{ const a=AM.chAlloc, t=AM.chAllocTot;
  const rows=a.map(r=>({cells:[ r.ch, num(r.f), r.w+'%', num(r.incf), gbpK(r.incp), gbp(r.ppf) ]}));
  rows.push({cls:'tot',cells:['TOTAL (base)', num(AM.haloH1), pct1(t.incf/AM.haloH1), num(t.incf), gbpM(t.incp), gbp(AM.ppf)]});
  return tbl([{t:'Halo channel'},{t:'H1 FTDs',r:1},{t:'ATL sensitivity',r:1},{t:'Incr FTDs (ATL)',r:1},{t:'Incr net PLTV',r:1},{t:'Net PLTV/FTD',r:1}], rows);
})()}
${chartbox('c_atl_ch')}
<p class="note">Base-case incremental FTDs split across the halo channels using differentiated <b>ATL-sensitivity weights</b> (the share of each channel's FTDs plausibly triggered by brand/TV): brand search and direct respond most to TV (someone sees an ad, then searches “MrQ” or types the URL), organic/RAF least. Weights are judgement calls chosen to sum to the 13% blended base; they are illustrative, not measured. <b>Read:</b> ~62% of ATL's modelled value lands in <b>brand PPC, Organic Search and Direct</b> — so the clearest place to see (and test) an ATL effect is <b>brand-search volume and direct/app traffic</b>, which is also where a hold-out test would read fastest.</p>
<h2 class="sec">By ATL media type — spend &amp; modelled impact (base case)</h2>
${(()=>{ const m=AM.mediaMix;
  const rows=m.map(r=>({cells:[ r.m, gbpM(r.sp), r.spsh+'%', r.w.toFixed(2), num(r.incf), gbpK(r.incp), gbp(r.cpi) ]}));
  const t={sp:m.reduce((a,r)=>a+r.sp,0),incf:m.reduce((a,r)=>a+r.incf,0),incp:m.reduce((a,r)=>a+r.incp,0)};
  rows.push({cls:'tot',cells:['TOTAL ATL', gbpM(t.sp), '100%', '', num(t.incf), gbpM(t.incp), gbp(t.sp/t.incf)]});
  return tbl([{t:'ATL medium'},{t:'H1 spend',r:1},{t:'% of ATL',r:1},{t:'Effectiveness wt',r:1},{t:'Incr FTDs',r:1},{t:'Incr net PLTV',r:1},{t:'Cost / incr FTD',r:1}], rows);
})()}
${chartbox('c_atl_med')}
<p class="note"><b>Impact split by medium = spend share × an effectiveness weight</b> (relative halo per £: video/addressable formats — AVOOH, online video — weighted above linear TV; radio and OOH below). <b>TV is ~83% of ATL spend and impact</b>, but its spend here is <b>inferred as the residual</b> (${gbpM(AM.atlH1)} ATL total minus tracked media) because the BARB file carries GRPs (638 in Q1) but <b>no cost column</b>. Radio and AVOOH H1 are <b>estimated as Q1×2</b> (always-on) since the files stop at 31 Mar; online video, sponsorship and OOH are file actuals. Effectiveness weights are judgement calls, not measured — a hold-out or on/off test is still needed to size each medium properly. All value at £${AM.ppf} net PLTV/FTD.</p>
<h2 class="sec">ATL spend &amp; adstock vs halo demand — weekly</h2>
${chartbox('c_atl_dem')}
<p class="note">ATL weekly spend (bars), 2-week-half-life adstock (line, brand carryover), and halo-channel FTDs (line, right axis). Note how flat spend is — the absence of variation is exactly why the effect isn't statistically identifiable. Adstock λ=0.5.</p>
<h2 class="sec">TV delivery — weekly GRPs (Q1, BARB)</h2>
${chartbox('c_atl_grp')}
<p class="note">Equivalent 30-second GRPs from the BARB linear-TV export (Q1 only — ${num(AM.tvGrpQ1)} GRPs Jan–Mar; the file carries no cost column, and Apr–Jun TV delivery wasn't supplied, so H1 spend is taken from the attribution ATL line). Radio Q1 £${num(AM.radioQ1)}. GRPs do vary week to week but not enough, against noisy organic demand, to pin down a response curve over 13 weeks.</p>
<h2 class="sec">TV spot-length effectiveness (Q1 BARB)</h2>
${(()=>{ const s=AM.spotLen;
  const rows=s.map(r=>({cells:[ r.len, num(r.spots), (r.imp/1e6).toFixed(0)+'M', r.eqsh+'%', r.eff.toFixed(2), gbpM(r.spend), num(r.incf), gbp(r.cpi), r.fps.toFixed(3) ]}));
  const t={sp:s.reduce((a,r)=>a+r.spots,0),spend:s.reduce((a,r)=>a+r.spend,0),incf:s.reduce((a,r)=>a+r.incf,0)};
  rows.push({cls:'tot',cells:['TV total', num(t.sp), (s.reduce((a,r)=>a+r.imp,0)/1e6).toFixed(0)+'M', '100%', '', gbpM(t.spend), num(t.incf), gbp(t.spend/t.incf), (t.incf/t.sp).toFixed(3)]});
  return tbl([{t:'Spot length'},{t:'Spots (Q1)',r:1},{t:'Impacts',r:1},{t:'Airtime share',r:1},{t:'Effect. index',r:1},{t:'Inferred spend',r:1},{t:'Incr FTDs',r:1},{t:'Cost / incr FTD',r:1},{t:'FTDs / spot',r:1}], rows);
})()}
${chartbox('c_atl_spot')}
<p class="note"><b>The read:</b> MrQ's TV runs two lengths — <b>10s (53% of spots, 36% of airtime) and 30s (47% of spots, 64% of airtime)</b>. Applying a standard short-term-response <b>effectiveness index (10s ≈ 0.65 of a 30s per impression</b>, from branding-recall curves), the 10s punches <b>above its airtime cost weight</b>: because airtime price scales ~with duration (10s ≈ half a 30s) but a 10s still delivers ~65% of the response, <b>the 10s is ~23% cheaper per incremental FTD (£${num(AM.spotLen[0].cpi)} vs £${num(AM.spotLen[1].cpi)})</b>. The 30s drives more FTDs <b>per spot</b> (${AM.spotLen[1].fps.toFixed(2)} vs ${AM.spotLen[0].fps.toFixed(2)}) and builds more brand memory, so it earns its place for long-term equity — but for <b>short-term acquisition efficiency the mix could tilt further toward 10s</b>. <b>Assumption-driven</b>: the effectiveness index and the duration-proportional cost split are benchmarks, not measured; the file has no per-spot cost and Q1 delivery only. A copy-test (10s vs 30s brand-search lift) would confirm the curve.</p>
<h2 class="sec">Method &amp; caveats</h2>
<div class="callout"><ul style="margin:6px 0;padding-left:18px">
<li><b>Halo channels</b>: Direct, Organic Search, PPC Brand, RAF, iOS/Android Organic, Unattributed, Referral, Organic Social — the lines brand media plausibly lifts. Paid-targeted channels (Affiliate, Meta, UAC, Apple, PPC Generic) are excluded.</li>
<li><b>Scenario shares</b> (8/13/18% lower funnel; 6/10/15% upper) are external benchmarks for UK online-gaming TV halo, <b>not</b> measured from MrQ data. The regression on 26 weeks of near-flat always-on spend produced no usable coefficient (R² driven by trend + other paid spend).</li>
<li><b>Value</b> uses net 12-month PLTV per halo FTD (£${AM.ppf}); ROI is 12-month PLTV ÷ ATL spend and ignores longer-term LTV and cross-channel efficiency.</li>
<li><b>Recommendation</b>: to replace these assumptions with a measured number, run a <b>regional hold-out</b> (dark a TV region for 6–8 weeks) or a <b>deliberate national on/off burst</b>, and read the halo-channel + brand-search response. That is the only way to get a defensible ATL ROI.</li>
</ul></div>
<p class="note">Point-in-time analysis, data to ${AM.asOf}. Built from the uploaded Linear TV (BARB, Q1) and Media Data Collection files + the attribution ATL spend line. Not refreshed by the daily job.</p>`;
}

if(D.atlModel){ EMBED.atl={weeks:D.atlModel.weeks, chAlloc:D.atlModel.chAlloc, mediaMix:D.atlModel.mediaMix, spotLen:D.atlModel.spotLen}; }

const TABS = [['summary','Summary'],['rec','Recommendations'],['s1','This-week'],['s2','Month-to-date'],['s2b','Targets'],...(panes.s2j?[['s2j',MONTHS[CUR_MO-1]+' MTD']]:[]),['s2c','Budget'],['s3','YTD & YoY'],['s3b','PLTV drivers'],...(panes.sq?[['sq','FTD quality']]:[]),...(panes.sfun?[['sfun','Quality funnel']]:[]),['s4','Daily'],['s4b','Timing'],['s4c','Weather'],['s4d','World Cup'],['s5','Insights'],['s6','Channel mix'],['s6b','APD2+'],['straffic','Traffic'],['s7','Web vs App'],['s8','ATL'],...(panes.satl?[['satl','ATL model']]:[]),['s9','Channel opt'],...(panes.sinc?[['sinc','Incremental CPA']]:[]),['s9b','Time-decay'],['s10','Ad-groups'],['s10b','Affiliates'],['s11','Per-channel'],['s12','Weekly trends']];
const tabbar = TABS.map((t,i)=>`<button class="tab${i===0?' active':''}" data-pane="${t[0]}">${t[1]}</button>`).join('');
const paneHTML = TABS.map((t,i)=>`<section class="pane${i===0?' active':''}" id="pane-${t[0]}">${panes[t[0]]||''}</section>`).join('');

const META = JSON.stringify({
  name:"Mrq Pm Weekly Dashboard", schemaVersion:1,
  description:`MrQ performance marketing dashboard (refreshed ${TODAY}, actuals through ${ASOF}). Tabbed view: this-week forecast, MTD, plan pacing, budget, YoY (hybrid 2025), MoM PLTV drivers, daily/timing, channel mix, APD2+, Web vs App, ATL, channel & affiliate optimisation, time-decay, ad-group leaderboard, per-channel and 6-month weekly trends. Affiliate PLTV net of 15% revshare throughout.`,
  mcpTools:["mcp__b9dbfb90-bb62-4dc2-92d0-7a56d5ff8f3b__attributionBigQuery"],
  mcpServerNames:["MrQ MCP"]
}, null, 2);

const html = `<!DOCTYPE html><script type="application/json" id="cowork-artifact-meta">
${META}
</script>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MrQ · Performance Marketing Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.js" integrity="sha384-iU8HYtnGQ8Cy4zl7gbNMOhsDTTKX02BTXptVP/vqAWIaTfM7isw76iyZCsjL2eVi" crossorigin="anonymous"></script>
<style>
:root{color-scheme:light;--blue:#0A2ECB;--navy:#0B2595;--sky:#00B2FF;--green:#1c8f53;--green2:#42D486;--yellow:#FFDF00;--pink:#FF63F6;--ink:#0c1430;--muted:#5b6480;--line:#e6e8f2;--bg:#f5f6fb;--card:#fff;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;font-size:14px;line-height:1.45}
.wrap{max-width:1180px;margin:0 auto;padding:0 18px 60px}
header.hero{background:var(--blue);color:#fff;border-radius:0 0 18px 18px;padding:22px 26px 26px}
.logo{display:inline-flex;align-items:baseline;font-weight:800;letter-spacing:-.5px;font-size:24px;background:#fff;color:var(--blue);padding:3px 12px;border-radius:9px}
header.hero h1{font-size:23px;margin:14px 0 4px;font-weight:800;letter-spacing:-.4px}
header.hero p{margin:0;opacity:.9;font-size:13px;max-width:880px}
.asof{margin-top:10px;display:inline-block;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);padding:4px 11px;border-radius:20px;font-size:12px;font-weight:600}
.headline{margin-top:12px;display:flex;gap:14px;flex-wrap:wrap}
.headline .hl{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:12px;padding:8px 14px}
.headline .hl .l{font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.85}
.headline .hl .v{font-size:19px;font-weight:800;letter-spacing:-.4px}
.headline .hl .yoy{font-size:10px;font-weight:600;opacity:.82;margin-top:2px}
.headline .hl .yoy.up{color:#42D486}.headline .hl .yoy.dn{color:#FF9db0}
.tabbar{position:sticky;top:0;z-index:30;background:rgba(245,246,251,.96);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);display:flex;gap:4px;overflow-x:auto;padding:8px 18px;margin-bottom:18px}
.tab{flex:0 0 auto;border:1px solid var(--line);background:#fff;color:var(--muted);font-weight:700;font-size:12px;padding:7px 13px;border-radius:9px;cursor:pointer;white-space:nowrap;font-family:inherit}
.tab:hover{color:var(--blue)}
.tab.active{background:var(--blue);color:#fff;border-color:var(--blue)}
.pane{display:none}
.pane.active{display:block}
h2.sec{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:26px 2px 11px;font-weight:700}
h3.subsec{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin:18px 2px 4px;font-weight:700}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px 16px 13px}
.kpi .lbl{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.kpi .val{font-size:24px;font-weight:800;letter-spacing:-1px;margin:6px 0 2px;color:var(--blue)}
.kpi .rng{font-size:11px;color:var(--muted)}
.pill{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11.5px;font-weight:800}
.pill.big{font-size:20px;padding:2px 12px}
.pill.green{background:#e3f6ec;color:#0f7a43}
.pill.amber{background:#fff5d6;color:#9a7400}
.pill.red{background:#ffe1ee;color:#c01262}
.pill.grey{background:#eef0f7;color:#5b6480}
.rec,.health,.callout{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:14px 18px;margin-top:16px}
.rec{border-left:4px solid var(--green)}
.health{border-left:4px solid var(--yellow)}
.callout{border-left:4px solid var(--sky);font-size:13px}
.rec h3,.health h3{margin:0 0 8px;font-size:14px;font-weight:800}
.health h3 span{font-weight:600;font-size:11px;color:var(--muted)}
.rec ol,.health ul{margin:0;padding-left:20px}
.rec li,.health li{margin:5px 0;font-size:13px}
.note{font-size:12px;color:var(--muted);margin:10px 2px}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff}
table{border-collapse:collapse;width:100%;font-size:12.5px;min-width:520px}
th,td{padding:8px 11px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{background:#f0f2fb;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);position:sticky;top:0}
td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
span.camp{white-space:normal;font-size:11px;color:var(--muted)}
tr.tot td{font-weight:800;background:#f7f8fd;border-top:2px solid var(--line)}
table.heat{min-width:770px;border-collapse:separate;border-spacing:2px;font-size:11px}
table.heat th,table.heat td{border:0;padding:0;white-space:nowrap}
table.heat th.hd,table.heat td.hd{width:20px;text-align:center;color:var(--muted);font-variant-numeric:tabular-nums;font-weight:600;background:transparent;position:static}
table.heat td.hc{width:20px;height:20px;border-radius:3px}
table.heat .hnm{text-align:left;color:var(--ink);font-weight:600;padding-right:8px;max-width:140px;overflow:hidden;text-overflow:ellipsis;background:transparent;position:static}
table.heat tr.htot td{padding-top:4px;color:var(--muted)}
.heatleg{display:flex;align-items:center;gap:6px;margin:9px 2px;font-size:12px;color:var(--muted)}
.heatleg i{width:20px;height:12px;border-radius:2px;display:inline-block}
.chartbox{background:#fff;border:1px solid var(--line);border-radius:13px;padding:12px;height:340px;margin-top:14px;position:relative}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.grid2 .chartbox{margin-top:0}
.gridch{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:8px}
.gridch .chartbox{height:250px;margin-top:0;padding:8px}
.prog{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 16px;margin-top:12px}
.prog-h{display:flex;justify-content:space-between;font-weight:700;font-size:13px;margin-bottom:8px}
.prog-bar{position:relative;height:18px;background:#eef0f7;border-radius:10px;overflow:visible}
.prog-fill{height:100%;background:linear-gradient(90deg,var(--blue),var(--sky));border-radius:10px}
.prog-mark{position:absolute;top:-3px;width:2px;height:24px;background:var(--pink)}
.prog-d{font-size:11px;color:var(--muted);margin-top:7px}
.selrow{margin:6px 2px 2px}.selrow select{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;font-weight:700;color:var(--blue)}
footer{margin:30px 18px 0;font-size:11.5px;color:var(--muted);border-top:1px solid var(--line);padding-top:14px}
@media(max-width:760px){.kpis{grid-template-columns:repeat(2,1fr)}.grid2{grid-template-columns:1fr}}
</style></head>
<body>
<header class="hero">
<div class="logo">MrQ</div>
<h1>Performance Marketing Dashboard</h1>
<p>Aggregate acquisition performance — spend, FTDs, 12-month PLTV, LTV:CAC and quality (APD2+). Affiliate PLTV is net of the 15% revshare haircut throughout; plan and actual are like-for-like.</p>
<span class="asof">As of ${TODAY} · actuals through ${ASOF} (fully-landed days)</span>
<div class="headline">
${(()=>{ const sg=v=>(v>=0?'+':'')+pct(v); const cls=(v,good)=>((good?v>=0:v<0)?'up':'dn');
  const ppf26=div(ytd.p,ytd.f), ppf25=div(yoy.pltv25,yoy.ftds25), ppfD=ppf26/ppf25-1;
  const tile=(l,v,d,good)=>`<div class="hl"><div class="l">${l}</div><div class="v">${v}</div><div class="yoy ${cls(d,good)}">YoY ${sg(d)}</div></div>`;
  return [
    tile('YTD spend', gbpM(ytd.s), yoy.spend26/yoy.spend25-1, true),
    tile('YTD FTDs', num(ytd.f), yoy.ftdsD, true),
    tile('YTD CPA', gbp(yoy.cpa26), yoy.cpaD, false),
    tile('YTD PLTV/FTD (net)', gbp(ppf26), ppfD, true),
    tile('YTD 12m PLTV (net)', gbpM(ytd.p), yoy.pltv26/yoy.pltv25-1, true),
    tile('YTD APD2+', num(ytd.apd), div(ytd.apd,D.y2025ytd.apd)-1, true),
    tile('Blended LTV:CAC', f2(div(ytd.p,ytd.s)), yoy.ltvD, true),
  ].join(''); })()}
</div>
</header>
<nav class="tabbar">${tabbar}</nav>
<div class="wrap">${paneHTML}</div>
<footer>MrQ Performance Marketing · refreshed ${TODAY}, actuals through ${ASOF} (fully-landed days). Source: MrQ BigQuery <code>attribution_spend_metrics</code>. Affiliate PLTV net of 15% revshare. 2025 YoY baseline uses FY25-tracker spend with model FTDs/PLTV (gross) — YoY LTV:CAC uplift is conservative. Aggregate marketing data only; no player PII. Forecasts use trailing-4-week daily averages (never naive part-period scaling).</footer>
<script>
const EMBED = ${JSON.stringify(EMBED)};
const COL={blue:'#0A2ECB',sky:'#00B2FF',green:'#1c8f53',pink:'#FF63F6',yellow:'#FFDF00',navy:'#0B2595',grey:'#9aa3bf'};
// --- strict no-type chart stub: throws if a config has no type ---
function mkChart(canvasId,cfg){
  if(!cfg||typeof cfg.type!=='string'||!cfg.type) throw new Error('Chart config missing type for '+canvasId);
  const el=document.getElementById(canvasId); if(!el) return null;
  return new Chart(el.getContext('2d'),cfg);
}
const baseOpts=(extra)=>Object.assign({responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:11},boxWidth:12}}},scales:{}},extra||{});
const built={};
function gbpAxis(v){return '£'+(v>=1000?(v/1000).toFixed(0)+'k':v);}

function buildPane(id){
  if(built[id]) return;
  built[id]=true;
  try{
  if(id==='s2j' && EMBED.julPace){
    const jp=EMBED.julPace, col=v=>v>=100?'#1c8f53':v>=90?'#B9860B':'#C01262';
    mkChart('c_jul_pace',{type:'bar',data:{labels:jp.map(r=>r.ch),datasets:[{label:'Net PLTV forecast ÷ plan (%)',data:jp.map(r=>r.pcP),backgroundColor:jp.map(r=>col(r.pcP))}]},options:baseOpts({indexAxis:'y',plugins:{title:{display:true,text:(EMBED.julPaceMo||'')+' — net PLTV forecast vs plan by channel (%)'},legend:{display:false}},scales:{x:{ticks:{callback:v=>v+'%'}}}})});
  }
  if(id==='s2'){
    mkChart('c_mtd_spend',{type:'line',data:{labels:EMBED.mtdDaily.map(d=>d.d),datasets:[{label:'Daily spend (£)',data:EMBED.mtdDaily.map(d=>Math.round(d.s)),borderColor:COL.blue,backgroundColor:'rgba(10,46,203,.08)',fill:true,tension:.3,pointRadius:0}]},options:baseOpts({plugins:{title:{display:true,text:'MTD daily spend'}}})});
    mkChart('c_mtd_ftd',{type:'line',data:{labels:EMBED.mtdDaily.map(d=>d.d),datasets:[{label:'Daily FTDs',data:EMBED.mtdDaily.map(d=>d.f),borderColor:COL.green,backgroundColor:'rgba(28,143,83,.10)',fill:true,tension:.3,pointRadius:0}]},options:baseOpts({plugins:{title:{display:true,text:'MTD daily FTDs'}}})});
    mkChart('c_mtd_cpa',{type:'line',data:{labels:EMBED.mtdDaily.map(d=>d.d),datasets:[
      {label:'CPA (£/day)',data:EMBED.mtdDaily.map(d=>Math.round(d.cpa)),borderColor:COL.navy,backgroundColor:'rgba(11,37,149,.08)',fill:true,tension:.3,pointRadius:2},
      {label:'MTD blended CPA',data:EMBED.mtdDaily.map(()=>Math.round(EMBED.mtdCpaAvg)),borderColor:COL.pink,borderDash:[6,4],pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Net CPA — daily (MTD)'}}})});
    // PLTV per FTD daily with running avg + blended dashed
    let run=[],cum=0,cn=0; EMBED.mtdDaily.forEach(d=>{cum+=d.p;cn+=d.f;run.push(Math.round(cn?cum/cn:0));});
    mkChart('c_mtd_ppf',{type:'line',data:{labels:EMBED.mtdDaily.map(d=>d.d),datasets:[
      {label:'PLTV/FTD (day)',data:EMBED.mtdDaily.map(d=>Math.round(d.ppf)),borderColor:COL.sky,pointRadius:2,tension:.25},
      {label:'Running MTD avg',data:run,borderColor:COL.blue,borderWidth:2,pointRadius:0},
      {label:'Blended MTD avg',data:EMBED.mtdDaily.map(()=>Math.round(EMBED.mtdBlendPPF)),borderColor:COL.pink,borderDash:[6,4],pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Net PLTV per FTD — daily (MTD)'}}})});
  }
  if(id==='s3'){
    mkChart('c_yoy_ftd',{type:'line',data:{labels:EMBED.months,datasets:[
      {label:'2026 FTDs',data:EMBED.monthlyFtd26,borderColor:COL.blue,backgroundColor:'rgba(10,46,203,.08)',fill:true,tension:.3},
      {label:'2025 FTDs',data:EMBED.monthlyFtd25,borderColor:COL.grey,tension:.3},
      {label:'Plan FTDs',data:EMBED.monthlyFtdPlan,borderColor:COL.pink,borderDash:[6,4],pointRadius:0,tension:.3}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Monthly FTDs — 2026 vs 2025 vs plan'}}})});
    const b=EMBED.cpaBridge, s1=b.c25+b.se;
    mkChart('c_cpa_bridge',{type:'bar',data:{labels:["2025 CPA","Spend growth","FTD volume","2026 CPA"],datasets:[{
      label:'CPA (£)',
      data:[[0,b.c25],[b.c25,s1],[s1,s1+b.ve],[0,b.c26]],
      backgroundColor:[COL.navy,COL.pink,COL.green,COL.blue]
    }]},options:baseOpts({plugins:{legend:{display:false},title:{display:true,text:'YoY CPA bridge (£/FTD): 2025 → 2026'},tooltip:{callbacks:{label:c=>{const v=c.raw;return '£'+Math.round(Math.abs(v[1]-v[0]));}}}},scales:{y:{title:{display:true,text:'£ / FTD'}}}})});
    const sg=EMBED.seg;
    mkChart('c_seg_cpa',{type:'bar',data:{labels:['Paid','Blended'],datasets:[
      {label:'2025 CPA',data:[Math.round(sg.paid25),Math.round(sg.blend25)],backgroundColor:COL.grey},
      {label:'2026 CPA',data:[Math.round(sg.paid26),Math.round(sg.blend26)],backgroundColor:COL.blue}
    ]},options:baseOpts({plugins:{title:{display:true,text:'CPA YoY — Paid & Blended (£/FTD; organic ~£0)'}},scales:{y:{title:{display:true,text:'£ / FTD'}}}})});
  }
  if(id==='s3b'){
    mkChart('c_mom',{type:'bar',data:{labels:EMBED.momMovers.map(m=>m.ch),datasets:[{label:'ΔPLTV May→Jun (£)',data:EMBED.momMovers.map(m=>Math.round(m.dP)),backgroundColor:EMBED.momMovers.map(m=>m.dP>=0?COL.green:COL.pink)}]},options:baseOpts({indexAxis:'y',plugins:{title:{display:true,text:'Per-channel ΔPLTV (matched 1–${MD})'},legend:{display:false}}})});
  }
  if(id==='sinc' && EMBED.incr){
    const q=EMBED.incr.slice().sort((a,b)=>b.margLTV-a.margLTV);
    const bc=v=>v>=1?COL.green:v>=0.85?'#B9860B':'#C01262';
    mkChart('c_incr',{type:'bar',data:{labels:q.map(r=>r.ch),datasets:[
      {label:'Marginal LTV:CAC (next £)',data:q.map(r=>r.margLTV),backgroundColor:q.map(r=>bc(r.margLTV))},
      {label:'Average LTV:CAC',data:q.map(r=>r.avgLTV),backgroundColor:'rgba(154,163,191,.45)'}
    ]},options:baseOpts({indexAxis:'y',plugins:{title:{display:true,text:'Marginal vs average LTV:CAC by channel (break-even = 1.0)'},legend:{labels:{font:{size:11},boxWidth:12}}},scales:{x:{suggestedMin:0,title:{display:true,text:'net PLTV per £ (LTV:CAC)'}}}})});
    if(EMBED.atl){ const a=EMBED.atl;
      mkChart('c_atlinc',{type:'line',data:{labels:a.labels,datasets:[
        {label:'ATL spend (indexed to 100)',data:a.atlIdx,borderColor:COL.pink,backgroundColor:'rgba(255,99,246,.06)',tension:.2,pointRadius:2,borderWidth:2},
        {label:'Total FTDs (indexed to 100)',data:a.fIdx,borderColor:COL.blue,backgroundColor:'rgba(10,46,203,.06)',tension:.2,pointRadius:2,borderWidth:2}
      ]},options:baseOpts({plugins:{title:{display:true,text:'ATL spend vs total FTDs — indexed to week 1 (ATL is flat; FTDs move independently)'},legend:{labels:{font:{size:11},boxWidth:12}}},scales:{y:{title:{display:true,text:'index (week 1 = 100)'}}}})});
    }
  }
  if(id==='sfun' && EMBED.funnel){
    const F=EMBED.funnel;
    mkChart('c_fun_seon',{type:'line',data:{labels:F.wk.map(x=>x.w),datasets:[
      {label:'SEON closed % of regs',data:F.wk.map(x=>x.seonP),borderColor:'#C01262',backgroundColor:'rgba(192,18,98,.08)',fill:true,tension:.3,pointRadius:0},
      {label:'Duplicate auto-block % of regs',data:F.wk.map(x=>x.dupaP),borderColor:COL.navy,borderDash:[6,4],tension:.3,pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Registration risk - weekly (% of registrations; final point WTD partial)'}},scales:{y:{ticks:{callback:v=>v+'%'}}}})});
    mkChart('c_fun_mo',{type:'bar',data:{labels:F.mo.map(x=>x.m),datasets:[
      {label:'FTDs',data:F.mo.map(x=>x.ftds),backgroundColor:'rgba(10,46,203,.25)'},
      {label:'APD2+',data:F.mo.map(x=>x.apd2),backgroundColor:COL.green},
      {label:'PP 8-10',data:F.mo.map(x=>x.pp8),backgroundColor:COL.navy},
      {label:'Qore FTDs',data:F.mo.map(x=>x.qore),backgroundColor:COL.yellow},
      {label:'First-week PBA (official)',data:F.mo.map(x=>x.pba),backgroundColor:COL.pink},
      {type:'line',label:'Net PLTV/FTD (£, right)',data:F.mo.map(x=>x.ppf),borderColor:COL.sky,borderWidth:2,tension:.3,yAxisID:'y1'}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Monthly funnel - FTDs vs APD2+, PP 8-10, Qore, PBA + net PLTV/FTD'}},scales:{y1:{position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>'£'+v}}}})});
    mkChart('c_fun_wk',{type:'line',data:{labels:F.wk.map(x=>x.w),datasets:[
      {label:'APD2+ %',data:F.wk.map(x=>x.apdP),borderColor:COL.green,tension:.3,pointRadius:0,yAxisID:'y'},
      {label:'PP 8-10 %',data:F.wk.map(x=>x.ppP),borderColor:COL.navy,tension:.3,pointRadius:0,yAxisID:'y'},
      {label:'Net PLTV/FTD (£, right)',data:F.wk.map(x=>x.ppf),borderColor:COL.sky,borderDash:[6,4],tension:.3,pointRadius:0,yAxisID:'y1'}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Weekly FTD quality rates + net PLTV/FTD (right, £) - final point is WTD partial'}},scales:{y:{position:'left',ticks:{callback:v=>v+'%'}},y1:{position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>'£'+v}}}})});
    mkChart('c_fun_ch',{type:'bar',data:{labels:F.ch.map(x=>x.ch),datasets:[
      {label:'APD2+ %',data:F.ch.map(x=>x.apdP),backgroundColor:COL.green},
      {label:'PP 8-10 %',data:F.ch.map(x=>x.ppP),backgroundColor:COL.navy}
    ]},options:baseOpts({indexAxis:'y',plugins:{title:{display:true,text:'Channel quality - % of FTDs (YTD)'}},scales:{x:{ticks:{callback:v=>v+'%'}}}})});
  }
  if(id==='sq' && EMBED.ftdq){
    const q=EMBED.ftdq;
    mkChart('q_vol',{type:'bar',data:{labels:q.map(x=>x.w),datasets:[
      {type:'bar',label:'FTDs',data:q.map(x=>x.ftd),backgroundColor:'rgba(10,46,203,.25)',yAxisID:'y'},
      {type:'line',label:'APD2+ rate %',data:q.map(x=>x.apd2R),borderColor:COL.green,yAxisID:'y1',tension:.3,pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'FTDs & APD2+ rate'}},scales:{y:{position:'left',beginAtZero:true},y1:{position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>v+'%'}}}})});
    mkChart('q_ret',{type:'bar',data:{labels:q.map(x=>x.w),datasets:[
      {label:'APD2+ (retained)',data:q.map(x=>x.apd2),backgroundColor:COL.green,stack:'r'},
      {label:'APD 0–1',data:q.map(x=>x.not2),backgroundColor:'#c9d0ee',stack:'r'}
    ]},options:baseOpts({plugins:{title:{display:true,text:'FTD retention split — APD2+ vs 0–1'}},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}})});
    mkChart('q_ppf',{type:'line',data:{labels:q.map(x=>x.w),datasets:[
      {label:'PLTV/FTD (£, net)',data:q.map(x=>x.ppf),borderColor:COL.sky,backgroundColor:'rgba(0,178,255,.10)',fill:true,yAxisID:'y',tension:.3,pointRadius:0},
      {label:'Savvy-staker rate %',data:q.map(x=>x.savR),borderColor:COL.pink,yAxisID:'y1',tension:.3,pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'PLTV/FTD (FTDPP) & savvy-staker rate'}},scales:{y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>v+'%'}}}})});
    mkChart('q_imm',{type:'line',data:{labels:q.map(x=>x.w),datasets:[
      {label:'IMM FTD ratio %',data:q.map(x=>x.immR),borderColor:COL.navy,backgroundColor:'rgba(11,37,149,.08)',fill:true,tension:.3,pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Immediate-FTD ratio (imm ÷ total)'},legend:{display:false}},scales:{y:{ticks:{callback:v=>v+'%'}}}})});
    mkChart('q_cost',{type:'line',data:{labels:q.map(x=>x.w),datasets:[
      {label:'Cost per FTD (£)',data:q.map(x=>x.cpf),borderColor:COL.blue,tension:.3,pointRadius:0},
      {label:'Cost per APD2+ (£)',data:q.map(x=>x.cpa2),borderColor:COL.pink,tension:.3,pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Cost per FTD & per APD2+'}}})});
    if(EMBED.ftdqCh) drawQualCh();
    if(EMBED.cohMat){ const cm=EMBED.cohMat; const pal=[COL.blue,COL.green,COL.sky,COL.navy,COL.pink,COL.grey]; const pst=['circle','rect','triangle','rectRot','crossRot','star'];
      mkChart('q_mat',{type:'line',data:{datasets:cm.rows.map((r,i)=>({label:r.mo,data:cm.horizons.map((h,j)=>({x:h,y:r.v[j]})).filter(p=>p.y!=null),borderColor:pal[i%pal.length],backgroundColor:pal[i%pal.length],pointStyle:pst[i%pst.length],pointRadius:4,pointHoverRadius:6,borderWidth:2,tension:.25,spanGaps:false}))},
        options:baseOpts({plugins:{title:{display:true,text:'Realized NGR per player by days since first activity (£)'}},scales:{x:{type:'linear',min:0,max:95,title:{display:true,text:'days since first activity'},ticks:{callback:v=>[7,14,30,60,90].includes(v)?v:''}},y:{ticks:{callback:v=>'£'+v},title:{display:true,text:'cumulative NGR / player'}}}})});
    }
  }
  if(id==='s4'){
    const d=EMBED.daily30;
    mkChart('c_daily_sf',{type:'bar',data:{labels:d.map(x=>x.d),datasets:[{type:'bar',label:'Spend (£)',data:d.map(x=>Math.round(x.s)),backgroundColor:'rgba(10,46,203,.25)',yAxisID:'y'},{type:'line',label:'FTDs',data:d.map(x=>x.f),borderColor:COL.green,yAxisID:'y1',tension:.3,pointRadius:0}]},options:baseOpts({plugins:{title:{display:true,text:'Daily spend & FTDs (30d)'}},scales:{y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
    mkChart('c_daily_p',{type:'line',data:{labels:d.map(x=>x.d),datasets:[{label:'Net PLTV (£)',data:d.map(x=>Math.round(x.p)),borderColor:COL.sky,backgroundColor:'rgba(0,178,255,.10)',fill:true,tension:.3,pointRadius:0}]},options:baseOpts({plugins:{title:{display:true,text:'Daily net PLTV (30d)'}}})});
  }
  if(id==='s4b'){
    mkChart('c_dow',{type:'bar',data:{labels:EMBED.dowLbl,datasets:[{label:'Avg FTDs',data:EMBED.dowFtd,backgroundColor:COL.blue}]},options:baseOpts({plugins:{title:{display:true,text:'Avg FTDs by day of week'},legend:{display:false}}})});
    mkChart('c_dom',{type:'line',data:{labels:EMBED.domLbl,datasets:[{label:'Avg FTDs',data:EMBED.domFtd,borderColor:COL.pink,backgroundColor:'rgba(255,99,246,.08)',fill:true,tension:.3,pointRadius:0}]},options:baseOpts({plugins:{title:{display:true,text:'Avg FTDs by day of month (payday)'},legend:{display:false}}})});
  }
  if(id==='s4c'){
    const w=EMBED.wx;
    mkChart('wxFtd',{type:'bar',data:{labels:w.lbl,datasets:[
      {type:'bar',label:'FTDs',data:w.f,backgroundColor:'rgba(10,46,203,.25)',yAxisID:'y'},
      {type:'line',label:'Approx mean temp (°C)',data:w.t,borderColor:COL.pink,yAxisID:'y1',tension:.3,pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Daily FTDs vs approx temp'}},scales:{y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
    mkChart('wxPf',{type:'line',data:{labels:w.lbl,datasets:[
      {label:'PLTV/FTD (net £)',data:w.ppf,borderColor:COL.sky,yAxisID:'y',tension:.3,pointRadius:0},
      {label:'Approx mean temp (°C)',data:w.t,borderColor:COL.pink,yAxisID:'y1',tension:.3,pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Net PLTV/FTD vs approx temp'}},scales:{y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
    mkChart('wxScatter',{type:'scatter',data:{datasets:[
      {label:'Day · pink = heatwave (19 Jun+)',data:w.scatter,pointBackgroundColor:w.scatter.map(p=>p.hw?COL.pink:COL.blue),pointRadius:4}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Temp (°C) vs day-of-week-adjusted FTD index'},legend:{display:true}},scales:{x:{title:{display:true,text:'Approx mean temp (°C)'}},y:{title:{display:true,text:'FTD index (100 = weekday norm)'}}}})});
    if(EMBED.wxFc){ const fc=EMBED.wxFc;
      mkChart('wxFcChart',{type:'bar',data:{labels:fc.labels,datasets:[
        {type:'bar',label:'Normal FTDs (weekday norm)',data:fc.norm,backgroundColor:'rgba(10,46,203,.22)',yAxisID:'y',order:3},
        {type:'bar',label:'Forecast FTDs (heatwave)',data:fc.exp,backgroundColor:COL.pink,yAxisID:'y',order:2},
        {type:'line',label:'Forecast mean temp (°C)',data:fc.temps,borderColor:COL.navy,yAxisID:'y1',tension:.3,pointRadius:3,order:1}
      ]},options:baseOpts({plugins:{title:{display:true,text:'Forward forecast — expected vs normal daily FTDs'}},scales:{y:{position:'left',beginAtZero:true},y1:{position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>v+'°'}}}})});
    }
  }
  if(id==='s4d'){
    const w=EMBED.wc;
    mkChart('wcIdx',{type:'bar',data:{labels:w.lbl,datasets:[
      {type:'bar',label:'Fixtures/day',data:w.fix,backgroundColor:'rgba(0,178,255,.30)',yAxisID:'y1'},
      {type:'line',label:'FTD index (100 = pre-WC norm)',data:w.idx,borderColor:COL.blue,yAxisID:'y',tension:.3,pointRadius:2},
      {type:'line',label:'England match',data:w.eng,borderColor:COL.pink,backgroundColor:COL.pink,yAxisID:'y',pointRadius:6,pointStyle:'rectRot',showLine:false},
      {type:'line',label:'Norm (100)',data:w.idx.map(()=>100),borderColor:COL.grey,borderDash:[5,4],yAxisID:'y',pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Daily FTD index vs fixtures per day (heat from 19 Jun)'}},scales:{y:{position:'left',title:{display:true,text:'FTD index'}},y1:{position:'right',grid:{drawOnChartArea:false},title:{display:true,text:'fixtures'},suggestedMax:12}}})});
    mkChart('wcScatter',{type:'scatter',data:{datasets:[
      {label:'Day · pink = England',data:w.scatter,pointBackgroundColor:w.scatter.map(p=>p.eng?COL.pink:COL.blue),pointRadius:w.scatter.map(p=>p.eng?7:4)}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Fixtures per day vs FTD index'},legend:{display:true}},scales:{x:{title:{display:true,text:'fixtures that day'},suggestedMin:0,suggestedMax:7},y:{title:{display:true,text:'FTD index'}}}})});
    mkChart('wcPpfScatter',{type:'scatter',data:{datasets:[
      {label:'Day · pink = England',data:w.ppfScatter,pointBackgroundColor:w.ppfScatter.map(p=>p.eng?COL.pink:COL.green),pointRadius:w.ppfScatter.map(p=>p.eng?7:4)},
      {type:'line',label:'Norm (100)',data:[{x:0,y:100},{x:7,y:100}],borderColor:COL.grey,borderDash:[5,4],pointRadius:0,showLine:true}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Fixtures per day vs PLTV/FTD index (100 = pre-WC norm)'},legend:{display:true}},scales:{x:{title:{display:true,text:'fixtures that day'},suggestedMin:0,suggestedMax:7},y:{title:{display:true,text:'PLTV/FTD index'}}}})});
  }
  if(id==='straffic'){
    const t=EMBED.traffic;
    mkChart('c_traf_wk',{type:'bar',data:{labels:t.wk.map(x=>x.w),datasets:[
      {label:'New sessions',data:t.wk.map(x=>x.sn),backgroundColor:COL.sky,stack:'s'},
      {label:'Returning sessions',data:t.wk.map(x=>x.sr),backgroundColor:COL.blue,stack:'s'}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Weekly sessions — new vs returning'}},scales:{x:{stacked:true},y:{stacked:true,title:{display:true,text:'sessions'}}}})});
    mkChart('c_traf_conv',{type:'line',data:{labels:t.wk.map(x=>x.w),datasets:[
      {label:'Session → FTD (%)',data:t.wk.map(x=>+(x.ftd/x.sess*100).toFixed(2)),borderColor:COL.green,yAxisID:'y',tension:.3,pointRadius:0},
      {label:'Session → Reg (%)',data:t.wk.map(x=>+(x.reg/x.sess*100).toFixed(2)),borderColor:COL.pink,yAxisID:'y',tension:.3,pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Weekly funnel conversion (% of sessions)'}},scales:{y:{title:{display:true,text:'%'}}}})});
  }
  if(id==='s6b'){
    const a=EMBED.apdWk;
    mkChart('c_apd_wk',{type:'line',data:{labels:a.map(x=>x.w),datasets:[
      {label:'Cost / APD2+ (£)',data:a.map(x=>x.cost),borderColor:COL.blue,backgroundColor:'rgba(10,46,203,.08)',fill:true,tension:.3,pointRadius:2},
      {label:'CPA (£)',data:a.map(x=>x.cpa),borderColor:COL.navy,borderDash:[5,4],tension:.3,pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Weekly Cost per APD2+ vs CPA (complete weeks)'}},scales:{y:{title:{display:true,text:'£'}}}})});
    const rr=EMBED.apdRatioWk, avg=rr.reduce((x,y)=>x+y.r,0)/rr.length;
    mkChart('c_apd_ratio',{type:'line',data:{labels:rr.map(x=>x.w),datasets:[
      {label:'APD2+ / FTD (%)',data:rr.map(x=>x.r),borderColor:COL.green,backgroundColor:'rgba(28,143,83,.10)',fill:true,tension:.3,pointRadius:0},
      {label:'26-wk avg',data:rr.map(()=>+avg.toFixed(1)),borderColor:COL.pink,borderDash:[6,4],pointRadius:0}
    ]},options:baseOpts({plugins:{title:{display:true,text:'FTD → APD2+ conversion rate (weekly)'}},scales:{y:{title:{display:true,text:'%'},suggestedMin:40,suggestedMax:55}}})});
    mkChart('c_apd_scatter',{type:'bubble',data:{datasets:[{label:'Channel (bubble = FTD volume)',data:EMBED.apdScatter,backgroundColor:'rgba(10,46,203,.45)',borderColor:COL.blue}]},options:baseOpts({plugins:{legend:{display:false},title:{display:true,text:'APD2+/FTD vs net PLTV/FTD by channel (r≈0.86)'},tooltip:{callbacks:{label:c=>c.raw.ch+': '+c.raw.x+'% active, £'+c.raw.y+'/FTD, '+Math.round(c.raw.f/1000)+'k FTDs'}}},scales:{x:{title:{display:true,text:'APD2+ / FTD (%)'}},y:{title:{display:true,text:'net PLTV / FTD (£)'}}}})});
  }
  if(id==='s6'){
    const m=EMBED.mix;
    mkChart('c_mix_s',{type:'doughnut',data:{labels:m.map(x=>x.ch),datasets:[{data:m.map(x=>Math.round(x.s)),backgroundColor:[COL.blue,COL.navy,COL.sky,COL.green,COL.pink,COL.yellow,'#7a86c9','#b6c0ea','#9aa3bf','#c9d0ee','#46527f','#dfe4f6','#ffd0fb']}]},options:baseOpts({plugins:{title:{display:true,text:'Spend mix'},legend:{position:'right',labels:{font:{size:9}}}},scales:{}})});
    mkChart('c_mix_f',{type:'doughnut',data:{labels:m.map(x=>x.ch),datasets:[{data:m.map(x=>x.f),backgroundColor:[COL.blue,COL.navy,COL.sky,COL.green,COL.pink,COL.yellow,'#7a86c9','#b6c0ea','#9aa3bf','#c9d0ee','#46527f','#dfe4f6','#ffd0fb']}]},options:baseOpts({plugins:{title:{display:true,text:'FTD mix'},legend:{position:'right',labels:{font:{size:9}}}},scales:{}})});
  }
  if(id==='s7'){
    const pm=EMBED.platMonthly;
    mkChart('c_platform',{type:'bar',data:{labels:EMBED.months,datasets:[
      {label:'Web',data:pm.Web,backgroundColor:COL.blue,stack:'a'},
      {label:'App',data:pm.App,backgroundColor:COL.sky,stack:'a'},
      {label:'Other',data:pm.Other,backgroundColor:COL.grey,stack:'a'}
    ]},options:baseOpts({plugins:{title:{display:true,text:'Monthly FTDs by platform'}},scales:{x:{stacked:true},y:{stacked:true}}})});
  }
  if(id==='satl' && EMBED.atl){
    const w=EMBED.atl.weeks;
    mkChart('c_atl_dem',{type:'bar',data:{labels:w.map(x=>x.w),datasets:[
      {type:'bar',label:'ATL spend £ (wk)',data:w.map(x=>x.atl),backgroundColor:'rgba(10,46,203,.25)',yAxisID:'y'},
      {type:'line',label:'ATL adstock (λ=0.5)',data:w.map(x=>x.ads),borderColor:COL.pink,borderWidth:2,pointRadius:0,tension:.3,yAxisID:'y'},
      {type:'line',label:'Halo-channel FTDs (right)',data:w.map(x=>x.halo),borderColor:COL.green,borderWidth:2,pointRadius:0,tension:.3,yAxisID:'y1'}
    ]},options:baseOpts({plugins:{title:{display:true,text:'ATL spend & adstock vs halo FTDs — weekly'}},scales:{y:{position:'left',ticks:{callback:v=>'£'+Math.round(v/1000)+'k'}},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
    mkChart('c_atl_grp',{type:'bar',data:{labels:w.map(x=>x.w),datasets:[
      {label:'TV GRPs (30s equiv, Q1)',data:w.map(x=>x.grp),backgroundColor:COL.navy},
      {type:'line',label:'Halo FTDs',data:w.map(x=>x.halo),borderColor:COL.green,borderWidth:2,pointRadius:0,tension:.3,yAxisID:'y1'}
    ]},options:baseOpts({plugins:{title:{display:true,text:'TV GRPs (Q1 BARB) vs halo FTDs'}},scales:{y:{title:{display:true,text:'GRPs'}},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
    if(EMBED.atl.chAlloc){ const a=EMBED.atl.chAlloc;
      mkChart('c_atl_ch',{type:'bar',data:{labels:a.map(x=>x.ch),datasets:[
        {label:'Incremental FTDs (bottom axis)',data:a.map(x=>x.incf),backgroundColor:COL.blue,xAxisID:'x'},
        {label:'Incremental net PLTV £ (top axis)',data:a.map(x=>x.incp),backgroundColor:COL.green,xAxisID:'x2'}
      ]},options:baseOpts({indexAxis:'y',plugins:{title:{display:true,text:'ATL-attributed incremental FTDs & net PLTV by channel (base case) — independent scales'}},scales:{x:{position:'bottom',beginAtZero:true,title:{display:true,text:'incremental FTDs'}},x2:{position:'top',beginAtZero:true,grid:{drawOnChartArea:false},title:{display:true,text:'incremental net PLTV (£)'},ticks:{callback:v=>'£'+Math.round(v/1000)+'k'}}}})});
    }
    if(EMBED.atl.mediaMix){ const m=EMBED.atl.mediaMix;
      mkChart('c_atl_med',{type:'bar',data:{labels:m.map(x=>x.m),datasets:[
        {label:'H1 spend £',data:m.map(x=>x.sp),backgroundColor:'rgba(10,46,203,.30)',yAxisID:'y'},
        {label:'Incremental FTDs (base, right)',data:m.map(x=>x.incf),backgroundColor:COL.green,yAxisID:'y1'}
      ]},options:baseOpts({plugins:{title:{display:true,text:'ATL spend & modelled incremental FTDs by medium'}},scales:{y:{position:'left',ticks:{callback:v=>'£'+Math.round(v/1e6)+'m'}},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
    }
  }
    if(EMBED.atl.spotLen){ const s=EMBED.atl.spotLen;
      mkChart('c_atl_spot',{type:'bar',data:{labels:s.map(x=>x.len),datasets:[
        {label:'Incremental FTDs (base)',data:s.map(x=>x.incf),backgroundColor:COL.blue,xAxisID:'x'},
        {label:'Cost / incr FTD £ (top axis)',data:s.map(x=>x.cpi),backgroundColor:COL.pink,xAxisID:'x2'}
      ]},options:baseOpts({indexAxis:'y',plugins:{title:{display:true,text:'TV spot length — incremental FTDs vs cost/incr FTD'}},scales:{x:{position:'bottom',beginAtZero:true,title:{display:true,text:'incremental FTDs'}},x2:{position:'top',beginAtZero:true,grid:{drawOnChartArea:false},title:{display:true,text:'cost / incr FTD (£)'},ticks:{callback:v=>'£'+v}}}})});
    }
  if(id==='s8'){
    mkChart('c_atl',{type:'bar',data:{labels:EMBED.months,datasets:[{label:'ATL spend (£)',data:EMBED.atlMonthly.map(Math.round),backgroundColor:COL.navy}]},options:baseOpts({plugins:{title:{display:true,text:'Monthly ATL (brand) spend'},legend:{display:false}}})});
  }
  if(id==='s9b'){
    const t=EMBED.td;
    mkChart('c_td',{type:'bar',data:{labels:t.map(x=>x.ch),datasets:[
      {label:'Last-click FTDs',data:t.map(x=>x.lc),backgroundColor:COL.blue},
      {label:'Time-decay FTDs',data:t.map(x=>x.td),backgroundColor:COL.pink}
    ]},options:baseOpts({plugins:{title:{display:true,text:'FTD credit — last-click vs time-decay (4 wks)'}}})});
  }
  if(id==='s10b'){
    const a=EMBED.affMom;
    mkChart('affMom',{type:'bar',data:{labels:a.map(x=>x.n),datasets:[{label:'Δ net PLTV May→Jun (£)',data:a.map(x=>x.dP),backgroundColor:a.map(x=>x.dP>=0?COL.green:COL.pink)}]},options:baseOpts({indexAxis:'y',plugins:{title:{display:true,text:'Affiliate ΔPLTV — biggest movers (matched 1–${MD})'},legend:{display:false}}})});
  }
  if(id==='s11'){ drawChannel(); }
  if(id==='s12'){
    const w=EMBED.weeks;
    mkChart('c_wk_sf',{type:'bar',data:{labels:w.map(x=>x.w),datasets:[{type:'bar',label:'Spend (£)',data:w.map(x=>Math.round(x.s)),backgroundColor:'rgba(10,46,203,.22)',yAxisID:'y'},{type:'line',label:'FTDs',data:w.map(x=>x.f),borderColor:COL.green,yAxisID:'y1',tension:.3,pointRadius:0},{type:'line',label:'Plan FTDs',data:EMBED.weeklyFtdPlan.map(Math.round),borderColor:COL.pink,borderDash:[6,4],yAxisID:'y1',pointRadius:0}]},options:baseOpts({plugins:{title:{display:true,text:'Weekly spend & FTDs'}},scales:{y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
    mkChart('c_wk_cl',{type:'line',data:{labels:w.map(x=>x.w),datasets:[{label:'CPA (£)',data:w.map(x=>Math.round(x.cpa)),borderColor:COL.navy,yAxisID:'y',tension:.3,pointRadius:0},{label:'LTV:CAC',data:w.map(x=>+x.ltv.toFixed(3)),borderColor:COL.green,yAxisID:'y1',tension:.3,pointRadius:0}]},options:baseOpts({plugins:{title:{display:true,text:'Weekly CPA & LTV:CAC'}},scales:{y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
    const avg=w.reduce((a,x)=>a+x.ppf,0)/w.length;
    mkChart('c_wk_ppf',{type:'line',data:{labels:w.map(x=>x.w),datasets:[{label:'Net PLTV/FTD (£)',data:w.map(x=>Math.round(x.ppf)),borderColor:COL.sky,backgroundColor:'rgba(0,178,255,.10)',fill:true,tension:.3,pointRadius:0},{label:'26-wk avg',data:w.map(()=>Math.round(avg)),borderColor:COL.pink,borderDash:[6,4],pointRadius:0}]},options:baseOpts({plugins:{title:{display:true,text:'Weekly net PLTV per FTD'}}})});
    if(EMBED.wkChFtd){
      const wc=EMBED.wkChFtd;
      mkChart('c_wk_ch',{type:'bar',data:{labels:wc.weeks,datasets:wc.series.map(s=>({label:s.label,data:s.data,backgroundColor:s.color,stack:'ftd'}))},options:baseOpts({plugins:{title:{display:true,text:'Weekly FTDs by channel (stacked)'},legend:{position:'bottom',labels:{font:{size:10},boxWidth:12}},tooltip:{mode:'index'}},scales:{x:{stacked:true},y:{stacked:true}}})});
    }
    if(EMBED.wkGroups){
      EMBED.wkGroups.groups.forEach((g,i)=>{
        mkChart('c_grp_'+i,{type:'bar',data:{labels:EMBED.wkGroups.weeks,datasets:[
          {type:'bar',label:'FTDs',data:g.f,backgroundColor:'rgba(10,46,203,.30)',yAxisID:'y',order:3},
          {type:'line',label:'Spend £',data:g.s,borderColor:'#0c1430',borderWidth:1.5,pointRadius:0,tension:.3,yAxisID:'y1',order:2},
          {type:'line',label:'LTV:CAC',data:g.ltv,borderColor:'#1c8f53',borderWidth:1.5,borderDash:[4,3],pointRadius:0,tension:.3,spanGaps:true,yAxisID:'y2',order:1}
        ]},options:baseOpts({plugins:{title:{display:true,text:g.name,font:{size:11}},legend:{display:true,position:'bottom',labels:{font:{size:8},boxWidth:8,padding:6}}},scales:{x:{ticks:{font:{size:8},maxRotation:0,autoSkip:true,maxTicksLimit:7}},y:{position:'left',beginAtZero:true,ticks:{font:{size:9}}},y1:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},ticks:{font:{size:8},maxTicksLimit:4,callback:v=>'£'+(v>=1000?(v/1000).toFixed(0)+'k':v)}},y2:{position:'right',beginAtZero:true,offset:true,grid:{drawOnChartArea:false},ticks:{font:{size:8},maxTicksLimit:4,callback:v=>v+'x'}}}})});
      });
    }
    if(EMBED.wkChSep){
      EMBED.wkChSep.channels.forEach((c,i)=>{
        mkChart('c_wkc_'+i,{type:'bar',data:{labels:EMBED.wkChSep.weeks,datasets:[
          {type:'bar',label:'FTDs',data:c.data,backgroundColor:c.color,yAxisID:'y',order:3},
          {type:'line',label:'Spend £',data:c.sdata,borderColor:'#0c1430',borderWidth:1.5,pointRadius:0,tension:.3,yAxisID:'y1',order:2},
          {type:'line',label:'LTV:CAC',data:c.ldata,borderColor:'#1c8f53',borderWidth:1.5,borderDash:[4,3],pointRadius:0,tension:.3,spanGaps:true,yAxisID:'y2',order:1}
        ]},options:baseOpts({plugins:{title:{display:true,text:c.ch,font:{size:12}},legend:{display:true,position:'bottom',labels:{font:{size:8},boxWidth:8,padding:6}}},scales:{x:{ticks:{font:{size:8},maxRotation:0,autoSkip:true,maxTicksLimit:6}},y:{position:'left',beginAtZero:true,ticks:{font:{size:9}}},y1:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},ticks:{font:{size:8},maxTicksLimit:4,callback:v=>'£'+(v>=1000?(v/1000).toFixed(0)+'k':v)}},y2:{position:'right',beginAtZero:true,offset:true,grid:{drawOnChartArea:false},ticks:{font:{size:8},maxTicksLimit:4,callback:v=>v+'x'}}}})});
      });
    }
  }
  }catch(e){ console.error('buildPane '+id+' failed:', e.message); }
}
let pcSF=null,pcCL=null;
let qCh;
function drawQualCh(){
  const sel=document.getElementById('qchSel'); if(!sel||!EMBED.ftdqCh) return; const ch=sel.value; const s=EMBED.ftdqCh.series[ch]; if(!s) return;
  if(qCh) qCh.destroy();
  qCh=mkChart('q_ch',{type:'bar',data:{labels:EMBED.ftdqCh.weeks,datasets:[
    {type:'bar',label:'FTDs',data:s.ftd,backgroundColor:'rgba(10,46,203,.25)',yAxisID:'y',order:3},
    {type:'line',label:'APD2+ rate %',data:s.apd2R,borderColor:COL.green,yAxisID:'y1',tension:.3,pointRadius:0,order:2},
    {type:'line',label:'PLTV/FTD £',data:s.ppf,borderColor:COL.sky,yAxisID:'y2',tension:.3,pointRadius:0,order:1}
  ]},options:baseOpts({plugins:{title:{display:true,text:ch+' — weekly FTDs, APD2+ rate & PLTV/FTD'}},scales:{y:{position:'left',beginAtZero:true},y1:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},ticks:{callback:v=>v+'%'}},y2:{position:'right',beginAtZero:true,offset:true,grid:{drawOnChartArea:false},ticks:{callback:v=>'£'+v}}}})});
}
function drawChannel(){
  const ch=document.getElementById('chanSel').value; const t=EMBED.trendCh[ch]; if(!t) return;
  if(pcSF) pcSF.destroy(); if(pcCL) pcCL.destroy();
  pcSF=mkChart('c_pc_sf',{type:'bar',data:{labels:EMBED.months,datasets:[{type:'bar',label:'Spend (£)',data:t.s.map(Math.round),backgroundColor:'rgba(10,46,203,.25)',yAxisID:'y'},{type:'line',label:'FTDs',data:t.f,borderColor:COL.green,yAxisID:'y1',tension:.3}]},options:baseOpts({plugins:{title:{display:true,text:ch+' — spend & FTDs'}},scales:{y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
  pcCL=mkChart('c_pc_cl',{type:'line',data:{labels:EMBED.months,datasets:[{label:'CPA (£)',data:t.cpa.map(Math.round),borderColor:COL.navy,yAxisID:'y',tension:.3},{label:'LTV:CAC',data:t.ltv.map(v=>+v.toFixed(3)),borderColor:COL.green,yAxisID:'y1',tension:.3}]},options:baseOpts({plugins:{title:{display:true,text:ch+' — CPA & LTV:CAC'}},scales:{y:{position:'left'},y1:{position:'right',grid:{drawOnChartArea:false}}}})});
}
// tabs
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    const id=btn.dataset.pane; const pane=document.getElementById('pane-'+id); pane.classList.add('active');
    buildPane(id);
    requestAnimationFrame(()=>{ pane.querySelectorAll('canvas').forEach(c=>{ const ch=Chart.getChart(c); if(ch) ch.resize(); }); });
  });
});
document.addEventListener('change',e=>{ if(e.target && e.target.id==='chanSel') drawChannel(); if(e.target && e.target.id==='qchSel') drawQualCh(); });
// build summary (no charts) + first chart pane lazily; nothing to build for summary
</script>
</body></html>`;

fs.writeFileSync(DIR + '/index.html', html, 'utf8');
console.log('WROTE index.html bytes', html.length);
// self-check: every "new Chart(" only inside mkChart
const newChartCount = (html.match(/new Chart\(/g)||[]).length;
console.log('new Chart( occurrences (should be 1, inside mkChart):', newChartCount);
