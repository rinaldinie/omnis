import { useState, useEffect, useRef } from "react";
import soundEffects from "../utils/soundEffects";
import { GameDto } from "../types";

interface UseGamepadNavigationProps {
  isFullscreen?: boolean;
  toggleFullscreen?: () => void;
  isBigPicture?: boolean;
  toggleBigPicture?: () => void;
  filteredGames: GameDto[];
  selectedGame: GameDto | null;
  showVirtualKeyboard: boolean;
  setShowVirtualKeyboard: (show: boolean) => void;
  setShowThemeModal: (show: boolean) => void;
  handleLaunch: (gameId: string) => void;
  cycleFilter: (direction: number, onCycle?: (nextFilter: string) => void) => void;
  isSuspended?: boolean;
  /** Columns of the fullscreen grid view; 0 when games are shown on a single shelf row */
  fullscreenGridColumns?: number;
  /** Whether the fullscreen home shows the "continue playing" row above the shelf */
  hasRecentRow?: boolean;
}

export type HomeFocusZone = "carousel" | "topbar" | "recent";
export type ControllerType = "xbox" | "playstation" | "nintendo";

/** Guesses the controller family from the Gamepad API id (name plus vendor id). */
export function detectControllerType(id: string): ControllerType {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e/.test(s)) return "xbox";
  if (/054c|dualsense|dualshock|playstation|ps4|ps5|wireless controller/.test(s)) return "playstation";
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return "nintendo";
  return "xbox";
}

/**
 * Gives the fullscreen view a chance to handle Back (e.g. to dismiss a confirmation dialog).
 * Returns true when the view consumed it.
 */
function interceptBack(scope: "menu" | "details"): boolean {
  const event = new CustomEvent(`omnis:${scope}-back`, { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function dispatchRecent(type: "nav" | "action", detail: Record<string, string>) {
  window.dispatchEvent(new CustomEvent(`omnis:recent-${type}`, { detail }));
}

/** Index reached moving one row in a grid with `cols` columns; unchanged when there is no row that way. */
export function gridStep(index: number, total: number, cols: number, dir: 1 | -1): number {
  const next = index + dir * cols;
  if (next < 0) return index;
  if (next >= total) {
    // Moving down into a shorter last row lands on its last game
    const lastRowStart = Math.floor((total - 1) / cols) * cols;
    return index < lastRowStart ? total - 1 : index;
  }
  return next;
}

export function useGamepadNavigation({
  isFullscreen: propIsFullscreen,
  toggleFullscreen: propToggleFullscreen,
  isBigPicture: propIsBigPicture,
  toggleBigPicture: propToggleBigPicture,
  filteredGames,
  selectedGame,
  showVirtualKeyboard,
  setShowVirtualKeyboard,
  setShowThemeModal,
  handleLaunch,
  cycleFilter,
  isSuspended = false,
  fullscreenGridColumns = 0,
  hasRecentRow = false,
}: UseGamepadNavigationProps) {
  const isFullscreen = propIsFullscreen !== undefined ? propIsFullscreen : (propIsBigPicture ?? false);
  const toggleFullscreen = propToggleFullscreen || propToggleBigPicture || (() => {});

  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false);
  const [gamepadName, setGamepadName] = useState<string>("");
  const [gamepadType, setGamepadType] = useState<ControllerType>("xbox");
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [showFullscreenDetails, setShowFullscreenDetails] = useState<boolean>(false);
  const [homeFocusZone, setHomeFocusZone] = useState<HomeFocusZone>("carousel");
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!isFullscreen) {
      setIsMenuOpen(false);
      setHomeFocusZone("carousel");
      setShowFullscreenDetails(false);
    }
  }, [isFullscreen]);

  // Mirrors of props and dynamic state in refs so the RAF polling loop never recreates
  const isFullscreenRef = useRef(isFullscreen);
  const toggleFullscreenRef = useRef(toggleFullscreen);
  const filteredGamesRef = useRef(filteredGames);
  const selectedGameRef = useRef(selectedGame);
  const showVirtualKeyboardRef = useRef(showVirtualKeyboard);
  const setShowVirtualKeyboardRef = useRef(setShowVirtualKeyboard);
  const setShowThemeModalRef = useRef(setShowThemeModal);
  const handleLaunchRef = useRef(handleLaunch);
  const cycleFilterRef = useRef(cycleFilter);
  const isSuspendedRef = useRef(isSuspended);
  const gridColumnsRef = useRef(fullscreenGridColumns);
  const hasRecentRowRef = useRef(hasRecentRow);

  const focusedIndexRef = useRef(focusedIndex);
  const showFullscreenDetailsRef = useRef(showFullscreenDetails);
  const homeFocusZoneRef = useRef(homeFocusZone);
  const isMenuOpenRef = useRef(isMenuOpen);

  // Sync refs on each render
  isFullscreenRef.current = isFullscreen;
  toggleFullscreenRef.current = toggleFullscreen;
  filteredGamesRef.current = filteredGames;
  selectedGameRef.current = selectedGame;
  showVirtualKeyboardRef.current = showVirtualKeyboard;
  setShowVirtualKeyboardRef.current = setShowVirtualKeyboard;
  setShowThemeModalRef.current = setShowThemeModal;
  handleLaunchRef.current = handleLaunch;
  cycleFilterRef.current = cycleFilter;
  isSuspendedRef.current = isSuspended;
  gridColumnsRef.current = fullscreenGridColumns;
  hasRecentRowRef.current = hasRecentRow;
  focusedIndexRef.current = focusedIndex;
  showFullscreenDetailsRef.current = showFullscreenDetails;
  homeFocusZoneRef.current = homeFocusZone;
  isMenuOpenRef.current = isMenuOpen;

  // Input timing & edge-triggering refs (persistent across renders)
  const awaitingNeutralStateRef = useRef<boolean>(false);
  const prevButtonsRef = useRef<boolean[]>([]);
  const navDirectionRef = useRef<number>(0); // -1 = left, 1 = right, 0 = neutral
  const navStartTimeRef = useRef<number>(0);
  const lastNavTimeRef = useRef<number>(0);
  const navDirectionYRef = useRef<number>(0); // -1 = up, 1 = down, 0 = neutral
  const navStartYTimeRef = useRef<number>(0);
  const lastNavYTimeRef = useRef<number>(0);

  // Gamepad Polling Loop with Suspension, Ghost Input Shield, and Edge-Triggering
  useEffect(() => {
    if (isSuspended) {
      awaitingNeutralStateRef.current = true;
      return;
    }

    let animId: number;

    const stepCarousel = (direction: number) => {
      setFocusedIndex((prev) => {
        const total = filteredGamesRef.current.length;
        if (total === 0) return 0;
        const next = Math.max(0, Math.min(total - 1, prev + direction));
        if (next !== prev) {
          soundEffects.playNav();
        }
        return next;
      });
    };

    const stepGrid = (dir: 1 | -1) => {
      setFocusedIndex((prev) => {
        const next = gridStep(prev, filteredGamesRef.current.length, gridColumnsRef.current, dir);
        if (next !== prev) {
          soundEffects.playNav();
        }
        return next;
      });
    };

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let activeGamepad: Gamepad | null = null;
      for (const gp of gamepads) {
        if (gp && gp.connected) {
          activeGamepad = gp;
          break;
        }
      }

      if (activeGamepad) {
        setGamepadConnected((prev) => {
          if (!prev) {
            setGamepadName(activeGamepad!.id.split("(")[0].trim());
            setGamepadType(detectControllerType(activeGamepad!.id));
            return true;
          }
          return prev;
        });

        // Ghost Input Shield upon window restore / unsuspension
        // Ignore ALL gamepad inputs until every button and stick is released at least once
        if (awaitingNeutralStateRef.current) {
          const anyButtonPressed = activeGamepad.buttons.some(
            (btn) => btn && (btn.pressed || btn.value > 0.15)
          );
          const anyStickActive = activeGamepad.axes.some((ax) => Math.abs(ax) > 0.3);
          if (anyButtonPressed || anyStickActive) {
            animId = requestAnimationFrame(pollGamepad);
            return;
          } else {
            // All buttons released! Deactivate shield and reset states
            awaitingNeutralStateRef.current = false;
            prevButtonsRef.current = [];
            navDirectionRef.current = 0;
            navStartTimeRef.current = 0;
            lastNavTimeRef.current = 0;
            navDirectionYRef.current = 0;
            navStartYTimeRef.current = 0;
            lastNavYTimeRef.current = 0;
          }
        }

        // When virtual keyboard is open, delegate gamepad controls exclusively to it.
        // Re-arm the shield so the button that closes it is not replayed on the screen below.
        if (showVirtualKeyboardRef.current) {
          awaitingNeutralStateRef.current = true;
          animId = requestAnimationFrame(pollGamepad);
          return;
        }

        const now = Date.now();
        const b = activeGamepad.buttons;
        const a = activeGamepad.axes;
        const prevButtons = prevButtonsRef.current;

        const isDown = (index: number): boolean => {
          const btn = b[index];
          return !!(btn && (btn.pressed || btn.value > 0.5));
        };

        const isEdge = (index: number): boolean => {
          return isDown(index) && !prevButtons[index];
        };

        // --- 1. D-PAD & STICK HORIZONTAL & VERTICAL NAVIGATION ---
        const rawLeft = isDown(14) || (a[0] !== undefined && a[0] < -0.45);
        const rawRight = isDown(15) || (a[0] !== undefined && a[0] > 0.45);
        let currentDirX = 0;
        if (rawLeft && !rawRight) currentDirX = -1;
        else if (rawRight && !rawLeft) currentDirX = 1;

        const rawUp = isDown(12) || (a[1] !== undefined && a[1] < -0.45);
        const rawDown = isDown(13) || (a[1] !== undefined && a[1] > 0.45);
        let currentDirY = 0;
        if (rawUp && !rawDown) currentDirY = -1;
        else if (rawDown && !rawUp) currentDirY = 1;

        if (isFullscreenRef.current) {
          if (showFullscreenDetailsRef.current) {
            // When in Fullscreen Details: handle horizontal navigation
            if (currentDirX !== 0) {
              if (navDirectionRef.current !== currentDirX) {
                navDirectionRef.current = currentDirX;
                navStartTimeRef.current = now;
                lastNavTimeRef.current = now;
                window.dispatchEvent(
                  new CustomEvent("omnis:details-nav", {
                    detail: { direction: currentDirX === 1 ? "right" : "left" },
                  })
                );
              } else {
                const holdDuration = now - navStartTimeRef.current;
                const INITIAL_HOLD_DELAY = 380;
                const REPEAT_INTERVAL = 170;
                if (holdDuration >= INITIAL_HOLD_DELAY && now - lastNavTimeRef.current >= REPEAT_INTERVAL) {
                  lastNavTimeRef.current = now;
                  window.dispatchEvent(
                    new CustomEvent("omnis:details-nav", {
                      detail: { direction: currentDirX === 1 ? "right" : "left" },
                    })
                  );
                }
              }
            } else {
              navDirectionRef.current = 0;
              navStartTimeRef.current = 0;
            }

            // Handle vertical navigation (Up / Down) in details
            if (currentDirY !== 0) {
              if (navDirectionYRef.current !== currentDirY) {
                navDirectionYRef.current = currentDirY;
                navStartYTimeRef.current = now;
                lastNavYTimeRef.current = now;
                window.dispatchEvent(
                  new CustomEvent("omnis:details-nav", {
                    detail: { direction: currentDirY === 1 ? "down" : "up" },
                  })
                );
              } else {
                const holdDuration = now - navStartYTimeRef.current;
                const INITIAL_HOLD_DELAY = 380;
                const REPEAT_INTERVAL = 170;
                if (holdDuration >= INITIAL_HOLD_DELAY && now - lastNavYTimeRef.current >= REPEAT_INTERVAL) {
                  lastNavYTimeRef.current = now;
                  window.dispatchEvent(
                    new CustomEvent("omnis:details-nav", {
                      detail: { direction: currentDirY === 1 ? "down" : "up" },
                    })
                  );
                }
              }
            } else {
              navDirectionYRef.current = 0;
              navStartYTimeRef.current = 0;
            }
          } else {
            // Main Fullscreen Home Screen
            if (isMenuOpenRef.current) {
              // --- A. DROPDOWN MENU IS OPEN ---
              // Vertical navigation inside dropdown menu
              if (currentDirY !== 0) {
                if (navDirectionYRef.current !== currentDirY) {
                  navDirectionYRef.current = currentDirY;
                  navStartYTimeRef.current = now;
                  lastNavYTimeRef.current = now;
                  window.dispatchEvent(
                    new CustomEvent("omnis:menu-nav", {
                      detail: { direction: currentDirY === 1 ? "down" : "up" },
                    })
                  );
                } else {
                  const holdDuration = now - navStartYTimeRef.current;
                  const INITIAL_HOLD_DELAY = 380;
                  const REPEAT_INTERVAL = 170;
                  if (holdDuration >= INITIAL_HOLD_DELAY && now - lastNavYTimeRef.current >= REPEAT_INTERVAL) {
                    lastNavYTimeRef.current = now;
                    window.dispatchEvent(
                      new CustomEvent("omnis:menu-nav", {
                        detail: { direction: currentDirY === 1 ? "down" : "up" },
                      })
                    );
                  }
                }
              } else {
                navDirectionYRef.current = 0;
                navStartYTimeRef.current = 0;
              }

              // Horizontal navigation in menu (for cycling settings/themes)
              if (currentDirX !== 0) {
                if (navDirectionRef.current !== currentDirX) {
                  navDirectionRef.current = currentDirX;
                  navStartTimeRef.current = now;
                  lastNavTimeRef.current = now;
                  window.dispatchEvent(
                    new CustomEvent("omnis:menu-nav", {
                      detail: { direction: currentDirX === 1 ? "right" : "left" },
                    })
                  );
                } else {
                  const holdDuration = now - navStartTimeRef.current;
                  const INITIAL_HOLD_DELAY = 380;
                  const REPEAT_INTERVAL = 170;
                  if (holdDuration >= INITIAL_HOLD_DELAY && now - lastNavTimeRef.current >= REPEAT_INTERVAL) {
                    lastNavTimeRef.current = now;
                    window.dispatchEvent(
                      new CustomEvent("omnis:menu-nav", {
                        detail: { direction: currentDirX === 1 ? "right" : "left" },
                      })
                    );
                  }
                }
              } else {
                navDirectionRef.current = 0;
                navStartTimeRef.current = 0;
              }
            } else if (homeFocusZoneRef.current === "recent") {
              // --- B2. "CONTINUE PLAYING" ROW IS FOCUSED ---
              if (currentDirY !== 0) {
                if (navDirectionYRef.current !== currentDirY) {
                  soundEffects.playNav();
                  setHomeFocusZone(currentDirY === -1 ? "topbar" : "carousel");
                  navDirectionYRef.current = currentDirY;
                  navStartYTimeRef.current = now;
                }
              } else {
                navDirectionYRef.current = 0;
                navStartYTimeRef.current = 0;
              }
              if (currentDirX !== 0) {
                const isNewPress = navDirectionRef.current !== currentDirX;
                const isRepeat =
                  !isNewPress && now - navStartTimeRef.current >= 380 && now - lastNavTimeRef.current >= 170;
                if (isNewPress) {
                  navDirectionRef.current = currentDirX;
                  navStartTimeRef.current = now;
                }
                if (isNewPress || isRepeat) {
                  lastNavTimeRef.current = now;
                  dispatchRecent("nav", { direction: currentDirX === 1 ? "right" : "left" });
                }
              } else {
                navDirectionRef.current = 0;
                navStartTimeRef.current = 0;
              }
            } else if (homeFocusZoneRef.current === "topbar") {
              // --- B. TOP BAR MENU BUTTON IS FOCUSED ---
              if (currentDirY === 1) {
                // D-Pad Down: back to the "continue playing" row, or the games
                soundEffects.playNav();
                setHomeFocusZone(hasRecentRowRef.current ? "recent" : "carousel");
                navDirectionYRef.current = 1;
                navStartYTimeRef.current = now;
              } else if (currentDirY === 0) {
                navDirectionYRef.current = 0;
                navStartYTimeRef.current = 0;
              }
              navDirectionRef.current = 0;
              navStartTimeRef.current = 0;
            } else {
              // --- C. GAMES SHELF / GRID IS FOCUSED ---
              const cols = gridColumnsRef.current;
              if (currentDirY !== 0) {
                const isNewPress = navDirectionYRef.current !== currentDirY;
                const holdDuration = now - navStartYTimeRef.current;
                const isRepeat = !isNewPress && holdDuration >= 380 && now - lastNavYTimeRef.current >= 170;
                if (isNewPress) {
                  navDirectionYRef.current = currentDirY;
                  navStartYTimeRef.current = now;
                }
                if (isNewPress || isRepeat) {
                  lastNavYTimeRef.current = now;
                  if (currentDirY === -1 && (cols <= 0 || focusedIndexRef.current < cols)) {
                    // Up from the shelf or the first grid row: recent row if shown, else the menu button
                    if (isNewPress) {
                      soundEffects.playNav();
                      setHomeFocusZone(hasRecentRowRef.current ? "recent" : "topbar");
                    }
                  } else if (cols > 0) {
                    stepGrid(currentDirY as 1 | -1);
                  }
                }
              } else {
                navDirectionYRef.current = 0;
                navStartYTimeRef.current = 0;
              }

              // Horizontal navigation in game carousel
              if (currentDirX !== 0) {
                if (navDirectionRef.current !== currentDirX) {
                  navDirectionRef.current = currentDirX;
                  navStartTimeRef.current = now;
                  lastNavTimeRef.current = now;
                  stepCarousel(currentDirX);
                } else {
                  const holdDuration = now - navStartTimeRef.current;
                  const INITIAL_HOLD_DELAY = 380;
                  const REPEAT_INTERVAL = 170;

                  if (holdDuration >= INITIAL_HOLD_DELAY && now - lastNavTimeRef.current >= REPEAT_INTERVAL) {
                    lastNavTimeRef.current = now;
                    stepCarousel(currentDirX);
                  }
                }
              } else {
                navDirectionRef.current = 0;
                navStartTimeRef.current = 0;
              }
            }
          }
        }

        // --- 2. ACTION BUTTONS (Strict Edge-Triggered: fires exactly once per press) ---
        const isEdgeA = isEdge(0);
        const isEdgeB = isEdge(1);
        const isEdgeX = isEdge(2);
        const isEdgeY = isEdge(3);
        const isEdgeLB = isEdge(4);
        const isEdgeRB = isEdge(5);
        const isEdgeRightStick = isEdge(11);
        const isEdgeSelect = isEdge(8);
        const isEdgeStart = isEdge(9);
        const isEdgeGuide = isEdge(16) || isEdge(17);

        if (isFullscreenRef.current) {
          if (isEdgeA) {
            if (showFullscreenDetailsRef.current) {
              window.dispatchEvent(new CustomEvent("omnis:details-action-a"));
            } else if (isMenuOpenRef.current) {
              window.dispatchEvent(new CustomEvent("omnis:menu-action-a"));
            } else if (homeFocusZoneRef.current === "topbar") {
              soundEffects.playSelect();
              setIsMenuOpen(true);
            } else if (homeFocusZoneRef.current === "recent") {
              dispatchRecent("action", { action: "launch" });
            } else {
              const current = filteredGamesRef.current[focusedIndexRef.current];
              if (current) {
                soundEffects.playSelect();
                handleLaunchRef.current(current.id);
              }
            }
          } else if (isEdgeB) {
            if (showFullscreenDetailsRef.current) {
              if (!interceptBack("details")) {
                soundEffects.playSelect();
                setShowFullscreenDetails(false);
              }
            } else if (isMenuOpenRef.current) {
              if (!interceptBack("menu")) {
                soundEffects.playSelect();
                setIsMenuOpen(false);
              }
            } else if (homeFocusZoneRef.current === "topbar" || homeFocusZoneRef.current === "recent") {
              soundEffects.playNav();
              setHomeFocusZone("carousel");
            }
            // In Fullscreen home screen, B does NOT exit to desktop!
          } else if (isEdgeX) {
            if (
              !isMenuOpenRef.current &&
              !showFullscreenDetailsRef.current &&
              homeFocusZoneRef.current === "recent"
            ) {
              dispatchRecent("action", { action: "details" });
            } else if (!isMenuOpenRef.current && filteredGamesRef.current.length > 0) {
              soundEffects.playSelect();
              setShowFullscreenDetails((prev) => !prev);
            }
          } else if (isEdgeY) {
            if (!isMenuOpenRef.current) {
              soundEffects.playSelect();
              setShowVirtualKeyboardRef.current(true);
            }
          } else if (isEdgeLB) {
            if (!showFullscreenDetailsRef.current && !isMenuOpenRef.current) {
              soundEffects.playNav();
              cycleFilterRef.current(-1, () => setFocusedIndex(0));
            }
          } else if (isEdgeRB) {
            if (!showFullscreenDetailsRef.current && !isMenuOpenRef.current) {
              soundEffects.playNav();
              cycleFilterRef.current(1, () => setFocusedIndex(0));
            }
          } else if (isEdgeRightStick) {
            // Right stick click switches between shelf and grid view
            if (!showFullscreenDetailsRef.current && !isMenuOpenRef.current) {
              window.dispatchEvent(new CustomEvent("omnis:toggle-layout"));
            }
          } else if (isEdgeSelect || isEdgeStart) {
            // SELECT or START toggles the Playnite-style Fullscreen Menu!
            // Prevents any single-button accidental desktop exit!
            if (!showFullscreenDetailsRef.current) {
              soundEffects.playSelect();
              setIsMenuOpen((prev) => !prev);
            }
          }
        } else {
          // In standard Desktop window: Start or Guide button enters Fullscreen
          if (isEdgeStart || isEdgeGuide) {
            soundEffects.playSelect();
            toggleFullscreenRef.current();
          }
        }

        // Record current button states for next frame's edge detection
        const nextPrev: boolean[] = [];
        for (let i = 0; i < b.length; i++) {
          nextPrev[i] = isDown(i);
        }
        prevButtonsRef.current = nextPrev;
      } else {
        setGamepadConnected((prev) => {
          if (prev) {
            setGamepadName("");
            return false;
          }
          return prev;
        });
        prevButtonsRef.current = [];
        navDirectionRef.current = 0;
      }

      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [isSuspended]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delegate key events if Virtual Keyboard modal is open or during active game suspension
      if (showVirtualKeyboard || isSuspended) return;

      if (e.key === "F11") {
        e.preventDefault();
        if (!isFullscreen) {
          toggleFullscreen();
        }
        return;
      }

      if (isFullscreen) {
        if (showFullscreenDetails) {
          if (e.key === "Escape") {
            if (!interceptBack("details")) {
              soundEffects.playSelect();
              setShowFullscreenDetails(false);
            }
          } else if (e.key === "Enter") {
            window.dispatchEvent(new CustomEvent("omnis:details-action-a"));
          } else if (e.key === "ArrowLeft") {
            window.dispatchEvent(
              new CustomEvent("omnis:details-nav", { detail: { direction: "left" } })
            );
          } else if (e.key === "ArrowRight") {
            window.dispatchEvent(
              new CustomEvent("omnis:details-nav", { detail: { direction: "right" } })
            );
          } else if (e.key === "ArrowUp") {
            window.dispatchEvent(
              new CustomEvent("omnis:details-nav", { detail: { direction: "up" } })
            );
          } else if (e.key === "ArrowDown") {
            window.dispatchEvent(
              new CustomEvent("omnis:details-nav", { detail: { direction: "down" } })
            );
          }
          // In Fullscreen Details page: never change game carousel!
          return;
        }

        // When Dropdown Menu is open:
        if (isMenuOpen) {
          if (e.key === "Escape") {
            if (!interceptBack("menu")) {
              soundEffects.playSelect();
              setIsMenuOpen(false);
            }
          } else if (e.key === "Enter") {
            window.dispatchEvent(new CustomEvent("omnis:menu-action-a"));
          } else if (e.key === "ArrowUp") {
            window.dispatchEvent(
              new CustomEvent("omnis:menu-nav", { detail: { direction: "up" } })
            );
          } else if (e.key === "ArrowDown") {
            window.dispatchEvent(
              new CustomEvent("omnis:menu-nav", { detail: { direction: "down" } })
            );
          } else if (e.key === "ArrowLeft") {
            window.dispatchEvent(
              new CustomEvent("omnis:menu-nav", { detail: { direction: "left" } })
            );
          } else if (e.key === "ArrowRight") {
            window.dispatchEvent(
              new CustomEvent("omnis:menu-nav", { detail: { direction: "right" } })
            );
          }
          return;
        }

        // When Topbar Menu Button is focused:
        if (homeFocusZone === "topbar") {
          if (e.key === "ArrowDown") {
            soundEffects.playNav();
            setHomeFocusZone(hasRecentRow ? "recent" : "carousel");
          } else if (e.key === "Enter") {
            soundEffects.playSelect();
            setIsMenuOpen(true);
          } else if (e.key === "Escape") {
            soundEffects.playNav();
            setHomeFocusZone("carousel");
          }
          return;
        }

        // When the "continue playing" row is focused (other keys fall through to the shortcuts below)
        if (homeFocusZone === "recent") {
          if (e.key === "ArrowUp") {
            soundEffects.playNav();
            setHomeFocusZone("topbar");
            return;
          }
          if (e.key === "ArrowDown" || e.key === "Escape") {
            soundEffects.playNav();
            setHomeFocusZone("carousel");
            return;
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            dispatchRecent("nav", { direction: e.key === "ArrowRight" ? "right" : "left" });
            return;
          }
          if (e.key === "Enter" || e.key.toLowerCase() === "x") {
            dispatchRecent("action", { action: "details" });
            return;
          }
        }

        // When in Games Shelf / Grid:
        const cols = fullscreenGridColumns;
        if (e.key === "ArrowUp") {
          if (cols > 0 && focusedIndex >= cols) {
            setFocusedIndex(gridStep(focusedIndex, filteredGames.length, cols, -1));
            soundEffects.playNav();
          } else {
            soundEffects.playNav();
            setHomeFocusZone(hasRecentRow ? "recent" : "topbar");
          }
        } else if (e.key === "ArrowDown" && cols > 0) {
          const next = gridStep(focusedIndex, filteredGames.length, cols, 1);
          if (next !== focusedIndex) {
            setFocusedIndex(next);
            soundEffects.playNav();
          }
        } else if (e.key === "ArrowLeft") {
          setFocusedIndex((prev) => {
            const next = Math.max(0, prev - 1);
            if (next !== prev) soundEffects.playNav();
            return next;
          });
        } else if (e.key === "ArrowRight") {
          setFocusedIndex((prev) => {
            const next = Math.min(filteredGames.length - 1, prev + 1);
            if (next !== prev) soundEffects.playNav();
            return next;
          });
        } else if (e.key === "Enter") {
          if (filteredGames.length > 0) {
            soundEffects.playSelect();
            setShowFullscreenDetails(true);
          }
        } else if (e.key.toLowerCase() === "m" || e.key === "F10") {
          soundEffects.playSelect();
          setIsMenuOpen((prev) => !prev);
        } else if (e.key.toLowerCase() === "x") {
          if (filteredGames.length > 0) {
            soundEffects.playSelect();
            setShowFullscreenDetails((prev) => !prev);
          }
        } else if (e.key.toLowerCase() === "t") {
          soundEffects.playSelect();
          setShowThemeModal(true);
        } else if (e.key.toLowerCase() === "y" || e.key.toLowerCase() === "s" || e.key === "/") {
          e.preventDefault();
          soundEffects.playSelect();
          setShowVirtualKeyboard(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isFullscreen,
    filteredGames,
    focusedIndex,
    showFullscreenDetails,
    homeFocusZone,
    isMenuOpen,
    selectedGame,
    showVirtualKeyboard,
    toggleFullscreen,
    handleLaunch,
    setShowThemeModal,
    setShowVirtualKeyboard,
    isSuspended,
    fullscreenGridColumns,
    hasRecentRow,
  ]);

  return {
    gamepadConnected,
    gamepadName,
    gamepadType,
    focusedIndex,
    setFocusedIndex,
    showFullscreenDetails,
    setShowFullscreenDetails,
    homeFocusZone,
    setHomeFocusZone,
    isMenuOpen,
    setIsMenuOpen,
  };
}
