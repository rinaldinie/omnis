import { describe, it, expect } from "vitest";
import { getLocalizedGenre, normalizeGenreKey } from "./genres";

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
});
