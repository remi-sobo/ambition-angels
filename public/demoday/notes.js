/* Ambition Angels — inline note/star/status controls for the demo-day lookbook.
 *
 * Injected into each .person-row so Remi/Shannon can flag and note people while
 * scrolling the lookbook. Persists to the same demoday_notes table as the
 * /admin/demoday tracker (keyed by attendee_key = the export's originalRowIndex).
 *
 * Controls only appear for logged-in admins: we probe GET /api/admin/demoday/notes
 * first. If it's not 200 (a password-only viewer gets 401) we show a small
 * "log in to take notes" pill instead, so an admin on a fresh device can
 * authenticate and start.
 */
(function () {
  "use strict";

  var STATUS_OPTIONS = [
    ["", "— set status —"],
    ["want_to_connect", "Want to connect"],
    ["contacted", "Contacted"],
    ["following_up", "Following up"],
  ];

  function injectStyles() {
    if (document.getElementById("aa-note-styles")) return;
    var css =
      ".aa-note{margin-top:10px;padding:9px 11px;border:1px solid #F2DFD3;" +
      "border-left:3px solid #E8500A;border-radius:10px;background:#FFF7F2;}" +
      ".aa-note-top{display:flex;align-items:center;gap:8px;margin-bottom:7px;}" +
      ".aa-star{font-size:20px;line-height:1;background:none;border:none;cursor:pointer;" +
      "color:#C8C6BE;padding:2px 4px;transition:color .12s;}" +
      ".aa-star.on{color:#E8500A;}" +
      ".aa-status{font-size:12px;padding:6px 8px;border:1px solid #E5D8CF;border-radius:6px;" +
      "background:#fff;color:#3D3D3D;cursor:pointer;}" +
      ".aa-status.set{border-color:#E8500A;color:#B83D06;font-weight:600;}" +
      ".aa-note-text{width:100%;box-sizing:border-box;font-family:inherit;font-size:13px;" +
      "padding:8px;border:1px solid #E5D8CF;border-radius:8px;resize:vertical;" +
      "min-height:42px;color:#0E0E0E;background:#fff;}" +
      ".aa-note-text:focus,.aa-status:focus{outline:none;border-color:#E8500A;}" +
      ".aa-note-foot{display:flex;align-items:center;gap:10px;margin-top:7px;}" +
      ".aa-save{appearance:none;border:none;cursor:pointer;background:#E8500A;color:#fff;" +
      "font-family:inherit;font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;" +
      "min-height:40px;transition:background .12s,opacity .12s;}" +
      ".aa-save:hover{background:#B83D06;}" +
      ".aa-save:disabled{opacity:.6;cursor:default;}" +
      ".aa-save.saved{background:#1f9d55;}" +
      ".aa-saved{font-size:12px;color:#9a9690;}" +
      ".aa-saved.err{color:#C0392B;font-weight:600;}" +
      ".aa-login-pill{position:fixed;right:14px;bottom:14px;z-index:9999;" +
      "background:#E8500A;color:#fff;text-decoration:none;font-family:inherit;font-size:14px;" +
      "font-weight:700;padding:11px 16px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.18);}" +
      ".aa-login-pill:hover{background:#B83D06;}";
    var el = document.createElement("style");
    el.id = "aa-note-styles";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function buildNameToKey() {
    var raw = document.getElementById("exportAttendees");
    if (!raw) return null;
    var list;
    try {
      list = JSON.parse(raw.textContent);
    } catch (e) {
      return null;
    }
    var map = {};
    list.forEach(function (a) {
      if (a && a.name != null && a.originalRowIndex != null) {
        map[a.name] = String(a.originalRowIndex);
      }
    });
    return map;
  }

  function buildWidget(key, data) {
    var wrap = document.createElement("div");
    wrap.className = "aa-note";
    wrap.setAttribute("data-aa-key", key);

    var state = {
      starred: !!data.starred,
      status: data.status || null,
      note: data.note || "",
    };

    // ── Top row: star + status ──
    var top = document.createElement("div");
    top.className = "aa-note-top";

    var star = document.createElement("button");
    star.type = "button";
    star.className = "aa-star" + (state.starred ? " on" : "");
    star.title = "Star this person";
    star.textContent = state.starred ? "★" : "☆";

    var status = document.createElement("select");
    status.className = "aa-status" + (state.status ? " set" : "");
    STATUS_OPTIONS.forEach(function (o) {
      var op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      status.appendChild(op);
    });
    status.value = state.status || "";

    top.appendChild(star);
    top.appendChild(status);

    // ── Note ──
    var ta = document.createElement("textarea");
    ta.className = "aa-note-text";
    ta.rows = 2;
    ta.placeholder = "Add a private note…";
    ta.value = state.note;

    // ── Footer: explicit Save button + status text ──
    var foot = document.createElement("div");
    foot.className = "aa-note-foot";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "aa-save";
    saveBtn.textContent = "Save";

    var saved = document.createElement("span");
    saved.className = "aa-saved";

    foot.appendChild(saveBtn);
    foot.appendChild(saved);

    wrap.appendChild(top);
    wrap.appendChild(ta);
    wrap.appendChild(foot);

    var autoTimer = null;
    function flag(text, isErr) {
      saved.textContent = text;
      saved.className = "aa-saved" + (isErr ? " err" : "");
    }
    function save(explicit) {
      state.note = ta.value; // always capture latest
      saveBtn.disabled = true;
      saveBtn.classList.remove("saved");
      flag("Saving…", false);
      fetch("/api/admin/demoday/notes", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendee_key: key,
          note: state.note,
          starred: state.starred,
          status: state.status,
        }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          flag("Saved ✓", false);
          if (explicit) {
            saveBtn.classList.add("saved");
            saveBtn.textContent = "Saved ✓";
            setTimeout(function () {
              saveBtn.textContent = "Save";
              saveBtn.classList.remove("saved");
            }, 1500);
          }
          setTimeout(function () {
            if (saved.textContent === "Saved ✓") flag("", false);
          }, 2500);
        })
        .catch(function () {
          flag("Save failed — tap Save to retry", true);
        })
        .finally(function () {
          saveBtn.disabled = false;
        });
    }

    saveBtn.addEventListener("click", function () {
      if (autoTimer) {
        clearTimeout(autoTimer);
        autoTimer = null;
      }
      save(true);
    });

    // Star/status save immediately (they're discrete choices).
    star.addEventListener("click", function () {
      state.starred = !state.starred;
      star.textContent = state.starred ? "★" : "☆";
      star.classList.toggle("on", state.starred);
      save(false);
    });
    status.addEventListener("change", function () {
      state.status = status.value || null;
      status.classList.toggle("set", !!state.status);
      save(false);
    });

    // Typing: debounced autosave as a safety net; the Save button is the
    // explicit, reliable action (especially on mobile).
    ta.addEventListener("input", function () {
      state.note = ta.value;
      flag("Unsaved…", false);
      if (autoTimer) clearTimeout(autoTimer);
      autoTimer = setTimeout(function () {
        save(false);
      }, 1500);
    });

    return wrap;
  }

  function mount(nameToKey, byKey) {
    var rows = document.querySelectorAll(".person-row");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.querySelector(".aa-note")) continue; // idempotent
      var name = row.getAttribute("data-name");
      if (!name) continue;
      var key = nameToKey[name];
      if (!key) continue;
      var info = row.querySelector(".person-info") || row;
      info.appendChild(buildWidget(key, byKey[key] || {}));
    }
  }

  function showLoginPill() {
    if (document.querySelector(".aa-login-pill")) return;
    injectStyles();
    var a = document.createElement("a");
    a.className = "aa-login-pill";
    a.href = "/admin";
    a.textContent = "✎ Log in to take notes";
    document.body.appendChild(a);
  }

  function init() {
    var nameToKey = buildNameToKey();
    if (!nameToKey) return;

    fetch("/api/admin/demoday/notes", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("no-access"); // 401 for non-admins
        return r.json();
      })
      .then(function (j) {
        injectStyles();
        var byKey = {};
        (j.notes || []).forEach(function (n) {
          byKey[n.attendee_key] = n;
        });
        mount(nameToKey, byKey);

        // Re-mount if the lookbook re-renders rows (search/collapse). Idempotent.
        var pending = null;
        var obs = new MutationObserver(function () {
          if (pending) clearTimeout(pending);
          pending = setTimeout(function () {
            mount(nameToKey, byKey);
          }, 200);
        });
        obs.observe(document.body, { childList: true, subtree: true });
      })
      .catch(function () {
        // Not logged in as admin — offer a quick way in (e.g. on mobile).
        showLoginPill();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
