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
  selectedTree: number = UNSET;
  width: number;
  xSpan: number = UNSET;
  tickContainer: SVGGElement;

  constructor(selectCallback: SelectTreeCallback) {
    this.svg = chart;
    this.tickContainer = this.svg.querySelector("#poplar--scrubber-ticks") as SVGGElement;
    const handleMouseEvent = (event: MouseEvent) => {
      const x = event.offsetX - PADDING.left;
      const bins = this.numTrees - 1;
      const index = Math.max(0, Math.min(bins, Math.round(x / this.xSpan * bins)));
      if (index !== this.selectedTree) {
        selectCallback(index);
      }
    };
    this.svg.addEventListener('click', (event: MouseEvent) => {
      handleMouseEvent(event);
    });
    this.svg.addEventListener('pointermove', (event: MouseEvent) => {
      if (event.buttons === 1) {
        handleMouseEvent(event);
      }
    });
    // set initial size
    this.width = container.offsetWidth;
    const resizeObserver = new ResizeObserver(entries=>this.resize(entries));
    resizeObserver.observe(this.svg);
    this.setSelectedTree(0);
  }



  resize(entries: ResizeObserverEntry[]) {
    // console.log(`resizing`, entries);
    const width = entries[0].borderBoxSize[0].inlineSize;
    this.svg.setAttribute("width", `${width}`);
    this.svg.setAttribute("viewBox", `0 0 ${width} ${SVG_HEIGHT}`);
    this.width = width;
    this.xSpan = width - PADDING.left - PADDING.right;
    this.render();

  }

  setData(numTrees: number) {
    this.numTrees = numTrees;
    this.selectedTree = 0;
    this.render();
  }

  setSelectedTree(index: number) {
    if (index !== this.selectedTree) {
      const ticks = this.tickContainer.querySelectorAll(".tick");
      ticks.forEach((tick, i)=>tick.classList.toggle("selected-tick", index === i));
      this.selectedTree = index;
    }
  }

  render() {
    if (this.xSpan === UNSET || this.numTrees === UNSET) return;
    this.tickContainer.innerHTML = '';
    for (let i = 0; i < this.numTrees; i++) {
      const line = tickTemplate.cloneNode(true) as SVGLineElement;
      const x = PADDING.left + i / (this.numTrees - 1) * this.xSpan;
      line.setAttribute('x1', `${x}`);
      line.setAttribute('x2', `${x}`);
      line.classList.toggle("selected-tick", i === this.selectedTree);
      this.tickContainer.appendChild(line);
    }
  }


}