use std::collections::HashSet;

const GENRE_ALIASES: &[(&str, &str)] = &[
    // Action
    ("action", "Action"),
    ("azione", "Action"),
    ("actions", "Action"),
    ("azioni", "Action"),
    ("acción", "Action"),
    ("accion", "Action"),
    // Adventure
    ("adventure", "Adventure"),
    ("avventura", "Adventure"),
    ("adventures", "Adventure"),
    ("avventure", "Adventure"),
    ("abenteuer", "Adventure"),
    ("aventura", "Adventure"),
    ("aventure", "Adventure"),
    // RPG
    ("rpg", "RPG"),
    ("gdr", "RPG"),
    ("ruolo", "RPG"),
    ("gioco di ruolo", "RPG"),
    ("giochi di ruolo", "RPG"),
    ("gioco di ruolo (gdr)", "RPG"),
    ("giochi di ruolo (gdr)", "RPG"),
    ("role-playing", "RPG"),
    ("role playing", "RPG"),
    ("role-playing (rpg)", "RPG"),
    ("role playing (rpg)", "RPG"),
    ("roleplaying", "RPG"),
    ("rollenspiel", "RPG"),
    ("jeu de rôle", "RPG"),
    ("jeu de role", "RPG"),
    ("juegos de rol", "RPG"),
    // Action RPG
    ("action_rpg", "Action RPG"),
    ("action rpg", "Action RPG"),
    ("action-rpg", "Action RPG"),
    ("action/rpg", "Action RPG"),
    ("action/role-playing", "Action RPG"),
    ("arpg", "Action RPG"),
    ("gdr d'azione", "Action RPG"),
    ("gioco di ruolo d'azione", "Action RPG"),
    ("giochi di ruolo d'azione", "Action RPG"),
    ("action-rollenspiel", "Action RPG"),
    // Strategy
    ("strategy", "Strategy"),
    ("strategia", "Strategy"),
    ("strategie", "Strategy"),
    ("estrategia", "Strategy"),
    ("stratégie", "Strategy"),
    ("strategies", "Strategy"),
    ("real time strategy (rts)", "Strategy"),
    ("real-time strategy", "Strategy"),
    ("real time strategy", "Strategy"),
    ("strategia in tempo reale", "Strategy"),
    // Simulation
    ("simulation", "Simulation"),
    ("simulator", "Simulation"),
    ("simulators", "Simulation"),
    ("simulazione", "Simulation"),
    ("simulazioni", "Simulation"),
    ("simulatore", "Simulation"),
    ("simulations", "Simulation"),
    ("simulador", "Simulation"),
    ("simulacion", "Simulation"),
    ("simulación", "Simulation"),
    // Indie
    ("indie", "Indie"),
    ("indipendente", "Indie"),
    ("indépendant", "Indie"),
    ("independiente", "Indie"),
    // Shooter
    ("shooter", "Shooter"),
    ("shooters", "Shooter"),
    ("sparatutto", "Shooter"),
    ("fps", "Shooter"),
    ("tps", "Shooter"),
    ("disparos", "Shooter"),
    ("tir", "Shooter"),
    // Racing
    ("racing", "Racing"),
    ("corse", "Racing"),
    ("corsa", "Racing"),
    ("carreras", "Racing"),
    ("course", "Racing"),
    ("courses", "Racing"),
    ("rennspiel", "Racing"),
    ("rennspiele", "Racing"),
    // Sports
    ("sports", "Sports"),
    ("sport", "Sports"),
    ("deportes", "Sports"),
    ("deporte", "Sports"),
    // Puzzle
    ("puzzle", "Puzzle"),
    ("puzzles", "Puzzle"),
    ("rompicapo", "Puzzle"),
    ("puzles", "Puzzle"),
    ("rätsel", "Puzzle"),
    ("casse-tête", "Puzzle"),
    ("cassetete", "Puzzle"),
    ("enigmi", "Puzzle"),
    // Platformer
    ("platformer", "Platformer"),
    ("platformers", "Platformer"),
    ("platform", "Platformer"),
    ("piattaforme", "Platformer"),
    ("piattaforma", "Platformer"),
    ("plataformas", "Platformer"),
    ("plataforma", "Platformer"),
    ("plattformer", "Platformer"),
    ("plates-formes", "Platformer"),
    // Fighting
    ("fighting", "Fighting"),
    ("picchiaduro", "Fighting"),
    ("lucha", "Fighting"),
    ("combat", "Fighting"),
    ("kampfspiel", "Fighting"),
    ("beat 'em up", "Fighting"),
    ("beat em up", "Fighting"),
    // Survival
    ("survival", "Survival"),
    ("sopravvivenza", "Survival"),
    ("supervivencia", "Survival"),
    ("survie", "Survival"),
    // Horror
    ("horror", "Horror"),
    ("terror", "Horror"),
    ("horreur", "Horror"),
    ("orrore", "Horror"),
    // Casual
    ("casual", "Casual"),
    ("occasionnel", "Casual"),
    ("passatempo", "Casual"),
    // Arcade
    ("arcade", "Arcade"),
    // Stealth
    ("stealth", "Stealth"),
    ("furtivo", "Stealth"),
    ("sigilo", "Stealth"),
    ("infiltration", "Stealth"),
    // Card Game
    ("card_game", "Card Game"),
    ("card game", "Card Game"),
    ("card games", "Card Game"),
    ("card-game", "Card Game"),
    ("card & board game", "Card Game"),
    ("card and board game", "Card Game"),
    ("board game", "Card Game"),
    ("carte", "Card Game"),
    ("giochi di carte", "Card Game"),
    ("gioco di carte", "Card Game"),
    ("giochi da tavolo", "Card Game"),
    ("cartas", "Card Game"),
    ("kartenspiel", "Card Game"),
    ("jeu de cartes", "Card Game"),
    // Music & Rhythm
    ("music & rhythm", "Music & Rhythm"),
    ("music", "Music & Rhythm"),
    ("musica", "Music & Rhythm"),
    ("musicale", "Music & Rhythm"),
    ("rhythm", "Music & Rhythm"),
    ("ritmo", "Music & Rhythm"),
    ("rythme", "Music & Rhythm"),
    // Visual Novel
    ("visual_novel", "Visual Novel"),
    ("visual novel", "Visual Novel"),
    ("romanzo visivo", "Visual Novel"),
    ("novela visual", "Visual Novel"),
    // Open World
    ("open_world", "Open World"),
    ("open world", "Open World"),
    ("open-world", "Open World"),
    ("mondo aperto", "Open World"),
    ("monde ouvert", "Open World"),
    ("mundo abierto", "Open World"),
    // Sandbox
    ("sandbox", "Sandbox"),
    ("bac à sable", "Sandbox"),
    // Point & Click
    ("point_and_click", "Point & Click"),
    ("point and click", "Point & Click"),
    ("point & click", "Point & Click"),
    ("point-and-click", "Point & Click"),
    ("punta e clicca", "Point & Click"),
    // Roguelike
    ("roguelike", "Roguelike"),
    ("rogue-like", "Roguelike"),
    ("roguelite", "Roguelike"),
    ("rogue-lite", "Roguelike"),
    // Tactical
    ("tactical", "Tactical"),
    ("tattico", "Tactical"),
    ("tattica", "Tactical"),
    ("taktik", "Tactical"),
    ("tactique", "Tactical"),
    // Management
    ("management", "Management"),
    ("gestionale", "Management"),
    ("gestione", "Management"),
    ("gestion", "Management"),
    // Building
    ("building", "Building"),
    ("costruzione", "Building"),
    ("costruzioni", "Building"),
    ("construcción", "Building"),
    ("construction", "Building"),
    ("city builder", "Building"),
    // Sci-Fi
    ("sci_fi", "Sci-Fi"),
    ("sci-fi", "Sci-Fi"),
    ("scifi", "Sci-Fi"),
    ("science fiction", "Sci-Fi"),
    ("fantascienza", "Sci-Fi"),
    ("ciencia ficción", "Sci-Fi"),
    ("science-fiction", "Sci-Fi"),
    // Fantasy
    ("fantasy", "Fantasy"),
    ("fantasia", "Fantasy"),
    ("fantasía", "Fantasy"),
    ("fantastique", "Fantasy"),
    // Multiplayer
    ("multiplayer", "Multiplayer"),
    ("multigiocatore", "Multiplayer"),
    ("mehrspieler", "Multiplayer"),
    ("multijugador", "Multiplayer"),
    ("multijoueur", "Multiplayer"),
    ("co-op", "Multiplayer"),
    ("coop", "Multiplayer"),
    // Turn-Based
    ("turn_based", "Turn-Based"),
    ("turn-based", "Turn-Based"),
    ("turn based", "Turn-Based"),
    ("turn-based strategy", "Turn-Based"),
    ("turn-based strategy (tbs)", "Turn-Based"),
    ("strategia a turni", "Turn-Based"),
    ("a turni", "Turn-Based"),
    ("por turnos", "Turn-Based"),
    ("rundenbasiert", "Turn-Based"),
    // Action-Adventure
    ("action_adventure", "Action-Adventure"),
    ("action-adventure", "Action-Adventure"),
    ("action adventure", "Action-Adventure"),
    ("action/adventure", "Action-Adventure"),
    ("azione e avventura", "Action-Adventure"),
    ("azione-avventura", "Action-Adventure"),
    ("azione/avventura", "Action-Adventure"),
    ("acción y aventura", "Action-Adventure"),
    ("action-aventure", "Action-Adventure"),
    // Free-to-Play
    ("free_to_play", "Free-to-Play"),
    ("free to play", "Free-to-Play"),
    ("free-to-play", "Free-to-Play"),
    ("f2p", "Free-to-Play"),
    ("gioco gratuito", "Free-to-Play"),
    ("giochi gratuiti", "Free-to-Play"),
    ("kostenlos spielbar", "Free-to-Play"),
    ("gratuit pour jouer", "Free-to-Play"),
    // Early Access
    ("early_access", "Early Access"),
    ("early access", "Early Access"),
    ("early-access", "Early Access"),
    ("accesso anticipato", "Early Access"),
    ("acceso anticipado", "Early Access"),
    ("accès anticipé", "Early Access"),
    // Massively Multiplayer
    ("massively_multiplayer", "Massively Multiplayer"),
    ("massively multiplayer", "Massively Multiplayer"),
    ("massively multiplayer online", "Massively Multiplayer"),
    ("multigiocatore di massa", "Massively Multiplayer"),
    ("multijugador masivo", "Massively Multiplayer"),
    ("massivement multijoueur", "Massively Multiplayer"),
    ("mmo", "Massively Multiplayer"),
    // Hack & Slash
    ("hack_and_slash", "Hack & Slash"),
    ("hack and slash", "Hack & Slash"),
    ("hack & slash", "Hack & Slash"),
    ("hack-and-slash", "Hack & Slash"),
    ("hack and slash/beat 'em up", "Hack & Slash"),
    ("hack'n'slash", "Hack & Slash"),
    // Acronyms
    ("mmorpg", "MMORPG"),
    ("jrpg", "JRPG"),
    ("moba", "MOBA"),
];

fn collapse_whitespace(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

/// Normalize a single genre string to its canonical English display name.
/// Unknown custom genres have whitespace collapsed and leading lowercase capitalized.
pub fn normalize_genre(raw: &str) -> Option<String> {
    let collapsed = collapse_whitespace(raw);
    if collapsed.is_empty() {
        return None;
    }

    let clean = collapsed.to_lowercase();

    for (alias, canonical) in GENRE_ALIASES {
        if clean == *alias {
            return Some((*canonical).to_string());
        }
    }

    for (alias, canonical) in GENRE_ALIASES {
        if clean.starts_with(&format!("{} ", alias)) || clean.ends_with(&format!(" {}", alias)) {
            return Some((*canonical).to_string());
        }
    }

    // Preserve explicit casing for custom/mixed-case genres (e.g. "Cybernetic", "VR"),
    // while capitalizing all-lowercase inputs (e.g. "metroidvania" -> "Metroidvania").
    if collapsed.chars().next().is_some_and(|c| c.is_lowercase()) {
        Some(capitalize_first(&collapsed))
    } else {
        Some(collapsed)
    }
}

/// Normalize and deduplicate a slice of genre strings while preserving order.
pub fn normalize_genres(genres: &[String]) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::with_capacity(genres.len());

    for raw in genres {
        if let Some(canonical) = normalize_genre(raw) {
            let key = canonical.to_lowercase();
            if seen.insert(key) {
                out.push(canonical);
            }
        }
    }

    out
}

/// Parse a raw DB `genres` field (JSON array `["Action", "RPG"]` or CSV `"Action, RPG"`)
/// into normalized, deduplicated canonical genre names.
pub fn parse_and_normalize_genres(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(trimmed) {
            let normalized = normalize_genres(&list);
            if !normalized.is_empty() {
                return normalized;
            }
        }
    }

    let parts: Vec<String> = trimmed
        .split(',')
        .map(|g| {
            g.trim()
                .trim_matches('"')
                .trim_matches('\'')
                .trim()
                .to_string()
        })
        .filter(|g| !g.is_empty())
        .collect();

    normalize_genres(&parts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_genre_aliases() {
        assert_eq!(normalize_genre("Azione").as_deref(), Some("Action"));
        assert_eq!(normalize_genre("  action  ").as_deref(), Some("Action"));
        assert_eq!(normalize_genre("GDR").as_deref(), Some("RPG"));
        assert_eq!(normalize_genre("Giochi di ruolo").as_deref(), Some("RPG"));
        assert_eq!(
            normalize_genre("Role-playing (RPG)").as_deref(),
            Some("RPG")
        );
        assert_eq!(normalize_genre("Simulator").as_deref(), Some("Simulation"));
        assert_eq!(
            normalize_genre("Simulazione").as_deref(),
            Some("Simulation")
        );
        assert_eq!(
            normalize_genre("Point-and-click").as_deref(),
            Some("Point & Click")
        );
        assert_eq!(
            normalize_genre("Punta e clicca").as_deref(),
            Some("Point & Click")
        );
        assert_eq!(
            normalize_genre("Free To Play").as_deref(),
            Some("Free-to-Play")
        );
        assert_eq!(
            normalize_genre("Accesso anticipato").as_deref(),
            Some("Early Access")
        );
        assert_eq!(
            normalize_genre("Multigiocatore di massa").as_deref(),
            Some("Massively Multiplayer")
        );
        assert_eq!(
            normalize_genre("Action Adventure").as_deref(),
            Some("Action-Adventure")
        );
        assert_eq!(
            normalize_genre("Card & Board Game").as_deref(),
            Some("Card Game")
        );
        assert_eq!(normalize_genre("metroidvania").as_deref(), Some("Metroidvania"));
        assert_eq!(normalize_genre("   "), None);
    }

    #[test]
    fn test_normalize_genres_deduplicates_preserving_order() {
        let input = vec![
            "Action".to_string(),
            "Azione".to_string(),
            "Role-playing (RPG)".to_string(),
            "GDR".to_string(),
            "metroidvania".to_string(),
            "Metroidvania".to_string(),
            "".to_string(),
        ];
        assert_eq!(
            normalize_genres(&input),
            vec![
                "Action".to_string(),
                "RPG".to_string(),
                "Metroidvania".to_string()
            ]
        );
    }

    #[test]
    fn test_parse_and_normalize_genres_csv_and_json() {
        assert_eq!(
            parse_and_normalize_genres("Azione, GDR, Action, Punta e clicca"),
            vec![
                "Action".to_string(),
                "RPG".to_string(),
                "Point & Click".to_string()
            ]
        );
        assert_eq!(
            parse_and_normalize_genres(r#"["Role-Playing", "GDR", "Simulazione"]"#),
            vec!["RPG".to_string(), "Simulation".to_string()]
        );
    }
}
