export type LocaleCode = 'it' | 'en' | 'es' | 'fr' | 'de' | 'ja';

export interface LocaleInfo {
  code: LocaleCode;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
];

export interface TranslationSchema {
  common: {
    save: string;
    cancel: string;
    close: string;
    delete: string;
    edit: string;
    add: string;
    search: string;
    refresh: string;
    loading: string;
    error: string;
    success: string;
    filter: string;
    all: string;
    none: string;
    actions: string;
    details: string;
    play: string;
    install: string;
    enabled: string;
    disabled: string;
  };
  topbar: {
    big_picture: string;
    audio_on: string;
    audio_off: string;
    themes: string;
    plugins: string;
    language: string;
    add_game: string;
    edit_info: string;
    search_placeholder: string;
    sync: string;
    syncing: string;
    filter_by: string;
    all_games: string;
    filtered_count: string;
    options: string;
  };
  views: {
    grid: string;
    details: string;
    list: string;
    zoom: string;
    group_by: string;
  };
  groups: {
    none: string;
    library: string;
    is_installed: string;
    genre: string;
    developer: string;
    release_year: string;
    completion_status: string;
    installed: string;
    available: string;
    unknown: string;
  };
  game_details: {
    play_now: string;
    install_now: string;
    enrich_pipeline: string;
    enriching: string;
    edit_manual: string;
    identify_metadata: string;
    quick_actions: string;
    player_notes: string;
    description: string;
    no_description: string;
    genres: string;
    developers: string;
    publishers: string;
    release_date: string;
    playtime: string;
    series: string;
    custom_links: string;
    back_to_grid: string;
    not_played: string;
    hours: string;
    minutes: string;
    user_score: string;
    critic_score: string;
    community_score: string;
    install_dir: string;
  };
  table: {
    cover: string;
    title: string;
    platform: string;
    status: string;
    playtime: string;
    critic_score: string;
    series: string;
    completion: string;
    release_date: string;
    actions: string;
    no_games_found: string;
    adjust_filters: string;
  };
  completion_status: {
    not_played: string;
    playing: string;
    beaten: string;
    completed: string;
    abandoned: string;
    backlog: string;
    plan_to_play: string;
  };
  big_picture: {
    catalog_title: string;
    nav_hint: string;
    play_action: string;
    details_action: string;
    keyboard_action: string;
    exit_hint: string;
  };
  settings_modal: {
    title: string;
    subtitle: string;
    language_section: string;
    select_language: string;
    audio_section: string;
    sound_effects: string;
    sound_effects_desc: string;
    theme_section: string;
    active_theme: string;
    version_info: string;
  };
  plugins_modal: {
    title: string;
    subtitle: string;
    refresh_plugins: string;
    plugins_folder: string;
    builtin_providers: string;
    external_plugins: string;
    save_settings: string;
    test_connection: string;
    pipeline_section: string;
    run_pipeline: string;
    pipeline_running: string;
  };
  editor_modal: {
    title: string;
    tab_general: string;
    tab_description: string;
    tab_notes: string;
    tab_media: string;
    tab_launch: string;
    tab_links: string;
    field_title: string;
    field_sorting_title: string;
    field_series: string;
    field_age_rating: string;
    field_completion: string;
    field_release_date: string;
    field_user_score: string;
    save_changes: string;
  };
}
