/**
 * LoadoutScene.ts
 *
 * Team loadout configuration screen.
 * Players select and customize their 3 units before battle.
 *
 * Module structure:
 * - loadout/colors.ts - UI color palette
 * - loadout/constants.ts - Class/boost/weapon info
 * - loadout/types.ts - UnitState interface
 * - loadout/UnitPreview.ts - 3D model preview system
 * - loadout/CustomizeEditor.ts - Full-screen editor overlay
 * - loadout/ui-helpers.ts - Team header, color swatches, unit cards
 */

import {
  Engine,
  Scene,
  Color4,
  Vector3,
  ArcRotateCamera,
  HemisphericLight,
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
} from "@babylonjs/gui";
import { Loadout, SceneName, UnitCustomization } from "../types";
import { getGameMode, setGameMode, registerActiveMusic } from "../main";
import { enableTouchScroll, createMusicPlayer, type MusicPlayer } from "../utils";
import {
  TEAM_COLORS,
  SCENE_BACKGROUNDS,
  DEFAULT_PLAYER1_COLOR_INDEX,
  DEFAULT_PLAYER2_COLOR_INDEX,
  UNITS_PER_TEAM,
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
  BREAKPOINT_LANDSCAPE_PHONE_HEIGHT,
  BREAKPOINT_TABLET_MIN,
  BREAKPOINT_DESKTOP_MIN,
  BREAKPOINT_LARGE_DESKTOP_MIN,
  SCROLLBAR_SIZE,
  SCROLLBAR_COLOR,
  SCROLLBAR_BACKGROUND,
  MUSIC,
  AUDIO_VOLUMES,
  LOOP_BUFFER_TIME,
  DEBUG_SKIP_OFFSET,
} from "../config";

// Loadout module imports
import {
  COLORS,
  UnitState,
  createUnitPreview,
  UnitPreviewController,
  createCustomizeEditor,
  CustomizeEditorController,
  createTeamColorSwatches,
  createTeamHeader,
  createUnitCard,
  UnitCardController,
} from "./loadout";

// =============================================================================
// MODULE STATE (persists across orientation reloads)
// =============================================================================

let loadoutMusic: MusicPlayer | null = null;
let pendingEditorRestore: { playerId: "player1" | "player2"; unitIndex: number } | null = null;
let orientationReloadInProgress = false;

// Loadout state that persists across orientation changes
let persistedUnitStates: Record<string, UnitState> | null = null;
let persistedSelections: Loadout | null = null;
let persistedCurrentTeam: "player1" | "player2" = "player1";
let persistedIsP2Computer = true;

/** Reset loadout state (call when leaving loadout scene for battle) */
export function resetLoadoutState(): void {
  persistedUnitStates = null;
  persistedSelections = null;
  persistedCurrentTeam = "player1";
  persistedIsP2Computer = true;
}

// =============================================================================
// MAIN SCENE FUNCTION
// =============================================================================

export function createLoadoutScene(
  engine: Engine,
  _canvas: HTMLCanvasElement,
  onStartBattle: (loadout: Loadout) => void,
  navigateTo: (scene: SceneName) => void
): Scene {
  const scene = new Scene(engine);
  scene.environmentTexture = null; // Prevent rgbdDecode shader errors

  let sceneDisposed = false;

  // Resource tracking for cleanup
  const rttList: RenderTargetTexture[] = [];
  const loadedMeshes: AbstractMesh[] = [];
  const loadedAnimationGroups: AnimationGroup[] = [];

  // Helper to disable IBL on PBR materials
  const disableMaterialIBL = (meshes: AbstractMesh[]): void => {
    meshes.forEach(m => {
      if (m.material && (m.material as PBRMaterial).reflectionTexture !== undefined) {
        const mat = m.material as PBRMaterial;
        mat.reflectionTexture = null;
        mat.environmentIntensity = 0;
      }
    });
  };

  // Background color
  const bg = SCENE_BACKGROUNDS.loadout;
  scene.clearColor = new Color4(bg.r, bg.g, bg.b, bg.a);

  // ============================================
  // RESPONSIVE SIZING
  // ============================================
  const screenWidth = engine.getRenderWidth();
  const screenHeight = engine.getRenderHeight();
  const isLandscapePhone = screenHeight < BREAKPOINT_LANDSCAPE_PHONE_HEIGHT && screenWidth < BREAKPOINT_DESKTOP_MIN;
  const isMobile = screenWidth < BREAKPOINT_TABLET_MIN || isLandscapePhone;
  const isTablet = screenWidth >= BREAKPOINT_TABLET_MIN && screenWidth < BREAKPOINT_DESKTOP_MIN && !isLandscapePhone;
  const isLargeDesktop = screenWidth >= BREAKPOINT_LARGE_DESKTOP_MIN;
  const isPortraitTablet = screenWidth >= BREAKPOINT_TABLET_MIN && screenHeight > screenWidth && !isLandscapePhone;
  const useTabLayout = !isLargeDesktop && !isPortraitTablet;

  const buttonHeight = isMobile ? 44 : isTablet ? 46 : 48;
  const smallButtonHeight = isMobile ? 40 : isTablet ? 42 : 44;
  const fontSize = isMobile ? 13 : isTablet ? 14 : 15;
  const smallFontSize = isMobile ? 11 : isTablet ? 12 : 13;

  // ============================================
  // ORIENTATION CHANGE HANDLING
  // ============================================
  const initialOrientation = screenWidth > screenHeight ? "landscape" : "portrait";
  let reloadPending = false;
  let isOrientationReload = false;

  const handleResize = () => {
    if (reloadPending || orientationReloadInProgress) return;

    const newWidth = engine.getRenderWidth();
    const newHeight = engine.getRenderHeight();
    const newOrientation = newWidth > newHeight ? "landscape" : "portrait";
    const orientationChanged = newOrientation !== initialOrientation;
    const significantResize = Math.abs(newWidth - screenWidth) > 100 || Math.abs(newHeight - screenHeight) > 100;

    if (orientationChanged || significantResize) {
      orientationReloadInProgress = true;
      reloadPending = true;
      isOrientationReload = true;
      setTimeout(() => navigateTo("loadout"), 100);
    }
  };

  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);
  scene.onDisposeObservable.add(() => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
  });

  // ============================================
  // MUSIC
  // ============================================
  if (!loadoutMusic) {
    loadoutMusic = createMusicPlayer(MUSIC.loadout, AUDIO_VOLUMES.music, true, LOOP_BUFFER_TIME);
    loadoutMusic.play();
  }
  registerActiveMusic(loadoutMusic);

  const skipHandler = (e: KeyboardEvent) => {
    if ((e.key === "s" || e.key === "S") && loadoutMusic?.duration) {
      loadoutMusic.currentTime = Math.max(0, loadoutMusic.duration - DEBUG_SKIP_OFFSET);
    }
  };
  window.addEventListener("keydown", skipHandler);
  scene.onDisposeObservable.add(() => window.removeEventListener("keydown", skipHandler));

  scene.onDisposeObservable.add(() => {
    if (!isOrientationReload && loadoutMusic) {
      loadoutMusic.dispose();
      loadoutMusic = null;
    }
  });

  // ============================================
  // CLEANUP
  // ============================================
  scene.onDisposeObservable.add(() => {
    sceneDisposed = true;
    loadedAnimationGroups.forEach(ag => { ag.stop(); ag.dispose(); });
    loadedAnimationGroups.length = 0;
    loadedMeshes.forEach(m => {
      try { m.material?.dispose(false, true); } catch { /* already disposed */ }
    });
    loadedMeshes.forEach(m => { if (!m.isDisposed()) m.dispose(false, true); });
    loadedMeshes.length = 0;
    rttList.forEach(rtt => rtt.dispose());
    rttList.length = 0;
    scene.customRenderTargets.length = 0;
  });

  // ============================================
  // CAMERA & LIGHTING
  // ============================================
  const camera = new ArcRotateCamera("cam", Math.PI / 2, Math.PI / 2.5, isLargeDesktop ? 8 : 4, new Vector3(0, 0.8, 0), scene);
  camera.lowerRadiusLimit = 2;
  camera.upperRadiusLimit = 12;
  scene.activeCamera = camera;

  const light = new HemisphericLight("light", new Vector3(0, 1, 0.5), scene);
  light.intensity = 1.2;

  const gui = AdvancedDynamicTexture.CreateFullscreenUI("UI");

  // ============================================
  // STATE (uses persisted state if available, for orientation reloads)
  // ============================================
  const { mode: gameMode, humanTeam } = getGameMode();

  function randomizeAppearance(weapon: "sword" | "pistol"): UnitCustomization {
    return {
      body: Math.random() > 0.5 ? "male" : "female",
      weapon: weapon,
      handedness: Math.random() > 0.5 ? "right" : "left",
      head: Math.floor(Math.random() * 4),
      hairColor: Math.floor(Math.random() * HAIR_COLORS.length),
      eyeColor: Math.floor(Math.random() * EYE_COLORS.length),
      skinTone: Math.floor(Math.random() * SKIN_TONES.length),
    };
  }

  // Initialize unit states (fresh or from persisted state)
  const defaultClasses = ["soldier", "operator", "medic"] as const;
  const defaultBoosts = [0, 1, 2];
  const defaultWeapons = ["pistol", "sword", "pistol"] as const;

  if (!persistedUnitStates) {
    persistedUnitStates = {};
    for (const playerId of ["player1", "player2"] as const) {
      for (let i = 0; i < UNITS_PER_TEAM; i++) {
        const key = `${playerId}_${i}`;
        persistedUnitStates[key] = {
          selectedClass: defaultClasses[i] || "soldier",
          selectedBoost: defaultBoosts[i] ?? 0,
          selectedWeapon: defaultWeapons[i] || "pistol",
          customization: randomizeAppearance(defaultWeapons[i] || "pistol"),
          hasBeenCustomized: false,
        };
      }
    }
  }
  const unitStates = persistedUnitStates;

  // Initialize selections (fresh or from persisted state)
  if (!persistedSelections) {
    persistedSelections = {
      player1: [],
      player2: [],
      player1TeamColor: TEAM_COLORS[DEFAULT_PLAYER1_COLOR_INDEX].hex,
      player2TeamColor: TEAM_COLORS[DEFAULT_PLAYER2_COLOR_INDEX].hex,
      gameMode,
      humanTeam,
    };
  }
  const selections = persistedSelections;

  // Restore UI state from persisted values
  let currentTeam: "player1" | "player2" = persistedCurrentTeam;
  let isP2Computer = persistedIsP2Computer;

  function syncSelectionsFromStates(): void {
    for (const playerId of ["player1", "player2"] as const) {
      selections[playerId] = [];
      for (let i = 0; i < UNITS_PER_TEAM; i++) {
        const state = unitStates[`${playerId}_${i}`];
        selections[playerId].push({
          unitClass: state.selectedClass,
          customization: { ...state.customization, weapon: state.selectedWeapon },
          boost: state.selectedBoost,
        });
      }
    }
  }

  syncSelectionsFromStates();

  // Preview tracking
  const previewControllers: Record<string, UnitPreviewController> = {};
  const cardControllers: UnitCardController[] = [];
  let isScrolling = false;

  // ============================================
  // MAIN SCROLL LAYOUT
  // ============================================
  const scrollViewer = new ScrollViewer("mainScroll");
  scrollViewer.width = "100%";
  scrollViewer.height = "100%";
  scrollViewer.thickness = 0;
  scrollViewer.wheelPrecision = 0.05;
  scrollViewer.barSize = SCROLLBAR_SIZE;
  scrollViewer.barColor = SCROLLBAR_COLOR;
  scrollViewer.barBackground = SCROLLBAR_BACKGROUND;
  gui.addControl(scrollViewer);
  if (scrollViewer.horizontalBar) scrollViewer.horizontalBar.isVisible = false;

  const mainStack = new StackPanel("mainStack");
  mainStack.width = "100%";
  mainStack.isVertical = true;
  mainStack.paddingBottom = "90px";
  scrollViewer.addControl(mainStack);

  const mainScrollCleanup = enableTouchScroll(scrollViewer, mainStack, {
    hideScrollbar: false,
    onScrollStart: () => { isScrolling = true; },
    onScrollEnd: () => { isScrolling = false; },
    scrollEndDelay: 150
  });
  scene.onDisposeObservable.add(() => mainScrollCleanup.dispose());

  // ============================================
  // TOP BAR (tabs or spacing)
  // ============================================
  const topBar = new Rectangle("topBar");
  topBar.width = "100%";
  topBar.height = useTabLayout ? "60px" : "20px";
  topBar.thickness = 0;
  topBar.background = useTabLayout ? COLORS.bgPanel : "transparent";
  mainStack.addControl(topBar);

  let p1Tab: Button | null = null;
  let p2Tab: Button | null = null;
  let tabColorRefresh: (() => void) | null = null;
  let tabAiToggleRow: Rectangle | null = null;
  let tabAiToggleText: TextBlock | null = null;
  let p1BorderContainer: Rectangle | null = null;
  let p2BorderContainer: Rectangle | null = null;

  if (useTabLayout) {
    // Tab buttons
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

    // Color swatches for tabs
    const colorContainer = new StackPanel("tabColorContainer");
    colorContainer.isVertical = false;
    colorContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    colorContainer.paddingRight = "10px";
    colorContainer.height = "100%";
    topBar.addControl(colorContainer);

    const tabSwatchController = createTeamColorSwatches({
      parent: colorContainer,
      getThisColor: () => currentTeam === "player1" ? selections.player1TeamColor! : selections.player2TeamColor!,
      getOtherColor: () => currentTeam === "player1" ? selections.player2TeamColor! : selections.player1TeamColor!,
      setThisColor: (hex) => {
        if (currentTeam === "player1") {
          selections.player1TeamColor = hex;
          if (p1BorderContainer) p1BorderContainer.color = hex;
        } else {
          selections.player2TeamColor = hex;
          if (p2BorderContainer) p2BorderContainer.color = hex;
        }
      },
      onColorChange: () => {
        const key = `${currentTeam}_`;
        Object.keys(previewControllers).filter(k => k.startsWith(key)).forEach(k => previewControllers[k].refresh());
      },
    });
    tabColorRefresh = tabSwatchController.refresh;

    // AI toggle row for P2
    tabAiToggleRow = new Rectangle("tabAiToggleRow");
    tabAiToggleRow.width = "95%";
    tabAiToggleRow.height = "40px";
    tabAiToggleRow.background = COLORS.bgButton;
    tabAiToggleRow.cornerRadius = 6;
    tabAiToggleRow.thickness = 0;
    tabAiToggleRow.isVisible = false;
    mainStack.addControl(tabAiToggleRow);

    tabAiToggleText = new TextBlock("tabAiToggleText");
    tabAiToggleText.text = isP2Computer ? "Computer Controlled: ON" : "Computer Controlled: OFF";
    tabAiToggleText.color = isP2Computer ? COLORS.accentBlue : COLORS.textSecondary;
    tabAiToggleText.fontSize = fontSize;
    tabAiToggleRow.addControl(tabAiToggleText);

    tabAiToggleRow.onPointerClickObservable.add(() => {
      isP2Computer = !isP2Computer;
      persistedIsP2Computer = isP2Computer;
      if (tabAiToggleText) {
        tabAiToggleText.text = isP2Computer ? "Computer Controlled: ON" : "Computer Controlled: OFF";
        tabAiToggleText.color = isP2Computer ? COLORS.accentBlue : COLORS.textSecondary;
      }
      tabAiToggleRow!.background = isP2Computer ? COLORS.accentBlueDeep : COLORS.bgButton;
    });
  }

  function switchTeam(team: "player1" | "player2"): void {
    currentTeam = team;
    persistedCurrentTeam = team;
    if (p1Tab && p2Tab) {
      p1Tab.background = team === "player1" ? COLORS.selected : COLORS.bgButton;
      p2Tab.background = team === "player2" ? COLORS.selected : COLORS.bgButton;
    }
    if (p1BorderContainer && p2BorderContainer && useTabLayout) {
      p1BorderContainer.isVisible = team === "player1";
      p2BorderContainer.isVisible = team === "player2";
    }
    tabColorRefresh?.();
    if (tabAiToggleRow) tabAiToggleRow.isVisible = team === "player2";
  }

  // ============================================
  // UNIT CARDS LAYOUT
  // ============================================
  function createBorderContainer(playerId: "player1" | "player2", visible: boolean): Rectangle {
    const container = new Rectangle(`${playerId}BorderContainer`);
    container.width = "95%";
    container.thickness = 3;
    container.color = playerId === "player1" ? selections.player1TeamColor! : selections.player2TeamColor!;
    container.cornerRadius = 12;
    container.background = "transparent";
    container.paddingTop = "8px";
    container.paddingBottom = "8px";
    container.paddingLeft = "8px";
    container.paddingRight = "8px";
    container.adaptHeightToChildren = true;
    container.isVisible = visible;
    return container;
  }

  function createCardsForTeam(playerId: "player1" | "player2", parent: StackPanel | Grid, useGrid: boolean): void {
    for (let i = 0; i < UNITS_PER_TEAM; i++) {
      const key = `${playerId}_${i}`;
      const cardCtrl = createUnitCard({
        playerId,
        unitIndex: i,
        getState: () => unitStates[key],
        screenWidth,
        isMobile,
        isTablet,
        useVerticalLayout: useTabLayout || isPortraitTablet,
        onCardClick: () => editor.open(playerId, i),
      });

      cardControllers.push(cardCtrl);

      if (useGrid) {
        (parent as Grid).addControl(cardCtrl.card, 0, i);
      } else {
        (parent as StackPanel).addControl(cardCtrl.card);
      }

      // Create preview
      const layerMask = 0x10000000 << (playerId === "player1" ? i : i + 3);
      const preview = createUnitPreview({
        scene,
        container: cardCtrl.previewContainer,
        id: key,
        layerMask,
        getTeamColor: () => playerId === "player1" ? selections.player1TeamColor! : selections.player2TeamColor!,
        getState: () => unitStates[key],
        isScrolling: () => isScrolling,
        disableMaterialIBL,
        registerForCleanup: (meshes, anims) => {
          meshes.forEach(m => loadedMeshes.push(m));
          anims.forEach(a => loadedAnimationGroups.push(a));
        },
        isSceneDisposed: () => sceneDisposed,
      });
      previewControllers[key] = preview;
      rttList.push(preview.getRTT());
    }
  }

  if (useTabLayout) {
    // Tab layout: vertical stacks, one visible at a time
    p1BorderContainer = createBorderContainer("player1", true);
    mainStack.addControl(p1BorderContainer);
    const p1CardsStack = new StackPanel("p1CardsStack");
    p1CardsStack.width = "100%";
    p1CardsStack.isVertical = true;
    p1BorderContainer.addControl(p1CardsStack);
    createCardsForTeam("player1", p1CardsStack, false);

    p2BorderContainer = createBorderContainer("player2", false);
    mainStack.addControl(p2BorderContainer);
    const p2CardsStack = new StackPanel("p2CardsStack");
    p2CardsStack.width = "100%";
    p2CardsStack.isVertical = true;
    p2BorderContainer.addControl(p2CardsStack);
    createCardsForTeam("player2", p2CardsStack, false);

  } else if (isPortraitTablet) {
    // Portrait tablet: both teams stacked vertically
    const p1Header = createTeamHeader({
      playerId: "player1",
      label: "PLAYER 1",
      getThisColor: () => selections.player1TeamColor!,
      getOtherColor: () => selections.player2TeamColor!,
      setThisColor: (hex) => { selections.player1TeamColor = hex; if (p1BorderContainer) p1BorderContainer.color = hex; },
      onColorChange: () => Object.keys(previewControllers).filter(k => k.startsWith("player1_")).forEach(k => previewControllers[k].refresh()),
      isP2Computer: false,
      onAiToggle: () => {},
    });
    mainStack.addControl(p1Header.container);

    p1BorderContainer = createBorderContainer("player1", true);
    mainStack.addControl(p1BorderContainer);
    const p1CardsStack = new StackPanel("p1CardsStack");
    p1CardsStack.width = "100%";
    p1CardsStack.isVertical = true;
    p1BorderContainer.addControl(p1CardsStack);
    createCardsForTeam("player1", p1CardsStack, false);

    const separator = new Rectangle("separator");
    separator.width = "90%";
    separator.height = "2px";
    separator.background = COLORS.borderWarm;
    separator.thickness = 0;
    mainStack.addControl(separator);

    const p2Header = createTeamHeader({
      playerId: "player2",
      label: "PLAYER 2",
      getThisColor: () => selections.player2TeamColor!,
      getOtherColor: () => selections.player1TeamColor!,
      setThisColor: (hex) => { selections.player2TeamColor = hex; if (p2BorderContainer) p2BorderContainer.color = hex; },
      onColorChange: () => Object.keys(previewControllers).filter(k => k.startsWith("player2_")).forEach(k => previewControllers[k].refresh()),
      isP2Computer,
      onAiToggle: (val) => { isP2Computer = val; persistedIsP2Computer = val; },
    });
    mainStack.addControl(p2Header.container);

    p2BorderContainer = createBorderContainer("player2", true);
    mainStack.addControl(p2BorderContainer);
    const p2CardsStack = new StackPanel("p2CardsStack");
    p2CardsStack.width = "100%";
    p2CardsStack.isVertical = true;
    p2BorderContainer.addControl(p2CardsStack);
    createCardsForTeam("player2", p2CardsStack, false);

  } else {
    // Large desktop: horizontal grid
    const p1Header = createTeamHeader({
      playerId: "player1",
      label: "PLAYER 1",
      getThisColor: () => selections.player1TeamColor!,
      getOtherColor: () => selections.player2TeamColor!,
      setThisColor: (hex) => { selections.player1TeamColor = hex; if (p1BorderContainer) p1BorderContainer.color = hex; },
      onColorChange: () => Object.keys(previewControllers).filter(k => k.startsWith("player1_")).forEach(k => previewControllers[k].refresh()),
      isP2Computer: false,
      onAiToggle: () => {},
    });
    mainStack.addControl(p1Header.container);

    p1BorderContainer = new Rectangle("p1BorderContainerDesktop");
    p1BorderContainer.width = "95%";
    p1BorderContainer.height = `${screenHeight * 0.38}px`;
    p1BorderContainer.thickness = 3;
    p1BorderContainer.color = selections.player1TeamColor!;
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
    createCardsForTeam("player1", p1Row, true);

    const separator = new Rectangle("separator");
    separator.width = "90%";
    separator.height = "2px";
    separator.background = COLORS.borderWarm;
    separator.thickness = 0;
    mainStack.addControl(separator);

    const p2Header = createTeamHeader({
      playerId: "player2",
      label: "PLAYER 2",
      getThisColor: () => selections.player2TeamColor!,
      getOtherColor: () => selections.player1TeamColor!,
      setThisColor: (hex) => { selections.player2TeamColor = hex; if (p2BorderContainer) p2BorderContainer.color = hex; },
      onColorChange: () => Object.keys(previewControllers).filter(k => k.startsWith("player2_")).forEach(k => previewControllers[k].refresh()),
      isP2Computer,
      onAiToggle: (val) => { isP2Computer = val; persistedIsP2Computer = val; },
    });
    mainStack.addControl(p2Header.container);

    p2BorderContainer = new Rectangle("p2BorderContainerDesktop");
    p2BorderContainer.width = "95%";
    p2BorderContainer.height = `${screenHeight * 0.38}px`;
    p2BorderContainer.thickness = 3;
    p2BorderContainer.color = selections.player2TeamColor!;
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
    createCardsForTeam("player2", p2Row, true);
  }

  // ============================================
  // CUSTOMIZE EDITOR
  // ============================================
  const editor: CustomizeEditorController = createCustomizeEditor({
    scene,
    gui,
    screenWidth,
    screenHeight,
    isMobile,
    isTablet,
    fontSize,
    smallFontSize,
    buttonHeight,
    smallButtonHeight,
    getUnitState: (pid, idx) => unitStates[`${pid}_${idx}`],
    setUnitState: (pid, idx, state) => { unitStates[`${pid}_${idx}`] = state; },
    getTeamColor: (pid) => pid === "player1" ? selections.player1TeamColor! : selections.player2TeamColor!,
    onSave: (pid, idx) => {
      syncSelectionsFromStates();
      const key = `${pid}_${idx}`;
      cardControllers.find(c => c.card.name === `card_${key}`)?.updateCard();
      previewControllers[key]?.reload();
      Object.values(previewControllers).forEach(p => p.syncAnimation());
    },
    randomizeAppearance,
    disableMaterialIBL,
    registerForCleanup: (meshes, anims) => {
      meshes.forEach(m => loadedMeshes.push(m));
      anims.forEach(a => loadedAnimationGroups.push(a));
    },
    isSceneDisposed: () => sceneDisposed,
  });

  scene.onDisposeObservable.add(() => editor.dispose());

  // ============================================
  // START BUTTON
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
    selections.gameMode = isP2Computer ? "local-pve" : "local-pvp";
    selections.humanTeam = isP2Computer ? "player1" : "player1";
    setGameMode(selections.gameMode, selections.humanTeam);
    onStartBattle(selections);
    // Reset persisted state so next loadout visit is fresh
    resetLoadoutState();
  });
  startBtn.onPointerEnterObservable.add(() => { startBtn.background = COLORS.successHover; });
  startBtn.onPointerOutObservable.add(() => { startBtn.background = COLORS.success; });
  startBtnContainer.addControl(startBtn);

  // ============================================
  // RESTORE EDITOR ON ORIENTATION CHANGE
  // ============================================
  if (pendingEditorRestore) {
    const { playerId, unitIndex } = pendingEditorRestore;
    setTimeout(() => editor.open(playerId, unitIndex), 100);
  }

  setTimeout(() => { orientationReloadInProgress = false; }, 200);

  return scene;
}
