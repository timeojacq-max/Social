// Tout ce qui parle à Claude : création du monde, vie du fil, réactions, DM.
// Sans ANTHROPIC_API_KEY, on bascule sur un "mode démo" qui génère du contenu factice.
import Anthropic from "@anthropic-ai/sdk";
import { rosterText, timelineText, threadText, userText, ME } from "./engine.js";
import * as mock from "./mock.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const EFFORT = process.env.CLAUDE_EFFORT || "low";
const EFFORT_WORLD = process.env.CLAUDE_EFFORT_WORLD || "medium";

export const demoMode = !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;
const client = demoMode ? null : new Anthropic();

// ---------- Schémas de sortie (structured outputs) ----------

const str = { type: "string" };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items) => ({ type: "array", items });

const ACTIONS_PROPS = {
  posts: arr(
    obj({
      author_handle: { ...str, description: "Handle du compte IA qui poste (sans @)" },
      text: { ...str, description: "Contenu du post, 280 caractères max idéalement" },
      reply_to: { ...str, description: "Id du post auquel on répond (ex: p1a2), 'new:N' pour le N-ième post de ce lot, ou chaîne vide" },
      quote_of: { ...str, description: "Id du post cité (quote), 'new:N', ou chaîne vide" },
    }),
  ),
  likes: arr(obj({ handle: str, post_id: str })),
  reposts: arr(obj({ handle: str, post_id: str })),
  follows_user: { ...arr(str), description: "Handles des comptes IA qui décident de s'abonner à l'humain maintenant" },
  storylines: { ...arr(str), description: "Liste COMPLÈTE et à jour des intrigues en cours (3 à 8), ou liste vide pour ne rien changer" },
  trends: {
    ...arr(obj({ tag: str, label: { ...str, description: "ex: '12,4 k posts' ou 'Tendance dans Divertissement'" } })),
    description: "Tendances du moment (5 à 7), ou liste vide pour ne rien changer",
  },
};
const ACTIONS_SCHEMA = obj(ACTIONS_PROPS);

const WORLD_SCHEMA = obj({
  personas: arr(
    obj({
      name: str,
      handle: str,
      bio: { ...str, description: "Bio publique du profil" },
      personality: { ...str, description: "Personnalité, ton, tics d'écriture, obsessions, relations avec les autres comptes" },
      secret: { ...str, description: "Secret, ambition cachée ou casserole qui peut nourrir des drames" },
      emoji: { ...str, description: "Un seul emoji servant d'avatar" },
      followers: { type: "integer" },
      verified: { type: "boolean" },
    }),
  ),
  storylines: arr(str),
  actions: ACTIONS_SCHEMA,
});

const DM_SCHEMA = obj({ messages: { ...arr(str), description: "1 à 3 messages courts envoyés à la suite" } });

// ---------- Prompts ----------

function rules(settings) {
  const lang = settings.language || "français";
  const mature = settings.mature
    ? `CLASSIFICATION : 18+. Le joueur est un adulte qui a choisi le mode mature. C'est une fiction interactive : les personnages peuvent jurer, insulter, flirter lourdement, faire de l'humour noir ou vulgaire, se clasher violemment, balancer des rumeurs, parler de sexe, d'alcool, de drogue, de scandales, comme sur un vrai réseau social sans modération. Pas de retenue artificielle ni de morale plaquée : les personnages ont des opinions tranchées, de la mauvaise foi, des egos. Limites absolues : aucun contenu sexuel impliquant des mineurs, pas de contenu sexuel explicite détaillé (suggestif oui), et ne jamais cibler des personnes réelles privées.`
    : `CLASSIFICATION : tout public. Drama, piques et rumeurs oui, mais sans vulgarité crue ni contenu sexuel.`;
  return `Tu es le moteur d'un jeu : un réseau social façon X/Twitter où UN SEUL utilisateur est humain (le joueur). Tous les autres comptes sont des personnages que tu incarnes.

UNIVERS : ${settings.universe}

${mature}

RÈGLES D'ÉCRITURE
- Écris tous les posts en ${lang}, dans le style d'un vrai réseau social : court, punchy, argot, fautes volontaires si le perso est comme ça, emojis selon le perso, hashtags avec parcimonie.
- Chaque personnage a une voix reconnaissable et cohérente avec sa fiche. Ils ont de la mémoire : ils se souviennent des embrouilles, alliances et ragots passés visibles dans le fil.
- Fais vivre le monde : clashs, sous-tweets, alliances, révélations, rumeurs, mèmes, actualité de l'univers, vie quotidienne, coups de gueule, threads.
- Le joueur est un nouveau venu. Les personnages réagissent à lui de façon variée : curiosité, drague, méfiance, moquerie, admiration, récupération… L'attention qu'il reçoit dépend de ce qu'il poste (un post fade = peu de réactions ; un post provocant ou drôle = beaucoup).
- Ne fais jamais parler le joueur. N'invente pas de posts à son nom.
- Les ids de posts existants sont entre crochets, ex: [p1k2]. Utilise-les exactement pour reply_to, quote_of, likes, reposts. Pour viser un post créé dans le même lot, utilise "new:N" (N = index 0-based dans la liste posts).
- N'utilise que les handles de la liste des personnages.`;
}

function systemBlocks(world) {
  return [
    {
      type: "text",
      text: `${rules(world.settings)}\n\nPERSONNAGES\n${rosterText(world)}`,
      cache_control: { type: "ephemeral" },
    },
  ];
}

function stateBlock(world, extraIds = []) {
  return `INTRIGUES EN COURS\n${world.storylines.map((s) => "- " + s).join("\n") || "(aucune)"}

LE JOUEUR (humain)
${userText(world)}

FIL RÉCENT (du plus ancien au plus récent)
${timelineText(world, 45, extraIds)}`;
}

// ---------- Appel Claude ----------

class AIError extends Error {}

async function callJSON({ system, prompt, schema, effort = EFFORT, maxTokens = 16000 }) {
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort, format: { type: "json_schema", schema } },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AIError("Clé API Anthropic invalide.");
    if (err instanceof Anthropic.RateLimitError) throw new AIError("Limite de requêtes atteinte, réessaie dans un instant.");
    if (err instanceof Anthropic.APIError) throw new AIError(`Erreur API (${err.status}) : ${err.message}`);
    throw err;
  }
  if (response.stop_reason === "refusal") {
    throw new AIError("Le modèle a refusé de générer ce contenu. Essaie de reformuler ou d'ajuster l'univers.");
  }
  if (response.stop_reason === "max_tokens") throw new AIError("Réponse tronquée (max_tokens atteint).");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new AIError("Réponse illisible du modèle.");
  }
}

// ---------- API du moteur ----------

export async function generateWorld({ user, settings }) {
  if (demoMode) return mock.generateWorld({ user, settings });
  const prompt = `Crée le casting de ce réseau social.

Le joueur s'appelle ${user.name} (@${user.handle}). Bio : ${user.bio || "(vide)"}.

Génère :
1. "personas" : ${settings.personaCount || 14} personnages variés et hauts en couleur (influenceurs, trolls, journalistes, stars, anonymes, ex toxiques, gourous, comptes de ragots, politiciens de l'univers, etc. adaptés à l'univers). Des relations déjà tendues ou complices entre eux. Followers réalistes et très inégaux.
2. "storylines" : 4 à 6 intrigues/drames déjà en cours au lancement.
3. "actions" : l'état initial du fil : environ 22 posts (dont des réponses et citations entre persos pour montrer les embrouilles en cours), quelques likes/reposts entre eux, follows_user vide, et 6 tendances. Personne ne connaît encore le joueur, sauf éventuellement 1 ou 2 posts du type "c'est qui le/la nouveau·elle ?".
Pour le fil initial, les handles des auteurs doivent correspondre aux personas que tu viens de créer, et reply_to/quote_of ne peuvent utiliser que "new:N".`;
  return callJSON({ system: rules(settings), prompt, schema: WORLD_SCHEMA, effort: EFFORT_WORLD });
}

export async function tick(world) {
  if (demoMode) return mock.tick(world);
  const prompt = `${stateBlock(world)}

TÂCHE : un peu de temps s'est écoulé. Fais vivre le réseau. Génère 5 à 9 nouveaux posts (mélange de posts originaux, réponses à des posts récents, citations), qui font avancer les intrigues ou en démarrent de nouvelles. Ajoute quelques likes/reposts réalistes (y compris éventuellement sur les posts du joueur s'ils le méritent). follows_user : seulement si c'est cohérent. Mets à jour storylines et trends si ça a évolué.`;
  return callJSON({ system: systemBlocks(world), prompt, schema: ACTIONS_SCHEMA });
}

export async function reactToUserPost(world, post) {
  if (demoMode) return mock.reactToUserPost(world, post);
  const ctx = post.replyTo ? `\n\nFIL DE DISCUSSION CONCERNÉ\n${threadText(world, post.id)}` : "";
  const prompt = `${stateBlock(world, [post.replyTo, post.quoteOf].filter(Boolean))}${ctx}

TÂCHE : le joueur vient de publier [${post.id}] : "${post.text}"${post.replyTo ? ` (en réponse à ${post.replyTo})` : ""}${post.quoteOf ? ` (en citant ${post.quoteOf})` : ""}.
Génère les réactions des personnages dans les minutes qui suivent :
- Réponses (reply_to: "${post.id}" ou en réponse à d'autres réponses via "new:N" pour créer des sous-discussions), citations moqueuses ou élogieuses, éventuellement des sous-tweets sans le nommer.
- Si le joueur répond à un personnage, ce personnage répond quasi toujours.
- Si le joueur mentionne un @handle, ce personnage réagit.
- Likes et reposts cohérents avec le contenu (un post qui fait le buzz attire beaucoup de monde ; un post banal 0 à 3 réactions).
- follows_user si quelqu'un est intrigué/séduit.
storylines/trends : mets à jour seulement si le post du joueur change la donne, sinon listes vides.`;
  return callJSON({ system: systemBlocks(world), prompt, schema: ACTIONS_SCHEMA });
}

export async function replyToDM(world, persona) {
  const history = world.dms[persona.id] || [];
  if (demoMode) return mock.replyToDM(world, persona, history);
  const convo = history
    .slice(-30)
    .map((m) => `${m.from === ME ? "@" + world.user.handle + " (humain)" : "@" + persona.handle}: ${m.text}`)
    .join("\n");
  const prompt = `${stateBlock(world)}

MESSAGES PRIVÉS entre @${persona.handle} et le joueur @${world.user.handle} :
${convo}

TÂCHE : tu es @${persona.handle} (${persona.name}). Réponds au dernier message du joueur en DM, en restant parfaitement dans ton personnage (en privé, les persos sont souvent plus francs : confidences, ragots sur les autres, drague, menaces, propositions d'alliance…). 1 à 3 messages courts.`;
  const out = await callJSON({ system: systemBlocks(world), prompt, schema: DM_SCHEMA });
  return out.messages;
}

export { AIError, MODEL };
