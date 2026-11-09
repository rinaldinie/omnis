import { FieldPipelineRule } from "../../../types";

export const ALL_METADATA_SOURCES = [
  "official_store",
  "steamgriddb",
  "steam",
  "igdb",
  "opencritic",
  "howlongtobeat",
  "gog",
];

export interface MetadataFieldDefinition {
  id: string;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  category: "text" | "media" | "ratings" | "technical";
}

export const METADATA_FIELDS_DEFINITIONS: MetadataFieldDefinition[] = [
  {
    id: "name",
    labelKey: "metadata_settings.field_name",
    defaultLabel: "Nome Gioco",
    descriptionKey: "metadata_settings.field_name_desc",
    defaultDescription: "Titolo visualizzato nella libreria e nella schermata di dettaglio.",
    category: "text",
  },
  {
    id: "genres",
    labelKey: "metadata_settings.field_genres",
    defaultLabel: "Genere",
    descriptionKey: "metadata_settings.field_genres_desc",
    defaultDescription: "Categorie tematiche del gioco (GDR, Azione, Strategia).",
    category: "text",
  },
  {
    id: "release_date",
    labelKey: "metadata_settings.field_release_date",
    defaultLabel: "Data di Uscita",
    descriptionKey: "metadata_settings.field_release_date_desc",
    defaultDescription: "Giorno o anno di pubblicazione ufficiale del titolo.",
    category: "text",
  },
  {
    id: "developers",
    labelKey: "metadata_settings.field_developers",
    defaultLabel: "Sviluppatore",
    descriptionKey: "metadata_settings.field_developers_desc",
    defaultDescription: "Studi o team di sviluppo principali.",
    category: "text",
  },
  {
    id: "publishers",
    labelKey: "metadata_settings.field_publishers",
    defaultLabel: "Editore",
    descriptionKey: "metadata_settings.field_publishers_desc",
    defaultDescription: "Società o etichette che hanno pubblicato il gioco.",
    category: "text",
  },
  {
    id: "features",
    labelKey: "metadata_settings.field_features",
    defaultLabel: "Caratteristiche",
    descriptionKey: "metadata_settings.field_features_desc",
    defaultDescription: "Supporto controller, cloud save, multiplayer e achievement.",
    category: "technical",
  },
  {
    id: "tags",
    labelKey: "metadata_settings.field_tags",
    defaultLabel: "Tag",
    descriptionKey: "metadata_settings.field_tags_desc",
    defaultDescription: "Etichette descrittive della community e del catalogo.",
    category: "text",
  },
  {
    id: "description",
    labelKey: "metadata_settings.field_description",
    defaultLabel: "Descrizione e Trama",
    descriptionKey: "metadata_settings.field_description_desc",
    defaultDescription: "Sinossi narrativa e panoramica delle meccaniche.",
    category: "text",
  },
  {
    id: "links",
    labelKey: "metadata_settings.field_links",
    defaultLabel: "Link Utili",
    descriptionKey: "metadata_settings.field_links_desc",
    defaultDescription: "Collegamenti alla pagina del negozio ufficiale, guide e wiki.",
    category: "text",
  },
  {
    id: "critic_score",
    labelKey: "metadata_settings.field_critic_score",
    defaultLabel: "Voto Critica",
    descriptionKey: "metadata_settings.field_critic_score_desc",
    defaultDescription: "Valutazione numerica della stampa specializzata (OpenCritic/Metacritic).",
    category: "ratings",
  },
  {
    id: "community_score",
    labelKey: "metadata_settings.field_community_score",
    defaultLabel: "Voto Community",
    descriptionKey: "metadata_settings.field_community_score_desc",
    defaultDescription: "Percentuale di gradimento o punteggio medio dei giocatori.",
    category: "ratings",
  },
  {
    id: "age_rating",
    labelKey: "metadata_settings.field_age_rating",
    defaultLabel: "Classificazione Età",
    descriptionKey: "metadata_settings.field_age_rating_desc",
    defaultDescription: "Fascia d'età consigliata (PEGI, ESRB, USK).",
    category: "ratings",
  },
  {
    id: "series",
    labelKey: "metadata_settings.field_series",
    defaultLabel: "Serie / Franchise",
    descriptionKey: "metadata_settings.field_series_desc",
    defaultDescription: "Franchise o saga di appartenenza del videogioco.",
    category: "text",
  },
  {
    id: "region",
    labelKey: "metadata_settings.field_region",
    defaultLabel: "Regione",
    descriptionKey: "metadata_settings.field_region_desc",
    defaultDescription: "Regione geografica di pubblicazione (Globale, EU, US, JP).",
    category: "technical",
  },
  {
    id: "platform",
    labelKey: "metadata_settings.field_platform",
    defaultLabel: "Piattaforma",
    descriptionKey: "metadata_settings.field_platform_desc",
    defaultDescription: "Piattaforma hardware o sistema di destinazione.",
    category: "technical",
  },
  {
    id: "cover_image",
    labelKey: "metadata_settings.field_cover",
    defaultLabel: "Copertina Principale",
    descriptionKey: "metadata_settings.field_cover_desc",
    defaultDescription: "Locandina verticale in formato 2:3 (600x900) ad alta definizione.",
    category: "media",
  },
  {
    id: "icon",
    labelKey: "metadata_settings.field_icon",
    defaultLabel: "Icona",
    descriptionKey: "metadata_settings.field_icon_desc",
    defaultDescription: "Icona quadrata dell'applicazione o del launcher.",
    category: "media",
  },
  {
    id: "background_image",
    labelKey: "metadata_settings.field_background",
    defaultLabel: "Sfondo Panoramico",
    descriptionKey: "metadata_settings.field_background_desc",
    defaultDescription: "Artwork hero orizzontale in formato 16:9 (1920x1080 o 4K).",
    category: "media",
  },
  {
    id: "install_size",
    labelKey: "metadata_settings.field_install_size",
    defaultLabel: "Dimensione Gioco",
    descriptionKey: "metadata_settings.field_install_size_desc",
    defaultDescription: "Spazio su disco stimato o richiesto per l'installazione.",
    category: "technical",
  },
];

export function getDefaultFieldRules(): Record<string, FieldPipelineRule> {
  return {
    name: { enabled: true, sources: ["official_store", "steam", "igdb"] },
    genres: { enabled: true, sources: ["official_store", "igdb", "steam", "gog"] },
    release_date: { enabled: true, sources: ["official_store", "igdb", "steam", "gog"] },
    developers: { enabled: true, sources: ["official_store", "igdb", "steam", "gog"] },
    publishers: { enabled: true, sources: ["official_store", "igdb", "steam", "gog"] },
    features: { enabled: true, sources: ["official_store", "steam", "igdb", "gog"] },
    tags: { enabled: true, sources: ["steam", "gog", "official_store", "igdb"] },
    description: { enabled: true, sources: ["official_store", "steam", "gog", "igdb"] },
    links: { enabled: true, sources: ["official_store", "igdb", "steam"] },
    critic_score: { enabled: true, sources: ["opencritic", "igdb", "steam"] },
    community_score: { enabled: true, sources: ["steam", "igdb", "gog"] },
    age_rating: { enabled: true, sources: ["official_store", "igdb", "steam"] },
    series: { enabled: true, sources: ["igdb", "official_store"] },
    region: { enabled: false, sources: ["official_store"] },
    platform: { enabled: true, sources: ["official_store"] },
    cover_image: {
      enabled: true,
      sources: ["steamgriddb", "official_store", "steam", "igdb", "gog"],
    },
    icon: {
      enabled: true,
      sources: ["official_store", "steamgriddb", "steam", "gog"],
    },
    background_image: {
      enabled: true,
      sources: ["steamgriddb", "official_store", "steam", "igdb", "gog"],
    },
    install_size: { enabled: true, sources: ["official_store", "gog"] },
  };
}

export function normalizeProviderPriority(raw?: string[]): string[] {
  const result: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const normalized =
        item.toLowerCase() === "hltb" ? "howlongtobeat" : item.toLowerCase();
      if (ALL_METADATA_SOURCES.includes(normalized) && !result.includes(normalized)) {
        result.push(normalized);
      }
    }
  }
  for (const src of ALL_METADATA_SOURCES) {
    if (!result.includes(src)) {
      result.push(src);
    }
  }
  return result;
}

export type MetadataSubTab =
  | "igdb"
  | "steamgriddb"
  | "opencritic"
  | "hltb"
  | "pipeline";
