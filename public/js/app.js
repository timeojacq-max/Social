// Écho — interface (vanilla JS, routage par hash, pensée mobile d'abord)
import { getWorld, getConfig, setConfig, DEFAULT_MODEL } from "./store.js";
import * as game from "./game.js";
import { isDemo } from "./ai.js";

const $app = document.getElementById("app");
const $modal = document.getElementById("modal-root");
const $toast = document.getElementById("toast");

let lastSig = "";
let profileTab = "posts";
let homeTab = "foryou";
let exploreQuery = "";
let installPrompt = null;

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
    .replace(/(^|[^\w])@(\w{1,20})/g, (m, pre, h) => `${pre}<a class="mention" href="#/u/${h}">@${h}</a>`)
    .replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, (m, pre, tag) => `${pre}<span class="tag">#${tag}</span>`);
}
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.add("hidden"), 3500);
}
const isMobile = () => matchMedia("(max-width: 760px)").matches;
const isStandalone = () => matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || navigator.standalone;

// ---------- Accès au monde ----------
const W = getWorld;
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
const busy = () => game.state.busy > 0;

// ---------- Rendu des posts ----------
function quoteHTML(q, clickable = true) {
  if (!q) return "";
  const a = author(q.authorId);
  if (!a) return "";
  return `<div class="quote" ${clickable ? `data-go="#/post/${q.id}"` : ""}>
    <div class="meta">${avatar(a, "xs")}<span class="name">${esc(a.name)}</span><span class="handle">@${esc(a.handle)} · ${ago(q.createdAt)}</span></div>
    <div class="text">${richText(q.text)}</div></div>`;
}

function postHTML(p, { focus = false, parent = false, showContext = true } = {}) {
  const a = author(p.authorId);
  if (!a) return "";
  const liked = p.likedBy.includes("me");
  const reposted = p.repostedBy.includes("me");
  const parentPost = p.replyTo && postById(p.replyTo);
  const parentAuthor = parentPost && author(parentPost.authorId);
  const ctx = showContext && parentAuthor ? `<div class="context">En réponse à <a class="mention" href="#/u/${parentAuthor.handle}">@${esc(parentAuthor.handle)}</a></div>` : "";
  const nReplies = repliesOf(p.id).length;
  const verified = a.verified ? `<span class="verified" title="Certifié">✔</span>` : "";
  const head = `<a href="#/u/${a.handle}" class="name">${esc(a.name)}</a>${verified}<span class="handle">@${esc(a.handle)}</span>`;
  const actions = `<div class="actions">
      <button data-act="reply" data-id="${p.id}" aria-label="Répondre">💬<span>${nReplies || ""}</span></button>
      <button class="repost ${reposted ? "on" : ""}" data-act="repost" data-id="${p.id}" aria-label="Republier">🔁<span>${p.reposts || ""}</span></button>
      <button class="like ${liked ? "on" : ""}" data-act="like" data-id="${p.id}" aria-label="J'aime">${liked ? "❤️" : "🤍"}<span>${p.likes || ""}</span></button>
      <button data-act="quote" data-id="${p.id}" aria-label="Citer">✍️</button>
      <button class="views" disabled aria-label="Vues">📊<span>${fmt(p.views)}</span></button>
    </div>`;
  const quote = quoteHTML(p.quoteOf && postById(p.quoteOf));
  if (focus) {
    return `<article class="post focus ${p.authorId === "me" ? "mine" : ""}">
      <div class="meta">${avatar(a)}<div class="who">${head}</div></div>
      ${ctx}<div class="text">${richText(p.text)}</div>${quote}
      <div class="muted stamp">${new Date(p.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · <b>${fmt(p.views)}</b> vues</div>
      ${actions}</article>`;
  }
  return `<article class="post ${parent ? "thread-parent" : ""} ${p.authorId === "me" ? "mine" : ""}" data-go="#/post/${p.id}">
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
      <textarea data-key="${key}" placeholder="${esc(placeholder)}" maxlength="600" rows="2"></textarea>
      <div class="row"><span class="count"></span><button class="btn accent" type="submit">${button}</button></div>
    </div></form>`;
}

function statusBar() {
  const err = game.state.error ? `<div class="error-bar"><span>⚠️ ${esc(game.state.error)}</span><button data-dismiss aria-label="Fermer">✕</button></div>` : "";
  const demo = isDemo() ? `<a class="demo-bar" href="#/settings">Mode démo : contenu factice. Ajoute ta clé API Gemini dans les paramètres pour la vraie IA →</a>` : "";
  return demo + err;
}

// ---------- Vues ----------
const PRESETS = {
  reel: "Le monde réel contemporain, en France, version très dramatique : influenceurs, téléréalité, politique, rap, médias, comptes anonymes de ragots. Personnages tous fictifs.",
  tv: "Les coulisses d'une émission de téléréalité géante, « L'Île des Ex » : candidats, ex des candidats, production, fans hystériques, comptes de ragots, chroniqueurs télé.",
  cyber: "Néo-Lyon, 2089. Mégacorporations, implants cybernétiques, IA émancipées, gangs, hackers, flics corrompus et stars holographiques.",
  fantasy: "Le royaume d'Aldoria, où un réseau magique de « corbeaux-messagers » fonctionne comme un réseau social. Nobles, sorciers, mercenaires, bardes et espions s'y écharpent pendant une crise de succession.",
  school: "Une prestigieuse école de magie moderne : étudiants, profs, fantômes, rivalités entre maisons, comptes anonymes qui balancent tout.",
};

function viewOnboarding() {
  const busyNow = busy();
  $app.innerHTML = `<div class="onboard">
    <h1>🌀 Écho</h1>
    <div class="lead">Un réseau social où <b>tu es le seul humain</b>. Tous les autres comptes sont des IA, avec leurs egos, leurs drames et leurs secrets.</div>
    ${game.state.error ? `<div class="error-bar"><span>⚠️ ${esc(game.state.error)}</span></div>` : ""}
    <form id="onboard-form">
      <div class="field"><label>Clé API Gemini</label><input name="apiKey" type="password" autocomplete="off" value="${esc(getConfig().apiKey)}" placeholder="Colle ta clé ici (laisser vide = mode démo)" />
        <div class="hint">Gratuite sur <a class="mention" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Elle reste enregistrée uniquement sur cet appareil.</div></div>
      <div class="row2">
        <div class="field"><label>Ton nom</label><input name="name" required maxlength="50" placeholder="Alex" /></div>
        <div class="field"><label>Pseudo (@)</label><input name="handle" required maxlength="20" placeholder="alex" autocapitalize="off" /></div>
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
      <div class="field"><textarea name="universe">${PRESETS.reel}</textarea>
        <div class="hint">Décris librement le monde, l'époque, le ton, les factions… Plus c'est précis, plus c'est vivant.</div></div>
      <div class="row2">
        <div class="field"><label>Langue</label><input name="language" value="français" /></div>
        <div class="field"><label>Comptes IA</label><input name="personaCount" type="number" inputmode="numeric" min="5" max="30" value="14" /></div>
      </div>
      <label class="check"><input type="checkbox" name="mature" /><span><b>Mode mature 18+</b><small>Insultes, vulgarité, drague lourde, sexe suggéré, drogues, humour noir, clashs sans filtre. Je confirme avoir 18 ans ou plus.</small></span></label>
      <label class="check"><input type="checkbox" name="autoTick" checked /><span><b>Fil vivant</b><small>Les IA postent toutes seules régulièrement tant que l'appli est ouverte.</small></span></label>
      <button class="btn accent big" type="submit" ${busyNow ? "disabled" : ""}>${busyNow ? `<span class="spinner"></span> Création du monde… (≈ 20 s à 1 min)` : "Créer le monde"}</button>
    </form>
    ${installHTML()}
  </div>`;
  const form = document.getElementById("onboard-form");
  document.getElementById("preset").onchange = (e) => {
    if (e.target.value !== "custom") form.universe.value = PRESETS[e.target.value];
    else {
      form.universe.value = "";
      form.universe.focus();
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    setConfig({ apiKey: String(f.get("apiKey") || "").trim() });
    try {
      await game.createWorld({
        user: { name: f.get("name"), handle: f.get("handle"), bio: f.get("bio"), emoji: f.get("emoji") || "🙂" },
        settings: { universe: f.get("universe"), language: f.get("language"), mature: f.get("mature") === "on", autoTick: f.get("autoTick") === "on", personaCount: f.get("personaCount") },
      });
      location.hash = "#/home";
    } catch {
      /* l'erreur est affichée par le re-rendu */
    }
    render(true);
  };
  // Conserver la saisie si un re-rendu survient pendant la génération
  form.querySelectorAll("input,textarea").forEach((el) => {
    const k = "onb-" + el.name;
    if (sessionStorage.getItem(k) !== null) el.type === "checkbox" ? (el.checked = sessionStorage.getItem(k) === "1") : (el.value = sessionStorage.getItem(k));
    el.addEventListener("input", () => sessionStorage.setItem(k, el.type === "checkbox" ? (el.checked ? "1" : "0") : el.value));
  });
}

function installHTML() {
  if (isStandalone()) return "";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<div class="install card">
    <h2>📲 Installer en plein écran</h2>
    ${installPrompt ? `<div class="row"><button class="btn accent" data-install>Installer l'appli</button></div>` : ""}
    <div class="row muted">${ios ? "Sur iPhone : bouton Partager <b>⎋</b> puis « Sur l'écran d'accueil »." : "Sur Android (Chrome) : menu <b>⋮</b> puis « Installer l'application » ou « Ajouter à l'écran d'accueil »."} L'appli s'ouvrira ensuite en plein écran, comme une vraie appli.</div>
  </div>`;
}

function header(title, { sub = "", back = false, extra = "", left = "" } = {}) {
  return `<div class="header">${back ? `<button class="back" data-back aria-label="Retour">←</button>` : left}<div class="grow"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${extra}</div>`;
}

function viewHome() {
  const followed = new Set([...W().userFollows, "me"]);
  let posts = [...W().posts].reverse();
  if (homeTab === "following") posts = posts.filter((p) => followed.has(p.authorId));
  const left = `<a class="hdr-avatar" href="#/u/${W().user.handle}" aria-label="Profil">${avatar(W().user, "sm")}</a>`;
  const extra = `<button class="icon-btn" data-tick ${busy() ? "disabled" : ""} aria-label="Faire vivre le fil">${busy() ? `<span class="spinner"></span>` : "⚡"}</button><a class="icon-btn only-mobile" href="#/settings" aria-label="Paramètres">⚙️</a>`;
  return `${header("Accueil", { left, extra })}
    <div class="tabs"><button data-hometab="foryou" class="${homeTab === "foryou" ? "on" : ""}">Pour vous</button><button data-hometab="following" class="${homeTab === "following" ? "on" : ""}">Abonnements</button></div>
    ${statusBar()}
    <div class="only-desktop">${composerHTML({ key: "home" })}</div>
    ${busy() ? `<div class="toolbar"><div class="status"><span class="spinner"></span> Le réseau s'agite…</div></div>` : ""}
    ${posts.slice(0, 150).map((p) => postHTML(p)).join("") || `<div class="empty"><h3>Rien ici</h3>Suis des comptes pour remplir cet onglet.</div>`}`;
}

function viewPost(id) {
  const p = postById(id);
  if (!p) return `${header("Post", { back: true })}<div class="empty"><h3>Post introuvable</h3></div>`;
  const chain = [];
  let cur = p.replyTo && postById(p.replyTo);
  while (cur && chain.length < 20) {
    chain.unshift(cur);
    cur = cur.replyTo && postById(cur.replyTo);
  }
  const replies = repliesOf(id).sort((a, b) => a.createdAt - b.createdAt);
  const a = author(p.authorId);
  return `${header("Post", { back: true })}${statusBar()}
    ${chain.map((c) => postHTML(c, { parent: true, showContext: false })).join("")}
    ${postHTML(p, { focus: true })}
    ${composerHTML({ key: "reply-" + id, placeholder: `Répondre à @${a.handle}`, replyTo: id, button: "Répondre" })}
    ${busy() ? `<div class="toolbar"><div class="status"><span class="spinner"></span> Des réponses arrivent…</div></div>` : ""}
    ${replies.map((r) => postHTML(r, { showContext: false })).join("")}`;
}

function viewProfile(handle) {
  const a = byHandle(handle);
  if (!a) return `${header("Profil", { back: true })}<div class="empty"><h3>Ce compte n'existe pas</h3></div>`;
  const isMe = a.id === "me";
  const all = W().posts.filter((p) => p.authorId === a.id);
  const liked = W().posts.filter((p) => p.likedBy.includes(a.id));
  const list = (profileTab === "posts" ? all.filter((p) => !p.replyTo) : profileTab === "replies" ? all : liked).slice().reverse();
  const following = W().userFollows.includes(a.id);
  const followingCount = isMe ? W().userFollows.length : Math.round(a.followers ** 0.5 / 2) + 30;
  const btns = isMe
    ? `<a class="btn outline" href="#/settings">Éditer le profil</a>`
    : `<a class="btn outline round" href="#/messages/${a.id}" aria-label="Message">✉️</a><button class="btn ${following ? "outline" : ""}" data-follow="${a.id}">${following ? "Abonné" : "Suivre"}</button>`;
  return `${header(esc(a.name), { sub: `${all.length} posts`, back: true })}
    <div class="profile-banner" style="background:linear-gradient(135deg, ${a.color}, ${a.color}33)"></div>
    <div class="profile-head">
      <div class="btns">${btns}</div>
      ${avatar(a, "lg")}
      <h2>${esc(a.name)} ${a.verified ? `<span class="verified">✔</span>` : ""}</h2>
      <div class="muted">@${esc(a.handle)}${!isMe && a.followsUser ? `<span class="pill">Vous suit</span>` : ""}<span class="pill">${isMe ? "Humain" : "IA"}</span></div>
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
      <div class="grow">${avatar(a, "sm")}
        <div class="line"><b>${esc(a.name)}</b> ${verbs[n.type]} <span class="muted">· ${ago(n.createdAt)}</span></div>
        ${p ? `<div class="muted clamp">${esc(p.text)}</div>` : ""}
      </div></div>`;
  });
  return `${header("Notifications")}${statusBar()}
    ${items.join("") || `<div class="empty"><h3>Rien pour l'instant</h3>Poste quelque chose, les IA ne demandent qu'à réagir.</div>`}`;
}

function viewMessages() {
  const convos = Object.entries(W().dms)
    .filter(([, m]) => m.length)
    .sort((a, b) => b[1].at(-1).createdAt - a[1].at(-1).createdAt);
  const started = new Set(convos.map(([id]) => id));
  return `${header("Messages")}${statusBar()}
    <div class="dm-list">${convos
      .map(([id, msgs]) => {
        const a = author(id);
        const last = msgs.at(-1);
        return a ? `<div class="row" data-go="#/messages/${id}">${avatar(a)}<div class="grow"><div class="ellipsis"><b>${esc(a.name)}</b> <span class="muted">@${esc(a.handle)} · ${ago(last.createdAt)}</span></div><div class="muted ellipsis">${last.from === "me" ? "Toi : " : ""}${esc(last.text)}</div></div></div>` : "";
      })
      .join("")}</div>
    <h3 class="section-title">Nouveau message</h3>
    <div class="dm-list">${W().personas
      .filter((p) => !started.has(p.id))
      .map((p) => `<div class="row" data-go="#/messages/${p.id}">${avatar(p, "sm")}<div class="grow ellipsis"><b>${esc(p.name)}</b> <span class="muted">@${esc(p.handle)}</span></div></div>`)
      .join("")}</div>`;
}

function viewChat(id) {
  const a = author(id);
  if (!a || id === "me") return `${header("Messages", { back: true })}<div class="empty">Conversation introuvable.</div>`;
  const msgs = W().dms[id] || [];
  const left = `<button class="back" data-back aria-label="Retour">←</button><a href="#/u/${a.handle}">${avatar(a, "sm")}</a>`;
  return `<div class="chat">
      ${header(esc(a.name), { sub: "@" + esc(a.handle), left })}
      ${statusBar()}
      <div class="msgs" id="msgs">
        ${msgs.length ? "" : `<div class="empty">${avatar(a, "lg")}<h3>${esc(a.name)}</h3>${esc(a.bio)}</div>`}
        ${msgs.map((m) => `<div class="bubble ${m.from === "me" ? "me" : "them"}">${esc(m.text)}</div>`).join("")}
        ${busy() && msgs.at(-1)?.from === "me" ? `<div class="bubble them typing"><span></span><span></span><span></span></div>` : ""}
      </div>
      <form id="dm-form" data-id="${id}"><input data-key="dm-${id}" placeholder="Écrire un message" autocomplete="off" enterkeyhint="send" /><button class="btn accent" aria-label="Envoyer">➤</button></form>
    </div>`;
}

function viewExplore() {
  const q = exploreQuery.toLowerCase();
  const people = W().personas.filter((p) => !q || (p.name + " " + p.handle + " " + p.bio).toLowerCase().includes(q));
  const posts = q ? [...W().posts].reverse().filter((p) => p.text.toLowerCase().includes(q)).slice(0, 50) : [];
  return `${header("Explorer")}
    <form class="search-wrap" id="search-form"><input class="search" type="search" enterkeyhint="search" id="explore-q" placeholder="Rechercher" value="${esc(exploreQuery)}" /></form>
    ${!q ? `<div class="card"><h2>Tendances</h2>${trendsHTML()}</div>` : ""}
    <div class="card"><h2>Comptes</h2>${people.map(personRow).join("") || `<div class="row muted">Personne.</div>`}</div>
    ${posts.map((p) => postHTML(p)).join("")}
    ${!q ? `<details class="spoiler"><summary>🤫 Coulisses : intrigues en cours (spoilers)</summary>${W().storylines.map((s) => `<div class="storyline">${esc(s)}</div>`).join("")}</details>` : ""}`;
}

function personRow(p) {
  const f = W().userFollows.includes(p.id);
  return `<div class="row" data-go="#/u/${p.handle}">${avatar(p)}<div class="grow"><b class="ellipsis">${esc(p.name)} ${p.verified ? `<span class="verified">✔</span>` : ""}</b><div class="muted ellipsis">@${esc(p.handle)}${p.followsUser ? ` <span class="pill">Vous suit</span>` : ""}</div></div>
    <button class="btn ${f ? "outline" : ""}" data-follow="${p.id}">${f ? "Abonné" : "Suivre"}</button></div>`;
}
function trendsHTML() {
  return (W().trends || []).map((t) => `<div class="row trend" data-search="${esc(t.tag)}"><div><span class="small">Tendance</span><b>${esc(t.tag)}</b><span class="small">${esc(t.label)}</span></div></div>`).join("") || `<div class="row muted">Pas encore de tendances.</div>`;
}

function viewSettings() {
  const w = W();
  const c = getConfig();
  return `${header("Paramètres", { back: true })}
    <form class="settings" id="settings-form">
      <h3>Intelligence artificielle</h3>
      <div class="field"><label>Clé API Gemini</label><input name="apiKey" type="password" autocomplete="off" value="${esc(c.apiKey)}" placeholder="Vide = mode démo" />
        <div class="hint">Gratuite sur <a class="mention" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Stockée uniquement sur cet appareil.</div></div>
      <div class="row2">
        <div class="field"><label>Modèle</label><input name="model" value="${esc(c.model)}" placeholder="${DEFAULT_MODEL}" autocapitalize="off" /></div>
        <div class="field"><label>Fil auto (secondes)</label><input name="tickSeconds" type="number" inputmode="numeric" min="20" value="${esc(c.tickSeconds)}" /></div>
      </div>
      <h3>Profil</h3>
      <div class="row2"><div class="field" style="flex:3"><label>Nom</label><input name="name" value="${esc(w.user.name)}" /></div>
      <div class="field" style="flex:1"><label>Avatar</label><input name="emoji" value="${esc(w.user.emoji)}" /></div></div>
      <div class="field"><label>Bio</label><input name="bio" value="${esc(w.user.bio)}" maxlength="200" /></div>
      <h3>Univers</h3>
      <div class="field"><textarea name="universe">${esc(w.settings.universe)}</textarea><div class="hint">Tu peux faire évoluer l'univers en cours de partie (ex. « une guerre vient d'éclater »).</div></div>
      <label class="check"><input type="checkbox" name="mature" ${w.settings.mature ? "checked" : ""} /><span><b>Mode mature 18+</b><small>Je confirme avoir 18 ans ou plus.</small></span></label>
      <label class="check"><input type="checkbox" name="autoTick" ${w.settings.autoTick ? "checked" : ""} /><span><b>Fil vivant</b><small>Les IA postent automatiquement tant que l'appli est ouverte.</small></span></label>
      <button class="btn accent big" type="submit">Enregistrer</button>
      ${installHTML()}
      <h3>Zone dangereuse</h3>
      <button class="btn danger" type="button" data-reset>Supprimer ce monde et recommencer</button>
      <p class="muted small">${isDemo() ? "Mode démo" : "Modèle : " + esc(c.model)} · ${w.posts.length} posts · ${w.stats.ticks} ticks</p>
    </form>`;
}

function sidebar() {
  const suggestions = W().personas.filter((p) => !W().userFollows.includes(p.id)).sort((a, b) => b.followers - a.followers).slice(0, 4);
  return `<div class="card"><h2>Tendances</h2>${trendsHTML()}</div>
    ${suggestions.length ? `<div class="card"><h2>Suggestions</h2>${suggestions.map(personRow).join("")}</div>` : ""}
    <p class="muted small">Écho — tous les comptes sont des IA, sauf toi.</p>`;
}

function navHTML(r) {
  const u = unreadCount();
  const items = [
    ["home", "🏠", "Accueil"],
    ["explore", "🔎", "Explorer"],
    ["notifications", "🔔", "Notifications"],
    ["messages", "✉️", "Messages"],
    [`u/${W().user.handle}`, "👤", "Profil"],
    ["settings", "⚙️", "Paramètres"],
  ];
  const badge = (k) => (k === "notifications" && u ? `<span class="badge">${u > 99 ? "99+" : u}</span>` : "");
  const active = (k) => (r === k || r.startsWith(k + "/") ? "active" : "");
  return {
    side: `<nav class="nav"><a class="logo" href="#/home">🌀</a>
      ${items.map(([k, i, l]) => `<a class="item ${active(k)}" href="#/${k}"><span class="ico">${i}${badge(k)}</span>${l}</a>`).join("")}
      <button class="btn accent big" data-newpost>Poster</button>
      <a class="me" href="#/u/${W().user.handle}">${avatar(W().user)}<div><b>${esc(W().user.name)}</b><div class="muted">@${esc(W().user.handle)}</div></div></a></nav>`,
    mobile: `<nav class="mobile-nav">${items
      .slice(0, 5)
      .map(([k, i, l]) => `<a class="${active(k)}" href="#/${k}" aria-label="${l}"><span class="ico">${i}${badge(k)}</span></a>`)
      .join("")}</nav>`,
  };
}

// ---------- Routeur / rendu ----------
const route = () => location.hash.replace(/^#\/?/, "") || "home";

function render(force = false) {
  if (!W()) {
    lastSig = "";
    return viewOnboarding();
  }
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

  // Préserver la saisie en cours, le focus et le défilement à travers les re-rendus
  const saved = {};
  document.querySelectorAll("[data-key]").forEach((el) => (saved[el.dataset.key] = el.value));
  const active = document.activeElement;
  const focusKey = active?.dataset?.key;
  const sel = focusKey ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = window.scrollY;
  const settingsOpen = name === "settings" && document.getElementById("settings-form");
  if (settingsOpen && !force) return; // ne pas écraser un formulaire en cours d'édition

  const nav = navHTML(r);
  const fab = ["home", "u", "explore", "notifications"].includes(name) ? `<button class="fab" data-newpost aria-label="Poster">＋</button>` : "";
  $app.innerHTML = `<div class="layout ${name === "messages" && arg ? "in-chat" : ""}">${nav.side}<main class="main">${main}</main><aside class="side">${sidebar()}</aside></div>${fab}${nav.mobile}`;

  document.querySelectorAll("[data-key]").forEach((el) => {
    if (saved[el.dataset.key] !== undefined) el.value = saved[el.dataset.key];
    if (el.dataset.key === focusKey) {
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(...sel);
      } catch {}
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
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 320) + "px";
  });
}

function signature() {
  const w = W();
  if (!w) return "none";
  const dmLen = Object.values(w.dms).reduce((n, m) => n + m.length, 0);
  const sum = w.posts.reduce((n, p) => n + p.likes + p.reposts, 0);
  return [w.posts.length, sum, w.notifications.length, unreadCount(), dmLen, w.userFollows.length, game.state.busy, game.state.error, w.trends.map((t) => t.tag).join(), w.user.name, w.user.emoji].join("|");
}

game.onChange(() => {
  if (!W()) return render();
  const sig = signature();
  if (sig !== lastSig) {
    lastSig = sig;
    render();
  }
});

// ---------- Interactions ----------
function openModal(html) {
  $modal.innerHTML = `<div class="modal-bg" data-close><div class="modal"><div class="top"><button type="button" data-close aria-label="Fermer">✕</button></div>${html}</div></div>`;
  document.body.classList.add("modal-open");
  $modal.querySelector("textarea")?.focus();
  updateCounts();
}
function closeModal() {
  $modal.innerHTML = "";
  document.body.classList.remove("modal-open");
}

function submitPost(form) {
  const t = form.querySelector("textarea");
  const post = game.publish({ text: t.value, replyTo: form.dataset.reply || null, quoteOf: form.dataset.quote || null });
  if (!post) return;
  t.value = "";
  const wasModal = !!form.closest("#modal-root");
  closeModal();
  if (form.dataset.reply || form.dataset.quote || wasModal) location.hash = `#/post/${post.id}`;
  render(true);
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act],[data-follow],[data-tick],[data-back],[data-close],[data-newpost],[data-reset],[data-ptab],[data-hometab],[data-search],[data-dismiss],[data-install],[data-go],a");
  if (!el) return;
  if (el.matches("a")) return; // liens normaux
  if (el.dataset.close !== undefined) {
    if (e.target === el) closeModal();
    return;
  }
  e.preventDefault();
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case "reply":
      location.hash = `#/post/${id}`;
      return setTimeout(() => document.querySelector(`[data-key="reply-${id}"]`)?.focus(), 80);
    case "quote":
      return openModal(composerHTML({ key: "quote", placeholder: "Ajouter un commentaire", quoteOf: id }) + `<div class="modal-quote">${quoteHTML(postById(id), false)}</div>`);
    case "like":
    case "repost":
      if (navigator.vibrate) navigator.vibrate(8);
      return game.toggle(id, el.dataset.act);
  }
  if (el.dataset.follow) return game.toggleFollow(el.dataset.follow);
  if (el.dataset.tick !== undefined) return game.tick().catch(() => {});
  if (el.dataset.back !== undefined) return history.length > 1 ? history.back() : (location.hash = "#/home");
  if (el.dataset.newpost !== undefined) return openModal(composerHTML({ key: "modal" }));
  if (el.dataset.dismiss !== undefined) return game.dismissError();
  if (el.dataset.install !== undefined) return installPrompt?.prompt();
  if (el.dataset.reset !== undefined) {
    if (!confirm("Supprimer définitivement ce monde ?")) return;
    location.hash = "";
    return game.resetWorld();
  }
  if (el.dataset.ptab) return (profileTab = el.dataset.ptab), render(true);
  if (el.dataset.hometab) return (homeTab = el.dataset.hometab), render(true);
  if (el.dataset.search) {
    exploreQuery = el.dataset.search;
    if (route() === "explore") return render(true);
    location.hash = "#/explore";
    return;
  }
  if (el.dataset.go) location.hash = el.dataset.go;
});

document.addEventListener("submit", (e) => {
  const form = e.target;
  if (form.matches("[data-compose]")) {
    e.preventDefault();
    return submitPost(form);
  }
  if (form.id === "dm-form") {
    e.preventDefault();
    const input = form.querySelector("input");
    const text = input.value;
    input.value = "";
    game.sendDM(form.dataset.id, text);
    render(true);
    document.querySelector("#dm-form input")?.focus({ preventScroll: true });
  }
  if (form.id === "search-form") {
    e.preventDefault();
    exploreQuery = document.getElementById("explore-q").value.trim();
    document.activeElement?.blur();
    render(true);
  }
  if (form.id === "settings-form") {
    e.preventDefault();
    const f = new FormData(form);
    setConfig({ apiKey: String(f.get("apiKey") || "").trim(), model: String(f.get("model") || "").trim() || DEFAULT_MODEL, tickSeconds: Math.max(20, Number(f.get("tickSeconds")) || 90) });
    game.updateSettings({ universe: f.get("universe"), mature: f.get("mature") === "on", autoTick: f.get("autoTick") === "on", user: { name: f.get("name"), bio: f.get("bio"), emoji: f.get("emoji") } });
    game.dismissError();
    toast("Enregistré");
    render(true);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.matches("[data-compose] textarea")) updateCounts();
  if (e.target.id === "explore-q" && !e.target.value) {
    exploreQuery = "";
    render(true);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("[data-compose] textarea") && e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitPost(e.target.closest("form"));
  if (e.key === "Escape") closeModal();
});

window.addEventListener("hashchange", () => {
  closeModal();
  if (route() === "notifications" && W() && unreadCount()) {
    render(true);
    window.scrollTo(0, 0);
    setTimeout(() => game.readNotifications(), 1500);
    return;
  }
  render(true);
  window.scrollTo(0, 0);
});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (route() === "settings" || !W()) render(true);
});

// Rafraîchir les horodatages relatifs
setInterval(() => {
  if (W() && !document.activeElement?.dataset?.key && !$modal.innerHTML && route() !== "settings") render();
}, 60000);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render(true);
