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

  // --- session auth (STR-001) ----------------------------------------------
  // The Lifeboat API authenticates with Bearer session tokens. Every authed
  // endpoint was unreachable from the UI because no page ever sent one:
  // login() stores the token and the request helpers below attach it.
  var TOKEN_KEY = "dfl.token";
  var ACCOUNT_KEY = "dfl.account";

  function lsGet(k) {
    try {
      if (!window.localStorage) return null;
      return window.localStorage.getItem(k);
    } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try {
      if (window.localStorage) window.localStorage.setItem(k, v);
    } catch (e) { /* private mode: token lives in memory only */ }
  }
  function lsDel(k) {
    try {
      if (window.localStorage) window.localStorage.removeItem(k);
    } catch (e) { /* ignore */ }
  }

  function authToken() { return lsGet(TOKEN_KEY); }

  function authAccount() {
    var raw = lsGet(ACCOUNT_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function setAuth(token, account) {
    if (token) lsSet(TOKEN_KEY, token);
    if (account) lsSet(ACCOUNT_KEY, JSON.stringify(account));
  }

  function clearAuth() {
    lsDel(TOKEN_KEY);
    lsDel(ACCOUNT_KEY);
  }

  function authHeaders(extra) {
    var h = {};
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
    }
    var t = authToken();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }

  // POST /api/auth/login. Stores the session token + account on success.
  // Throws the server's error message on bad credentials (nothing stored).
  function login(email, password) {
    return postJSON("/api/auth/login", { email: email, password: password }).then(function (data) {
      if (!data || !data.token) throw new Error("login failed: no token in response");
      setAuth(data.token, data.account || null);
      renderAuth();
      return data.account || null;
    });
  }

  // POST /api/auth/logout with the current token (revokes the session
  // server-side, SEC-002), then clear local state. Best-effort: local state
  // is cleared even if the request fails.
  function logout() {
    function done() { clearAuth(); renderAuth(); }
    return postJSON("/api/auth/logout", {}).then(done, done);
  }

  // Auth widget rendered inside the nav (renderNav). Logged out: email +
  // password + Log in. Logged in: account chip + Log out. A stored token is
  // validated with GET /api/auth/me; a stale/expired one is dropped.
  function renderAuth() {
    if (typeof document === "undefined") return;
    var host = document.getElementById("dfl-auth");
    if (!host) return;
    var token = authToken();
    var account = authAccount();
    if (token && account) {
      host.innerHTML =
        '<span class="who">' + esc(account.email || account.name || "signed in") + "</span>" +
        '<button type="button" class="btn small secondary" id="dfl-logout">Log out</button>';
      var out = document.getElementById("dfl-logout");
      if (out) out.addEventListener("click", function () { logout(); });
      getJSON("/api/auth/me").then(
        function () { /* token still good */ },
        function (err) {
          if (err && err.message && err.message.indexOf("401") >= 0) {
            clearAuth();
            renderAuth();
          }
        }
      );
    } else {
      host.innerHTML =
        '<input id="dfl-login-email" type="email" placeholder="email" autocomplete="username">' +
        '<input id="dfl-login-pass" type="password" placeholder="password" autocomplete="current-password">' +
        '<button type="button" class="btn small" id="dfl-login-btn">Log in</button>' +
        '<span class="auth-err" id="dfl-login-err" hidden></span>';
      var btn = document.getElementById("dfl-login-btn");
      if (btn) btn.addEventListener("click", function () {
        var email = document.getElementById("dfl-login-email").value;
        var pass = document.getElementById("dfl-login-pass").value;
        var errEl = document.getElementById("dfl-login-err");
        btn.disabled = true;
        login(email, pass).then(
          function () { /* renderAuth() ran inside login() */ },
          function (err) {
            errEl.textContent = err && err.message ? err.message : "Login failed";
            errEl.hidden = false;
            btn.disabled = false;
          }
        );
      });
    }
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
    return fetch(api(path), { headers: authHeaders({ Accept: "application/json" }) }).then(function (res) {
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
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
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
      headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
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
    if (typeof document === "undefined") return;
    var host = document.getElementById("dfl-nav");
    if (!host) return;
    var links = NAV.map(function (item) {
      var href = item[0], label = item[1];
      return '<a href="' + href + '"' + (href === activePage ? ' class="active"' : "") + ">" + label + "</a>";
    }).join("");
    host.innerHTML =
      '<div class="dfl-brand"><a href="index.html">DECENTRALFLIX <span>Lifeboat</span></a></div>' +
      "<nav>" + links + "</nav>" +
      '<div class="dfl-auth" id="dfl-auth"></div>';
    renderAuth();
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
    login: login,
    logout: logout,
    authToken: authToken,
    authAccount: authAccount,
    setAuth: setAuth,
    clearAuth: clearAuth,
    renderAuth: renderAuth,
    queryParam: queryParam,
    renderNav: renderNav,
    showStatus: showStatus,
    hideStatus: hideStatus
  };
})();
