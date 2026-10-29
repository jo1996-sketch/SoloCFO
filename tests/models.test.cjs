const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../web/assets/models.js');
const approx = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
const dcf = () => ({ baseYear:2025,revenue:1000,openingWC:100,taxPct:20,wacc:10,terminalGrowth:2,terminalRoic:10,cash:50,debt:200,adjustments:-10,years:Array.from({length:5},()=>({growth:0,ebitMargin:20,daPct:5,capexPct:5,wcPct:10})) });
const hourly = () => ({ targetMargin:20,riskPct:5,currentRate:100,materialCost:20000,materialMarkup:25,subcontractCost:10000,subcontractMarkup:20,overheads:{ownerPay:26000,admin:0,premises:0,vehicles:0,equipment:0,insurance:0,software:0,sales:0,other:0},teams:[{name:'Testteam',fte:1,monthlyGross:4000,salaries:14,employerPct:30,benefits:1200,weeklyHours:40,vacation:25,holidays:10,sick:10,training:5,internal:10,utilization:80}] });
const row = () => ({year:2025,revenue:1000000,material:400000,personnel:300000,overhead:120000,depreciation:40000,interest:10000,taxes:30000,cash:80000,receivables:120000,inventory:100000,payables:90000});

test('DCF: independently calculated five-year reference case incl. sustainable reinvestment', () => {
 const r=M.dcf(dcf());assert.equal(r.valid,true);assert.equal(r.years.length,5);
 assert.deepEqual(r.years.map(y=>y.fcff),[160,160,160,160,160]);
 approx(r.forecastPV,606.5258831053517);approx(r.terminalNopat,163.2);approx(r.terminalReinvestment,32.64);
 approx(r.terminalFcff,130.56);approx(r.terminalValue,1632);approx(r.terminalPV,1013.3435992325412);
 approx(r.enterpriseValue,1619.869482337893);approx(r.equityValue,1459.869482337893);
});
test('DCF: positive growth consumes sustainable capital rather than inflating cash flow for free',()=>{
 const p=dcf();const r=M.dcf(p);assert.ok(r.terminalFcff<r.terminalNopat);
 p.terminalGrowth=0;const zero=M.dcf(p);approx(zero.terminalReinvestment,0);approx(zero.terminalFcff,160);
});
test('DCF: NWC changes and capex affect cash flow with the correct sign',()=>{
 const p=dcf();p.years[0].growth=10;const r=M.dcf(p);approx(r.years[0].deltaWC,10);approx(r.years[0].fcff,166);
 p.years[0].capexPct=10;approx(M.dcf(p).years[0].fcff,111);
});
test('DCF: losses do not create an automatic cash tax refund',()=>{
 const p=dcf();p.years[0].ebitMargin=-10;const r=M.dcf(p);assert.equal(r.valid,true);assert.equal(r.years[0].taxes,0);assert.equal(r.years[0].fcff,-100);assert.ok(r.warnings.length);
});
test('DCF: terminal dependency and negative equity remain visible',()=>{
 const p=dcf();p.debt=100000;const r=M.dcf(p);assert.ok(r.equityValue<0);assert.ok(r.warnings.some(w=>w.includes('negativ')));
 p.years.forEach(y=>y.capexPct=30);assert.ok(M.dcf(p).warnings.some(w=>w.includes('Endwert')));
});
test('DCF: higher WACC lowers value; sensitivity center reproduces base',()=>{
 const p=dcf(),s=M.dcfSensitivity(p);approx(s.values[2][2],M.dcf(p).equityValue);assert.ok(s.values[2][1]>s.values[2][3]);
});
test('DCF: invalid sensitivity combinations are missing, never Infinity',()=>{
 const p=dcf();p.wacc=3;p.terminalGrowth=2;const s=M.dcfSensitivity(p);assert.equal(s.values[2][0],null);assert.equal(s.values[2][1],null);
});
for(const [label,change] of [
 ['WACC equals growth',p=>p.wacc=2],['ROIC equals growth',p=>p.terminalRoic=2],['missing revenue',p=>p.revenue=null],['empty cash',p=>p.cash=''],['missing year field',p=>delete p.years[0].capexPct],['missing debt',p=>delete p.debt],['no years',p=>p.years=[]],['loss-making terminal period',p=>p.years[4].ebitMargin=-1],['negative growth in perpetuity',p=>p.terminalGrowth=-1],['invalid tax',p=>p.taxPct=101]
])test('DCF rejects '+label,()=>{const p=dcf();change(p);const r=M.dcf(p);assert.equal(r.valid,false);assert.equal(r.equityValue,null);assert.ok(r.errors.length);});
test('DCF: calculation does not mutate user inputs',()=>{const p=dcf(),before=JSON.stringify(p);M.dcf(p);M.dcfSensitivity(p);assert.equal(JSON.stringify(p),before);});

test('Hourly: full independent reference from payroll to net selling price',()=>{
 const r=M.hourlyDetailed(hourly());assert.equal(r.valid,true);assert.equal(r.staffCost,74000);assert.equal(r.annualCosts,100000);assert.equal(r.paidHours,2080);assert.equal(r.availableHours,1600);assert.equal(r.hours,1280);
 assert.equal(r.reserve,5000);assert.equal(r.otherContribution,7000);assert.equal(r.recovery,98000);assert.equal(r.hourlyCost,76.5625);assert.equal(r.price,95.703125);assert.equal(r.currentProfit,35000);assert.equal(r.currentAfterReserve,30000);assert.equal(r.breakEvenHours,980);
});
test('Hourly: FTE scales cost and capacity consistently',()=>{
 const p=hourly();p.teams[0].fte=.5;const r=M.hourlyDetailed(p);assert.equal(r.staffCost,37000);assert.equal(r.hours,640);
});
test('Hourly: multiple teams have separate wages, absence and utilization assumptions',()=>{
 const p=hourly();p.teams.push({...p.teams[0],name:'Zweites Team',fte:2,monthlyGross:2000,utilization:50});const r=M.hourlyDetailed(p);assert.equal(r.hours,2880);assert.equal(r.staffCost,149200);
});
test('Hourly: zero billable time has no price, rather than division by zero',()=>{
 const p=hourly();p.teams[0].utilization=0;const r=M.hourlyDetailed(p);assert.equal(r.valid,true);assert.equal(r.price,null);assert.ok(r.warnings.some(w=>w.includes('Stunden')));
});
test('Hourly: excess material contribution does not imply a negative selling price',()=>{
 const p=hourly();p.materialCost=1000000;const r=M.hourlyDetailed(p);assert.equal(r.price,0);assert.ok(r.warnings.some(w=>w.includes('decken')));
});
test('Hourly: a zero current price has no achievable break-even hours',()=>{const p=hourly();p.currentRate=0;assert.equal(M.hourlyDetailed(p).breakEvenHours,null);});
test('Hourly: utilization sensitivity, with out-of-bounds entries kept missing',()=>{
 const p=hourly(),s=M.hourlySensitivity(p);assert.equal(s[2].price,95.703125);assert.ok(s[4].price<s[2].price);
 p.teams[0].utilization=98;const t=M.hourlySensitivity(p);assert.equal(t[3].valid,false);assert.equal(t[3].price,null);
});
for(const [label,change] of [
 ['missing wages',p=>p.teams[0].monthlyGross=null],['too many absence days',p=>p.teams[0].vacation=240],['negative FTE',p=>p.teams[0].fte=-1],['utilization over 100',p=>p.teams[0].utilization=101],['missing overhead',p=>delete p.overheads.admin],['margin of 100',p=>p.targetMargin=100],['no teams',p=>p.teams=[]]
])test('Hourly rejects '+label,()=>{const p=hourly();change(p);const r=M.hourlyDetailed(p);assert.equal(r.valid,false);assert.equal(r.price,null);assert.ok(r.errors.length);});
test('Hourly: calculation does not change user assumptions',()=>{const p=hourly(),before=JSON.stringify(p);M.hourlyDetailed(p);M.hourlySensitivity(p);assert.equal(JSON.stringify(p),before);});

test('Scenario: neutral assumptions have zero result and cash effect',()=>{const r=M.simulate(row(),{});assert.equal(r.ebitda,180000);assert.equal(r.deltaEbitda,0);assert.equal(r.deltaWC,0);assert.equal(r.cashImpact,0);});
test('Scenario: price, investment, depreciation, tax and NWC reconcile',()=>{
 const r=M.simulate(row(),{price:5,investment:100000,investmentYears:5,taxPct:23});assert.equal(r.deltaEbitda,50000);assert.equal(r.extraDepreciation,20000);assert.equal(r.taxDelta,6900);assert.equal(r.deltaWC,6000);assert.equal(r.cashImpact,-62900);
});
test('Scenario: productive hours affect only the configured service share',()=>{const r=M.simulate(row(),{productivity:10,serviceShare:60});assert.equal(r.revenue,1060000);assert.equal(r.material,400000);assert.equal(r.personnel,300000);});
test('Scenario: variable cost shares respond only to volume',()=>{const r=M.simulate(row(),{volume:20,materialVariableShare:0,overheadVariableShare:50});assert.equal(r.material,400000);assert.equal(r.overhead,132000);});
test('Scenario: quicker collections release cash; inventory release cannot exceed stock',()=>{
 const r=M.simulate(row(),{collectionDays:10,inventoryDays:90});
 approx(r.deltaWC,-1000000/365*10-400000/365*90);assert.ok(r.cashImpact>0);
 const capped=M.simulate(row(),{inventoryDays:365});assert.equal(capped.deltaWC,-100000);
});
test('Scenario: missing balance-sheet values suppress cash flow but preserve EBITDA',()=>{
 for(const key of ['receivables','inventory','payables','depreciation']){const a=row();a[key]=null;const r=M.simulate(a,{price:5});assert.equal(r.cashImpact,null);assert.equal(r.deltaEbitda,50000);}
});
test('Scenario: extra staff respects fourteen salaries and employer factor',()=>{const r=M.simulate(row(),{hires:1,monthlyGross:3000,employerFactor:1.3});assert.equal(r.extraStaff,54600);assert.equal(r.deltaEbitda,-54600);});
test('CSV export: formula injection is neutralized without losing numeric negatives',()=>{assert.equal(M.csvCell('=1+1'),'"\'=1+1"');assert.equal(M.csvCell('  @SUM(A1)'),'"\'  @SUM(A1)"');assert.equal(M.csvCell(-12),'"-12"');assert.equal(M.csvCell('Test; "A"'),'"Test; ""A"""');});
test('Models: malformed root objects produce validation errors rather than crash',()=>{assert.equal(M.dcf(null).valid,false);assert.equal(M.hourlyDetailed(null).valid,false);assert.deepEqual(M.dcfSensitivity(null).values,[]);assert.deepEqual(M.hourlySensitivity(null),[]);});
test('DCF: a missing annual record is an explicit error',()=>{const p=dcf();p.years[2]=null;assert.equal(M.dcf(p).valid,false);});
test('Hourly: a missing employee record is an explicit error',()=>{const p=hourly();p.teams=[null];assert.equal(M.hourlyDetailed(p).valid,false);});
test('CSV export: numeric decimals use the German decimal comma',()=>{assert.equal(M.csvCell(95.703125),'"95,703125"');});

const E=require('../web/assets/engine.js');
test('CSV import: fractional years are rejected, not rounded into a different period',()=>{assert.throws(()=>E.parseCsv('year;revenue;material;personnel;overhead\n2024.7;1000;200;300;100'),/Ungültiges Jahr/);});
test('CSV import: duplicate mapped columns cannot overwrite financial data',()=>{assert.throws(()=>E.parseCsv('year;revenue;umsatz;material;personnel;overhead\n2025;1000;2000;200;300;100'),/mehrfach/);});
test('CSV import: unclosed quoting cannot silently change record boundaries',()=>{assert.throws(()=>E.parseCsv('year;revenue;material;personnel;overhead\n2025;1000;200;300;100;"unvollständig'),/Anführungszeichen/);});
