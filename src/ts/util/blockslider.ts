import { ValueHandler } from "../ui/common";

export class BlockSlider {
  div: HTMLElement;

  input: HTMLInputElement;
  min: number;
  max: number;
  step: number;

  track: HTMLElement;
  trackFilled: HTMLElement;
  thumb: HTMLElement;

  isPointerDown: boolean;

  inputCallback: ValueHandler;

  constructor(div: HTMLElement, inputCallback: ValueHandler, min?: number, max?: number, step?: number) {
    this.div = div;

    this.input = div.querySelector(".slider--input") as HTMLInputElement;
    if (min !== undefined && max !== undefined && step !== undefined) {
      this.min = min;
      this.max = max;
      this.step = step;
      this.input.min = `${min}`;
      this.input.max = `${max}`;
      this.input.step = `${step}`;
    } else {
      this.min = parseFloat(this.input.min);
      this.max = parseFloat(this.input.max);
      this.step =  parseFloat(this.input.step);
    }
    this.input.addEventListener("input", () => this.handleNativeInput());
    this.input.addEventListener("focusin", () => { this.div.classList.add("focus") });
    this.input.addEventListener("focusout", () => { this.div.classList.remove("focus") });

    this.track = div.querySelector(".slider--track") as HTMLElement;
    this.track.addEventListener("pointerdown", e => this.handlePointerDown(e));
    this.track.addEventListener("pointermove", e => this.handlePointerMove(e));
    this.track.addEventListener("pointerup", () => this.handlePointerUp());
    this.trackFilled = div.querySelector(".slider--track-filled") as HTMLElement;
    this.thumb = div.querySelector(".slider--thumb") as HTMLElement;

    this.isPointerDown = false;

    this.inputCallback = inputCallback;
  }

  private handleNativeInput() {
    this.handleInput();

    const value = parseFloat(this.input.value);
    this.inputCallback(value);
  }

  private handleInput() {
    const value = parseFloat(this.input.value);
    const max = parseFloat(this.input.max);
    const valuePct = value / max;
    const valueLabel = `${valuePct * 100}%`;

    this.trackFilled.style.width = valueLabel;
    this.thumb.style.left = valueLabel;
  }

  private handlePointerDown(e: PointerEvent) {
    this.track.setPointerCapture(e.pointerId);
    this.isPointerDown = true;
    this.div.classList.add("active");
  }

  private handlePointerMove(e: PointerEvent) {
    if (!this.isPointerDown) return;

    const x = e.offsetX;
    const width = parseInt(getComputedStyle(this.div).width);

    let pct = x / width;
    pct = Math.min(1, Math.max(0, pct));
    const value = this.min + pct * (this.max - this.min);
    const rounded = this.roundToStep(value);

    this.input.value = `${rounded}`;
    this.handleInput();
    this.inputCallback(rounded);
  }

  private handlePointerUp() {
    this.isPointerDown = false;
    this.div.classList.remove("active");
  }

  private roundToStep(value: number): number {
    const multiplier = 1 / this.step;
    const rounded = Math.round(value * multiplier) / multiplier;
    return rounded;
  }

  set(value: number, min?: number, max?: number, step?: number) {
    if (min !== undefined) this.min = min;
    if (max !== undefined) this.max = max;
    if (step !== undefined) this.step = step;

    const rounded = this.roundToStep(value);
    this.input.value = `${rounded}`;
    this.handleInput();
  }
}