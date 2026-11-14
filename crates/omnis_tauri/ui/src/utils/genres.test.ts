import { describe, it, expect } from "vitest";
import { dedupeGenres, getCanonicalGenre, getLocalizedGenre, normalizeGenreKey } from "./genres";

describe("genre localization utility", () => {
  it("normalizes Italian genre strings to canonical keys", () => {
    expect(normalizeGenreKey("Azione")).toBe("action");
    expect(normalizeGenreKey("Avventura")).toBe("adventure");
    expect(normalizeGenreKey("GDR")).toBe("rpg");
    expect(normalizeGenreKey("Giochi di ruolo")).toBe("rpg");
    expect(normalizeGenreKey("Strategia")).toBe("strategy");
    expect(normalizeGenreKey("Rompicapo")).toBe("puzzle");
    expect(normalizeGenreKey("Piattaforme")).toBe("platformer");
  });

  it("translates Italian genres to English when locale is en", () => {
    expect(getLocalizedGenre("Azione", "en")).toBe("Action");
    expect(getLocalizedGenre("Avventura", "en")).toBe("Adventure");
    expect(getLocalizedGenre("GDR", "en")).toBe("RPG");
    expect(getLocalizedGenre("Giochi di ruolo", "en")).toBe("RPG");
    expect(getLocalizedGenre("Strategia", "en")).toBe("Strategy");
    expect(getLocalizedGenre("Simulazione", "en")).toBe("Simulation");
    expect(getLocalizedGenre("Rompicapo", "en")).toBe("Puzzle");
    expect(getLocalizedGenre("Sparatutto", "en")).toBe("Shooter");
    expect(getLocalizedGenre("Corse", "en")).toBe("Racing");
    expect(getLocalizedGenre("Piattaforme", "en")).toBe("Platformer");
  });

  it("translates English genres to Italian when locale is it", () => {
    expect(getLocalizedGenre("Action", "it")).toBe("Azione");
    expect(getLocalizedGenre("Adventure", "it")).toBe("Avventura");
    expect(getLocalizedGenre("Role-Playing", "it")).toBe("GDR");
    expect(getLocalizedGenre("Strategy", "it")).toBe("Strategia");
    expect(getLocalizedGenre("Puzzle", "it")).toBe("Rompicapo");
    expect(getLocalizedGenre("Shooter", "it")).toBe("Sparatutto");
  });

  it("translates genres to other supported languages", () => {
    expect(getLocalizedGenre("Azione", "de")).toBe("Action");
    expect(getLocalizedGenre("Avventura", "de")).toBe("Abenteuer");
    expect(getLocalizedGenre("Azione", "es")).toBe("Acción");
    expect(getLocalizedGenre("Avventura", "es")).toBe("Aventura");
    expect(getLocalizedGenre("Azione", "fr")).toBe("Action");
    expect(getLocalizedGenre("Avventura", "fr")).toBe("Aventure");
    expect(getLocalizedGenre("Azione", "ja")).toBe("アクション");
    expect(getLocalizedGenre("Avventura", "ja")).toBe("アドベンチャー");
  });

  it("capitalizes unknown or custom genres safely without crashing", () => {
    expect(getLocalizedGenre("cyberpunk", "en")).toBe("Cyberpunk");
    expect(getLocalizedGenre("unknown genre", "it")).toBe("Unknown genre");
    expect(getLocalizedGenre("", "en")).toBe("");
  });

  it("canonicalizes and deduplicates equivalent store and localized genres", () => {
    expect(getCanonicalGenre("Action")).toBe("action");
    expect(getCanonicalGenre("Azione")).toBe("action");
    expect(getCanonicalGenre("Role-playing (RPG)")).toBe("rpg");
    expect(getCanonicalGenre("GDR")).toBe("rpg");
    expect(getCanonicalGenre("Simulator")).toBe("simulation");
    expect(getCanonicalGenre("Simulazione")).toBe("simulation");
    expect(getCanonicalGenre("Point-and-click")).toBe("point_and_click");
    expect(getCanonicalGenre("Punta e clicca")).toBe("point_and_click");
    expect(getCanonicalGenre("Free To Play")).toBe("free_to_play");
    expect(getCanonicalGenre("Free-to-play")).toBe("free_to_play");
    expect(getCanonicalGenre("Accesso anticipato")).toBe("early_access");
    expect(getCanonicalGenre("Early Access")).toBe("early_access");
    expect(getCanonicalGenre("Multigiocatore di massa")).toBe("massively_multiplayer");
    expect(getCanonicalGenre("Massively Multiplayer")).toBe("massively_multiplayer");
    expect(getCanonicalGenre("Action-Adventure")).toBe("action_adventure");
    expect(getCanonicalGenre("Action Adventure")).toBe("action_adventure");
    expect(getCanonicalGenre("Card & Board Game")).toBe("card_game");
    expect(getCanonicalGenre("Metroidvania")).toBe("metroidvania");
    expect(getCanonicalGenre("metroidvania")).toBe("metroidvania");

    // Canonical keys with underscores remain idempotent and localize properly
    expect(getLocalizedGenre("action_rpg", "it")).toBe("GDR d'azione");
    expect(getLocalizedGenre("point_and_click", "it")).toBe("Punta e clicca");
    expect(getLocalizedGenre("early_access", "it")).toBe("Accesso anticipato");
    expect(getLocalizedGenre("action_adventure", "it")).toBe("Azione e avventura");

    expect(
      dedupeGenres(["Action", "Azione", "Role-playing (RPG)", "GDR", "Metroidvania", "metroidvania"])
    ).toEqual(["Action", "Role-playing (RPG)", "Metroidvania"]);
  });
});
