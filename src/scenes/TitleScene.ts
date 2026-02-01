/**
 * TitleScene.ts
 *
 * Title screen with animated background effects, title text, and navigation buttons.
 *
 * Module structure:
 * - title/effects.ts - Heat layers and ember particle system
 */

import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Color4,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock, StackPanel, Rectangle, Control, Button } from "@babylonjs/gui";
import type { SceneName, GameMode } from "../types";
import { setGameMode, registerActiveMusic } from "../main";
import { createMusicPlayer, createResponsiveOverlay, type MusicPlayer } from "../utils";
import {
  SCENE_BACKGROUNDS,
  TITLE_TEXT_COLORS,
  TITLE_FADE_IN_DURATION,
  TITLE_FADE_IN_DELAY,
  BREAKPOINT_LANDSCAPE_PHONE_HEIGHT,
  BREAKPOINT_TABLET_MIN,
  BREAKPOINT_DESKTOP_MIN,
  MUSIC,
  AUDIO_VOLUMES,
  LOOP_BUFFER_TIME,
  DEBUG_SKIP_OFFSET,
} from "../config";
import { getHowToContent, getNerdContent } from "../config/overlayContent";
import { createBaseGlow, createTitleEffects, addEmbers, type TitleEffects } from "./title";

// =============================================================================
// MODULE STATE (persists across orientation reloads)
// =============================================================================

let titleMusic: MusicPlayer | null = null;
let hasFadedIn = false;
let wasOverlayOpen = false;

// =============================================================================
// VERSION
// =============================================================================

const VERSION = "v0.23";

// =============================================================================
// MAIN SCENE FUNCTION
// =============================================================================

export function createTitleScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  navigateTo: (scene: SceneName) => void
): Scene {
  const scene = new Scene(engine);

  // Background color
  const bg = SCENE_BACKGROUNDS.title;
  scene.clearColor = new Color4(bg.r, bg.g, bg.b, bg.a);

  // ============================================
  // MUSIC
  // ============================================
  if (!titleMusic) {
    titleMusic = createMusicPlayer(MUSIC.title, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
    titleMusic.play();
  }
  registerActiveMusic(titleMusic);

  const skipHandler = (e: KeyboardEvent) => {
    if ((e.key === "s" || e.key === "S") && titleMusic?.duration) {
      titleMusic.currentTime = Math.max(0, titleMusic.duration - DEBUG_SKIP_OFFSET);
    }
  };
  window.addEventListener("keydown", skipHandler);

  let isOrientationReload = false;

  scene.onDisposeObservable.add(() => {
    window.removeEventListener("keydown", skipHandler);
    if (!isOrientationReload && titleMusic) {
      titleMusic.dispose();
      titleMusic = null;
      hasFadedIn = false;
      wasOverlayOpen = false;
    }
  });

  // ============================================
  // CAMERA & GUI
  // ============================================
  new FreeCamera("camera", Vector3.Zero(), scene);
  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // ============================================
  // RESPONSIVE SIZING
  // ============================================
  const screenWidth = engine.getRenderWidth();
  const screenHeight = engine.getRenderHeight();

  // Orientation change handling
  const initialOrientation = screenWidth > screenHeight ? "landscape" : "portrait";
  let reloadPending = false;
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
      wasOverlayOpen = overlayRef?.isVisible() ?? false;
      setTimeout(() => navigateTo("title"), 100);
    }
  };

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);
  scene.onDisposeObservable.add(() => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
  });

  // Breakpoint calculations
  const isLandscapePhone = screenHeight < BREAKPOINT_LANDSCAPE_PHONE_HEIGHT && screenWidth < BREAKPOINT_DESKTOP_MIN;
  const isTablet = !isLandscapePhone && screenWidth >= BREAKPOINT_TABLET_MIN && screenWidth < BREAKPOINT_DESKTOP_MIN;
  const isDesktop = screenWidth >= BREAKPOINT_DESKTOP_MIN;

  // Scale factors
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

  // ============================================
  // BACKGROUND EFFECTS
  // ============================================
  createBaseGlow(gui);
  const effects: TitleEffects = createTitleEffects(gui);

  // Mode buttons (for fade-in animation)
  const modeButtons: Button[] = [];

  // ============================================
  // ANIMATION LOOP
  // ============================================
  let time = 0;
  let fadeInStarted = hasFadedIn;
  let fadeInAlpha = hasFadedIn ? 1 : 0;
  const fadeInDuration = TITLE_FADE_IN_DURATION;
  const fadeInDelay = TITLE_FADE_IN_DELAY;

  // Title text references (set below)
  let titleLine1: TextBlock;
  let titleLine2: TextBlock;
  let divider: Rectangle;
  let versionLabel: TextBlock;

  scene.onBeforeRenderObservable.add(() => {
    time += engine.getDeltaTime() / 1000;

    // Update background effects
    effects.update(time);

    // Fade-in animation
    if (fadeInStarted && fadeInAlpha < 1) {
      fadeInAlpha = Math.min(1, fadeInAlpha + engine.getDeltaTime() / 1000 / fadeInDuration);
      const ease = fadeInAlpha * fadeInAlpha * (3 - 2 * fadeInAlpha); // Smoothstep

      titleLine1.color = `rgba(232, 196, 160, ${ease})`;
      titleLine2.color = `rgba(255, 179, 102, ${ease})`;
      divider.background = `rgba(255, 150, 80, ${ease * 0.4})`;
      versionLabel.color = `rgba(180, 180, 180, ${ease})`;

      for (const btn of modeButtons) {
        btn.alpha = ease;
      }

      if (fadeInAlpha >= 1) {
        hasFadedIn = true;
      }
    }

    // Title glow pulse
    if (fadeInAlpha > 0) {
      const glowIntensity = 0.6 + 0.2 * Math.sin(time * 0.5);
      titleLine1.shadowColor = `rgba(255, 100, 20, ${glowIntensity * 0.5 * fadeInAlpha})`;
      titleLine2.shadowColor = `rgba(255, 80, 0, ${glowIntensity * 0.7 * fadeInAlpha})`;
    }
  });

  // ============================================
  // TITLE TEXT
  // ============================================
  const panel = new StackPanel();
  panel.width = "100%";
  panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  panel.top = isLandscapePhone ? "0%" : "-5%";
  gui.addControl(panel);

  // Subtitle
  titleLine1 = new TextBlock();
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

  // Main title
  titleLine2 = new TextBlock();
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

  // Divider
  divider = new Rectangle();
  divider.width = dividerWidthPercent;
  divider.height = `${Math.max(2, Math.round(2 * titleScale))}px`;
  divider.thickness = 0;
  divider.background = hasFadedIn ? "rgba(255, 150, 80, 0.4)" : "rgba(255, 150, 80, 0)";
  panel.addControl(divider);

  // Version label
  versionLabel = new TextBlock();
  versionLabel.text = `[ DEMO - Early - NOT BALANCED ] ${VERSION}`;
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

  // Start fade-in after fonts load
  Promise.all([
    document.fonts.load(`${subtitleFontSize}px 'Bebas Neue'`),
    document.fonts.load(`${mainTitleFontSize}px 'Bebas Neue'`),
    document.fonts.load(`${buttonFontSize}px 'Bebas Neue'`),
  ]).then(() => {
    for (const btn of modeButtons) {
      btn.markAsDirty();
      if (btn.textBlock) btn.textBlock.markAsDirty();
    }
    setTimeout(() => { fadeInStarted = true; }, fadeInDelay * 1000);
  });

  // ============================================
  // BUTTONS
  // ============================================
  function createModeButton(text: string, mode: GameMode): Button {
    const button = Button.CreateSimpleButton(`mode_${mode}`, text);
    button.width = buttonWidthPercent;
    button.height = buttonHeight;
    button.background = "rgba(40, 20, 15, 0.6)";
    button.cornerRadius = Math.round(4 * buttonScale);
    button.thickness = 1;
    button.color = TITLE_TEXT_COLORS.buttonText;
    button.hoverCursor = "pointer";
    button.alpha = hasFadedIn ? 1 : 0;

    if (button.textBlock) {
      button.textBlock.color = TITLE_TEXT_COLORS.buttonText;
      button.textBlock.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
      button.textBlock.fontSize = buttonFontSize;
      button.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    }

    button.onPointerEnterObservable.add(() => {
      button.background = "rgba(100, 50, 25, 0.8)";
      if (button.textBlock) button.textBlock.color = TITLE_TEXT_COLORS.buttonHover;
      button.shadowColor = "rgba(255, 120, 50, 0.6)";
      button.shadowBlur = 15;
    });
    button.onPointerOutObservable.add(() => {
      button.background = "rgba(40, 20, 15, 0.6)";
      if (button.textBlock) button.textBlock.color = TITLE_TEXT_COLORS.buttonText;
      button.shadowColor = "transparent";
      button.shadowBlur = 0;
    });

    button.onPointerClickObservable.add(() => {
      setGameMode(mode);
      navigateTo("loadout");
    });

    return button;
  }

  // Play button
  const playButton = createModeButton("P L A Y", "local-pvp");
  panel.addControl(playButton);
  modeButtons.push(playButton);

  // Spacer
  const buttonSpacer2 = new TextBlock();
  buttonSpacer2.height = buttonSpacerHeight;
  buttonSpacer2.text = "";
  panel.addControl(buttonSpacer2);

  // How To button
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
    if (howToButton.textBlock) howToButton.textBlock.color = "#ffffff";
    howToButton.shadowColor = "rgba(150, 150, 255, 0.4)";
    howToButton.shadowBlur = 15;
  });
  howToButton.onPointerOutObservable.add(() => {
    howToButton.background = "rgba(30, 30, 40, 0.6)";
    if (howToButton.textBlock) howToButton.textBlock.color = "#aaaacc";
    howToButton.shadowColor = "transparent";
    howToButton.shadowBlur = 0;
  });

  howToButton.onPointerClickObservable.add(() => {
    howToOverlay.show();
  });

  panel.addControl(howToButton);
  modeButtons.push(howToButton);

  // ============================================
  // HOW TO OVERLAY
  // ============================================
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

  overlayRef = howToOverlay;
  if (wasOverlayOpen) {
    howToOverlay.show();
  }

  scene.onDisposeObservable.add(() => {
    howToOverlay.dispose();
  });

  // ============================================
  // EMBERS (added after panel so they render on top)
  // ============================================
  addEmbers(gui, effects, 30);

  return scene;
}
