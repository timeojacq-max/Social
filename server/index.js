import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld, getWorld, setWorld, saveWorld, newId } from "./store.js";
import { buildWorld, applyActions, cleanHandle, ME } from "./engine.js";
import * as ai from "./ai.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const TICK_SECONDS = Number(process.env.TICK_SECONDS || 90);

loadWorld();
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(here, "..", "public")));

// ---------- File d'attente IA : une seule génération à la fois ----------
let queue = Promise.resolve();
let busy = 0;
let lastError = null;
let lastSeen = 0; // dernier poll du client, pour ne pas brûler des tokens onglet fermé
let lastTick = Date.now();

function enqueue(label, job) {
  busy += 1;
  const run = queue.then(async () => {
    try {
      const r = await job();
      lastError = null;
      return r;
    } catch (err) {
      console.error(`[${label}]`, err);
      lastError = err instanceof ai.AIError ? err.message : `Erreur interne (${label})`;
      throw err;
    } finally {
      busy -= 1;
    }
  });
  queue = run.catch(() => {});
  return run;
}

const requireWorld = (req, res, next) => (getWorld() ? next() : res.status(409).json({ error: "Aucun monde. Crée ton compte d'abord." }));
const sendError = (res, err) => res.status(500).json({ error: err instanceof ai.AIError ? err.message : "Erreur interne" });

// ---------- Routes ----------

app.get("/api/state", (req, res) => {
  lastSeen = Date.now();
  res.json({ world: getWorld(), busy: busy > 0, error: lastError, demo: ai.demoMode, model: ai.demoMode ? null : ai.MODEL });
});

app.post("/api/world", async (req, res) => {
  const { user = {}, settings = {} } = req.body || {};
  if (!user.name || !user.handle) return res.status(400).json({ error: "Nom et pseudo requis." });
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
  try {
    await enqueue("world", async () => {
      const gen = await ai.generateWorld(input);
      setWorld(buildWorld(input, gen));
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.delete("/api/world", (req, res) => {
  setWorld(null);
  res.json({ ok: true });
});

async function runTick() {
  return enqueue("tick", async () => {
    const world = getWorld();
    if (!world) return;
    const actions = await ai.tick(world);
    applyActions(world, actions);
    world.stats.ticks += 1;
    lastTick = Date.now();
    saveWorld();
  });
}

app.post("/api/tick", requireWorld, async (req, res) => {
  try {
    await runTick();
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/posts", requireWorld, (req, res) => {
  const world = getWorld();
  const text = String(req.body?.text || "").trim().slice(0, 600);
  if (!text) return res.status(400).json({ error: "Post vide." });
  const exists = (id) => id && world.posts.some((p) => p.id === id);
  const post = {
    id: newId("p"),
    authorId: ME,
    text,
    createdAt: Date.now(),
    replyTo: exists(req.body.replyTo) ? req.body.replyTo : null,
    quoteOf: exists(req.body.quoteOf) ? req.body.quoteOf : null,
    likedBy: [],
    repostedBy: [],
    likes: 0,
    reposts: 0,
    views: 0,
  };
  world.posts.push(post);
  saveWorld();
  res.json({ post });

  // Les IA réagissent en arrière-plan ; le client récupère via /api/state.
  enqueue("react", async () => {
    const w = getWorld();
    if (!w) return;
    const actions = await ai.reactToUserPost(w, post);
    applyActions(w, actions);
    const live = w.posts.find((p) => p.id === post.id);
    if (live) live.views += Math.round(20 + Math.random() * 40 * (live.likes + live.reposts * 3 + 1));
    saveWorld();
  }).catch(() => {});
});

app.post("/api/posts/:id/:action", requireWorld, (req, res) => {
  const world = getWorld();
  const post = world.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "Post introuvable." });
  const map = { like: ["likedBy", "likes"], repost: ["repostedBy", "reposts"] };
  const conf = map[req.params.action];
  if (!conf) return res.status(400).json({ error: "Action inconnue." });
  const [list, count] = conf;
  const i = post[list].indexOf(ME);
  if (i >= 0) {
    post[list].splice(i, 1);
    post[count] -= 1;
  } else {
    post[list].push(ME);
    post[count] += 1;
  }
  saveWorld();
  res.json({ post });
});

app.post("/api/follow/:id", requireWorld, (req, res) => {
  const world = getWorld();
  const persona = world.personas.find((p) => p.id === req.params.id);
  if (!persona) return res.status(404).json({ error: "Compte introuvable." });
  const i = world.userFollows.indexOf(persona.id);
  if (i >= 0) {
    world.userFollows.splice(i, 1);
    persona.followers -= 1;
  } else {
    world.userFollows.push(persona.id);
    persona.followers += 1;
  }
  saveWorld();
  res.json({ following: i < 0 });
});

app.post("/api/dms/:id", requireWorld, async (req, res) => {
  const world = getWorld();
  const persona = world.personas.find((p) => p.id === req.params.id);
  const text = String(req.body?.text || "").trim().slice(0, 1000);
  if (!persona) return res.status(404).json({ error: "Compte introuvable." });
  if (!text) return res.status(400).json({ error: "Message vide." });
  world.dms[persona.id] ||= [];
  world.dms[persona.id].push({ from: ME, text, createdAt: Date.now() });
  saveWorld();
  try {
    await enqueue("dm", async () => {
      const replies = await ai.replyToDM(world, persona);
      for (const r of replies) world.dms[persona.id].push({ from: persona.id, text: String(r), createdAt: Date.now() });
      saveWorld();
    });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/notifications/read", requireWorld, (req, res) => {
  getWorld().notifications.forEach((n) => (n.read = true));
  saveWorld();
  res.json({ ok: true });
});

app.post("/api/settings", requireWorld, (req, res) => {
  const world = getWorld();
  const s = req.body || {};
  if (typeof s.mature === "boolean") world.settings.mature = s.mature;
  if (typeof s.autoTick === "boolean") world.settings.autoTick = s.autoTick;
  if (typeof s.universe === "string" && s.universe.trim()) world.settings.universe = s.universe.slice(0, 3000);
  if (s.user) {
    if (s.user.name) world.user.name = String(s.user.name).slice(0, 50);
    if (typeof s.user.bio === "string") world.user.bio = s.user.bio.slice(0, 200);
    if (s.user.emoji) world.user.emoji = s.user.emoji;
  }
  saveWorld();
  res.json({ ok: true });
});

// SPA : toute autre route renvoie l'interface
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(here, "..", "public", "index.html")));

// ---------- Fil automatique ----------
setInterval(() => {
  const world = getWorld();
  if (!world?.settings.autoTick || busy) return;
  if (Date.now() - lastSeen > 30_000) return; // personne ne regarde
  if (Date.now() - lastTick < TICK_SECONDS * 1000) return;
  runTick().catch(() => {});
}, 5000);

app.listen(PORT, () => {
  console.log(`\n  Écho tourne sur http://localhost:${PORT}`);
  console.log(ai.demoMode ? "  ⚠️  Mode démo (pas de ANTHROPIC_API_KEY) : contenu factice.\n" : `  Modèle : ${ai.MODEL}\n`);
});
