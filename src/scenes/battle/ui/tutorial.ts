/**
 * battle/ui/tutorial.ts
 *
 * In-battle tutorial overlay showing camera controls, click actions, and turn info.
 * Displays on first battle entry to help new players.
 */

import { AdvancedDynamicTexture, Button, Control, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

// =============================================================================
// TYPES
// =============================================================================

interface TutorialSection {
  header: string;
  items: string[];
}

export interface TutorialOverlay {
  container: Rectangle;
  hide: () => void;
  show: () => void;
}

// =============================================================================
// TUTORIAL CONTENT
// =============================================================================

function getTutorialSections(isTouchDevice: boolean): TutorialSection[] {
  const clickWord = isTouchDevice ? "Tap" : "Click";

  return [
    {
      header: "Camera",
      items: isTouchDevice
        ? [
            "Two fingers to zoom and pan",
            "One finger to rotate the board",
          ]
        : [
            "Mouse wheel to zoom",
            "Hold left click + drag to pan",
            "Right click + drag to rotate",
          ],
    },
    {
      header: clickWord,
      items: [
        "On blue spaces to move",
        "On a unit to use its ability",
        "On red spaces to attack",
        "On green spaces to heal (Medic)",
      ],
    },
    {
      header: "Turns",
      items: [
        "Each unit gets 2 actions per turn",
        `${clickWord} bottom left to cancel`,
        `${clickWord} bottom right to confirm`,
      ],
    },
  ];
}

// =============================================================================
// TUTORIAL CREATION
// =============================================================================

/**
 * Create the tutorial overlay UI.
 * Returns controls for showing/hiding the tutorial.
 */
export function createTutorialOverlay(gui: AdvancedDynamicTexture): TutorialOverlay {
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const tutorialSections = getTutorialSections(isTouchDevice);

  // Tutorial overlay container (semi-transparent to show game behind)
  const tutorialOverlay = new Rectangle("tutorialOverlay");
  tutorialOverlay.width = "100%";
  tutorialOverlay.height = "100%";
  tutorialOverlay.background = "rgba(0, 0, 0, 0.7)";
  tutorialOverlay.thickness = 0;
  tutorialOverlay.zIndex = 200;
  gui.addControl(tutorialOverlay);

  // Tutorial content container (centered on screen)
  const tutorialContainer = new Rectangle("tutorialContainer");
  tutorialContainer.width = "100%";
  tutorialContainer.height = "100%";
  tutorialContainer.thickness = 0;
  tutorialContainer.background = "transparent";
  tutorialOverlay.addControl(tutorialContainer);

  // Tutorial content panel
  const tutorialPanel = new Rectangle("tutorialPanel");
  tutorialPanel.width = isTouchDevice ? "340px" : "420px";
  tutorialPanel.adaptHeightToChildren = true;
  tutorialPanel.background = "transparent";
  tutorialPanel.thickness = 0;
  tutorialPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  tutorialPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  tutorialContainer.addControl(tutorialPanel);

  // Stack for tutorial content
  const tutorialStack = new StackPanel("tutorialStack");
  tutorialStack.width = "100%";
  tutorialPanel.addControl(tutorialStack);

  // Title
  const tutorialTitle = new TextBlock("tutorialTitle", "H O W   T O   P L A Y");
  tutorialTitle.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
  tutorialTitle.fontSize = 36;
  tutorialTitle.color = "#ff9966";
  tutorialTitle.height = "50px";
  tutorialTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  tutorialStack.addControl(tutorialTitle);

  // Divider under title
  const tutorialDivider = new Rectangle("tutorialDivider");
  tutorialDivider.width = "80%";
  tutorialDivider.height = "2px";
  tutorialDivider.background = "rgba(255, 150, 80, 0.4)";
  tutorialDivider.thickness = 0;
  tutorialDivider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  tutorialStack.addControl(tutorialDivider);

  // Spacer after divider
  const topSpacer = new Rectangle("topSpacer");
  topSpacer.height = "16px";
  topSpacer.thickness = 0;
  topSpacer.background = "transparent";
  tutorialStack.addControl(topSpacer);

  // Render tutorial sections with headers and bullet points
  for (let i = 0; i < tutorialSections.length; i++) {
    const section = tutorialSections[i];

    // Section header (underlined)
    const headerContainer = new StackPanel(`headerContainer_${i}`);
    headerContainer.width = "100%";
    headerContainer.paddingLeft = "30px";
    headerContainer.paddingRight = "30px";
    tutorialStack.addControl(headerContainer);

    const headerText = new TextBlock(`header_${i}`, section.header);
    headerText.fontFamily = "'Exo 2', sans-serif";
    headerText.fontSize = 18;
    headerText.fontWeight = "bold";
    headerText.color = "#ff9966";
    headerText.height = "28px";
    headerText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerContainer.addControl(headerText);

    // Underline for header
    const headerUnderline = new Rectangle(`underline_${i}`);
    headerUnderline.width = "60px";
    headerUnderline.height = "1px";
    headerUnderline.background = "#ff9966";
    headerUnderline.thickness = 0;
    headerUnderline.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    headerContainer.addControl(headerUnderline);

    // Spacer after underline
    const underlineSpacer = new Rectangle(`underlineSpacer_${i}`);
    underlineSpacer.height = "8px";
    underlineSpacer.thickness = 0;
    underlineSpacer.background = "transparent";
    headerContainer.addControl(underlineSpacer);

    // Bullet items
    for (let j = 0; j < section.items.length; j++) {
      const bulletLine = new TextBlock(`bullet_${i}_${j}`);
      bulletLine.text = `•  ${section.items[j]}`;
      bulletLine.fontFamily = "'Exo 2', sans-serif";
      bulletLine.fontSize = 15;
      bulletLine.color = "#cccccc";
      bulletLine.height = "26px";
      bulletLine.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      bulletLine.textWrapping = true;
      bulletLine.paddingLeft = "40px";
      bulletLine.paddingRight = "30px";
      tutorialStack.addControl(bulletLine);
    }

    // Spacer between sections (except after last)
    if (i < tutorialSections.length - 1) {
      const sectionSpacer = new Rectangle(`sectionSpacer_${i}`);
      sectionSpacer.height = "16px";
      sectionSpacer.thickness = 0;
      sectionSpacer.background = "transparent";
      tutorialStack.addControl(sectionSpacer);
    }
  }

  // Spacer before button
  const buttonSpacer = new Rectangle("buttonSpacer");
  buttonSpacer.height = "30px";
  buttonSpacer.thickness = 0;
  buttonSpacer.background = "transparent";
  tutorialStack.addControl(buttonSpacer);

  // Close button (matching Quick How To style)
  const tutorialCloseBtn = Button.CreateSimpleButton("tutorialCloseBtn", "G O T   I T !");
  tutorialCloseBtn.width = "160px";
  tutorialCloseBtn.height = "44px";
  tutorialCloseBtn.cornerRadius = 4;
  tutorialCloseBtn.background = "rgba(40, 50, 60, 0.8)";
  tutorialCloseBtn.thickness = 1;
  tutorialCloseBtn.color = "#ff9966";
  tutorialCloseBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  if (tutorialCloseBtn.textBlock) {
    tutorialCloseBtn.textBlock.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
    tutorialCloseBtn.textBlock.fontSize = 20;
    tutorialCloseBtn.textBlock.color = "#ff9966";
  }
  tutorialStack.addControl(tutorialCloseBtn);

  tutorialCloseBtn.onPointerEnterObservable.add(() => {
    tutorialCloseBtn.background = "rgba(60, 80, 100, 0.9)";
    if (tutorialCloseBtn.textBlock) tutorialCloseBtn.textBlock.color = "#ffffff";
  });
  tutorialCloseBtn.onPointerOutObservable.add(() => {
    tutorialCloseBtn.background = "rgba(40, 50, 60, 0.8)";
    if (tutorialCloseBtn.textBlock) tutorialCloseBtn.textBlock.color = "#ff9966";
  });
  tutorialCloseBtn.onPointerUpObservable.add(() => {
    tutorialOverlay.isVisible = false;
  });

  return {
    container: tutorialOverlay,
    hide: () => { tutorialOverlay.isVisible = false; },
    show: () => { tutorialOverlay.isVisible = true; },
  };
}
