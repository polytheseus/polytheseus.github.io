// Landlord database (PRS Database, "Register your rental property") planner for England.
// Finds each property's regional registration window, works out the pro-rated first fee with
// the formula the service uses, and writes a per-property checklist. Runs in the browser and in
// node (module.exports) for tests. Nothing typed is sent anywhere.
// Rules (checked 30 Oct 2026): gov.uk/guidance/register-your-rental-property-service-guidance-for-landlords
//   (first published 29 Oct 2026) and its attachment "Regions of England and their local councils" (PDF).
// Fee: £65 per property per year, no VAT. Renewal date for every property = 1 year from the first
//   property registered. Formula: (fee / year_length) * (remaining_days - free_days), rounded down
//   to the penny; free_days = days before 15 November 2027. gov.uk examples: 15 Dec 2026 -> £5.34,
//   25 Jun 2027 -> £39.60.
// Upkeep: the fee (may change by regulations), new requirements (empty properties before
//   advertising, numbers in adverts), and any change to the windows or the council list.
(function () {
  var DAY = 86400000;
  var FEE = 65;
  var OPENS = "2026-12-15", CHARGING_FROM = "2027-11-15", ROLLOUT_END = "2027-11-14";
  var REGIONS = [
    { id: "wm", name: "West Midlands", start: "2026-12-15", end: "2027-03-14" },
    { id: "ee", name: "East of England", start: "2027-01-15", end: "2027-04-14" },
    { id: "em", name: "East Midlands", start: "2027-02-15", end: "2027-05-14" },
    { id: "se", name: "South East", start: "2027-03-15", end: "2027-06-14" },
    { id: "yh", name: "Yorkshire and the Humber", start: "2027-04-15", end: "2027-07-14" },
    { id: "nw", name: "North West", start: "2027-05-15", end: "2027-08-14" },
    { id: "ne", name: "North East", start: "2027-06-15", end: "2027-09-14" },
    { id: "ld", name: "London", start: "2027-07-15", end: "2027-10-14" },
    { id: "sw", name: "South West", start: "2027-08-15", end: "2027-11-14" }
  ];
  // County and unitary councils by region, from the gov.uk PDF (district councils sit inside
  // their county: Rugby is in Warwickshire).
  var COUNCILS = {
    em: ["Derby", "Derbyshire", "Leicester", "Leicestershire", "Lincolnshire", "North Northamptonshire", "Nottingham", "Nottinghamshire", "Rutland", "West Northamptonshire"],
    ee: ["Bedford", "Cambridgeshire", "Central Bedfordshire", "Essex", "Hertfordshire", "Luton", "Norfolk", "Peterborough", "Southend-on-Sea", "Suffolk", "Thurrock"],
    ld: ["City of London", "Barking and Dagenham", "Barnet", "Bexley", "Brent", "Bromley", "Camden", "Croydon", "Ealing", "Enfield", "Greenwich", "Hackney", "Hammersmith and Fulham", "Haringey", "Harrow", "Havering", "Hillingdon", "Hounslow", "Islington", "Kensington and Chelsea", "Kingston upon Thames", "Lambeth", "Lewisham", "Merton", "Newham", "Redbridge", "Richmond upon Thames", "Southwark", "Sutton", "Tower Hamlets", "Waltham Forest", "Wandsworth", "Westminster"],
    ne: ["Darlington", "Durham", "Gateshead", "Hartlepool", "Middlesbrough", "Newcastle upon Tyne", "North Tyneside", "Northumberland", "Redcar and Cleveland", "South Tyneside", "Stockton-on-Tees", "Sunderland"],
    nw: ["Blackburn with Darwen", "Blackpool", "Bolton", "Bury", "Cheshire East", "Cheshire West and Chester", "Cumberland", "Halton", "Knowsley", "Lancashire", "Liverpool", "Manchester", "Oldham", "Rochdale", "St Helens", "Salford", "Sefton", "Stockport", "Tameside", "Trafford", "Warrington", "Westmorland and Furness", "Wigan", "Wirral"],
    se: ["Bracknell Forest", "Brighton and Hove", "Buckinghamshire", "East Sussex", "Hampshire", "Isle of Wight", "Kent", "Medway", "Milton Keynes", "Oxfordshire", "Portsmouth", "Reading", "Windsor and Maidenhead", "Slough", "Southampton", "Surrey", "West Berkshire", "West Sussex", "Wokingham"],
    sw: ["Bath and North East Somerset", "Bournemouth, Christchurch and Poole", "Bristol", "Cornwall", "Isles of Scilly", "Devon", "Dorset", "Gloucestershire", "North Somerset", "Plymouth", "Somerset", "South Gloucestershire", "Swindon", "Torbay", "Wiltshire"],
    wm: ["Birmingham", "Coventry", "Dudley", "Herefordshire", "Sandwell", "Shropshire", "Solihull", "Staffordshire", "Stoke-on-Trent", "Telford and Wrekin", "Walsall", "Warwickshire", "Wolverhampton", "Worcestershire"],
    yh: ["Barnsley", "Bradford", "Calderdale", "York", "Doncaster", "East Riding of Yorkshire", "Hull (Kingston upon Hull)", "Kirklees", "Leeds", "North East Lincolnshire", "North Lincolnshire", "North Yorkshire", "Rotherham", "Sheffield", "Wakefield"]
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
    if (d.getUTCMonth() !== +m[2] - 1) return NaN;
    return t;
  }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function nice(t) { var d = new Date(t); return WEEKDAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function short(t) { var d = new Date(t); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function days(a, b) { return Math.round((b - a) / DAY); }
  // Same day next year; 29 February rolls to 1 March.
  function addYear(t) {
    var d = new Date(t), y = d.getUTCFullYear() + 1, m = d.getUTCMonth(), dd = d.getUTCDate();
    var r = Date.UTC(y, m, dd);
    return new Date(r).getUTCMonth() === m ? r : Date.UTC(y, m + 1, 1);
  }
  function region(id) { for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i]; return null; }

  // Find a council's region from what the user typed (case- and punctuation-insensitive).
  function norm(s) { return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/\b(city|county|borough|metropolitan|council|of|royal|district|the|london borough)\b/g, " ").replace(/[^a-z]+/g, " ").trim(); }
  function findCouncil(q) {
    var n = norm(q);
    if (!n) return null;
    var hits = [];
    Object.keys(COUNCILS).forEach(function (id) {
      COUNCILS[id].forEach(function (c) {
        var cn = norm(c);
        if (cn === n) hits.unshift({ council: c, region: id, exact: true });
        else if (n.length >= 3 && (cn.indexOf(n) === 0 || (" " + cn).indexOf(" " + n) >= 0)) hits.push({ council: c, region: id, exact: false });
      });
    });
    return hits;
  }

  // The service's fee formula. reg = date this property is registered; renewal = the landlord's
  // shared renewal date (1 year after their first property). Returns pounds, rounded down.
  function fee(regS, renewalS) {
    var reg = parse(regS), renewal = renewalS ? parse(renewalS) : addYear(reg);
    // year_length runs from the previous renewal date (for a first property, the day it's
    // registered) to the next one: 365 or 366.
    var prev = reg;
    if (renewalS) {
      var d = new Date(renewal), y = d.getUTCFullYear() - 1;
      prev = Date.UTC(y, d.getUTCMonth(), d.getUTCDate());
      if (new Date(prev).getUTCMonth() !== d.getUTCMonth()) prev = Date.UTC(y, d.getUTCMonth() + 1, 1);
    }
    var yearLength = days(prev, renewal);
    var remaining = days(reg, renewal);
    var free = Math.max(0, Math.min(remaining, days(reg, parse(CHARGING_FROM))));
    var pence = Math.floor(FEE * 100 * (remaining - free) / yearLength + 1e-9);
    return { pounds: pence / 100, yearLength: yearLength, remaining: remaining, free: free, renewal: iso(renewal) };
  }

  // input: { register: "YYYY-MM-DD", properties: [{ label, region, let: true|false, gas: true|false }], today }
  function plan(input) {
    var reg = parse(input.register), today = parse(input.today || iso(Date.now() - Date.now() % DAY));
    var props = (input.properties || []).filter(function (p) { return p && p.region; });
    if (!props.length) return { error: "Add at least one property and pick its region." };
    if (reg === null) return { error: "Pick the date you plan to register." };
    if (isNaN(reg)) return { error: "That registration date doesn't look right." };
    var opens = parse(OPENS);
    var warnings = [], notes = [];
    if (reg < opens) return { error: "The service opens on Tuesday 15 December 2026, so the earliest you can register is that day." };
    var out = [], letCount = 0, firstDeadline = null;
    props.forEach(function (p, i) {
      var r = region(p.region);
      if (!r) return;
      var end = parse(r.end), start = parse(r.start);
      var item = { label: p.label || ("Property " + (i + 1)), region: r.name, start: short(start), end: short(end), let: p.let !== false, gas: p.gas !== false };
      item.registerBy = short(end - 14 * DAY);
      if (item.let) {
        letCount++;
        if (firstDeadline === null || end < firstDeadline) firstDeadline = end;
        if (reg > end) { item.late = true; warnings.push(item.label + " (" + r.name + "): " + nice(reg) + " is after the window closes on " + nice(end) + ". If it's let, register as soon as the service lets you: not registering can mean a penalty of up to £7,000."); }
        else if (reg < start) item.early = true;
        else item.inWindow = true;
      }
      out.push(item);
    });
    var f = fee(input.register);
    // Only let properties have to be registered (and paid for) during the roll-out.
    var billable = letCount || out.length;
    var each = f.pounds, total = Math.round(each * billable * 100) / 100;
    // Compare: waiting until the last day of the earliest let window.
    var cmp = null;
    if (firstDeadline !== null && firstDeadline > reg) cmp = { date: short(firstDeadline), each: fee(iso(firstDeadline)).pounds };
    if (letCount === 0) notes.push("None of these properties is let. During the roll-out (15 December 2026 to 14 November 2027) you only have to register properties that are let or become let. Later, empty homes will have to be registered before they're advertised; gov.uk will update its guidance before that starts.");
    if (out.some(function (x) { return !x.let; }) && letCount > 0) notes.push("Properties that aren't let don't have to be registered yet. If one becomes let during the roll-out, it must be registered too: the safest time is before the tenancy starts (straight away if its region's window has already closed).");
    if (out.length > 1) notes.push("You can register all your properties on the same day, even ones whose region hasn't opened yet, as long as none is registered after its region's end date. Every property then shares one renewal date.");
    if (reg >= parse(CHARGING_FROM)) notes.push("From 15 November 2027 there's no roll-out discount: the first fee is the full £65 for a year.");
    return {
      register: nice(reg), renewal: nice(parse(f.renewal)), renewalShort: short(parse(f.renewal)), each: each, total: total, yearly: FEE * billable, billable: billable,
      maths: f, count: out.length, letCount: letCount, properties: out, compare: cmp, warnings: warnings, notes: notes,
      firstDeadline: firstDeadline !== null ? nice(firstDeadline) : null, past: today !== null && !isNaN(today) && reg < today
    };
  }

  function money(n) { return "£" + n.toFixed(2); }

  function checklist(r) {
    var L = [];
    L.push("LANDLORD DATABASE CHECKLIST (England, Register your rental property)");
    L.push("Planned registration date: " + r.register + ". Renewal date for every property: " + r.renewalShort + ".");
    L.push("");
    L.push("Before you start");
    L.push("[ ] GOV.UK One Login set up (paper application if you don't have digital access)");
    L.push("[ ] Correspondence address in England or Wales");
    L.push("[ ] Joint owners: each one registers as a landlord; one adds the property and invites the others");
    L.push("[ ] A way to pay " + money(r.each) + " per property now, then £65 per property a year");
    r.properties.forEach(function (p) {
      L.push("");
      L.push(p.label + " (" + p.region + ", window " + p.start + " to " + p.end + (p.let ? ", register by " + p.end + ")" : ", not let yet)"));
      L.push("[ ] Address, number of bedrooms, current rental status");
      L.push("[ ] Contact details for any managing agent, superior landlord or freeholder");
      if (p.gas) L.push("[ ] Gas safety record dated within the last 12 months");
      else L.push("[ ] No gas supply (no gas safety record needed)");
      L.push("[ ] Electrical safety report (EICR): within 5 years or the earlier date it gives, remedial work done");
      L.push("[ ] Energy Performance Certificate: in date (10 years), rating E or above to let");
      L.push("[ ] Tenancy: start date, rent and how often it's paid");
      L.push("[ ] Licence number and expiry (HMO, additional or selective), if the property has one");
    });
    L.push("");
    L.push("After you register");
    L.push("[ ] Anything you skipped added within 28 days, or the property registration may be deactivated");
    L.push("[ ] Any change or renewed certificate updated within 28 days (new tenancy, rent change, new gas record, new agent)");
    L.push("[ ] Fee receipts kept with your property expenses for your tax return");
    L.push("");
    L.push("Check the gov.uk guidance \"Register your rental property service: guidance for landlords\" before you register. General information, not legal advice.");
    return L.join("\n");
  }

  var api = { plan: plan, fee: fee, findCouncil: findCouncil, checklist: checklist, REGIONS: REGIONS, COUNCILS: COUNCILS, parse: parse, iso: iso, addYear: addYear };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }

  function render(r) {
    if (r.error) return "<p class=\"ri-err\"><strong>" + esc(r.error) + "</strong></p>";
    var h = "";
    r.warnings.forEach(function (w) { h += "<p class=\"ri-warn\">" + esc(w) + "</p>"; });
    h += "<p class=\"ri-big\">Registering on " + esc(r.register) + ": <strong>" + money(r.each) + "</strong> per property" +
      (r.billable > 1 ? ", <strong>" + money(r.total) + "</strong> for " + (r.billable === r.count ? "all " + r.count : "the " + r.billable + " let ones") : "") + ".</p>";
    h += "<p>Your renewal date for every property: <strong>" + esc(r.renewal) + "</strong>. From then it's £65 per property a year" + (r.billable > 1 ? " (£" + r.yearly + " for " + r.billable + ")" : "") + ".</p>";
    if (r.compare) h += "<p class=\"ri-note\">If you waited until " + esc(r.compare.date) + " (the last day of your earliest window) the first fee would be " + money(r.compare.each) + " per property. Either way you pay £65 a year after that: registering early just means a smaller first bill and an earlier renewal date.</p>";
    h += "<table class=\"ri-t\"><tr><th>Property</th><th>Region</th><th>Window</th><th>Status on your date</th></tr>";
    r.properties.forEach(function (p) {
      var s = !p.let ? "Not let: doesn't need registering yet" : p.late ? "<strong>Late</strong>" : p.early ? "Before its window opens: allowed" : "In its window";
      h += "<tr" + (p.late ? " class=\"tot\"" : "") + "><td>" + esc(p.label) + "</td><td>" + esc(p.region) + "</td><td>" + esc(p.start) + " to " + esc(p.end) + "</td><td>" + s + "</td></tr>";
    });
    h += "</table>";
    h += "<p class=\"ri-small\">How the fee is worked out (the service's own formula): £65 ÷ " + r.maths.yearLength + " days × (" + r.maths.remaining + " days to renewal − " + r.maths.free + " days before 15 November 2027), rounded down to the penny. The service shows the exact amount when you pay.</p>";
    r.notes.forEach(function (n) { h += "<p class=\"ri-note\">" + esc(n) + "</p>"; });
    return h;
  }

  var rows = 0;
  function addRow(pre) {
    var box = document.getElementById("ld-rows");
    if (!box || rows >= 20) return;
    rows++;
    var opts = "<option value=\"\">Region…</option>" + REGIONS.map(function (r) { return "<option value=\"" + r.id + "\">" + esc(r.name) + "</option>"; }).join("");
    var d = document.createElement("div");
    d.className = "ld-row";
    d.innerHTML = "<input aria-label=\"Property name\" class=\"ld-label\" placeholder=\"Property " + rows + " (e.g. 12 Oak Rd)\">" +
      "<select aria-label=\"Region\" class=\"ld-region\">" + opts + "</select>" +
      "<select aria-label=\"Let or empty\" class=\"ld-let\"><option value=\"1\">Let (or will be)</option><option value=\"0\">Empty</option></select>" +
      "<select aria-label=\"Gas supply\" class=\"ld-gas\"><option value=\"1\">Has gas</option><option value=\"0\">No gas</option></select>";
    box.appendChild(d);
    if (pre) {
      d.querySelector(".ld-label").value = pre.label || "";
      d.querySelector(".ld-region").value = pre.region || "";
      d.querySelector(".ld-let").value = pre.let === false ? "0" : "1";
      d.querySelector(".ld-gas").value = pre.gas === false ? "0" : "1";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("ld-form");
    if (!form) return;
    var out = document.getElementById("ld-out"), cw = document.getElementById("ld-check-wrap"), ct = document.getElementById("ld-check");
    var reg = document.getElementById("ld-date");
    var dl = document.getElementById("ld-councils");
    if (dl) {
      var all = [];
      Object.keys(COUNCILS).forEach(function (id) { COUNCILS[id].forEach(function (c) { all.push(c); }); });
      all.sort().forEach(function (c) { var o = document.createElement("option"); o.value = c; dl.appendChild(o); });
    }
    addRow();
    var cq = document.getElementById("ld-council"), cr = document.getElementById("ld-council-out");
    function lookup() {
      var hits = findCouncil(cq.value);
      if (!cq.value.trim()) { cr.innerHTML = ""; return; }
      if (!hits || !hits.length) { cr.innerHTML = "<span class=\"ri-small\">Not on the list. Try your county or unitary council (Rugby is in Warwickshire, Harrogate in North Yorkshire), or check the <a href=\"https://assets.publishing.service.gov.uk/media/6adb3b992263175ac2aca36b/Regions_of_England_and_their_local_councils.pdf\">gov.uk list</a>.</span>"; return; }
      var h = hits[0], r = region(h.region);
      if (!h.exact && hits.length > 1) {
        cr.innerHTML = "Did you mean: " + hits.slice(0, 5).map(function (x) { return "<strong>" + esc(x.council) + "</strong> (" + esc(region(x.region).name) + ")"; }).join(", ") + "?";
        return;
      }
      cr.innerHTML = "<strong>" + esc(h.council) + "</strong> is in <strong>" + esc(r.name) + "</strong>: register between " + esc(short(parse(r.start))) + " and " + esc(short(parse(r.end))) + "." +
        " <button type=\"button\" class=\"ghost\" id=\"ld-use\">Use for a property</button>";
      document.getElementById("ld-use").addEventListener("click", function () {
        var sels = document.querySelectorAll(".ld-region"), target = null;
        for (var i = 0; i < sels.length; i++) if (!sels[i].value) { target = sels[i]; break; }
        if (!target) { addRow(); sels = document.querySelectorAll(".ld-region"); target = sels[sels.length - 1]; }
        target.value = h.region;
      });
    }
    if (cq) cq.addEventListener("input", lookup);
    if (reg && !reg.value) {
      var t = new Date().toISOString().slice(0, 10);
      reg.value = t < OPENS ? OPENS : t;
    }
    function read() {
      var ps = [];
      document.querySelectorAll(".ld-row").forEach(function (d, i) {
        ps.push({ label: d.querySelector(".ld-label").value.trim() || ("Property " + (i + 1)), region: d.querySelector(".ld-region").value, let: d.querySelector(".ld-let").value === "1", gas: d.querySelector(".ld-gas").value === "1" });
      });
      return { register: reg.value, properties: ps };
    }
    function run(e) {
      if (e) e.preventDefault();
      var r = plan(read());
      out.innerHTML = render(r);
      if (cw) { cw.hidden = !!r.error; if (!r.error) ct.value = checklist(r); }
    }
    form.addEventListener("submit", run);
    document.getElementById("ld-add").addEventListener("click", function () { addRow(); });
    var ex = document.getElementById("ld-example");
    if (ex) ex.addEventListener("click", function () {
      document.getElementById("ld-rows").innerHTML = ""; rows = 0;
      addRow({ label: "Flat in Coventry", region: "wm" });
      addRow({ label: "House in Leicester", region: "em", gas: true });
      addRow({ label: "Empty flat in Bristol", region: "sw", let: false, gas: false });
      reg.value = "2027-01-10";
      run();
    });
    var cp = document.getElementById("ld-copy");
    if (cp) cp.addEventListener("click", function () {
      ct.select();
      var done = function () { cp.textContent = "Copied"; setTimeout(function () { cp.textContent = "Copy the checklist"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(ct.value).then(done, function () { document.execCommand("copy"); done(); });
      else { document.execCommand("copy"); done(); }
    });
  });
})();
