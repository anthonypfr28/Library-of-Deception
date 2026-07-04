/**
 * main.js
 * -------
 * Talks to server.js's API and renders the GitHub-style file table and
 * the slide-over document viewer. Never touches the filesystem itself —
 * every file's content arrives already organized by output.py.
 */

(function () {
  "use strict";

  const state = { files: [] };

  const els = {
    table: document.getElementById("file-table"),
    syncLabel: document.getElementById("sync-label"),
    statFiles: document.getElementById("stat-files"),
    statLines: document.getElementById("stat-lines"),
    statUpdated: document.getElementById("stat-updated"),
    footerCount: document.getElementById("footer-count"),
    reindexBtn: document.getElementById("reindex-btn"),
    scrim: document.getElementById("viewer-scrim"),
    viewerName: document.getElementById("viewer-name"),
    viewerSub: document.getElementById("viewer-sub"),
    viewerLines: document.getElementById("viewer-lines"),
    viewerContent: document.getElementById("viewer-content"),
    viewerClose: document.getElementById("viewer-close"),
    viewerDownload: document.getElementById("viewer-download"),
  };

  const DECODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ01#$_-/.";

  /** Scramble-then-settle text animation used on file names, the page's
   *  one signature flourish: a name is "decoded" the way a deceptive
   *  document might be — resolved out of noise into something legible. */
  function decodeInto(el, finalText, duration = 420) {
    const start = performance.now();
    const len = finalText.length;

    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const revealCount = Math.floor(progress * len);
      let out = "";
      for (let i = 0; i < len; i++) {
        if (i < revealCount || finalText[i] === " ") {
          out += finalText[i];
        } else {
          out += DECODE_CHARS[Math.floor(Math.random() * DECODE_CHARS.length)];
        }
      }
      el.textContent = out;
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = finalText;
      }
    }
    requestAnimationFrame(frame);
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {
      return "unknown";
    }
  }

  function fileIconSvg() {
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 1.5h5.5L12.5 4.5v9a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.1"/>
      <path d="M9.5 1.5V4.5H12.5" stroke="currentColor" stroke-width="1.1"/>
    </svg>`;
  }

  function downloadIconSvg() {
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5v8M4.5 6.5 8 10l3.5-3.5M2.5 12.5h11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function renderTable() {
    if (!state.files.length) {
      els.table.innerHTML = `<div class="empty-state">The shelf is empty. Add files to docs/ and hit reindex.</div>`;
      return;
    }

    els.table.innerHTML = "";
    state.files.forEach((file) => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.setAttribute("role", "row");
      row.tabIndex = 0;

      row.innerHTML = `
        <span class="file-icon">${fileIconSvg()}</span>
        <span class="file-main">
          <span class="file-name">${file.name}</span>
          <span class="file-preview">${escapeHtml(file.preview || "")}</span>
        </span>
        <span class="file-meta">${file.size_label}</span>
        <button class="file-download icon-btn" title="Download ${file.name}" data-name="${file.name}">
          ${downloadIconSvg()}
        </button>
      `;

      row.addEventListener("click", (e) => {
        if (e.target.closest(".file-download")) return;
        openViewer(file);
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter") openViewer(file);
      });

      row.querySelector(".file-download").addEventListener("click", (e) => {
        e.stopPropagation();
        window.location.href = `/api/download/${encodeURIComponent(file.name)}`;
      });

      els.table.appendChild(row);

      // decode-in the filename once it's in the DOM
      const nameEl = row.querySelector(".file-name");
      decodeInto(nameEl, file.name, 380);
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function openViewer(file) {
    els.viewerSub.textContent = `${file.language} · ${file.size_label} · ${file.line_count} lines`;
    els.viewerContent.textContent = file.content;

    const lineCount = file.content.split("\n").length;
    els.viewerLines.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");

    els.viewerDownload.onclick = () => {
      window.location.href = `/api/download/${encodeURIComponent(file.name)}`;
    };

    els.scrim.classList.add("open");
    decodeInto(els.viewerName, file.name, 320);
    els.viewerClose.focus();
  }

  function closeViewer() {
    els.scrim.classList.remove("open");
  }

  els.viewerClose.addEventListener("click", closeViewer);
  els.scrim.addEventListener("click", (e) => {
    if (e.target === els.scrim) closeViewer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeViewer();
  });

  async function loadRepo() {
    els.syncLabel.textContent = "syncing…";
    try {
      const res = await fetch("/api/repo");
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();

      state.files = data.files || [];
      renderTable();

      els.statFiles.textContent = data.file_count ?? state.files.length;
      const totalLines = state.files.reduce((sum, f) => sum + (f.line_count || 0), 0);
      els.statLines.textContent = totalLines.toLocaleString();
      els.statUpdated.textContent = formatDate(data.generated_at);
      els.footerCount.textContent = `${state.files.length} document(s) on the shelf`;

      els.syncLabel.textContent = "synced";
    } catch (err) {
      els.syncLabel.textContent = "offline";
      els.table.innerHTML = `<div class="empty-state">Could not reach server.js. Is it running?</div>`;
    }
  }

  els.reindexBtn.addEventListener("click", async () => {
    els.reindexBtn.classList.add("spinning");
    try {
      await fetch("/api/reindex", { method: "POST" });
      await loadRepo();
    } finally {
      els.reindexBtn.classList.remove("spinning");
    }
  });

  loadRepo();
})();
