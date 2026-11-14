// Demo library used only by the screenshot harness (screenshots/index.html).
// Artwork is loaded from the public Steam CDN, exactly as the real metadata pipeline does.
import type {
  Achievement,
  DayActivityDto,
  GameAchievementsSummary,
  GameDto,
  GameStatsDto,
  GlobalStatsDto,
  LibraryCounts,
} from "../src/types";
import type { SlotWidget } from "../src/components/common/Slot";
import type { StoreAccount } from "../src/components/store_accounts/types";

const CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";

interface Seed {
  appid: number;
  title: string;
  library: "steam" | "epic" | "gog" | "xbox";
  installed: boolean;
  hours: number;
  score: number | null;
  release: string;
  genres: string[];
  dev: string;
  pub?: string;
  status: "Playing" | "Completed" | "Beaten" | "NotPlayed" | "OnHold" | "Plan to Play";
  daysAgo?: number;
  desc: string;
  hltb?: [number, number, number];
  ach?: [number, number];
}

const SEEDS: Seed[] = [
  { appid: 1086940, title: "Baldur's Gate 3", library: "gog", installed: true, hours: 142.5, score: 96, release: "2023-08-03", genres: ["RPG", "Strategy", "Turn-Based"], dev: "Larian Studios", status: "Playing", daysAgo: 0, desc: "Gather your party and return to the Forgotten Realms in a tale of fellowship and betrayal, sacrifice and survival, and the lure of absolute power. Mysterious abilities are awakening inside you, drawn from a mind flayer parasite planted in your brain.", hltb: [75, 117, 172], ach: [41, 54] },
  { appid: 1245620, title: "Elden Ring", library: "steam", installed: true, hours: 96.2, score: 95, release: "2022-02-25", genres: ["Action", "RPG", "Open World"], dev: "FromSoftware", pub: "Bandai Namco", status: "Beaten", daysAgo: 2, desc: "Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring and become an Elden Lord in the Lands Between.", hltb: [59, 101, 134], ach: [38, 42] },
  { appid: 1091500, title: "Cyberpunk 2077", library: "gog", installed: true, hours: 71.3, score: 86, release: "2020-12-10", genres: ["Action", "RPG", "Open World"], dev: "CD PROJEKT RED", status: "Playing", daysAgo: 1, desc: "An open-world action-adventure RPG set in the dark future of Night City — a dangerous megalopolis obsessed with power, glamor, and ceaseless body modification.", hltb: [26, 63, 109], ach: [33, 57] },
  { appid: 2379780, title: "Balatro", library: "steam", installed: true, hours: 58.0, score: 90, release: "2024-02-20", genres: ["Indie", "Strategy", "Card Game"], dev: "LocalThunk", pub: "Playstack", status: "Playing", daysAgo: 0, desc: "A hypnotically satisfying deckbuilder where you play illegal poker hands, discover game-changing jokers, and trigger adrenaline-pumping, outrageous combos.", hltb: [12, 45, 140], ach: [22, 30] },
  { appid: 1145350, title: "Hades II", library: "steam", installed: true, hours: 44.8, score: 94, release: "2025-09-25", genres: ["Action", "Indie", "Roguelike"], dev: "Supergiant Games", status: "Playing", daysAgo: 3, desc: "Battle beyond the Underworld using dark sorcery to take on the Titan of Time in this bewitching sequel to the award-winning rogue-like dungeon crawler.", hltb: [30, 55, 95], ach: [24, 49] },
  { appid: 292030, title: "The Witcher 3: Wild Hunt", library: "gog", installed: false, hours: 188.0, score: 93, release: "2015-05-18", genres: ["RPG", "Open World", "Fantasy"], dev: "CD PROJEKT RED", status: "Completed", daysAgo: 120, desc: "You are Geralt of Rivia, mercenary monster slayer. Before you stands a war-torn, monster-infested continent you can explore at will.", hltb: [52, 104, 173], ach: [78, 78] },
  { appid: 1174180, title: "Red Dead Redemption 2", library: "epic", installed: false, hours: 83.4, score: 96, release: "2019-11-05", genres: ["Action", "Adventure", "Open World"], dev: "Rockstar Games", status: "Beaten", daysAgo: 210, desc: "America, 1899. Arthur Morgan and the Van der Linde gang are outlaws on the run. With federal agents and bounty hunters massing on their heels, the gang must rob, steal and fight their way across the rugged heartland.", hltb: [50, 83, 178], ach: [39, 52] },
  { appid: 1145360, title: "Hades", library: "epic", installed: false, hours: 61.0, score: 93, release: "2020-09-17", genres: ["Action", "Indie", "Roguelike"], dev: "Supergiant Games", status: "Completed", daysAgo: 300, desc: "Defy the god of the dead as you hack and slash out of the Underworld in this rogue-like dungeon crawler from the creators of Bastion and Transistor.", hltb: [22, 49, 95], ach: [49, 49] },
  { appid: 1716740, title: "Starfield", library: "xbox", installed: true, hours: 37.5, score: 85, release: "2023-09-06", genres: ["RPG", "Sci-Fi", "Open World"], dev: "Bethesda Game Studios", pub: "Bethesda Softworks", status: "OnHold", daysAgo: 45, desc: "Starfield is the first new universe in 25 years from Bethesda Game Studios. Create any character you want and explore with unparalleled freedom.", hltb: [32, 91, 154], ach: [12, 50] },
  { appid: 1551360, title: "Forza Horizon 5", library: "xbox", installed: true, hours: 29.1, score: 92, release: "2021-11-09", genres: ["Racing", "Open World", "Sports"], dev: "Playground Games", pub: "Xbox Game Studios", status: "Playing", daysAgo: 6, desc: "Your Ultimate Horizon Adventure awaits! Explore the vibrant open world landscapes of Mexico with limitless, fun driving action in the world's greatest cars.", hltb: [16, 51, 182], ach: [44, 147] },
  { appid: 2677660, title: "Indiana Jones and the Great Circle", library: "xbox", installed: true, hours: 18.6, score: 87, release: "2024-12-09", genres: ["Action", "Adventure"], dev: "MachineGames", pub: "Bethesda Softworks", status: "Playing", daysAgo: 4, desc: "Uncover one of history's greatest mysteries in a first-person, single-player adventure set between the events of Raiders of the Lost Ark and The Last Crusade.", hltb: [16, 27, 42], ach: [17, 54] },
  { appid: 1240440, title: "Halo Infinite", library: "xbox", installed: false, hours: 22.0, score: 87, release: "2021-12-08", genres: ["Action", "Shooter", "Sci-Fi"], dev: "Halo Studios", pub: "Xbox Game Studios", status: "Beaten", daysAgo: 400, desc: "When all hope is lost and humanity's fate hangs in the balance, the Master Chief is ready to confront the most ruthless foe he's ever faced.", hltb: [11, 21, 37], ach: [61, 119] },
  { appid: 367520, title: "Hollow Knight", library: "gog", installed: true, hours: 47.2, score: 87, release: "2017-02-24", genres: ["Action", "Indie", "Metroidvania"], dev: "Team Cherry", status: "Completed", daysAgo: 160, desc: "Forge your own path in Hollow Knight! An epic action adventure through a vast ruined kingdom of insects and heroes.", hltb: [27, 41, 62], ach: [63, 63] },
  { appid: 632470, title: "Disco Elysium", library: "gog", installed: false, hours: 34.0, score: 91, release: "2019-10-15", genres: ["RPG", "Indie", "Detective"], dev: "ZA/UM", status: "Completed", daysAgo: 500, desc: "A groundbreaking open world role playing game. You're a detective with a unique skill system at your disposal and a whole city block to carve your path across.", hltb: [22, 33, 46], ach: [45, 45] },
  { appid: 413150, title: "Stardew Valley", library: "gog", installed: true, hours: 112.0, score: 89, release: "2016-02-26", genres: ["Indie", "Simulation", "RPG"], dev: "ConcernedApe", status: "OnHold", daysAgo: 90, desc: "You've inherited your grandfather's old farm plot in Stardew Valley. Armed with hand-me-down tools and a few coins, you set out to begin your new life.", hltb: [53, 95, 168], ach: [31, 40] },
  { appid: 1593500, title: "God of War", library: "steam", installed: false, hours: 32.7, score: 94, release: "2022-01-14", genres: ["Action", "Adventure"], dev: "Santa Monica Studio", pub: "PlayStation PC", status: "Completed", daysAgo: 260, desc: "His vengeance against the Gods of Olympus years behind him, Kratos now lives as a man in the realm of Norse Gods and monsters.", hltb: [21, 32, 51], ach: [37, 37] },
  { appid: 814380, title: "Sekiro: Shadows Die Twice", library: "steam", installed: false, hours: 41.0, score: 90, release: "2019-03-22", genres: ["Action", "Adventure"], dev: "FromSoftware", pub: "Activision", status: "Beaten", daysAgo: 610, desc: "Carve your own clever path to vengeance in the award winning adventure from developer FromSoftware, creators of Bloodborne and the Dark Souls series.", hltb: [30, 43, 69], ach: [26, 34] },
  { appid: 2358720, title: "Black Myth: Wukong", library: "steam", installed: true, hours: 9.3, score: 81, release: "2024-08-20", genres: ["Action", "RPG"], dev: "Game Science", status: "Playing", daysAgo: 12, desc: "Black Myth: Wukong is an action RPG rooted in Chinese mythology. You shall set out as the Destined One to venture into the challenges and marvels ahead.", hltb: [39, 51, 86], ach: [8, 81] },
  { appid: 870780, title: "Control", library: "epic", installed: false, hours: 19.4, score: 85, release: "2019-08-27", genres: ["Action", "Adventure", "Sci-Fi"], dev: "Remedy Entertainment", pub: "505 Games", status: "Beaten", daysAgo: 700, desc: "After a secretive agency in New York is invaded by an otherworldly threat, you become the new Director struggling to regain Control.", hltb: [12, 20, 32], ach: [36, 60] },
  { appid: 1190460, title: "Death Stranding", library: "epic", installed: false, hours: 0, score: 85, release: "2020-07-14", genres: ["Action", "Adventure"], dev: "Kojima Productions", pub: "505 Games", status: "NotPlayed", desc: "From legendary game creator Hideo Kojima comes an all-new, genre-defying experience. Sam Bridges must brave a world utterly transformed by the Death Stranding.", hltb: [41, 64, 116], ach: [0, 77] },
  { appid: 753640, title: "Outer Wilds", library: "epic", installed: true, hours: 0, score: 88, release: "2020-06-18", genres: ["Adventure", "Indie", "Exploration"], dev: "Mobius Digital", pub: "Annapurna Interactive", status: "Plan to Play", desc: "Named Game of the Year 2019 by Giant Bomb, Polygon, Eurogamer, and The Guardian, Outer Wilds is a critically-acclaimed open world mystery about a solar system trapped in an endless time loop.", hltb: [17, 21, 25], ach: [0, 31] },
  { appid: 504230, title: "Celeste", library: "epic", installed: false, hours: 14.2, score: 92, release: "2018-01-25", genres: ["Indie", "Platformer"], dev: "Maddy Makes Games", status: "Beaten", daysAgo: 800, desc: "Help Madeline survive her inner demons on her journey to the top of Celeste Mountain, in this super-tight platformer from the creators of TowerFall.", hltb: [8, 13, 38], ach: [21, 32] },
  { appid: 782330, title: "DOOM Eternal", library: "steam", installed: true, hours: 26.5, score: 88, release: "2020-03-20", genres: ["Action", "Shooter"], dev: "id Software", pub: "Bethesda Softworks", status: "Completed", daysAgo: 380, desc: "Hell's armies have invaded Earth. Become the Slayer in an epic single-player campaign to conquer demons across dimensions and stop the final destruction of humanity.", hltb: [14, 21, 34], ach: [56, 56] },
  { appid: 1817230, title: "Hi-Fi RUSH", library: "xbox", installed: false, hours: 11.8, score: 89, release: "2023-01-25", genres: ["Action", "Rhythm"], dev: "Tango Gameworks", pub: "Bethesda Softworks", status: "Beaten", daysAgo: 540, desc: "Feel the beat as wannabe rockstar Chai and his ragtag team battle against an evil megacorp in a world that syncs to the music.", hltb: [11, 17, 30], ach: [29, 50] },
  { appid: 2215430, title: "Ghost of Tsushima", library: "steam", installed: false, hours: 0, score: 87, release: "2024-05-16", genres: ["Action", "Adventure", "Open World"], dev: "Sucker Punch Productions", pub: "PlayStation PC", status: "NotPlayed", desc: "A storm is coming. Venture into the complete Ghost of Tsushima DIRECTOR'S CUT on PC; forge your own path through this open-world action adventure.", hltb: [25, 42, 61], ach: [0, 77] },
  { appid: 582010, title: "Monster Hunter: World", library: "steam", installed: false, hours: 64.0, score: 88, release: "2018-08-09", genres: ["Action", "RPG"], dev: "CAPCOM", status: "OnHold", daysAgo: 900, desc: "Welcome to a new world! In Monster Hunter: World, you can enjoy the ultimate hunting experience, using everything at your disposal to hunt monsters in a new world teeming with surprises.", hltb: [47, 108, 337], ach: [27, 51] },
  { appid: 323190, title: "Frostpunk", library: "gog", installed: false, hours: 0, score: 84, release: "2018-04-24", genres: ["Strategy", "Simulation", "City Builder"], dev: "11 bit studios", status: "NotPlayed", desc: "Frostpunk is the first society survival game. As the ruler of the last city on Earth, it is your duty to manage both its citizens and its infrastructure.", hltb: [14, 26, 74], ach: [0, 64] },
  { appid: 1687950, title: "Persona 5 Royal", library: "xbox", installed: true, hours: 5.4, score: 94, release: "2022-10-21", genres: ["RPG", "Turn-Based"], dev: "ATLUS", pub: "SEGA", status: "Playing", daysAgo: 20, desc: "Don the mask and join the Phantom Thieves of Hearts as they stage grand heists, infiltrate the minds of the corrupt, and make them change their ways!", hltb: [102, 125, 158], ach: [4, 51] },
  { appid: 620, title: "Portal 2", library: "steam", installed: false, hours: 21.0, score: 95, release: "2011-04-18", genres: ["Puzzle", "Sci-Fi"], dev: "Valve", status: "Completed", daysAgo: 1400, desc: "The \"Perpetual Testing Initiative\" has been expanded to allow you to design co-op puzzles for you and your friends!", hltb: [8, 14, 22], ach: [51, 51] },
  { appid: 1172620, title: "Sea of Thieves", library: "xbox", installed: false, hours: 15.0, score: 69, release: "2018-03-20", genres: ["Action", "Adventure", "Multiplayer"], dev: "Rare Ltd", pub: "Xbox Game Studios", status: "OnHold", daysAgo: 330, desc: "Sea of Thieves offers the essential pirate experience, from sailing and fighting to exploring and looting — everything you need to live the pirate life.", hltb: [15, 64, 300], ach: [32, 209] },
];

// Fixed "now" so the harness renders identically on every run
export const NOW = new Date("2026-11-03T21:30:00");

function fmtHours(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

function daysAgoIso(d: number | undefined): string | null {
  if (d === undefined) return null;
  const t = new Date(NOW.getTime() - d * 86400000 - 3 * 3600000);
  return t.toISOString();
}



export const GAMES: GameDto[] = SEEDS.map((s) => ({
  id: `${s.library}-${s.appid}`,
  external_id: String(s.appid),
  title: s.title,
  library: s.library,
  is_installed: s.installed,
  playtime_seconds: Math.round(s.hours * 3600),
  playtime_formatted: fmtHours(s.hours),
  critic_score: s.score,
  community_score: s.score ? Math.min(98, s.score + 2) : null,
  release_date: s.release,
  description: s.desc,
  cover_image: `${CDN}/${s.appid}/library_600x900_2x.jpg`,
  background_image: `${CDN}/${s.appid}/library_hero.jpg`,
  icon_image: `${CDN}/${s.appid}/library_600x900_2x.jpg`,
  completion_status: s.status,
  features: ["Single-player", "Full controller support", "Cloud Saves", "Achievements"],
  custom_links: [],
  extra_metadata: JSON.stringify({ howlongtobeat: { main: s.hltb?.[0], extra: s.hltb?.[1], completionist: s.hltb?.[2] }, achievements: s.ach }),
  genres: s.genres,
  developers: [s.dev],
  publishers: [s.pub ?? s.dev],
  last_activity: daysAgoIso(s.daysAgo),
}));

const seedById = new Map(SEEDS.map((s) => [`${s.library}-${s.appid}`, s]));

export function counts(): LibraryCounts {
  const by = (pred: (g: GameDto) => boolean) => GAMES.filter(pred).length;
  const genre = (n: string) => by((g) => g.genres.includes(n));
  return {
    total: GAMES.length,
    installed: by((g) => g.is_installed),
    steam: by((g) => g.library === "steam"),
    gog: by((g) => g.library === "gog"),
    epic: by((g) => g.library === "epic"),
    xbox: by((g) => g.library === "xbox"),
    recent: by((g) => !!g.last_activity),
    favorites: 0,
    action: genre("Action"),
    rpg: genre("RPG"),
    strategy: genre("Strategy"),
    indie: genre("Indie"),
  };
}

export function slotWidgets(slot: string, gameId?: string | null): SlotWidget[] {
  const s = gameId ? seedById.get(gameId) : undefined;
  if (!s) return [];
  if (slot === "details.info" && s.hltb) {
    return [
      { type: "stat", label: "Main Story", value: `${s.hltb[0]} Hours`, icon: "clock" },
      { type: "stat", label: "Main + Extras", value: `${s.hltb[1]} Hours`, icon: "compass" },
      { type: "stat", label: "Completionist", value: `${s.hltb[2]} Hours`, icon: "trophy" },
    ];
  }
  if (slot === "details.hero" || slot === "fullscreen.hero" || slot === "bigpicture.hero") {
    const w: SlotWidget[] = [];
    if (s.score) {
      w.push({ type: "stat", label: "OpenCritic", value: `${s.score} · ${s.score >= 90 ? "Mighty" : s.score >= 84 ? "Strong" : "Fair"}`, icon: "award" });
    }
    if (s.ach && s.ach[1] > 0) {
      w.push({ type: "progress", label: "Achievements Unlocked", value: s.ach[0], max: s.ach[1] });
    }
    return w;
  }
  return [];
}

// --- Achievements ---------------------------------------------------------

const ACH_NAMES: Array<[string, string]> = [
  ["Critical Hit", "Roll a natural 20 in combat."],
  ["The Long Rest", "Complete a long rest with every companion at camp."],
  ["Act I Complete", "Leave the Wilderness behind and reach the Shadow-Cursed Lands."],
  ["Silver Tongue", "Succeed on 50 persuasion checks."],
  ["Dragon Slayer", "Defeat the ancient red dragon."],
  ["Hoarder", "Carry more than 1,000 gold at once."],
  ["Explorer", "Discover every waypoint in the world."],
  ["Master Alchemist", "Brew 30 different potions."],
  ["Untouchable", "Win a fight without taking damage."],
  ["Brain Drain", "Free the illithid-held prisoners."],
  ["Honour Bound", "Finish the game in Honour Mode."],
  ["Kindred Spirits", "Recruit every companion."],
  ["Spellbound", "Learn 40 different spells."],
  ["Fashionista", "Dye every piece of your party's armour."],
  ["Paragon", "Reach level 12 with a full party."],
  ["Deep Pockets", "Steal from a merchant without being caught 25 times."],
  ["Chaos Theory", "Cause an explosion that defeats 4 enemies at once."],
  ["Pacifist", "Resolve a hostile encounter without combat."],
];

const PALETTE = ["#f59e0b", "#6366f1", "#10b981", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16", "#f97316"];
const GLYPHS = [
  "M32 12l6 13 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2z", // star
  "M20 46l12-34 12 34-12-8z", // spear
  "M32 14a18 18 0 1 0 0.1 0zM32 22a10 10 0 1 1-0.1 0z", // ring
  "M18 44V22l14-8 14 8v22l-14 8z", // gem
  "M22 18h20v10a10 10 0 0 1-20 0zM28 38h8v8h6v4H22v-4h6z", // trophy
  "M32 12l18 10v14c0 10-8 16-18 18-10-2-18-8-18-18V22z", // shield
];

function achievementIcon(i: number, locked: boolean): string {
  const c = locked ? "#334155" : PALETTE[i % PALETTE.length];
  const c2 = locked ? "#1e293b" : "#0f172a";
  const glyph = GLYPHS[i % GLYPHS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="64" height="64" rx="10" fill="url(#g)"/><path d="${glyph}" fill="${locked ? "#475569" : "#fff"}" fill-opacity="${locked ? 0.6 : 0.92}" fill-rule="evenodd"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function achievements(gameId: string): GameAchievementsSummary {
  const s = seedById.get(gameId);
  const [unlocked, total] = s?.ach ?? [0, 0];
  const list: Achievement[] = [];
  const shown = Math.min(total, ACH_NAMES.length);
  const unlockedShown = total === 0 ? 0 : Math.round((unlocked / total) * shown);
  for (let i = 0; i < shown; i++) {
    const isUnlocked = i < unlockedShown;
    const rarity = [3.1, 48.2, 71.5, 22.4, 6.8, 35.0, 12.9, 18.3, 8.4, 55.7, 1.9, 27.6, 14.2, 9.7, 40.3, 16.0, 5.2, 30.8][i];
    list.push({
      id: `${gameId}-a${i}`,
      game_id: gameId,
      api_name: `ACH_${i}`,
      display_name: ACH_NAMES[i][0],
      description: ACH_NAMES[i][1],
      icon_unlocked_url: achievementIcon(i, false),
      icon_locked_url: achievementIcon(i, true),
      local_icon_path: null,
      is_unlocked: isUnlocked,
      unlock_time: isUnlocked ? new Date(NOW.getTime() - (i * 5 + 1) * 86400000).toISOString() : null,
      rarity_percentage: rarity,
      points: null,
      is_hidden: i === 10,
    });
  }
  return {
    game_id: gameId,
    total_count: total,
    unlocked_count: unlocked,
    completion_percentage: total ? Math.round((unlocked / total) * 1000) / 10 : 0,
    total_points: 0,
    earned_points: 0,
    sync_status: total > 0 ? "available" : "none",
    achievements: list,
  };
}

// --- Statistics -----------------------------------------------------------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function globalStats(year?: number): GlobalStatsDto {
  const y = year ?? NOW.getFullYear();
  const rand = rng(y * 7919);
  const played = GAMES.filter((g) => g.playtime_seconds > 0);
  const rotation = played.slice(0, 11);
  const heatmap: DayActivityDto[] = [];
  const end = y === NOW.getFullYear() ? NOW : new Date(y, 11, 31);
  const storeSecs: Record<string, number> = {};
  const genreSecs: Record<string, number> = {};
  for (let d = new Date(y, 0, 1); d <= end; d = new Date(d.getTime() + 86400000)) {
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const holiday = d.getMonth() === 7 || (d.getMonth() === 11 && d.getDate() > 20);
    const p = weekend || holiday ? 0.85 : 0.5;
    if (rand() > p) continue;
    const n = 1 + Math.floor(rand() * (weekend ? 3 : 2));
    let total = 0;
    const sessions = [];
    for (let i = 0; i < n; i++) {
      const g = rotation[Math.floor(Math.pow(rand(), 1.6) * rotation.length)];
      const secs = Math.round((weekend ? 3600 : 1800) + rand() * (weekend ? 3 : 1.5) * 3600);
      total += secs;
      storeSecs[g.library] = (storeSecs[g.library] ?? 0) + secs;
      genreSecs[g.genres[0]] = (genreSecs[g.genres[0]] ?? 0) + secs;
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18 + i * 2, 15);
      sessions.push({
        id: `${ymd(d)}-${i}`,
        game_id: g.id,
        game_title: g.title,
        library_id: g.library,
        cover_image: g.cover_image ?? undefined,
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + secs * 1000).toISOString(),
        duration_seconds: secs,
      });
    }
    heatmap.push({ date: ymd(d), count_sessions: n, duration_seconds: total, sessions });
  }
  const yearTotal = heatmap.reduce((a, d) => a + d.duration_seconds, 0);
  const share = (rec: Record<string, number>, names?: Record<string, string>) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ name: names?.[k] ?? k, duration_seconds: v, percentage: Math.round((v / yearTotal) * 1000) / 10 }));
  const completed = GAMES.filter((g) => g.completion_status === "Completed" || g.completion_status === "Beaten").length;
  const notPlayed = GAMES.filter((g) => g.playtime_seconds === 0).length;
  return {
    total_playtime_year_seconds: yearTotal,
    total_playtime_lifetime_seconds: GAMES.reduce((a, g) => a + g.playtime_seconds, 0),
    available_years: [2024, 2025, 2026],
    activity_heatmap: heatmap,
    store_distribution: share(storeSecs, { steam: "Steam", gog: "GOG", epic: "Epic Games", xbox: "Xbox" }),
    genre_distribution: share(genreSecs).slice(0, 6),
    backlog_summary: {
      not_played_count: notPlayed,
      in_progress_count: GAMES.length - notPlayed - completed,
      completed_count: completed,
      total_games: GAMES.length,
      completion_percentage: Math.round((completed / GAMES.length) * 100),
    },
  };
}

export function gameStats(gameId: string): GameStatsDto {
  const rand = rng(gameId.length * 131 + gameId.charCodeAt(gameId.length - 1));
  return {
    average_session_seconds: Math.round(5400 + rand() * 3600),
    longest_session_seconds: Math.round(16000 + rand() * 9000),
    last_4_weeks_bars: [3, 2, 1, 0].map((back, i) => {
      const start = new Date(NOW.getTime() - (back * 7 + 6) * 86400000);
      const end = new Date(NOW.getTime() - back * 7 * 86400000);
      return {
        week_label: `Week ${i + 1}`,
        start_date: ymd(start),
        end_date: ymd(end),
        duration_seconds: Math.round((4 + rand() * 9 + i) * 3600),
      };
    }),
  };
}

export const STORE_ACCOUNTS: StoreAccount[] = [
  { store_id: "steam", name: "Steam", is_connected: true, username: "omnis_player", avatar_url: null, last_sync: "2026-11-03T20:58:00Z" },
  { store_id: "epic", name: "Epic Games Store", is_connected: true, username: "OmnisPlayer", avatar_url: null, last_sync: "2026-11-03T20:58:00Z" },
  { store_id: "gog", name: "GOG Galaxy", is_connected: true, username: "omnis.player", avatar_url: null, last_sync: "2026-11-03T20:58:00Z" },
  { store_id: "xbox", name: "Xbox / PC Game Pass", is_connected: true, username: "Omnis Player", avatar_url: null, last_sync: "2026-11-03T20:57:00Z" },
];
