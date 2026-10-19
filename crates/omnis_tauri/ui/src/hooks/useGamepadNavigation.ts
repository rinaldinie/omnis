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
  const awaitingNeutralStateRef = useRef<boolean>(false);

  // Gamepad Polling Loop with Suspension & Ghost Input Shield (Requirements C3 & C4)
  useEffect(() => {
    if (isSuspended) {
      awaitingNeutralStateRef.current = true;
      return;
    }
    let animId: number;
    let lastButtonTime = 0;

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
        if (!gamepadConnected) {
          setGamepadConnected(true);
          setGamepadName(activeGamepad.id.split("(")[0].trim() || "Controller Connesso");
        }

        // C3: Ghost Input Shield upon window restore
        // Ignore ALL gamepad inputs until every button is released at least once
        if (awaitingNeutralStateRef.current) {
          const anyButtonPressed = activeGamepad.buttons.some(
            (btn) => btn && (btn.pressed || btn.value > 0.15)
          );
          if (anyButtonPressed) {
            animId = requestAnimationFrame(pollGamepad);
            return;
          } else {
            // All buttons released! Deactivate shield and reset timing
            awaitingNeutralStateRef.current = false;
            lastButtonTime = Date.now();
          }
        }

        // When virtual keyboard is open, delegate gamepad controls exclusively to it
        if (showVirtualKeyboard) {
          animId = requestAnimationFrame(pollGamepad);
          return;
        }

        const now = Date.now();
        if (now - lastButtonTime > 190) {
          const b = activeGamepad.buttons;
          const a = activeGamepad.axes;

          const isLeft = b[14]?.pressed || (a[0] && a[0] < -0.45);
          const isRight = b[15]?.pressed || (a[0] && a[0] > 0.45);

          const btnA = b[0]?.pressed;
          const btnB = b[1]?.pressed;
          const btnX = b[2]?.pressed;
          const btnY = b[3]?.pressed;
          const btnLB = b[4]?.pressed;
          const btnRB = b[5]?.pressed;
          const btnSelect = b[8]?.pressed;
          const btnStart = b[9]?.pressed;

          if (isBigPicture) {
            if (isLeft) {
              setFocusedIndex((prev) => {
                const next = Math.max(0, prev - 1);
                if (next !== prev) soundEffects.playNav();
                return next;
              });
              lastButtonTime = now;
            } else if (isRight) {
              setFocusedIndex((prev) => {
                const next = Math.min(filteredGames.length - 1, prev + 1);
                if (next !== prev) soundEffects.playNav();
                return next;
              });
              lastButtonTime = now;
            }

            if (btnA) {
              const current = filteredGames[focusedIndex] || selectedGame;
              if (current) handleLaunch(current.id);
              lastButtonTime = now + 400;
            } else if (btnB) {
              soundEffects.playSelect();
              if (showFullscreenDetails) {
                setShowFullscreenDetails(false);
              } else {
                toggleBigPicture();
              }
              lastButtonTime = now + 250;
            } else if (btnX) {
              soundEffects.playSelect();
              setShowFullscreenDetails((prev) => !prev);
              lastButtonTime = now + 250;
            } else if (btnY) {
              soundEffects.playSelect();
              setShowVirtualKeyboard(true);
              lastButtonTime = now + 250;
            } else if (btnLB) {
              soundEffects.playNav();
              cycleFilter(-1, () => setFocusedIndex(0));
              lastButtonTime = now + 200;
            } else if (btnRB) {
              soundEffects.playNav();
              cycleFilter(1, () => setFocusedIndex(0));
              lastButtonTime = now + 200;
            } else if (btnSelect || btnStart) {
              soundEffects.playSelect();
              toggleBigPicture();
              lastButtonTime = now + 400;
            }
          } else {
            if (btnStart || b[16]?.pressed) {
              soundEffects.playSelect();
              toggleBigPicture();
              lastButtonTime = now + 400;
            }
          }
        }
      } else {
        if (gamepadConnected) {
          setGamepadConnected(false);
          setGamepadName("Nessun Controller");
        }
      }

      animId = requestAnimationFrame(pollGamepad);
    };

    animId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animId);
  }, [
    isBigPicture,
    filteredGames,
    focusedIndex,
    showFullscreenDetails,
    gamepadConnected,
    selectedGame,
    showVirtualKeyboard,
    toggleBigPicture,
    handleLaunch,
    cycleFilter,
    setShowVirtualKeyboard,
    isSuspended,
  ]);

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
