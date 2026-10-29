// Section 13 rent increase date checker (England, private rented sector).
// Works out the earliest date a new rent can start under a Form 4A notice, the
// last day to serve the notice for a chosen date, and whether a date you've
// picked is valid. Runs in the browser and in node (module.exports) for tests.
// Nothing typed is sent anywhere.
// Rules (checked 29 Oct 2026):
// Housing Act 1988 s13(2), (3A), (3B), (4A) as amended by the Renters' Rights Act 2025
//   (legislation.gov.uk/ukpga/1988/50/section/13, in force 1 May 2026)
// Form 4A (05.26), Note A: 2 months' notice; 52 weeks from the tenancy start; 52 weeks
//   (or 53) from the last increase; starts on the first day of a rent period
// gov.uk/guidance/assured-tenancy-forms (1 May 2026), Assured periodic tenancies: a guide
//   for landlords (rent increases, 20 Oct 2026), apply-for-an-open-market-rent-determination
//   (10 Aug 2026), s14ZB (tribunal rent never above the proposed rent; hardship: up to 2 months)
// Service dates: hand delivery or leaving it at the address counts that day; email the
// same working day (next working day if sent on a weekend or bank holiday); first class
// post the second working day after posting, the usual rule in court (CPR 6.26).
(function () {
  var DAY = 86400000;
  // England and Wales bank holidays (gov.uk/bank-holidays.json, 29 Oct 2026). Add a year each autumn.
  var HOLIDAYS = {
    "2026-01-01": 1, "2026-04-03": 1, "2026-04-06": 1, "2026-05-04": 1, "2026-05-25": 1, "2026-08-31": 1, "2026-12-25": 1, "2026-12-28": 1,
    "2027-01-01": 1, "2027-03-26": 1, "2027-03-29": 1, "2027-05-03": 1, "2027-05-31": 1, "2027-08-30": 1, "2027-12-27": 1, "2027-12-28": 1,
    "2028-01-03": 1, "2028-04-14": 1, "2028-04-17": 1, "2028-05-01": 1, "2028-05-29": 1, "2028-08-28": 1, "2028-12-25": 1, "2028-12-26": 1
  };
  var HOLIDAYS_TO = "2028-12-31";
  var RRA_START = "2026-05-01";
  var PERIODS = {
    week: { days: 7, label: "week", adj: "weekly" },
    fortnight: { days: 14, label: "fortnight", adj: "fortnightly" },
    "4week": { days: 28, label: "4 weeks", adj: "every 4 weeks" },
    month: { months: 1, label: "month", adj: "monthly" }
  };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Dates are whole days held as UTC midnight milliseconds.
  function parse(s) {
    if (s === undefined || s === null || s === "") return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
    if (!m) return NaN;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(t);
    if (d.getUTCDate() !== +m[3] || d.getUTCMonth() !== +m[2] - 1) return NaN;
    return t;
  }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function nice(t) {
    var d = new Date(t);
    return WEEKDAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }
  function addDays(t, n) { return t + n * DAY; }
  function daysIn(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function working(t) { var w = new Date(t).getUTCDay(); return w !== 0 && w !== 6 && !HOLIDAYS[iso(t)]; }

  // The same day number `months` later. If that month is too short, the 1st of the
  // month after: the safe reading of "two months after" (31 Dec -> 1 Mar).
  function addMonthsSafe(t, months) {
    var d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    if (day > daysIn(y, m)) return Date.UTC(y, m + 1, 1);
    return Date.UTC(y, m, day);
  }

  // When the notice counts as served, from the day it's handed over, emailed or posted.
  function servedOn(t, method) {
    if (method === "post") {
      var n = 0;
      while (n < 2) { t = addDays(t, 1); if (working(t)) n++; }
      return t;
    }
    if (method === "email") { while (!working(t)) t = addDays(t, 1); return t; }
    return t; // by hand, or left at the tenant's address
  }

  // Rent periods start on the tenancy start date and every period after it. Monthly
  // tenancies keep the start day; a day the month doesn't have becomes its last day.
  function periodStartOnOrAfter(start, period, t) {
    var p = PERIODS[period];
    if (t <= start) return start;
    if (p.days) {
      var k = Math.ceil((t - start) / (p.days * DAY));
      return addDays(start, k * p.days);
    }
    var s = new Date(start), sd = s.getUTCDate();
    var d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth();
    for (var i = 0; i < 3; i++) {
      var c = Date.UTC(y, m, Math.min(sd, daysIn(y, m)));
      if (c >= t) return c;
      m++; if (m > 11) { m = 0; y++; }
    }
    return null;
  }
  function isPeriodStart(start, period, t) { return t >= start && periodStartOnOrAfter(start, period, t) === t; }

  // The anniversary of `first` closest to `t` (29 February becomes 28 February).
  function nearestAnniversary(first, t) {
    var f = new Date(first), y = new Date(t).getUTCFullYear(), best = null;
    for (var yy = y - 1; yy <= y + 1; yy++) {
      if (yy < f.getUTCFullYear()) continue;
      var a = Date.UTC(yy, f.getUTCMonth(), Math.min(f.getUTCDate(), daysIn(yy, f.getUTCMonth())));
      if (best === null || Math.abs(a - t) < Math.abs(best - t)) best = a;
    }
    return best;
  }

  // Earliest date the next increase can take effect after one that took effect on `last`.
  // s13(3A)/(3B): 52 weeks, or 53 if the 53rd week would begin more than six days before
  // the anniversary of the first increase after 11 February 2003.
  // The rule assumes increases stay near that anniversary. If the nearest one is more
  // than 3 weeks from the 52-week date, the wording can be read either way, so we use
  // the safe answer (53 weeks) and say so (unclear: true).
  function afterLast(last, first) {
    var d52 = addDays(last, 364), weeks = 52, anniv = null, unclear = false;
    if (first !== null && first !== undefined && first < last) {
      anniv = nearestAnniversary(first, d52);
      var gap = (anniv - d52) / DAY;
      if (Math.abs(gap) > 21) { unclear = true; weeks = 53; }
      else if (gap > 6) weeks = 53;
    }
    return { date: addDays(last, weeks * 7), weeks: weeks, anniversary: anniv, unclear: unclear, date52: d52 };
  }

  function num(v) {
    if (v === undefined || v === null || v === "") return null;
    var n = Number(String(v).replace(/[£,\s]/g, ""));
    return isFinite(n) && n >= 0 ? n : NaN;
  }
  function money(n) {
    var r = (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "");
    return "£" + r.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // input: {
  //   tenancyStart: "YYYY-MM-DD" (Form 4A question 4.2),
  //   period: "month" | "week" | "fortnight" | "4week" (anything longer: error),
  //   lastIncrease: date the last increase took effect (4.3), optional,
  //   firstIncrease: first increase after 11 February 2003 (4.4), optional,
  //   serve: date you'll hand over, email or post the notice (default: today),
  //   method: "hand" | "email" | "post",
  //   target: date you'd like the new rent to start, optional,
  //   currentRent, newRent: per period, optional,
  //   today: override for tests
  // }
  function check(input) {
    var period = input.period || "month";
    if (period === "quarter" || period === "year")
      return { error: "Form 4A says the rent period must be a month or less. Since 1 May 2026, tenancies in England pay rent monthly or more often; if yours still says quarterly or yearly, get advice before serving a notice." };
    if (!PERIODS[period]) return { error: "Choose how often the rent is due." };
    var start = parse(input.tenancyStart);
    if (start === null) return { error: "Enter the date the tenancy started (Form 4A question 4.2)." };
    if (isNaN(start)) return { error: "Enter the tenancy start date as a full date." };
    var last = parse(input.lastIncrease), first = parse(input.firstIncrease), target = parse(input.target);
    var today = parse(input.today) || parse(new Date().toISOString().slice(0, 10));
    var serve = parse(input.serve);
    if (serve === null) serve = today;
    if ([last, first, target, serve].some(function (x) { return typeof x === "number" && isNaN(x); }))
      return { error: "One of the dates isn't a real date. Check them and try again." };
    if (last !== null && last < start) return { error: "The last increase can't be before the tenancy started." };
    if (first !== null && last === null) last = first;
    if (first !== null && first > last) return { error: "The first increase (question 4.4) can't be after the most recent one (4.3)." };
    var method = input.method || "hand";
    var p = PERIODS[period], notes = [], warnings = [];

    function floorFor(serveDay) {
      var served = servedOn(serveDay, method);
      var rules = [
        { key: "notice", what: "2 months after the notice is served (" + nice(served) + ")", date: addMonthsSafe(served, 2) },
        { key: "first-year", what: "52 weeks after the tenancy started", date: addDays(start, 364) }
      ];
      if (last !== null) {
        var a = afterLast(last, first);
        rules.push({ key: "last", what: a.weeks + " weeks after the last increase took effect", date: a.date, weeks: a.weeks, anniversary: a.anniversary, unclear: a.unclear, date52: a.date52 });
      }
      var f = rules[0];
      rules.forEach(function (r) { if (r.date > f.date) f = r; });
      return { served: served, rules: rules, binding: f, floor: f.date };
    }

    var now = floorFor(serve);
    var earliest = periodStartOnOrAfter(start, period, now.floor);
    // Latest day to hand over / send the notice and still start on `day`.
    function serveBy(day) {
      for (var s = day; s > day - 120 * DAY; s = addDays(s, -1)) {
        if (addMonthsSafe(servedOn(s, method), 2) <= day) return s;
      }
      return null;
    }
    var out = {
      period: period, periodLabel: p.label, tenancyStart: iso(start), method: method,
      served: iso(now.served), servedNice: nice(now.served),
      rules: now.rules.map(function (r) { return { key: r.key, what: r.what, date: iso(r.date), nice: nice(r.date), weeks: r.weeks }; }),
      binding: now.binding.key,
      earliest: iso(earliest), earliestNice: nice(earliest),
      serveByEarliest: null, target: null, next: null, rent: null, notes: notes, warnings: warnings
    };
    var sb = serveBy(earliest);
    if (sb !== null) out.serveByEarliest = { date: iso(sb), nice: nice(sb) };

    if (period === "month" && new Date(start).getUTCDate() > 28)
      warnings.push("Your tenancy started on the " + ordinal(new Date(start).getUTCDate()) + ". In shorter months we've used the last day of the month as the start of the rent period. Check what your tenancy agreement says the rent day is, and use that date if it differs.");
    if (serve < today)
      warnings.push("The serving date is in the past. If you've already served the notice, these dates show whether it works; if not, put in the day you'll actually serve it.");
    if (method === "post")
      notes.push("Posted notices: we've counted it as served on the second working day after posting (" + nice(now.served) + "). Form 4A says to use a method in your tenancy agreement, or hand it over, leave it at the address or send it by registered post. Keep proof either way.");
    if (method === "email")
      notes.push("Email only counts if your tenancy agreement allows notices by email. Send it before 4.30pm on a working day and keep the sent email with the attachment.");
    if (last !== null && last < parse(RRA_START))
      notes.push("Your last increase took effect before 1 May 2026. It still counts: the next one can't start until at least 52 weeks after it, whether it came from a Form 4 notice or a rent review clause.");
    var a52 = now.rules.filter(function (r) { return r.key === "last"; })[0];
    if (a52 && a52.unclear)
      notes.push("52 or 53 weeks? Your increases haven't stayed close to the anniversary of the first one (question 4.4, " + nice(a52.anniversary) + " is the nearest), and the law can be read either way in that case. We've used 53 weeks to be safe. With 52 weeks the floor would be " + nice(a52.date52) + ". If that matters, check with an adviser.");
    else if (a52 && a52.weeks === 53)
      notes.push("53 weeks, not 52: the 52-week date would be more than six days before the anniversary of your first increase (" + nice(a52.anniversary) + "), so Form 4A Note A3 adds a week. This stops the date drifting earlier each year.");

    if (target !== null) {
      var reasons = [];
      now.rules.forEach(function (r) { if (target < r.date) reasons.push("it's before " + nice(r.date) + ", " + r.what); });
      var ps = isPeriodStart(start, period, target);
      if (!ps) {
        var nxt = periodStartOnOrAfter(start, period, target);
        reasons.push("it isn't the first day of a rent period" + (nxt ? " (the next one starts " + nice(nxt) + ")" : ""));
      }
      var tsb = serveBy(target);
      out.target = {
        date: iso(target), nice: nice(target), ok: reasons.length === 0, reasons: reasons,
        serveBy: tsb !== null && ps ? { date: iso(tsb), nice: nice(tsb), past: tsb < today } : null
      };
    }

    var eff = out.target && out.target.ok ? target : earliest;
    var nx = afterLast(eff, first);
    if (nx.unclear) notes.push("For the increase after this one, we've used 53 weeks: this date isn't close to the anniversary of your first increase, so 52 or 53 weeks could apply.");
    var nxt2 = periodStartOnOrAfter(start, period, nx.date);
    out.next = { date: iso(nxt2), nice: nice(nxt2) };
    if (last === null && first === null)
      notes.push("This will be the first increase since 11 February 2003, so on future notices put " + nice(eff) + " in question 4.4.");

    var cur = num(input.currentRent), nw = num(input.newRent);
    if (isNaN(cur) || isNaN(nw)) return { error: "Enter rents as numbers, e.g. 950." };
    if (cur !== null && nw !== null) {
      if (nw <= cur) warnings.push("The new rent isn't higher than the current rent. A rent cut doesn't need Form 4A: agree it with your tenant in writing.");
      var perYear = p.days ? 365 / p.days : 12;
      var diff = nw - cur;
      out.rent = {
        current: cur, proposed: nw, diff: diff, pct: cur > 0 ? Math.round(diff / cur * 1000) / 10 : null,
        perYear: Math.round(diff * perYear), monthly: p.days ? Math.round(nw * 365 / p.days / 12 * 100) / 100 : null
      };
    }
    if (iso(eff) > HOLIDAYS_TO) notes.push("Bank holidays after 2028 aren't in the tool yet, so working days only skip weekends.");
    out.form = {
      q41: cur !== null ? money(cur) + " per " + p.label : "your current rent, per " + p.label,
      q42: nice(start),
      q43: last !== null ? nice(last) : "leave blank (no increase yet)",
      q44: first !== null ? nice(first) : (last !== null ? nice(last) + " if that was the first increase since 11 February 2003; otherwise the date of the first one" : "leave blank"),
      q45: nw !== null ? money(nw) + " per " + p.label : "the new rent, per " + p.label,
      q46: nice(eff)
    };
    out.effective = { date: iso(eff), nice: nice(eff) };
    return out;
  }
  function ordinal(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  function letter(r, names) {
    var e = r.effective.nice.replace(/^\w+ /, "");
    var rent = r.rent ? money(r.rent.proposed) + " per " + r.periodLabel + " (from " + money(r.rent.current) + ")" : "[new rent] per " + r.periodLabel;
    return "Dear " + (names || "[tenant name(s)]") + ",\n\n" +
      "I'm writing about the rent for [address]. I'm proposing to change the rent to " + rent + ", starting on " + e + ".\n\n" +
      "The formal notice, Form 4A (Landlord's notice proposing a new rent), is with this letter. It explains what you can do if you don't agree, including asking the First-tier Tribunal to decide the open market rent before " + e + ".\n\n" +
      "[One or two sentences on why, e.g. what similar homes nearby are let for, or rising costs.]\n\n" +
      "If you'd like to talk about it, or you're worried about paying, please get in touch on [phone/email]. I'd rather hear from you early.\n\n" +
      "Kind regards,\n[your name]";
  }

  var api = { check: check, letter: letter, servedOn: servedOn, addMonthsSafe: addMonthsSafe, periodStartOnOrAfter: periodStartOnOrAfter, afterLast: afterLast, parse: parse, iso: iso };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }

  function render(r) {
    if (r.error) return "<p class=\"ri-err\"><strong>" + esc(r.error) + "</strong></p>";
    var h = "";
    if (r.target) {
      if (r.target.ok) {
        h += "<p class=\"ri-ok\"><strong>Yes: " + esc(r.target.nice) + " works</strong>, if the notice is served by " + esc(r.target.serveBy ? r.target.serveBy.nice : "") + ".";
        if (r.target.serveBy && r.target.serveBy.past) h += " That date has passed, so this start date only works if the notice has already been served.";
        h += "</p>";
      } else {
        h += "<p class=\"ri-no\"><strong>" + esc(r.target.nice) + " won't work:</strong> " + esc(r.target.reasons.join("; ")) + ".</p>";
      }
    }
    h += "<p class=\"ri-big\">Earliest start date for the new rent: <strong>" + esc(r.earliestNice) + "</strong></p>";
    if (r.serveByEarliest) h += "<p>To keep that date, serve the notice by <strong>" + esc(r.serveByEarliest.nice) + "</strong>" + (r.method === "post" ? " (the day you post it)" : "") + ".</p>";
    h += "<table class=\"ri-t\"><tr><th>Rule</th><th>Not before</th></tr>";
    r.rules.forEach(function (x) { h += "<tr" + (x.key === r.binding ? " class=\"tot\"" : "") + "><td>" + esc(x.what) + "</td><td>" + esc(x.nice) + "</td></tr>"; });
    h += "<tr><td>Then the first day of a rent period on or after that</td><td><strong>" + esc(r.earliestNice) + "</strong></td></tr></table>";
    if (r.rent) {
      h += "<p><strong>The increase:</strong> " + money(r.rent.current) + " to " + money(r.rent.proposed) + " per " + esc(r.periodLabel) +
        (r.rent.pct !== null ? ", " + (r.rent.pct > 0 ? "+" : "") + r.rent.pct + "%" : "") + ", about " + money(r.rent.perYear) + " a year" +
        (r.rent.monthly ? " (about " + money(r.rent.monthly) + " a month)" : "") + ".</p>";
    }
    r.warnings.forEach(function (w) { h += "<p class=\"ri-warn\">" + esc(w) + "</p>"; });
    r.notes.forEach(function (n) { h += "<p class=\"ri-note\">" + esc(n) + "</p>"; });
    h += "<p><strong>Filling in Form 4A:</strong></p><table class=\"ri-t\">" +
      "<tr><td>4.1 Current rent</td><td>" + esc(r.form.q41) + "</td></tr>" +
      "<tr><td>4.2 The tenancy started on</td><td>" + esc(r.form.q42) + "</td></tr>" +
      "<tr><td>4.3 Most recent rent increase</td><td>" + esc(r.form.q43) + "</td></tr>" +
      "<tr><td>4.4 First increase after 11 February 2003</td><td>" + esc(r.form.q44) + "</td></tr>" +
      "<tr><td>4.5 Proposed new rent</td><td>" + esc(r.form.q45) + "</td></tr>" +
      "<tr><td>4.6 The new rent will start on</td><td><strong>" + esc(r.form.q46) + "</strong></td></tr></table>";
    h += "<p>After this one, the next increase could start on <strong>" + esc(r.next.nice) + "</strong> at the earliest.</p>";
    h += "<p class=\"ri-small\">Dates worked out from what you typed and the rules on gov.uk. General information, not legal advice. For Wales, Scotland, Northern Ireland, social housing or anything unusual, see the notes below.</p>";
    return h;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("ri-form");
    if (!form) return;
    var out = document.getElementById("ri-out"), lw = document.getElementById("ri-letter-wrap"), lt = document.getElementById("ri-letter");
    function v(id) { var el = document.getElementById(id); return el ? el.value : ""; }
    var sv = document.getElementById("ri-serve");
    if (sv && !sv.value) sv.value = new Date().toISOString().slice(0, 10);
    function read() {
      return { tenancyStart: v("ri-start"), period: v("ri-period"), lastIncrease: v("ri-last"), firstIncrease: v("ri-first"),
        serve: v("ri-serve"), method: v("ri-method"), target: v("ri-target"), currentRent: v("ri-cur"), newRent: v("ri-new") };
    }
    function run(e) {
      if (e) e.preventDefault();
      var r = check(read());
      out.innerHTML = render(r);
      if (lw) { lw.hidden = !!r.error; if (!r.error) lt.value = letter(r); }
    }
    form.addEventListener("submit", run);
    var ex = document.getElementById("ri-example");
    if (ex) ex.addEventListener("click", function () {
      var set = { "ri-start": "2024-03-20", "ri-period": "month", "ri-last": "2026-01-20", "ri-first": "2025-01-20", "ri-target": "", "ri-cur": "1050", "ri-new": "1110", "ri-method": "post" };
      Object.keys(set).forEach(function (k) { document.getElementById(k).value = set[k]; });
      run();
    });
    var cp = document.getElementById("ri-copy");
    if (cp) cp.addEventListener("click", function () {
      lt.select();
      var done = function () { cp.textContent = "Copied"; setTimeout(function () { cp.textContent = "Copy the letter"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(lt.value).then(done, function () { document.execCommand("copy"); done(); });
      else { document.execCommand("copy"); done(); }
    });
  });
})();
