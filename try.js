// Northstar on the website: the Discovery and Chat phones really work.
// They call the same brain as the app (Supabase functions), with the public app key.
// Guardrails: a few tries per visitor per day (kept in this browser), Fast brain only, nothing saved,
// crisis help first, and the brain's own daily spending cap still applies to everyone.
(() => {
  const BASE = "https://ozvwmxgvlibaxkogjbpe.supabase.co/functions/v1/";
  const KEY = "sb_publishable_5TLjbssyYV_kl6g9T7TudA_FCjZQFcf";
  const LIMIT = 6; // tries per visitor per day (Discovery + Chat together)
  const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";

  // ---------- small helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const today = () => new Date().toISOString().slice(0, 10);
  function triesUsed() {
    try {
      const s = JSON.parse(localStorage.getItem("ns.try") || "{}");
      return s.day === today() ? Number(s.n) || 0 : 0;
    } catch { return 0; }
  }
  function useTry() {
    try { localStorage.setItem("ns.try", JSON.stringify({ day: today(), n: triesUsed() + 1 })); } catch { /* private mode */ }
  }
  const outOfTries = () => triesUsed() >= LIMIT;

  async function call(fn, body, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(BASE + fn, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + KEY },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; } finally { clearTimeout(timer); }
  }

  function askBrain(text, source) {
    return call("northstar-chat", {
      messages: [{ role: "user", content: text }],
      memory: [], corrections: [],
      settings: { answer_length: "short", preferred_name: "", nickname: "", modules: [], show_visuals: false, memory_on: false, timezone: TZ },
      chat_id: null, image: null, calendar: null, source, brain: "fast",
    }, 45000);
  }

  // Plain, safe formatting of a reply: paragraphs, bullet and numbered lists, **bold**.
  function render(text, into) {
    into.textContent = "";
    const blocks = String(text || "").replace(/\r/g, "").split(/\n{2,}/);
    for (const block of blocks) {
      const lines = block.split("\n").filter((l) => l.trim());
      if (!lines.length) continue;
      const isList = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
      if (isList) {
        const list = el(/^\s*\d/.test(lines[0]) ? "ol" : "ul");
        for (const l of lines) { const li = el("li"); inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), li); list.append(li); }
        into.append(list);
      } else {
        for (const l of lines) {
          const heading = /^#{1,6}\s+/.test(l);
          const p = el("p", heading ? "h" : "");
          inline(l.replace(/^#{1,6}\s+/, ""), p);
          into.append(p);
        }
      }
    }
  }
  function inline(text, into) {
    const clean = text.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1");
    clean.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) into.append(el("strong", null, part.slice(2, -2)));
      else if (part) into.append(document.createTextNode(part.replace(/\*/g, "")));
    });
  }

  function crisisCard() {
    const card = el("div", "ns-crisis");
    card.append(el("div", "ns-crisis-k", "You don't have to do this alone"));
    card.append(el("p", null, "Talk to someone now. It's free and confidential."));
    const row = el("div", "ns-crisis-row");
    const a1 = el("a", "ns-crisis-b", "Call 988"); a1.href = "tel:988";
    const a2 = el("a", "ns-crisis-b", "Text 988"); a2.href = "sms:988";
    row.append(a1, a2);
    card.append(row);
    const a3 = el("a", "ns-crisis-911", "In danger right now? Call 911"); a3.href = "tel:911";
    card.append(a3);
    card.append(el("p", "ns-crisis-small", "Outside the US? Call your local emergency number."));
    return card;
  }

  const getApp = "That's today's free tries on the website. Get the free app to keep going.";

  // ---------- Chat phone ----------
  const chat = $("#ns-chat");
  if (chat) {
    const log = $(".ns-chat-log", chat), form = $("form", chat), input = $("input", form);
    const empty = $(".ns-chat-empty", chat);
    let busy = false;
    const scroll = () => { log.scrollTop = log.scrollHeight; };

    async function send(text) {
      text = text.trim();
      if (!text || busy) return;
      empty.hidden = true;
      // After a hand-off from Discovery, the first reply keeps Northstar's opening question in view.
      const opener = chat.dataset.opener || "";
      delete chat.dataset.opener;
      log.append(el("div", "ns-msg ns-me", text));
      input.value = "";
      if (outOfTries()) { log.append(el("div", "ns-msg ns-bot ns-note", getApp)); scroll(); return; }
      busy = true; form.classList.add("busy");
      const wait = el("div", "ns-msg ns-bot ns-wait", "Thinking…");
      log.append(wait); scroll();
      useTry();
      const ask = opener ? `Northstar asked me: "${opener}"\n\nMy answer: ${text}` : text;
      const reply = await askBrain(ask, "web");
      wait.remove();
      const box = el("div", "ns-msg ns-bot");
      if (reply?.insight?.crisis) box.append(crisisCard());
      const words = el("div");
      if (reply?.reply) render(reply.reply, words);
      else words.textContent = "Northstar couldn't answer right now. Please try again in a moment.";
      box.append(words);
      log.append(box);
      busy = false; form.classList.remove("busy");
      scroll();
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
    window.nsStartChat = (opener, request) => {
      chat.scrollIntoView({ behavior: "smooth", block: "center" });
      log.textContent = ""; empty.hidden = true;
      const n = el("div", "ns-msg ns-bot"); render(opener, n); log.append(n);
      if (request) log.append(el("div", "ns-msg ns-me ns-quiet", request));
      chat.dataset.opener = opener;
      setTimeout(() => input.focus({ preventScroll: true }), 600);
    };
  }

  // ---------- Discovery phone ----------
  const disc = $("#ns-discovery");
  if (disc) {
    const form = $("form", disc), input = $("input", form);
    const title = $(".ns-d-title", disc), said = $(".ns-d-said", disc);
    const orbs = $(".ns-orbs", disc), star = $(".ns-star", disc);
    const panel = $(".ns-panel", disc), panelBody = $(".ns-panel-body", disc), panelHead = $(".ns-panel-head span", disc);
    let request = "", busy = false;

    // Spots around the star (percent of the screen), for 3 to 5 orbs.
    const SPOTS = {
      3: [[30, 44], [72, 50], [46, 74]],
      4: [[34, 44], [70, 49], [30, 66], [62, 72]],
      5: [[30, 42], [68, 44], [24, 62], [76, 64], [50, 79]],
    };
    function showOrbs(paths) {
      orbs.textContent = "";
      const list = paths.slice(0, 5);
      const spots = SPOTS[Math.max(3, list.length)] || SPOTS[5];
      list.forEach((p, i) => {
        const b = el("button", "ns-orb", p.label);
        b.type = "button";
        b.style.left = spots[i][0] + "%";
        b.style.top = spots[i][1] + "%";
        b.style.animationDelay = (i * 0.12) + "s";
        b.addEventListener("click", () => pick(p));
        orbs.append(b);
      });
    }
    function openPanel(head) {
      panelHead.textContent = head;
      panelBody.textContent = "";
      panel.hidden = false;
      requestAnimationFrame(() => panel.classList.add("open"));
    }
    $(".ns-panel-close", disc).addEventListener("click", () => {
      panel.classList.remove("open");
      setTimeout(() => { panel.hidden = true; }, 250);
    });

    async function pick(p) {
      const kind = p.kind || "answer";
      if (kind === "chat") {
        if (window.nsStartChat) window.nsStartChat(p.opener || "I'm here. What's on your mind?", request);
        return;
      }
      if (kind === "clarify") {
        input.placeholder = p.opener || p.label;
        input.dataset.clarify = "1";
        input.focus();
        return;
      }
      openPanel(p.label);
      if (kind === "find") {
        render(`In the app, Northstar finds real **${p.need || "help"}** near you, compares them by Google rating and number of reviews, and recommends one. You make the final call.`, panelBody);
        const a = el("a", "ns-panel-cta", "Get the free app"); a.href = "#install";
        panelBody.append(a);
        return;
      }
      if (kind === "navigate" || kind === "connector") {
        render("This one opens a place inside the app.", panelBody);
        return;
      }
      if (outOfTries()) { panelBody.textContent = getApp; return; }
      panelBody.append(el("p", "ns-wait", "Thinking…"));
      useTry();
      const reply = await askBrain(`${p.opener}\n\nWhat I wrote: ${request}`, "discovery");
      panelBody.textContent = "";
      if (reply?.insight?.crisis) panelBody.append(crisisCard());
      const words = el("div");
      if (reply?.reply) render(reply.reply, words);
      else words.textContent = "Northstar couldn't answer right now. Please try again in a moment.";
      panelBody.append(words);
    }

    async function ask(text) {
      text = text.trim();
      if (!text || busy) return;
      if (input.dataset.clarify) { text = `${request}. ${text}`; delete input.dataset.clarify; input.placeholder = "What's on your mind?"; }
      request = text;
      input.value = "";
      panel.classList.remove("open"); panel.hidden = true;
      title.textContent = "Finding ways forward…";
      said.textContent = `You said: "${text}"`;
      orbs.textContent = "";
      if (outOfTries()) { title.textContent = "That's today's free tries"; said.textContent = "Get the free app to keep going."; return; }
      busy = true; star.classList.add("thinking"); form.classList.add("busy");
      useTry();
      const reply = await call("northstar-paths", { text, destinations: [], offer: [] }, 12000);
      busy = false; star.classList.remove("thinking"); form.classList.remove("busy");
      if (reply?.crisis) {
        title.textContent = "You're not alone";
        said.textContent = "";
        openPanel("Help right now");
        panelBody.append(crisisCard());
        return;
      }
      const paths = (reply?.paths || []).filter((p) => p && p.label);
      if (!reply || reply.fallback || paths.length < 3) {
        title.textContent = "Let's try that another way";
        said.textContent = "Northstar couldn't read that one. Say it in a few more words.";
        return;
      }
      title.textContent = "A few ways forward";
      showOrbs(paths);
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });

    // The example everyone sees first (the same as the app's toothache example).
    request = "Tooth ache";
    showOrbs([
      { label: "Talk it through", kind: "chat", opener: "That sounds painful. How long has it been hurting, and how bad is it right now?" },
      { label: "Find dentist nearby", kind: "find", need: "dentist" },
      { label: "Note my symptoms", kind: "answer", opener: "Give a short checklist of symptoms to note for the dentist, in 5 short bullets." },
      { label: "Plan what to say", kind: "answer", opener: "List what to tell the dentist when calling, in 5 short bullets." },
    ]);
  }
})();
