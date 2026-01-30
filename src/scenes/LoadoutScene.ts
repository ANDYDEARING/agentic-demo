import {
  Engine,
  Scene,
  Color4,
  Vector3,
  ArcRotateCamera,
  HemisphericLight,
  SceneLoader,
  AbstractMesh,
  AnimationGroup,
  RenderTargetTexture,
  PBRMaterial,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import {
  AdvancedDynamicTexture,
  TextBlock,
  Button,
  StackPanel,
  Rectangle,
  Grid,
  Control,
  ScrollViewer,
  Image,
} from "@babylonjs/gui";
import { ALL_CLASSES, getClassData, Loadout, UnitClass, UnitCustomization, SceneName } from "../types";
import { getGameMode, setGameMode } from "../main";
import { enableTouchScroll } from "../utils";

// Import centralized config
import {
  TEAM_COLORS,
  SCENE_BACKGROUNDS,
  DEFAULT_PLAYER1_COLOR_INDEX,
  DEFAULT_PLAYER2_COLOR_INDEX,
  UNITS_PER_TEAM,
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
} from "../config";
import { MUSIC, AUDIO_VOLUMES, LOOP_BUFFER_TIME, DEBUG_SKIP_OFFSET } from "../config";
import { createMusicPlayer, hexToColor3, hexToColor4 } from "../utils";

// ============================================
// Module-level music player (persists across orientation reloads)
let loadoutMusic: HTMLAudioElement | null = null;

// COLOR PALETTE (matches title screen aesthetic)
// ============================================
const COLORS = {
  // Backgrounds
  bgDeep: "#0a0a12",
  bgPanel: "#14110f",
  bgUnitRow: "#1a1714",
  bgButton: "#2a2420",
  bgButtonHover: "#3a3025",
  bgPreview: "#0a0a0a",

  // Borders & dividers
  borderWarm: "#3a2a1a",
  borderLight: "#5a4a35",

  // Text
  textPrimary: "#e8c8a0",
  textSecondary: "#a08060",
  textMuted: "#706050",

  // Accents
  accentOrange: "#ff9650",
  accentOrangeDeep: "#c06020",
  accentBlue: "#4080cc",
  accentBlueDeep: "#305080",

  // Interactive states
  selected: "#c06020",
  selectedGlow: "rgba(255, 150, 80, 0.3)",
  disabled: "#404040",
  success: "#508040",
  successHover: "#609050",
};

// Greek letters for unit designations
const UNIT_DESIGNATIONS = ["Δ", "Ψ", "Ω"]; // Delta, Psi, Omega

// Class info
const CLASS_INFO: Record<UnitClass, { name: string; tagline: string; abilityName: string; abilityDesc: string }> = {
  soldier: {
    name: "Soldier",
    tagline: "The settlement's last line of defense",
    abilityName: "COVER",
    abilityDesc: "Activate to counter enemies in range, potentially interrupting their move",
  },
  operator: {
    name: "Operator",
    tagline: "A ghost in the chaos of battle",
    abilityName: "CONCEAL",
    abilityDesc: "Activate to negate the next incoming hit and avoid triggering enemy Cover",
  },
  medic: {
    name: "Medic",
    tagline: "Keeping hope alive under fire",
    abilityName: "HEAL",
    abilityDesc: "Restore HP to self or adjacent allies (diagonals require line of sight)",
  },
};

// Boost info
const BOOST_INFO = [
  { name: "Tough", stat: "HP", value: 25, desc: "This unit has an extra" },
  { name: "Deadly", stat: "Damage", value: 25, desc: "This unit deals an extra" },
  { name: "Quick", stat: "Speed", value: 25, desc: "This unit has" },
];

// Weapon info
const WEAPON_INFO = {
  ranged: {
    label: "Ranged",
    desc: "Can attack non-adjacent units in Line of Sight",
  },
  melee: {
    label: "Melee",
    desc: "2x damage, adjacent spaces only",
  },
};

// Helper to get full unit description for card
function getUnitDescription(unitClass: UnitClass, boostIndex: number, weaponStyle: "ranged" | "melee"): string {
  const cls = CLASS_INFO[unitClass];
  const boost = BOOST_INFO[boostIndex];
  const weapon = WEAPON_INFO[weaponStyle];

  return [
    cls.tagline,
    `[${cls.abilityName}]: ${cls.abilityDesc}`,
    `[${boost.name.toUpperCase()}]: ${boost.desc} +${boost.value}% ${boost.stat}`,
    `[${weapon.label.toUpperCase()}]: ${weapon.desc}`,
  ].join("\n\n");
}

export function createLoadoutScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  onStartBattle: (loadout: Loadout) => void,
  navigateTo: (scene: SceneName) => void
): Scene {
  const scene = new Scene(engine);

  // Use centralized scene background color
  const bg = SCENE_BACKGROUNDS.loadout;
  scene.clearColor = new Color4(bg.r, bg.g, bg.b, bg.a);

  // ============================================
  // RESPONSIVE SIZING
  // ============================================
  const screenWidth = engine.getRenderWidth();
  const screenHeight = engine.getRenderHeight();
  // Landscape phones (short height) should use mobile layout with tabs
  const isLandscapePhone = screenHeight < 500 && screenWidth < 1024;
  // Mobile: portrait phones OR landscape phones (both use single stack with tabs)
  const isMobile = screenWidth < 600 || isLandscapePhone;
  const isTablet = screenWidth >= 600 && screenWidth < 1024 && !isLandscapePhone;
  // Large desktop: wide enough to show both teams side by side horizontally (1200px+)
  const isLargeDesktop = screenWidth >= 1200;
  // Portrait tablet (iPad portrait): tall screen, wide enough - stack both teams vertically, no tabs
  const isPortraitTablet = screenWidth >= 600 && screenHeight > screenWidth && !isLandscapePhone;
  // Layout modes:
  // 1. isLargeDesktop: Both teams side by side horizontally
  // 2. isPortraitTablet: Both teams stacked vertically (no tabs)
  // 3. useTabLayout: Single team with P1/P2 tab toggle (landscape tablet, mobile, small desktop)
  const useTabLayout = !isLargeDesktop && !isPortraitTablet;

  // Touch-friendly sizes
  const buttonHeight = isMobile ? 44 : isTablet ? 46 : 48;
  const smallButtonHeight = isMobile ? 40 : isTablet ? 42 : 44;
  const fontSize = isMobile ? 13 : isTablet ? 14 : 15;
  const smallFontSize = isMobile ? 11 : isTablet ? 12 : 13;

  // Listen for orientation/resize changes and reload scene
  const initialOrientation = screenWidth > screenHeight ? "landscape" : "portrait";
  let reloadPending = false;
  let isOrientationReload = false;

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
      setTimeout(() => {
        navigateTo("loadout");
      }, 100);
    }
  };

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);

  scene.onDisposeObservable.add(() => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
  });

  // Loadout music
  if (!loadoutMusic) {
    loadoutMusic = createMusicPlayer(MUSIC.loadout, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
    loadoutMusic.play();
  }

  // Debug skip key
  const skipHandler = (e: KeyboardEvent) => {
    if (e.key === "s" || e.key === "S") {
      if (loadoutMusic?.duration) {
        loadoutMusic.currentTime = Math.max(0, loadoutMusic.duration - DEBUG_SKIP_OFFSET);
      }
    }
  };
  window.addEventListener("keydown", skipHandler);
  scene.onDisposeObservable.add(() => {
    window.removeEventListener("keydown", skipHandler);
  });

  scene.onDisposeObservable.add(() => {
    if (!isOrientationReload && loadoutMusic) {
      loadoutMusic.pause();
      loadoutMusic.src = "";
      loadoutMusic = null;
    }
  });

  // Clean up RTTs before scene disposal
  scene.onDisposeObservable.add(() => {
    scene.customRenderTargets.length = 0;
  });

  // Camera setup for 3D preview
  const camera = new ArcRotateCamera("cam", Math.PI / 2, Math.PI / 2.5, isLargeDesktop ? 8 : 4, new Vector3(0, 0.8, 0), scene);
  camera.lowerRadiusLimit = 2;
  camera.upperRadiusLimit = 12;
  scene.activeCamera = camera;

  const light = new HemisphericLight("light", new Vector3(0, 1, 0.5), scene);
  light.intensity = 1.2;

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // Get game mode
  const { mode: gameMode, humanTeam } = getGameMode();

  // ============================================
  // STATE
  // ============================================
  const selections: Loadout = {
    player1: [],
    player2: [],
    player1TeamColor: TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex,
    player2TeamColor: TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex,
    gameMode,
    humanTeam,
  };

  // Current team for mobile view
  let currentTeam: "player1" | "player2" = "player1";

  // AI toggle for Player 2 (defaults to human vs human)
  let isP2Computer = gameMode === "local-pve";

  // Track callbacks
  const previewRefreshCallbacks: { player1: (() => void)[]; player2: (() => void)[] } = {
    player1: [],
    player2: [],
  };
  const previewReloadCallbacks: { player1: (() => void)[]; player2: (() => void)[] } = {
    player1: [],
    player2: [],
  };
  const cardUpdateCallbacks: { player1: (() => void)[]; player2: (() => void)[] } = {
    player1: [],
    player2: [],
  };
  // Animation sync callbacks - reset all previews to idle and sync rotation
  const previewAnimSyncCallbacks: (() => void)[] = [];
  // Desktop header color swatch refresh callbacks (for cross-team updates)
  const desktopColorRefresh: { player1: (() => void) | null; player2: (() => void) | null } = {
    player1: null,
    player2: null,
  };

  // Unit state per slot (indexed by playerId_unitIndex)
  interface UnitState {
    selectedClass: UnitClass;
    selectedBoost: number;
    selectedStyle: "ranged" | "melee";
    customization: UnitCustomization;
    hasBeenCustomized: boolean;
  }

  const unitStates: Record<string, UnitState> = {};

  // Initialize default unit states
  const defaultClasses: UnitClass[] = ["soldier", "operator", "medic"];
  const defaultBoosts = [0, 1, 2];
  const defaultStyles: ("ranged" | "melee")[] = ["ranged", "melee", "ranged"];

  for (const playerId of ["player1", "player2"] as const) {
    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      const key = `${playerId}_${i}`;
      unitStates[key] = {
        selectedClass: defaultClasses[i] || "soldier",
        selectedBoost: defaultBoosts[i] ?? 0,
        selectedStyle: defaultStyles[i] || "ranged",
        customization: randomizeAppearance(defaultStyles[i] || "ranged"),
        hasBeenCustomized: false,
      };
    }
  }

  function randomizeAppearance(style: "ranged" | "melee"): UnitCustomization {
    return {
      body: Math.random() > 0.5 ? "male" : "female",
      combatStyle: style,
      handedness: Math.random() > 0.5 ? "right" : "left",
      head: Math.floor(Math.random() * 4),
      hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
      eyeColor: Math.floor(Math.random() * EYE_COLORS.length),
      skinTone: Math.floor(Math.random() * SKIN_TONES.length),
    };
  }

  // Update selections array from unit states
  function syncSelectionsFromStates(): void {
    for (const playerId of ["player1", "player2"] as const) {
      selections[playerId] = [];
      for (let i = 0; i < UNITS_PER_TEAM; i++) {
        const state = unitStates[`${playerId}_${i}`];
        selections[playerId].push({
          unitClass: state.selectedClass,
          customization: { ...state.customization, combatStyle: state.selectedStyle },
        });
      }
    }
  }

  // Initial sync
  syncSelectionsFromStates();

  // ============================================
  // MAIN LAYOUT
  // ============================================

  // Scroll viewer for content
  const scrollViewer = new ScrollViewer("mainScroll");
  scrollViewer.width = "100%";
  scrollViewer.height = "100%";
  scrollViewer.thickness = 0;
  scrollViewer.wheelPrecision = 0.05;
  gui.addControl(scrollViewer);

  // Main content stack
  const mainStack = new StackPanel("mainStack");
  mainStack.width = "100%";
  mainStack.isVertical = true;
  mainStack.paddingBottom = "90px"; // Space for start button
  scrollViewer.addControl(mainStack);

  // Track scrolling state to pause RTT updates (prevents flickering)
  let isScrolling = false;

  // Enable touch scrolling with RTT pause callbacks
  const mainScrollCleanup = enableTouchScroll(scrollViewer, mainStack, {
    hideScrollbar: true,
    onScrollStart: () => { isScrolling = true; },
    onScrollEnd: () => { isScrolling = false; },
    scrollEndDelay: 150
  });

  // Clean up on scene dispose
  scene.onDisposeObservable.add(() => {
    mainScrollCleanup.dispose();
  });

  // ============================================
  // TOP BAR (Tab layout: team tabs + colors, Others: just spacing)
  // ============================================
  const topBar = new Rectangle("topBar");
  topBar.width = "100%";
  topBar.height = useTabLayout ? "60px" : "20px";
  topBar.thickness = 0;
  topBar.background = useTabLayout ? COLORS.bgPanel : "transparent";
  mainStack.addControl(topBar);

  // Team tabs (for tab layout - mobile, tablet, small desktop)
  let p1Tab: Button | null = null;
  let p2Tab: Button | null = null;
  const p1Cards: Rectangle[] = [];
  const p2Cards: Rectangle[] = [];
  let tabColorRefresh: (() => void) | null = null;
  let tabAiToggleRow: Rectangle | null = null;
  let tabAiToggleText: TextBlock | null = null;

  if (useTabLayout) {
    const tabsContainer = new StackPanel("tabsContainer");
    tabsContainer.isVertical = false;
    tabsContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tabsContainer.left = "10px";
    tabsContainer.height = "100%";
    topBar.addControl(tabsContainer);

    p1Tab = Button.CreateSimpleButton("p1Tab", "P1");
    p1Tab.width = "50px";
    p1Tab.height = "36px";
    p1Tab.background = COLORS.selected;
    p1Tab.color = COLORS.textPrimary;
    p1Tab.fontSize = fontSize;
    p1Tab.cornerRadius = 4;
    p1Tab.thickness = 0;
    p1Tab.onPointerClickObservable.add(() => switchTeam("player1"));
    tabsContainer.addControl(p1Tab);

    const tabSpacer = new Rectangle();
    tabSpacer.width = "8px";
    tabSpacer.height = "1px";
    tabSpacer.thickness = 0;
    tabsContainer.addControl(tabSpacer);

    p2Tab = Button.CreateSimpleButton("p2Tab", "P2");
    p2Tab.width = "50px";
    p2Tab.height = "36px";
    p2Tab.background = COLORS.bgButton;
    p2Tab.color = COLORS.textPrimary;
    p2Tab.fontSize = fontSize;
    p2Tab.cornerRadius = 4;
    p2Tab.thickness = 0;
    p2Tab.onPointerClickObservable.add(() => switchTeam("player2"));
    tabsContainer.addControl(p2Tab);

    // Team color swatches (right side)
    const colorContainer = new StackPanel("tabColorContainer");
    colorContainer.isVertical = false;
    colorContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    colorContainer.paddingRight = "10px";
    colorContainer.height = "100%";
    topBar.addControl(colorContainer);

    createTeamColorSwatches(colorContainer, () => currentTeam);

    // AI toggle row (only visible on P2 tab)
    tabAiToggleRow = new Rectangle("tabAiToggleRow");
    tabAiToggleRow.width = "95%";
    tabAiToggleRow.height = "40px";
    tabAiToggleRow.background = COLORS.bgButton;
    tabAiToggleRow.cornerRadius = 6;
    tabAiToggleRow.thickness = 0;
    tabAiToggleRow.isVisible = false; // Hidden by default (P1 is selected)
    mainStack.addControl(tabAiToggleRow);

    tabAiToggleText = new TextBlock("tabAiToggleText");
    tabAiToggleText.text = isP2Computer ? "Computer Controlled: ON" : "Computer Controlled: OFF";
    tabAiToggleText.color = isP2Computer ? COLORS.accentBlue : COLORS.textSecondary;
    tabAiToggleText.fontSize = fontSize;
    tabAiToggleRow.addControl(tabAiToggleText);

    tabAiToggleRow.onPointerClickObservable.add(() => {
      isP2Computer = !isP2Computer;
      if (tabAiToggleText) {
        tabAiToggleText.text = isP2Computer ? "Computer Controlled: ON" : "Computer Controlled: OFF";
        tabAiToggleText.color = isP2Computer ? COLORS.accentBlue : COLORS.textSecondary;
      }
      tabAiToggleRow!.background = isP2Computer ? COLORS.accentBlueDeep : COLORS.bgButton;
    });
  }

  function switchTeam(team: "player1" | "player2"): void {
    currentTeam = team;
    if (p1Tab && p2Tab) {
      p1Tab.background = team === "player1" ? COLORS.selected : COLORS.bgButton;
      p2Tab.background = team === "player2" ? COLORS.selected : COLORS.bgButton;
    }
    // Show/hide appropriate border containers (tab layout)
    if (p1BorderContainer && p2BorderContainer && useTabLayout) {
      p1BorderContainer.isVisible = team === "player1";
      p2BorderContainer.isVisible = team === "player2";
    }
    // Update tab color swatches
    tabColorRefresh?.();
    // Update tab AI toggle visibility (only show on P2)
    if (tabAiToggleRow) {
      tabAiToggleRow.isVisible = team === "player2";
    }
  }

  function createTeamColorSwatches(parent: StackPanel, getTeam: () => "player1" | "player2"): void {
    const swatches: Rectangle[] = [];

    const getThisColor = (): string => {
      const team = getTeam();
      return team === "player1" ? selections.player1TeamColor! : selections.player2TeamColor!;
    };

    const getOtherColor = (): string => {
      const team = getTeam();
      return team === "player1" ? selections.player2TeamColor! : selections.player1TeamColor!;
    };

    const setThisColor = (hex: string): void => {
      const team = getTeam();
      if (team === "player1") {
        selections.player1TeamColor = hex;
      } else {
        selections.player2TeamColor = hex;
      }
    };

    TEAM_COLORS.forEach((teamColor) => {
      const swatchSize = 28;
      const swatch = new Rectangle();
      swatch.width = `${swatchSize}px`;
      swatch.height = `${swatchSize}px`;
      swatch.background = teamColor.hex;
      swatch.cornerRadius = 4;
      swatch.paddingLeft = "2px";
      swatch.paddingRight = "2px";

      swatch.onPointerClickObservable.add(() => {
        if (getOtherColor() === teamColor.hex) return;
        setThisColor(teamColor.hex);
        refreshSwatches();
        // Update border container color
        const team = getTeam();
        if (team === "player1" && p1BorderContainer) {
          p1BorderContainer.color = teamColor.hex;
        } else if (team === "player2" && p2BorderContainer) {
          p2BorderContainer.color = teamColor.hex;
        }
        // Refresh previews
        previewRefreshCallbacks[team].forEach(cb => cb());
      });

      swatches.push(swatch);
      parent.addControl(swatch);
    });

    const refreshSwatches = (): void => {
      TEAM_COLORS.forEach((teamColor, i) => {
        const swatch = swatches[i];
        const isSelected = getThisColor() === teamColor.hex;
        const isDisabled = getOtherColor() === teamColor.hex;
        swatch.isVisible = !isDisabled;  // Hide instead of dimming
        swatch.thickness = isSelected ? 3 : 1;
        swatch.color = isSelected ? "white" : COLORS.borderWarm;
      });
    };

    refreshSwatches();
    tabColorRefresh = refreshSwatches;
  }

  // ============================================
  // UNIT CARDS
  // ============================================

  // Track team border containers for color updates
  let p1BorderContainer: Rectangle | null = null;
  let p2BorderContainer: Rectangle | null = null;

  if (useTabLayout) {
    // Tab layout: Create bordered container for each team's cards (one visible at a time)
    p1BorderContainer = new Rectangle("p1BorderContainer");
    p1BorderContainer.width = "95%";
    p1BorderContainer.thickness = 3;
    p1BorderContainer.color = selections.player1TeamColor || TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex;
    p1BorderContainer.cornerRadius = 12;
    p1BorderContainer.background = "transparent";
    p1BorderContainer.paddingTop = "8px";
    p1BorderContainer.paddingBottom = "8px";
    p1BorderContainer.paddingLeft = "8px";
    p1BorderContainer.paddingRight = "8px";
    p1BorderContainer.adaptHeightToChildren = true;
    mainStack.addControl(p1BorderContainer);

    const p1CardsStack = new StackPanel("p1CardsStack");
    p1CardsStack.width = "100%";
    p1CardsStack.isVertical = true;
    p1BorderContainer.addControl(p1CardsStack);

    p2BorderContainer = new Rectangle("p2BorderContainer");
    p2BorderContainer.width = "95%";
    p2BorderContainer.thickness = 3;
    p2BorderContainer.color = selections.player2TeamColor || TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex;
    p2BorderContainer.cornerRadius = 12;
    p2BorderContainer.background = "transparent";
    p2BorderContainer.paddingTop = "8px";
    p2BorderContainer.paddingBottom = "8px";
    p2BorderContainer.paddingLeft = "8px";
    p2BorderContainer.paddingRight = "8px";
    p2BorderContainer.adaptHeightToChildren = true;
    p2BorderContainer.isVisible = false;
    mainStack.addControl(p2BorderContainer);

    const p2CardsStack = new StackPanel("p2CardsStack");
    p2CardsStack.width = "100%";
    p2CardsStack.isVertical = true;
    p2BorderContainer.addControl(p2CardsStack);

    // Tab layout: Vertical stack of 3 cards per team
    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      const p1Card = createUnitCard("player1", i);
      p1Cards.push(p1Card);
      p1CardsStack.addControl(p1Card);

      const p2Card = createUnitCard("player2", i);
      p2Cards.push(p2Card);
      p2CardsStack.addControl(p2Card);
    }
  } else if (isPortraitTablet) {
    // Portrait tablet: Both teams stacked vertically, no tabs

    // Player 1 section
    const p1Header = createTeamHeader("player1", "PLAYER 1");
    mainStack.addControl(p1Header);

    p1BorderContainer = new Rectangle("p1BorderContainerPortrait");
    p1BorderContainer.width = "95%";
    p1BorderContainer.thickness = 3;
    p1BorderContainer.color = selections.player1TeamColor || TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex;
    p1BorderContainer.cornerRadius = 12;
    p1BorderContainer.background = "transparent";
    p1BorderContainer.paddingTop = "8px";
    p1BorderContainer.paddingBottom = "8px";
    p1BorderContainer.paddingLeft = "8px";
    p1BorderContainer.paddingRight = "8px";
    p1BorderContainer.adaptHeightToChildren = true;
    mainStack.addControl(p1BorderContainer);

    const p1CardsStack = new StackPanel("p1CardsStackPortrait");
    p1CardsStack.width = "100%";
    p1CardsStack.isVertical = true;
    p1BorderContainer.addControl(p1CardsStack);

    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      const card = createUnitCard("player1", i);
      p1CardsStack.addControl(card);
    }

    // Separator
    const separator = new Rectangle("separator");
    separator.width = "90%";
    separator.height = "2px";
    separator.background = COLORS.borderWarm;
    separator.thickness = 0;
    mainStack.addControl(separator);

    // Player 2 section
    const p2Header = createTeamHeader("player2", "PLAYER 2");
    mainStack.addControl(p2Header);

    p2BorderContainer = new Rectangle("p2BorderContainerPortrait");
    p2BorderContainer.width = "95%";
    p2BorderContainer.thickness = 3;
    p2BorderContainer.color = selections.player2TeamColor || TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex;
    p2BorderContainer.cornerRadius = 12;
    p2BorderContainer.background = "transparent";
    p2BorderContainer.paddingTop = "8px";
    p2BorderContainer.paddingBottom = "8px";
    p2BorderContainer.paddingLeft = "8px";
    p2BorderContainer.paddingRight = "8px";
    p2BorderContainer.adaptHeightToChildren = true;
    mainStack.addControl(p2BorderContainer);

    const p2CardsStack = new StackPanel("p2CardsStackPortrait");
    p2CardsStack.width = "100%";
    p2CardsStack.isVertical = true;
    p2BorderContainer.addControl(p2CardsStack);

    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      const card = createUnitCard("player2", i);
      p2CardsStack.addControl(card);
    }
  } else {
    // Large desktop: Two rows of 3 cards (both teams visible horizontally)

    // Player 1 section
    const p1Header = createTeamHeader("player1", "PLAYER 1");
    mainStack.addControl(p1Header);

    // Bordered container for P1 cards
    p1BorderContainer = new Rectangle("p1BorderContainerDesktop");
    p1BorderContainer.width = "95%";
    p1BorderContainer.height = `${screenHeight * 0.38}px`;
    p1BorderContainer.thickness = 3;
    p1BorderContainer.color = selections.player1TeamColor || TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex;
    p1BorderContainer.cornerRadius = 12;
    p1BorderContainer.background = "transparent";
    mainStack.addControl(p1BorderContainer);

    const p1Row = new Grid("p1Row");
    p1Row.width = "100%";
    p1Row.height = "100%";
    p1Row.addColumnDefinition(1/3);
    p1Row.addColumnDefinition(1/3);
    p1Row.addColumnDefinition(1/3);
    p1Row.addRowDefinition(1);
    p1BorderContainer.addControl(p1Row);

    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      const card = createUnitCard("player1", i);
      p1Row.addControl(card, 0, i);
    }

    // Separator
    const separator = new Rectangle("separator");
    separator.width = "90%";
    separator.height = "2px";
    separator.background = COLORS.borderWarm;
    separator.thickness = 0;
    mainStack.addControl(separator);

    // Player 2 section
    const p2Header = createTeamHeader("player2", "PLAYER 2");
    mainStack.addControl(p2Header);

    // Bordered container for P2 cards
    p2BorderContainer = new Rectangle("p2BorderContainerDesktop");
    p2BorderContainer.width = "95%";
    p2BorderContainer.height = `${screenHeight * 0.38}px`;
    p2BorderContainer.thickness = 3;
    p2BorderContainer.color = selections.player2TeamColor || TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex;
    p2BorderContainer.cornerRadius = 12;
    p2BorderContainer.background = "transparent";
    mainStack.addControl(p2BorderContainer);

    const p2Row = new Grid("p2Row");
    p2Row.width = "100%";
    p2Row.height = "100%";
    p2Row.addColumnDefinition(1/3);
    p2Row.addColumnDefinition(1/3);
    p2Row.addColumnDefinition(1/3);
    p2Row.addRowDefinition(1);
    p2BorderContainer.addControl(p2Row);

    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      const card = createUnitCard("player2", i);
      p2Row.addControl(card, 0, i);
    }
  }

  function createTeamHeader(playerId: "player1" | "player2", label: string): Rectangle {
    const header = new Rectangle(`${playerId}Header`);
    header.width = "95%";
    header.height = "50px";
    header.thickness = 0;
    header.paddingTop = "10px";

    const headerGrid = new Grid(`${playerId}HeaderGrid`);
    headerGrid.width = "100%";
    headerGrid.height = "100%";
    // P2 needs extra column for AI toggle - use fixed widths for tighter layout
    if (playerId === "player2") {
      headerGrid.addColumnDefinition(110, true);  // "PLAYER 2" fixed width
      headerGrid.addColumnDefinition(190, true);  // AI toggle fixed width
      headerGrid.addColumnDefinition(1, false);   // Colors take remaining space
    } else {
      headerGrid.addColumnDefinition(0.3);
      headerGrid.addColumnDefinition(0.7);
    }
    headerGrid.addRowDefinition(1);
    header.addControl(headerGrid);

    const teamColor = playerId === "player1" ? selections.player1TeamColor : selections.player2TeamColor;

    const nameText = new TextBlock();
    nameText.text = label;
    nameText.color = teamColor || COLORS.textPrimary;
    nameText.fontSize = 24;
    nameText.fontFamily = "'Bebas Neue', sans-serif";
    nameText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameText.paddingLeft = "10px";
    headerGrid.addControl(nameText, 0, 0);

    // AI toggle for Player 2
    if (playerId === "player2") {
      const aiToggleContainer = new StackPanel();
      aiToggleContainer.isVertical = false;
      aiToggleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      headerGrid.addControl(aiToggleContainer, 0, 1);

      const aiToggleBtn = Button.CreateSimpleButton("aiToggle", isP2Computer ? "Computer Controlled: ON" : "Computer Controlled: OFF");
      aiToggleBtn.width = "180px";
      aiToggleBtn.height = "28px";
      aiToggleBtn.background = isP2Computer ? COLORS.accentBlueDeep : COLORS.bgButton;
      aiToggleBtn.color = isP2Computer ? COLORS.accentBlue : COLORS.textSecondary;
      aiToggleBtn.cornerRadius = 4;
      aiToggleBtn.fontSize = 12;
      aiToggleBtn.onPointerClickObservable.add(() => {
        isP2Computer = !isP2Computer;
        if (aiToggleBtn.textBlock) {
          aiToggleBtn.textBlock.text = isP2Computer ? "Computer Controlled: ON" : "Computer Controlled: OFF";
        }
        aiToggleBtn.background = isP2Computer ? COLORS.accentBlueDeep : COLORS.bgButton;
        aiToggleBtn.color = isP2Computer ? COLORS.accentBlue : COLORS.textSecondary;
        // Update tab layout toggle if exists
        if (tabAiToggleText) {
          tabAiToggleText.text = isP2Computer ? "Computer Controlled: ON" : "Computer Controlled: OFF";
          tabAiToggleText.color = isP2Computer ? COLORS.accentBlue : COLORS.textSecondary;
        }
        if (tabAiToggleRow) {
          tabAiToggleRow.background = isP2Computer ? COLORS.accentBlueDeep : COLORS.bgButton;
        }
      });
      aiToggleContainer.addControl(aiToggleBtn);
    }

    // Team colors (column 1 for P1, column 2 for P2 due to AI toggle)
    const colorRow = new StackPanel();
    colorRow.isVertical = false;
    colorRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    colorRow.paddingRight = "10px";
    headerGrid.addControl(colorRow, 0, playerId === "player2" ? 2 : 1);

    const swatches: Rectangle[] = [];

    const getOtherColor = (): string => {
      return playerId === "player1" ? selections.player2TeamColor! : selections.player1TeamColor!;
    };

    const getThisColor = (): string => {
      return playerId === "player1" ? selections.player1TeamColor! : selections.player2TeamColor!;
    };

    TEAM_COLORS.forEach((tc) => {
      const swatch = new Rectangle();
      swatch.width = "24px";
      swatch.height = "24px";
      swatch.background = tc.hex;
      swatch.cornerRadius = 4;
      swatch.paddingLeft = "2px";
      swatch.paddingRight = "2px";

      const isSelected = getThisColor() === tc.hex;
      const isDisabled = getOtherColor() === tc.hex;
      swatch.isVisible = !isDisabled;  // Hide instead of dimming
      swatch.thickness = isSelected ? 3 : 1;
      swatch.color = isSelected ? "white" : COLORS.borderWarm;

      swatch.onPointerClickObservable.add(() => {
        if (getOtherColor() === tc.hex) return;
        if (playerId === "player1") {
          selections.player1TeamColor = tc.hex;
          if (p1BorderContainer) p1BorderContainer.color = tc.hex;
        } else {
          selections.player2TeamColor = tc.hex;
          if (p2BorderContainer) p2BorderContainer.color = tc.hex;
        }
        nameText.color = tc.hex;
        refreshSwatches();
        // Refresh the other team's swatches so they update visibility
        const otherTeam = playerId === "player1" ? "player2" : "player1";
        desktopColorRefresh[otherTeam]?.();
        previewRefreshCallbacks[playerId].forEach(cb => cb());
      });

      swatches.push(swatch);
      colorRow.addControl(swatch);
    });

    const refreshSwatches = (): void => {
      TEAM_COLORS.forEach((tc, i) => {
        const s = swatches[i];
        const isSelected = getThisColor() === tc.hex;
        const isDisabled = getOtherColor() === tc.hex;
        s.isVisible = !isDisabled;  // Hide instead of dimming
        s.thickness = isSelected ? 3 : 1;
        s.color = isSelected ? "white" : COLORS.borderWarm;
      });
    };

    // Store refresh callback for cross-team updates
    desktopColorRefresh[playerId] = refreshSwatches;

    return header;
  }

  function createUnitCard(playerId: "player1" | "player2", unitIndex: number): Rectangle {
    const key = `${playerId}_${unitIndex}`;
    const state = unitStates[key];

    // Vertical stacking layout (tab layout or portrait tablet)
    const useVerticalCards = useTabLayout || isPortraitTablet;

    const card = new Rectangle(`card_${key}`);
    card.width = "95%";
    if (useVerticalCards) {
      // Vertical layout: cards stack vertically, need fixed/adaptive height
      card.adaptHeightToChildren = true;
    } else {
      // Large desktop: cards in horizontal grid, fill cell height
      card.height = "100%";
    }
    card.background = COLORS.bgPanel;
    card.cornerRadius = 8;
    card.thickness = 1;
    card.color = COLORS.borderWarm;
    card.paddingTop = "8px";
    card.paddingBottom = "8px";
    card.paddingLeft = "8px";
    card.paddingRight = "8px";

    // Main layout: Grid with two columns (copy left, preview right)
    // Calculate copy column width in pixels to avoid percentage warnings
    const cardWidthPx = useVerticalCards ? screenWidth * 0.9 : screenWidth * 0.3; // Approximate card width
    const copyWidthPx = Math.floor(cardWidthPx * 0.55);

    const cardGrid = new Grid(`cardGrid_${key}`);
    cardGrid.width = "100%";
    if (useVerticalCards) {
      // Vertical layout: calculate height based on screen width to ensure text fits
      // Narrower screens need more height for wrapped text
      const baseHeight = screenWidth < 400 ? 260 : screenWidth < 800 ? 200 : 180;
      cardGrid.height = `${baseHeight}px`;
    } else {
      // Large desktop: fill available height
      cardGrid.height = "100%";
    }
    cardGrid.addColumnDefinition(copyWidthPx, true);   // Fixed pixel width for copy
    cardGrid.addColumnDefinition(1, false);            // Remaining space for preview
    cardGrid.addRowDefinition(1);
    card.addControl(cardGrid);

    // Left column: copy (wrapper Rectangle to hold the StackPanel)
    const copyWrapper = new Rectangle(`copyWrapper_${key}`);
    copyWrapper.thickness = 0;
    copyWrapper.paddingLeft = "8px";
    copyWrapper.paddingRight = "4px";
    copyWrapper.paddingTop = "4px";
    copyWrapper.paddingBottom = "4px";
    cardGrid.addControl(copyWrapper, 0, 0);

    const copyStack = new StackPanel(`copyStack_${key}`);
    copyStack.isVertical = true;
    copyStack.width = "100%";
    copyStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    copyWrapper.addControl(copyStack);

    // Title row: Symbol left, Class center, Edit right
    const titleRow = new Grid(`titleRow_${key}`);
    titleRow.width = "100%";
    titleRow.height = "32px";
    titleRow.addColumnDefinition(isMobile ? 28 : 32, true); // Symbol fixed width
    titleRow.addColumnDefinition(1, false); // Class name takes remaining space
    titleRow.addColumnDefinition(isMobile ? 32 : 50, true); // Edit button fixed width
    titleRow.addRowDefinition(1);
    copyStack.addControl(titleRow);

    // Symbol (left)
    const symbolText = new TextBlock(`symbol_${key}`);
    symbolText.text = UNIT_DESIGNATIONS[unitIndex];
    symbolText.color = COLORS.accentOrange;
    symbolText.fontSize = isMobile ? 20 : 18;
    symbolText.fontFamily = "'Bebas Neue', sans-serif";
    symbolText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    symbolText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    symbolText.paddingLeft = "2px";
    titleRow.addControl(symbolText, 0, 0);

    // Class name (center)
    const classText = new TextBlock(`class_${key}`);
    classText.text = CLASS_INFO[state.selectedClass].name;
    classText.color = COLORS.accentOrange;
    classText.fontSize = isMobile ? 18 : 16;
    classText.fontFamily = "'Bebas Neue', sans-serif";
    classText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    classText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    titleRow.addControl(classText, 0, 1);

    // Edit button (right)
    const editBtn = Button.CreateSimpleButton(`edit_${key}`, isMobile ? "✎" : "Edit");
    editBtn.width = isMobile ? "28px" : "45px";
    editBtn.height = isMobile ? "28px" : "26px";
    editBtn.background = COLORS.bgButton;
    editBtn.color = COLORS.textPrimary;
    editBtn.cornerRadius = isMobile ? 14 : 4;
    editBtn.fontSize = isMobile ? 14 : 11;
    editBtn.thickness = 1;
    editBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    editBtn.onPointerEnterObservable.add(() => {
      editBtn.background = COLORS.bgButtonHover;
    });
    editBtn.onPointerOutObservable.add(() => {
      editBtn.background = COLORS.bgButton;
    });
    editBtn.onPointerClickObservable.add(() => {
      openCustomizeEditor(playerId, unitIndex);
    });
    titleRow.addControl(editBtn, 0, 2);

    // Description - auto-sizes to content
    const descText = new TextBlock(`desc_${key}`);
    descText.text = getUnitDescription(state.selectedClass, state.selectedBoost, state.selectedStyle);
    descText.color = COLORS.textSecondary;
    descText.fontSize = isMobile ? 11 : isTablet ? 12 : 13;
    descText.textWrapping = true;
    descText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    descText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    descText.resizeToFit = true;
    descText.paddingTop = "8px";
    descText.paddingLeft = "2px";
    descText.paddingRight = "5px";
    copyStack.addControl(descText);

    // Right column: preview
    const previewContainer = new Rectangle(`preview_${key}`);
    previewContainer.width = "100%";
    previewContainer.height = "100%";
    previewContainer.background = COLORS.bgPreview;
    previewContainer.cornerRadius = 8;
    previewContainer.thickness = 0;
    previewContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    cardGrid.addControl(previewContainer, 0, 1);

    // Update callback for this card
    const updateCard = (): void => {
      const s = unitStates[key];
      classText.text = CLASS_INFO[s.selectedClass].name;
      descText.text = getUnitDescription(s.selectedClass, s.selectedBoost, s.selectedStyle);
    };
    cardUpdateCallbacks[playerId].push(updateCard);

    // Setup RTT preview
    setupCardPreview(previewContainer, playerId, unitIndex);

    return card;
  }

  // ============================================
  // RTT PREVIEW SYSTEM
  // ============================================

  function setupCardPreview(container: Rectangle, playerId: string, unitIndex: number): void {
    const key = `${playerId}_${unitIndex}`;
    const rttSize = 256;

    const rtt = new RenderTargetTexture(`rtt_${key}`, rttSize, scene, false);
    rtt.clearColor = hexToColor4(COLORS.bgPreview);
    scene.customRenderTargets.push(rtt);

    const previewCamera = new ArcRotateCamera(
      `cam_${key}`,
      -Math.PI / 2 + 0.2,  // Rotated 180 degrees to face user
      Math.PI / 2.3,
      2.0,  // Zoomed in closer
      new Vector3(0, 1.0, 0),  // Slightly higher target
      scene
    );
    rtt.activeCamera = previewCamera;

    // Force square aspect ratio
    const originalGetEngine = previewCamera.getEngine.bind(previewCamera);
    previewCamera.getEngine = () => {
      const eng = originalGetEngine();
      return { ...eng, getAspectRatio: () => 1 } as any;
    };

    const layerMask = 0x10000000 << (playerId === "player1" ? unitIndex : unitIndex + 3);
    previewCamera.layerMask = layerMask;

    const canvas = document.createElement("canvas");
    canvas.width = rttSize;
    canvas.height = rttSize;
    const ctx = canvas.getContext("2d")!;

    // Inner container: takes full height, width matches height (square)
    // This ensures the square preview image fills the container without cutoff
    const innerContainer = new Rectangle(`innerPreview_${key}`);
    innerContainer.width = "100%";  // Start with 100%, will be adjusted to square
    innerContainer.height = "100%";
    innerContainer.thickness = 0;
    innerContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    container.addControl(innerContainer);

    // Set width to match height after layout (make it square)
    const updateInnerSize = () => {
      const h = container.heightInPixels;
      if (h > 0) {
        innerContainer.width = `${h}px`;
      }
    };
    container.onAfterDrawObservable.add(updateInnerSize);

    const loadingText = new TextBlock();
    loadingText.text = "Loading...";
    loadingText.color = "#666666";
    loadingText.fontSize = 11;
    innerContainer.addControl(loadingText);

    const previewImage = new Image(`img_${key}`, "");
    previewImage.stretch = Image.STRETCH_UNIFORM;
    previewImage.width = "100%";
    previewImage.height = "100%";
    previewImage.alpha = 0;
    innerContainer.addControl(previewImage);

    let frameCount = 0;
    let previewModelLoaded = false;

    // Rotation and animation cycling state
    const rotationSpeed = 0.008; // Radians per frame (slow rotation)
    let totalRotation = 0;
    let currentAnimPhase = 0; // 0=idle, 1=attack, 2=run

    rtt.onAfterRenderObservable.add(() => {
      if (!previewModelLoaded) return;

      frameCount++;

      // Rotate camera slowly
      previewCamera.alpha += rotationSpeed;
      totalRotation += rotationSpeed;

      // After one full rotation, cycle to next animation
      if (totalRotation >= Math.PI * 2) {
        totalRotation = 0;
        currentAnimPhase = (currentAnimPhase + 1) % 3;

        const state = unitStates[key];
        const isMelee = state.selectedStyle === "melee";

        // Stop current animations
        unitPreviewAnims.forEach(ag => ag.stop());

        if (currentAnimPhase === 0) {
          // Idle
          const idleAnim = isMelee
            ? unitPreviewAnims.find(ag => ag.name === "Idle_Sword")
            : unitPreviewAnims.find(ag => ag.name === "Idle_Gun");
          if (idleAnim) idleAnim.start(true);
        } else if (currentAnimPhase === 1) {
          // Attack (loop for full rotation)
          const attackAnim = isMelee
            ? unitPreviewAnims.find(ag => ag.name === "Sword_Slash")
            : unitPreviewAnims.find(ag => ag.name === "Gun_Shoot");
          if (attackAnim) attackAnim.start(true);
        } else if (currentAnimPhase === 2) {
          // Run (loop for full rotation)
          const runAnim = unitPreviewAnims.find(ag => ag.name === "Run");
          if (runAnim) runAnim.start(true);
        }
      }

      // Only update image every few frames for performance
      // Skip updates during scroll to prevent flickering
      if (frameCount % 2 !== 0 || isScrolling) return;

      rtt.readPixels()?.then((buffer) => {
        if (!buffer) return;
        const pixels = new Uint8Array(buffer.buffer);
        const imageData = ctx.createImageData(rttSize, rttSize);

        for (let y = 0; y < rttSize; y++) {
          for (let x = 0; x < rttSize; x++) {
            const srcIdx = ((rttSize - 1 - y) * rttSize + x) * 4;
            const dstIdx = (y * rttSize + x) * 4;
            imageData.data[dstIdx] = pixels[srcIdx];
            imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
            imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
            imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
          }
        }
        ctx.putImageData(imageData, 0, 0);
        previewImage.source = canvas.toDataURL();
        if (previewImage.alpha < 1) {
          previewImage.alpha = 1;
          loadingText.isVisible = false;
        }
      });
    });

    let loadedModelKey = "";
    let unitPreviewMesh: AbstractMesh | null = null;
    let unitPreviewMeshes: AbstractMesh[] = [];
    let unitPreviewAnims: AnimationGroup[] = [];

    const updatePreviewAppearance = (): void => {
      if (unitPreviewMeshes.length === 0 || !unitPreviewMesh) return;

      const state = unitStates[key];
      const customization = state.customization;
      const headIndex = customization.head;
      const isMelee = state.selectedStyle === "melee";
      const isRightHanded = customization.handedness === "right";

      const teamColorHex = playerId === "player1" ? selections.player1TeamColor : selections.player2TeamColor;
      const teamColor = hexToColor3(teamColorHex || "#ff0000");

      const currentScale = unitPreviewMesh.scaling;
      unitPreviewMesh.scaling.x = isRightHanded ? -Math.abs(currentScale.x) : Math.abs(currentScale.x);

      unitPreviewMeshes.forEach(m => {
        if (m.material) {
          const mat = m.material as PBRMaterial;
          const matName = mat.name;

          if (matName === "TeamMain") {
            mat.albedoColor = teamColor;
          } else if (matName === "MainSkin") {
            mat.albedoColor = hexToColor3(SKIN_TONES[customization.skinTone] || SKIN_TONES[4]);
          } else if (matName === "MainHair") {
            mat.albedoColor = hexToColor3(HAIR_COLORS[customization.hairColor] || HAIR_COLORS[0]);
          } else if (matName === "MainEye") {
            mat.albedoColor = hexToColor3(EYE_COLORS[customization.eyeColor] || EYE_COLORS[2]);
          }
        }

        for (let i = 0; i < 4; i++) {
          const headName = `Head_00${i + 1}`;
          if (m.name.includes(headName)) {
            m.setEnabled(i === headIndex);
          }
        }

        const meshNameLower = m.name.toLowerCase();
        if (meshNameLower.includes("sword")) {
          m.setEnabled(isMelee);
        } else if (meshNameLower.includes("pistol")) {
          m.setEnabled(!isMelee);
        }
      });

      unitPreviewAnims.forEach(ag => ag.stop());
      const idleAnim = isMelee
        ? unitPreviewAnims.find(ag => ag.name === "Idle_Sword")
        : unitPreviewAnims.find(ag => ag.name === "Idle_Gun");
      if (idleAnim) {
        idleAnim.start(true);
      }

      // Reset animation cycle when appearance changes
      currentAnimPhase = 0;
      totalRotation = 0;
    };

    const loadUnitPreview = (): void => {
      const state = unitStates[key];
      const classData = getClassData(state.selectedClass);
      const body = state.customization.body;
      const gender = body === "male" ? "m" : "f";
      const modelKey = `${classData.modelFile}_${gender}`;

      if (modelKey === loadedModelKey && unitPreviewMesh) {
        updatePreviewAppearance();
        return;
      }

      previewModelLoaded = false;
      previewImage.alpha = 0;
      loadingText.isVisible = true;

      if (unitPreviewMesh) {
        if (rtt.renderList) {
          rtt.renderList.length = 0;
        }
        unitPreviewMesh.dispose();
        unitPreviewMesh = null;
        unitPreviewMeshes = [];
      }
      unitPreviewAnims.forEach(a => a.stop());
      unitPreviewAnims = [];

      const modelPath = `${import.meta.env.BASE_URL}models/${modelKey}.glb`;
      loadedModelKey = modelKey;

      SceneLoader.ImportMeshAsync("", modelPath, "", scene).then((result) => {
        unitPreviewMesh = result.meshes[0];
        unitPreviewMeshes = result.meshes;
        unitPreviewMesh.position = new Vector3(0, 0, 0);
        unitPreviewMesh.scaling.setAll(0.9);

        result.meshes.forEach(m => {
          m.layerMask = layerMask;
        });

        if (rtt.renderList) {
          rtt.renderList.length = 0;
          result.meshes.forEach(m => rtt.renderList!.push(m));
        }

        unitPreviewAnims = result.animationGroups;
        previewModelLoaded = true;
        updatePreviewAppearance();
      }).catch((error) => {
        console.error(`Failed to load model: ${modelPath}`, error);
        loadingText.text = "Error loading";
      });
    };

    // Register callbacks
    previewRefreshCallbacks[playerId as "player1" | "player2"].push(updatePreviewAppearance);
    previewReloadCallbacks[playerId as "player1" | "player2"].push(loadUnitPreview);

    // Animation sync callback - resets to idle and syncs rotation
    const syncAnimation = (): void => {
      currentAnimPhase = 0;
      totalRotation = 0;
      previewCamera.alpha = -Math.PI / 2 + 0.2; // Reset rotation

      // Start idle animation
      if (unitPreviewAnims.length > 0) {
        const state = unitStates[key];
        const isMelee = state.selectedStyle === "melee";
        unitPreviewAnims.forEach(ag => ag.stop());
        const idleAnim = isMelee
          ? unitPreviewAnims.find(ag => ag.name === "Idle_Sword")
          : unitPreviewAnims.find(ag => ag.name === "Idle_Gun");
        if (idleAnim) idleAnim.start(true);
      }
    };
    previewAnimSyncCallbacks.push(syncAnimation);

    // Initial load
    loadUnitPreview();
  }

  // ============================================
  // CUSTOMIZE EDITOR (Full Overlay)
  // ============================================

  const customizeOverlay = new Rectangle("customizeOverlay");
  customizeOverlay.width = "100%";
  customizeOverlay.height = "100%";
  customizeOverlay.background = COLORS.bgDeep;
  customizeOverlay.thickness = 0;
  customizeOverlay.isVisible = false;
  customizeOverlay.zIndex = 500;
  gui.addControl(customizeOverlay);

  // Editor state
  let editingPlayerId: "player1" | "player2" = "player1";
  let editingUnitIndex = 0;
  let editingState: UnitState | null = null;
  // originalState removed - was reserved for cancel/undo but never read

  // Editor RTT preview
  const editorRttSize = 512;
  const editorRtt = new RenderTargetTexture("editorRtt", editorRttSize, scene, false);
  editorRtt.clearColor = hexToColor4(COLORS.bgPreview);
  scene.customRenderTargets.push(editorRtt);

  const editorPreviewCamera = new ArcRotateCamera(
    "editorPreviewCam",
    -Math.PI / 2 + 0.2,  // Rotated 180 degrees to face user
    Math.PI / 2.3,
    2.8,
    new Vector3(0, 0.95, 0),
    scene
  );
  editorRtt.activeCamera = editorPreviewCamera;

  const editorOriginalGetEngine = editorPreviewCamera.getEngine.bind(editorPreviewCamera);
  editorPreviewCamera.getEngine = () => {
    const eng = editorOriginalGetEngine();
    return { ...eng, getAspectRatio: () => 1 } as any;
  };

  const editorLayerMask = 0x20000000;
  editorPreviewCamera.layerMask = editorLayerMask;

  const editorCanvas = document.createElement("canvas");
  editorCanvas.width = editorRttSize;
  editorCanvas.height = editorRttSize;
  const editorCtx = editorCanvas.getContext("2d")!;

  const editorPreviewImage = new Image("editorPreviewImg", "");
  editorPreviewImage.stretch = Image.STRETCH_UNIFORM;

  let editorPreviewMesh: AbstractMesh | null = null;
  let editorPreviewMeshes: AbstractMesh[] = [];
  let editorPreviewAnimations: AnimationGroup[] = [];
  let editorLoadedModelKey = "";

  let editorFrameCount = 0;
  editorRtt.onAfterRenderObservable.add(() => {
    if (!customizeOverlay.isVisible) return;

    editorFrameCount++;
    if (editorFrameCount % 3 !== 0) return;

    editorRtt.readPixels()?.then((buffer) => {
      if (!buffer) return;
      const pixels = new Uint8Array(buffer.buffer);
      const imageData = editorCtx.createImageData(editorRttSize, editorRttSize);

      for (let y = 0; y < editorRttSize; y++) {
        for (let x = 0; x < editorRttSize; x++) {
          const srcIdx = ((editorRttSize - 1 - y) * editorRttSize + x) * 4;
          const dstIdx = (y * editorRttSize + x) * 4;
          imageData.data[dstIdx] = pixels[srcIdx];
          imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
          imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
          imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
        }
      }
      editorCtx.putImageData(imageData, 0, 0);
      editorPreviewImage.source = editorCanvas.toDataURL();
    });
  });

  // Editor layout
  const editorGrid = new Grid("editorGrid");
  editorGrid.width = "100%";
  editorGrid.height = "100%";

  if (isMobile) {
    editorGrid.addRowDefinition(0.35);
    editorGrid.addRowDefinition(0.65);
    editorGrid.addColumnDefinition(1);
  } else {
    editorGrid.addRowDefinition(1);
    editorGrid.addColumnDefinition(0.4);
    editorGrid.addColumnDefinition(0.6);
  }
  customizeOverlay.addControl(editorGrid);

  // Preview area
  const previewArea = new Rectangle("editorPreviewArea");
  previewArea.background = COLORS.bgPreview;
  previewArea.thickness = 0;

  const previewSize = isMobile ? Math.min(screenWidth * 0.8, screenHeight * 0.3) : screenHeight * 0.7;
  editorPreviewImage.width = `${previewSize}px`;
  editorPreviewImage.height = `${previewSize}px`;
  previewArea.addControl(editorPreviewImage);

  if (isMobile) {
    editorGrid.addControl(previewArea, 0, 0);
  } else {
    editorGrid.addControl(previewArea, 0, 1);
  }

  // Options panel (scrollable)
  const optionsScroll = new ScrollViewer("editorOptionsScroll");
  optionsScroll.width = "100%";
  optionsScroll.height = "100%";
  optionsScroll.thickness = 0;
  optionsScroll.barSize = 8;
  optionsScroll.barColor = COLORS.borderWarm;

  if (isMobile) {
    editorGrid.addControl(optionsScroll, 1, 0);
  } else {
    editorGrid.addControl(optionsScroll, 0, 0);
  }

  const optionsStack = new StackPanel("editorOptionsStack");
  optionsStack.width = "100%";
  optionsStack.isVertical = true;
  optionsStack.paddingBottom = "20px";
  optionsScroll.addControl(optionsStack);

  // Header with back button and title
  const headerRow = new StackPanel("editorHeader");
  headerRow.isVertical = false;
  headerRow.width = "100%";
  headerRow.height = "50px";
  headerRow.paddingLeft = "10px";
  headerRow.paddingRight = "10px";
  headerRow.paddingTop = "10px";
  optionsStack.addControl(headerRow);

  const backBtn = Button.CreateSimpleButton("backBtn", "← Back");
  backBtn.width = "80px";
  backBtn.height = "36px";
  backBtn.background = COLORS.bgButton;
  backBtn.color = COLORS.textPrimary;
  backBtn.cornerRadius = 4;
  backBtn.fontSize = smallFontSize;
  backBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  backBtn.onPointerClickObservable.add(() => closeCustomizeEditor(false));
  headerRow.addControl(backBtn);

  const editorTitle = new TextBlock("editorTitle");
  editorTitle.text = "Δ Customize";
  editorTitle.color = COLORS.accentOrange;
  editorTitle.fontSize = 20;
  editorTitle.fontFamily = "'Bebas Neue', sans-serif";
  editorTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  editorTitle.resizeToFit = true;
  headerRow.addControl(editorTitle);

  // Spacer to balance the back button
  const headerSpacer = new Rectangle();
  headerSpacer.width = "80px";
  headerSpacer.height = "1px";
  headerSpacer.thickness = 0;
  headerRow.addControl(headerSpacer);

  // Option button tracking
  const editorOptionButtons: Map<string, Button[]> = new Map();
  const editorColorSwatches: Map<string, Rectangle[]> = new Map();

  // Helper to create option row
  function createEditorOption(
    label: string,
    options: string[],
    getValue: () => number,
    onChange: (idx: number) => void
  ): StackPanel {
    const container = new StackPanel(`editor_${label}`);
    container.width = "100%";
    container.isVertical = true;
    container.paddingTop = "8px";
    container.paddingBottom = "8px";
    container.paddingLeft = "15px";
    container.paddingRight = "15px";

    const labelText = new TextBlock();
    labelText.text = label.toUpperCase();
    labelText.color = COLORS.textMuted;
    labelText.fontSize = smallFontSize;
    labelText.height = "24px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(labelText);

    const btnRow = new StackPanel();
    btnRow.isVertical = false;
    btnRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    btnRow.height = `${smallButtonHeight + 4}px`;
    container.addControl(btnRow);

    const buttons: Button[] = [];
    options.forEach((opt, i) => {
      const btn = Button.CreateSimpleButton(`${label}_${i}`, opt);
      btn.width = `${Math.max(60, opt.length * 10 + 20)}px`;
      btn.height = `${smallButtonHeight}px`;
      btn.color = COLORS.textPrimary;
      btn.background = getValue() === i ? COLORS.selected : COLORS.bgButton;
      btn.cornerRadius = 4;
      btn.fontSize = smallFontSize;
      btn.paddingLeft = "3px";
      btn.paddingRight = "3px";
      btn.thickness = 1;

      btn.onPointerEnterObservable.add(() => {
        if (btn.background !== COLORS.selected) {
          btn.background = COLORS.bgButtonHover;
        }
      });
      btn.onPointerOutObservable.add(() => {
        if (btn.background !== COLORS.selected) {
          btn.background = COLORS.bgButton;
        }
      });

      btn.onPointerClickObservable.add(() => {
        buttons.forEach((b, j) => {
          b.background = j === i ? COLORS.selected : COLORS.bgButton;
        });
        onChange(i);
        updateEditorPreview();
      });

      buttons.push(btn);
      btnRow.addControl(btn);
    });

    editorOptionButtons.set(label, buttons);
    return container;
  }

  function createEditorColorOption(
    label: string,
    colors: readonly string[],
    getValue: () => number,
    onChange: (idx: number) => void
  ): StackPanel {
    const container = new StackPanel(`editor_${label}`);
    container.width = "100%";
    container.isVertical = true;
    container.paddingTop = "8px";
    container.paddingBottom = "8px";
    container.paddingLeft = "15px";
    container.paddingRight = "15px";

    const labelText = new TextBlock();
    labelText.text = label.toUpperCase();
    labelText.color = COLORS.textMuted;
    labelText.fontSize = smallFontSize;
    labelText.height = "24px";
    labelText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    container.addControl(labelText);

    const swatchRow = new StackPanel();
    swatchRow.isVertical = false;
    swatchRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    swatchRow.height = "32px";
    container.addControl(swatchRow);

    const swatches: Rectangle[] = [];

    colors.forEach((color, i) => {
      const swatch = new Rectangle();
      swatch.width = "28px";
      swatch.height = "28px";
      swatch.background = color;
      swatch.thickness = getValue() === i ? 3 : 1;
      swatch.color = getValue() === i ? COLORS.accentOrange : COLORS.borderWarm;
      swatch.cornerRadius = 4;
      swatch.paddingLeft = "2px";
      swatch.paddingRight = "2px";

      swatch.onPointerClickObservable.add(() => {
        swatches.forEach((s, j) => {
          s.thickness = j === i ? 3 : 1;
          s.color = j === i ? COLORS.accentOrange : COLORS.borderWarm;
        });
        onChange(i);
        updateEditorPreview();
      });

      swatches.push(swatch);
      swatchRow.addControl(swatch);
    });

    editorColorSwatches.set(label, swatches);
    return container;
  }

  // Add CLASS option
  optionsStack.addControl(createEditorOption(
    "Class",
    ["Soldier", "Operator", "Medic"],
    () => ALL_CLASSES.indexOf(editingState?.selectedClass || "soldier"),
    (idx) => {
      if (editingState) {
        const newClass = ALL_CLASSES[idx];
        editingState.selectedClass = newClass;
        // If not previously customized, randomize appearance
        if (!editingState.hasBeenCustomized) {
          editingState.customization = randomizeAppearance(editingState.selectedStyle);
          refreshAllEditorOptions();
        }
      }
    }
  ));

  // Add BOOST option
  optionsStack.addControl(createEditorOption(
    "Boost",
    BOOST_INFO.map(b => b.name),
    () => editingState?.selectedBoost ?? 0,
    (idx) => { if (editingState) editingState.selectedBoost = idx; }
  ));

  // Add WEAPON option
  optionsStack.addControl(createEditorOption(
    "Weapon",
    ["Ranged", "Melee"],
    () => editingState?.selectedStyle === "melee" ? 1 : 0,
    (idx) => {
      if (editingState) {
        editingState.selectedStyle = idx === 1 ? "melee" : "ranged";
        editingState.customization.combatStyle = editingState.selectedStyle;
      }
    }
  ));

  // Separator
  const editorSeparator = new Rectangle("editorSeparator");
  editorSeparator.width = "90%";
  editorSeparator.height = "1px";
  editorSeparator.background = COLORS.borderWarm;
  editorSeparator.thickness = 0;
  optionsStack.addControl(editorSeparator);

  // Add BODY option
  optionsStack.addControl(createEditorOption(
    "Body",
    ["Male", "Female"],
    () => editingState?.customization.body === "female" ? 1 : 0,
    (idx) => {
      if (editingState) {
        editingState.customization.body = idx === 1 ? "female" : "male";
        editorLoadedModelKey = ""; // Force model reload
      }
    }
  ));

  // Add HEAD option
  optionsStack.addControl(createEditorOption(
    "Head",
    ["1", "2", "3", "4"],
    () => editingState?.customization.head ?? 0,
    (idx) => { if (editingState) editingState.customization.head = idx; }
  ));

  // Add HANDEDNESS option
  optionsStack.addControl(createEditorOption(
    "Handedness",
    ["Right", "Left"],
    () => editingState?.customization.handedness === "left" ? 1 : 0,
    (idx) => { if (editingState) editingState.customization.handedness = idx === 1 ? "left" : "right"; }
  ));

  // Add color options
  optionsStack.addControl(createEditorColorOption(
    "Skin Tone",
    SKIN_TONES,
    () => editingState?.customization.skinTone ?? 4,
    (idx) => { if (editingState) editingState.customization.skinTone = idx; }
  ));

  optionsStack.addControl(createEditorColorOption(
    "Hair Color",
    HAIR_COLORS,
    () => editingState?.customization.hairColor ?? 0,
    (idx) => { if (editingState) editingState.customization.hairColor = idx; }
  ));

  optionsStack.addControl(createEditorColorOption(
    "Eye Color",
    EYE_COLORS,
    () => editingState?.customization.eyeColor ?? 2,
    (idx) => { if (editingState) editingState.customization.eyeColor = idx; }
  ));

  // Save/Cancel buttons
  const buttonRow = new StackPanel("editorButtons");
  buttonRow.isVertical = false;
  buttonRow.height = `${buttonHeight + 20}px`;
  buttonRow.paddingTop = "15px";
  optionsStack.addControl(buttonRow);

  const saveBtn = Button.CreateSimpleButton("saveBtn", "Save");
  saveBtn.width = "100px";
  saveBtn.height = `${buttonHeight}px`;
  saveBtn.background = COLORS.success;
  saveBtn.color = COLORS.textPrimary;
  saveBtn.cornerRadius = 6;
  saveBtn.fontSize = fontSize;
  saveBtn.onPointerClickObservable.add(() => closeCustomizeEditor(true));
  buttonRow.addControl(saveBtn);

  const btnSpacer = new Rectangle();
  btnSpacer.width = "20px";
  btnSpacer.height = "1px";
  btnSpacer.thickness = 0;
  buttonRow.addControl(btnSpacer);

  const cancelBtn = Button.CreateSimpleButton("cancelBtn", "Cancel");
  cancelBtn.width = "100px";
  cancelBtn.height = `${buttonHeight}px`;
  cancelBtn.background = COLORS.bgButton;
  cancelBtn.color = COLORS.textPrimary;
  cancelBtn.cornerRadius = 6;
  cancelBtn.fontSize = fontSize;
  cancelBtn.onPointerClickObservable.add(() => closeCustomizeEditor(false));
  buttonRow.addControl(cancelBtn);

  function refreshAllEditorOptions(): void {
    if (!editingState) return;

    // Refresh class buttons
    const classButtons = editorOptionButtons.get("Class");
    if (classButtons) {
      const classIdx = ALL_CLASSES.indexOf(editingState.selectedClass);
      classButtons.forEach((b, i) => {
        b.background = i === classIdx ? COLORS.selected : COLORS.bgButton;
      });
    }

    // Refresh boost buttons
    const boostButtons = editorOptionButtons.get("Boost");
    if (boostButtons) {
      boostButtons.forEach((b, i) => {
        b.background = i === editingState!.selectedBoost ? COLORS.selected : COLORS.bgButton;
      });
    }

    // Refresh weapon buttons
    const weaponButtons = editorOptionButtons.get("Weapon");
    if (weaponButtons) {
      const weaponIdx = editingState.selectedStyle === "melee" ? 1 : 0;
      weaponButtons.forEach((b, i) => {
        b.background = i === weaponIdx ? COLORS.selected : COLORS.bgButton;
      });
    }

    // Refresh body buttons
    const bodyButtons = editorOptionButtons.get("Body");
    if (bodyButtons) {
      const bodyIdx = editingState.customization.body === "female" ? 1 : 0;
      bodyButtons.forEach((b, i) => {
        b.background = i === bodyIdx ? COLORS.selected : COLORS.bgButton;
      });
    }

    // Refresh head buttons
    const headButtons = editorOptionButtons.get("Head");
    if (headButtons) {
      headButtons.forEach((b, i) => {
        b.background = i === editingState!.customization.head ? COLORS.selected : COLORS.bgButton;
      });
    }

    // Refresh handedness buttons
    const handButtons = editorOptionButtons.get("Handedness");
    if (handButtons) {
      const handIdx = editingState.customization.handedness === "left" ? 1 : 0;
      handButtons.forEach((b, i) => {
        b.background = i === handIdx ? COLORS.selected : COLORS.bgButton;
      });
    }

    // Refresh color swatches
    const skinSwatches = editorColorSwatches.get("Skin Tone");
    if (skinSwatches) {
      skinSwatches.forEach((s, i) => {
        s.thickness = i === editingState!.customization.skinTone ? 3 : 1;
        s.color = i === editingState!.customization.skinTone ? COLORS.accentOrange : COLORS.borderWarm;
      });
    }

    const hairSwatches = editorColorSwatches.get("Hair Color");
    if (hairSwatches) {
      hairSwatches.forEach((s, i) => {
        s.thickness = i === editingState!.customization.hairColor ? 3 : 1;
        s.color = i === editingState!.customization.hairColor ? COLORS.accentOrange : COLORS.borderWarm;
      });
    }

    const eyeSwatches = editorColorSwatches.get("Eye Color");
    if (eyeSwatches) {
      eyeSwatches.forEach((s, i) => {
        s.thickness = i === editingState!.customization.eyeColor ? 3 : 1;
        s.color = i === editingState!.customization.eyeColor ? COLORS.accentOrange : COLORS.borderWarm;
      });
    }
  }

  function updateEditorPreview(): void {
    if (!editingState) return;

    const classData = getClassData(editingState.selectedClass);
    const body = editingState.customization.body;
    const gender = body === "male" ? "m" : "f";
    const modelKey = `${classData.modelFile}_${gender}`;

    if (modelKey !== editorLoadedModelKey) {
      // Load new model
      if (editorPreviewMesh) {
        if (editorRtt.renderList) {
          editorRtt.renderList.length = 0;
        }
        editorPreviewMesh.dispose();
        editorPreviewMesh = null;
        editorPreviewMeshes = [];
      }
      editorPreviewAnimations.forEach(a => a.stop());
      editorPreviewAnimations = [];

      const modelPath = `${import.meta.env.BASE_URL}models/${modelKey}.glb`;
      editorLoadedModelKey = modelKey;

      SceneLoader.ImportMeshAsync("", modelPath, "", scene).then((result) => {
        editorPreviewMesh = result.meshes[0];
        editorPreviewMeshes = result.meshes;
        editorPreviewMesh.position = new Vector3(0, 0, 0);
        editorPreviewMesh.scaling.setAll(0.9);

        result.meshes.forEach(m => {
          m.layerMask = editorLayerMask;
        });

        if (editorRtt.renderList) {
          editorRtt.renderList.length = 0;
          result.meshes.forEach(m => editorRtt.renderList!.push(m));
        }

        editorPreviewAnimations = result.animationGroups;
        updateEditorPreviewAppearance();
      }).catch((error) => {
        console.error(`Failed to load editor model: ${modelPath}`, error);
      });
    } else {
      updateEditorPreviewAppearance();
    }
  }

  function updateEditorPreviewAppearance(): void {
    if (editorPreviewMeshes.length === 0 || !editorPreviewMesh || !editingState) return;

    const customization = editingState.customization;
    const headIndex = customization.head;
    const isMelee = editingState.selectedStyle === "melee";
    const isRightHanded = customization.handedness === "right";

    const teamColorHex = editingPlayerId === "player1"
      ? selections.player1TeamColor
      : selections.player2TeamColor;
    const teamColor = hexToColor3(teamColorHex || "#ff0000");

    const currentScale = editorPreviewMesh.scaling;
    editorPreviewMesh.scaling.x = isRightHanded ? -Math.abs(currentScale.x) : Math.abs(currentScale.x);

    editorPreviewMeshes.forEach(m => {
      if (m.material) {
        const mat = m.material as PBRMaterial;
        const matName = mat.name;

        if (matName === "TeamMain") {
          mat.albedoColor = teamColor;
        } else if (matName === "MainSkin") {
          mat.albedoColor = hexToColor3(SKIN_TONES[customization.skinTone] || SKIN_TONES[4]);
        } else if (matName === "MainHair") {
          mat.albedoColor = hexToColor3(HAIR_COLORS[customization.hairColor] || HAIR_COLORS[0]);
        } else if (matName === "MainEye") {
          mat.albedoColor = hexToColor3(EYE_COLORS[customization.eyeColor] || EYE_COLORS[2]);
        }
      }

      for (let i = 0; i < 4; i++) {
        const headName = `Head_00${i + 1}`;
        if (m.name.includes(headName)) {
          m.setEnabled(i === headIndex);
        }
      }

      const meshNameLower = m.name.toLowerCase();
      if (meshNameLower.includes("sword")) {
        m.setEnabled(isMelee);
      } else if (meshNameLower.includes("pistol")) {
        m.setEnabled(!isMelee);
      }
    });

    editorPreviewAnimations.forEach(ag => ag.stop());
    const idleAnim = isMelee
      ? editorPreviewAnimations.find(ag => ag.name === "Idle_Sword")
      : editorPreviewAnimations.find(ag => ag.name === "Idle_Gun");
    if (idleAnim) {
      idleAnim.start(true);
    }
  }

  function openCustomizeEditor(playerId: "player1" | "player2", unitIndex: number): void {
    editingPlayerId = playerId;
    editingUnitIndex = unitIndex;
    const key = `${playerId}_${unitIndex}`;

    // Deep copy the current state
    const current = unitStates[key];
    // Note: originalState backup removed - was for cancel/undo feature not yet implemented
    editingState = {
      selectedClass: current.selectedClass,
      selectedBoost: current.selectedBoost,
      selectedStyle: current.selectedStyle,
      customization: { ...current.customization },
      hasBeenCustomized: current.hasBeenCustomized,
    };

    editorTitle.text = `${UNIT_DESIGNATIONS[unitIndex]} Customize`;

    refreshAllEditorOptions();

    editorLoadedModelKey = ""; // Force model reload
    updateEditorPreview();

    optionsScroll.verticalBar.value = 0;
    customizeOverlay.isVisible = true;
  }

  function closeCustomizeEditor(save: boolean): void {
    if (save && editingState) {
      // Apply changes
      const key = `${editingPlayerId}_${editingUnitIndex}`;
      unitStates[key] = {
        ...editingState,
        hasBeenCustomized: true,
      };

      // Sync selections
      syncSelectionsFromStates();

      // Update card
      cardUpdateCallbacks[editingPlayerId].forEach(cb => cb());

      // Reload preview
      previewReloadCallbacks[editingPlayerId][editingUnitIndex]?.();

      // Sync all preview animations to idle
      previewAnimSyncCallbacks.forEach(cb => cb());

      updateStartButton();
    }

    customizeOverlay.isVisible = false;
    editingState = null;

    // Clean up editor preview model
    if (editorPreviewMesh) {
      if (editorRtt.renderList) {
        editorRtt.renderList.length = 0;
      }
      editorPreviewMesh.dispose();
      editorPreviewMesh = null;
      editorPreviewMeshes = [];
    }
    editorPreviewAnimations.forEach(a => a.stop());
    editorPreviewAnimations = [];
    editorLoadedModelKey = "";
  }

  // Custom drag-to-scroll for editor
  let editorDragging = false;
  let editorLastY = 0;

  const editorTouchStart = (e: TouchEvent) => {
    if (!customizeOverlay.isVisible) return;

    // Only start drag in options area
    const touchY = e.touches[0].clientY;
    const threshold = isMobile ? screenHeight * 0.35 : 0;
    if (touchY < threshold) return;

    editorDragging = true;
    editorLastY = touchY;
  };

  const editorTouchMove = (e: TouchEvent) => {
    if (!editorDragging || !customizeOverlay.isVisible) return;

    const touchY = e.touches[0].clientY;
    const deltaY = editorLastY - touchY;
    editorLastY = touchY;

    const contentHeight = optionsStack.heightInPixels;
    const viewportHeight = optionsScroll.heightInPixels;
    const maxScroll = contentHeight - viewportHeight;

    if (maxScroll > 0) {
      const scrollDelta = deltaY / maxScroll;
      const newScroll = Math.max(0, Math.min(1, optionsScroll.verticalBar.value + scrollDelta));
      optionsScroll.verticalBar.value = newScroll;
    }
    e.preventDefault();
  };

  const editorTouchEnd = () => {
    editorDragging = false;
  };

  window.addEventListener("touchstart", editorTouchStart, { passive: false });
  window.addEventListener("touchmove", editorTouchMove, { passive: false });
  window.addEventListener("touchend", editorTouchEnd);

  scene.onDisposeObservable.add(() => {
    window.removeEventListener("touchstart", editorTouchStart);
    window.removeEventListener("touchmove", editorTouchMove);
    window.removeEventListener("touchend", editorTouchEnd);
  });

  // ============================================
  // START BUTTON (fixed at bottom)
  // ============================================
  const startBtnContainer = new Rectangle("startBtnContainer");
  startBtnContainer.width = "100%";
  startBtnContainer.height = "80px";
  startBtnContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  startBtnContainer.background = COLORS.bgDeep + "ee";
  startBtnContainer.thickness = 0;
  gui.addControl(startBtnContainer);

  const startBtn = Button.CreateSimpleButton("startBattle", "S T A R T   B A T T L E");
  startBtn.width = isMobile ? "80%" : isTablet ? "50%" : "300px";
  startBtn.height = `${buttonHeight + 10}px`;
  startBtn.color = COLORS.textPrimary;
  startBtn.background = COLORS.success;
  startBtn.cornerRadius = 6;
  startBtn.fontSize = fontSize + 2;
  startBtn.fontFamily = "'Bebas Neue', sans-serif";
  startBtn.onPointerClickObservable.add(() => {
    syncSelectionsFromStates();
    // Update game mode based on AI toggle
    selections.gameMode = isP2Computer ? "local-pve" : "local-pvp";
    selections.humanTeam = isP2Computer ? "player1" : "player1";
    setGameMode(selections.gameMode, selections.humanTeam);
    onStartBattle(selections);
  });
  startBtn.onPointerEnterObservable.add(() => {
    startBtn.background = COLORS.successHover;
  });
  startBtn.onPointerOutObservable.add(() => {
    startBtn.background = COLORS.success;
  });
  startBtnContainer.addControl(startBtn);

  function updateStartButton(): void {
    // Always ready since we have default units
    startBtn.isEnabled = true;
    startBtn.alpha = 1;
    startBtn.background = COLORS.success;
  }

  updateStartButton();

  return scene;
}
