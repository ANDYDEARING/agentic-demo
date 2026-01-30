import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  Color4,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, TextBlock, StackPanel, Rectangle, Control, Button, ScrollViewer } from "@babylonjs/gui";
import type { SceneName, GameMode } from "../types";
import { setGameMode } from "../main";
import {
  SCENE_BACKGROUNDS,
  TITLE_HEAT_COLORS,
  TITLE_TEXT_COLORS,
  TITLE_FADE_IN_DURATION,
  TITLE_FADE_IN_DELAY,
  ACTIONS_PER_TURN,
  ACCUMULATOR_THRESHOLD,
  SPEED_BONUS_PER_UNUSED_ACTION,
  BASE_UNIT_SPEED,
  MELEE_DAMAGE_MULTIPLIER,
  BOOST_MULTIPLIER,
  GRID_SIZE,
} from "../config";
import { MUSIC, AUDIO_VOLUMES, LOOP_BUFFER_TIME, DEBUG_SKIP_OFFSET } from "../config";
import { CLASS_DATA } from "../types";
import { createMusicPlayer } from "../utils";

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

  // Background music - using centralized audio config
  const music = createMusicPlayer(MUSIC.title, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
  music.play();

  // Press S to skip to near end (to test loop behavior)
  const skipHandler = (e: KeyboardEvent) => {
    if (e.key === "s" || e.key === "S") {
      if (music.duration) {
        music.currentTime = Math.max(0, music.duration - DEBUG_SKIP_OFFSET);
      }
    }
  };
  window.addEventListener("keydown", skipHandler);

  scene.onDisposeObservable.add(() => {
    music.pause();
    music.src = "";
    window.removeEventListener("keydown", skipHandler);
  });

  new FreeCamera("camera", Vector3.Zero(), scene);

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // === RESPONSIVE SIZING ===
  // Breakpoints: mobile (<600), tablet (600-1024), desktop (>1024)
  // Also detect landscape phones (short height) to use compact scaling
  const screenWidth = engine.getRenderWidth();
  const screenHeight = engine.getRenderHeight();
  const isLandscapePhone = screenHeight < 500 && screenWidth < 1024;
  const isTablet = !isLandscapePhone && screenWidth >= 600 && screenWidth < 1024;
  const isDesktop = screenWidth >= 1024;

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
  let fadeInStarted = false;
  let fadeInAlpha = 0;
  const fadeInDuration = TITLE_FADE_IN_DURATION;
  const fadeInDelay = TITLE_FADE_IN_DELAY;

  // Subtitle line - smaller, above main title
  const titleLine1 = new TextBlock();
  titleLine1.text = "T H E   S U N S E T   G A M B I T";
  titleLine1.color = "rgba(232, 196, 160, 0)"; // Start invisible
  titleLine1.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
  titleLine1.fontWeight = "400";
  titleLine1.fontSize = subtitleFontSize;
  titleLine1.height = subtitleHeight;
  titleLine1.shadowColor = "rgba(255, 100, 20, 0)";
  titleLine1.shadowBlur = 15 * titleScale;
  titleLine1.shadowOffsetY = 1 * titleScale;
  panel.addControl(titleLine1);

  // Main title - BIG, fills width on mobile
  const titleLine2 = new TextBlock();
  titleLine2.text = "C R U C I B L E";
  titleLine2.color = "rgba(255, 179, 102, 0)"; // Start invisible
  titleLine2.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
  titleLine2.fontWeight = "400";
  titleLine2.fontSize = mainTitleFontSize;
  titleLine2.height = mainTitleHeight;
  titleLine2.shadowColor = "rgba(255, 80, 0, 0)";
  titleLine2.shadowBlur = 25 * titleScale;
  titleLine2.shadowOffsetY = 3 * titleScale;
  panel.addControl(titleLine2);

  // Thin decorative line
  const divider = new Rectangle();
  divider.width = dividerWidthPercent;
  divider.height = `${Math.max(2, Math.round(2 * titleScale))}px`;
  divider.thickness = 0;
  divider.background = "rgba(255, 150, 80, 0)"; // Start invisible
  panel.addControl(divider);

  // Version label
  const versionLabel = new TextBlock();
  versionLabel.text = "[ DEMO - Early - NOT BALANCED ] v0.2";
  versionLabel.color = "rgba(180, 180, 180, 0)";
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
    button.alpha = 0; // Start invisible, fade in with title

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

  // Local PvP button
  const pvpButton = createModeButton("L O C A L   P V P", "local-pvp");
  panel.addControl(pvpButton);
  modeButtons.push(pvpButton);

  // Small spacer between buttons
  const buttonSpacer = new TextBlock();
  buttonSpacer.height = buttonSpacerHeight;
  buttonSpacer.text = "";
  panel.addControl(buttonSpacer);

  // Local PvE button
  const pveButton = createModeButton("L O C A L   P V E", "local-pve");
  panel.addControl(pveButton);
  modeButtons.push(pveButton);

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
  howToButton.alpha = 0;

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
    showHowToOverlay();
  });

  panel.addControl(howToButton);
  modeButtons.push(howToButton);

  // === HOW TO OVERLAY ===
  let howToOverlay: Rectangle | null = null;
  let isShowingNerdSection = false;

  function showHowToOverlay() {
    if (howToOverlay) return;

    // Create dark overlay background
    howToOverlay = new Rectangle("howToOverlay");
    howToOverlay.width = "100%";
    howToOverlay.height = "100%";
    howToOverlay.background = "rgba(0, 0, 0, 0.95)";
    howToOverlay.thickness = 0;
    howToOverlay.zIndex = 100;
    gui.addControl(howToOverlay);

    // Main container with fixed header/footer and scrollable middle
    const mainContainer = new Rectangle("mainContainer");
    mainContainer.width = isDesktop ? "600px" : isTablet ? "85%" : "95%";
    mainContainer.height = isLandscapePhone ? "95%" : "85%";
    mainContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    mainContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    mainContainer.thickness = 0;
    mainContainer.background = "transparent";
    howToOverlay.addControl(mainContainer);

    // Header (fixed)
    const headerPanel = new StackPanel("headerPanel");
    headerPanel.width = "100%";
    headerPanel.height = "70px";
    headerPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    mainContainer.addControl(headerPanel);

    // Title
    const title = new TextBlock("howToTitle");
    title.text = "Q U I C K   H O W   T O";
    title.color = "#ff9966";
    title.fontSize = Math.round(28 * buttonScale);
    title.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
    title.height = "45px";
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    headerPanel.addControl(title);

    // Divider
    const dividerTop = new Rectangle("dividerTop");
    dividerTop.width = "80%";
    dividerTop.height = "2px";
    dividerTop.background = "rgba(255, 150, 80, 0.4)";
    dividerTop.thickness = 0;
    headerPanel.addControl(dividerTop);

    // Scrollable content area (use percentage - header is ~15%, footer is ~20%, scroll gets the rest)
    const scrollViewer = new ScrollViewer("howToScroll");
    scrollViewer.width = "100%";
    scrollViewer.height = isLandscapePhone ? "60%" : "65%";
    scrollViewer.top = "70px";
    scrollViewer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scrollViewer.thickness = 0;
    scrollViewer.barSize = 8;
    scrollViewer.barColor = "rgba(255, 150, 80, 0.5)";
    scrollViewer.barBackground = "rgba(0, 0, 0, 0.3)";
    scrollViewer.wheelPrecision = 50;
    mainContainer.addControl(scrollViewer);

    // Content stack inside scroll viewer
    const contentStack = new StackPanel("contentStack");
    contentStack.width = "100%";
    contentStack.isVertical = true;
    contentStack.paddingTop = "10px";
    contentStack.paddingBottom = "20px";
    scrollViewer.addControl(contentStack);

    // Instructions content
    const instructionsText = new TextBlock("instructions");
    instructionsText.text = getInstructionsText();
    instructionsText.color = "#cccccc";
    instructionsText.fontSize = isLandscapePhone ? 11 : 13;
    instructionsText.fontFamily = "'Exo 2', sans-serif";
    instructionsText.textWrapping = true;
    instructionsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    instructionsText.resizeToFit = true;
    instructionsText.paddingLeft = "15px";
    instructionsText.paddingRight = "15px";
    contentStack.addControl(instructionsText);

    // Footer (fixed at bottom)
    const footerPanel = new StackPanel("footerPanel");
    footerPanel.width = "100%";
    footerPanel.height = isLandscapePhone ? "70px" : "90px";
    footerPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    footerPanel.paddingTop = "10px";
    mainContainer.addControl(footerPanel);

    // For Nerds button
    const nerdButton = Button.CreateSimpleButton("forNerds", "F O R   N E R D S");
    nerdButton.width = "180px";
    nerdButton.height = "36px";
    nerdButton.background = "rgba(40, 50, 60, 0.8)";
    nerdButton.cornerRadius = 4;
    nerdButton.thickness = 1;
    nerdButton.color = "#66aaff";
    nerdButton.hoverCursor = "pointer";

    if (nerdButton.textBlock) {
      nerdButton.textBlock.color = "#66aaff";
      nerdButton.textBlock.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
      nerdButton.textBlock.fontSize = 16;
    }

    nerdButton.onPointerEnterObservable.add(() => {
      nerdButton.background = "rgba(60, 80, 100, 0.9)";
      if (nerdButton.textBlock) nerdButton.textBlock.color = "#ffffff";
    });
    nerdButton.onPointerOutObservable.add(() => {
      nerdButton.background = "rgba(40, 50, 60, 0.8)";
      if (nerdButton.textBlock) nerdButton.textBlock.color = "#66aaff";
    });

    nerdButton.onPointerClickObservable.add(() => {
      isShowingNerdSection = !isShowingNerdSection;
      if (isShowingNerdSection) {
        instructionsText.text = getNerdText();
        if (nerdButton.textBlock) nerdButton.textBlock.text = "B A C K";
        title.text = "F O R   N E R D S";
      } else {
        instructionsText.text = getInstructionsText();
        if (nerdButton.textBlock) nerdButton.textBlock.text = "F O R   N E R D S";
        title.text = "Q U I C K   H O W   T O";
      }
      // Reset scroll position when switching
      scrollViewer.verticalBar.value = 0;
    });

    footerPanel.addControl(nerdButton);

    // Spacer
    const spacer3 = new TextBlock();
    spacer3.height = "8px";
    spacer3.text = "";
    footerPanel.addControl(spacer3);

    // Close button
    const closeButton = Button.CreateSimpleButton("closeHowTo", "C L O S E");
    closeButton.width = "180px";
    closeButton.height = "36px";
    closeButton.background = "rgba(80, 40, 30, 0.8)";
    closeButton.cornerRadius = 4;
    closeButton.thickness = 1;
    closeButton.color = "#ff9966";
    closeButton.hoverCursor = "pointer";

    if (closeButton.textBlock) {
      closeButton.textBlock.color = "#ff9966";
      closeButton.textBlock.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
      closeButton.textBlock.fontSize = 16;
    }

    closeButton.onPointerEnterObservable.add(() => {
      closeButton.background = "rgba(120, 60, 40, 0.9)";
      if (closeButton.textBlock) closeButton.textBlock.color = "#ffffff";
    });
    closeButton.onPointerOutObservable.add(() => {
      closeButton.background = "rgba(80, 40, 30, 0.8)";
      if (closeButton.textBlock) closeButton.textBlock.color = "#ff9966";
    });

    closeButton.onPointerClickObservable.add(() => {
      hideHowToOverlay();
    });

    footerPanel.addControl(closeButton);
  }

  function hideHowToOverlay() {
    if (howToOverlay) {
      gui.removeControl(howToOverlay);
      howToOverlay.dispose();
      howToOverlay = null;
      isShowingNerdSection = false;
    }
  }

  function getInstructionsText(): string {
    return `GOAL: Eliminate all enemy units.

YOUR TURN: Each unit gets 2 actions. Mix and match:
  - Move (up to 3 tiles)
  - Attack (melee = adjacent, ranged = line of sight)
  - Use ability (class-specific)

WEAPONS:
  - Melee: High damage, must be adjacent to target
  - Ranged: Lower damage, can't hit adjacent tiles

CLASSES:
  - Soldier: Use COVER to watch tiles and auto-attack enemies
  - Operator: Use CONCEAL to block the next hit (then it breaks)
  - Medic: Use HEAL on yourself or adjacent allies

BOOSTS (pick one per unit):
  - Tough: +25% HP
  - Deadly: +25% Damage
  - Quick: +25% Speed (act sooner)

TIPS:
  - Ending turn early with unused actions gives a speed bonus
  - Ranged units should stay back; melee units close the gap
  - Medics heal better when safe behind allies
  - Cover triggers when enemies act in watched tiles`;
  }

  function getNerdText(): string {
    // All values pulled dynamically from config
    const soldier = CLASS_DATA.soldier;
    const operator = CLASS_DATA.operator;
    const medic = CLASS_DATA.medic;
    const boostPct = Math.round(BOOST_MULTIPLIER * 100);
    const meleeMultiplier = MELEE_DAMAGE_MULTIPLIER;

    return `GRID: ${GRID_SIZE}x${GRID_SIZE} tiles

UNIT BASE STATS:
  Soldier:  HP ${soldier.hp} | ATK ${soldier.attack} | Move ${soldier.moveRange}
  Operator: HP ${operator.hp} | ATK ${operator.attack} | Move ${operator.moveRange}
  Medic:    HP ${medic.hp} | ATK ${medic.attack} | Move ${medic.moveRange}

DAMAGE FORMULA:
  Ranged: ATK x 1 = ${soldier.attack} damage
  Melee:  ATK x ${meleeMultiplier} = ${soldier.attack * meleeMultiplier} damage

BOOSTS (+${boostPct}%):
  Tough:  HP ${soldier.hp} -> ${Math.round(soldier.hp * (1 + BOOST_MULTIPLIER))}
  Deadly: ATK ${soldier.attack} -> ${Math.round(soldier.attack * (1 + BOOST_MULTIPLIER))} (melee dmg: ${Math.round(soldier.attack * (1 + BOOST_MULTIPLIER) * meleeMultiplier)})
  Quick:  Speed ${BASE_UNIT_SPEED} -> ${(BASE_UNIT_SPEED * (1 + BOOST_MULTIPLIER)).toFixed(2)}

TURN ORDER (Accumulator System):
  - Each unit has an accumulator starting at 0
  - Each tick: accumulator += speed
  - When accumulator >= ${ACCUMULATOR_THRESHOLD}, unit acts
  - After acting: accumulator resets to 0
  - Higher speed = more frequent turns

SPEED BONUS (for ending turn early):
  +${SPEED_BONUS_PER_UNUSED_ACTION} speed per unused action
  Max bonus: +${SPEED_BONUS_PER_UNUSED_ACTION * ACTIONS_PER_TURN} (skip entire turn)

ACTIONS PER TURN: ${ACTIONS_PER_TURN}
  - Move, Attack, or Ability each cost 1 action
  - Same action can be repeated (move+move, attack+attack)

COVER (Soldier):
  - Activation: Costs 1 action
  - Watched tiles:
    * Melee: All 8 adjacent (diagonals need LOS)
    * Ranged: All tiles in LOS (not adjacent)
  - Triggers: When enemy completes ANY action in a watched tile
  - Effect: Auto-attack the enemy, then Cover ends
  - Breaks when:
    * Reaction fires (attacks enemy)
    * Covering unit takes damage
    * Covering unit's next turn starts
  - Note: Concealed enemies don't trigger Cover

CONCEAL (Operator):
  - Activation: Costs 1 action (one-way toggle)
  - Effect: Next incoming attack deals 0 damage
  - Breaks when: Unit is attacked (damage negated)
  - Cannot be manually deactivated

HEAL (Medic):
  - Heals ${medic.healAmount} HP per use
  - Valid targets: Self or adjacent ally
  - Diagonal targets require line of sight
  - Cannot overheal (capped at max HP)

LINE OF SIGHT:
  - Blocked by: Terrain blocks, other units
  - Units block the interior of their tile, not corners
  - Diagonal attacks/heals require clear LOS
  - Ranged attacks cannot target adjacent tiles`;
  }

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
