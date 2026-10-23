import { useState, useEffect, useRef, RefObject } from "react";
import soundEffects from "../utils/soundEffects";
import { GameDto } from "../types";

interface UseGamepadNavigationProps {
  isBigPicture: boolean;
  toggleBigPicture: () => void;
  filteredGames: GameDto[];
  selectedGame: GameDto | null;
  showVirtualKeyboard: boolean;
  setShowVirtualKeyboard: (show: boolean) => void;
  setShowThemeModal: (show: boolean) => void;
  handleLaunch: (gameId: string) => void;
  cycleFilter: (direction: number, onCycle?: (nextFilter: string) => void) => void;
  carouselRef: RefObject<HTMLDivElement>;
  isSuspended?: boolean;
}

export function useGamepadNavigation({
  isBigPicture,
  toggleBigPicture,
  filteredGames,
  selectedGame,
  showVirtualKeyboard,
  setShowVirtualKeyboard,
  setShowThemeModal,
  handleLaunch,
  cycleFilter,
  carouselRef,
  isSuspended = false,
}: UseGamepadNavigationProps) {
  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false);
  const [gamepadName, setGamepadName] = useState<string>("Nessun Controller");
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [showFullscreenDetails, setShowFullscreenDetails] = useState<boolean>(false);

  // Mirrors of props and dynamic state in refs so the RAF polling loop never recreates
  const isBigPictureRef = useRef(isBigPicture);
  const toggleBigPictureRef = useRef(toggleBigPicture);
  const filteredGamesRef = useRef(filteredGames);
  const selectedGameRef = useRef(selectedGame);
  const showVirtualKeyboardRef = useRef(showVirtualKeyboard);
  const setShowVirtualKeyboardRef = useRef(setShowVirtualKeyboard);
  const setShowThemeModalRef = useRef(setShowThemeModal);
  const handleLaunchRef = useRef(handleLaunch);
  const cycleFilterRef = useRef(cycleFilter);
  const isSuspendedRef = useRef(isSuspended);

  const focusedIndexRef = useRef(focusedIndex);
  const showFullscreenDetailsRef = useRef(showFullscreenDetails);

  // Sync refs on each render
  isBigPictureRef.current = isBigPicture;
  toggleBigPictureRef.current = toggleBigPicture;
  filteredGamesRef.current = filteredGames;
  selectedGameRef.current = selectedGame;
  showVirtualKeyboardRef.current = showVirtualKeyboard;
  setShowVirtualKeyboardRef.current = setShowVirtualKeyboard;
  setShowThemeModalRef.current = setShowThemeModal;
  handleLaunchRef.current = handleLaunch;
  cycleFilterRef.current = cycleFilter;
  isSuspendedRef.current = isSuspended;
  focusedIndexRef.current = focusedIndex;
  showFullscreenDetailsRef.current = showFullscreenDetails;

  // Input timing & edge-triggering refs (persistent across renders)
  const awaitingNeutralStateRef = useRef<boolean>(false);
  const prevButtonsRef = useRef<boolean[]>([]);
  const navDirectionRef = useRef<number>(0); // -1 = left, 1 = right, 0 = neutral
  const navStartTimeRef = useRef<number>(0);
  const lastNavTimeRef = useRef<number>(0);

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
            setGamepadName(activeGamepad!.id.split("(")[0].trim() || "Controller Connesso");
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
          }
        }

        // When virtual keyboard is open, delegate gamepad controls exclusively to it
        if (showVirtualKeyboardRef.current) {
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

        // --- 1. D-PAD & STICK HORIZONTAL NAVIGATION (Smooth repeat with hold delay) ---
        const rawLeft = isDown(14) || (a[0] !== undefined && a[0] < -0.45);
        const rawRight = isDown(15) || (a[0] !== undefined && a[0] > 0.45);

        let currentDir = 0;
        if (rawLeft && !rawRight) currentDir = -1;
        else if (rawRight && !rawLeft) currentDir = 1;

        if (isBigPictureRef.current) {
          if (currentDir !== 0) {
            if (navDirectionRef.current !== currentDir) {
              // Direction pressed for the first time: immediate single step
              navDirectionRef.current = currentDir;
              navStartTimeRef.current = now;
              lastNavTimeRef.current = now;
              stepCarousel(currentDir);
            } else {
              // Continued hold in the same direction: wait initial hold delay before repeating
              const holdDuration = now - navStartTimeRef.current;
              const INITIAL_HOLD_DELAY = 380; // ms to wait before repeating
              const REPEAT_INTERVAL = 170; // ms between repeats

              if (holdDuration >= INITIAL_HOLD_DELAY && now - lastNavTimeRef.current >= REPEAT_INTERVAL) {
                lastNavTimeRef.current = now;
                stepCarousel(currentDir);
              }
            }
          } else {
            // Neutral state
            navDirectionRef.current = 0;
            navStartTimeRef.current = 0;
          }
        }

        // --- 2. ACTION BUTTONS (Strict Edge-Triggered: fires exactly once per press) ---
        const isEdgeA = isEdge(0);
        const isEdgeB = isEdge(1);
        const isEdgeX = isEdge(2);
        const isEdgeY = isEdge(3);
        const isEdgeLB = isEdge(4);
        const isEdgeRB = isEdge(5);
        const isEdgeSelect = isEdge(8);
        const isEdgeStart = isEdge(9);
        const isEdgeGuide = isEdge(16) || isEdge(17);

        if (isBigPictureRef.current) {
          if (isEdgeA) {
            const current =
              filteredGamesRef.current[focusedIndexRef.current] || selectedGameRef.current;
            if (current) {
              soundEffects.playSelect();
              handleLaunchRef.current(current.id);
            }
          } else if (isEdgeB) {
            soundEffects.playSelect();
            if (showFullscreenDetailsRef.current) {
              setShowFullscreenDetails(false);
            } else {
              toggleBigPictureRef.current();
            }
          } else if (isEdgeX) {
            soundEffects.playSelect();
            setShowFullscreenDetails((prev) => !prev);
          } else if (isEdgeY) {
            soundEffects.playSelect();
            setShowVirtualKeyboardRef.current(true);
          } else if (isEdgeLB) {
            soundEffects.playNav();
            cycleFilterRef.current(-1, () => setFocusedIndex(0));
          } else if (isEdgeRB) {
            soundEffects.playNav();
            cycleFilterRef.current(1, () => setFocusedIndex(0));
          } else if (isEdgeSelect || isEdgeStart) {
            soundEffects.playSelect();
            toggleBigPictureRef.current();
          }
        } else {
          // In standard Desktop window: Start or Guide button enters Big Picture
          if (isEdgeStart || isEdgeGuide) {
            soundEffects.playSelect();
            toggleBigPictureRef.current();
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
            setGamepadName("Nessun Controller");
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
        toggleBigPicture();
        return;
      }

      if (isBigPicture) {
        if (e.key === "ArrowLeft") {
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
          soundEffects.playSelect();
          if (showFullscreenDetails) {
            const current = filteredGames[focusedIndex] || selectedGame;
            if (current) handleLaunch(current.id);
          } else {
            setShowFullscreenDetails(true);
          }
        } else if (e.key === "Escape") {
          soundEffects.playSelect();
          if (showFullscreenDetails) setShowFullscreenDetails(false);
          else toggleBigPicture();
        } else if (e.key.toLowerCase() === "x") {
          soundEffects.playSelect();
          setShowFullscreenDetails((prev) => !prev);
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
    isBigPicture,
    filteredGames,
    focusedIndex,
    showFullscreenDetails,
    selectedGame,
    showVirtualKeyboard,
    toggleBigPicture,
    handleLaunch,
    setShowThemeModal,
    setShowVirtualKeyboard,
    isSuspended,
  ]);

  // Auto-scroll focused card into view in carousel
  useEffect(() => {
    if (isBigPicture && carouselRef.current) {
      const activeCard = carouselRef.current.children[focusedIndex] as HTMLElement;
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [focusedIndex, isBigPicture, carouselRef]);

  return {
    gamepadConnected,
    gamepadName,
    focusedIndex,
    setFocusedIndex,
    showFullscreenDetails,
    setShowFullscreenDetails,
  };
}
