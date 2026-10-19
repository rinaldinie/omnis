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
