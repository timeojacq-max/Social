// Persistance très simple : tout le monde du jeu tient dans un fichier JSON.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "..", "data");
const WORLD_FILE = path.join(DATA_DIR, "world.json");

let world = null;

export function loadWorld() {
  if (world) return world;
  try {
    world = JSON.parse(fs.readFileSync(WORLD_FILE, "utf8"));
  } catch {
    world = null;
  }
  return world;
}

export function getWorld() {
  return world;
}

export function setWorld(next) {
  world = next;
  saveWorld();
}

export function saveWorld() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!world) {
    fs.rmSync(WORLD_FILE, { force: true });
    return;
  }
  const tmp = WORLD_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(world, null, 2));
  fs.renameSync(tmp, WORLD_FILE);
}

let counter = Date.now() % 100000;
export function newId(prefix) {
  counter += 1;
  return `${prefix}${counter.toString(36)}`;
}
