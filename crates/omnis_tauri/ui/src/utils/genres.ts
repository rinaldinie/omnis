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
  "role-playing": "rpg",
  "role playing": "rpg",
  roleplaying: "rpg",
  rollenspiel: "rpg",
  "jeu de rôle": "rpg",
  "jeu de role": "rpg",
  "juegos de rol": "rpg",

  // Action RPG
  "action rpg": "action_rpg",
  "action-rpg": "action_rpg",
  "action/rpg": "action_rpg",
  arpg: "action_rpg",
  "gdr d'azione": "action_rpg",
  "action-rollenspiel": "action_rpg",

  // Strategy
  strategy: "strategy",
  strategia: "strategy",
  strategie: "strategy",
  estrategia: "strategy",
  stratégie: "strategy",
  strategies: "strategy",

  // Simulation
  simulation: "simulation",
  simulazione: "simulation",
  simulazioni: "simulation",
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
  carte: "card_game",
  "giochi di carte": "card_game",
  "gioco di carte": "card_game",
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
  "a turni": "turn_based",
  "por turnos": "turn_based",
  rundenbasiert: "turn_based",
};

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function normalizeGenreKey(genre: string): string | null {
  if (!genre) return null;
  const clean = genre.toLowerCase().trim();
  if (ALIAS_MAP[clean]) {
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

export function getLocalizedGenre(genre: string, locale: LocaleCode | string): string {
  if (!genre) return "";
  const key = normalizeGenreKey(genre);
  if (key && GENRE_TRANSLATIONS[key]) {
    const loc = (locale || "en") as LocaleCode;
    return GENRE_TRANSLATIONS[key][loc] || GENRE_TRANSLATIONS[key]["en"] || genre;
  }
  return capitalize(genre.trim());
}
