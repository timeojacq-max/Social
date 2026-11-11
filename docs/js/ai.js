// Tout ce qui parle à l'IA (Google Gemini) : création du monde, vie du fil, réactions, DM.
// Les appels partent directement du navigateur ; sans clé API, on bascule en mode démo.
import { rosterText, timelineText, threadText, userText, ME } from "./engine.js";
import { getConfig, DEFAULT_MODEL } from "./store.js";
import * as mock from "./mock.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// Modèles essayés dans l'ordre si le précédent est saturé (503) ou limité (429)
const FALLBACK_MODELS = [DEFAULT_MODEL, "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
const TIMEOUT_MS = 90_000;

export const isDemo = () => !getConfig().apiKey;
export class AIError extends Error {}

// ---------- Schémas de sortie (JSON structuré) ----------
const str = { type: "string" };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items) => ({ type: "array", items });

const ACTIONS_SCHEMA = obj({
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
    ...arr(obj({ tag: str, label: { ...str, description: "ex: '12,4 k posts'" } })),
    description: "Tendances du moment (5 à 7), ou liste vide pour ne rien changer",
  },
});

const WORLD_SCHEMA = obj({
  personas: arr(
    obj({
      name: str,
      handle: { ...str, description: "Pseudo sans @, lettres/chiffres/underscore, 15 caractères max" },
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

const systemText = (world) => `${rules(world.settings)}\n\nPERSONNAGES\n${rosterText(world)}`;

function stateBlock(world, extraIds = []) {
  return `INTRIGUES EN COURS\n${world.storylines.map((s) => "- " + s).join("\n") || "(aucune)"}

LE JOUEUR (humain)
${userText(world)}

FIL RÉCENT (du plus ancien au plus récent)
${timelineText(world, 45, extraIds)}`;
}

// ---------- Appel Gemini ----------
const SAFETY_OFF = ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"].map(
  (category) => ({ category, threshold: "BLOCK_NONE" }),
);

async function request(model, body, apiKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    return { status: err.name === "AbortError" ? 504 : 0, data: { error: { message: err.message } } };
  } finally {
    clearTimeout(timer);
  }
}

async function callJSON({ system, prompt, schema, mature }) {
  const { apiKey, model } = getConfig();
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingLevel: "low" },
    },
    ...(mature ? { safetySettings: SAFETY_OFF } : {}),
  };
  const models = [...new Set([model || DEFAULT_MODEL, ...FALLBACK_MODELS])];
  let last;
  for (const m of models) {
    let r = await request(m, body, apiKey);
    if (r.status === 400 && /thinking/i.test(r.data?.error?.message || "")) {
      // Modèle qui ne connaît pas thinkingLevel : on réessaie sans
      const { thinkingConfig, ...gc } = body.generationConfig;
      r = await request(m, { ...body, generationConfig: gc }, apiKey);
    }
    last = r;
    if (r.status === 200) return parse(r.data);
    if ([401, 403].includes(r.status) || (r.status === 400 && /api key/i.test(r.data?.error?.message || ""))) {
      throw new AIError("Clé API Gemini invalide. Vérifie-la dans les paramètres.");
    }
    if (![429, 500, 503, 504, 404].includes(r.status)) break; // erreur non récupérable
  }
  if (last.status === 429) throw new AIError("Quota gratuit Gemini atteint pour le moment. Réessaie dans une minute.");
  if (last.status === 503 || last.status === 504) throw new AIError("Les serveurs Gemini sont saturés. Réessaie dans un instant.");
  if (last.status === 0) throw new AIError("Pas de connexion internet.");
  throw new AIError(`Erreur Gemini (${last.status}) : ${last.data?.error?.message || "inconnue"}`);
}

function parse(data) {
  if (data.promptFeedback?.blockReason) throw new AIError(`Gemini a bloqué la requête (${data.promptFeedback.blockReason}).`);
  const cand = data.candidates?.[0];
  if (!cand) throw new AIError("Réponse vide de Gemini.");
  if (["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(cand.finishReason)) {
    throw new AIError("Gemini a refusé de générer ce contenu. Essaie de reformuler ou d'ajuster l'univers.");
  }
  if (cand.finishReason === "MAX_TOKENS") throw new AIError("Réponse tronquée par Gemini, réessaie.");
  const text = (cand.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new AIError("Réponse illisible de Gemini, réessaie.");
  }
}

// ---------- API du moteur ----------
export async function generateWorld({ user, settings }) {
  if (isDemo()) return mock.generateWorld({ user, settings });
  const prompt = `Crée le casting de ce réseau social.

Le joueur s'appelle ${user.name} (@${user.handle}). Bio : ${user.bio || "(vide)"}.

Génère :
1. "personas" : ${settings.personaCount || 14} personnages variés et hauts en couleur (influenceurs, trolls, journalistes, stars, anonymes, ex toxiques, gourous, comptes de ragots, politiciens de l'univers, etc. adaptés à l'univers). Des relations déjà tendues ou complices entre eux. Followers réalistes et très inégaux.
2. "storylines" : 4 à 6 intrigues/drames déjà en cours au lancement.
3. "actions" : l'état initial du fil : environ 22 posts (dont des réponses et citations entre persos pour montrer les embrouilles en cours), quelques likes/reposts entre eux, follows_user vide, et 6 tendances. Personne ne connaît encore le joueur, sauf éventuellement 1 ou 2 posts du type "c'est qui le/la nouveau·elle ?".
Pour le fil initial, les handles des auteurs doivent correspondre aux personas que tu viens de créer, et reply_to/quote_of ne peuvent utiliser que "new:N".`;
  return callJSON({ system: rules(settings), prompt, schema: WORLD_SCHEMA, mature: settings.mature });
}

export async function tick(world) {
  if (isDemo()) return mock.tick(world);
  const prompt = `${stateBlock(world)}

TÂCHE : un peu de temps s'est écoulé. Fais vivre le réseau. Génère 5 à 9 nouveaux posts (mélange de posts originaux, réponses à des posts récents, citations), qui font avancer les intrigues ou en démarrent de nouvelles. Ajoute quelques likes/reposts réalistes (y compris éventuellement sur les posts du joueur s'ils le méritent). follows_user : seulement si c'est cohérent. Mets à jour storylines et trends si ça a évolué.`;
  return callJSON({ system: systemText(world), prompt, schema: ACTIONS_SCHEMA, mature: world.settings.mature });
}

export async function reactToUserPost(world, post) {
  if (isDemo()) return mock.reactToUserPost(world, post);
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
  return callJSON({ system: systemText(world), prompt, schema: ACTIONS_SCHEMA, mature: world.settings.mature });
}

export async function replyToDM(world, persona) {
  const history = world.dms[persona.id] || [];
  if (isDemo()) return mock.replyToDM(world, persona, history);
  const convo = history
    .slice(-30)
    .map((m) => `${m.from === ME ? "@" + world.user.handle + " (humain)" : "@" + persona.handle}: ${m.text}`)
    .join("\n");
  const prompt = `${stateBlock(world)}

MESSAGES PRIVÉS entre @${persona.handle} et le joueur @${world.user.handle} :
${convo}

TÂCHE : tu es @${persona.handle} (${persona.name}). Réponds au dernier message du joueur en DM, en restant parfaitement dans ton personnage (en privé, les persos sont souvent plus francs : confidences, ragots sur les autres, drague, menaces, propositions d'alliance…). 1 à 3 messages courts.`;
  const out = await callJSON({ system: systemText(world), prompt, schema: DM_SCHEMA, mature: world.settings.mature });
  return out.messages;
}
