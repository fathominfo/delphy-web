import { Tree } from "../../pythia/delphy_api";
import { TransmissionChain } from "../../pythia/introductions";
import { UNSET } from "../common";


const container = document.querySelector("#analysis--introductions-container") as HTMLDivElement;
const summaryTemplate = container.querySelector(".introduction-summary") as SVGElement;
const summaryMarkerTemplate = summaryTemplate.querySelector(".node") as SVGCircleElement;
summaryTemplate.remove();
summaryMarkerTemplate.remove();


type NodeData = {
  time: number,
  isTip: boolean
};


export class ChainSummary {
  chain: TransmissionChain;
  minDate: number;
  maxDate: number;
  svg: SVGElement;
  width: number = UNSET;
  nodes: NodeData[];

  constructor(chain: TransmissionChain, minDate: number, maxDate: number, mcc: Tree, callingRow: HTMLDivElement ) {
    this.chain = chain;
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.svg = summaryTemplate.cloneNode(true) as SVGElement;
    this.width = parseFloat(this.svg.getAttribute("width") as string);
    this.nodes = chain.nodes.map(n=>{
      return {
        time: mcc.getTimeOf(n),
        isTip: chain.tips.includes(n)
      };
    });
    requestAnimationFrame(() => this.render(callingRow));
  }


  render(callingRow: HTMLDivElement) : void {
    const { svg, chain, minDate, maxDate, width, nodes } = this;
    const { firstDate, lastDate, from } = chain;
    // const nodeCount = nodes.length;
    const line = svg.querySelector("line") as SVGLineElement;
    const text = svg.querySelector("text") as SVGTextElement;
    /* the x1 attribute is set to align with the timebased charts above */
    const left = parseFloat(line.getAttribute("x1") as string);
    const range = width - left;
    const x1 = left + (firstDate - minDate) / (maxDate - minDate) * range;
    const x2 = left + (lastDate - minDate) / (maxDate - minDate) * range;
    line.setAttribute("x1", `${x1}`);
    line.setAttribute("x2", `${x2}`);
    nodes.forEach(nodeData=>{
      const { time, isTip } = nodeData;
      const x = left + (time - minDate) / (maxDate - minDate) * range;
      const circle = summaryMarkerTemplate.cloneNode(true) as SVGCircleElement;
      circle.setAttribute("cx", `${x}`);
      if (isTip) {
        circle.classList.add("tip");
      }
      svg.appendChild(circle);
    });
    // text.textContent = `${from}->, ${nfc(nodeCount)} node${nodeCount === 1 ? '' : 's'}`;
    text.innerHTML = `<tspan dx="-10" dy="0">from</tspan>  ${from}`;
    const nodeAfter = callingRow.nextSibling;
    if (!nodeAfter) {
      (callingRow.parentNode as HTMLDivElement).appendChild(svg);
    } else {
      (callingRow.parentNode as HTMLDivElement).insertBefore(svg, nodeAfter);
    }

  }

}