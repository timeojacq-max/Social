// Logique de partie côté navigateur : file d'attente IA, actions du joueur, fil automatique.
import { getWorld, setWorld, saveWorld, newId, getConfig } from "./store.js";
import { buildWorld, applyActions, cleanHandle, ME } from "./engine.js";
import * as ai from "./ai.js";

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

export const state = { busy: 0, error: null };
let queue = Promise.resolve();
let lastTick = Date.now();

function enqueue(job) {
  state.busy += 1;
  emit();
  const run = queue.then(async () => {
    try {
      const r = await job();
      state.error = null;
      return r;
    } catch (err) {
      console.error(err);
      state.error = err instanceof ai.AIError ? err.message : "Erreur inattendue : " + err.message;
      throw err;
    } finally {
      state.busy -= 1;
      emit();
    }
  });
  queue = run.catch(() => {});
  return run;
}

export function dismissError() {
  state.error = null;
  emit();
}

// ---------- Monde ----------
export async function createWorld({ user, settings }) {
  const input = {
    user: { name: String(user.name).slice(0, 50), handle: cleanHandle(user.handle), bio: String(user.bio || "").slice(0, 200), emoji: user.emoji || "🙂" },
    settings: {
      universe: String(settings.universe || "Le monde réel contemporain, version très dramatique.").slice(0, 3000),
      language: settings.language || "français",
      mature: !!settings.mature,
      autoTick: settings.autoTick !== false,
      personaCount: Math.min(30, Math.max(5, Number(settings.personaCount) || 14)),
    },
  };
  await enqueue(async () => {
    const gen = await ai.generateWorld(input);
    setWorld(buildWorld(input, gen));
    lastTick = Date.now();
  });
}

export function resetWorld() {
  setWorld(null);
  emit();
}

export function tick() {
  return enqueue(async () => {
    const world = getWorld();
    if (!world) return;
    const actions = await ai.tick(world);
    applyActions(world, actions);
    world.stats.ticks += 1;
    lastTick = Date.now();
    saveWorld();
  });
}

// ---------- Actions du joueur ----------
export function publish({ text, replyTo, quoteOf }) {
  const world = getWorld();
  text = String(text || "").trim().slice(0, 600);
  if (!world || !text) return null;
  const exists = (id) => id && world.posts.some((p) => p.id === id);
  const post = {
    id: newId("p"),
    authorId: ME,
    text,
    createdAt: Date.now(),
    replyTo: exists(replyTo) ? replyTo : null,
    quoteOf: exists(quoteOf) ? quoteOf : null,
    likedBy: [],
    repostedBy: [],
    likes: 0,
    reposts: 0,
    views: 0,
  };
  world.posts.push(post);
  saveWorld();
  emit();
  enqueue(async () => {
    const w = getWorld();
    if (!w) return;
    const actions = await ai.reactToUserPost(w, post);
    applyActions(w, actions);
    const live = w.posts.find((p) => p.id === post.id);
    if (live) live.views += Math.round(20 + Math.random() * 40 * (live.likes + live.reposts * 3 + 1));
    saveWorld();
  }).catch(() => {});
  return post;
}

export function toggle(postId, action) {
  const post = getWorld()?.posts.find((p) => p.id === postId);
  if (!post) return;
  const [list, count] = action === "like" ? ["likedBy", "likes"] : ["repostedBy", "reposts"];
  const i = post[list].indexOf(ME);
  if (i >= 0) {
    post[list].splice(i, 1);
    post[count] -= 1;
  } else {
    post[list].push(ME);
    post[count] += 1;
  }
  saveWorld();
  emit();
}

export function toggleFollow(personaId) {
  const world = getWorld();
  const persona = world?.personas.find((p) => p.id === personaId);
  if (!persona) return;
  const i = world.userFollows.indexOf(persona.id);
  if (i >= 0) {
    world.userFollows.splice(i, 1);
    persona.followers -= 1;
  } else {
    world.userFollows.push(persona.id);
    persona.followers += 1;
  }
  saveWorld();
  emit();
}

export function sendDM(personaId, text) {
  const world = getWorld();
  const persona = world?.personas.find((p) => p.id === personaId);
  text = String(text || "").trim().slice(0, 1000);
  if (!persona || !text) return;
  world.dms[persona.id] ||= [];
  world.dms[persona.id].push({ from: ME, text, createdAt: Date.now() });
  saveWorld();
  enqueue(async () => {
    const replies = await ai.replyToDM(world, persona);
    for (const r of replies) world.dms[persona.id].push({ from: persona.id, text: String(r), createdAt: Date.now() });
    saveWorld();
  }).catch(() => {});
}

export function readNotifications() {
  const world = getWorld();
  if (!world) return;
  world.notifications.forEach((n) => (n.read = true));
  saveWorld();
  emit();
}

export function updateSettings(s) {
  const world = getWorld();
  if (!world) return;
  if (typeof s.mature === "boolean") world.settings.mature = s.mature;
  if (typeof s.autoTick === "boolean") world.settings.autoTick = s.autoTick;
  if (typeof s.universe === "string" && s.universe.trim()) world.settings.universe = s.universe.slice(0, 3000);
  if (s.user) {
    if (s.user.name) world.user.name = String(s.user.name).slice(0, 50);
    if (typeof s.user.bio === "string") world.user.bio = s.user.bio.slice(0, 200);
    if (s.user.emoji) world.user.emoji = s.user.emoji;
  }
  saveWorld();
  emit();
}

// ---------- Fil automatique (seulement quand l'appli est à l'écran) ----------
setInterval(() => {
  const world = getWorld();
  if (!world?.settings.autoTick || state.busy) return;
  if (document.visibilityState !== "visible") return;
  // Après une erreur (quota, saturation…), on espace les tentatives
  const wait = (Number(getConfig().tickSeconds) || 90) * 1000 * (state.error ? 4 : 1);
  if (Date.now() - lastTick < wait) return;
  lastTick = Date.now();
  tick().catch(() => {});
}, 5000);
