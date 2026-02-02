/**
 * ui-helpers.ts
 *
 * Shared UI component builders for LoadoutScene.
 * Includes team header, color swatches, and unit card creation.
 */

import {
  Rectangle,
  StackPanel,
  Grid,
  TextBlock,
  Button,
  Control,
} from "@babylonjs/gui";
import { TEAM_COLORS } from "../../config";
import { COLORS } from "./colors";
import { CLASS_INFO, UNIT_DESIGNATIONS, getUnitDescription } from "./constants";
import type { UnitState } from "./types";

// =============================================================================
// TEAM COLOR SWATCHES
// =============================================================================

export interface TeamColorSwatchConfig {
  parent: StackPanel;
  swatchSize?: number;
  getThisColor: () => string;
  getOtherColor: () => string;
  setThisColor: (hex: string) => void;
  onColorChange: () => void;
}

export interface TeamColorSwatchController {
  refresh: () => void;
}

/**
 * Create team color selection swatches.
 * Disabled colors (used by other team) are hidden.
 */
export function createTeamColorSwatches(config: TeamColorSwatchConfig): TeamColorSwatchController {
  const {
    parent,
    swatchSize = 28,
    getThisColor,
    getOtherColor,
    setThisColor,
    onColorChange,
  } = config;

  const swatches: Rectangle[] = [];

  TEAM_COLORS.forEach((teamColor) => {
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
      refresh();
      onColorChange();
    });

    swatches.push(swatch);
    parent.addControl(swatch);
  });

  function refresh(): void {
    TEAM_COLORS.forEach((teamColor, i) => {
      const swatch = swatches[i];
      const isSelected = getThisColor() === teamColor.hex;
      const isDisabled = getOtherColor() === teamColor.hex;
      swatch.isVisible = !isDisabled;
      swatch.thickness = isSelected ? 3 : 1;
      swatch.color = isSelected ? "white" : COLORS.borderWarm;
    });
  }

  refresh();
  return { refresh };
}

// =============================================================================
// TEAM HEADER
// =============================================================================

export interface TeamHeaderConfig {
  playerId: "player1" | "player2";
  label: string;
  getThisColor: () => string;
  getOtherColor: () => string;
  setThisColor: (hex: string) => void;
  onColorChange: () => void;
  onBorderContainerChange?: (container: Rectangle) => void;
  isP2Computer: boolean;
  onAiToggle: (isComputer: boolean) => void;
}

export interface TeamHeaderController {
  refreshSwatches: () => void;
  container: Rectangle;
}

/**
 * Create a team header with title, color swatches, and optional AI toggle.
 */
export function createTeamHeader(config: TeamHeaderConfig): TeamHeaderController {
  const {
    playerId,
    label,
    getThisColor,
    getOtherColor,
    setThisColor,
    onColorChange,
    isP2Computer,
    onAiToggle,
  } = config;

  let currentIsP2Computer = isP2Computer;

  const header = new Rectangle(`${playerId}Header`);
  header.width = "95%";
  header.height = "50px";
  header.thickness = 0;
  header.paddingTop = "10px";

  const headerGrid = new Grid(`${playerId}HeaderGrid`);
  headerGrid.width = "100%";
  headerGrid.height = "100%";

  // P2 needs extra column for AI toggle
  if (playerId === "player2") {
    headerGrid.addColumnDefinition(110, true);
    headerGrid.addColumnDefinition(190, true);
    headerGrid.addColumnDefinition(1, false);
  } else {
    headerGrid.addColumnDefinition(0.3);
    headerGrid.addColumnDefinition(0.7);
  }
  headerGrid.addRowDefinition(1);
  header.addControl(headerGrid);

  const nameText = new TextBlock();
  nameText.text = label;
  nameText.color = getThisColor() || COLORS.textPrimary;
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

    const aiToggleBtn = Button.CreateSimpleButton(
      "aiToggle",
      currentIsP2Computer ? "Computer Controlled: ON" : "Computer Controlled: OFF"
    );
    aiToggleBtn.width = "180px";
    aiToggleBtn.height = "28px";
    aiToggleBtn.background = currentIsP2Computer ? COLORS.accentBlueDeep : COLORS.bgButton;
    aiToggleBtn.color = currentIsP2Computer ? COLORS.accentBlue : COLORS.textSecondary;
    aiToggleBtn.cornerRadius = 4;
    aiToggleBtn.fontSize = 12;

    aiToggleBtn.onPointerClickObservable.add(() => {
      currentIsP2Computer = !currentIsP2Computer;
      if (aiToggleBtn.textBlock) {
        aiToggleBtn.textBlock.text = currentIsP2Computer
          ? "Computer Controlled: ON"
          : "Computer Controlled: OFF";
      }
      aiToggleBtn.background = currentIsP2Computer ? COLORS.accentBlueDeep : COLORS.bgButton;
      aiToggleBtn.color = currentIsP2Computer ? COLORS.accentBlue : COLORS.textSecondary;
      onAiToggle(currentIsP2Computer);
    });

    aiToggleContainer.addControl(aiToggleBtn);
  }

  // Color swatches
  const colorRow = new StackPanel();
  colorRow.isVertical = false;
  colorRow.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
  colorRow.paddingRight = "10px";
  headerGrid.addControl(colorRow, 0, playerId === "player2" ? 2 : 1);

  const swatchController = createTeamColorSwatches({
    parent: colorRow,
    swatchSize: 24,
    getThisColor,
    getOtherColor,
    setThisColor: (hex) => {
      setThisColor(hex);
      nameText.color = hex;
    },
    onColorChange,
  });

  return {
    refreshSwatches: swatchController.refresh,
    container: header,
  };
}

// =============================================================================
// UNIT CARD
// =============================================================================

export interface UnitCardConfig {
  playerId: "player1" | "player2";
  unitIndex: number;
  getState: () => UnitState;
  screenWidth: number;
  isMobile: boolean;
  isTablet: boolean;
  useVerticalLayout: boolean;
  onCardClick: () => void;
}

export interface UnitCardController {
  card: Rectangle;
  previewContainer: Rectangle;
  updateCard: () => void;
}

/**
 * Create a unit card with class info, description, and preview area.
 */
export function createUnitCard(config: UnitCardConfig): UnitCardController {
  const {
    playerId,
    unitIndex,
    getState,
    screenWidth,
    isMobile,
    isTablet,
    useVerticalLayout,
    onCardClick,
  } = config;

  const key = `${playerId}_${unitIndex}`;

  const card = new Rectangle(`card_${key}`);
  card.width = "95%";
  if (useVerticalLayout) {
    card.adaptHeightToChildren = true;
  } else {
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

  // Calculate copy column width
  const cardWidthPx = useVerticalLayout ? screenWidth * 0.9 : screenWidth * 0.3;
  const copyWidthPx = Math.floor(cardWidthPx * 0.55);

  const cardGrid = new Grid(`cardGrid_${key}`);
  cardGrid.width = "100%";
  if (useVerticalLayout) {
    // Heights tuned for content: title (32px) + desc (~80px) + spacer + tap label (20px) + padding
    // Increased from original to ensure "tap to edit" is visible
    const baseHeight = screenWidth < 400 ? 300 : screenWidth < 800 ? 240 : 220;
    cardGrid.height = `${baseHeight}px`;
  } else {
    cardGrid.height = "100%";
  }
  cardGrid.addColumnDefinition(copyWidthPx, true);
  cardGrid.addColumnDefinition(1, false);
  cardGrid.addRowDefinition(1);
  card.addControl(cardGrid);

  // Copy column
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
  copyStack.adaptHeightToChildren = true;
  copyWrapper.addControl(copyStack);

  // Title row
  const titleRow = new Grid(`titleRow_${key}`);
  titleRow.width = "100%";
  titleRow.height = "32px";
  titleRow.addColumnDefinition(isMobile ? 28 : 32, true);
  titleRow.addColumnDefinition(1, false);
  titleRow.addRowDefinition(1);
  copyStack.addControl(titleRow);

  // Symbol
  const symbolText = new TextBlock(`symbol_${key}`);
  symbolText.text = UNIT_DESIGNATIONS[unitIndex];
  symbolText.color = COLORS.accentOrange;
  symbolText.fontSize = isMobile ? 20 : 18;
  symbolText.fontFamily = "'Bebas Neue', sans-serif";
  symbolText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  symbolText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  symbolText.paddingLeft = "2px";
  titleRow.addControl(symbolText, 0, 0);

  // Class name
  const state = getState();
  const classText = new TextBlock(`class_${key}`);
  classText.text = CLASS_INFO[state.selectedClass].name;
  classText.color = COLORS.accentOrange;
  classText.fontSize = isMobile ? 18 : 16;
  classText.fontFamily = "'Bebas Neue', sans-serif";
  classText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  classText.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  titleRow.addControl(classText, 0, 1);

  // Description
  const descText = new TextBlock(`desc_${key}`);
  descText.text = getUnitDescription(state.selectedClass, state.selectedBoost, state.selectedWeapon);
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

  // Spacer
  const spacer = new Rectangle(`spacer_${key}`);
  spacer.height = "1px";
  spacer.width = "100%";
  spacer.thickness = 0;
  spacer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  copyStack.addControl(spacer);

  // "click/tap to edit" label - use touch detection, not screen size
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const tapLabel = new TextBlock(`tapLabel_${key}`);
  tapLabel.text = isTouchDevice ? "tap to edit" : "click to edit";
  tapLabel.color = COLORS.textMuted;
  tapLabel.fontSize = 10;
  tapLabel.fontStyle = "italic";
  tapLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  tapLabel.height = "16px";
  tapLabel.paddingTop = "4px";
  copyStack.addControl(tapLabel);

  // Make copy area clickable
  copyWrapper.isPointerBlocker = true;
  copyWrapper.hoverCursor = "pointer";
  copyWrapper.onPointerClickObservable.add(onCardClick);

  // Preview container
  const previewContainer = new Rectangle(`preview_${key}`);
  previewContainer.width = "100%";
  previewContainer.height = "100%";
  previewContainer.background = COLORS.bgPreview;
  previewContainer.cornerRadius = 8;
  previewContainer.thickness = 0;
  previewContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  cardGrid.addControl(previewContainer, 0, 1);

  function updateCard(): void {
    const s = getState();
    classText.text = CLASS_INFO[s.selectedClass].name;
    descText.text = getUnitDescription(s.selectedClass, s.selectedBoost, s.selectedWeapon);
  }

  return {
    card,
    previewContainer,
    updateCard,
  };
}
