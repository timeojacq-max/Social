// Sauvegarde locale : la partie et la clé API restent sur l'appareil (localStorage).
const WORLD_KEY = "echo.world.v1";
const CONFIG_KEY = "echo.config.v1";

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn("Sauvegarde impossible", err);
    return false;
  }
}

let world = read(WORLD_KEY);
export const getWorld = () => world;
export function setWorld(next) {
  world = next;
  saveWorld();
}
export function saveWorld() {
  if (world && !write(WORLD_KEY, world)) {
    // Stockage plein : on allège l'historique et on réessaie
    world.posts = world.posts.slice(-600);
    world.notifications = world.notifications.slice(0, 100);
    write(WORLD_KEY, world);
  } else if (!world) write(WORLD_KEY, null);
}

export const DEFAULT_MODEL = "gemini-3.5-flash";
let config = { apiKey: "", model: DEFAULT_MODEL, tickSeconds: 90, ...(read(CONFIG_KEY) || {}) };
export const getConfig = () => config;
export function setConfig(patch) {
  config = { ...config, ...patch };
  write(CONFIG_KEY, config);
}

let counter = Date.now() % 1000000;
export function newId(prefix) {
  counter += 1;
  return `${prefix}${counter.toString(36)}`;
}
