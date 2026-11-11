// Logique du jeu : construire le monde, appliquer les actions décidées par l'IA,
// et résumer l'état du monde pour le prompt.
import { newId } from "./store.js";

const COLORS = ["#e0245e", "#f45d22", "#ffad1f", "#17bf63", "#1da1f2", "#794bc4", "#ff7aa8", "#00bfa5", "#8d6e63", "#5c6bc0", "#c0ca33", "#ec407a"];

export const ME = "me";

export function cleanHandle(h) {
  return String(h || "").replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 20) || "anon";
}

export function buildWorld({ user, settings }, gen) {
  const now = Date.now();
  const used = new Set([cleanHandle(user.handle).toLowerCase()]);
  const personas = gen.personas.map((p, i) => {
    let handle = cleanHandle(p.handle);
    while (used.has(handle.toLowerCase())) handle += "_";
    used.add(handle.toLowerCase());
    return {
      id: newId("u"),
      name: p.name,
      handle,
      bio: p.bio,
      personality: p.personality,
      secret: p.secret,
      emoji: p.emoji,
      color: COLORS[i % COLORS.length],
      followers: Math.max(0, Math.round(p.followers)),
      verified: !!p.verified,
      followsUser: false,
      createdAt: now,
    };
  });

  const world = {
    version: 1,
    createdAt: now,
    settings: { ...settings },
    user: {
      id: ME,
      name: user.name,
      handle: cleanHandle(user.handle),
      bio: user.bio || "",
      emoji: user.emoji || "🙂",
      color: "#1d9bf0",
      followers: 0,
    },
    personas,
    storylines: gen.storylines,
    trends: [],
    posts: [],
    notifications: [],
    dms: {},
    userFollows: [],
    stats: { ticks: 0 },
  };
  applyActions(world, gen.actions, { spreadMinutes: 180 });
  return world;
}

export function personaByHandle(world, handle) {
  const h = cleanHandle(handle).toLowerCase();
  if (h === world.user.handle.toLowerCase()) return null;
  return world.personas.find((p) => p.handle.toLowerCase() === h) || null;
}

export function authorOf(world, id) {
  if (id === ME) return world.user;
  return world.personas.find((p) => p.id === id) || null;
}

function notify(world, n) {
  world.notifications.unshift({ id: newId("n"), createdAt: Date.now(), read: false, ...n });
  world.notifications = world.notifications.slice(0, 300);
}

/**
 * Applique un lot d'actions générées par l'IA au monde.
 * actions = { posts, likes, reposts, follows_user, storylines, trends }
 */
export function applyActions(world, actions, { spreadMinutes = 0 } = {}) {
  const now = Date.now();
  const created = [];
  const resolveRef = (ref) => {
    if (!ref) return null;
    const m = /^new:(\d+)$/.exec(ref);
    if (m) return created[Number(m[1])]?.id || null;
    return world.posts.some((p) => p.id === ref) ? ref : null;
  };

  const posts = actions.posts || [];
  posts.forEach((a, i) => {
    const persona = personaByHandle(world, a.author_handle);
    const text = String(a.text || "").trim();
    if (!persona || !text) {
      created.push(null);
      return;
    }
    const offset = spreadMinutes ? Math.round(((posts.length - i) / posts.length) * spreadMinutes * 60000 * Math.random()) : (posts.length - i) * 1500;
    const post = {
      id: newId("p"),
      authorId: persona.id,
      text: text.slice(0, 600),
      createdAt: now - offset,
      replyTo: resolveRef(a.reply_to),
      quoteOf: resolveRef(a.quote_of),
      likedBy: [],
      repostedBy: [],
      likes: Math.round(Math.random() * persona.followers * 0.01),
      reposts: 0,
      views: Math.round(persona.followers * (0.2 + Math.random())),
    };
    world.posts.push(post);
    created.push(post);

    const target = post.replyTo && world.posts.find((p) => p.id === post.replyTo);
    if (target?.authorId === ME) notify(world, { type: "reply", actorId: persona.id, postId: post.id });
    const quoted = post.quoteOf && world.posts.find((p) => p.id === post.quoteOf);
    if (quoted?.authorId === ME) notify(world, { type: "quote", actorId: persona.id, postId: post.id });
    if (new RegExp(`@${world.user.handle}\\b`, "i").test(text) && target?.authorId !== ME && quoted?.authorId !== ME) {
      notify(world, { type: "mention", actorId: persona.id, postId: post.id });
    }
  });

  for (const kind of ["likes", "reposts"]) {
    for (const a of actions[kind] || []) {
      const persona = personaByHandle(world, a.handle);
      const postId = resolveRef(a.post_id);
      const post = postId && world.posts.find((p) => p.id === postId);
      if (!persona || !post || post.authorId === persona.id) continue;
      const list = kind === "likes" ? post.likedBy : post.repostedBy;
      if (list.includes(persona.id)) continue;
      list.push(persona.id);
      post[kind] += 1;
      if (post.authorId === ME) notify(world, { type: kind === "likes" ? "like" : "repost", actorId: persona.id, postId: post.id });
    }
  }

  for (const h of actions.follows_user || []) {
    const persona = personaByHandle(world, h);
    if (!persona || persona.followsUser) continue;
    persona.followsUser = true;
    world.user.followers += 1;
    notify(world, { type: "follow", actorId: persona.id });
  }

  if (actions.storylines?.length) world.storylines = actions.storylines.slice(0, 12);
  if (actions.trends?.length) world.trends = actions.trends.slice(0, 8);

  world.posts.sort((a, b) => a.createdAt - b.createdAt);
  if (world.posts.length > 2000) world.posts = world.posts.slice(-2000);
  return created.filter(Boolean);
}

// ---------- Résumés pour les prompts ----------

export function rosterText(world) {
  return world.personas
    .map(
      (p) =>
        `- @${p.handle} — ${p.name}${p.verified ? " (certifié)" : ""}, ${p.followers} abonnés\n  Bio : ${p.bio}\n  Personnalité / style : ${p.personality}\n  Secret / enjeu caché : ${p.secret}`,
    )
    .join("\n");
}

function postLine(world, p) {
  const a = authorOf(world, p.authorId);
  const handle = a ? a.handle : "?";
  const parts = [`[${p.id}] @${handle}`];
  if (p.replyTo) parts.push(`(répond à ${p.replyTo})`);
  if (p.quoteOf) parts.push(`(cite ${p.quoteOf})`);
  return `${parts.join(" ")} : ${p.text.replace(/\n+/g, " ")}  ♥${p.likes} ⟳${p.reposts}`;
}

export function timelineText(world, n = 45, extraIds = []) {
  const recent = world.posts.slice(-n);
  const ids = new Set(recent.map((p) => p.id));
  const extra = world.posts.filter((p) => extraIds.includes(p.id) && !ids.has(p.id));
  return [...extra, ...recent].map((p) => postLine(world, p)).join("\n") || "(aucun post pour l'instant)";
}

export function threadText(world, postId) {
  const chain = [];
  let cur = world.posts.find((p) => p.id === postId);
  while (cur && chain.length < 12) {
    chain.unshift(cur);
    cur = cur.replyTo ? world.posts.find((p) => p.id === cur.replyTo) : null;
  }
  const replies = world.posts.filter((p) => p.replyTo === postId);
  return [...chain, ...replies].map((p) => postLine(world, p)).join("\n");
}

export function userText(world) {
  const u = world.user;
  const mine = world.posts.filter((p) => p.authorId === ME).slice(-8);
  const followed = world.userFollows.map((id) => authorOf(world, id)?.handle).filter(Boolean);
  return [
    `Nom : ${u.name} (@${u.handle}) — ${u.followers} abonnés`,
    `Bio : ${u.bio || "(vide)"}`,
    `Comptes suivis par l'humain : ${followed.length ? followed.map((h) => "@" + h).join(", ") : "aucun"}`,
    `Comptes IA qui suivent l'humain : ${world.personas.filter((p) => p.followsUser).map((p) => "@" + p.handle).join(", ") || "aucun"}`,
    `Derniers posts de l'humain :\n${mine.map((p) => postLine(world, p)).join("\n") || "(aucun)"}`,
  ].join("\n");
}
