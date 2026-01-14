import { UNSET } from '../common';
import { DistributionSeries, TimeDistributionCanvas } from '../timedistributioncanvas';


export type HoverCallback = (index: number)=>void;


export class HighlightableTimeDistributionCanvas extends TimeDistributionCanvas {

  isHighlighting: boolean;
  highlightSeries: number;
  hoverCallback: HoverCallback;


  constructor(series: DistributionSeries[], minDate: number, maxDate: number,
    // canvas: HTMLCanvasElement, hoverCallback: HoverCallback) {
    canvas: HTMLCanvasElement, readout: HTMLElement, hoverCallback: HoverCallback) {
    // super(series, minDate, maxDate, canvas);
    super(series, minDate, maxDate, canvas, readout);
    this.hoverCallback = hoverCallback;

    this.isHighlighting = false;
    this.highlightSeries = UNSET;
  }

  highlightAncestor() : void {
    if (!this.isHighlighting || this.hoverSeriesIndex !== 0) {
      this.isHighlighting = true;
      this.hoverSeriesIndex = 0;
      this.draw();
    }
  }

  highlightDescendant() :  void {
    if (!this.isHighlighting || this.hoverSeriesIndex !== 1) {
      this.isHighlighting = true;
      this.hoverSeriesIndex = 1;
      this.draw();
    }
  }

  lowlight() {
    if (!this.isHighlighting || this.hoverSeriesIndex !== UNSET) {
      this.isHighlighting = true;
      this.hoverSeriesIndex = UNSET;
      this.draw();
    }
  }

  resetHighlight() : void {
    if (this.isHighlighting || this.hoverSeriesIndex !== UNSET) {
      this.isHighlighting = false;
      this.hoverSeriesIndex = UNSET;
      this.draw();
    }
  }


  handleMousemove = (e: MouseEvent) => {
    super.handleMousemove(e);
    this.hoverCallback(this.hoverSeriesIndex);
  }

  handleMouseout = () => {
    super.handleMouseout();
    this.hoverCallback(UNSET);
  }




}
