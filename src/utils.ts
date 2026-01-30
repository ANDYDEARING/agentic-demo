/**
 * utils.ts
 *
 * Shared utility functions used across multiple scenes.
 * This eliminates code duplication and provides a single source of truth.
 */

import { Color3, Color4, Scene, RenderTargetTexture, ArcRotateCamera, Vector3, AbstractMesh, Observer } from "@babylonjs/core";
import { ScrollViewer, StackPanel, Rectangle, Image, TextBlock, Control } from "@babylonjs/gui";

// =============================================================================
// COLOR CONVERSION
// =============================================================================

/**
 * Convert a hex color string to a Babylon.js Color3
 *
 * @param hex - Hex color string (e.g., "#FF0000" or "#ff0000")
 * @returns Color3 with RGB values in 0-1 range
 *
 * @example
 * const red = hexToColor3("#FF0000"); // Color3(1, 0, 0)
 * const blue = hexToColor3("#0000ff"); // Color3(0, 0, 1)
 */
export function hexToColor3(hex: string): Color3 {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Color3(r, g, b);
}

/**
 * Convert a hex color string to a Babylon.js Color4
 *
 * @param hex - Hex color string (e.g., "#FF0000" or "#ff0000")
 * @param alpha - Alpha value (0-1), defaults to 1
 * @returns Color4 with RGBA values in 0-1 range
 */
export function hexToColor4(hex: string, alpha: number = 1): Color4 {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Color4(r, g, b, alpha);
}

/**
 * Convert a Color3 to a hex color string
 *
 * @param color - Babylon.js Color3
 * @returns Hex color string (e.g., "#ff0000")
 *
 * @example
 * const hex = color3ToHex(new Color3(1, 0, 0)); // "#ff0000"
 */
export function color3ToHex(color: Color3): string {
  const r = Math.round(color.r * 255)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(color.g * 255)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(color.b * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}`;
}

/**
 * Convert RGB object (0-1 range) to Color3
 *
 * @param rgb - Object with r, g, b properties in 0-1 range
 * @returns Babylon.js Color3
 *
 * @example
 * const color = rgbToColor3({ r: 0.5, g: 0.5, b: 0.5 });
 */
export function rgbToColor3(rgb: { r: number; g: number; b: number }): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

// =============================================================================
// MATH UTILITIES
// =============================================================================

/**
 * Clamp a value between min and max
 *
 * @param value - Value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values
 *
 * @param start - Starting value
 * @param end - Ending value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Smoothstep easing function (smooth transition at both ends)
 *
 * @param t - Input value (0-1)
 * @returns Eased value (0-1)
 */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Ease-in-out quadratic function
 *
 * @param t - Input value (0-1)
 * @returns Eased value (0-1)
 */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// =============================================================================
// GRID UTILITIES
// =============================================================================

/**
 * Create a grid coordinate key string for use in Maps/Sets
 *
 * @param x - X coordinate
 * @param z - Z coordinate
 * @returns String key (e.g., "3,5")
 */
export function gridKey(x: number, z: number): string {
  return `${x},${z}`;
}

/**
 * Parse a grid coordinate key back into x,z values
 *
 * @param key - Grid key string (e.g., "3,5")
 * @returns Tuple of [x, z] coordinates
 */
export function parseGridKey(key: string): [number, number] {
  const [x, z] = key.split(",").map(Number);
  return [x, z];
}

/**
 * Calculate Manhattan distance between two grid positions
 *
 * @param x1 - First position X
 * @param z1 - First position Z
 * @param x2 - Second position X
 * @param z2 - Second position Z
 * @returns Manhattan distance
 */
export function manhattanDistance(
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  return Math.abs(x2 - x1) + Math.abs(z2 - z1);
}

/**
 * Check if a position is within grid bounds
 *
 * @param x - X coordinate
 * @param z - Z coordinate
 * @param gridSize - Size of grid (assumes square)
 * @returns True if position is in bounds
 */
export function isInBounds(x: number, z: number, gridSize: number): boolean {
  return x >= 0 && x < gridSize && z >= 0 && z < gridSize;
}

// =============================================================================
// AUDIO UTILITIES
// =============================================================================

/**
 * Create and configure an audio element for music playback
 *
 * @param src - Audio file path
 * @param volume - Volume level (0-1)
 * @param loop - Whether to loop the audio
 * @param loopBuffer - Time before end to trigger manual loop (seconds)
 * @returns Configured HTMLAudioElement
 */
export function createMusicPlayer(
  src: string,
  volume: number,
  loop: boolean = true,
  loopBuffer: number = 0.5
): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = loop;
  audio.volume = volume;

  // Manual loop handling for seamless playback
  if (loop && loopBuffer > 0) {
    audio.addEventListener("timeupdate", () => {
      if (audio.duration && audio.currentTime >= audio.duration - loopBuffer) {
        audio.currentTime = 0;
      }
    });
  }

  return audio;
}

/**
 * Play a sound effect from the beginning
 *
 * @param audio - Audio element to play
 */
export function playSfx(audio: HTMLAudioElement): void {
  audio.currentTime = 0;
  audio.play();
}

// =============================================================================
// RANDOM UTILITIES
// =============================================================================

/**
 * Get a random integer between min and max (inclusive)
 *
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random integer
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get a random element from an array
 *
 * @param array - Array to pick from
 * @returns Random element
 */
export function randomElement<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Shuffle an array in place (Fisher-Yates algorithm)
 *
 * @param array - Array to shuffle
 * @returns The shuffled array (same reference)
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// =============================================================================
// GUI UTILITIES - TOUCH SCROLL
// =============================================================================

export interface TouchScrollOptions {
  /** Hide the scrollbar (default: true) */
  hideScrollbar?: boolean;
  /** Callback when scrolling starts */
  onScrollStart?: () => void;
  /** Callback when scrolling ends (with debounce delay) */
  onScrollEnd?: () => void;
  /** Debounce delay for scroll end detection in ms (default: 150) */
  scrollEndDelay?: number;
}

export interface TouchScrollCleanup {
  /** Remove all touch event listeners */
  dispose: () => void;
}

/**
 * Enable touch-drag scrolling on a Babylon.js GUI ScrollViewer.
 * Works with both touch and mouse/pointer events.
 *
 * @param scrollViewer - The ScrollViewer to enable touch scrolling on
 * @param contentPanel - The content StackPanel inside the ScrollViewer (for height calculation)
 * @param options - Configuration options
 * @returns Cleanup object with dispose() method
 *
 * @example
 * const scroll = enableTouchScroll(scrollViewer, contentStack, { hideScrollbar: true });
 * // Later, when done:
 * scroll.dispose();
 */
export function enableTouchScroll(
  scrollViewer: ScrollViewer,
  contentPanel: StackPanel,
  options: TouchScrollOptions = {}
): TouchScrollCleanup {
  const {
    hideScrollbar = true,
    onScrollStart,
    onScrollEnd,
    scrollEndDelay = 150
  } = options;

  // Hide scrollbar if requested
  if (hideScrollbar) {
    scrollViewer.barSize = 0;
    scrollViewer.barBackground = "transparent";
    scrollViewer.barColor = "transparent";
  }

  let isDragging = false;
  let lastY = 0;
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

  const setScrolling = () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    onScrollStart?.();
    scrollTimeout = setTimeout(() => {
      onScrollEnd?.();
    }, scrollEndDelay);
  };

  const handleStart = (clientY: number) => {
    isDragging = true;
    lastY = clientY;
  };

  const handleMove = (clientY: number, preventDefault?: () => void) => {
    if (!isDragging) return;

    const deltaY = lastY - clientY;
    lastY = clientY;

    const contentHeight = contentPanel.heightInPixels;
    const viewportHeight = scrollViewer.heightInPixels;
    const maxScroll = contentHeight - viewportHeight;

    if (maxScroll > 0) {
      setScrolling();
      const scrollDelta = deltaY / maxScroll;
      const newScroll = Math.max(0, Math.min(1, scrollViewer.verticalBar.value + scrollDelta));
      scrollViewer.verticalBar.value = newScroll;
      preventDefault?.();
    }
  };

  const handleEnd = () => {
    isDragging = false;
  };

  // Touch events
  const touchStart = (e: TouchEvent) => handleStart(e.touches[0].clientY);
  const touchMove = (e: TouchEvent) => handleMove(e.touches[0].clientY, () => e.preventDefault());
  const touchEnd = () => handleEnd();

  // Mouse/pointer events (for desktop drag support)
  const pointerDown = (e: PointerEvent) => handleStart(e.clientY);
  const pointerMove = (e: PointerEvent) => handleMove(e.clientY);
  const pointerUp = () => handleEnd();

  window.addEventListener("touchstart", touchStart, { passive: false });
  window.addEventListener("touchmove", touchMove, { passive: false });
  window.addEventListener("touchend", touchEnd);
  window.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", pointerUp);

  return {
    dispose: () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
    }
  };
}

// =============================================================================
// GUI UTILITIES - RTT PREVIEW
// =============================================================================

export interface RTTPreviewOptions {
  /** RTT texture size in pixels (default: 256) */
  size?: number;
  /** Background color as hex string (default: "#1a1a2e") */
  backgroundColor?: string;
  /** Layer mask for isolating this preview's meshes */
  layerMask?: number;
  /** Camera initial alpha angle (default: -Math.PI / 2 + 0.2) */
  cameraAlpha?: number;
  /** Camera initial beta angle (default: Math.PI / 2.3) */
  cameraBeta?: number;
  /** Camera radius/distance (default: 2.0) */
  cameraRadius?: number;
  /** Camera target position (default: Vector3(0, 1, 0)) */
  cameraTarget?: Vector3;
  /** Enable auto-rotation (default: true) */
  autoRotate?: boolean;
  /** Rotation speed in radians per frame (default: 0.008) */
  rotationSpeed?: number;
  /** Frame skip for performance (update every N frames, default: 2) */
  frameSkip?: number;
}

export interface RTTPreview {
  /** The RenderTargetTexture */
  rtt: RenderTargetTexture;
  /** The preview camera */
  camera: ArcRotateCamera;
  /** The GUI Image displaying the preview */
  image: Image;
  /** The loading text element */
  loadingText: TextBlock;
  /** The container Rectangle */
  container: Rectangle;
  /** Layer mask for this preview */
  layerMask: number;
  /** Set meshes to render in this preview */
  setMeshes: (meshes: AbstractMesh[]) => void;
  /** Mark the preview as loaded (shows image, hides loading text) */
  setLoaded: (loaded: boolean) => void;
  /** Reset camera rotation */
  resetRotation: () => void;
  /** Pause/resume rendering */
  setPaused: (paused: boolean) => void;
  /** Clean up all resources */
  dispose: () => void;
}

/**
 * Create an RTT-based preview system for displaying 3D models in GUI.
 * Renders to an off-screen texture and displays as a GUI Image.
 *
 * @param scene - The Babylon.js scene
 * @param parentContainer - GUI Rectangle to add the preview to
 * @param id - Unique identifier for naming resources
 * @param options - Configuration options
 * @returns RTTPreview object with controls and cleanup
 *
 * @example
 * const preview = createRTTPreview(scene, container, "unit_0", { autoRotate: true });
 * // Load a model and set it:
 * preview.setMeshes(result.meshes);
 * preview.setLoaded(true);
 * // Cleanup when done:
 * preview.dispose();
 */
export function createRTTPreview(
  scene: Scene,
  parentContainer: Rectangle,
  id: string,
  options: RTTPreviewOptions = {}
): RTTPreview {
  const {
    size = 256,
    backgroundColor = "#1a1a2e",
    layerMask = 0x10000000,
    cameraAlpha = -Math.PI / 2 + 0.2,
    cameraBeta = Math.PI / 2.3,
    cameraRadius = 2.0,
    cameraTarget = new Vector3(0, 1, 0),
    autoRotate = true,
    rotationSpeed = 0.008,
    frameSkip = 2
  } = options;

  // Create RTT
  const rtt = new RenderTargetTexture(`rtt_${id}`, size, scene, false);
  rtt.clearColor = hexToColor4(backgroundColor);
  scene.customRenderTargets.push(rtt);

  // Create camera
  const camera = new ArcRotateCamera(
    `cam_${id}`,
    cameraAlpha,
    cameraBeta,
    cameraRadius,
    cameraTarget.clone(),
    scene
  );
  rtt.activeCamera = camera;
  camera.layerMask = layerMask;

  // Force square aspect ratio
  const originalGetEngine = camera.getEngine.bind(camera);
  camera.getEngine = () => {
    const eng = originalGetEngine();
    return { ...eng, getAspectRatio: () => 1 } as any;
  };

  // Canvas for pixel transfer
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Inner container (maintains square aspect ratio)
  const innerContainer = new Rectangle(`innerPreview_${id}`);
  innerContainer.width = "100%";
  innerContainer.height = "100%";
  innerContainer.thickness = 0;
  innerContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  parentContainer.addControl(innerContainer);

  // Make container square based on height
  const updateInnerSize = () => {
    const h = parentContainer.heightInPixels;
    if (h > 0) {
      innerContainer.width = `${h}px`;
    }
  };
  parentContainer.onAfterDrawObservable.add(updateInnerSize);

  // Loading text
  const loadingText = new TextBlock(`loading_${id}`);
  loadingText.text = "Loading...";
  loadingText.color = "#666666";
  loadingText.fontSize = 11;
  innerContainer.addControl(loadingText);

  // Preview image
  const previewImage = new Image(`img_${id}`, "");
  previewImage.stretch = Image.STRETCH_UNIFORM;
  previewImage.width = "100%";
  previewImage.height = "100%";
  previewImage.alpha = 0;
  innerContainer.addControl(previewImage);

  // State
  let frameCount = 0;
  let isLoaded = false;
  let isPaused = false;
  let totalRotation = 0;
  const initialAlpha = cameraAlpha;

  // Render observer
  let renderObserver: Observer<number> | null = null;

  renderObserver = rtt.onAfterRenderObservable.add(() => {
    if (!isLoaded || isPaused) return;

    frameCount++;

    // Auto-rotate
    if (autoRotate) {
      camera.alpha += rotationSpeed;
      totalRotation += rotationSpeed;
    }

    // Update image (skip frames for performance)
    if (frameCount % frameSkip !== 0) return;

    rtt.readPixels()?.then((buffer) => {
      if (!buffer) return;
      const pixels = new Uint8Array(buffer.buffer);
      const imageData = ctx.createImageData(size, size);

      // Convert RGBA buffer (flip Y axis)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const srcIdx = ((size - 1 - y) * size + x) * 4;
          const dstIdx = (y * size + x) * 4;
          imageData.data[dstIdx] = pixels[srcIdx];
          imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
          imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
          imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
        }
      }

      ctx.putImageData(imageData, 0, 0);
      previewImage.source = canvas.toDataURL();
    });
  });

  return {
    rtt,
    camera,
    image: previewImage,
    loadingText,
    container: innerContainer,
    layerMask,

    setMeshes: (meshes: AbstractMesh[]) => {
      if (rtt.renderList) {
        rtt.renderList.length = 0;
        meshes.forEach(m => {
          m.layerMask = layerMask;
          rtt.renderList!.push(m);
        });
      }
    },

    setLoaded: (loaded: boolean) => {
      isLoaded = loaded;
      loadingText.isVisible = !loaded;
      previewImage.alpha = loaded ? 1 : 0;
    },

    resetRotation: () => {
      camera.alpha = initialAlpha;
      totalRotation = 0;
    },

    setPaused: (paused: boolean) => {
      isPaused = paused;
    },

    dispose: () => {
      if (renderObserver) {
        rtt.onAfterRenderObservable.remove(renderObserver);
      }
      const idx = scene.customRenderTargets.indexOf(rtt);
      if (idx >= 0) {
        scene.customRenderTargets.splice(idx, 1);
      }
      rtt.dispose();
      camera.dispose();
    }
  };
}
