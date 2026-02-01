/**
 * battle/ui/battleMessages.ts
 *
 * Floating battle messages with swoop animation.
 * Shows events like "Heal!", "Conceal Broken!", "Unit Down!" etc.
 */

import { AdvancedDynamicTexture, Control, TextBlock } from "@babylonjs/gui";
import { Color3 } from "@babylonjs/core";

// =============================================================================
// TYPES
// =============================================================================

export interface BattleMessageState {
  text: TextBlock;
  timeout: ReturnType<typeof setTimeout> | null;
  animationId: number | null;
}

// =============================================================================
// CREATION
// =============================================================================

/**
 * Create battle message UI element.
 */
export function createBattleMessageUI(
  gui: AdvancedDynamicTexture
): BattleMessageState {
  const text = new TextBlock("battleMessage");
  text.fontSize = 28;
  text.fontWeight = "bold";
  text.color = "#ffffff";
  text.outlineColor = "#000000";
  text.outlineWidth = 3;
  text.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  text.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  text.top = "-80px"; // Above queued actions panel
  text.isVisible = false;
  text.zIndex = 100;
  gui.addControl(text);

  return {
    text,
    timeout: null,
    animationId: null,
  };
}

// =============================================================================
// DISPLAY
// =============================================================================

/**
 * Show a battle message with team color and swoop animation.
 *
 * @param state - Battle message state
 * @param message - The message text to display
 * @param teamColor - Color3 of the relevant team
 */
export function showBattleMessage(
  state: BattleMessageState,
  message: string,
  teamColor: Color3
): void {
  // Cancel any existing message
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
  if (state.animationId !== null) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }

  // Set text and color
  state.text.text = message;
  state.text.color = teamColor.toHexString();
  state.text.isVisible = true;

  // Animation timing
  const startTime = performance.now();
  const swoopInDuration = 200; // ms
  const holdDuration = 1600; // ms
  const swoopOutDuration = 200; // ms
  const totalDuration = swoopInDuration + holdDuration + swoopOutDuration;

  function animate(): void {
    const elapsed = performance.now() - startTime;

    if (elapsed < swoopInDuration) {
      // Swoop in from left
      const t = elapsed / swoopInDuration;
      const easeOut = 1 - Math.pow(1 - t, 3); // Cubic ease out
      const offsetX = -300 * (1 - easeOut);
      state.text.left = `${offsetX}px`;
      state.animationId = requestAnimationFrame(animate);
    } else if (elapsed < swoopInDuration + holdDuration) {
      // Hold in center
      state.text.left = "0px";
      state.animationId = requestAnimationFrame(animate);
    } else if (elapsed < totalDuration) {
      // Swoop out to right
      const t = (elapsed - swoopInDuration - holdDuration) / swoopOutDuration;
      const easeIn = Math.pow(t, 3); // Cubic ease in
      const offsetX = 300 * easeIn;
      state.text.left = `${offsetX}px`;
      state.animationId = requestAnimationFrame(animate);
    } else {
      // Animation complete
      state.text.isVisible = false;
      state.text.left = "0px";
      state.animationId = null;
    }
  }

  state.animationId = requestAnimationFrame(animate);
}

// =============================================================================
// CLEANUP
// =============================================================================

/**
 * Clean up battle message state.
 */
export function cleanupBattleMessage(state: BattleMessageState): void {
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
  if (state.animationId !== null) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
}
