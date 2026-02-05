import { UNSET } from '../common';
import { TraceData } from './tracedata';

const maybeChartContainer = document.querySelector('#runner--panel--modules');
if (!maybeChartContainer) {
  throw new Error("index.html doesn't have the container for the charts!");
}

export const chartContainer = <HTMLDivElement> maybeChartContainer;




export class TraceCanvas {


  traceData: TraceData;
  svg: SVGElement;
  container: HTMLDivElement;
  className: string;


  height: number;
  width: number;
  hovering: boolean;

  isVisible: boolean;



  constructor(label:string, unit='', template: HTMLDivElement) {
    this.traceData = new TraceData(label, unit);
    this.container = template.cloneNode(true) as HTMLDivElement;
    this.className = label.toLowerCase().replace(/ /g, '-').replace(/[()]/g, '');
    this.container.classList.add(this.className);
    chartContainer.appendChild(this.container);
    const header = this.container.querySelector('h3.title') as HTMLHeadingElement;
    header.textContent = label;
    this.svg = this.container.querySelector(".graph svg") as SVGElement;
    this.height = UNSET;
    this.width = UNSET;
    this.hovering = false;
    this.isVisible = true;
  }

  sizeCanvas() {
    // hack to get the right height in the flex container:
    // set width and height to zero, then recalculate
    const wrapper = this.svg.parentElement as HTMLDivElement;
    this.width = wrapper.offsetWidth;
    this.height = wrapper.offsetHeight;
    requestAnimationFrame(()=>this.setSizes());
  }

  protected setSizes() {
    this.svg.setAttribute("width", `${this.width}`);
    this.svg.setAttribute("height", `${this.height}`);
    this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
  }

  setVisible(showIt: boolean) {
    this.isVisible = showIt;
    this.container.classList.toggle("hidden", !showIt);
  }

  getLI(selector: string): HTMLLIElement {
    const mabel = this.container.querySelector(selector);
    if (!mabel) {
      throw new Error(`This chart container does not have an element with the class "${selector}".`);
    }
    return <HTMLLIElement>mabel;
  }

  setKneeIndex(count: number, kneeIndex:number) {
    this.traceData.setKneeIndex(count, kneeIndex);
  }


  handleTreeHighlight(treeIndex: number): void {
    this.traceData.handleTreeHighlight(treeIndex);
  }

  /* eslint-disable @typescript-eslint/no-empty-function */
  draw() {}
  /* eslint-enable @typescript-eslint/no-empty-function */


}

