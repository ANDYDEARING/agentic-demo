import { Engine, Scene } from "@babylonjs/core";
import { createStartScene } from "./scenes/StartScene";
import { createTitleScene } from "./scenes/TitleScene";
import { createLoadoutScene } from "./scenes/LoadoutScene";
import { createBattleScene } from "./scenes/BattleScene";
import type { Loadout, SceneName, GameMode } from "./types";

// Re-export for backwards compatibility
export type { SceneName } from "./types";

// ============================================
// GLOBAL AUDIO MANAGEMENT
// ============================================
// Handles pausing audio when app is backgrounded/locked

/** Currently playing music element (set by scenes) */
let activeMusic: HTMLAudioElement | null = null;
let musicWasPaused = false;

/** Register the currently playing music (call from scenes when music starts) */
export function registerActiveMusic(audio: HTMLAudioElement | null): void {
  activeMusic = audio;
  musicWasPaused = false;
}

/** Handle visibility changes to pause music */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // Page is hidden (backgrounded, locked, tab switched)
    if (activeMusic && !activeMusic.paused) {
      musicWasPaused = true;
      activeMusic.pause();
    }
  } else {
    // Page is visible again - try to resume (may be blocked by iOS)
    if (activeMusic && musicWasPaused) {
      activeMusic.play().catch(() => {
        // Autoplay blocked - will resume on next user interaction
      });
    }
  }
});

/** Resume music on user interaction (required for iOS after visibility change) */
function resumeMusicOnInteraction() {
  if (activeMusic && musicWasPaused && activeMusic.paused) {
    activeMusic.play().then(() => {
      musicWasPaused = false;
    }).catch(() => {
      // Still blocked - will try again on next interaction
    });
  }
}

// Listen for user interactions to resume music (iOS requirement)
document.addEventListener("touchstart", resumeMusicOnInteraction, { passive: true });
document.addEventListener("click", resumeMusicOnInteraction);

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true, {
  // Reduce shader complexity and improve stability
  disableWebGL2Support: false,
  stencil: true,
  preserveDrawingBuffer: false,
});

// Handle WebGL context loss (happens when tab is idle for a while)
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  console.warn("WebGL context lost. Waiting for restoration...");
});

canvas.addEventListener("webglcontextrestored", () => {
  console.log("WebGL context restored. Reinitializing scene...");
  // Force re-creation of current scene to rebuild shaders
  if (currentScene) {
    const sceneName = currentSceneName;
    currentScene.dispose();
    navigateTo(sceneName);
  }
});

// Catch unhandled shader/WebGL errors that might not trigger context loss
window.addEventListener("unhandledrejection", (event) => {
  const reason = String(event.reason || "");
  if (reason.includes("rgbdDecode") || reason.includes("maximum retries") || reason.includes("shader")) {
    console.warn("Shader compilation error detected, attempting recovery:", reason);
    event.preventDefault();
    // Attempt to recover by recreating the current scene
    if (currentScene && !currentScene.isDisposed) {
      const sceneName = currentSceneName;
      currentScene.dispose();
      navigateTo(sceneName);
    }
  }
});

let currentScene: Scene;
let currentSceneName: SceneName = "start";
let currentLoadout: Loadout | null = null;
let currentGameMode: GameMode = "local-pvp";
let currentHumanTeam: "player1" | "player2" = "player1";

/** Set game mode before navigating to loadout */
export function setGameMode(mode: GameMode, humanTeam?: "player1" | "player2"): void {
  currentGameMode = mode;
  if (humanTeam) {
    currentHumanTeam = humanTeam;
  } else if (mode === "local-pve") {
    // Player 1 is always human in PvE, Player 2 is computer
    currentHumanTeam = "player1";
  }
}

/** Get current game mode */
export function getGameMode(): { mode: GameMode; humanTeam: "player1" | "player2" } {
  return { mode: currentGameMode, humanTeam: currentHumanTeam };
}

export function navigateTo(sceneName: SceneName): void {
  if (currentScene) {
    currentScene.dispose();
  }
  currentSceneName = sceneName;

  switch (sceneName) {
    case "start":
      currentScene = createStartScene(engine, canvas, navigateTo);
      break;
    case "title":
      currentScene = createTitleScene(engine, canvas, navigateTo);
      break;
    case "loadout":
      currentScene = createLoadoutScene(engine, canvas, (loadout: Loadout) => {
        currentLoadout = loadout;
        navigateTo("battle");
      }, navigateTo);
      break;
    case "battle":
      currentScene = createBattleScene(engine, canvas, currentLoadout);
      break;
  }
}

// Helper to switch back to loadout from battle
export function switchToLoadout(): void {
  navigateTo("loadout");
}

// Start with click-to-start screen
navigateTo("start");

engine.runRenderLoop(() => {
  currentScene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
