import { UNSET } from "../common";
import { SelectTreeCallback } from "./poplarcommon";

const container = document.querySelector("#poplar #poplar--scrubber-container") as HTMLDivElement;
const chart = container.querySelector("svg") as SVGSVGElement;
const tickTemplate = chart.querySelector(".tick") as SVGLineElement;
tickTemplate.remove();

const SVG_HEIGHT = 40; // keep in synch with HTML
// const TICK_HEIGHT = 20;;

const PADDING = {
  top: 5,
  bottom: 5,
  left: 5,
  right: 5
};


export class BaseTreeScrubber {
  svg: SVGSVGElement;
  numTrees: number = UNSET;
  selectedTree: number;
  width: number;
  tickContainer: SVGGElement;

  constructor(selectCallback: SelectTreeCallback) {
    this.svg = chart;
    this.tickContainer = this.svg.querySelector("#poplar--scrubber-ticks") as SVGGElement;
    this.selectedTree = 0;
    this.svg.addEventListener('pointermove', (event:MouseEvent)=>{
      if (event.buttons === 1) {
        const x = event.offsetX;
        /* set this */
        const index = 0;
        selectCallback(index);
      }
    });
    // set initial size
    this.width = container.offsetWidth;
    const resizeObserver = new ResizeObserver(entries=>this.resize(entries));
    resizeObserver.observe(this.svg);
  }



  resize(entries: ResizeObserverEntry[]) {
    console.log(`resizing`, entries);
    const width = entries[0].borderBoxSize[0].inlineSize;
    this.svg.setAttribute("width", `${width}`);
    this.svg.setAttribute("viewBox", `0 0 ${width} ${SVG_HEIGHT}`);
    this.width = width;
    this.render();

  }

  setData(numTrees: number) {
    this.numTrees = numTrees;
    this.selectedTree = 0;
    this.render();
  }

  setSelectedTree(index: number) {
    this.selectedTree = index;
    this.render();
  }

  render() {
    this.tickContainer.innerHTML = '';
    const xSpan = this.width - PADDING.left - PADDING.right;

    for (let i = 0; i < this.numTrees; i++) {
      const line = tickTemplate.cloneNode(true) as SVGLineElement;
      const x = PADDING.left + i / (this.numTrees - 1) * xSpan;
      line.setAttribute('x1', `${x}`);
      line.setAttribute('x2', `${x}`);
      this.tickContainer.appendChild(line);
    }
  }


}