import { toDateString } from "../../pythia/dates";
import { LineageEntry, Pythia } from "../../pythia/pythia";
import { nicenum, NO_DATE, UNDEF, UNSET } from "../common";
import { HoverCallback } from "../select/selectcommon";

const alotContainer = document.querySelector("#analysis--alot-container") as HTMLDivElement;

export class ActiveLineagesChart {

  alot: LineageEntry[] = [];
  svg: SVGElement;
  width: number;
  height: number;
  yScale: number = UNSET;
  minDate: number = UNSET;
  maxDate: number = UNSET;
  readout: HTMLParagraphElement;
  highlight: SVGLineElement;
  valueDot: SVGEllipseElement;


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
    this.svg.addEventListener("pointerleave", (event) => hoverCallback(UNSET, NO_DATE, null));
  }

  setData(pythia: Pythia, minDate: number, maxDate: number) : void {
    this.alot = pythia.getMCCActiveLineagesOverTime();
    this.minDate = minDate;
    this.maxDate = maxDate;
    const maxY = Math.max.apply(null, this.alot.map(([_, __, score]) => score));
    this.yScale = this.height / nicenum(maxY, false);
    requestAnimationFrame(()=>this.render());
  }

  render() : void {
    const { svg, alot, maxDate, minDate, width, height} = this;
    const path = svg.querySelector("path") as SVGPathElement;
    const timeRange = maxDate - minDate;
    const xScale = width / timeRange;
    let d = '';
    let x: number = UNSET;
    let y: number = UNSET;
    // console.log(toDateString(minDate), minDate, 0);
    alot.forEach(([time, count, score], i) => {
      if (count === 0) return;
      x = (time - minDate) * xScale;
      if (y !== UNSET) {
        d += `${ x } ${y} `
      }
      y = height - score * this.yScale;
      if (d === '') {
        d = `M${x} ${y} L`;
      } else {
        d += `${x} ${y} `;
      }
      // console.log(i, toDateString(time), time, count, score, x, y);
    });
    // console.log(toDateString(maxDate), maxDate, width);
    // d += `${x} ${this.height} `;
    path.setAttribute("d", d);
    // console.log(alot);
    this.highlight.setAttribute("y1", `${0}`);
    this.highlight.setAttribute("y2", `${height}`);
  }



  highlightDate(highlightTime: number) : void {
    const { alot, readout, valueDot, highlight, maxDate, minDate,
      width, height, yScale } = this;
    if (highlightTime === NO_DATE) {
      readout.textContent = '';
      highlight.setAttribute("x1", `-${width}`);
      highlight.setAttribute("x2", `-${width}`);
      return;
    }
    let closestIndex = UNSET;
    let closestDistance = Number.MAX_VALUE;
    alot.forEach(([time], i) => {
      const d = Math.abs(time - highlightTime);
      if (d < closestDistance) {
        closestDistance = d;
        closestIndex = i;
      }
    });
    const closest = alot[closestIndex];
    if (closest) {
      const [time, count, score] = closest;
      const x = (highlightTime - minDate) / (maxDate - minDate) * width;
      const valueX = (time - minDate) / (maxDate - minDate) * width;
      const valueY = height - score * yScale;
      // if (highlightTime !== time) {
      //   if (highlightTime < time) {
      //     if (closestIndex > 0) {
      //       const [otherTime, otherCount, otherScore] = alot[closestIndex - 1];
      //     }
      //   }
      // }
      // readout.textContent = `${toDateString(mouseTime)} -> ${toDateString(time)}: ${count} lineages, ${score} cases`;
      readout.textContent = `${toDateString(highlightTime)} -> ${toDateString(time)}: ${count} lineage${count === 1 ? '' : 's'} score ${score.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
      // const x = (time - minDate) / (maxDate - minDate) * width;
      highlight.setAttribute("x1", `${x}`);
      highlight.setAttribute("x2", `${x}`);
      valueDot.setAttribute("cx", `${valueX}`);
      valueDot.setAttribute("cy", `${valueY}`);
    } else {
      readout.textContent = '';
      highlight.setAttribute("x1", `-${width}`);
      highlight.setAttribute("x2", `-${width}`);
      valueDot.setAttribute("cx", `-${width}`);
    }

  }
}