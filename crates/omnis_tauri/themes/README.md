# Omnis Launcher - Guida ai Temi & Personalizzazione Interfaccia

Benvenuto nella directory dei temi di Omnis! Qui puoi modificare i temi esistenti o crearne di nuovi in modo completamente modulare, in pieno stile Playnite.

## Struttura di un Tema
Ogni tema è racchiuso nella propria sottocartella e contiene:
- `theme.json`: Metadati del tema, palette cromatica tokenizzata e configurazione layout
- `style.css`: Foglio di stile CSS personalizzato per cambiare l'interfaccia a piacimento

```text
themes/
├── cyberpunk/
│   ├── theme.json
│   └── style.css
├── steam_deck/
│   ├── theme.json
│   └── style.css
├── cinema_trailer/
│   ├── theme.json
│   └── style.css
└── mio_tema_custom/
    ├── theme.json
    └── style.css
```

---

## Proprietà in `theme.json`

| Proprietà | Tipo | Descrizione |
|---|---|---|
| `id` | string | Identificativo univoco (es. `cinema_trailer`, `mio_tema`) |
| `name` | string | Nome visualizzato nell'interfaccia |
| `description` | string | Descrizione breve dell'atmosfera del tema |
| `author` | string | Autore del tema |
| `target_mode` | string | `"all"`, `"desktop"`, oppure `"fullscreen"` (anche `"bigpicture"` per retrocompatibilità) |
| `enable_video_backdrop` | boolean | `true` per abilitare video trailer di sottofondo, `false` altrimenti |
| `video_backdrop_opacity` | number | Opacità del trailer video di sfondo (es. `0.55`) |
| `video_delay_ms` | number | Ritardo di avvio del trailer su focus (es. `1000` ms per evitare lag durante lo scroll rapido) |
| `bg_base` | string (HEX) | Sfondo principale dell'app |
| `bg_surface` | string (HEX) | Sfondo di modali, sidebar e barre di navigazione |
| `bg_card` | string (HEX) | Sfondo delle schede di gioco e pannelli secondari |
| `text_primary` | string (HEX) | Colore del testo primario ad alto contrasto |
| `text_muted` | string (HEX) | Colore dei testi secondari, descrizioni e metadati |
| `accent_primary` | string (HEX) | Colore di accento principale (pulsanti, selezioni, badge) |
| `accent_glow` | string (RGBA) | Bagliore neon/luminoso per ombre ed elementi attivi |
| `border_color` | string (HEX) | Colore dei bordi e separatori |
| `card_radius` | string (CSS) | Raggio di curvatura delle card (es. `12px`, `8px`, `0px`) |
| `font_family` | string (CSS) | Tipografia del font (`system-ui, sans-serif`, etc.) |

---

## Personalizzazione CSS Avanzata (`style.css`)
Nel file `style.css` puoi scrivere qualsiasi regola CSS valida. Omnis inietterà automaticamente questo stile all'attivazione del tema.

### Selettori e Classi Utili:
- `.game-card`: Scheda del gioco nelle viste Grid e CoverFlow
- `.fullscreen-hero`, `.big-picture-hero`: Hero banner principale in modalità Fullscreen
- `.sidebar`: Barra laterale sinistra
- `.top-bar`: Barra dei controlli superiore
- `.video-backdrop`: Container del video trailer di sfondo

### Esempi di Personalizzazione:

```css
/* Effetto Glassmorphism con bordi sfumati */
.game-card {
  backdrop-filter: blur(12px) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease !important;
}

.game-card:hover {
  transform: translateY(-8px) scale(1.03) !important;
  box-shadow: 0 16px 32px var(--accent-glow) !important;
}

/* Fullscreen Hero Banner cinematografico */
.fullscreen-hero, .big-picture-hero {
  backdrop-filter: blur(10px) !important;
  border-radius: 24px !important;
}
```

---

## Come Creare un Nuovo Tema
1. Duplica una delle cartelle esistenti (es. `cyberpunk` o `cinema_trailer`).
2. Rinomina la cartella con il tuo ID (es. `mio_tema`).
3. Modifica `theme.json` cambiando `id`, `name` e la palette di colori.
4. Aggiungi il tuo codice CSS personalizzato in `style.css`.
5. Apri Omnis: il tuo nuovo tema apparirà istantaneamente nella lista dei temi selezionabili!
