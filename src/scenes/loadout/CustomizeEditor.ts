/**
 * CustomizeEditor.ts
 *
 * Full-screen overlay for customizing unit class, boost, weapon, and appearance.
 * Includes Cancel behavior that reverts changes to original state.
 */

import {
  Scene,
  Vector3,
  AbstractMesh,
  AnimationGroup,
} from "@babylonjs/core";
import {
  AdvancedDynamicTexture,
  Rectangle,
  StackPanel,
  Grid,
  TextBlock,
  Button,
  ScrollViewer,
  Control,
} from "@babylonjs/gui";
import { ALL_CLASSES } from "../../types";
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS, SCROLLBAR_SIZE, SCROLLBAR_COLOR, SCROLLBAR_BACKGROUND } from "../../config";
import { enableTouchScroll } from "../../utils";
import { COLORS } from "./colors";
import { CLASS_INFO, BOOST_INFO, WEAPON_INFO, UNIT_DESIGNATIONS, getUnitDescription } from "./constants";
import { UnitState } from "./types";
import { createUnitPreview, UnitPreviewController } from "./UnitPreview";

export interface CustomizeEditorConfig {
  scene: Scene;
  gui: AdvancedDynamicTexture;
  screenWidth: number;
  screenHeight: number;
  isMobile: boolean;
  isTablet: boolean;
  fontSize: number;
  smallFontSize: number;
  buttonHeight: number;
  smallButtonHeight: number;
  getUnitState: (playerId: "player1" | "player2", unitIndex: number) => UnitState;
  setUnitState: (playerId: "player1" | "player2", unitIndex: number, state: UnitState) => void;
  getTeamColor: (playerId: "player1" | "player2") => string;
  onSave: (playerId: "player1" | "player2", unitIndex: number) => void;
  randomizeAppearance: (style: "ranged" | "melee") => UnitState["customization"];
  disableMaterialIBL: (meshes: AbstractMesh[]) => void;
  registerForCleanup: (meshes: AbstractMesh[], anims: AnimationGroup[]) => void;
  isSceneDisposed: () => boolean;
}

export interface CustomizeEditorController {
  /** Open editor for a specific unit */
  open: (playerId: "player1" | "player2", unitIndex: number) => void;
  /** Check if editor is currently open */
  isOpen: () => boolean;
  /** Get current editing context for orientation restore */
  getEditingContext: () => { playerId: "player1" | "player2"; unitIndex: number } | null;
  /** Dispose resources */
  dispose: () => void;
}

export function createCustomizeEditor(config: CustomizeEditorConfig): CustomizeEditorController {
  const {
    scene,
    gui,
    screenWidth,
    screenHeight,
    isMobile: _isMobile, // Used for interface compatibility, layout uses isSmallScreen
    fontSize,
    smallFontSize,
    buttonHeight,
    smallButtonHeight,
    getUnitState,
    setUnitState,
    getTeamColor,
    onSave,
    randomizeAppearance,
    disableMaterialIBL,
    registerForCleanup,
    isSceneDisposed,
  } = config;
  void _isMobile; // Suppress unused warning

  // Layout calculations
  const isSmallScreen = screenWidth < 1200;
  const isPortrait = screenHeight > screenWidth;
  const isMobilePortrait = isSmallScreen && isPortrait;
  const isMobileLandscape = isSmallScreen && !isPortrait;
  const isMobileLayout = isMobilePortrait || isMobileLandscape;

  // Editor state
  let editingPlayerId: "player1" | "player2" = "player1";
  let editingUnitIndex = 0;
  let editingState: UnitState | null = null;
  let originalState: UnitState | null = null; // For cancel/revert
  let previewController: UnitPreviewController | null = null;

  // Create overlay
  const overlay = new Rectangle("customizeOverlay");
  overlay.width = "100%";
  overlay.height = "100%";
  overlay.background = COLORS.bgDeep;
  overlay.thickness = 0;
  overlay.isVisible = false;
  overlay.zIndex = 500;
  gui.addControl(overlay);

  // Editor layout grid
  const editorGrid = new Grid("editorGrid");
  editorGrid.width = "100%";
  editorGrid.height = "100%";

  if (isSmallScreen) {
    if (isPortrait) {
      editorGrid.addRowDefinition(0.5);
      editorGrid.addRowDefinition(0.5);
      editorGrid.addColumnDefinition(1);
    } else {
      editorGrid.addRowDefinition(1);
      editorGrid.addColumnDefinition(0.5);
      editorGrid.addColumnDefinition(0.5);
    }
  } else {
    editorGrid.addRowDefinition(1);
    editorGrid.addColumnDefinition(0.4);
    editorGrid.addColumnDefinition(0.6);
  }
  overlay.addControl(editorGrid);

  // Preview area
  const previewArea = new Rectangle("editorPreviewArea");
  previewArea.background = COLORS.bgPreview;
  previewArea.thickness = 0;
  if (isMobileLayout) {
    previewArea.width = "100%";
    previewArea.height = "100%";
  }

  // Copy section for mobile (shows unit description)
  let editorCopySymbol: TextBlock | null = null;
  let editorCopyClass: TextBlock | null = null;
  let editorCopyDesc: TextBlock | null = null;

  if (isMobileLayout) {
    const copyPreviewGrid = new Grid("copyPreviewGrid");
    copyPreviewGrid.width = "100%";
    copyPreviewGrid.height = "100%";
    copyPreviewGrid.addColumnDefinition(0.5);
    copyPreviewGrid.addColumnDefinition(0.5);
    copyPreviewGrid.addRowDefinition(1);

    if (isMobilePortrait) {
      editorGrid.addControl(copyPreviewGrid, 0, 0);
    } else {
      editorGrid.addControl(copyPreviewGrid, 0, 1);
    }

    // Copy section
    const copySection = new Rectangle("editorCopySection");
    copySection.width = "100%";
    copySection.height = "100%";
    copySection.thickness = 0;
    copySection.paddingLeft = "12px";
    copySection.paddingRight = "8px";
    copySection.paddingTop = "12px";
    copyPreviewGrid.addControl(copySection, 0, 0);

    const copyStack = new StackPanel("editorCopyStack");
    copyStack.isVertical = true;
    copyStack.width = "100%";
    copyStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    copySection.addControl(copyStack);

    editorCopySymbol = new TextBlock("editorCopySymbol");
    editorCopySymbol.text = "Δ";
    editorCopySymbol.color = COLORS.accentOrange;
    editorCopySymbol.fontSize = isMobilePortrait ? 28 : 22;
    editorCopySymbol.fontFamily = "'Bebas Neue', sans-serif";
    editorCopySymbol.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    editorCopySymbol.resizeToFit = true;
    editorCopySymbol.paddingBottom = "4px";
    copyStack.addControl(editorCopySymbol);

    editorCopyClass = new TextBlock("editorCopyClass");
    editorCopyClass.text = "Soldier";
    editorCopyClass.color = COLORS.accentOrange;
    editorCopyClass.fontSize = isMobilePortrait ? 20 : 16;
    editorCopyClass.fontFamily = "'Bebas Neue', sans-serif";
    editorCopyClass.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    editorCopyClass.resizeToFit = true;
    editorCopyClass.paddingBottom = "8px";
    copyStack.addControl(editorCopyClass);

    editorCopyDesc = new TextBlock("editorCopyDesc");
    editorCopyDesc.text = "";
    editorCopyDesc.color = COLORS.textSecondary;
    editorCopyDesc.fontSize = isMobilePortrait ? 11 : 10;
    editorCopyDesc.textWrapping = true;
    editorCopyDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    editorCopyDesc.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    editorCopyDesc.resizeToFit = true;
    copyStack.addControl(editorCopyDesc);

    copyPreviewGrid.addControl(previewArea, 0, 1);
  } else {
    editorGrid.addControl(previewArea, 0, 1);
  }

  // Options scroll area
  const optionsScroll = new ScrollViewer("editorOptionsScroll");
  optionsScroll.width = "100%";
  optionsScroll.height = "100%";
  optionsScroll.thickness = 0;
  optionsScroll.barSize = SCROLLBAR_SIZE;
  optionsScroll.barColor = SCROLLBAR_COLOR;
  optionsScroll.barBackground = SCROLLBAR_BACKGROUND;
  if (optionsScroll.horizontalBar) {
    optionsScroll.horizontalBar.isVisible = false;
  }

  if (isSmallScreen) {
    if (isPortrait) {
      editorGrid.addControl(optionsScroll, 1, 0);
    } else {
      editorGrid.addControl(optionsScroll, 0, 0);
    }
  } else {
    editorGrid.addControl(optionsScroll, 0, 0);
  }

  const optionsStack = new StackPanel("editorOptionsStack");
  optionsStack.width = "100%";
  optionsStack.isVertical = true;
  optionsStack.paddingBottom = "20px";
  optionsScroll.addControl(optionsStack);

  // Header
  const headerRow = new StackPanel("editorHeader");
  headerRow.isVertical = false;
  headerRow.width = "100%";
  headerRow.height = "50px";
  headerRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  headerRow.paddingLeft = "15px";
  headerRow.paddingTop = "8px";
  headerRow.paddingBottom = "8px";
  optionsStack.addControl(headerRow);

  const editorSymbol = new TextBlock("editorSymbol");
  editorSymbol.text = "Δ";
  editorSymbol.color = COLORS.accentOrange;
  editorSymbol.fontSize = 24;
  editorSymbol.fontFamily = "'Bebas Neue', sans-serif";
  editorSymbol.resizeToFit = true;
  editorSymbol.paddingRight = "20px";
  headerRow.addControl(editorSymbol);

  const editorTitle = new TextBlock("editorTitle");
  editorTitle.text = "Customize";
  editorTitle.color = COLORS.accentOrange;
  editorTitle.fontSize = 20;
  editorTitle.fontFamily = "'Bebas Neue', sans-serif";
  editorTitle.resizeToFit = true;
  headerRow.addControl(editorTitle);

  // Option button/swatch tracking for refresh
  const optionButtons: Map<string, Button[]> = new Map();
  const colorSwatches: Map<string, Rectangle[]> = new Map();

  // Helper: create button option row
  function createOption(
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
        updatePreview();
      });

      buttons.push(btn);
      btnRow.addControl(btn);
    });

    optionButtons.set(label, buttons);
    return container;
  }

  // Helper: create color swatch option row
  function createColorOption(
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
        updatePreview();
      });

      swatches.push(swatch);
      swatchRow.addControl(swatch);
    });

    colorSwatches.set(label, swatches);
    return container;
  }

  // Top section grid (controls + descriptions on large screens)
  const topSectionGrid = new Grid("topSectionGrid");
  topSectionGrid.width = "100%";
  topSectionGrid.height = `${(24 + smallButtonHeight + 20) * 3}px`;
  if (isMobileLayout) {
    topSectionGrid.addColumnDefinition(1);
  } else {
    topSectionGrid.addColumnDefinition(0.5);
    topSectionGrid.addColumnDefinition(0.5);
  }
  topSectionGrid.addRowDefinition(1);
  optionsStack.addControl(topSectionGrid);

  // Controls column
  const controlsStack = new StackPanel("controlsStack");
  controlsStack.isVertical = true;
  controlsStack.width = "100%";
  topSectionGrid.addControl(controlsStack, 0, 0);

  // Class option
  controlsStack.addControl(createOption(
    "Class",
    ["Soldier", "Operator", "Medic"],
    () => ALL_CLASSES.indexOf(editingState?.selectedClass || "soldier"),
    (idx) => {
      if (editingState) {
        const newClass = ALL_CLASSES[idx];
        editingState.selectedClass = newClass;
        if (!editingState.hasBeenCustomized) {
          editingState.customization = randomizeAppearance(editingState.selectedStyle);
          refreshAllOptions();
        }
        updateDescriptions();
        // Reload model since different classes have different models
        previewController?.reload();
      }
    }
  ));

  // Boost option
  controlsStack.addControl(createOption(
    "Boost",
    BOOST_INFO.map(b => b.name),
    () => editingState?.selectedBoost ?? 0,
    (idx) => {
      if (editingState) {
        editingState.selectedBoost = idx;
        updateDescriptions();
      }
    }
  ));

  // Weapon option
  controlsStack.addControl(createOption(
    "Weapon",
    [WEAPON_INFO.ranged.label, WEAPON_INFO.melee.label],
    () => editingState?.selectedStyle === "melee" ? 1 : 0,
    (idx) => {
      if (editingState) {
        editingState.selectedStyle = idx === 1 ? "melee" : "ranged";
        editingState.customization.combatStyle = editingState.selectedStyle;
        updateDescriptions();
      }
    }
  ));

  // Description column (large screens only)
  let classTagline: TextBlock | null = null;
  let abilityLabel: TextBlock | null = null;
  let abilityDesc: TextBlock | null = null;
  let boostDesc: TextBlock | null = null;
  let weaponDesc: TextBlock | null = null;

  if (!isMobileLayout) {
    const descStack = new StackPanel("descStack");
    descStack.isVertical = true;
    descStack.width = "100%";
    descStack.paddingLeft = "10px";
    descStack.paddingRight = "15px";
    descStack.paddingTop = "8px";
    descStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    topSectionGrid.addControl(descStack, 0, 1);

    classTagline = new TextBlock("classTagline");
    classTagline.text = "";
    classTagline.color = COLORS.textSecondary;
    classTagline.fontSize = smallFontSize;
    classTagline.textWrapping = true;
    classTagline.resizeToFit = true;
    classTagline.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    classTagline.paddingBottom = "8px";
    descStack.addControl(classTagline);

    abilityLabel = new TextBlock("abilityLabel");
    abilityLabel.text = "";
    abilityLabel.color = COLORS.accentOrange;
    abilityLabel.fontSize = smallFontSize;
    abilityLabel.fontFamily = "'Bebas Neue', sans-serif";
    abilityLabel.resizeToFit = true;
    abilityLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    descStack.addControl(abilityLabel);

    abilityDesc = new TextBlock("abilityDesc");
    abilityDesc.text = "";
    abilityDesc.color = COLORS.textMuted;
    abilityDesc.fontSize = smallFontSize;
    abilityDesc.textWrapping = true;
    abilityDesc.resizeToFit = true;
    abilityDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    abilityDesc.paddingBottom = "8px";
    descStack.addControl(abilityDesc);

    boostDesc = new TextBlock("boostDesc");
    boostDesc.text = "";
    boostDesc.color = COLORS.textMuted;
    boostDesc.fontSize = smallFontSize;
    boostDesc.textWrapping = true;
    boostDesc.resizeToFit = true;
    boostDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    boostDesc.paddingBottom = "8px";
    descStack.addControl(boostDesc);

    weaponDesc = new TextBlock("weaponDesc");
    weaponDesc.text = "";
    weaponDesc.color = COLORS.textMuted;
    weaponDesc.fontSize = smallFontSize;
    weaponDesc.textWrapping = true;
    weaponDesc.resizeToFit = true;
    weaponDesc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    descStack.addControl(weaponDesc);
  }

  function updateDescriptions(): void {
    if (!editingState) return;
    const classInfo = CLASS_INFO[editingState.selectedClass];
    const boost = BOOST_INFO[editingState.selectedBoost];
    const weapon = WEAPON_INFO[editingState.selectedStyle];

    if (classTagline) classTagline.text = `"${classInfo.tagline}"`;
    if (abilityLabel) abilityLabel.text = classInfo.abilityName;
    if (abilityDesc) abilityDesc.text = classInfo.abilityDesc;
    if (boostDesc) boostDesc.text = `${boost.desc} +${boost.value}% ${boost.stat}`;
    if (weaponDesc) weaponDesc.text = weapon.desc;

    // Mobile copy section
    if (editorCopySymbol && editorCopyClass && editorCopyDesc) {
      editorCopySymbol.text = UNIT_DESIGNATIONS[editingUnitIndex];
      editorCopyClass.text = classInfo.name;
      editorCopyDesc.text = getUnitDescription(
        editingState.selectedClass,
        editingState.selectedBoost,
        editingState.selectedStyle
      );
    }
  }

  // Separator
  const separatorContainer = new Rectangle("editorSeparatorContainer");
  separatorContainer.width = "100%";
  separatorContainer.height = "17px";
  separatorContainer.thickness = 0;
  separatorContainer.paddingTop = "8px";
  separatorContainer.paddingBottom = "8px";
  optionsStack.addControl(separatorContainer);

  const editorSeparator = new Rectangle("editorSeparator");
  editorSeparator.width = "90%";
  editorSeparator.height = "1px";
  editorSeparator.background = COLORS.borderWarm;
  editorSeparator.thickness = 0;
  editorSeparator.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  separatorContainer.addControl(editorSeparator);

  // Body option
  optionsStack.addControl(createOption(
    "Body",
    ["Male", "Female"],
    () => editingState?.customization.body === "female" ? 1 : 0,
    (idx) => {
      if (editingState) {
        editingState.customization.body = idx === 1 ? "female" : "male";
        // Force model reload
        previewController?.reload();
      }
    }
  ));

  // Head option
  optionsStack.addControl(createOption(
    "Head",
    ["1", "2", "3", "4"],
    () => editingState?.customization.head ?? 0,
    (idx) => { if (editingState) editingState.customization.head = idx; }
  ));

  // Handedness option
  optionsStack.addControl(createOption(
    "Handedness",
    ["Right", "Left"],
    () => editingState?.customization.handedness === "left" ? 1 : 0,
    (idx) => { if (editingState) editingState.customization.handedness = idx === 1 ? "left" : "right"; }
  ));

  // Color options
  optionsStack.addControl(createColorOption(
    "Skin Tone",
    SKIN_TONES,
    () => editingState?.customization.skinTone ?? 4,
    (idx) => { if (editingState) editingState.customization.skinTone = idx; }
  ));

  optionsStack.addControl(createColorOption(
    "Hair Color",
    HAIR_COLORS,
    () => editingState?.customization.hairColor ?? 0,
    (idx) => { if (editingState) editingState.customization.hairColor = idx; }
  ));

  optionsStack.addControl(createColorOption(
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
  saveBtn.onPointerClickObservable.add(() => close(true));
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
  cancelBtn.onPointerClickObservable.add(() => close(false));
  buttonRow.addControl(cancelBtn);

  function refreshAllOptions(): void {
    if (!editingState) return;

    // Refresh button selections
    const refreshButtons = (key: string, value: number) => {
      const buttons = optionButtons.get(key);
      if (buttons) {
        buttons.forEach((b, i) => {
          b.background = i === value ? COLORS.selected : COLORS.bgButton;
        });
      }
    };

    refreshButtons("Class", ALL_CLASSES.indexOf(editingState.selectedClass));
    refreshButtons("Boost", editingState.selectedBoost);
    refreshButtons("Weapon", editingState.selectedStyle === "melee" ? 1 : 0);
    refreshButtons("Body", editingState.customization.body === "female" ? 1 : 0);
    refreshButtons("Head", editingState.customization.head);
    refreshButtons("Handedness", editingState.customization.handedness === "left" ? 1 : 0);

    // Refresh color swatches
    const refreshSwatches = (key: string, value: number) => {
      const swatches = colorSwatches.get(key);
      if (swatches) {
        swatches.forEach((s, i) => {
          s.thickness = i === value ? 3 : 1;
          s.color = i === value ? COLORS.accentOrange : COLORS.borderWarm;
        });
      }
    };

    refreshSwatches("Skin Tone", editingState.customization.skinTone);
    refreshSwatches("Hair Color", editingState.customization.hairColor);
    refreshSwatches("Eye Color", editingState.customization.eyeColor);
  }

  function updatePreview(): void {
    previewController?.refresh();
  }

  // Touch scroll for options
  const editorScrollCleanup = enableTouchScroll(optionsScroll, optionsStack);

  function open(playerId: "player1" | "player2", unitIndex: number): void {
    editingPlayerId = playerId;
    editingUnitIndex = unitIndex;

    // Deep copy current state and store original for cancel
    const current = getUnitState(playerId, unitIndex);
    originalState = {
      selectedClass: current.selectedClass,
      selectedBoost: current.selectedBoost,
      selectedStyle: current.selectedStyle,
      customization: { ...current.customization },
      hasBeenCustomized: current.hasBeenCustomized,
    };
    editingState = {
      selectedClass: current.selectedClass,
      selectedBoost: current.selectedBoost,
      selectedStyle: current.selectedStyle,
      customization: { ...current.customization },
      hasBeenCustomized: current.hasBeenCustomized,
    };

    editorSymbol.text = UNIT_DESIGNATIONS[unitIndex];

    refreshAllOptions();
    updateDescriptions();

    // Create preview
    const editorLayerMask = 0x20000000;
    previewController = createUnitPreview({
      scene,
      container: previewArea,
      id: "editor",
      rttSize: 512,
      layerMask: editorLayerMask,
      cameraRadius: 2.8,
      cameraTarget: new Vector3(0, 0.95, 0),
      getTeamColor: () => getTeamColor(editingPlayerId),
      getState: () => editingState!,
      enableTouchRotation: true, // Allow user to rotate with touch/drag
      disableMaterialIBL,
      registerForCleanup,
      isSceneDisposed,
    });

    optionsScroll.verticalBar.value = 0;
    overlay.isVisible = true;
  }

  function close(save: boolean): void {
    if (save && editingState) {
      setUnitState(editingPlayerId, editingUnitIndex, {
        ...editingState,
        hasBeenCustomized: true,
      });
      onSave(editingPlayerId, editingUnitIndex);
    } else if (!save && originalState) {
      // Revert to original state on cancel
      setUnitState(editingPlayerId, editingUnitIndex, originalState);
    }

    overlay.isVisible = false;
    editingState = null;
    originalState = null;

    // Cleanup preview
    if (previewController) {
      previewController.dispose();
      previewController = null;
    }

    // Clear preview area children
    previewArea.clearControls();
  }

  function dispose(): void {
    editorScrollCleanup.dispose();
    if (previewController) {
      previewController.dispose();
    }
  }

  return {
    open,
    isOpen: () => overlay.isVisible,
    getEditingContext: () => overlay.isVisible ? { playerId: editingPlayerId, unitIndex: editingUnitIndex } : null,
    dispose,
  };
}
