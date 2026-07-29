import { LineageMetadataOverTime } from "../../pythia/introductions";
import { Pythia } from "../../pythia/pythia";
import { MetadataColorOption, nicenum, NO_DATE, UNSET } from "../common";
import { HoverCallback } from "../select/selectcommon";

const alotContainer = document.querySelector("#analysis--alot-md-container") as HTMLDivElement;
const mdPathTemplate = alotContainer.querySelector("path") as SVGPathElement;
mdPathTemplate.remove();

type Entry = {time: number, belowCount: number, count: number };

export class ActiveMetadataLineagesChart {

  /*
  the key for this dictionary will be the metadata value
  */
  alotMD: LineageMetadataOverTime = {metadataOrder: [], overTime: []};
  svg: SVGElement;
  width: number;
  height: number;
  yScale: number = UNSET;
  minDate: number = UNSET;
  maxDate: number = UNSET;
  readout: HTMLParagraphElement;
  highlight: SVGLineElement;
  valueDot: SVGEllipseElement;
  mdChartData: { [metadataValue: string] : Entry[]} = {};
  mdColors: {[value: string]: MetadataColorOption} = {};



  constructor(hoverCallback: HoverCallback) {
    this.svg = alotContainer.querySelector("svg") as SVGElement;
    this.width = parseFloat(this.svg.getAttribute("width") as string);
    this.height = parseFloat(this.svg.getAttribute("height") as string);
    this.readout = alotContainer.querySelector(".alot-readout") as HTMLParagraphElement;
    this.highlight = this.svg.querySelector(".pointer") as SVGLineElement;
    this.valueDot = this.svg.querySelector(".data-point") as SVGEllipseElement;
    this.svg.addEventListener("pointermove", (event)=>{
      if (event === null) {
        hoverCallback(UNSET, NO_DATE, null);
      }
      const { maxDate, minDate, width } = this;
      const mouseTime = minDate + event.offsetX / width * (maxDate - minDate);
      hoverCallback(UNSET, mouseTime, null);
    });
    this.svg.addEventListener("pointerleave", () => hoverCallback(UNSET, NO_DATE, null));
  }

  setData(metadataValues: string[], colors: {[value: string]: MetadataColorOption},
    pythia: Pythia, minDate: number, maxDate: number
  ) : void {
    this.alotMD = pythia.getMCCActiveMetadataLineagesOverTime(metadataValues);
    this.mdColors = colors;
    this.minDate = minDate;
    this.maxDate = maxDate;
    /* convert the data into stacked positioning we can use for the chart */
    const {metadataOrder, overTime} = this.alotMD;
    const mdChartData: { [metadataValue: string]: Entry[] } = {}; // {time: number, belowCount: number, count: number };
    metadataOrder.forEach(md=>mdChartData[md] = []);
    let maxCount = 0;
    overTime.forEach(([time, count, counts, running]) => { // eslint-disable-line @typescript-eslint/no-unused-vars
      if (count > maxCount) maxCount = count;
      metadataOrder.forEach((value, i)=>{
        const count = counts[i];
        const belowCount = running[i];
        const mdEntries = mdChartData[value];
        const lastIndex = mdEntries.length - 1;
        if (count > 0 || lastIndex < 0 || mdEntries[lastIndex].count > 0) {
          mdEntries.push({time, count, belowCount});
        }
      });
    });
    this.yScale = this.height / nicenum(maxCount, false);
    this.mdChartData = mdChartData;
    requestAnimationFrame(()=>this.render());
  }

  render() : void {
    const { svg, mdChartData, height } = this;
    svg.querySelectorAll("path").forEach((path: SVGPathElement)=>{path.remove()});
    const { metadataOrder} = this.alotMD;
    metadataOrder.forEach(mdValue=>{
      const entries = mdChartData[mdValue];
      this.renderMetadataTrend(mdValue, entries);
    })
    this.highlight.setAttribute("y1", `${0}`);
    this.highlight.setAttribute("y2", `${height}`);
  }

  renderMetadataTrend(mdValue: string, entries: Entry[]) : void {
    const { svg, maxDate, minDate, width, height, yScale } = this;
    const timeRange = maxDate - minDate;
    const xScale = width / timeRange;
    const path = mdPathTemplate.cloneNode(true) as SVGPathElement;
    const color = this.mdColors[mdValue].color;
    path.setAttribute("fill", color);
    let d = '';
    let x: number = UNSET;
    let y: number = UNSET;
    let newY: number = UNSET;
    let drawing = false;
    let startPoint = UNSET;
    const xFor = (t:number) => (t - minDate) * xScale;
    const yFor = (count: number) => height - count * yScale;
    entries.forEach( ({time, belowCount, count}, i) => {
      x = xFor(time);
      if (count === 0) {
        if (drawing) {
          /*
          we need to draw the upper part of the shape.
          */
          d += `${x} ${y} `;
          for (let j = i - 1; j >= startPoint; j--) {
            const { time, belowCount, count } = entries[j];
            y = yFor(count + belowCount);
            d += `${x} ${y} `;
            x = xFor(time);
            d += `${x} ${y} `;
          }
          /* close the shape */
          y = yFor(belowCount);
          d += `${x} ${y} `;
        }
      } else {
        newY = yFor(belowCount);
        if (!drawing) {
          startPoint = i;
          drawing = true;
          d += `M${x} ${newY} L`;
        } else {
          d += `${x} ${y} ${x} ${newY} `;
        }
        y = newY;
      }
    });
    path.setAttribute("d", d);
    svg.appendChild(path);

  }



  highlightDate(highlightTime: number) : void {
    const { readout, valueDot, highlight, maxDate, minDate, width } = this;
    if (highlightTime === NO_DATE) {
      readout.textContent = '';
      highlight.setAttribute("x1", `-${width}`);
      highlight.setAttribute("x2", `-${width}`);
      valueDot.setAttribute("cx", `-${width}`);
      return;
    } else {
      const x = (highlightTime - minDate) / (maxDate - minDate) * width;
      highlight.setAttribute("x1", `${x}`);
      highlight.setAttribute("x2", `${x}`);
    }

  }
}