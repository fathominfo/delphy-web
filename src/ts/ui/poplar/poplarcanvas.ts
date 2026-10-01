export class PoplarCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
  }
}