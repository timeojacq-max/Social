// Écho — interface (vanilla JS, routage par hash)
const $app = document.getElementById("app");
const $modal = document.getElementById("modal-root");
const $toast = document.getElementById("toast");

let S = { world: null, busy: false, error: null, demo: false };
let lastSig = "";
let pendingAction = false;
let profileTab = "posts";
let homeTab = "foryou";

// ---------- Utilitaires ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + " M" : n >= 1e4 ? Math.round(n / 1e3) + " k" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(".0", "") + " k" : String(n || 0)).replace(".", ",");
function ago(t) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return s + " s";
  if (s < 3600) return Math.round(s / 60) + " min";
  if (s < 86400) return Math.round(s / 3600) + " h";
  return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
function richText(t) {
  return esc(t)
    .replace(/(^|[^\w])@(\w{1,20})/g, (m, pre, h) => `${pre}<a class="mention" href="#/u/${h}" data-stop>@${h}</a>`)
    .replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, (m, pre, tag) => `${pre}<span class="tag">#${tag}</span>`);
}
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.add("hidden"), 3500);
}
async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur " + res.status);
  return data;
}

// ---------- Accès au monde ----------
const W = () => S.world;
const author = (id) => (id === "me" ? W().user : W().personas.find((p) => p.id === id));
const byHandle = (h) => {
  h = String(h).toLowerCase();
  if (W().user.handle.toLowerCase() === h) return W().user;
  return W().personas.find((p) => p.handle.toLowerCase() === h);
};
const postById = (id) => W().posts.find((p) => p.id === id);
const repliesOf = (id) => W().posts.filter((p) => p.replyTo === id);
const avatar = (a, cls = "") => `<div class="avatar ${cls}" style="background:${a.color}22;border:1px solid ${a.color}55">${esc(a.emoji || "🙂")}</div>`;
const unreadCount = () => W().notifications.filter((n) => !n.read).length;

// ---------- Rendu des posts ----------
function quoteHTML(q) {
  if (!q) return "";
  const a = author(q.authorId);
  if (!a) return "";
  return `<div class="quote" data-go="#/post/${q.id}" data-stop>
    <div class="meta">${avatar(a, "sm")}<span class="name">${esc(a.name)}</span><span class="handle">@${esc(a.handle)} · ${ago(q.createdAt)}</span></div>
    <div class="text">${richText(q.text)}</div></div>`;
}

function postHTML(p, { focus = false, parent = false, showContext = true } = {}) {
  const a = author(p.authorId);
  if (!a) return "";
  const me = W().user;
  const liked = p.likedBy.includes("me");
  const reposted = p.repostedBy.includes("me");
  const parentPost = p.replyTo && postById(p.replyTo);
  const ctx = showContext && parentPost ? `<div class="context">En réponse à <a class="mention" href="#/u/${author(parentPost.authorId)?.handle}" data-stop>@${esc(author(parentPost.authorId)?.handle)}</a></div>` : "";
  const nReplies = repliesOf(p.id).length;
  const verified = a.verified ? `<span class="verified" title="Certifié">✔</span>` : "";
  const head = `<a href="#/u/${a.handle}" data-stop class="name">${esc(a.name)}</a>${verified}<span class="handle">@${esc(a.handle)}</span>`;
  const actions = `<div class="actions">
      <button data-act="reply" data-id="${p.id}" title="Répondre">💬 ${nReplies || ""}</button>
      <button class="repost ${reposted ? "on" : ""}" data-act="repost" data-id="${p.id}" title="Republier">🔁 ${p.reposts || ""}</button>
      <button class="like ${liked ? "on" : ""}" data-act="like" data-id="${p.id}" title="J'aime">${liked ? "❤️" : "🤍"} ${p.likes || ""}</button>
      <button data-act="quote" data-id="${p.id}" title="Citer">✍️</button>
      <button title="Vues" disabled>📊 ${fmt(p.views)}</button>
    </div>`;
  const quote = quoteHTML(p.quoteOf && postById(p.quoteOf));
  if (focus) {
    return `<article class="post focus ${p.authorId === "me" ? "mine" : ""}">
      <div class="meta">${avatar(a)}<div style="margin-left:8px">${head}</div></div>
      ${ctx}<div class="text">${richText(p.text)}</div>${quote}
      <div class="muted" style="margin-bottom:12px">${new Date(p.createdAt).toLocaleString("fr-FR")} · <b style="color:var(--text)">${fmt(p.views)}</b> vues</div>
      ${actions}</article>`;
  }
  return `<article class="post ${parent ? "thread-parent" : ""} ${p.authorId === me.id ? "mine" : ""}" data-go="#/post/${p.id}">
    <div class="left">${avatar(a)}</div>
    <div class="body">
      ${ctx}<div class="meta">${head}<span class="time">· ${ago(p.createdAt)}</span></div>
      <div class="text">${richText(p.text)}</div>${quote}${actions}
    </div></article>`;
}

function composerHTML({ key, placeholder = "Quoi de neuf ?!", replyTo = "", quoteOf = "", button = "Poster" }) {
  return `<form class="composer" data-compose data-reply="${replyTo}" data-quote="${quoteOf}">
    ${avatar(W().user)}
    <div class="col">
      <textarea data-key="${key}" placeholder="${esc(placeholder)}" maxlength="600"></textarea>
      <div class="row"><span class="count"></span><button class="btn accent" type="submit">${button}</button></div>
    </div></form>`;
}

function statusBar() {
  const err = S.error ? `<div class="error-bar">⚠️ ${esc(S.error)}</div>` : "";
  const demo = S.demo ? `<div class="demo-bar">Mode démo : aucune clé API configurée, le contenu est factice. Ajoute <code>ANTHROPIC_API_KEY</code> dans <code>.env</code> pour la vraie IA.</div>` : "";
  return demo + err;
}

// ---------- Vues ----------
function viewOnboarding() {
  const presets = {
    reel: "Le monde réel contemporain, en France, version très dramatique : influenceurs, téléréalité, politique, rap, médias, comptes anonymes de ragots. Personnages tous fictifs.",
    cyber: "Néo-Lyon, 2089. Mégacorporations, implants cybernétiques, IA émancipées, gangs, hackers, flics corrompus et stars holographiques.",
    fantasy: "Le royaume d'Aldoria, où un réseau magique de « corbeaux-messagers » fonctionne comme un réseau social. Nobles, sorciers, mercenaires, bardes et espions s'y écharpent pendant une crise de succession.",
    tv: "Les coulisses d'une émission de téléréalité géante, « L'Île des Ex » : candidats, ex des candidats, production, fans hystériques, comptes de ragots, chroniqueurs télé.",
    school: "Une prestigieuse école de magie moderne : étudiants, profs, fantômes, rivalités entre maisons, comptes anonymes qui balancent tout.",
  };
  $app.innerHTML = `<div class="onboard">
    <h1>🌀 Écho</h1>
    <div class="lead">Un réseau social où <b>tu es le seul humain</b>. Tous les autres comptes sont des IA, avec leurs egos, leurs drames et leurs secrets. Crée ton compte et choisis l'univers.</div>
    ${statusBar()}
    <form id="onboard-form">
      <div class="row2">
        <div class="field"><label>Ton nom affiché</label><input name="name" required maxlength="50" placeholder="Alex" /></div>
        <div class="field"><label>Pseudo (@)</label><input name="handle" required maxlength="20" placeholder="alex" /></div>
      </div>
      <div class="row2">
        <div class="field" style="flex:3"><label>Bio</label><input name="bio" maxlength="200" placeholder="Nouveau ici. Je viens foutre le bazar." /></div>
        <div class="field" style="flex:1"><label>Avatar</label><input name="emoji" maxlength="4" value="😎" /></div>
      </div>
      <div class="field"><label>Univers</label>
        <select id="preset">
          <option value="reel">🇫🇷 Monde réel, ultra dramatique</option>
          <option value="tv">📺 Téléréalité</option>
          <option value="cyber">🤖 Cyberpunk</option>
          <option value="fantasy">🐉 Fantasy médiévale</option>
          <option value="school">🪄 École de magie</option>
          <option value="custom">✏️ Personnalisé…</option>
        </select>
      </div>
      <div class="field"><textarea name="universe">${presets.reel}</textarea>
        <div class="hint">Décris librement le monde, l'époque, le ton, les factions… Plus c'est précis, plus c'est vivant.</div></div>
      <div class="row2">
        <div class="field"><label>Langue des posts</label><input name="language" value="français" /></div>
        <div class="field"><label>Nombre de comptes IA</label><input name="personaCount" type="number" min="5" max="30" value="14" /></div>
      </div>
      <label class="check"><input type="checkbox" name="mature" /><span><b>Mode mature 18+</b><small>Insultes, vulgarité, drague lourde, sexe suggéré, drogues, humour noir, clashs sans filtre. Je confirme avoir 18 ans ou plus.</small></span></label>
      <label class="check"><input type="checkbox" name="autoTick" checked /><span><b>Fil vivant</b><small>Les IA postent toutes seules régulièrement tant que l'onglet est ouvert (consomme des tokens).</small></span></label>
      <button class="btn accent big" type="submit">Créer le monde</button>
    </form></div>`;
  const form = document.getElementById("onboard-form");
  document.getElementById("preset").onchange = (e) => {
    if (e.target.value !== "custom") form.universe.value = presets[e.target.value];
    else { form.universe.value = ""; form.universe.focus(); }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.innerHTML = `Génération du monde… (≈ 30 s à 2 min)`;
    try {
      await api("/world", "POST", {
        user: { name: f.get("name"), handle: f.get("handle"), bio: f.get("bio"), emoji: f.get("emoji") || "🙂" },
        settings: { universe: f.get("universe"), language: f.get("language"), mature: f.get("mature") === "on", autoTick: f.get("autoTick") === "on", personaCount: f.get("personaCount") },
      });
      location.hash = "#/home";
      await refresh(true);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = "Créer le monde";
    }
  };
}

function header(title, sub = "", back = false, extra = "") {
  return `<div class="header">${back ? `<button class="back" data-back>←</button>` : ""}<div class="grow"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${extra}</div>`;
}

function viewHome() {
  const followed = new Set([...W().userFollows, "me"]);
  let posts = [...W().posts].reverse();
  if (homeTab === "following") posts = posts.filter((p) => followed.has(p.authorId));
  return `${header("Accueil")}
    <div class="tabs"><button data-hometab="foryou" class="${homeTab === "foryou" ? "on" : ""}">Pour vous</button><button data-hometab="following" class="${homeTab === "following" ? "on" : ""}">Abonnements</button></div>
    ${statusBar()}
    ${composerHTML({ key: "home" })}
    <div class="toolbar"><div class="status grow">${S.busy ? `<span class="spinner"></span> Le réseau s'agite…` : `${W().posts.length} posts · ${W().personas.length} comptes`}</div>
      <button class="btn outline" data-tick ${S.busy ? "disabled" : ""}>⚡ Faire vivre le fil</button></div>
    ${posts.slice(0, 150).map((p) => postHTML(p)).join("") || `<div class="empty"><h3>Rien ici</h3>Suis des comptes pour remplir cet onglet.</div>`}`;
}

function viewPost(id) {
  const p = postById(id);
  if (!p) return `${header("Post", "", true)}<div class="empty"><h3>Post introuvable</h3></div>`;
  const chain = [];
  let cur = p.replyTo && postById(p.replyTo);
  while (cur && chain.length < 20) { chain.unshift(cur); cur = cur.replyTo && postById(cur.replyTo); }
  const replies = repliesOf(id).sort((a, b) => a.createdAt - b.createdAt);
  const a = author(p.authorId);
  return `${header("Post", "", true)}${statusBar()}
    ${chain.map((c) => postHTML(c, { parent: true, showContext: false })).join("")}
    ${postHTML(p, { focus: true })}
    ${composerHTML({ key: "reply-" + id, placeholder: `Répondre à @${a.handle}`, replyTo: id, button: "Répondre" })}
    ${S.busy ? `<div class="toolbar"><div class="status"><span class="spinner"></span> Des réponses arrivent…</div></div>` : ""}
    ${replies.map((r) => postHTML(r, { showContext: false })).join("")}`;
}

function viewProfile(handle) {
  const a = byHandle(handle);
  if (!a) return `${header("Profil", "", true)}<div class="empty"><h3>Ce compte n'existe pas</h3></div>`;
  const isMe = a.id === "me";
  const all = W().posts.filter((p) => p.authorId === a.id);
  const liked = W().posts.filter((p) => p.likedBy.includes(a.id));
  const list = (profileTab === "posts" ? all.filter((p) => !p.replyTo) : profileTab === "replies" ? all : liked).slice().reverse();
  const following = W().userFollows.includes(a.id);
  const followingCount = isMe ? W().userFollows.length : Math.round(a.followers ** 0.5 / 2) + 30;
  const btns = isMe
    ? `<a class="btn outline" href="#/settings">Éditer le profil</a>`
    : `<a class="btn outline" href="#/messages/${a.id}" title="Message">✉️</a><button class="btn ${following ? "outline" : ""}" data-follow="${a.id}">${following ? "Abonné" : "Suivre"}</button>`;
  return `${header(esc(a.name), `${all.length} posts`, true)}
    <div class="profile-banner" style="background:linear-gradient(135deg, ${a.color}, ${a.color}33)"></div>
    <div class="profile-head">
      <div class="btns">${btns}</div>
      ${avatar(a, "lg")}
      <h2>${esc(a.name)} ${a.verified ? `<span class="verified">✔</span>` : ""}</h2>
      <div class="muted">@${esc(a.handle)}${!isMe && a.followsUser ? `<span class="pill">Vous suit</span>` : ""}${!isMe ? `<span class="pill">IA</span>` : `<span class="pill">Humain</span>`}</div>
      <div class="bio">${richText(a.bio)}</div>
      <div class="counts"><span><b>${fmt(followingCount)}</b> abonnements</span><span><b>${fmt(a.followers)}</b> abonnés</span></div>
    </div>
    <div class="tabs">${[["posts", "Posts"], ["replies", "Réponses"], ["likes", "J'aime"]].map(([k, l]) => `<button data-ptab="${k}" class="${profileTab === k ? "on" : ""}">${l}</button>`).join("")}</div>
    ${list.map((p) => postHTML(p)).join("") || `<div class="empty">Rien pour l'instant.</div>`}`;
}

function viewNotifications() {
  const icons = { like: "❤️", repost: "🔁", follow: "👤", reply: "💬", quote: "✍️", mention: "📣" };
  const verbs = { like: "a aimé ton post", repost: "a republié ton post", follow: "s'est abonné·e à toi", reply: "t'a répondu", quote: "a cité ton post", mention: "t'a mentionné·e" };
  const items = W().notifications.map((n) => {
    const a = author(n.actorId);
    if (!a) return "";
    const p = n.postId && postById(n.postId);
    const target = n.type === "follow" ? `#/u/${a.handle}` : `#/post/${n.postId}`;
    return `<div class="notif ${n.read ? "" : "unread"}" data-go="${target}">
      <div class="ico">${icons[n.type]}</div>
      <div style="flex:1;min-width:0">${avatar(a, "sm")}
        <div style="margin-top:6px"><b>${esc(a.name)}</b> ${verbs[n.type]} <span class="muted">· ${ago(n.createdAt)}</span></div>
        ${p ? `<div class="muted ellipsis" style="margin-top:4px">${esc(p.text)}</div>` : ""}
      </div></div>`;
  });
  return `${header("Notifications", "", false, unreadCount() ? `<button class="btn outline" data-readall>Tout marquer lu</button>` : "")}${statusBar()}
    ${items.join("") || `<div class="empty"><h3>Rien pour l'instant</h3>Poste quelque chose, les IA ne demandent qu'à réagir.</div>`}`;
}

function viewMessages() {
  const convos = Object.entries(W().dms).filter(([, m]) => m.length).sort((a, b) => b[1].at(-1).createdAt - a[1].at(-1).createdAt);
  return `${header("Messages")}${statusBar()}
    <div class="dm-list">${convos.map(([id, msgs]) => {
      const a = author(id);
      const last = msgs.at(-1);
      return a ? `<div class="row" data-go="#/messages/${id}">${avatar(a)}<div style="min-width:0;flex:1"><b>${esc(a.name)}</b> <span class="muted">@${esc(a.handle)} · ${ago(last.createdAt)}</span><div class="muted ellipsis">${last.from === "me" ? "Toi : " : ""}${esc(last.text)}</div></div></div>` : "";
    }).join("")}</div>
    <div class="card" style="margin:16px"><h2>Nouveau message</h2>
      ${W().personas.map((p) => `<div class="row" data-go="#/messages/${p.id}">${avatar(p, "sm")}<div><b>${esc(p.name)}</b> <span class="muted">@${esc(p.handle)}</span></div></div>`).join("")}
    </div>`;
}

function viewChat(id) {
  const a = author(id);
  if (!a || id === "me") return `${header("Messages", "", true)}<div class="empty">Conversation introuvable.</div>`;
  const msgs = W().dms[id] || [];
  return `${header(esc(a.name), "@" + esc(a.handle), true)}
    <div class="chat">
      ${statusBar()}
      <div class="msgs" id="msgs">
        ${msgs.length ? "" : `<div class="empty">${avatar(a, "lg")}<h3>${esc(a.name)}</h3>${esc(a.bio)}</div>`}
        ${msgs.map((m) => `<div class="bubble ${m.from === "me" ? "me" : "them"}">${esc(m.text)}</div>`).join("")}
        ${S.busy && msgs.at(-1)?.from === "me" ? `<div class="bubble them"><span class="spinner" style="display:inline-block"></span></div>` : ""}
      </div>
      <form id="dm-form" data-id="${id}"><input data-key="dm-${id}" placeholder="Écrire un message" autocomplete="off" /><button class="btn accent">Envoyer</button></form>
    </div>`;
}

function viewExplore() {
  const q = (exploreQuery || "").toLowerCase();
  const people = W().personas.filter((p) => !q || (p.name + " " + p.handle + " " + p.bio).toLowerCase().includes(q));
  const posts = q ? [...W().posts].reverse().filter((p) => p.text.toLowerCase().includes(q)).slice(0, 50) : [];
  return `${header("Explorer")}
    <div style="padding:12px 16px 0"><input class="search" data-key="explore" id="explore-q" placeholder="Rechercher" value="${esc(exploreQuery)}" /></div>
    ${!q ? `<div class="card" style="margin:0 16px 16px"><h2>Tendances</h2>${trendsHTML()}</div>` : ""}
    <div class="card" style="margin:0 16px 16px"><h2>Comptes</h2>${people.map(personRow).join("") || `<div class="row muted">Personne.</div>`}</div>
    ${posts.map((p) => postHTML(p)).join("")}
    ${!q ? `<details class="spoiler"><summary>🤫 Coulisses : intrigues en cours (spoilers)</summary>${W().storylines.map((s) => `<div class="storyline">${esc(s)}</div>`).join("")}</details>` : ""}`;
}
let exploreQuery = "";

function personRow(p) {
  const f = W().userFollows.includes(p.id);
  return `<div class="row" data-go="#/u/${p.handle}">${avatar(p)}<div style="flex:1;min-width:0"><b class="ellipsis">${esc(p.name)} ${p.verified ? `<span class="verified">✔</span>` : ""}</b><div class="muted ellipsis">@${esc(p.handle)}${p.followsUser ? ` <span class="pill">Vous suit</span>` : ""}</div></div>
    <button class="btn ${f ? "outline" : ""}" data-follow="${p.id}">${f ? "Abonné" : "Suivre"}</button></div>`;
}
function trendsHTML() {
  return (W().trends || []).map((t) => `<div class="row trend" data-search="${esc(t.tag)}"><div><span class="small">Tendance</span><b>${esc(t.tag)}</b><span class="small">${esc(t.label)}</span></div></div>`).join("") || `<div class="row muted">Pas encore de tendances.</div>`;
}

function viewSettings() {
  const w = W();
  return `${header("Paramètres", "", true)}
    <form class="settings" id="settings-form">
      <h3>Profil</h3>
      <div class="row2"><div class="field" style="flex:3"><label>Nom</label><input name="name" value="${esc(w.user.name)}" /></div>
      <div class="field" style="flex:1"><label>Avatar</label><input name="emoji" value="${esc(w.user.emoji)}" /></div></div>
      <div class="field"><label>Bio</label><input name="bio" value="${esc(w.user.bio)}" maxlength="200" /></div>
      <h3>Univers</h3>
      <div class="field"><textarea name="universe">${esc(w.settings.universe)}</textarea><div class="hint">Tu peux faire évoluer l'univers en cours de partie (ex. « une guerre vient d'éclater »).</div></div>
      <label class="check"><input type="checkbox" name="mature" ${w.settings.mature ? "checked" : ""} /><span><b>Mode mature 18+</b><small>Je confirme avoir 18 ans ou plus.</small></span></label>
      <label class="check"><input type="checkbox" name="autoTick" ${w.settings.autoTick ? "checked" : ""} /><span><b>Fil vivant</b><small>Les IA postent automatiquement tant que l'onglet est ouvert.</small></span></label>
      <button class="btn accent" type="submit">Enregistrer</button>
      <h3>Zone dangereuse</h3>
      <button class="btn danger" type="button" data-reset>Supprimer ce monde et recommencer</button>
      <p class="muted">${S.demo ? "Mode démo" : "Modèle : " + esc(S.model || "")} · ${w.stats.ticks} ticks</p>
    </form>`;
}

function sidebar() {
  const suggestions = W().personas.filter((p) => !W().userFollows.includes(p.id)).sort((a, b) => b.followers - a.followers).slice(0, 4);
  return `<input class="search" placeholder="Rechercher" data-key="side-search" id="side-search" />
    <div class="card"><h2>Tendances</h2>${trendsHTML()}</div>
    ${suggestions.length ? `<div class="card"><h2>Suggestions</h2>${suggestions.map(personRow).join("")}</div>` : ""}
    <p class="muted" style="font-size:13px;padding:0 8px">Écho — tous les comptes sont des IA, sauf toi.</p>`;
}

function navHTML(route) {
  const u = unreadCount();
  const items = [
    ["home", "🏠", "Accueil"],
    ["explore", "🔎", "Explorer"],
    ["notifications", "🔔", "Notifications"],
    ["messages", "✉️", "Messages"],
    [`u/${W().user.handle}`, "👤", "Profil"],
    ["settings", "⚙️", "Paramètres"],
  ];
  const badge = (k) => (k === "notifications" && u ? `<span class="badge">${u}</span>` : "");
  return {
    side: `<nav class="nav"><a class="logo" href="#/home">🌀</a>
      ${items.map(([k, i, l]) => `<a class="item ${route.startsWith(k) ? "active" : ""}" href="#/${k}"><span class="ico">${i}${badge(k)}</span>${l}</a>`).join("")}
      <button class="btn accent big" data-newpost>Poster</button>
      <a class="me" href="#/u/${W().user.handle}">${avatar(W().user)}<div><b>${esc(W().user.name)}</b><div class="muted">@${esc(W().user.handle)}</div></div></a></nav>`,
    mobile: `<div class="mobile-nav">${items.slice(0, 5).map(([k, i]) => `<a href="#/${k}">${i}${badge(k)}</a>`).join("")}</div>`,
  };
}

// ---------- Routeur / rendu ----------
function route() {
  return location.hash.replace(/^#\/?/, "") || "home";
}

function render() {
  if (!W()) return viewOnboarding();
  const r = route();
  const [name, arg] = r.split("/");
  let main;
  if (name === "post") main = viewPost(arg);
  else if (name === "u") main = viewProfile(decodeURIComponent(arg || ""));
  else if (name === "notifications") main = viewNotifications();
  else if (name === "messages") main = arg ? viewChat(arg) : viewMessages();
  else if (name === "explore") main = viewExplore();
  else if (name === "settings") main = viewSettings();
  else main = viewHome();

  // Préserver la saisie en cours et le focus à travers les re-rendus
  const saved = {};
  document.querySelectorAll("[data-key]").forEach((el) => (saved[el.dataset.key] = el.value));
  const focusKey = document.activeElement?.dataset?.key;
  const sel = focusKey ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const scroll = window.scrollY;

  const nav = navHTML(r);
  $app.innerHTML = `<div class="layout">${nav.side}<main class="main">${main}</main><aside class="side">${sidebar()}</aside></div>${nav.mobile}`;

  document.querySelectorAll("[data-key]").forEach((el) => {
    if (saved[el.dataset.key] !== undefined && el.id !== "explore-q") el.value = saved[el.dataset.key];
    if (el.dataset.key === focusKey) {
      el.focus();
      try { el.setSelectionRange(...sel); } catch {}
    }
  });
  window.scrollTo(0, scroll);
  const msgs = document.getElementById("msgs");
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
  updateCounts();
}

function updateCounts() {
  document.querySelectorAll("form[data-compose]").forEach((f) => {
    const t = f.querySelector("textarea");
    f.querySelector(".count").textContent = t.value.length ? `${t.value.length}/600` : "";
    f.querySelector("button").disabled = !t.value.trim();
  });
}

function signature() {
  const w = S.world;
  if (!w) return "none" + S.error;
  const dmLen = Object.values(w.dms).reduce((n, m) => n + m.length, 0);
  const sum = w.posts.reduce((n, p) => n + p.likes + p.reposts, 0);
  return [w.posts.length, sum, w.notifications.length, unreadCount(), dmLen, w.userFollows.length, S.busy, S.error, w.trends.map((t) => t.tag).join()].join("|");
}

async function refresh(force = false) {
  try {
    const data = await api("/state");
    S = data;
    const sig = signature();
    if (force || sig !== lastSig) {
      lastSig = sig;
      render();
    }
  } catch (err) {
    console.warn(err);
  }
}

// ---------- Interactions ----------
function openModal(html) {
  $modal.innerHTML = `<div class="modal-bg" data-close><div class="modal"><div class="top"><button data-close>✕</button></div>${html}</div></div>`;
  const t = $modal.querySelector("textarea");
  if (t) t.focus();
  updateCounts();
}
function closeModal() { $modal.innerHTML = ""; }

async function submitPost(form) {
  const t = form.querySelector("textarea");
  const text = t.value.trim();
  if (!text || pendingAction) return;
  pendingAction = true;
  try {
    const { post } = await api("/posts", "POST", { text, replyTo: form.dataset.reply || null, quoteOf: form.dataset.quote || null });
    t.value = "";
    closeModal();
    if (form.dataset.reply || form.dataset.quote) location.hash = `#/post/${post.id}`;
    await refresh(true);
  } catch (err) {
    toast(err.message);
  } finally {
    pendingAction = false;
  }
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act],[data-follow],[data-tick],[data-back],[data-close],[data-newpost],[data-readall],[data-reset],[data-ptab],[data-hometab],[data-search],[data-go],a");
  if (!el) return;
  if (el.matches("a")) return; // liens normaux
  if (el.dataset.close !== undefined) { if (e.target === el) closeModal(); return; }
  e.preventDefault();
  if (el.dataset.act) {
    const id = el.dataset.id;
    if (el.dataset.act === "reply") return (location.hash = `#/post/${id}`), setTimeout(() => document.querySelector(`[data-key="reply-${id}"]`)?.focus(), 50);
    if (el.dataset.act === "quote") {
      return openModal(composerHTML({ key: "quote", placeholder: "Ajouter un commentaire", quoteOf: id, button: "Poster" }) + quoteHTML(postById(id)).replace("data-go", "data-x") + "<div style='height:16px'></div>");
    }
    const { post } = await api(`/posts/${id}/${el.dataset.act}`, "POST");
    Object.assign(postById(id), post);
    lastSig = signature();
    return render();
  }
  if (el.dataset.follow) {
    await api(`/follow/${el.dataset.follow}`, "POST");
    return refresh(true);
  }
  if (el.dataset.tick !== undefined) {
    S.busy = true;
    render();
    api("/tick", "POST").catch((err) => toast(err.message)).finally(() => refresh(true));
    return;
  }
  if (el.dataset.back !== undefined) return history.length > 1 ? history.back() : (location.hash = "#/home");
  if (el.dataset.newpost !== undefined) return openModal(composerHTML({ key: "modal" }));
  if (el.dataset.readall !== undefined) { await api("/notifications/read", "POST"); return refresh(true); }
  if (el.dataset.reset !== undefined) {
    if (!confirm("Supprimer définitivement ce monde ?")) return;
    await api("/world", "DELETE");
    location.hash = "";
    return refresh(true);
  }
  if (el.dataset.ptab) { profileTab = el.dataset.ptab; return render(); }
  if (el.dataset.hometab) { homeTab = el.dataset.hometab; return render(); }
  if (el.dataset.search) { exploreQuery = el.dataset.search; location.hash = "#/explore"; return render(); }
  if (el.dataset.go) location.hash = el.dataset.go;
});

document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (form.matches("[data-compose]")) { e.preventDefault(); return submitPost(form); }
  if (form.id === "dm-form") {
    e.preventDefault();
    const input = form.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const id = form.dataset.id;
    (S.world.dms[id] ||= []).push({ from: "me", text, createdAt: Date.now() });
    S.busy = true;
    render();
    api(`/dms/${id}`, "POST", { text }).catch((err) => toast(err.message)).finally(() => refresh(true));
  }
  if (form.id === "settings-form") {
    e.preventDefault();
    const f = new FormData(form);
    await api("/settings", "POST", { universe: f.get("universe"), mature: f.get("mature") === "on", autoTick: f.get("autoTick") === "on", user: { name: f.get("name"), bio: f.get("bio"), emoji: f.get("emoji") } });
    toast("Enregistré");
    refresh(true);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.matches("[data-compose] textarea")) updateCounts();
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("[data-compose] textarea") && e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitPost(e.target.closest("form"));
  if (e.key === "Escape") closeModal();
  if ((e.target.id === "side-search" || e.target.id === "explore-q") && e.key === "Enter") {
    exploreQuery = e.target.value.trim();
    location.hash = "#/explore";
    render();
  }
});

window.addEventListener("hashchange", () => {
  closeModal();
  window.scrollTo(0, 0);
  if (route().startsWith("notifications") && W() && unreadCount()) {
    render();
    api("/notifications/read", "POST").then(() => setTimeout(() => refresh(), 1500));
    return;
  }
  render();
  window.scrollTo(0, 0);
});

// Poll : rapide quand l'IA travaille, plus lent sinon
async function loop() {
  await refresh();
  setTimeout(loop, S.busy ? 2000 : 6000);
}
loop();
setInterval(() => document.querySelectorAll(".time").length && !document.activeElement?.dataset?.key && render(), 60000);
