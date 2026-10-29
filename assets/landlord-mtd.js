// Making Tax Digital for landlords: the qualifying income test.
// Adds up the income HMRC counts (gross rent and self-employment turnover, your
// share only), compares it with the threshold for the year, and gives the start
// date and first deadlines. Runs in the browser and in node (module.exports) for
// tests. Nothing typed is sent anywhere.
// Rules from gov.uk (checked 29 Oct 2026):
// /guidance/work-out-your-qualifying-income-for-making-tax-digital-for-income-tax (updated 11 Sep 2026)
// /guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax (26 Mar 2026)
// /guidance/find-out-if-you-can-get-an-exemption-from-making-tax-digital-for-income-tax (28 May 2026)
// /guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates (16 Oct 2026)
// /guidance/use-making-tax-digital-for-income-tax/create-digital-records (rent-a-room, allowances)
// /guidance/penalties-for-making-tax-digital-for-income-tax (30 Mar 2026)
// /rent-room-in-your-home (£7,500, or £3,750 if the income is shared)
(function () {
  // The return for `year` decides whether MTD applies from 6 April `start`.
  var YEARS = {
    "2024-25": { label: "2024 to 2025", over: 50000, start: 2026, due: "31 January 2026" },
    "2025-26": { label: "2025 to 2026", over: 30000, start: 2027, due: "31 January 2027" },
    "2026-27": { label: "2026 to 2027", over: 20000, start: 2028, due: "31 January 2028" }
  };
  var RENT_A_ROOM = 7500, RENT_A_ROOM_SHARED = 3750, ALLOWANCE = 1000, EXEMPT_AT_OR_BELOW = 20000;
  var PER = { month: 12, week: 52, year: 1 };

  function num(v) {
    if (v === undefined || v === null || v === "") return null;
    var n = Number(String(v).replace(/[£,\s]/g, ""));
    return isFinite(n) && n >= 0 ? n : NaN;
  }
  function round(n) { return Math.round(n * 100) / 100; }
  function money(n) {
    var r = Math.round(n);
    return "£" + r.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // input: {
  //   year: "2025-26",
  //   properties: [{ name, rent, per: "month"|"week"|"year", months (let this year, default 12), share (% yours, default 100) }],
  //   room: { amount (a year, gross), shared: bool },     rent-a-room in your own home
  //   foreign: amount a year (gross, your share),
  //   selfEmployed: amount a year (turnover of every sole-trader business),
  //   other: amount (wages, pensions, dividends, savings, partnership share: never counted),
  //   newLetting: months (if your first letting started this tax year: months let by 5 April),
  //   resident: bool (default true), sa109: bool, allStopped: bool
  // }
  function check(input) {
    var y = YEARS[input.year || "2025-26"];
    if (!y) return { error: "Pick a tax year." };
    var resident = input.resident !== false;
    var counted = [], excluded = [], notes = [];
    var uk = 0, any = false;

    var props = input.properties || [];
    for (var i = 0; i < props.length; i++) {
      var p = props[i], rent = num(p.rent);
      if (rent === null) continue;
      if (isNaN(rent)) return { error: "Enter rent as a number, e.g. 950." };
      var per = PER[p.per || "month"];
      if (!per) return { error: "Choose month, week or year for each rent." };
      var months = num(p.months), share = num(p.share);
      if (months === null) months = 12;
      if (share === null) share = 100;
      if (isNaN(months) || months > 12) return { error: "Months let must be between 0 and 12." };
      if (isNaN(share) || share > 100) return { error: "Your share must be between 0 and 100%." };
      var full = per === 1 ? rent * months / 12 : rent * per * months / 12;
      var yours = round(full * share / 100);
      var name = (p.name && String(p.name).trim()) || "Property " + (i + 1);
      counted.push({ what: name + (share < 100 ? " (your " + share + "% share)" : ""), amount: yours });
      uk += yours; any = true;
    }

    var room = input.room || {}, roomAmt = num(room.amount);
    if (isNaN(roomAmt)) return { error: "Enter the lodger income as a number." };
    if (roomAmt !== null && roomAmt > 0) {
      any = true;
      var limit = room.shared ? RENT_A_ROOM_SHARED : RENT_A_ROOM;
      if (roomAmt > limit) {
        counted.push({ what: "Room in your home (over the " + money(limit) + " Rent a Room limit, so it's on your return)", amount: round(roomAmt) });
        uk += roomAmt;
      } else {
        excluded.push({ what: "Room in your home (under the " + money(limit) + " Rent a Room limit)", amount: round(roomAmt),
          why: "Tax-free and not on your return if you didn't declare it, so it isn't in qualifying income. If you did put it on the return, it counts." });
      }
    }

    var foreign = num(input.foreign);
    if (isNaN(foreign)) return { error: "Enter foreign rent as a number." };
    if (foreign) {
      any = true;
      if (resident) { counted.push({ what: "Property abroad", amount: round(foreign) }); }
      else excluded.push({ what: "Property abroad", amount: round(foreign), why: "If you weren't UK resident, foreign rent you didn't declare on a UK return doesn't count." });
    }

    var newMonths = num(input.newLetting);
    if (isNaN(newMonths) || (newMonths !== null && (newMonths <= 0 || newMonths > 12))) return { error: "Months since your first letting started must be 1 to 12." };
    var propTotal = uk + (resident ? (foreign || 0) : 0);
    var annualised = null;
    if (newMonths && newMonths < 12 && propTotal > 0) {
      annualised = round(propTotal * 12 / newMonths);
      notes.push("Your letting started part-way through the year, so the rent is scaled up to a full year: " + money(propTotal) +
        " over " + newMonths + " month" + (newMonths === 1 ? "" : "s") + " is " + money(annualised) + " a year. HMRC says landlords must do this themselves.");
    }

    var se = num(input.selfEmployed);
    if (isNaN(se)) return { error: "Enter self-employment turnover as a number." };
    if (se) { counted.push({ what: "Self-employment turnover", amount: round(se) }); any = true; }

    var other = num(input.other);
    if (isNaN(other)) return { error: "Enter other income as a number." };
    if (other) excluded.push({ what: "Wages, pensions, dividends, savings, partnership share", amount: round(other), why: "Never part of qualifying income." });

    if (!any) return { error: "Enter at least one rent, or your self-employment turnover." };

    var total = round((annualised !== null ? annualised : propTotal) + (se || 0));
    var over = total > y.over;
    var r = { year: input.year || "2025-26", label: y.label, threshold: y.over, total: total, counted: counted, excluded: excluded,
      annualised: annualised, over: over, start: over ? y.start : null, margin: round(Math.abs(total - y.over)), notes: notes };

    if (propTotal > 0 && propTotal <= ALLOWANCE && !se) {
      notes.push("Rent of " + money(ALLOWANCE) + " or less can be covered by the property allowance. If you didn't declare it, it isn't on your return and doesn't count.");
    }
    if (total === y.over) notes.push("Exactly " + money(y.over) + " isn't over the threshold. Income has to be more than " + money(y.over) + ".");
    if (!over && total > y.over * 0.9) notes.push("You're within 10% of the threshold. Check you've used rent before expenses and agent fees, and only your share of joint lets.");
    if (input.allStopped) notes.push("If all your property and self-employment income has stopped, tell HMRC before it signs you up. gov.uk says you then won't need MTD.");

    if (over) {
      if (!resident || input.sa109) {
        if (r.start === 2026) {
          r.exemptUntil = 2027;
          notes.push("You included the SA109 residence page on your 2024 to 2025 return, so you're automatically exempt for 2026 to 2027. You're still in from 6 April 2027 if your 2025 to 2026 qualifying income is over £30,000.");
        } else {
          notes.push("The SA109 exemption only covered the 2026 to 2027 tax year. From 6 April 2027 it depends on your income, like everyone else.");
        }
      }
      r.timeline = timeline(r.start);
    } else {
      r.exempt = total <= EXEMPT_AT_OR_BELOW;
      if (r.year === "2025-26" && !r.exempt) r.nextCheck = { label: YEARS["2026-27"].label, over: YEARS["2026-27"].over, start: 2028 };
      if (r.year === "2024-25") r.nextCheck = { label: YEARS["2025-26"].label, over: YEARS["2025-26"].over, start: 2027 };
    }
    return r;
  }

  // What happens, in order, for someone who starts on 6 April `s`.
  function timeline(s) {
    return [
      { date: "31 January " + s, what: "File the " + (s - 2) + " to " + (s - 1) + " return as usual. HMRC uses it to decide, and writes if you're in (sign up anyway if no letter comes)." },
      { date: "Before 6 April " + s, what: "Sign up and pick HMRC-recognised software (or bridging software if you'll keep a spreadsheet)." },
      { date: "6 April " + s, what: "Start digital records of rent and expenses (1 April if your accounts run to 31 March)." },
      { date: "7 August " + s, what: "Quarterly update 1: 6 April to 5 July." },
      { date: "7 November " + s, what: "Quarterly update 2: the year so far, to 5 October." },
      { date: "31 January " + (s + 1), what: "File the " + (s - 1) + " to " + s + " return the usual way: the last one outside MTD." },
      { date: "7 February " + (s + 1), what: "Quarterly update 3: the year so far, to 5 January." },
      { date: "7 May " + (s + 1), what: "Quarterly update 4: the whole year, to 5 April." },
      { date: "31 January " + (s + 2), what: "Tax return for " + s + " to " + (s + 1) + " through your software, and pay as usual (31 January and 31 July)." }
    ];
  }

  var api = { check: check, timeline: timeline, money: money, YEARS: YEARS };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }

  function result(r) {
    if (r.error) return "<p class=\"lm-err\"><strong>" + esc(r.error) + "</strong></p>";
    var h = "";
    if (r.over) {
      h += "<p class=\"lm-yes\"><strong>Yes: on these figures you need MTD from 6 April " + r.start + ".</strong> Qualifying income for " + r.label +
        " is " + money(r.total) + ", which is " + money(r.margin) + " over the " + money(r.threshold) + " threshold." +
        (r.exemptUntil ? " (Exempt for 2026 to 2027 only: see the note below.)" : "") + "</p>";
    } else {
      h += "<p class=\"lm-no\"><strong>Not on these figures" + (r.year === "2026-27" ? "" : " for April " + YEARS[r.year].start) + ".</strong> Qualifying income for " + r.label +
        " is " + money(r.total) + ", " + (r.total === r.threshold ? "exactly at" : money(r.margin) + " under") + " the " + money(r.threshold) + " threshold. ";
      if (r.exempt) h += "At " + money(EXEMPT_AT_OR_BELOW) + " or less you're automatically exempt, unless your income goes up. You still file a Self Assessment return as normal.";
      else if (r.nextCheck) h += "Next test: " + r.nextCheck.label + ". If it's over " + money(r.nextCheck.over) + ", you're in from 6 April " + r.nextCheck.start + ".";
      h += "</p>";
    }
    h += "<table class=\"lm-t\"><tr><th>Counted</th><th class=\"n\">Amount</th></tr>";
    r.counted.forEach(function (c) { h += "<tr><td>" + esc(c.what) + "</td><td class=\"n\">" + money(c.amount) + "</td></tr>"; });
    if (r.annualised !== null) h += "<tr><td>Rent scaled to a full year</td><td class=\"n\">" + money(r.annualised) + "</td></tr>";
    h += "<tr class=\"tot\"><td>Qualifying income</td><td class=\"n\">" + money(r.total) + "</td></tr></table>";
    if (r.excluded.length) {
      h += "<p><strong>Not counted:</strong></p><ul>";
      r.excluded.forEach(function (x) { h += "<li>" + esc(x.what) + ", " + money(x.amount) + ". " + esc(x.why) + "</li>"; });
      h += "</ul>";
    }
    r.notes.forEach(function (n) { h += "<p class=\"lm-note\">" + esc(n) + "</p>"; });
    if (r.timeline) {
      h += "<p><strong>Your timeline:</strong></p><ol class=\"lm-tl\">";
      r.timeline.forEach(function (t) { h += "<li><strong>" + esc(t.date) + ":</strong> " + esc(t.what) + "</li>"; });
      h += "</ol>";
      if (r.start >= 2027) h += "<p class=\"lm-note\">From " + r.start + " to " + (r.start + 1) + ", each late quarterly update earns a penalty point and 4 points means a £200 penalty. The no-points year was 2026 to 2027 only.</p>";
    }
    h += "<p class=\"lm-small\">An estimate from what you typed, not tax advice. HMRC decides from your return; check with its own tool on gov.uk or an accountant.</p>";
    return h;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("lm-form");
    if (!form) return;
    var out = document.getElementById("lm-out");
    function v(id) { var el = document.getElementById(id); return el ? (el.type === "checkbox" ? el.checked : el.value) : ""; }
    function read() {
      var props = [];
      for (var i = 1; i <= 4; i++) {
        props.push({ name: v("lm-p" + i + "-name"), rent: v("lm-p" + i + "-rent"), per: v("lm-p" + i + "-per"),
          months: v("lm-p" + i + "-months"), share: v("lm-p" + i + "-share") });
      }
      return { year: v("lm-year"), properties: props, room: { amount: v("lm-room"), shared: v("lm-room-shared") },
        foreign: v("lm-foreign"), selfEmployed: v("lm-se"), other: v("lm-other"),
        newLetting: v("lm-new") ? v("lm-new-months") : "", resident: !v("lm-nonres"), sa109: v("lm-nonres"), allStopped: v("lm-stopped") };
    }
    function run(e) { if (e) e.preventDefault(); out.innerHTML = result(check(read())); }
    form.addEventListener("submit", run);
    var ex = document.getElementById("lm-example");
    if (ex) ex.addEventListener("click", function () {
      var set = { "lm-p1-name": "Flat, Leeds", "lm-p1-rent": "1150", "lm-p1-per": "month", "lm-p1-months": "11", "lm-p1-share": "100",
        "lm-p2-name": "House, Wakefield", "lm-p2-rent": "1400", "lm-p2-per": "month", "lm-p2-months": "12", "lm-p2-share": "50",
        "lm-se": "9200", "lm-other": "31000" };
      Object.keys(set).forEach(function (k) { document.getElementById(k).value = set[k]; });
      run();
    });
    var nw = document.getElementById("lm-new"), nwm = document.getElementById("lm-new-wrap");
    if (nw && nwm) { nwm.hidden = !nw.checked; nw.addEventListener("change", function () { nwm.hidden = !nw.checked; }); }
  });
})();
