# MrQ PM Dashboard — Generator

`build.js` is the single source of truth for the dashboard. It reads `data.json`
(+ `affiliate_names.json`) and writes a self-contained `index.html` (all tabs,
charts, MrQ styling, the no-type chart stub, totals reconciliation).

## Run
```
node build.js          # reads ./data.json + ./affiliate_names.json -> writes ./index.html
node --check build.js  # syntax gate
```
`build.js` prints a RECON line (YTD spend/FTDs/PLTV vs probe) — must be ~0% error —
and "new Chart( occurrences: 1" (every chart goes through the mkChart type-guard stub).

## Daily refresh = refresh the DYNAMIC parts of data.json, then run build.js
All money/volume rules unchanged: ISO weeks Mon; fully-landed days through YESTERDAY (= ASOF);
**net PLTV applies a DATE-AWARE Affiliate revshare haircut**: 15% before 1 Apr 2026, 10% from 1 Apr onwards:
`SUM(CASE WHEN channel='Affiliate' AND date>=DATE'2026-04-01' THEN sum_pltv*0.90 WHEN channel='Affiliate' THEN sum_pltv*0.85 ELSE sum_pltv END)`. CPA=spend/FTDs; LTV:CAC=netPLTV/spend.
Affiliate (Raventrack) spend lags ~2–4 days (posts £0 then back-fills) → gap-fill; APD2+ ~2-day lag.

### data.json keys
**Set each run** `asOf` (yesterday, YYYY-MM-DD) and `today`.

DYNAMIC (re-query every run, all 2026 unless noted; date<=ASOF):
- `ytdProbe` {spend,ftds,pltvNet,apd2} — YTD totals (reconciliation check).
- `daily` [{date,s,f,p,apd}] — date 2025-12-22..ASOF, p = net PLTV. Drives daily/MTD/this-week/weekly/timing/weather/WC.
- `affDaily` [{date,s,f}] — channel='Affiliate', current-month..ASOF (gap-fill + this-week).
- `monch` [{mo,channel,s,f,pn,apd}] — Jan..ASOF by month×channel, pn = net PLTV.
- `asofCh` {channel:{s,f,p}} — the ASOF day split by channel (this-week-by-channel WTD).
- `mayMTD` [{channel,s,f,p,apd}] — PRIOR month, matched 1..N (N = ASOF day-of-month), net PLTV (MoM).
- `affMom` [{aid,may_s,may_f,may_p,jun_s,jun_f,jun_p}] — affiliate prior-vs-current matched 1..N, p net (×0.85), top ~24 by current spend.
- `plat` [{mo,plat,s,f,p,apd}] — attribution_platform monthly, net PLTV.
- `aff` [{aid,s,f,p,apd}] — channel='Affiliate' current-month by affiliate_id, p=×0.85, top 20 by spend.
- `td` [{mv,channel,f,p,s}] — attribution_model_reconciliation last 4 complete weeks, model_version in (last_click,time_decay); p net (haircut Affiliate in both models).
- `adg` [{channel,camp,ag,s,f,p}] — ad groups last 4 complete weeks, spend>=500 & ftds>=3, p net.
- `last2` [{ch,f15,f22}] — by-channel FTDs: last complete week (f22) vs prior (f15) — anomaly scan.
- `traffic` {kpi:{sess,snew,sret,reg,legreg,ftd}, wk:[[w,sn,sr,reg,ftd]] (26 ISO wks), chan:[[ch,sess,snew,reg,ftd]] (top ~12 by sessions)} — num_sessions / _new / _returning / registrations.
- `wxTemps` {date:°C} — APPEND ASOF day (Open-Meteo London mean temp, or reconstruct from Met Office). Keep history.
- `y2025ytd` {f,pg,apd} — 2025 Jan1..(same day-of-year as ASOF) model FTDs/PLTV gross/APD (YoY like-for-like).

STATIC (set once; carry forward unchanged):
- `plan` — EMBEDDED PLAN by channel (s/f/p monthly arrays). Affiliate p is GROSS; build.js applies ×0.85 (months Jan–Mar) / ×0.90 (Apr onwards).
- `y2025spend` — 12 monthly FY25-tracker spend constants (NEVER use BigQuery 2025 spend).
- `y2025mon` — 12 monthly 2025 model {f,pg}.
- `weekTargets` [{mon,wk,type,pay,ftds,spend,cpa,pltv,ltv}] — H2 weekly-plan workbook (Mon-Sun). Used by "This week vs target".
- `weekTargetsCh` [{mon,f:{ch},s:{ch}}] — H2 workbook by-channel weekly targets. Used by "This-week by channel vs target".

`affiliate_names.json` {profileId:username} — from the affiliate_groups export; applied to the Affiliate leaderboard.
`build.js` also embeds static reference: F25CH (2025 channel FTDs), WC_FIX/WC_ENG (2026 World Cup fixture schedule). Extend WC only if the tournament schedule changes.

### Per-field SQL (MrQ MCP attributionBigQuery, table mrq-data.dbt.attribution_spend_metrics; fully-qualify; set @asof)
- monch: `SELECT EXTRACT(MONTH FROM date) mo, channel, ROUND(SUM(spend)) s, ROUND(SUM(ftd_players)) f, ROUND(SUM(CASE WHEN channel='Affiliate' AND date>=DATE'2026-04-01' THEN sum_pltv*0.90 WHEN channel='Affiliate' THEN sum_pltv*0.85 ELSE sum_pltv END)) pn, ROUND(SUM(apd_2_players)) apd FROM ... WHERE date BETWEEN '2026-01-01' AND @asof GROUP BY mo,channel`
- daily: same SUMs (s,f,p=net,apd) GROUP BY date, date 2025-12-22..@asof.
- affDaily: channel='Affiliate', current-month..@asof, GROUP BY date (s,f).
- asofCh: WHERE date=@asof GROUP BY channel (s,f,p=net).
- plat: GROUP BY EXTRACT(MONTH), attribution_platform.
- aff: channel='Affiliate', current-month, GROUP BY affiliate_id, ROUND(SUM(CASE WHEN date>=DATE'2026-04-01' THEN sum_pltv*0.90 ELSE sum_pltv*0.85 END)) p, ORDER BY s DESC LIMIT 20.
- affMom / mayMTD: conditional SUM over prior-month 1..N and current-month 1..N (see this session's queries).
- td: table attribution_model_reconciliation, last 4 complete wks, model_version in (last_click,time_decay), ROUND(SUM(CASE WHEN channel='Affiliate' AND date>=DATE'2026-04-01' THEN pltv*0.90 WHEN channel='Affiliate' THEN pltv*0.85 ELSE pltv END)) p.
- adg: GROUP BY channel,name,ad_group_name HAVING spend>=500 AND ftds>=3 (last 4 wks).
- traffic: SUM(num_sessions/_new/_returning), registrations, legitimate_registrations, ftd_players — totals (kpi), weekly (wk), by channel (chan).
- last2: by-channel ftd_players for the last complete ISO week vs the prior one.
- y2025ytd: date BETWEEN '2025-01-01' AND (2025 same day) SUM(ftd_players), SUM(sum_pltv) gross, SUM(apd_2_players).

After updating data.json: `node build.js`, verify RECON ~0% and stub, then publish.

## Month-boundary handling (added)
build.js derives a **reference month (RM)**: during the first 7 days of a new month it keeps the just-completed month as the headline (MTD/mix/pacing/MoM anchor) while YTD/daily/this-week advance to ASOF. All month/day counts derive from data.json asOf. Daily refresh only needs: append current-month rows to monch, append daily/affDaily, refresh ytdProbe/y2025ytd/traffic/wtdCh/wxTemps; trailing sets (trail4Ch, adg, td, aff) stay on the last 4 complete weeks / reference month.
