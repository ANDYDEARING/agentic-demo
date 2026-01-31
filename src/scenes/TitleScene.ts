import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Color4,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock, StackPanel, Rectangle, Control, Button } from "@babylonjs/gui";
import type { SceneName, GameMode } from "../types";
import { setGameMode } from "../main";
import { createMusicPlayer, createResponsiveOverlay, type MusicPlayer } from "../utils";
import {
  SCENE_BACKGROUNDS,
  TITLE_HEAT_COLORS,
  TITLE_TEXT_COLORS,
  TITLE_FADE_IN_DURATION,
  TITLE_FADE_IN_DELAY,
  BREAKPOINT_LANDSCAPE_PHONE_HEIGHT,
  BREAKPOINT_TABLET_MIN,
  BREAKPOINT_DESKTOP_MIN,
} from "../config";
import { MUSIC, AUDIO_VOLUMES, LOOP_BUFFER_TIME, DEBUG_SKIP_OFFSET } from "../config";
import { getHowToContent, getNerdContent } from "../config/overlayContent";

// Module-level state (persists across orientation reloads)
let titleMusic: MusicPlayer | null = null;
let hasFadedIn = false;
let wasOverlayOpen = false;

// Ember particle for floating fire effect
interface Ember {
  element: Rectangle;
  x: number;
  y: number;
  speed: number;
  drift: number;
  driftSpeed: number;
  size: number;
  baseAlpha: number;
}

export function createTitleScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  navigateTo: (scene: SceneName) => void
): Scene {
  const scene = new Scene(engine);

  // Use centralized scene background color (deep black with subtle warm undertone)
  const bg = SCENE_BACKGROUNDS.title;
  scene.clearColor = new Color4(bg.r, bg.g, bg.b, bg.a);

  // Background music - using centralized audio config (persists across orientation reloads)
  if (!titleMusic) {
    titleMusic = createMusicPlayer(MUSIC.title, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
    titleMusic.play();
  }

  // Press S to skip to near end (to test loop behavior)
  const skipHandler = (e: KeyboardEvent) => {
    if (e.key === "s" || e.key === "S") {
      if (titleMusic?.duration) {
        titleMusic.currentTime = Math.max(0, titleMusic.duration - DEBUG_SKIP_OFFSET);
      }
    }
  };
  window.addEventListener("keydown", skipHandler);

  // Track if this is an orientation reload (set by resize handler before navigating)
  let isOrientationReload = false;

  scene.onDisposeObservable.add(() => {
    window.removeEventListener("keydown", skipHandler);
    // Only stop music and reset state when actually leaving the title screen (not orientation reloads)
    if (!isOrientationReload && titleMusic) {
      titleMusic.dispose();
      titleMusic = null;
      hasFadedIn = false;
      wasOverlayOpen = false;
    }
  });

  new FreeCamera("camera", Vector3.Zero(), scene);

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // === RESPONSIVE SIZING ===
  // Breakpoints: mobile (<600), tablet (600-1024), desktop (>1024)
  // Also detect landscape phones (short height) to use compact scaling
  const screenWidth = engine.getRenderWidth();
  const screenHeight = engine.getRenderHeight();

  // Listen for orientation/resize changes and reload scene
  const initialOrientation = screenWidth > screenHeight ? "landscape" : "portrait";
  let reloadPending = false;
  // Reference to overlay for saving state before reload (set later)
  let overlayRef: { isVisible: () => boolean } | null = null;

  const handleResize = () => {
    if (reloadPending) return;

    const newWidth = engine.getRenderWidth();
    const newHeight = engine.getRenderHeight();
    const newOrientation = newWidth > newHeight ? "landscape" : "portrait";

    const orientationChanged = newOrientation !== initialOrientation;
    const significantResize = Math.abs(newWidth - screenWidth) > 100 || Math.abs(newHeight - screenHeight) > 100;

    if (orientationChanged || significantResize) {
      reloadPending = true;
      isOrientationReload = true;
      // Save overlay state before reload
      wasOverlayOpen = overlayRef?.isVisible() ?? false;
      setTimeout(() => {
        navigateTo("title");
      }, 100);
    }
  };

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);

  scene.onDisposeObservable.add(() => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
  });

  const isLandscapePhone = screenHeight < BREAKPOINT_LANDSCAPE_PHONE_HEIGHT && screenWidth < BREAKPOINT_DESKTOP_MIN;
  const isTablet = !isLandscapePhone && screenWidth >= BREAKPOINT_TABLET_MIN && screenWidth < BREAKPOINT_DESKTOP_MIN;
  const isDesktop = screenWidth >= BREAKPOINT_DESKTOP_MIN;

  // Scale factors based on screen size (mobile = 1.0 baseline)
  // Titles scale more aggressively, buttons stay modest
  // Landscape phones: bigger title, smaller buttons to fit
  const titleScale = isDesktop ? 2.2 : isTablet ? 1.7 : isLandscapePhone ? 1.0 : 1.0;
  const buttonScale = isDesktop ? 1.3 : isTablet ? 1.15 : isLandscapePhone ? 0.7 : 1.0;
  const buttonWidthPercent = isDesktop ? "30%" : isTablet ? "45%" : isLandscapePhone ? "30%" : "70%";
  const dividerWidthPercent = isDesktop ? "30%" : isTablet ? "45%" : isLandscapePhone ? "40%" : "70%";

  // Font sizes
  const subtitleFontSize = Math.round(24 * titleScale);
  const mainTitleFontSize = Math.round(64 * titleScale);
  const buttonFontSize = Math.round(18 * buttonScale);

  // Heights
  const subtitleHeight = `${Math.round(35 * titleScale)}px`;
  const mainTitleHeight = `${Math.round(75 * titleScale)}px`;
  const buttonHeight = `${Math.round(50 * buttonScale)}px`;
  const spacerHeight = `${Math.round(40 * titleScale)}px`;
  const buttonSpacerHeight = `${Math.round(15 * buttonScale)}px`;

  // === BACKGROUND: Rising heat glow from below ===

  // Base gradient - warm glow rising from bottom (full height, gradient handles fade)
  const baseGlow = new Rectangle();
  baseGlow.width = "100%";
  baseGlow.height = "100%";
  baseGlow.thickness = 0;
  baseGlow.background = "linear-gradient(to top, rgba(139, 35, 0, 0.35) 0%, rgba(80, 20, 0, 0.15) 30%, rgba(30, 8, 0, 0.05) 50%, transparent 70%)";
  gui.addControl(baseGlow);

  // Pulsing heat layers - using centralized color palette
  const heatLayers: Rectangle[] = [];
  const heatColors = TITLE_HEAT_COLORS;

  for (let i = 0; i < 3; i++) {
    const heat = new Rectangle();
    heat.width = "120%";
    heat.height = "50%";
    heat.thickness = 0;
    heat.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    gui.addControl(heat);
    heatLayers.push(heat);
  }

  // === FLOATING EMBERS ===
  // (added after title panel so they appear on top)
  const embers: Ember[] = [];

  // Mode buttons array (populated later, used in animation)
  const modeButtons: Button[] = [];

  // === ANIMATION LOOP ===
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    time += engine.getDeltaTime() / 1000;

    // Animate heat layers
    for (let i = 0; i < heatLayers.length; i++) {
      const layer = heatLayers[i];
      const color = heatColors[i];
      const pulse = 0.08 + 0.04 * Math.sin(time * (0.8 + i * 0.3) + i);
      const flicker = 1 + 0.1 * Math.sin(time * 3 + i * 2);

      const r = Math.floor(color.r * flicker);
      const g = Math.floor(color.g * flicker);
      const b = Math.floor(color.b * flicker);

      layer.background = `linear-gradient(to top, rgba(${r}, ${g}, ${b}, ${pulse}) 0%, transparent 100%)`;
    }

    // Animate embers
    for (const ember of embers) {
      ember.y -= ember.speed;
      ember.drift += ember.driftSpeed * 0.01;

      // Reset when off screen
      if (ember.y < -5) {
        ember.y = 100 + Math.random() * 10;
        ember.x = Math.random() * 100;
      }

      const xOffset = Math.sin(ember.drift) * 3;
      ember.element.left = `${ember.x + xOffset}%`;
      ember.element.top = `${ember.y}%`;

      // Brighter at bottom (high y), fading as they rise (low y)
      const heightFade = Math.max(0, Math.min(1, ember.y / 100));
      const flicker = 0.7 + 0.3 * Math.sin(time * 6 + ember.drift);
      const alpha = ember.baseAlpha * heightFade * flicker;

      // Brighter yellow-orange at bottom, cooling to deep orange/red as rises
      const r = 255;
      const g = Math.floor(100 + heightFade * 150); // More yellow at bottom
      const b = Math.floor(heightFade * 50);

      ember.element.background = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ember.element.shadowColor = `rgba(255, ${g}, 30, ${alpha})`;
      ember.element.shadowBlur = ember.size * 3;
    }

    // Fade-in animation
    if (fadeInStarted && fadeInAlpha < 1) {
      fadeInAlpha = Math.min(1, fadeInAlpha + engine.getDeltaTime() / 1000 / fadeInDuration);
      const ease = fadeInAlpha * fadeInAlpha * (3 - 2 * fadeInAlpha); // Smoothstep

      // Update title colors with fade
      titleLine1.color = `rgba(232, 196, 160, ${ease})`;
      titleLine2.color = `rgba(255, 179, 102, ${ease})`;
      divider.background = `rgba(255, 150, 80, ${ease * 0.4})`;
      versionLabel.color = `rgba(180, 180, 180, ${ease})`;
      // Fade in mode buttons
      for (const btn of modeButtons) {
        btn.alpha = ease;
      }
      // Mark fade-in as complete for future reloads
      if (fadeInAlpha >= 1) {
        hasFadedIn = true;
      }
    }

    // Subtle title glow pulse (only after fade-in started)
    if (fadeInAlpha > 0) {
      const glowIntensity = 0.6 + 0.2 * Math.sin(time * 0.5);
      titleLine1.shadowColor = `rgba(255, 100, 20, ${glowIntensity * 0.5 * fadeInAlpha})`;
      titleLine2.shadowColor = `rgba(255, 80, 0, ${glowIntensity * 0.7 * fadeInAlpha})`;
    }
  });

  // === TITLE TEXT ===
  const panel = new StackPanel();
  panel.width = "100%";
  panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  panel.top = isLandscapePhone ? "0%" : "-5%";
  gui.addControl(panel);

  // Fade-in state - using centralized timing constants
  // Skip fade-in if we've already done it (orientation reload)
  let fadeInStarted = hasFadedIn;
  let fadeInAlpha = hasFadedIn ? 1 : 0;
  const fadeInDuration = TITLE_FADE_IN_DURATION;
  const fadeInDelay = TITLE_FADE_IN_DELAY;

  // Subtitle line - smaller, above main title
  const titleLine1 = new TextBlock();
  titleLine1.text = "T H E   S U N S E T   G A M B I T";
  titleLine1.color = hasFadedIn ? "rgba(232, 196, 160, 1)" : "rgba(232, 196, 160, 0)";
  titleLine1.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
  titleLine1.fontWeight = "400";
  titleLine1.fontSize = subtitleFontSize;
  titleLine1.height = subtitleHeight;
  titleLine1.shadowColor = hasFadedIn ? "rgba(255, 100, 20, 0.3)" : "rgba(255, 100, 20, 0)";
  titleLine1.shadowBlur = 15 * titleScale;
  titleLine1.shadowOffsetY = 1 * titleScale;
  panel.addControl(titleLine1);

  // Main title - BIG, fills width on mobile
  const titleLine2 = new TextBlock();
  titleLine2.text = "C R U C I B L E";
  titleLine2.color = hasFadedIn ? "rgba(255, 179, 102, 1)" : "rgba(255, 179, 102, 0)";
  titleLine2.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
  titleLine2.fontWeight = "400";
  titleLine2.fontSize = mainTitleFontSize;
  titleLine2.height = mainTitleHeight;
  titleLine2.shadowColor = hasFadedIn ? "rgba(255, 80, 0, 0.5)" : "rgba(255, 80, 0, 0)";
  titleLine2.shadowBlur = 25 * titleScale;
  titleLine2.shadowOffsetY = 3 * titleScale;
  panel.addControl(titleLine2);

  // Thin decorative line
  const divider = new Rectangle();
  divider.width = dividerWidthPercent;
  divider.height = `${Math.max(2, Math.round(2 * titleScale))}px`;
  divider.thickness = 0;
  divider.background = hasFadedIn ? "rgba(255, 150, 80, 0.4)" : "rgba(255, 150, 80, 0)";
  panel.addControl(divider);

  // Version label
  const versionLabel = new TextBlock();
  versionLabel.text = "[ DEMO - Early - NOT BALANCED ] v0.2";
  versionLabel.color = hasFadedIn ? "rgba(180, 180, 180, 1)" : "rgba(180, 180, 180, 0)";
  versionLabel.fontFamily = "'Exo 2', sans-serif";
  versionLabel.fontSize = 11;
  versionLabel.height = "30px";
  versionLabel.paddingTop = "14px";
  panel.addControl(versionLabel);

  // Spacer
  const spacer = new TextBlock();
  spacer.height = spacerHeight;
  spacer.text = "";
  panel.addControl(spacer);

  // Start fade-in after fonts load (including button font size)
  Promise.all([
    document.fonts.load(`${subtitleFontSize}px 'Bebas Neue'`),
    document.fonts.load(`${mainTitleFontSize}px 'Bebas Neue'`),
    document.fonts.load(`${buttonFontSize}px 'Bebas Neue'`),
  ]).then(() => {
    // Force buttons to recalculate layout now that fonts are loaded
    for (const btn of modeButtons) {
      btn.markAsDirty();
      if (btn.textBlock) {
        btn.textBlock.markAsDirty();
      }
    }
    setTimeout(() => {
      fadeInStarted = true;
    }, fadeInDelay * 1000);
  });

  // === MODE SELECTION BUTTONS ===
  // Helper to create a styled button
  function createModeButton(text: string, mode: GameMode): Button {
    const button = Button.CreateSimpleButton(`mode_${mode}`, text);
    button.width = buttonWidthPercent;
    button.height = buttonHeight;
    button.background = "rgba(40, 20, 15, 0.6)";
    button.cornerRadius = Math.round(4 * buttonScale);
    button.thickness = 1;
    button.color = TITLE_TEXT_COLORS.buttonText;
    button.hoverCursor = "pointer";
    button.alpha = hasFadedIn ? 1 : 0; // Start visible if already faded in

    // Style the text block
    if (button.textBlock) {
      button.textBlock.color = TITLE_TEXT_COLORS.buttonText;
      button.textBlock.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
      button.textBlock.fontSize = buttonFontSize;
      button.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    }

    // Hover effects
    button.onPointerEnterObservable.add(() => {
      button.background = "rgba(100, 50, 25, 0.8)";
      if (button.textBlock) {
        button.textBlock.color = TITLE_TEXT_COLORS.buttonHover;
      }
      button.shadowColor = "rgba(255, 120, 50, 0.6)";
      button.shadowBlur = 15;
    });
    button.onPointerOutObservable.add(() => {
      button.background = "rgba(40, 20, 15, 0.6)";
      if (button.textBlock) {
        button.textBlock.color = TITLE_TEXT_COLORS.buttonText;
      }
      button.shadowColor = "transparent";
      button.shadowBlur = 0;
    });

    button.onPointerClickObservable.add(() => {
      setGameMode(mode);
      navigateTo("loadout");
    });

    return button;
  }

  // Play button (replaces separate PvP/PvE - AI toggle moved to loadout)
  const playButton = createModeButton("P L A Y", "local-pvp");
  panel.addControl(playButton);
  modeButtons.push(playButton);

  // Small spacer before how-to button
  const buttonSpacer2 = new TextBlock();
  buttonSpacer2.height = buttonSpacerHeight;
  buttonSpacer2.text = "";
  panel.addControl(buttonSpacer2);

  // Quick How To button (different style - doesn't navigate)
  const howToButton = Button.CreateSimpleButton("howTo", "Q U I C K   H O W   T O");
  howToButton.width = buttonWidthPercent;
  howToButton.height = buttonHeight;
  howToButton.background = "rgba(30, 30, 40, 0.6)";
  howToButton.cornerRadius = Math.round(4 * buttonScale);
  howToButton.thickness = 1;
  howToButton.color = "#aaaacc";
  howToButton.hoverCursor = "pointer";
  howToButton.alpha = hasFadedIn ? 1 : 0;

  if (howToButton.textBlock) {
    howToButton.textBlock.color = "#aaaacc";
    howToButton.textBlock.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
    howToButton.textBlock.fontSize = buttonFontSize;
    howToButton.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  }

  howToButton.onPointerEnterObservable.add(() => {
    howToButton.background = "rgba(60, 60, 80, 0.8)";
    if (howToButton.textBlock) {
      howToButton.textBlock.color = "#ffffff";
    }
    howToButton.shadowColor = "rgba(150, 150, 255, 0.4)";
    howToButton.shadowBlur = 15;
  });
  howToButton.onPointerOutObservable.add(() => {
    howToButton.background = "rgba(30, 30, 40, 0.6)";
    if (howToButton.textBlock) {
      howToButton.textBlock.color = "#aaaacc";
    }
    howToButton.shadowColor = "transparent";
    howToButton.shadowBlur = 0;
  });

  howToButton.onPointerClickObservable.add(() => {
    howToOverlay.show();
  });

  panel.addControl(howToButton);
  modeButtons.push(howToButton);

  // === HOW TO OVERLAY ===
  const howToOverlay = createResponsiveOverlay(gui, {
    title: "Q U I C K   H O W   T O",
    getContent: getHowToContent,
    buttons: [
      { label: "C L O S E", action: () => howToOverlay.hide(), style: 'primary' }
    ],
    toggle: {
      label: "F O R   N E R D S",
      altLabel: "B A C K",
      getAltContent: getNerdContent,
    }
  });

  // Set overlay reference for resize handler and restore state if needed
  overlayRef = howToOverlay;
  if (wasOverlayOpen) {
    howToOverlay.show();
  }

  // Clean up overlay listeners on scene dispose (prevents memory leaks)
  scene.onDisposeObservable.add(() => {
    howToOverlay.dispose();
  });

  // === CREATE EMBERS (after panel so they render on top) ===
  const numEmbers = 30;
  for (let i = 0; i < numEmbers; i++) {
    const ember = new Rectangle();
    const size = 3 + Math.random() * 5;
    ember.width = `${size}px`;
    ember.height = `${size}px`;
    ember.thickness = 0;
    ember.cornerRadius = size / 2;
    ember.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    ember.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    ember.isHitTestVisible = false; // Don't block clicks
    gui.addControl(ember);

    embers.push({
      element: ember,
      x: Math.random() * 100,
      y: 50 + Math.random() * 55, // Start spread across bottom half
      speed: 0.15 + Math.random() * 0.25, // Faster speed so they're visible
      drift: Math.random() * Math.PI * 2,
      driftSpeed: 0.5 + Math.random() * 1.5,
      size,
      baseAlpha: 0.5 + Math.random() * 0.5, // Higher base alpha
    });
  }

  return scene;
}
