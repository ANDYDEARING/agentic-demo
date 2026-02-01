/**
 * battle/ui/gameOver.ts
 *
 * Game over overlay with winner announcement and back button.
 */

import {
  AdvancedDynamicTexture,
  Button,
  Rectangle,
  StackPanel,
  TextBlock,
} from "@babylonjs/gui";
import { Color3 } from "@babylonjs/core";
import { BREAKPOINT_SMALL_MOBILE } from "../../../config";

// =============================================================================
// DISPLAY
// =============================================================================

/**
 * Show game over overlay.
 *
 * @param gui - The GUI texture
 * @param winningColor - Color of the winning team
 * @param winnerName - Display name of the winner
 * @param screenWidth - Current screen width
 * @param onBackToLoadout - Callback when back button is clicked
 */
export function showGameOver(
  gui: AdvancedDynamicTexture,
  winningColor: Color3,
  winnerName: string,
  screenWidth: number,
  onBackToLoadout: () => void
): void {
  const overlay = new Rectangle();
  overlay.width = "100%";
  overlay.height = "100%";
  overlay.background = "rgba(0,0,0,0.7)";
  gui.addControl(overlay);

  const container = new StackPanel();
  container.width = screenWidth < BREAKPOINT_SMALL_MOBILE ? "95%" : "600px";
  container.height = "200px";
  overlay.addControl(container);

  // Convert Color3 to hex
  const r = Math.round(winningColor.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(winningColor.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(winningColor.b * 255).toString(16).padStart(2, "0");
  const colorHex = `#${r}${g}${b}`;

  const text = new TextBlock();
  text.text = `${winnerName} Wins!`;
  text.color = colorHex;
  text.fontSize = screenWidth < BREAKPOINT_SMALL_MOBILE ? 48 : 72;
  text.width = "100%";
  text.height = "100px";
  text.fontWeight = "bold";
  container.addControl(text);

  // Back to loadout button
  const backBtn = Button.CreateSimpleButton("backBtn", "Back to Loadout");
  backBtn.width = "200px";
  backBtn.height = "50px";
  backBtn.color = "white";
  backBtn.background = "#444444";
  backBtn.cornerRadius = 10;
  backBtn.fontSize = 18;
  backBtn.onPointerClickObservable.add(() => {
    onBackToLoadout();
  });
  container.addControl(backBtn);
}
