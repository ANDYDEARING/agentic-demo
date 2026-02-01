/**
 * title/effects.ts
 *
 * Background visual effects for the title screen:
 * - Heat layers: Pulsing gradient layers rising from bottom
 * - Floating embers: Particle system with upward drift
 */

import { AdvancedDynamicTexture, Rectangle, Control } from "@babylonjs/gui";
import { TITLE_HEAT_COLORS } from "../../config";

// =============================================================================
// TYPES
// =============================================================================

export interface Ember {
  element: Rectangle;
  x: number;
  y: number;
  speed: number;
  drift: number;
  driftSpeed: number;
  size: number;
  baseAlpha: number;
}

export interface TitleEffects {
  heatLayers: Rectangle[];
  embers: Ember[];
  /** Call in scene.onBeforeRenderObservable */
  update: (time: number) => void;
}

// =============================================================================
// HEAT LAYERS
// =============================================================================

function createHeatLayers(gui: AdvancedDynamicTexture): Rectangle[] {
  const layers: Rectangle[] = [];

  for (let i = 0; i < 3; i++) {
    const heat = new Rectangle();
    heat.width = "120%";
    heat.height = "50%";
    heat.thickness = 0;
    heat.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    gui.addControl(heat);
    layers.push(heat);
  }

  return layers;
}

function animateHeatLayers(layers: Rectangle[], time: number): void {
  const heatColors = TITLE_HEAT_COLORS;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const color = heatColors[i];
    const pulse = 0.08 + 0.04 * Math.sin(time * (0.8 + i * 0.3) + i);
    const flicker = 1 + 0.1 * Math.sin(time * 3 + i * 2);

    const r = Math.floor(color.r * flicker);
    const g = Math.floor(color.g * flicker);
    const b = Math.floor(color.b * flicker);

    layer.background = `linear-gradient(to top, rgba(${r}, ${g}, ${b}, ${pulse}) 0%, transparent 100%)`;
  }
}

// =============================================================================
// EMBERS
// =============================================================================

function createEmbers(gui: AdvancedDynamicTexture, count: number = 30): Ember[] {
  const embers: Ember[] = [];

  for (let i = 0; i < count; i++) {
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
      speed: 0.15 + Math.random() * 0.25,
      drift: Math.random() * Math.PI * 2,
      driftSpeed: 0.5 + Math.random() * 1.5,
      size,
      baseAlpha: 0.5 + Math.random() * 0.5,
    });
  }

  return embers;
}

function animateEmbers(embers: Ember[], time: number): void {
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
    const g = Math.floor(100 + heightFade * 150);
    const b = Math.floor(heightFade * 50);

    ember.element.background = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ember.element.shadowColor = `rgba(255, ${g}, 30, ${alpha})`;
    ember.element.shadowBlur = ember.size * 3;
  }
}

// =============================================================================
// BASE GLOW
// =============================================================================

export function createBaseGlow(gui: AdvancedDynamicTexture): Rectangle {
  const baseGlow = new Rectangle();
  baseGlow.width = "100%";
  baseGlow.height = "100%";
  baseGlow.thickness = 0;
  baseGlow.background = "linear-gradient(to top, rgba(139, 35, 0, 0.35) 0%, rgba(80, 20, 0, 0.15) 30%, rgba(30, 8, 0, 0.05) 50%, transparent 70%)";
  gui.addControl(baseGlow);
  return baseGlow;
}

// =============================================================================
// COMBINED EFFECTS SYSTEM
// =============================================================================

/**
 * Create all title screen background effects.
 * Call the returned update() function in scene.onBeforeRenderObservable.
 */
export function createTitleEffects(gui: AdvancedDynamicTexture): TitleEffects {
  const heatLayers = createHeatLayers(gui);
  // Embers created separately via addEmbers() so they render on top of title panel

  return {
    heatLayers,
    embers: [], // Populated later via addEmbers()
    update: (time: number) => {
      animateHeatLayers(heatLayers, time);
    },
  };
}

/**
 * Add embers after the title panel so they render on top.
 * Returns the embers array and enhances the effects update function.
 */
export function addEmbers(gui: AdvancedDynamicTexture, effects: TitleEffects, count: number = 30): void {
  const embers = createEmbers(gui, count);
  effects.embers = embers;

  // Enhance update function to include ember animation
  const originalUpdate = effects.update;
  effects.update = (time: number) => {
    originalUpdate(time);
    animateEmbers(embers, time);
  };
}
