import { SoftFloat } from "../../util/softfloat";
import { UNSET, resizeCanvas } from "../common";

const TICK_WIDTH = 0.1;
const CURRENT_TICK_WIDTH = 1;
const MCC_TICK_WIDTH = 1.5;
const FOCUS_WIDTH = 1;

const MIN_TICK_HEIGHT_PCT = 0.7;
const MAX_TICK_HEIGHT_PCT = 0.9;

const TICK_COLOR = "rgb(80, 80, 80)";
const PRE_KNEE_COLOR = "rgb(200, 200, 200)";
const MCC_COLOR = "#07C203";

const FOCUS_COLOR = "#3563D8";

const margin = {
  top: 0,
  right: CURRENT_TICK_WIDTH,
  bottom: 0,
  left: CURRENT_TICK_WIDTH
};

export type sampleListenerType = ()=>void;

export class TreeScrubber {
  div: HTMLElement;
  mccLabel: HTMLElement;
  previewLabel: HTMLElement;
  burnInLabel: HTMLElement;
  burnInIndicator: HTMLElement;
  range: HTMLInputElement;
  visualizer: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  width: number;
  height: number;

  sampleListener: sampleListenerType;

  treeCount: number;
  mccIndex: number;
  kneeIndex: number;
  showLatestBaseTree: boolean;
  sampledIndex: number;

  hoverIndex: number;
  isPointerOver: boolean;
  isPointerDown: boolean;
  isFocus: boolean;

  tickHeightPcts: SoftFloat[];

  constructor(div: HTMLElement, sampleListener: sampleListenerType) {
    this.div = div;
    this.mccLabel = this.div.querySelector(".tree-scrubber--mcc-label") as HTMLElement;
    this.previewLabel = this.div.querySelector(".tree-scrubber--preview-label") as HTMLElement;
    this.burnInLabel = this.div.querySelector(".burn-in-label") as HTMLElement;
    this.burnInIndicator = this.div.querySelector(".burn-in-indicator") as HTMLElement;
    this.range = this.div.querySelector(".tree-scrubber--range") as HTMLInputElement;
    this.visualizer = this.div.querySelector(".tree-scrubber--visualizer") as HTMLElement;
    this.canvas = this.div.querySelector(".tree-scrubber--canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;

    this.width = 0;
    this.height = 0;

    this.sampleListener = sampleListener;

    this.treeCount = UNSET;
    this.mccIndex = UNSET;
    this.kneeIndex = UNSET;
    this.sampledIndex = UNSET;
    this.hoverIndex = UNSET;
    this.showLatestBaseTree = true;

    this.isPointerOver = false;
    this.isPointerDown = false;
    this.isFocus = false;

    this.tickHeightPcts = [];
    for (let i = 0; i < this.treeCount; i++) {
      const heightPct = new SoftFloat(MIN_TICK_HEIGHT_PCT);
      this.tickHeightPcts.push(heightPct);
    }

    this.range.addEventListener("input", () => {
      const newIndex = parseInt(this.range.value);
      this.setCurrentIndex(newIndex);
      this.sampleListener();
      this.requestDraw();
    });
    this.range.addEventListener("focus", () => {
      this.isFocus = true;
      this.requestDraw();
    });
    this.range.addEventListener("blur", () => {
      this.isFocus = false;
      this.requestDraw();
    });

    this.canvas.addEventListener("pointerover", e => this.handlePointerOver(e));
    this.canvas.addEventListener("pointerdown", e => this.handlePointerDown(e));
    this.canvas.addEventListener("pointermove", e => this.handlePointerMove(e));
    this.canvas.addEventListener("pointerup", () => this.handlePointerUp());
    this.canvas.addEventListener("pointerout", () => this.handlePointerOut());

    this.requestDraw();
  }

  setData(treeCount:number, kneeIndex:number, mccIndex:number) {
    const treesDiff = treeCount - this.treeCount;
    if (treesDiff > 0) {
      for (let i = 0; i < treesDiff; i++) {
        const heightPct = new SoftFloat(MIN_TICK_HEIGHT_PCT);
        this.tickHeightPcts.push(heightPct);
      }
    } else if (treesDiff < 0) {
      this.tickHeightPcts = this.tickHeightPcts.slice(0, treeCount);
    }

    this.treeCount = treeCount;
    this.mccIndex = mccIndex;
    this.kneeIndex = kneeIndex;
    if (this.showLatestBaseTree) {
      this.sampledIndex = treeCount - 1;
    }

    this.range.max = `${this.treeCount - 1}`;

    if (treeCount > 1) {
      this.mccLabel.classList.remove("hidden");
      this.previewLabel.classList.remove("hidden");
    }

    if (this.sampledIndex === UNSET) return;

    this.setMccIndex(this.mccIndex);
    this.setCurrentIndex(this.sampledIndex);
    this.setBurnIn(this.kneeIndex);

    this.sizeCanvas();
    this.requestDraw();
  }

  requestDraw() {
    requestAnimationFrame(() => this.draw());
  }

  draw() {
    const { ctx, width, height } = this;

    let allAtTarget = true;

    ctx.clearRect(0, 0, width, height);
    let x = margin.left;
    const INCREMENT = (width - margin.left - margin.right) / (this.treeCount - 1);
    for (let i = 0; i < this.treeCount; i++) {
      // update and get tick height
      if (this.tickHeightPcts[i].get() === MAX_TICK_HEIGHT_PCT) {
        if (i !== this.hoverIndex && i !== this.sampledIndex) {
          this.tickHeightPcts[i].setTarget(MIN_TICK_HEIGHT_PCT);
        }
      }
      if (!this.tickHeightPcts[i].atTarget()) {
        allAtTarget = false;
      }
      this.tickHeightPcts[i].update();
      const heightPct = this.tickHeightPcts[i].get();
      const y1 = (1 - heightPct) / 2 * height;
      const y2 = height - y1;

      // set tick styles
      ctx.strokeStyle = TICK_COLOR;
      ctx.lineWidth = TICK_WIDTH;
      if (i < this.kneeIndex) {
        ctx.strokeStyle = PRE_KNEE_COLOR;
      }
      if (i === this.sampledIndex) {
        ctx.lineWidth = CURRENT_TICK_WIDTH;
      }
      if (i === this.mccIndex) {
        ctx.strokeStyle = MCC_COLOR;
        ctx.lineWidth = MCC_TICK_WIDTH;
      }

      // draw tick
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();

      // increment x
      x += INCREMENT;
    }

    // focus styles
    if (this.isFocus) {
      x = margin.left + INCREMENT * this.sampledIndex;

      ctx.lineWidth = FOCUS_WIDTH;
      ctx.strokeStyle = FOCUS_COLOR;
      ctx.strokeRect(
        x - CURRENT_TICK_WIDTH / 2 - 1,
        FOCUS_WIDTH,
        CURRENT_TICK_WIDTH + 2,
        height - FOCUS_WIDTH * 2
      );
    }

    if (!allAtTarget) {
      this.requestDraw();
    }
  }

  sizeCanvas() {
    const { width, height } = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
  }

  handlePointerOver(e: PointerEvent) {
    this.isPointerOver = true;
    const newIndex = this.getHoverIndex(e);
    if (newIndex === UNSET) return;

    this.tickHeightPcts[newIndex].setTarget(MAX_TICK_HEIGHT_PCT);
    this.hoverIndex = newIndex;

    this.requestDraw();
  }

  handlePointerDown(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    this.isPointerDown = true;
    this.range.focus();

    const newIndex = this.getHoverIndex(e);
    if (newIndex === UNSET) return;
    this.setHoverIndex(newIndex);
    this.setCurrentIndex(newIndex);

    this.sampleListener();

    this.requestDraw();
  }

  handlePointerMove(e: PointerEvent) {
    const newIndex = this.getHoverIndex(e);
    if (newIndex === UNSET) return;
    this.setHoverIndex(newIndex);
    if (this.isPointerDown) {
      this.setCurrentIndex(newIndex);
      this.sampleListener();
    }

    this.requestDraw();
  }

  handlePointerUp() {
    this.isPointerDown = false;
    this.requestDraw();
  }

  handlePointerOut() {
    this.hoverIndex = -1;
    this.requestDraw();
  }

  getHoverIndex(e: MouseEvent): number {
    const x = e.offsetX;
    const xPct = x / this.width;
    const newIndex = Math.floor(xPct * this.treeCount);
    return newIndex;
  }

  setHoverIndex(newIndex: number) {
    newIndex = Math.max(0, Math.min(this.treeCount - 1, newIndex)); // clamp
    this.tickHeightPcts[newIndex].setTarget(MAX_TICK_HEIGHT_PCT);
    this.hoverIndex = newIndex;
  }

  setCurrentIndex(newIndex: number) {
    newIndex = Math.max(0, Math.min(this.treeCount - 1, newIndex)); // clamp
    this.sampledIndex = newIndex;

    this.tickHeightPcts[newIndex].setTarget(MAX_TICK_HEIGHT_PCT);

    this.range.value = `${newIndex}`;

    const mccPreviewingLabel = this.mccLabel.querySelector(".previewing") as HTMLElement;
    // const mccIndicator = this.mccLabel.querySelector(".mcc-indicator") as HTMLElement;
    if (newIndex === this.mccIndex) {
      this.previewLabel.classList.add("hidden");
      mccPreviewingLabel.classList.remove("hidden");
      // this.mccLabel.innerText = "MCC (previewing)";
      // mccIndicator.classList.add("hidden");
      // this.mccLabel.classList.remove("shifted");
    } else {
      this.previewLabel.classList.remove("hidden");
      mccPreviewingLabel.classList.add("hidden");
      // this.mccLabel.innerText = "MCC";
      // mccIndicator.classList.remove("hidden");
      const leftPct = newIndex / (this.treeCount - 1);
      this.previewLabel.style.left = `${leftPct * 100}%`;

      const previewingBB = this.previewLabel.getBoundingClientRect();
      const mccBB = this.mccLabel.getBoundingClientRect();
      if (isOverlap(previewingBB, mccBB)) {
        // this.mccLabel.classList.add("shifted");
        // mccIndicator.classList.add("hidden");
      } else {
        // this.mccLabel.classList.remove("shifted");
        // mccIndicator.classList.remove("hidden");
      }
    }

    this.previewLabel.classList.toggle("burn-in", newIndex < this.kneeIndex);

    this.showLatestBaseTree = newIndex >= this.treeCount - 1;
  }

  setMccIndex(newIndex: number) {
    this.mccIndex = newIndex;

    const leftPct = newIndex / (this.treeCount - 1);
    this.mccLabel.style.left = `${leftPct * 100}%`;
  }

  setBurnIn(newIndex: number) {
    if (newIndex <= 0) {
      // no burn in
      this.div.classList.add("no-burn-in");
      this.burnInLabel.innerText = "No burn-in set.";
    } else {
      this.div.classList.remove("no-burn-in");
      this.burnInLabel.innerText = "Burn-in period";

      const pct = (newIndex - 1) / (this.treeCount - 1);
      this.burnInIndicator.style.width = `${pct * 100}%`;
    }
  }
}

function isOverlap(bb1: DOMRect, bb2: DOMRect): boolean {
  if (bb2.left > bb1.right) return false;
  if (bb2.right < bb1.left) return false;
  return true;
}