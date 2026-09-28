/* Decentralflix Lifeboat — shared helpers (vanilla JS, no build step) */
(function () {
  "use strict";

  // Same-origin by default. Override before this script loads, e.g.:
  // <script>window.DFL_API_BASE = "https://api.example.com";</script>
  var API_BASE = String(window.DFL_API_BASE || "").replace(/\/+$/, "");

  var NAV = [
    ["index.html", "Catalog"],
    ["browse.html", "Browse"],
    ["pass.html", "Collector Pass"],
    ["library.html", "My Library"],
    ["verify.html", "Verify receipt"],
    ["import.html", "Import"],
    ["claim.html", "Claim a purchase"],
    ["onboard.html", "Filmmaker onboarding"],
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

  // California AB 2426 label rule (feasibility-corrected 2026-09-28):
  // "Buy \u2014 permanent DRM-free download, yours to keep" ONLY when download_allowed;
  // otherwise the offer is "License to stream". A permanent download is NOT
  // copyright ownership; this wording is pending counsel review.
  function offerLabel(downloadAllowed) {
    return downloadAllowed ? "Buy \u2014 permanent DRM-free download, yours to keep" : "License to stream";
  }

  // Collector Pass legal banner, required on every pass-related surface.
  var PASS_LEGAL = "REQUIRES LEGAL REVIEW BEFORE LAUNCH (money-transmission risk)";

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

  function patchJSON(path, body) {
    return fetch(api(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body == null ? {} : body)
    }).then(function (res) {
      if (!res.ok) {
        return readErrorText(res).then(function (msg) {
          throw new Error("PATCH " + path + " \u2192 " + res.status + " " + msg);
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

  // Shared film card (AB 2426 label rule enforced here, like index.html).
  function filmCard(film) {
    var label = offerLabel(film.download_allowed);
    var tag = film.download_allowed
      ? '<span class="tag dl">Download included</span>'
      : '<span class="tag stream">Streaming only</span>';
    var genres = (film.genres || []).map(function (g) {
      return '<a class="tag" href="browse.html?genre=' + encodeURIComponent(g) + '">' + esc(g) + "</a>";
    }).join(" ");
    return (
      '<article class="card">' +
        "<h3>" + esc(film.title) + "</h3>" +
        (film.filmmaker && film.filmmaker.filmmaker_id
          ? '<p class="desc">by <a href="filmmaker.html?id=' + encodeURIComponent(film.filmmaker.filmmaker_id) + '">' + esc(film.filmmaker.display_name) + "</a></p>"
          : "") +
        (film.description ? '<p class="desc">' + esc(film.description) + "</p>" : '<p class="desc"></p>') +
        (genres ? '<div class="kv">' + genres + "</div>" : "") +
        '<div class="foot">' +
          '<span class="price">' + money(film.price_usd_cents) + "</span>" + tag +
        "</div>" +
        '<a class="btn" href="film.html?id=' + encodeURIComponent(film.film_id) + '">' + esc(label) + "</a>" +
      "</article>"
    );
  }

  window.DFL = {
    API_BASE: API_BASE,
    esc: esc,
    money: money,
    offerLabel: offerLabel,
    filmCard: filmCard,
    PASS_LEGAL: PASS_LEGAL,
    api: api,
    getJSON: getJSON,
    postJSON: postJSON,
    patchJSON: patchJSON,
    queryParam: queryParam,
    renderNav: renderNav,
    showStatus: showStatus,
    hideStatus: hideStatus
  };
})();
