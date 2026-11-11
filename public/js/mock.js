// Mode démo : contenu factice quand aucune clé API n'est configurée.
// Sert à tester l'interface sans dépenser de tokens.
import { ME } from "./engine.js";

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sample = (a, n) => [...a].sort(() => Math.random() - 0.5).slice(0, n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const CAST = [
  ["Lola Vex", "lolavex", "Influenceuse lifestyle. Collabs en DM 💅", "💅", 812000, true],
  ["Le Corbeau", "lecorbeau_off", "Je sais tout. Je dis presque tout.", "🐦‍⬛", 230000, false],
  ["Maxime Duroc", "maxduroc", "Journaliste. Les faits, rien que les faits.", "📰", 95000, true],
  ["Nina Blaze", "ninablaze", "Chanteuse. Nouvel album bientôt 🔥", "🎤", 1400000, true],
  ["Kevin du 93", "kev93_", "jsuis là pour rigoler", "🧢", 4200, false],
  ["Dr. Aurore", "dr_aurore", "Coach de vie. Tu mérites mieux.", "🔮", 61000, false],
  ["Tom Ferrand", "tomferrand", "Ex de quelqu'un ici. Pas de commentaire.", "🖤", 18000, false],
  ["Gossip Hebdo", "gossiphebdo", "Vos ragots préférés, chaque jour.", "🍵", 540000, true],
];
const LINES = [
  "Certaines personnes devraient vraiment apprendre à se taire 🙄",
  "Thread sur ce qui s'est VRAIMENT passé hier soir 🧵👇",
  "J'ai rien dit. Mais j'en pense pas moins.",
  "Le niveau de ce réseau aujourd'hui… on touche le fond",
  "Exclu : deux comptes très connus ne se parlent plus. Devinez qui 👀",
  "Vous êtes pas prêts pour ce qui arrive vendredi",
  "Je supporte plus les gens qui font semblant d'être gentils en public",
  "Petit café, grosse journée, zéro patience ☕",
];
const REPLIES = ["mdrrr", "t'as pas tort 😭", "qui t'a demandé ?", "ENFIN quelqu'un qui le dit", "on en parle de ta dernière story ?", "bloqué.", "👀👀👀", "source ?"];

export async function generateWorld() {
  await wait(600);
  const personas = CAST.map(([name, handle, bio, emoji, followers, verified]) => ({
    name, handle, bio, emoji, followers, verified,
    personality: "Personnage de démo",
    secret: "Secret de démo",
  }));
  const posts = [];
  for (let i = 0; i < 14; i++) {
    const reply = i > 2 && Math.random() < 0.35;
    posts.push({
      author_handle: pick(CAST)[1],
      text: reply ? pick(REPLIES) : pick(LINES),
      reply_to: reply ? `new:${Math.floor(Math.random() * i)}` : "",
      quote_of: "",
    });
  }
  return {
    personas,
    storylines: ["Lola et Nina ne se suivent plus", "Le Corbeau menace de révéler un secret", "(mode démo — ajoute une clé API pour la vraie IA)"],
    actions: { posts, likes: [], reposts: [], follows_user: [], storylines: [], trends: demoTrends() },
  };
}

function demoTrends() {
  return sample(["#Drama", "#LolaVsNina", "#LeCorbeauParle", "Vendredi", "#ModeDémo", "Tom Ferrand", "#Exclu"], 6).map((tag) => ({
    tag,
    label: `${(Math.random() * 50 + 1).toFixed(1).replace(".", ",")} k posts`,
  }));
}

export async function tick(world) {
  await wait(500);
  const recent = world.posts.slice(-15);
  const posts = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => {
    const reply = recent.length && Math.random() < 0.4;
    return { author_handle: pick(world.personas).handle, text: reply ? pick(REPLIES) : pick(LINES), reply_to: reply ? pick(recent).id : "", quote_of: "" };
  });
  const likes = sample(recent, 4).map((p) => ({ handle: pick(world.personas).handle, post_id: p.id }));
  return { posts, likes, reposts: [], follows_user: [], storylines: [], trends: Math.random() < 0.3 ? demoTrends() : [] };
}

export async function reactToUserPost(world, post) {
  await wait(800);
  const who = sample(world.personas, 2 + Math.floor(Math.random() * 3));
  return {
    posts: who.map((p) => ({ author_handle: p.handle, text: pick(REPLIES), reply_to: post.id, quote_of: "" })),
    likes: sample(world.personas, 4).map((p) => ({ handle: p.handle, post_id: post.id })),
    reposts: Math.random() < 0.4 ? [{ handle: pick(world.personas).handle, post_id: post.id }] : [],
    follows_user: Math.random() < 0.4 ? [pick(world.personas.filter((p) => !p.followsUser) || world.personas)?.handle].filter(Boolean) : [],
    storylines: [],
    trends: [],
  };
}

export async function replyToDM(world, persona, history) {
  await wait(500);
  const last = history.filter((m) => m.from === ME).at(-1)?.text || "";
  return [pick(["ah ouais ?", "jsp quoi te dire", "entre nous…", "tu veux vraiment savoir ? 👀"]), `(démo) tu as dit : « ${last.slice(0, 60)} »`];
}
