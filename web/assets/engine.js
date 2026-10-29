/* SoloCFO Finance Engine – pure, deterministic, browser + Node compatible. All amounts EUR. */
(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  root.SoloEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEYS = ['revenue','material','personnel','overhead','depreciation','interest','taxes','cash','receivables','inventory','payables','currentLiabilities','debt','equity','assets'];
  const LABELS = {year:'Jahr',revenue:'Umsatzerlöse',material:'Materialaufwand / bezogene Leistungen',personnel:'Personalaufwand',overhead:'Sonstige betriebliche Aufwendungen',depreciation:'Abschreibungen',interest:'Zinsaufwand',taxes:'Ertragsteuern',cash:'Liquide Mittel',receivables:'Forderungen aus Lieferungen und Leistungen',inventory:'Vorräte',payables:'Verbindlichkeiten aus Lieferungen und Leistungen',currentLiabilities:'Kurzfristige Verbindlichkeiten',debt:'Finanzverbindlichkeiten',equity:'Eigenkapital',assets:'Bilanzsumme'};
  const nonnegative = x => Math.max(0, Number(x) || 0);
  const optional = ['depreciation','interest','taxes','cash','receivables','inventory','payables','currentLiabilities','debt','equity','assets'];
  const safeDiv = (a, b) => b ? a / b : null;
  const ratio = (a, b) => b > 0 ? a / b * 100 : null;
  function numbers(s) {
    // European 1.234,56 / 1234,56 and Anglo 1,234.56 / 1234.56, with optional currency sign.
    if (typeof s === 'number') return Number.isFinite(s) ? s : null;
    if (s == null || String(s).trim() === '') return null;
    let v = String(s).trim().replace(/[\s\u00a0€$']/g, '');
    if (v.startsWith('(') && v.endsWith(')')) v = '-' + v.slice(1,-1);
    const comma = v.lastIndexOf(','), dot = v.lastIndexOf('.');
    if (comma >= 0 && dot >= 0) v = comma > dot ? v.replace(/\./g,'').replace(',','.') : v.replace(/,/g,'');
    else if (comma >= 0) v = v.replace(/,/g,'.');
    else if ((v.match(/\./g)||[]).length > 1) v = v.replace(/\./g,'');
    const result = Number(v);
    return Number.isFinite(result) ? result : null;
  }
  function finance(row) {
    const data = {};
    KEYS.forEach(k => data[k] = optional.includes(k) && (row[k] === null || row[k] === undefined || row[k] === '') ? null : nonnegative(row[k]));
    const grossProfit = data.revenue - data.material;
    const ebitda = grossProfit - data.personnel - data.overhead;
    const ebit = data.depreciation === null ? null : ebitda - data.depreciation;
    const ebt = ebit === null || data.interest === null ? null : ebit - data.interest;
    const net = ebt === null || data.taxes === null ? null : ebt - data.taxes;
    const wc = [data.inventory,data.receivables,data.payables].some(x=>x===null) ? null : data.inventory + data.receivables - data.payables;
    return {...data, year: Number(row.year), grossProfit, ebitda, ebit, ebt, net, wc,
      grossMargin:ratio(grossProfit,data.revenue),ebitdaMargin:ratio(ebitda,data.revenue),netMargin:net===null?null:ratio(net,data.revenue),
      materialRatio:ratio(data.material,data.revenue),personnelRatio:ratio(data.personnel,data.revenue),overheadRatio:ratio(data.overhead,data.revenue),
      equityRatio:data.equity===null||data.assets===null?null:ratio(data.equity,data.assets),cashToCurrent:data.cash===null||data.currentLiabilities===null?null:ratio(data.cash,data.currentLiabilities),
      dsoIndicator:data.receivables!==null&&data.revenue>0 ? data.receivables / data.revenue * 365 : null};
  }
  function compare(current, prior) {
    if (!prior) return null;
    const a=finance(current), b=finance(prior);
    return {revenue:a.revenue-b.revenue,ebitda:a.ebitda-b.ebitda,cash:a.cash===null||b.cash===null?null:a.cash-b.cash,net:a.net===null||b.net===null?null:a.net-b.net,
      revenuePct:ratio(a.revenue-b.revenue,Math.abs(b.revenue)),
      ebitdaPct: b.ebitda !== 0 ? (a.ebitda-b.ebitda)/Math.abs(b.ebitda)*100:null,
      materialImpact:-(a.material-b.material),personnelImpact:-(a.personnel-b.personnel),overheadImpact:-(a.overhead-b.overhead),
      revenueImpact:a.revenue-b.revenue};
  }
  function insights(current, prior) {
    const a=finance(current), b=prior?finance(prior):null;
    const out=[];
    function add(severity,title,detail,amount=0){out.push({severity,title,detail,amount});}
    if(b){
      const changes=[{label:'Umsatzentwicklung',amount:a.revenue-b.revenue}, {label:'Materialaufwand',amount:-(a.material-b.material)},
        {label:'Personalaufwand',amount:-(a.personnel-b.personnel)},{label:'Sonstige Aufwendungen',amount:-(a.overhead-b.overhead)}];
      const strongest = [...changes].sort((x,y)=>Math.abs(y.amount)-Math.abs(x.amount));
      if(a.ebitda < b.ebitda && a.revenue > b.revenue) add('critical','Wachstum ohne Ergebnisverbesserung','Der Umsatz steigt, das EBITDA sinkt. Größte absolute Ergebnistreiber: '+strongest.slice(0,2).map(x=>x.label).join(' und ')+'.',a.ebitda-b.ebitda);
      if(a.materialRatio !== null && b.materialRatio !== null && a.materialRatio-b.materialRatio > 1.5) add('warning','Materialquote steigt','Materialaufwand im Verhältnis zum Umsatz ist um '+(a.materialRatio-b.materialRatio).toFixed(1).replace('.',',')+' Prozentpunkte gestiegen.',a.material-b.material);
      if(a.personnelRatio !== null && b.personnelRatio !== null && a.personnelRatio-b.personnelRatio > 1.2) add('warning','Personalquote steigt','Personalaufwand im Verhältnis zum Umsatz ist um '+(a.personnelRatio-b.personnelRatio).toFixed(1).replace('.',',')+' Prozentpunkte gestiegen.',a.personnel-b.personnel);
      if(a.cash!==null && b.cash!==null && a.cash < b.cash) add('warning','Liquiditätsbestand sinkt','Die liquiden Mittel zum Bilanzstichtag sind im Jahresvergleich gesunken.',a.cash-b.cash);
      if(a.receivables!==null && b.receivables!==null && a.receivables > b.receivables * 1.18 && a.receivables > 0) add('info','Forderungen beobachten','Der Forderungsbestand am Bilanzstichtag ist um mehr als 18 % gestiegen.',a.receivables-b.receivables);
    }
    if(a.ebitdaMargin !== null && a.ebitdaMargin < 5) add('critical','Geringe operative Marge','Die EBITDA-Marge liegt unter dem internen Prüfwert von 5 %. Das ist kein Branchenbenchmark.',a.ebitdaMargin);
    if(a.equityRatio !== null && a.equityRatio < 20) add('warning','Eigenkapitalquote prüfen','Die Eigenkapitalquote liegt unter dem internen Prüfwert von 20 %.',a.equityRatio);
    if(a.revenue === 0) add('warning','Umsatzdaten fehlen','Ohne valide Umsatzwerte sind Quoten und Vergleiche nicht aussagekräftig.');
    if(!out.length) add('success','Keine auffälligen Prüfregeln ausgelöst','Die hinterlegten Schwellenwerte wurden nicht überschritten. Das ersetzt keine professionelle Prüfung.');
    return out;
  }
  function simulate(current, p) {
    const a=finance(current);
    const price=Number(p.price)||0,volume=Number(p.volume)||0,material=Number(p.material)||0,personnel=Number(p.personnel)||0,overhead=Number(p.overhead)||0;
    const hires=Math.max(0,Math.floor(Number(p.hires)||0));
    const monthlyGross=nonnegative(p.monthlyGross),employerFactor=nonnegative(p.employerFactor)||1.30;
    const nextRevenue=a.revenue*(1+price/100)*(1+volume/100);
    const nextMaterial=a.material*(1+volume/100)*(1+material/100);
    const extraStaff=hires*monthlyGross*14*employerFactor;
    const nextPersonnel=a.personnel*(1+personnel/100)+extraStaff;
    const nextOverhead=a.overhead*(1+overhead/100);
    const nextEbitda=nextRevenue-nextMaterial-nextPersonnel-nextOverhead;
    const nextEbit=a.depreciation===null?null:nextEbitda-a.depreciation;
    return {...a,revenue:nextRevenue,material:nextMaterial,personnel:nextPersonnel,overhead:nextOverhead,extraStaff,
      ebitda:nextEbitda,ebit:nextEbit,ebt:nextEbit===null||a.interest===null?null:nextEbit-a.interest,ebitdaMargin:ratio(nextEbitda,nextRevenue),
      deltaEbitda:nextEbitda-a.ebitda,deltaRevenue:nextRevenue-a.revenue};
  }
  function hourly(p) {
    const annualStaff=nonnegative(p.annualStaff),annualOverhead=nonnegative(p.annualOverhead);
    const productiveHours=nonnegative(p.productiveHours),margin=Math.min(95,Math.max(0,Number(p.targetMargin)||0));
    const hourlyCost=productiveHours>0?(annualStaff+annualOverhead)/productiveHours:null;
    const price=hourlyCost===null?null:hourlyCost/(1-margin/100);
    const markup=Math.max(-100,Number(p.materialMarkup)||0);
    return {hourlyCost,price,annualCosts:annualStaff+annualOverhead,hours:productiveHours,margin,
      materialSellingPrice:100*(1+markup/100),materialGrossMargin:ratio(markup,100+markup)};
  }
  function plan(p) {
    const units=nonnegative(p.unitsPerMonth),unitPrice=nonnegative(p.unitPrice),unitCost=nonnegative(p.unitCost);
    const baseFixed=nonnegative(p.monthlyFixed)*12, growth=(Number(p.unitsGrowth)||0)/100,priceGrowth=(Number(p.priceGrowth)||0)/100;
    const fixedGrowth=(Number(p.fixedGrowth)||0)/100,investment=nonnegative(p.investment),equity=nonnegative(p.equity),loan=nonnegative(p.loan);
    const apr=Math.max(0,(Number(p.loanInterest)||0)/100),term=Math.max(1,Math.round(Number(p.loanYears)||5));
    const tax=Math.min(1,Math.max(0,(Number(p.taxPct)||0)/100));
    const annuity=loan===0?0:apr===0?loan/term:(loan*apr/(1-Math.pow(1+apr,-term)));
    let balance=loan, liquidity=equity+loan-investment;
    const result=[];
    for(let y=1;y<=3;y++) {
      const annualUnits=units*12*Math.pow(1+growth,y-1);
      const price=unitPrice*Math.pow(1+priceGrowth,y-1);
      const revenue=annualUnits*price, variableCost=annualUnits*unitCost;
      const fixedCost=baseFixed*Math.pow(1+fixedGrowth,y-1);
      const ebitda=revenue-variableCost-fixedCost;
      const depreciation=investment/5;
      const interest=balance*apr,principal=Math.min(balance,Math.max(0,annuity-interest));
      const ebt=ebitda-depreciation-interest;
      const taxes=Math.max(0,ebt)*tax,net=ebt-taxes;
      const cashFlow=net+depreciation-principal;
      liquidity+=cashFlow; balance=Math.max(0,balance-principal);
      result.push({year:y,units:annualUnits,revenue,variableCost,fixedCost,ebitda,depreciation,interest,ebt,taxes,net,loanPrincipal:principal,annualCashFlow:cashFlow,endCash:liquidity,loanBalance:balance});
    }
    const unitContribution=unitPrice-unitCost;
    const breakEvenUnits=unitContribution>0?baseFixed/unitContribution:null;
    return {years:result,initialCash:equity+loan-investment,breakEvenUnits,unitContribution,annuity};
  }
  function validate(row) {
    const issues=[];
    if(!Number.isInteger(Number(row.year)) || Number(row.year)<2000 || Number(row.year)>2100) issues.push('Ungültiges Jahr.');
    KEYS.forEach(k => {if(optional.includes(k) && (row[k]===null || row[k]===undefined || row[k]==='')) return; if(row[k]==null || !Number.isFinite(Number(row[k])) || Number(row[k])<0) issues.push(LABELS[k]+' muss eine nichtnegative Zahl sein.');});
    if(row.equity!=null && row.assets!=null && Number(row.assets)>0 && Number(row.equity)>Number(row.assets)) issues.push('Eigenkapital übersteigt Bilanzsumme. Bitte kontrollieren.');
    if(row.cash!=null && row.assets!=null && Number(row.assets)>0 && Number(row.cash)>Number(row.assets)) issues.push('Liquide Mittel übersteigen Bilanzsumme. Bitte kontrollieren.');
    if(Number(row.revenue)===0) issues.push('Umsatzerlöse sind 0. Quoten nicht darstellbar.');
    return issues;
  }
  const ALIASES={year:['jahr','year','geschaeftsjahr','geschäftsjahr'],revenue:['revenue','umsatz','umsatzerloese','umsatzerlöse','erlöse'],material:['material','materialaufwand','wareneinsatz','bezogeneleistungen'],personnel:['personnel','personal','personalaufwand','personalkosten'],overhead:['overhead','sonstigeaufwendungen','sonstigerbetriebsaufwand','sonstigebetrieblicheaufwendungen'],depreciation:['depreciation','afa','abschreibungen'],interest:['interest','zinsen','zinsaufwand'],taxes:['taxes','ertragsteuern','steuern'],cash:['cash','liquidemittel','liquiditaet','liquidität','bank'],receivables:['receivables','forderungen','fll','forderungenauslieferungenundleistungen'],inventory:['inventory','vorraete','vorräte','lager'],payables:['payables','vll','verbindlichkeitenauslieferungenundleistungen'],currentLiabilities:['currentliabilities','kurzfristigeverbindlichkeiten'],debt:['debt','finanzverbindlichkeiten','bankverbindlichkeiten'],equity:['equity','eigenkapital'],assets:['assets','bilanzsumme','gesamtvermoegen','gesamtvermögen']};
  function normalize(s){return String(s||'').trim().toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');}
  function parseCsv(text) {
    const first=text.split(/\r?\n/).find(x=>x.trim())||'';
    const sep=[';',',','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
    const rows=[];let field='',fields=[],quotes=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){if(quotes&&text[i+1]==='"'){field+='"';i++;}else quotes=!quotes;}
      else if(ch===sep&&!quotes){fields.push(field);field='';}
      else if((ch==='\n'||ch==='\r')&&!quotes){if(ch==='\r'&&text[i+1]==='\n')i++; fields.push(field);if(fields.some(v=>v.trim()))rows.push(fields);field='';fields=[];}
      else field+=ch;
    }
    if(quotes)throw new Error('CSV enthält ein nicht geschlossenes Anführungszeichen.');
    fields.push(field);if(fields.some(v=>v.trim()))rows.push(fields);
    if(rows.length<2)throw new Error('CSV benötigt Kopfzeile und mindestens eine Datenzeile.');
    const mapping=rows[0].map(h=>{const clean=normalize(h);return Object.keys(ALIASES).find(key=>ALIASES[key].some(alias=>normalize(alias)===clean))||null;});
    const mapped=mapping.filter(Boolean);
    if(new Set(mapped).size!==mapped.length)throw new Error('CSV enthält mehrfach zugeordnete Spalten. Jede Finanzposition darf nur einmal vorkommen.');
    if(!mapping.includes('year')||!mapping.includes('revenue'))throw new Error('Spalten "Jahr" und "Umsatz" sind erforderlich. Bitte die CSV-Vorlage verwenden.');
    const warnings=[];
    const records=rows.slice(1).map((r,i)=>{
      const out={}; KEYS.forEach(k=>out[k]=optional.includes(k)?null:0);
      mapping.forEach((key,j)=>{if(!key)return;const value=numbers(r[j]);if(value===null){if(String(r[j]||'').trim()) warnings.push('Zeile '+(i+2)+': ungültiger Zahlenwert bei '+LABELS[key]);return;}out[key]=value;});
      if(!Number.isInteger(out.year)||out.year<2000||out.year>2100)throw new Error('Ungültiges Jahr in Zeile '+(i+2));
      for(const k of ['revenue','material','personnel','overhead']) if(out[k]===null || r[mapping.indexOf(k)]==null || String(r[mapping.indexOf(k)]).trim()==='')throw new Error('GuV-Pflichtfeld '+LABELS[k]+' fehlt in Zeile '+(i+2));
      return out;
    });
    if(new Set(records.map(r=>r.year)).size!==records.length) throw new Error('CSV enthält doppelte Jahresangaben.');
    if(warnings.length)throw new Error(warnings.slice(0,4).join(' · '));
    return {records:records.sort((a,b)=>a.year-b.year),missing:KEYS.filter(k=>!mapping.includes(k))};
  }
  function quality(records, missingFields=[]) {
    const issues=[]; const list=Array.isArray(records)?records:[];
    if(!list.length) return {score:0,issues:[{level:'critical',message:'Keine Geschäftsjahre vorhanden.'}],status:'unvollständig'};
    const required=['revenue','material','personnel','overhead'];
    for(const r of list){
      for(const k of required) if(r[k]===undefined||r[k]===null||!Number.isFinite(Number(r[k]))) issues.push({level:'critical',message:`${r.year}: ${LABELS[k]} fehlt oder ist ungültig.`});
      const other=optional.filter(k=>r[k]===null||r[k]===undefined||r[k]==='');
      if(other.length) issues.push({level:'warning',message:`${r.year}: ${other.length} optionale Finanzpositionen fehlen (${other.map(k=>LABELS[k]).join(', ')}).`});
      if(r.revenue > 0 && r.material+r.personnel+r.overhead > r.revenue*2) issues.push({level:'warning',message:`${r.year}: Kosten übersteigen 200 % des Umsatzes – bitte Datenzuordnung kontrollieren.`});
      if(r.assets!=null && r.cash!=null && r.cash>r.assets) issues.push({level:'critical',message:`${r.year}: Liquide Mittel übersteigen die Bilanzsumme.`});
    }
    if(list.length<2) issues.push({level:'info',message:'Nur ein Jahr vorhanden – kein Vorjahresvergleich möglich.'});
    const score=Math.max(0,100-issues.filter(x=>x.level==='critical').length*35-issues.filter(x=>x.level==='warning').length*12-issues.filter(x=>x.level==='info').length*5);
    return {score,issues,status:issues.some(x=>x.level==='critical')?'prüfen':issues.some(x=>x.level==='warning')?'eingeschränkt':'plausibel'};
  }
  function scenarioSummary(row, parameters){const initial=finance(row),result=simulate(row,parameters);return {base:initial.ebitda,updated:result.ebitda,delta:result.deltaEbitda,margin:result.ebitdaMargin,revenue:result.revenue};}
  return {quality,scenarioSummary,KEYS,LABELS,numbers,finance,compare,insights,simulate,hourly,plan,validate,parseCsv,safeDiv,ratio};
});
