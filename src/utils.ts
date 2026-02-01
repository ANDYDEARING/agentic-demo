/**
 * utils.ts
 *
 * Shared utility functions used across multiple scenes.
 * This eliminates code duplication and provides a single source of truth.
 */

import { Color3, Color4, Scene, RenderTargetTexture, ArcRotateCamera, Vector3, AbstractMesh, Observer } from "@babylonjs/core";
import { AdvancedDynamicTexture, ScrollViewer, StackPanel, Rectangle, Image, TextBlock, Control, Button } from "@babylonjs/gui";
import { SCROLLBAR_COLOR, SCROLLBAR_BACKGROUND, SCROLLBAR_SIZE } from "./config/constants";

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

/** Music player with dispose method for cleanup */
export type MusicPlayer = HTMLAudioElement & { dispose: () => void };

/**
 * Create and configure an audio element for music playback
 *
 * @param src - Audio file path
 * @param volume - Volume level (0-1)
 * @param loop - Whether to loop the audio
 * @param loopBuffer - Time before end to trigger manual loop (seconds)
 * @returns Configured HTMLAudioElement with dispose method
 */
export function createMusicPlayer(
  src: string,
  volume: number,
  loop: boolean = true,
  loopBuffer: number = 0.5
): MusicPlayer {
  const audio = new Audio(src) as MusicPlayer;
  audio.volume = volume;

  // Track listener for cleanup
  let loopHandler: (() => void) | null = null;

  // Use manual loop handling for seamless playback (avoids gap at end)
  // Don't set audio.loop = true when using manual looping to avoid double-play on mobile
  if (loop && loopBuffer > 0) {
    audio.loop = false; // We handle looping manually
    loopHandler = () => {
      if (audio.duration && audio.currentTime >= audio.duration - loopBuffer) {
        audio.currentTime = 0;
      }
    };
    audio.addEventListener("timeupdate", loopHandler);
  } else {
    audio.loop = loop;
  }

  // Dispose method to clean up listeners and stop playback
  audio.dispose = () => {
    audio.pause();
    if (loopHandler) {
      audio.removeEventListener("timeupdate", loopHandler);
      loopHandler = null;
    }
    audio.src = "";
  };

  return audio;
}

/**
 * Play a sound effect from the beginning
 *
 * @param audio - Audio element to play
 */
export function playSfx(audio: HTMLAudioElement): void {
  // Clone the audio element to allow overlapping sounds
  // This fixes issues where rapid sounds don't play or only one plays
  const clone = audio.cloneNode() as HTMLAudioElement;
  clone.volume = audio.volume;
  clone.play().catch(() => {
    // Ignore autoplay restrictions - sound simply won't play
  });
  // Clean up clone after it finishes to prevent memory buildup
  clone.onended = () => {
    clone.onended = null;
    clone.src = "";
  };
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
    hideScrollbar = false,
    onScrollStart,
    onScrollEnd,
    scrollEndDelay = 150
  } = options;

  // Apply scrollbar styling (visible by default, with centralized colors)
  if (hideScrollbar) {
    scrollViewer.barSize = 0;
    scrollViewer.barBackground = "transparent";
    scrollViewer.barColor = "transparent";
  }
  // Note: When not hiding, scrollbar styling is handled by the caller

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

// =============================================================================
// RESPONSIVE OVERLAY
// =============================================================================

export interface OverlayButton {
  label: string;
  action: () => void;
  style?: 'primary' | 'secondary';
}

export interface OverlayToggle {
  label: string;
  altLabel: string;
  getAltContent: () => string;
}

export interface ResponsiveOverlayConfig {
  title: string;
  getContent: () => string;
  buttons: OverlayButton[];
  toggle?: OverlayToggle;
  colors?: {
    title?: string;
    text?: string;
    primary?: string;
    secondary?: string;
  };
}

export interface ResponsiveOverlay {
  show: () => void;
  hide: () => void;
  isVisible: () => boolean;
  /** Clean up all listeners - call on scene dispose */
  dispose: () => void;
}

/**
 * Create a responsive modal overlay with automatic layout adaptation.
 * Uses ratio-based sizing - no resize handler needed.
 *
 * @param gui - The AdvancedDynamicTexture to add the overlay to
 * @param config - Overlay configuration
 * @returns Control object with show/hide methods
 */
export function createResponsiveOverlay(
  gui: AdvancedDynamicTexture,
  config: ResponsiveOverlayConfig
): ResponsiveOverlay {
  const colors = {
    title: config.colors?.title ?? "#ff9966",
    text: config.colors?.text ?? "#cccccc",
    primary: config.colors?.primary ?? "#ff9966",
    secondary: config.colors?.secondary ?? "#66aaff",
  };

  let isShowingAlt = false;
  let scrollCleanup: TouchScrollCleanup | null = null;

  // Create all controls once
  const overlay = new Rectangle("overlay");
  overlay.width = "100%";
  overlay.height = "100%";
  overlay.background = "rgba(0, 0, 0, 0.95)";
  overlay.thickness = 0;
  overlay.zIndex = 100;
  overlay.isVisible = false;

  const container = new Rectangle("container");
  container.thickness = 0;
  container.background = "transparent";
  container.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
  container.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  overlay.addControl(container);

  // Header
  const header = new StackPanel("header");
  header.isVertical = true;
  header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  header.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  container.addControl(header);

  const title = new TextBlock("title", config.title);
  title.color = colors.title;
  title.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
  title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  title.height = "40px"; // Default pixel height to avoid StackPanel percentage warning
  header.addControl(title);

  const divider = new Rectangle("divider");
  divider.width = "80%";
  divider.height = "2px"; // Initial pixel height to avoid StackPanel warning
  divider.background = "rgba(255, 150, 80, 0.4)";
  divider.thickness = 0;
  header.addControl(divider);

  // Scrollable content
  const scrollViewer = new ScrollViewer("scroll");
  scrollViewer.thickness = 0;
  scrollViewer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  scrollViewer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  scrollViewer.barSize = SCROLLBAR_SIZE;
  scrollViewer.barColor = SCROLLBAR_COLOR;
  scrollViewer.barBackground = SCROLLBAR_BACKGROUND;
  // Hide horizontal scrollbar - Babylon.js GUI has no official API for this.
  // forceHorizontalBar/forceVerticalBar only force bars ON, not OFF.
  // horizontalBar.isVisible = false doesn't work (property is ignored).
  // Must use internal properties to hide the bar space and corner drag space.
  const sv = scrollViewer as any;
  if (sv._horizontalBarSpace) sv._horizontalBarSpace.isVisible = false;
  if (sv._dragSpace) sv._dragSpace.isVisible = false;
  container.addControl(scrollViewer);

  const contentStack = new StackPanel("contentStack");
  contentStack.width = "100%";
  contentStack.isVertical = true;
  contentStack.paddingTop = "10px";
  contentStack.paddingBottom = "20px";
  contentStack.clipChildren = true;
  contentStack.clipContent = true;
  scrollViewer.addControl(contentStack);

  const contentText = new TextBlock("content");
  contentText.text = config.getContent();
  contentText.color = colors.text;
  contentText.fontFamily = "'Exo 2', sans-serif";
  contentText.textWrapping = true;
  contentText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  contentText.resizeToFit = true;
  contentText.width = "90%";
  contentText.paddingLeft = "5%";
  contentText.paddingRight = "5%";
  contentStack.addControl(contentText);

  // Footer with buttons
  const footer = new StackPanel("footer");
  footer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
  footer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  footer.adaptWidthToChildren = true;
  // Set initial orientation to avoid layout flicker on first render
  const initialSize = gui.getSize();
  footer.isVertical = !(initialSize.width > initialSize.height);
  container.addControl(footer);

  // Create buttons
  const buttonRefs: Button[] = [];

  // Toggle button (if configured)
  let toggleButton: Button | null = null;
  if (config.toggle) {
    toggleButton = Button.CreateSimpleButton("toggle", config.toggle.label);
    toggleButton.width = "120px"; // Initial pixel size, updated by updateLayout
    toggleButton.height = "40px";
    toggleButton.background = "rgba(40, 50, 60, 0.8)";
    toggleButton.cornerRadius = 4;
    toggleButton.thickness = 1;
    toggleButton.color = colors.secondary;
    toggleButton.hoverCursor = "pointer";
    if (toggleButton.textBlock) {
      toggleButton.textBlock.color = colors.secondary;
      toggleButton.textBlock.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
    }
    toggleButton.onPointerEnterObservable.add(() => {
      toggleButton!.background = "rgba(60, 80, 100, 0.9)";
      if (toggleButton!.textBlock) toggleButton!.textBlock.color = "#ffffff";
    });
    toggleButton.onPointerOutObservable.add(() => {
      toggleButton!.background = "rgba(40, 50, 60, 0.8)";
      if (toggleButton!.textBlock) toggleButton!.textBlock.color = colors.secondary;
    });
    toggleButton.onPointerClickObservable.add(() => {
      isShowingAlt = !isShowingAlt;
      if (isShowingAlt) {
        contentText.text = config.toggle!.getAltContent();
        if (toggleButton!.textBlock) toggleButton!.textBlock.text = config.toggle!.altLabel;
        title.text = config.toggle!.label;
      } else {
        contentText.text = config.getContent();
        if (toggleButton!.textBlock) toggleButton!.textBlock.text = config.toggle!.label;
        title.text = config.title;
      }
      scrollViewer.verticalBar.value = 0;
    });
    footer.addControl(toggleButton);
    buttonRefs.push(toggleButton);
  }

  // Regular buttons
  config.buttons.forEach((btnConfig, i) => {
    if (i > 0 || toggleButton) {
      const spacer = new Rectangle(`spacer${i}`);
      spacer.thickness = 0;
      spacer.width = "15px"; // Default pixel size to avoid StackPanel percentage warning
      spacer.height = "8px";
      footer.addControl(spacer);
    }

    const btn = Button.CreateSimpleButton(`btn${i}`, btnConfig.label);
    btn.width = "120px"; // Initial pixel size, updated by updateLayout
    btn.height = "40px";
    const isPrimary = btnConfig.style !== 'secondary';
    btn.background = isPrimary ? "rgba(80, 40, 30, 0.8)" : "rgba(40, 50, 60, 0.8)";
    btn.cornerRadius = 4;
    btn.thickness = 1;
    btn.color = isPrimary ? colors.primary : colors.secondary;
    btn.hoverCursor = "pointer";
    if (btn.textBlock) {
      btn.textBlock.color = isPrimary ? colors.primary : colors.secondary;
      btn.textBlock.fontFamily = "'Bebas Neue', 'Arial Black', sans-serif";
    }
    btn.onPointerEnterObservable.add(() => {
      btn.background = isPrimary ? "rgba(120, 60, 40, 0.9)" : "rgba(60, 80, 100, 0.9)";
      if (btn.textBlock) btn.textBlock.color = "#ffffff";
    });
    btn.onPointerOutObservable.add(() => {
      btn.background = isPrimary ? "rgba(80, 40, 30, 0.8)" : "rgba(40, 50, 60, 0.8)";
      if (btn.textBlock) btn.textBlock.color = isPrimary ? colors.primary : colors.secondary;
    });
    btn.onPointerClickObservable.add(btnConfig.action);
    footer.addControl(btn);
    buttonRefs.push(btn);
  });

  // Layout update function - called on show and resize
  function updateLayout() {
    const size = gui.getSize();
    const isLandscape = size.width > size.height;
    const baseUnit = Math.min(size.width, size.height);

    // Container sizing - larger in portrait to fit stacked buttons
    container.width = isLandscape ? "60%" : "90%";
    container.height = isLandscape ? "85%" : "92%";

    // Header
    header.width = isLandscape ? "70%" : "100%";
    header.height = isLandscape ? "12%" : "10%";
    title.fontSize = baseUnit * 0.05;
    // Use pixel heights in StackPanel (not percentages) to avoid Babylon warnings
    const headerHeight = size.height * (isLandscape ? 0.12 : 0.10) * 0.85;
    title.height = `${Math.round(headerHeight * 0.7)}px`;
    divider.height = "2px";

    // Scroll area
    scrollViewer.width = isLandscape ? "70%" : "100%";
    scrollViewer.height = isLandscape ? "65%" : "68%";
    scrollViewer.top = isLandscape ? "12%" : "10%";
    contentText.fontSize = baseUnit * 0.028;

    // Footer - more height in portrait to fit stacked buttons + safe area
    footer.height = isLandscape ? "15%" : "18%";
    footer.isVertical = !isLandscape;
    footer.paddingBottom = isLandscape ? "2%" : "4%";

    // Button sizing
    const btnWidth = isLandscape ? baseUnit * 0.25 : baseUnit * 0.4;
    const btnHeight = baseUnit * 0.08;
    const btnFontSize = baseUnit * 0.03;
    const spacerSize = isLandscape ? "15px" : "8px";

    buttonRefs.forEach(btn => {
      btn.width = `${btnWidth}px`;
      btn.height = `${btnHeight}px`;
      if (btn.textBlock) btn.textBlock.fontSize = btnFontSize;
    });

    // Update spacers
    footer.children.forEach(child => {
      if (child.name?.startsWith("spacer")) {
        (child as Rectangle).width = isLandscape ? spacerSize : "100%";
        (child as Rectangle).height = isLandscape ? "100%" : spacerSize;
      }
    });
  }

  // Resize observer
  let lastWidth = 0;
  let lastHeight = 0;
  gui.onBeginRenderObservable.add(() => {
    if (!overlay.isVisible) return;
    const size = gui.getSize();
    if (size.width !== lastWidth || size.height !== lastHeight) {
      lastWidth = size.width;
      lastHeight = size.height;
      updateLayout();
    }
  });

  gui.addControl(overlay);

  return {
    show: () => {
      isShowingAlt = false;
      contentText.text = config.getContent();
      title.text = config.title;
      if (toggleButton?.textBlock && config.toggle) {
        toggleButton.textBlock.text = config.toggle.label;
      }
      overlay.isVisible = true;
      updateLayout();
      scrollCleanup = enableTouchScroll(scrollViewer, contentStack);
    },
    hide: () => {
      overlay.isVisible = false;
      if (scrollCleanup) {
        scrollCleanup.dispose();
        scrollCleanup = null;
      }
    },
    isVisible: () => overlay.isVisible,
    dispose: () => {
      // Clean up scroll listeners if overlay was shown
      if (scrollCleanup) {
        scrollCleanup.dispose();
        scrollCleanup = null;
      }
    },
  };
}
