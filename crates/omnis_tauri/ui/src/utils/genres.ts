import { LocaleCode } from "../i18n/types";

interface GenreTranslation {
  en: string;
  it: string;
  de: string;
  es: string;
  fr: string;
  ja: string;
}

const GENRE_TRANSLATIONS: Record<string, GenreTranslation> = {
  action: {
    en: "Action",
    it: "Azione",
    de: "Action",
    es: "Acción",
    fr: "Action",
    ja: "アクション",
  },
  adventure: {
    en: "Adventure",
    it: "Avventura",
    de: "Abenteuer",
    es: "Aventura",
    fr: "Aventure",
    ja: "アドベンチャー",
  },
  rpg: {
    en: "RPG",
    it: "GDR",
    de: "Rollenspiel (RPG)",
    es: "Rol (RPG)",
    fr: "Jeu de rôle (RPG)",
    ja: "RPG",
  },
  action_rpg: {
    en: "Action RPG",
    it: "GDR d'azione",
    de: "Action-Rollenspiel",
    es: "Rol de acción",
    fr: "Action-RPG",
    ja: "アクションRPG",
  },
  strategy: {
    en: "Strategy",
    it: "Strategia",
    de: "Strategie",
    es: "Estrategia",
    fr: "Stratégie",
    ja: "ストラテジー",
  },
  simulation: {
    en: "Simulation",
    it: "Simulazione",
    de: "Simulation",
    es: "Simulación",
    fr: "Simulation",
    ja: "シミュレーション",
  },
  indie: {
    en: "Indie",
    it: "Indie",
    de: "Indie",
    es: "Indie",
    fr: "Indépendant",
    ja: "インディー",
  },
  shooter: {
    en: "Shooter",
    it: "Sparatutto",
    de: "Shooter",
    es: "Disparos",
    fr: "Tir",
    ja: "シューティング",
  },
  racing: {
    en: "Racing",
    it: "Corse",
    de: "Rennspiel",
    es: "Carreras",
    fr: "Course",
    ja: "レース",
  },
  sports: {
    en: "Sports",
    it: "Sport",
    de: "Sport",
    es: "Deportes",
    fr: "Sport",
    ja: "スポーツ",
  },
  puzzle: {
    en: "Puzzle",
    it: "Rompicapo",
    de: "Rätsel",
    es: "Puzles",
    fr: "Casse-tête",
    ja: "パズル",
  },
  platformer: {
    en: "Platformer",
    it: "Piattaforme",
    de: "Plattformer",
    es: "Plataformas",
    fr: "Plates-formes",
    ja: "プラットフォーマー",
  },
  fighting: {
    en: "Fighting",
    it: "Picchiaduro",
    de: "Kampfspiel",
    es: "Lucha",
    fr: "Combat",
    ja: "格闘",
  },
  survival: {
    en: "Survival",
    it: "Sopravvivenza",
    de: "Survival",
    es: "Supervivencia",
    fr: "Survie",
    ja: "サバイバル",
  },
  horror: {
    en: "Horror",
    it: "Horror",
    de: "Horror",
    es: "Terror",
    fr: "Horreur",
    ja: "ホラー",
  },
  casual: {
    en: "Casual",
    it: "Casual",
    de: "Casual",
    es: "Casual",
    fr: "Occasionnel",
    ja: "カジュアル",
  },
  arcade: {
    en: "Arcade",
    it: "Arcade",
    de: "Arcade",
    es: "Arcade",
    fr: "Arcade",
    ja: "アーケード",
  },
  stealth: {
    en: "Stealth",
    it: "Furtivo",
    de: "Stealth",
    es: "Sigilo",
    fr: "Infiltration",
    ja: "ステルス",
  },
  card_game: {
    en: "Card Game",
    it: "Giochi di carte",
    de: "Kartenspiel",
    es: "Cartas",
    fr: "Jeu de cartes",
    ja: "カードゲーム",
  },
  music: {
    en: "Music & Rhythm",
    it: "Musica e ritmo",
    de: "Musik & Rhythmus",
    es: "Música y ritmo",
    fr: "Musique & Rythme",
    ja: "音楽・リズム",
  },
  visual_novel: {
    en: "Visual Novel",
    it: "Visual Novel",
    de: "Visual Novel",
    es: "Novela visual",
    fr: "Visual Novel",
    ja: "ビジュアルノベル",
  },
  open_world: {
    en: "Open World",
    it: "Mondo aperto",
    de: "Open-World",
    es: "Mundo abierto",
    fr: "Monde ouvert",
    ja: "オープンワールド",
  },
  sandbox: {
    en: "Sandbox",
    it: "Sandbox",
    de: "Sandbox",
    es: "Sandbox",
    fr: "Bac à sable",
    ja: "サンドボックス",
  },
  point_and_click: {
    en: "Point & Click",
    it: "Punta e clicca",
    de: "Point & Click",
    es: "Point & Click",
    fr: "Point & Click",
    ja: "ポイント＆クリック",
  },
  roguelike: {
    en: "Roguelike",
    it: "Roguelike",
    de: "Roguelike",
    es: "Roguelike",
    fr: "Roguelike",
    ja: "ローグライク",
  },
  tactical: {
    en: "Tactical",
    it: "Tattico",
    de: "Taktik",
    es: "Táctico",
    fr: "Tactique",
    ja: "タクティカル",
  },
  management: {
    en: "Management",
    it: "Gestionale",
    de: "Management",
    es: "Gestión",
    fr: "Gestion",
    ja: "経営・マネジメント",
  },
  building: {
    en: "Building",
    it: "Costruzione",
    de: "Bau",
    es: "Construcción",
    fr: "Construction",
    ja: "建築",
  },
  sci_fi: {
    en: "Sci-Fi",
    it: "Fantascienza",
    de: "Sci-Fi",
    es: "Ciencia ficción",
    fr: "Science-fiction",
    ja: "SF",
  },
  fantasy: {
    en: "Fantasy",
    it: "Fantasy",
    de: "Fantasy",
    es: "Fantasía",
    fr: "Fantastique",
    ja: "ファンタジー",
  },
  multiplayer: {
    en: "Multiplayer",
    it: "Multigiocatore",
    de: "Mehrspieler",
    es: "Multijugador",
    fr: "Multijoueur",
    ja: "マルチプレイヤー",
  },
  turn_based: {
    en: "Turn-Based",
    it: "A turni",
    de: "Rundenbasiert",
    es: "Por turnos",
    fr: "Au tour par tour",
    ja: "ターン制",
  },
  action_adventure: {
    en: "Action-Adventure",
    it: "Azione e avventura",
    de: "Action-Adventure",
    es: "Acción y aventura",
    fr: "Action-Aventure",
    ja: "アクションアドベンチャー",
  },
  free_to_play: {
    en: "Free-to-Play",
    it: "Free-to-Play",
    de: "Free-to-Play",
    es: "Free-to-Play",
    fr: "Free-to-Play",
    ja: "基本プレイ無料",
  },
  early_access: {
    en: "Early Access",
    it: "Accesso anticipato",
    de: "Early Access",
    es: "Acceso anticipado",
    fr: "Accès anticipé",
    ja: "早期アクセス",
  },
  massively_multiplayer: {
    en: "Massively Multiplayer",
    it: "Multigiocatore di massa",
    de: "MMO",
    es: "Multijugador masivo",
    fr: "Massivement multijoueur",
    ja: "MMO",
  },
  hack_and_slash: {
    en: "Hack & Slash",
    it: "Hack & Slash",
    de: "Hack & Slash",
    es: "Hack & Slash",
    fr: "Hack & Slash",
    ja: "ハック＆スラッシュ",
  },
  mmorpg: {
    en: "MMORPG",
    it: "MMORPG",
    de: "MMORPG",
    es: "MMORPG",
    fr: "MMORPG",
    ja: "MMORPG",
  },
  jrpg: {
    en: "JRPG",
    it: "JRPG",
    de: "JRPG",
    es: "JRPG",
    fr: "JRPG",
    ja: "JRPG",
  },
  moba: {
    en: "MOBA",
    it: "MOBA",
    de: "MOBA",
    es: "MOBA",
    fr: "MOBA",
    ja: "MOBA",
  },
};

const ALIAS_MAP: Record<string, string> = {
  // Action
  action: "action",
  azione: "action",
  actions: "action",
  azioni: "action",
  acción: "action",
  accion: "action",

  // Adventure
  adventure: "adventure",
  avventura: "adventure",
  adventures: "adventure",
  avventure: "adventure",
  abenteuer: "adventure",
  aventura: "adventure",
  aventure: "adventure",

  // RPG
  rpg: "rpg",
  gdr: "rpg",
  ruolo: "rpg",
  "gioco di ruolo": "rpg",
  "giochi di ruolo": "rpg",
  "gioco di ruolo (gdr)": "rpg",
  "giochi di ruolo (gdr)": "rpg",
  "role-playing": "rpg",
  "role playing": "rpg",
  "role-playing (rpg)": "rpg",
  "role playing (rpg)": "rpg",
  roleplaying: "rpg",
  rollenspiel: "rpg",
  "jeu de rôle": "rpg",
  "jeu de role": "rpg",
  "juegos de rol": "rpg",

  // Action RPG
  "action rpg": "action_rpg",
  "action-rpg": "action_rpg",
  "action/rpg": "action_rpg",
  "action/role-playing": "action_rpg",
  arpg: "action_rpg",
  "gdr d'azione": "action_rpg",
  "gioco di ruolo d'azione": "action_rpg",
  "giochi di ruolo d'azione": "action_rpg",
  "action-rollenspiel": "action_rpg",

  // Strategy
  strategy: "strategy",
  strategia: "strategy",
  strategie: "strategy",
  estrategia: "strategy",
  stratégie: "strategy",
  strategies: "strategy",
  "real time strategy (rts)": "strategy",
  "real-time strategy": "strategy",
  "real time strategy": "strategy",
  "strategia in tempo reale": "strategy",

  // Simulation
  simulation: "simulation",
  simulator: "simulation",
  simulators: "simulation",
  simulazione: "simulation",
  simulazioni: "simulation",
  simulatore: "simulation",
  simulations: "simulation",
  simulador: "simulation",
  simulacion: "simulation",
  simulación: "simulation",

  // Indie
  indie: "indie",
  indipendente: "indie",
  indépendant: "indie",
  independiente: "indie",

  // Shooter
  shooter: "shooter",
  shooters: "shooter",
  sparatutto: "shooter",
  fps: "shooter",
  tps: "shooter",
  disparos: "shooter",
  tir: "shooter",

  // Racing
  racing: "racing",
  corse: "racing",
  corsa: "racing",
  carreras: "racing",
  course: "racing",
  courses: "racing",
  rennspiel: "racing",
  rennspiele: "racing",

  // Sports
  sports: "sports",
  sport: "sports",
  deportes: "sports",
  deporte: "sports",

  // Puzzle
  puzzle: "puzzle",
  puzzles: "puzzle",
  rompicapo: "puzzle",
  puzles: "puzzle",
  rätsel: "puzzle",
  "casse-tête": "puzzle",
  cassetete: "puzzle",
  enigmi: "puzzle",

  // Platformer
  platformer: "platformer",
  platformers: "platformer",
  platform: "platformer",
  piattaforme: "platformer",
  piattaforma: "platformer",
  plataformas: "platformer",
  plataforma: "platformer",
  plattformer: "platformer",
  "plates-formes": "platformer",

  // Fighting
  fighting: "fighting",
  picchiaduro: "fighting",
  lucha: "fighting",
  combat: "fighting",
  kampfspiel: "fighting",
  "beat 'em up": "fighting",
  "beat em up": "fighting",

  // Survival
  survival: "survival",
  sopravvivenza: "survival",
  supervivencia: "survival",
  survie: "survival",

  // Horror
  horror: "horror",
  terror: "horror",
  horreur: "horror",
  orrore: "horror",

  // Casual
  casual: "casual",
  occasionnel: "casual",
  passatempo: "casual",

  // Arcade
  arcade: "arcade",

  // Stealth
  stealth: "stealth",
  furtivo: "stealth",
  sigilo: "stealth",
  infiltration: "stealth",

  // Card Game
  "card game": "card_game",
  "card games": "card_game",
  "card-game": "card_game",
  "card & board game": "card_game",
  "card and board game": "card_game",
  "board game": "card_game",
  carte: "card_game",
  "giochi di carte": "card_game",
  "gioco di carte": "card_game",
  "giochi da tavolo": "card_game",
  cartas: "card_game",
  kartenspiel: "card_game",
  "jeu de cartes": "card_game",

  // Music & Rhythm
  music: "music",
  musica: "music",
  musicale: "music",
  rhythm: "music",
  ritmo: "music",
  rythme: "music",

  // Visual Novel
  "visual novel": "visual_novel",
  "romanzo visivo": "visual_novel",
  "novela visual": "visual_novel",

  // Open World
  "open world": "open_world",
  "open-world": "open_world",
  "mondo aperto": "open_world",
  "monde ouvert": "open_world",
  "mundo abierto": "open_world",

  // Sandbox
  sandbox: "sandbox",
  "bac à sable": "sandbox",

  // Point & Click
  "point and click": "point_and_click",
  "point & click": "point_and_click",
  "point-and-click": "point_and_click",
  "punta e clicca": "point_and_click",

  // Roguelike
  roguelike: "roguelike",
  "rogue-like": "roguelike",
  roguelite: "roguelike",
  "rogue-lite": "roguelike",

  // Tactical
  tactical: "tactical",
  tattico: "tactical",
  tattica: "tactical",
  taktik: "tactical",
  tactique: "tactical",

  // Management
  management: "management",
  gestionale: "management",
  gestione: "management",
  gestion: "management",

  // Building
  building: "building",
  costruzione: "building",
  costruzioni: "building",
  construcción: "building",
  construction: "building",
  "city builder": "building",

  // Sci-Fi
  "sci-fi": "sci_fi",
  scifi: "sci_fi",
  "science fiction": "sci_fi",
  fantascienza: "sci_fi",
  "ciencia ficción": "sci_fi",
  "science-fiction": "sci_fi",

  // Fantasy
  fantasy: "fantasy",
  fantasia: "fantasy",
  fantasía: "fantasy",
  fantastique: "fantasy",

  // Multiplayer
  multiplayer: "multiplayer",
  multigiocatore: "multiplayer",
  mehrspieler: "multiplayer",
  multijugador: "multiplayer",
  multijoueur: "multiplayer",
  "co-op": "multiplayer",
  coop: "multiplayer",

  // Turn-Based
  "turn-based": "turn_based",
  "turn based": "turn_based",
  "turn-based strategy": "turn_based",
  "turn-based strategy (tbs)": "turn_based",
  "strategia a turni": "turn_based",
  "a turni": "turn_based",
  "por turnos": "turn_based",
  rundenbasiert: "turn_based",

  // Action-Adventure
  "action-adventure": "action_adventure",
  "action adventure": "action_adventure",
  "action/adventure": "action_adventure",
  "azione e avventura": "action_adventure",
  "azione-avventura": "action_adventure",
  "azione/avventura": "action_adventure",
  "acción y aventura": "action_adventure",
  "action-aventure": "action_adventure",

  // Free-to-Play
  "free to play": "free_to_play",
  "free-to-play": "free_to_play",
  f2p: "free_to_play",
  "gioco gratuito": "free_to_play",
  "giochi gratuiti": "free_to_play",
  "kostenlos spielbar": "free_to_play",
  "gratuit pour jouer": "free_to_play",

  // Early Access
  "early access": "early_access",
  "early-access": "early_access",
  "accesso anticipato": "early_access",
  "acceso anticipado": "early_access",
  "accès anticipé": "early_access",

  // Massively Multiplayer
  "massively multiplayer": "massively_multiplayer",
  "massively multiplayer online": "massively_multiplayer",
  "multigiocatore di massa": "massively_multiplayer",
  "multijugador masivo": "massively_multiplayer",
  "massivement multijoueur": "massively_multiplayer",
  mmo: "massively_multiplayer",

  // Hack & Slash
  "hack and slash": "hack_and_slash",
  "hack & slash": "hack_and_slash",
  "hack-and-slash": "hack_and_slash",
  "hack and slash/beat 'em up": "hack_and_slash",
  "hack'n'slash": "hack_and_slash",

  // Acronyms
  mmorpg: "mmorpg",
  jrpg: "jrpg",
  moba: "moba",
};

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function normalizeGenreKey(genre: string): string | null {
  if (!genre) return null;
  const clean = genre.toLowerCase().trim().replace(/\s+/g, " ");
  if (!clean) return null;
  if (Object.prototype.hasOwnProperty.call(GENRE_TRANSLATIONS, clean)) {
    return clean;
  }
  if (Object.prototype.hasOwnProperty.call(ALIAS_MAP, clean)) {
    return ALIAS_MAP[clean];
  }
  // Try partial word matches
  for (const [alias, key] of Object.entries(ALIAS_MAP)) {
    if (clean === alias || clean.startsWith(`${alias} `) || clean.endsWith(` ${alias}`)) {
      return key;
    }
  }
  return null;
}

/**
 * Returns a stable canonical identifier for any genre string (known or custom).
 * Equivalent genres across languages, casings, and store aliases map to the same key.
 */
export function getCanonicalGenre(genre: string): string {
  if (!genre) return "";
  const trimmed = genre.trim();
  if (!trimmed) return "";
  const key = normalizeGenreKey(trimmed);
  if (key) return key;
  return trimmed.toLowerCase().replace(/\s+/g, " ");
}

/**
 * Deduplicates a list of genre strings by canonical key while preserving order.
 */
export function dedupeGenres(genres: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const genre of genres) {
    const canonical = getCanonicalGenre(genre);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(genre.trim());
  }
  return result;
}

export function getLocalizedGenre(genre: string, locale: LocaleCode | string): string {
  if (!genre) return "";
  const key = normalizeGenreKey(genre);
  if (key && Object.prototype.hasOwnProperty.call(GENRE_TRANSLATIONS, key)) {
    const loc = (locale || "en") as LocaleCode;
    return GENRE_TRANSLATIONS[key][loc] || GENRE_TRANSLATIONS[key]["en"] || genre;
  }
  return capitalize(genre.trim());
}
