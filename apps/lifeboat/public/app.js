/* Decentralflix Lifeboat — shared helpers (vanilla JS, no build step) */
(function () {
  "use strict";

  // Same-origin by default. Override before this script loads, e.g.:
  // <script>window.DFL_API_BASE = "https://api.example.com";</script>
  var API_BASE = String(window.DFL_API_BASE || "").replace(/\/+$/, "");

  var NAV = [
    ["index.html", "Catalog"],
    ["import.html", "Import"],
    ["claim.html", "Claim a purchase"],
    ["dashboard.html", "Dashboard"]
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(cents) {
    var n = Number(cents);
    if (!isFinite(n)) return "\u2014";
    return "$" + (n / 100).toFixed(2);
  }

  // California AB 2426 label rule:
  // "Buy \u2014 yours to keep" ONLY when download_allowed is true;
  // otherwise the offer is "License to stream".
  function offerLabel(downloadAllowed) {
    return downloadAllowed ? "Buy \u2014 yours to keep" : "License to stream";
  }

  function api(path) {
    return API_BASE + path;
  }

  function readErrorText(res) {
    return res.json().then(
      function (data) {
        return (data && (data.error || data.message)) || JSON.stringify(data);
      },
      function () {
        return res.text().then(
          function (t) { return t; },
          function () { return res.statusText; }
        );
      }
    );
  }

  function getJSON(path) {
    return fetch(api(path), { headers: { Accept: "application/json" } }).then(function (res) {
      if (!res.ok) {
        return readErrorText(res).then(function (msg) {
          throw new Error("GET " + path + " \u2192 " + res.status + " " + msg);
        });
      }
      return res.json();
    });
  }

  function postJSON(path, body) {
    return fetch(api(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body == null ? {} : body)
    }).then(function (res) {
      if (!res.ok) {
        return readErrorText(res).then(function (msg) {
          throw new Error("POST " + path + " \u2192 " + res.status + " " + msg);
        });
      }
      return res.json();
    });
  }

  function queryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function renderNav(activePage) {
    var host = document.getElementById("dfl-nav");
    if (!host) return;
    var links = NAV.map(function (item) {
      var href = item[0], label = item[1];
      return '<a href="' + href + '"' + (href === activePage ? ' class="active"' : "") + ">" + label + "</a>";
    }).join("");
    host.innerHTML =
      '<div class="dfl-brand"><a href="index.html">DECENTRALFLIX <span>Lifeboat</span></a></div>' +
      "<nav>" + links + "</nav>";
  }

  function showStatus(target, msg, kind) {
    var el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el) return;
    el.className = "status " + (kind || "info");
    el.innerHTML = esc(msg);
    el.hidden = false;
  }

  function hideStatus(target) {
    var el = typeof target === "string" ? document.getElementById(target) : target;
    if (el) el.hidden = true;
  }

  window.DFL = {
    API_BASE: API_BASE,
    esc: esc,
    money: money,
    offerLabel: offerLabel,
    api: api,
    getJSON: getJSON,
    postJSON: postJSON,
    queryParam: queryParam,
    renderNav: renderNav,
    showStatus: showStatus,
    hideStatus: hideStatus
  };
})();
