/* Deterministic planning models. EUR, annual periods, net of VAT. No I/O. */
(function (root, factory) {
  const base = typeof module === 'object' && module.exports ? require('./engine.js') : root.SoloEngine;
  const models = factory(base);
  if (typeof module === 'object' && module.exports) module.exports = models;
  root.SoloModels = models;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';
  const known = n => n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));
  function check(errors, value, label, min, max, integer = false) {
    if (!known(value) || Number(value) < min || Number(value) > max || (integer && !Number.isInteger(Number(value)))) {
      errors.push(`${label}: ${integer ? 'ganze Zahl' : 'Zahl'} zwischen ${min} und ${max} erforderlich.`);
    }
    return Number(value);
  }
  function dcf(p = {}) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
    const errors = [], warnings = [];
    const revenue = check(errors, p.revenue, 'Basisumsatz', 1, 1e12);
    check(errors, p.baseYear, 'Basisjahr', 2000, 2100, true);
    const openingWC = check(errors, p.openingWC, 'Working Capital zu Beginn', -1e12, 1e12);
    const tax = check(errors, p.taxPct, 'Plansteuersatz (%)', 0, 100) / 100;
    const wacc = check(errors, p.wacc, 'WACC (%)', 0.1, 50) / 100;
    const g = check(errors, p.terminalGrowth, 'Ewiges Wachstum (%)', 0, 10) / 100;
    const roic = check(errors, p.terminalRoic, 'Nachhaltiger ROIC (%)', 0.1, 100) / 100;
    const cash = check(errors, p.cash, 'Überschüssige liquide Mittel', 0, 1e12);
    const debt = check(errors, p.debt, 'Finanzschulden', 0, 1e12);
    const adjustments = check(errors, p.adjustments, 'Sonstige Wertkorrekturen', -1e12, 1e12);
    if (!(wacc > g)) errors.push('WACC muss größer als das ewige Wachstum sein.');
    if (!(roic > g)) errors.push('Nachhaltiger ROIC muss größer als das ewige Wachstum sein.');
    if (!Array.isArray(p.years) || p.years.length < 3 || p.years.length > 10) errors.push('Drei bis zehn explizite Planjahre sind erforderlich.');
    const inputYears = Array.isArray(p.years) ? p.years : [];
    inputYears.forEach((y, i) => {
      if (!y || typeof y !== 'object') { errors.push(`Jahr ${i + 1}: Planannahmen fehlen.`); return; }
      check(errors, y.growth, `Jahr ${i + 1}: Umsatzwachstum (%)`, -95, 200);
      check(errors, y.ebitMargin, `Jahr ${i + 1}: EBIT-Marge (%)`, -100, 100);
      ['daPct', 'capexPct'].forEach(k => check(errors, y[k], `Jahr ${i + 1}: ${k === 'daPct' ? 'Abschreibungen' : 'Investitionen'} (% Umsatz)`, 0, 100));
      check(errors, y.wcPct, `Jahr ${i + 1}: operatives NWC (% Umsatz)`, -100, 100);
    });
    if (inputYears.length && Number(inputYears.at(-1)?.ebitMargin) <= 0) errors.push('Für den nachhaltigen Endwert muss das letzte Planjahr eine positive EBIT-Marge haben.');
    if (errors.length) return { valid: false, errors, warnings, years: [], enterpriseValue: null, equityValue: null };
    let sales = revenue, priorWC = openingWC;
    const years = inputYears.map((y, i) => {
      sales *= 1 + Number(y.growth) / 100;
      const ebit = sales * Number(y.ebitMargin) / 100;
      const taxes = Math.max(0, ebit) * tax; // No loss carryforwards or immediate tax refunds.
      const nopat = ebit - taxes;
      const depreciation = sales * Number(y.daPct) / 100;
      const capex = sales * Number(y.capexPct) / 100;
      const wc = sales * Number(y.wcPct) / 100, deltaWC = wc - priorWC;
      const fcff = nopat + depreciation - capex - deltaWC;
      const discountFactor = 1 / Math.pow(1 + wacc, i + 1);
      priorWC = wc;
      return { year: Number(p.baseYear) + i + 1, revenue: sales, ebit, taxes, nopat, depreciation, capex, wc, deltaWC, fcff, discountFactor, pv: fcff * discountFactor };
    });
    const last = years.at(-1);
    const terminalNopat = last.revenue * (1 + g) * Number(inputYears.at(-1).ebitMargin) / 100 * (1 - tax);
    // Sustainable reinvestment replaces the explicit-period capex/WC assumptions.
    const terminalReinvestment = terminalNopat * g / roic;
    const terminalFcff = terminalNopat - terminalReinvestment;
    const terminalValue = terminalFcff / (wacc - g);
    const terminalPV = terminalValue * last.discountFactor;
    const forecastPV = years.reduce((sum, y) => sum + y.pv, 0);
    const enterpriseValue = forecastPV + terminalPV;
    const equityValue = enterpriseValue + cash - debt + adjustments;
    const terminalShare = enterpriseValue > 0 ? terminalPV / enterpriseValue * 100 : null;
    if (terminalShare > 75) warnings.push('Mehr als 75 % des Unternehmenswerts stammen aus dem Endwert. WACC, Wachstum und nachhaltige Marge besonders sorgfältig prüfen.');
    if (equityValue < 0) warnings.push('Der rechnerische Eigenkapitalwert ist negativ. Dies ist kein automatisch realisierbarer Kaufpreis.');
    if (years.some(y => y.fcff < 0)) warnings.push('Mindestens ein Planjahr hat negativen freien Cashflow und damit operativen Finanzierungsbedarf vor Finanzierung.');
    if (g > wacc - 0.02) warnings.push('WACC und ewiges Wachstum liegen nahe beieinander; der Endwert reagiert besonders empfindlich.');
    return { valid: true, errors, warnings, years, terminalNopat, terminalReinvestment, terminalFcff, terminalValue, terminalPV, forecastPV, enterpriseValue, equityValue, terminalShare, netDebt: debt - cash };
  }
  function dcfSensitivity(p) {
    if (!dcf(p).valid) return { waccs: [], growths: [], values: [] };
    const waccs = [-2, -1, 0, 1, 2].map(d => Number(p.wacc) + d);
    const growths = [-1, -0.5, 0, 0.5, 1].map(d => Number(p.terminalGrowth) + d);
    return { waccs, growths, values: growths.map(terminalGrowth => waccs.map(wacc => {
      const result = dcf({ ...p, wacc, terminalGrowth });
      return result.valid ? result.equityValue : null;
    })) };
  }
  function hourlyDetailed(p = {}) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) p = {};
    const errors = [], warnings = [];
    check(errors, p.targetMargin, 'Zielmarge auf Stundenumsatz (%)', 0, 90);
    check(errors, p.riskPct, 'Kalkulatorische Reserve (%)', 0, 50);
    check(errors, p.currentRate, 'Aktueller Netto-Stundensatz', 0, 10000);
    ['materialCost', 'subcontractCost'].forEach(k => check(errors, p[k], k === 'materialCost' ? 'Materialeinstand' : 'Fremdleistungseinstand', 0, 1e10));
    ['materialMarkup', 'subcontractMarkup'].forEach(k => check(errors, p[k], k === 'materialMarkup' ? 'Materialaufschlag (%)' : 'Fremdleistungsaufschlag (%)', 0, 200));
    const overheadKeys = ['ownerPay', 'admin', 'premises', 'vehicles', 'equipment', 'insurance', 'software', 'sales', 'other'];
    overheadKeys.forEach(k => check(errors, p.overheads?.[k], 'Gemeinkosten / ' + k, 0, 1e10));
    if (!Array.isArray(p.teams) || !p.teams.length || p.teams.length > 20) errors.push('Eine bis zwanzig Mitarbeitergruppen sind erforderlich.');
    const teams = (Array.isArray(p.teams) ? p.teams : []).map((t, i) => {
      const label = `Gruppe ${i + 1}`;
      if (!t || typeof t !== 'object') { errors.push(label + ': Angaben fehlen.'); return {}; }
      if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 80) errors.push(label + ': Bezeichnung mit 1–80 Zeichen erforderlich.');
      check(errors, t.fte, label + ': Vollzeitäquivalente', 0.01, 10000);
      check(errors, t.monthlyGross, label + ': Monatsbrutto', 0, 1e6);
      check(errors, t.salaries, label + ': Bezüge pro Jahr', 1, 16);
      check(errors, t.employerPct, label + ': Dienstgeberzuschlag (%)', 0, 150);
      check(errors, t.benefits, label + ': Zusatzkosten pro FTE/Jahr', 0, 1e6);
      check(errors, t.weeklyHours, label + ': Wochenstunden je Vollzeitkraft', 1, 60);
      const absences = ['vacation', 'holidays', 'sick', 'training', 'internal'].reduce((sum, k) => sum + check(errors, t[k], label + ': Ausfalltage / ' + k, 0, 260), 0);
      check(errors, t.utilization, label + ': Verrechenbarkeit (%)', 0, 100);
      if (absences >= 260) errors.push(label + ': Ausfalltage müssen in Summe unter 260 Arbeitstagen liegen.');
      const paidHours = Number(t.weeklyHours) * 52 * Number(t.fte);
      const availableHours = (260 - absences) * Number(t.weeklyHours) / 5 * Number(t.fte);
      const billableHours = availableHours * Number(t.utilization) / 100;
      const annualCost = (Number(t.monthlyGross) * Number(t.salaries) * (1 + Number(t.employerPct) / 100) + Number(t.benefits)) * Number(t.fte);
      return { ...t, absences, paidHours, availableHours, billableHours, annualCost };
    });
    if (errors.length) return { valid: false, errors, warnings, teams: [], price: null };
    const paidHours = teams.reduce((s, t) => s + t.paidHours, 0);
    const availableHours = teams.reduce((s, t) => s + t.availableHours, 0);
    const hours = teams.reduce((s, t) => s + t.billableHours, 0);
    const staffCost = teams.reduce((s, t) => s + t.annualCost, 0);
    const overhead = overheadKeys.reduce((s, k) => s + Number(p.overheads[k]), 0);
    const annualCosts = staffCost + overhead;
    const reserve = annualCosts * Number(p.riskPct) / 100;
    const materialContribution = Number(p.materialCost) * Number(p.materialMarkup) / 100;
    const subcontractContribution = Number(p.subcontractCost) * Number(p.subcontractMarkup) / 100;
    const otherContribution = materialContribution + subcontractContribution;
    const recovery = Math.max(0, annualCosts + reserve - otherContribution);
    const hourlyCost = hours > 0 ? recovery / hours : null;
    const price = hourlyCost === null ? null : hourlyCost / (1 - Number(p.targetMargin) / 100);
    const currentRevenue = Number(p.currentRate) * hours;
    const currentProfit = currentRevenue + otherContribution - annualCosts;
    const currentAfterReserve = currentProfit - reserve;
    const breakEvenHours = Number(p.currentRate) > 0 ? recovery / Number(p.currentRate) : null;
    if (hours <= 0) warnings.push('Ohne verrechenbare Stunden lässt sich kein Stundensatz berechnen. Verrechenbarkeit und Ausfallzeiten prüfen.');
    if (otherContribution > annualCosts + reserve) warnings.push('Material- und Fremdleistungsdeckungsbeiträge decken bereits den gesamten Kostenbedarf. Die Stundenuntergrenze beträgt im Modell 0 €. Abgrenzung prüfen.');
    if (breakEvenHours !== null && breakEvenHours > availableHours) warnings.push('Die Kostendeckung zum aktuellen Satz würde mehr als alle verfügbaren Anwesenheitsstunden erfordern.');
    return { valid: true, errors, warnings, teams, paidHours, availableHours, hours, staffCost, overhead, annualCosts, reserve, materialContribution, subcontractContribution, otherContribution, recovery, hourlyCost, price, currentRevenue, currentProfit, currentAfterReserve, breakEvenHours, utilization: paidHours > 0 ? hours / paidHours * 100 : null, gap: price === null ? null : price - Number(p.currentRate) };
  }
  function hourlySensitivity(p) {
    if (!hourlyDetailed(p).valid) return [];
    return [-10, -5, 0, 5, 10].map(change => {
      const teams = p.teams.map(t => ({ ...t, utilization: Number(t.utilization) + change }));
      const r = hourlyDetailed({ ...p, teams });
      return { change, valid: r.valid, hours: r.hours ?? null, price: r.price };
    });
  }
  function simulate(row, p = {}) {
    const base = E.finance(row);
    const r = E.simulate(row, p);
    const productivity = Number(p.productivity ?? 0) / 100;
    const serviceShare = Number(p.serviceShare ?? 60) / 100;
    r.revenue *= 1 + productivity * serviceShare;
    const materialShare = Number(p.materialVariableShare ?? 100) / 100;
    r.material = base.material * (1 + Number(p.volume ?? 0) / 100 * materialShare) * (1 + Number(p.material ?? 0) / 100);
    r.overhead = base.overhead * (1 + Number(p.overhead ?? 0) / 100) * (1 + Number(p.volume ?? 0) / 100 * Number(p.overheadVariableShare ?? 0) / 100);
    r.ebitda = r.revenue - r.material - r.personnel - r.overhead;
    r.deltaRevenue = r.revenue - base.revenue;
    r.deltaEbitda = r.ebitda - base.ebitda;
    r.ebitdaMargin = E.ratio(r.ebitda, r.revenue);
    const investment = Number(p.investment ?? 0), life = Number(p.investmentYears ?? 5);
    r.extraDepreciation = investment / life;
    r.ebit = base.ebit === null ? null : r.ebitda - base.depreciation - r.extraDepreciation;
    r.ebt = r.ebit === null || base.interest === null ? null : r.ebit - base.interest;
    r.taxDelta = r.ebit === null ? null : (Math.max(0, r.ebit) - Math.max(0, base.ebit)) * Number(p.taxPct ?? 23) / 100;
    r.deltaWC = null;
    if (base.wc !== null && base.revenue > 0 && base.material > 0) {
      const receivables = Math.max(0, base.receivables * r.revenue / base.revenue - Number(p.collectionDays ?? 0) * r.revenue / 365);
      const inventory = Math.max(0, base.inventory * r.material / base.material - Number(p.inventoryDays ?? 0) * r.material / 365);
      const payables = base.payables * r.material / base.material + Number(p.paymentDays ?? 0) * r.material / 365;
      r.deltaWC = receivables + inventory - payables - base.wc;
    }
    r.cashImpact = r.deltaWC === null || r.taxDelta === null ? null : r.deltaEbitda - r.taxDelta - r.deltaWC - investment;
    return r;
  }
  function scenarioSummary(row, p) {
    const r = simulate(row, p);
    return { base: E.finance(row).ebitda, updated: r.ebitda, delta: r.deltaEbitda, margin: r.ebitdaMargin, revenue: r.revenue, cashImpact: r.cashImpact };
  }
  // CSV export must not turn names imported from backups into spreadsheet formulas.
  function csvCell(value) {
    let text = typeof value === 'number' ? String(value).replace('.', ',') : String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return { dcf, dcfSensitivity, hourlyDetailed, hourlySensitivity, simulate, scenarioSummary, csvCell };
});
