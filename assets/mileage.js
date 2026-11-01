// Mileage allowance calculator: what you can claim for business miles in your
// own car, van, motorcycle or bike, in 2025/26, 2026/27 and 2027/28.
// Self-employed (simplified expenses) and employees (approved mileage rates,
// Mileage Allowance Relief). Runs in the browser and in node (module.exports)
// for tests. Nothing typed is sent anywhere.
// Rules from gov.uk and legislation.gov.uk (checked 1 Nov 2026):
// ITTOIA 2005 s94F: cars and goods vehicles 55p for the first 10,000 miles,
//   25p after (2026-27 on, Taxation (Energy and Vehicles) Act 2026 s2); the
//   10,000 is shared by all the trade's cars and vans (s94F(3)); motorcycles 24p.
// gov.uk/simpler-income-tax-simplified-expenses/vehicles- and BIM75005:
//   45p before 6 April 2026; a period of account uses the rates of the tax
//   year it's being taxed in, then apportioned.
// gov.uk/expenses-and-benefits-business-travel-mileage, 480 Appendix 3:
//   employees' approved amount 55p/25p (45p/25p before 6 April 2026),
//   motorcycles 24p, bikes 20p; all of one employment's cars and vans together.
// gov.uk/tax-relief-for-employees/vehicles-you-use-for-work: relief on the
//   approved amount minus what the employer paid; current + 4 previous years.
// Budget 2026 OOTLAR 2.7 (28 Oct 2026): above 10,000 miles 25p → 35p from
//   6 April 2027, AMAPs and simplified rates (announced, by statutory instrument).
// Class 4 NI 6% / 2% (Budget 2026 Annex A; same since 6 April 2024).
(function () {
  var YEARS = {
    "2025-26": { label: "2025 to 2026", first: 0.45, after: 0.25, moto: 0.24, bike: 0.20, announced: false },
    "2026-27": { label: "2026 to 2027", first: 0.55, after: 0.25, moto: 0.24, bike: 0.20, announced: false },
    "2027-28": { label: "2027 to 2028", first: 0.55, after: 0.35, moto: 0.24, bike: 0.20, announced: true }
  };
  var ORDER = ["2025-26", "2026-27", "2027-28"];
  var BAND = 10000;
  // Income Tax rate on the last £1 of profit → that plus Class 4 NI on the same £1.
  var SELF_RATE = { "0": 0, "0.2": 0.26, "0.4": 0.42, "0.45": 0.47 };
  var PER = { year: 1, month: 12 };

  function num(v) {
    if (v === undefined || v === null || v === "") return 0;
    var n = Number(String(v).replace(/[£,\s]/g, ""));
    return isFinite(n) && n >= 0 ? n : NaN;
  }
  function r2(x) { return Math.round(x * 100) / 100; }
  function money(x, pence) {
    var neg = x < 0; x = Math.abs(x);
    var s = pence && Math.round(x * 100) % 100 !== 0
      ? x.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : Math.round(x).toLocaleString("en-GB");
    return (neg ? "-£" : "£") + s;
  }

  // Cars and vans: the first 10,000 business miles at the higher rate, the rest at the lower.
  function carAmount(miles, y) {
    var top = Math.min(miles, BAND), rest = Math.max(0, miles - BAND);
    return { top: top, rest: rest, topAmount: r2(top * y.first), restAmount: r2(rest * y.after), total: r2(top * y.first + rest * y.after) };
  }

  function calc(i) {
    var who = i.who === "employee" ? "employee" : "self";
    var per = PER[i.per] || 1;
    var car = num(i.carMiles), moto = num(i.motoMiles), bike = who === "employee" ? num(i.bikeMiles) : 0;
    var paid = who === "employee" ? num(i.paid) : 0;
    if ([car, moto, bike, paid].some(isNaN)) return { error: "Please type the miles and amounts as numbers (for example 12000)." };
    car *= per; moto *= per; bike *= per;
    if (car + moto + bike === 0) return { error: "Type your business miles for at least one vehicle." };
    if (car > 200000 || moto > 200000 || bike > 50000) return { error: "That's a lot of business miles for one year: check the figure (it should be a year's miles, or a month's if you picked 'a month')." };
    var rate = Number(i.rate);
    if (!(String(rate) in SELF_RATE)) rate = 0.2;
    var o = { who: who, carMiles: car, motoMiles: moto, bikeMiles: bike, paid: paid, rate: rate, years: {} };
    ORDER.forEach(function (k) {
      var y = YEARS[k], c = carAmount(car, y), m = r2(moto * y.moto), b = r2(bike * y.bike);
      var total = r2(c.total + m + b), row = { key: k, label: y.label, announced: y.announced, rates: y, car: c, moto: m, bike: b, total: total };
      if (who === "self") {
        row.saving = r2(total * SELF_RATE[String(rate)]);
      } else {
        row.relief = r2(Math.max(0, total - paid));
        row.taxable = r2(Math.max(0, paid - total));
        row.saving = r2(row.relief * rate);
      }
      o.years[k] = row;
    });
    o.notes = notes(o);
    return o;
  }

  function notes(o) {
    var n = [], a = o.years["2025-26"], b = o.years["2026-27"], c = o.years["2027-28"];
    if (o.carMiles > 0) n.push("The rise from 45p to 55p on 6 April 2026 is worth 10p a mile on your first " + Math.min(o.carMiles, BAND).toLocaleString("en-GB") + " car or van miles: " + money(b.car.topAmount - a.car.topAmount) + " more a year than in 2025 to 2026" + (o.carMiles < BAND ? " (at most £1,000, at 10,000 miles)." : "."));
    if (o.carMiles > BAND) n.push("Above 10,000 miles you get 25p a mile now and 35p from April 2027 (announced at Budget 2026): " + money(c.car.restAmount - b.car.restAmount) + " more a year on your " + (o.carMiles - BAND).toLocaleString("en-GB") + " extra miles.");
    if (o.carMiles > 0 && o.who === "self") n.push("The 10,000 miles at the higher rate are for all your business's cars and vans together, not each vehicle. Motorcycles are 24p a mile whatever the mileage.");
    if (o.carMiles > 0 && o.who === "employee") n.push("The 10,000 miles count all the cars and vans you use for one job together. Two separate jobs count separately.");
    if (o.who === "employee" && o.paid > 0 && b.relief > 0 && a.relief === 0) n.push("Your employer's payments covered the approved amount for 2025 to 2026 but not the 55p rate: if they still pay 45p, you can claim the difference for 2026 to 2027.");
    if (o.who === "employee" && b.taxable > 0) n.push("Your employer pays more than the approved amount. The extra (" + money(b.taxable) + " in 2026 to 2027) is taxable: it should go through payroll or on a P11D.");
    if (o.who === "employee" && o.paid === 0) n.push("If your employer pays nothing for your miles, the whole approved amount is your Mileage Allowance Relief. You get tax back on it, not the amount itself.");
    if (o.who === "self" && o.rate === 0) n.push("If your profit is under the Personal Allowance there's no tax to save this year, but the claim still lowers your profit (it can create a loss to carry forward).");
    return n;
  }

  var api = { calc: calc, carAmount: carAmount, money: money, YEARS: YEARS };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
  function p(x) { return Math.round(x * 100) + "p"; }

  function result(r) {
    if (r.error) return "<p class=\"lm-err\"><strong>" + esc(r.error) + "</strong></p>";
    var a = r.years["2025-26"], b = r.years["2026-27"], c = r.years["2027-28"], h = "";
    if (r.who === "self") {
      h += "<p class=\"lm-no\"><strong>You can claim " + money(a.total, true) + " on your 2025 to 2026 return, " + money(b.total, true) + " for 2026 to 2027 and about " + money(c.total, true) + " for 2027 to 2028.</strong> " +
        (r.rate > 0 ? "At your rate that's roughly " + money(a.saving) + ", " + money(b.saving) + " and " + money(c.saving) + " less Income Tax and Class 4 National Insurance." : "") + "</p>";
    } else {
      h += b.relief > 0 || a.relief > 0
        ? "<p class=\"lm-no\"><strong>" + (a.relief > 0 ? "You can claim tax relief on " + money(a.relief, true) + " for 2025 to 2026 and " : "Nothing to claim for 2025 to 2026, but you can claim tax relief on ") + money(b.relief, true) + " for 2026 to 2027.</strong> " + (r.rate > 0 ? "At " + Math.round(r.rate * 100) + "% that's " + (a.relief > 0 ? money(a.saving, true) + " and " : "") + money(b.saving, true) + " of tax back." : "") + "</p>"
        : "<p class=\"lm-yes\"><strong>Nothing to claim:</strong> your employer already pays at least the approved amount.</p>";
    }
    h += "<div class=\"scroll\"><table class=\"lm-t\"><tr><th></th>";
    [a, b, c].forEach(function (y) { h += "<th class=\"n\">" + y.label + (y.announced ? "*" : "") + "</th>"; });
    h += "</tr>";
    function row(label, f, cls) { h += "<tr" + (cls ? " class=\"" + cls + "\"" : "") + "><td>" + label + "</td>"; [a, b, c].forEach(function (y) { h += "<td class=\"n\">" + f(y) + "</td>"; }); h += "</tr>"; }
    if (r.carMiles > 0) {
      row("Car or van: first " + Math.min(r.carMiles, BAND).toLocaleString("en-GB") + " miles", function (y) { return p(y.rates.first) + " = " + money(y.car.topAmount, true); });
      if (r.carMiles > BAND) row("Car or van: next " + (r.carMiles - BAND).toLocaleString("en-GB") + " miles", function (y) { return p(y.rates.after) + " = " + money(y.car.restAmount, true); });
    }
    if (r.motoMiles > 0) row("Motorcycle: " + r.motoMiles.toLocaleString("en-GB") + " miles", function (y) { return "24p = " + money(y.moto, true); });
    if (r.bikeMiles > 0) row("Bicycle: " + r.bikeMiles.toLocaleString("en-GB") + " miles", function (y) { return "20p = " + money(y.bike, true); });
    if (r.who === "self") {
      row("Vehicle expenses you can claim", function (y) { return money(y.total, true); }, "tot");
      if (r.rate > 0) row("Roughly saves (tax + Class 4 NI)", function (y) { return money(y.saving); });
    } else {
      row("Approved amount (tax-free limit)", function (y) { return money(y.total, true); }, "tot");
      if (r.paid > 0) row("Your employer paid", function () { return money(r.paid, true); });
      row("Mileage Allowance Relief to claim", function (y) { return money(y.relief, true); }, "tot");
      if (r.rate > 0) row("Tax back at " + Math.round(r.rate * 100) + "%", function (y) { return money(y.saving, true); });
      if (r.paid > 0 && (a.taxable > 0 || b.taxable > 0 || c.taxable > 0)) row("Taxable extra from your employer", function (y) { return money(y.taxable, true); });
    }
    h += "</table></div>";
    r.notes.forEach(function (n) { h += "<p class=\"lm-note\">" + esc(n) + "</p>"; });
    h += "<p class=\"lm-small\">* 2027 to 2028: 35p above 10,000 miles was announced at Budget 2026 and is due by regulations before April 2027. Same miles in every year. " +
      (r.who === "self" ? "The saving is a rough figure at the rate you picked (Income Tax plus 6% or 2% Class 4 NI) and assumes your profit stays in that band. Scottish taxpayers: pick the nearest rate." : "Tax relief can't be more than the tax you paid that year. Claim online or by post for up to 4 previous years, or on your tax return if you file one.") +
      " An estimate, not tax advice.</p>";
    return h;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("mi-form");
    if (!form) return;
    var out = document.getElementById("mi-out");
    function v(id) { var el = document.getElementById(id); return el ? el.value : ""; }
    function who() { var el = form.querySelector("input[name=mi-who]:checked"); return el ? el.value : "self"; }
    function sync() {
      var emp = who() === "employee";
      Array.prototype.forEach.call(form.querySelectorAll(".mi-emp"), function (el) { el.hidden = !emp; });
      document.getElementById("mi-rate-self").hidden = emp;
      document.getElementById("mi-rate-emp").hidden = !emp;
    }
    function read() {
      return { who: who(), per: v("mi-per"), carMiles: v("mi-car"), motoMiles: v("mi-moto"), bikeMiles: v("mi-bike"), paid: v("mi-paid"), rate: v("mi-rate") };
    }
    function run(e) { if (e) e.preventDefault(); out.innerHTML = result(calc(read())); }
    Array.prototype.forEach.call(form.querySelectorAll("input[name=mi-who]"), function (el) { el.addEventListener("change", function () { sync(); if (out.innerHTML) run(); }); });
    form.addEventListener("submit", run);
    var ex = document.getElementById("mi-example");
    if (ex) ex.addEventListener("click", function () {
      form.querySelector("input[name=mi-who][value=self]").checked = true; sync();
      var set = { "mi-per": "year", "mi-car": "16000", "mi-moto": "", "mi-bike": "", "mi-paid": "", "mi-rate": "0.2" };
      Object.keys(set).forEach(function (k) { document.getElementById(k).value = set[k]; });
      run();
    });
    sync();
  });
})();
