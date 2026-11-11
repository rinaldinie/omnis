use crate::db::normalize_title_for_dedup;

pub fn html_to_plain_text(input: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;

    for c in input.chars() {
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
        } else if !in_tag {
            out.push(c);
        }
    }

    out.replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
        .trim()
        .to_string()
}

pub fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for b in input.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            encoded.push(b as char);
        } else if b == b' ' {
            encoded.push('+');
        } else {
            encoded.push_str(&format!("%{:02X}", b));
        }
    }
    encoded
}

pub fn extract_year(text: &str) -> Option<i32> {
    for word in text.split(|c: char| !c.is_numeric()) {
        if word.len() == 4 {
            if let Ok(y) = word.parse::<i32>() {
                if (1970..=2035).contains(&y) {
                    return Some(y);
                }
            }
        }
    }
    None
}

/// Checks whether a candidate title from a store matches the requested game title,
/// accounting for case, punctuation, ™/®/© symbols, and edition suffixes.
pub fn titles_match(expected: &str, candidate: &str) -> bool {
    let exp_strict = normalize_title_for_dedup(expected, false);
    let cand_strict = normalize_title_for_dedup(candidate, false);
    if !exp_strict.is_empty() && exp_strict == cand_strict {
        return true;
    }

    let exp_loose = normalize_title_for_dedup(expected, true);
    let cand_loose = normalize_title_for_dedup(candidate, true);
    !exp_loose.is_empty() && exp_loose == cand_loose
}

/// Checks whether a candidate title from a store matches strictly,
/// accounting for case, punctuation, and ™/®/© symbols without stripping edition suffixes.
pub fn titles_match_strict(expected: &str, candidate: &str) -> bool {
    let exp_strict = normalize_title_for_dedup(expected, false);
    let cand_strict = normalize_title_for_dedup(candidate, false);
    !exp_strict.is_empty() && exp_strict == cand_strict
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_titles_match_rejections() {
        // GOG unrelated closest matches must be rejected
        assert!(!titles_match("Metroid Dread", "Stellaris Upgrade Bundle"));
        assert!(!titles_match("ASTRAL CHAIN", "The Signifier Deluxe Edition"));
        assert!(!titles_match(
            "Super Smash Bros Ultimate",
            "Lysfanga: The Time Shift Warrior"
        ));
        assert!(!titles_match("Portal", "Portal 2"));
        assert!(!titles_match("Half-Life", "Half-Life 2"));
        assert!(!titles_match("", ""));
        assert!(!titles_match("   ", "Portal"));
    }

    #[test]
    fn test_titles_match_acceptances() {
        assert!(titles_match("Portal", "Portal"));
        assert!(titles_match("Portal 2", "Portal 2"));
        assert!(titles_match("Cyberpunk 2077", "Cyberpunk 2077™"));
        assert!(titles_match(
            "Grand Theft Auto: San Andreas",
            "Grand Theft Auto®: San Andreas™"
        ));
        assert!(titles_match(
            "The Witcher 3: Wild Hunt",
            "The Witcher 3: Wild Hunt — Remastered"
        ));
        assert!(titles_match(
            "The Witcher 3: Wild Hunt",
            "The Witcher 3: Wild Hunt - Game of the Year Edition"
        ));
        assert!(titles_match("Control", "Control™ – Ultimate Edition"));
        assert!(titles_match(
            "Death Stranding",
            "Death Stranding: Director's Cut"
        ));
        assert!(titles_match(
            "Death Stranding: Director's Cut",
            "Death Stranding"
        ));
        assert!(titles_match("Dishonored", "Dishonored - Definitive Edition"));
        assert!(titles_match("BioShock", "BioShock Remastered"));
    }

    #[test]
    fn test_titles_match_strict_distinguishes_editions() {
        assert!(titles_match_strict("Portal", "Portal"));
        assert!(titles_match_strict("Cyberpunk 2077", "Cyberpunk 2077™"));
        // Strict match does not strip edition suffixes
        assert!(!titles_match_strict(
            "The Witcher 3: Wild Hunt",
            "The Witcher 3: Wild Hunt - Game of the Year Edition"
        ));
    }
}
