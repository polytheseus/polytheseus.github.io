// Landlord tax 2026/27 vs 2027/28: what the new property income rates cost you.
// Works out Income Tax on the same figures in both years, the part of it that
// comes from the rental, the extra tax a year and a month, and the rent rise
// that would cover it. Runs in the browser and in node (module.exports) for
// tests. Nothing typed is sent anywhere.
// Rules from gov.uk (checked 31 Oct 2026):
// Budget 2026 OOTLAR 1.2 + Annex A (28 Oct 2026): property basic/higher/additional
//   rates 24% / 44% / 49% from 6 April 2027 (England, Wales, NI); main rates
//   20/40/45; bands £37,700 / £125,140 and the £12,570 Personal Allowance
//   (tapered £1 per £2 over £100,000) unchanged in both years.
// HMRC "Income Tax: Changes to Tax rates for Property, Savings and Dividend
//   Income" (27 Nov 2025): from April 2027 allowances are set against other
//   income before property income; finance cost relief is given at the
//   property basic rate.
// Finance cost relief cap (lower of finance costs, property profits, adjusted
//   total income over the Personal Allowance): ITTOIA 2005 s272A-272B,
//   gov.uk/guidance/changes-to-tax-relief-for-residential-landlords-how-its-worked-out-including-case-studies
(function () {
  var PA = 12570, TAPER_FROM = 100000, BASIC = 37700, HIGHER_TO = 125140;
  var YEARS = {
    "2026-27": { label: "2026 to 2027", main: [0.20, 0.40, 0.45], prop: [0.20, 0.40, 0.45], credit: 0.20 },
    "2027-28": { label: "2027 to 2028", main: [0.20, 0.40, 0.45], prop: [0.24, 0.44, 0.49], credit: 0.24 }
  };
  var PER = { month: 12, year: 1 };

  function num(v) {
    if (v === undefined || v === null || v === "") return 0;
    var n = Number(String(v).replace(/[£,\s]/g, ""));
    return isFinite(n) && n >= 0 ? n : NaN;
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function money(n, pence) {
    var neg = n < 0; n = Math.abs(n);
    var s = pence && Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n));
    var p = s.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "−£" : "£") + p.join(".");
  }

  function personalAllowance(total) {
    return Math.max(0, PA - Math.floor(Math.max(0, total - TAPER_FROM) / 2));
  }

  // Tax on a slice of taxable income running from `from` to `from + amount`.
  function slice(from, amount, rates) {
    var bands = [[0, BASIC, rates[0]], [BASIC, HIGHER_TO, rates[1]], [HIGHER_TO, Infinity, rates[2]]];
    var tax = 0, parts = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      var lo = Math.max(from, bands[i][0]), hi = Math.min(from + amount, bands[i][1]);
      if (hi > lo) { parts[i] = hi - lo; tax += (hi - lo) * bands[i][2]; }
    }
    return { tax: tax, parts: parts };
  }

  // other: wages, pensions, self-employed profit (non-savings, a year)
  // profit: rental profit before finance costs; finance: finance costs (incl. brought forward)
  function taxFor(yearKey, other, profit, finance) {
    var y = YEARS[yearKey];
    var total = other + profit;
    var pa = personalAllowance(total);
    // Allowance against other income first (the 2027/28 rule). In 2026/27 rental profit is taxed at the
    // main rates, so the order makes no difference to the total.
    var paOther = Math.min(pa, other), paProp = Math.min(pa - paOther, profit);
    var tOther = other - paOther, tProp = profit - paProp;
    var o = slice(0, tOther, y.main), p = slice(tOther, tProp, y.prop);
    var before = o.tax + p.tax;
    var base = Math.min(finance, profit, Math.max(0, total - pa));
    var credit = Math.min(y.credit * base, before);
    return {
      year: yearKey, label: y.label, pa: pa, taxableOther: tOther, taxableProperty: tProp,
      propertyBands: p.parts, otherTax: r2(o.tax), propertyTax: r2(p.tax), creditRate: y.credit,
      creditBase: base, credit: r2(credit), unusedFinance: Math.max(0, finance - base),
      tax: r2(before - credit)
    };
  }

  // input: { other, rent, rentPer: "month"|"year", costs (a year), interest, interestPer, broughtForward, scottish }
  function calc(input) {
    if (input.scottish) return { error: "This calculator uses the rates for England, Wales and Northern Ireland. Scottish taxpayers pay Scottish rates on rental profit in 2026 to 2027, and the Scottish Parliament can set its own property rates from 2027 to 2028, which it hasn't announced yet." };
    var other = num(input.other), rent = num(input.rent), costs = num(input.costs), interest = num(input.interest), bf = num(input.broughtForward);
    if ([other, rent, costs, interest, bf].some(isNaN)) return { error: "Enter amounts as numbers, e.g. 1150 or 32,000." };
    var rp = PER[input.rentPer || "month"], ip = PER[input.interestPer || "month"];
    if (!rp || !ip) return { error: "Choose month or year." };
    rent *= rp; interest *= ip;
    if (rent <= 0) return { error: "Enter the rent you receive (your share)." };
    var profit = Math.max(0, rent - costs);
    var loss = rent - costs < 0 ? costs - rent : 0;
    var finance = interest + bf;
    var cash = rent - costs - interest;

    var out = { rent: r2(rent), costs: r2(costs), interest: r2(interest), broughtForward: bf, profit: r2(profit), loss: r2(loss), cash: r2(cash), other: other, years: {} };
    Object.keys(YEARS).forEach(function (k) {
      var withRent = taxFor(k, other, profit, finance), without = taxFor(k, other, 0, 0);
      withRent.rentalTax = r2(withRent.tax - without.tax);
      withRent.taxWithoutRent = without.tax;
      withRent.keep = r2(cash - withRent.rentalTax);
      withRent.shareOfCash = cash > 0 ? withRent.rentalTax / cash : null;
      out.years[k] = withRent;
    });
    var a = out.years["2026-27"], b = out.years["2027-28"];
    out.extra = r2(b.rentalTax - a.rentalTax);
    out.extraMonth = r2(out.extra / 12);
    out.riseYear = riseNeeded(other, rent, costs, finance, a.rentalTax);
    out.riseMonth = r2(out.riseYear / 12);
    out.notes = notes(out, other, profit, finance);
    return out;
  }

  // The extra rent a year (same costs) that leaves you with the same money after tax in 2027/28 as in 2026/27.
  function riseNeeded(other, rent, costs, finance, rentalTax2627) {
    function gap(d) {
      var p = Math.max(0, rent + d - costs);
      var t = taxFor("2027-28", other, p, finance).tax - taxFor("2027-28", other, 0, 0).tax;
      return d - (t - rentalTax2627);
    }
    if (gap(0) >= 0) return 0;
    var lo = 0, hi = 1000;
    while (gap(hi) < 0 && hi < 1e7) hi *= 2;
    for (var i = 0; i < 60 && hi - lo > 0.5; i++) { var m = (lo + hi) / 2; if (gap(m) < 0) lo = m; else hi = m; }
    return Math.ceil(hi);
  }

  function notes(o, other, profit, finance) {
    var n = [], a = o.years["2026-27"], b = o.years["2027-28"];
    if (o.loss > 0) n.push("Your costs are more than your rent, so there's a rental loss of " + money(o.loss) + ". No tax on the rental either year; the loss carries forward against future rental profit.");
    if (b.unusedFinance > 0.5 && o.interest + o.broughtForward > 0) n.push(money(b.unusedFinance) + " of finance costs can't be used this year (the credit is capped at your rental profit and your income over the Personal Allowance). It carries forward to next year's rental profit.");
    if (o.cash <= 0 && b.rentalTax > 0) n.push("After mortgage interest you're not making money in cash terms, but you still pay tax: the mortgage interest only gets a basic-rate credit, it isn't deducted. This is the 'Section 24' effect, and the new rates make it bigger.");
    if (a.pa < PA) n.push("Your income is over £100,000, so your Personal Allowance is cut to " + money(a.pa) + " (£1 for every £2 over). Rental profit in this range costs more than the headline rates.");
    if (other < PA && profit > 0) n.push("From 2027 to 2028 your Personal Allowance is used against your other income first and only what's left covers rental profit. With other income under " + money(PA) + " that makes no difference to the total allowance, but the taxed part of your income is now rental profit at 24%, not 20%.");
    if (b.propertyBands[1] > 0 && a.creditBase > 0) n.push("You pay 44% on some rental profit but the mortgage interest credit is only 24%. Paying down the mortgage or moving the property into a company changes this, but both have big costs of their own: get advice before acting.");
    if (o.extra <= 0 && profit > 0) n.push(b.creditBase >= profit && b.taxableProperty > 0
      ? "On these figures the change makes no difference: your mortgage interest is at least your rental profit, so the 4-point rise in the rates is matched by the rise in the credit from 20% to 24%."
      : "On these figures the change makes no difference, because your Personal Allowance covers the rental profit.");
    return n;
  }

  var api = { calc: calc, taxFor: taxFor, personalAllowance: personalAllowance, money: money, YEARS: YEARS };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function pct(x) { return x === null ? "n/a" : Math.round(x * 100) + "%"; }

  function result(r) {
    if (r.error) return "<p class=\"lm-err\"><strong>" + esc(r.error) + "</strong></p>";
    var a = r.years["2026-27"], b = r.years["2027-28"], h = "";
    if (r.extra > 0) {
      h += "<p class=\"lm-yes\"><strong>About " + money(r.extra) + " more tax a year on your rental from April 2027 (" + money(r.extraMonth) + " a month).</strong> " +
        "Tax on your rental goes from " + money(a.rentalTax) + " in 2026 to 2027 to " + money(b.rentalTax) + " in 2027 to 2028, on the same figures. " +
        "To stand still you'd need about " + money(r.riseMonth) + " a month more rent (" + money(r.riseYear) + " a year), because the extra rent is taxed too.</p>";
    } else {
      h += "<p class=\"lm-no\"><strong>No extra tax on these figures.</strong> Tax on your rental is " + money(b.rentalTax) + " in both years.</p>";
    }
    h += "<div class=\"scroll\"><table class=\"lm-t\"><tr><th></th><th class=\"n\">2026 to 2027</th><th class=\"n\">2027 to 2028</th></tr>";
    function row(label, x, y, cls) { h += "<tr" + (cls ? " class=\"" + cls + "\"" : "") + "><td>" + label + "</td><td class=\"n\">" + x + "</td><td class=\"n\">" + y + "</td></tr>"; }
    row("Rent (a year)", money(r.rent), money(r.rent));
    row("Costs, not counting mortgage interest", money(r.costs), money(r.costs));
    row("Rental profit (taxed)", money(r.profit), money(r.profit));
    row("Rates on rental profit", "20% / 40% / 45%", "24% / 44% / 49%");
    row("Personal Allowance", money(a.pa), money(b.pa));
    row("Mortgage interest credit", a.creditBase > 0 ? money(a.credit, true) + " (20%)" : "£0", b.creditBase > 0 ? money(b.credit, true) + " (24%)" : "£0");
    row("Income Tax on everything", money(a.tax, true), money(b.tax, true));
    row("Income Tax without the rental", money(a.taxWithoutRent, true), money(b.taxWithoutRent, true));
    row("Tax caused by the rental", money(a.rentalTax, true), money(b.rentalTax, true), "tot");
    row("Cash left after costs and interest, before tax", money(r.cash), money(r.cash));
    row("Tax as a share of that cash", pct(a.shareOfCash), pct(b.shareOfCash));
    row("What you keep after tax", money(a.keep, true), money(b.keep, true), "tot");
    h += "</table></div>";
    r.notes.forEach(function (n) { h += "<p class=\"lm-note\">" + esc(n) + "</p>"; });
    h += "<p class=\"lm-small\">An estimate on the same figures for both years, using the rates announced at Budget 2026 (not law until Finance Bill 2026-27 passes). England, Wales and Northern Ireland. It leaves out savings, dividends, pension contributions, Gift Aid, the property allowance, student loans and the High Income Child Benefit Charge. Not tax advice: check with an accountant before acting.</p>";
    return h;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("lt-form");
    if (!form) return;
    var out = document.getElementById("lt-out");
    function v(id) { var el = document.getElementById(id); return el ? (el.type === "checkbox" ? el.checked : el.value) : ""; }
    function read() {
      return { other: v("lt-other"), rent: v("lt-rent"), rentPer: v("lt-rent-per"), costs: v("lt-costs"),
        interest: v("lt-int"), interestPer: v("lt-int-per"), broughtForward: v("lt-bf"), scottish: v("lt-scot") };
    }
    function run(e) { if (e) e.preventDefault(); out.innerHTML = result(calc(read())); }
    form.addEventListener("submit", run);
    var ex = document.getElementById("lt-example");
    if (ex) ex.addEventListener("click", function () {
      var set = { "lt-other": "60000", "lt-rent": "1500", "lt-rent-per": "month", "lt-costs": "3000", "lt-int": "600", "lt-int-per": "month", "lt-bf": "" };
      Object.keys(set).forEach(function (k) { document.getElementById(k).value = set[k]; });
      document.getElementById("lt-scot").checked = false;
      run();
    });
  });
})();
