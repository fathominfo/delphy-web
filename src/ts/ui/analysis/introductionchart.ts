import { TransmissionChain } from "../../pythia/introductions";
import { Pythia } from "../../pythia/pythia";
import { getTipCounts } from "../../util/treeutils";
import { DateScale, getNiceDateInterval, MetadataColorOption, nfc, nicenum, UNDEF, UNSET } from "../common";
import { HoverCallback } from "../select/selectcommon";
import { ChainDetail } from "./chaindetail";
import { ChainSummary } from "./chainsummary";

const container = document.querySelector("#analysis--introductions-container") as HTMLDivElement;
const listItemTemplate = container.querySelector(".introduction-row") as HTMLDivElement;
const listContainer = listItemTemplate.parentNode as HTMLDivElement;
listItemTemplate.remove();

const tickTemplate = listItemTemplate.querySelector(".tick") as SVGLineElement;
tickTemplate.remove();

type ChainMetadata = {
  durations: number[],
  tipCounts: number[]
};


export class IntroductionChart {

  chains : { [metadataValue: string]: TransmissionChain[] } = {};
  mdColors: { [value: string]: MetadataColorOption } = {};
  // svg: SVGElement;
  // width: number;
  // height: number;
  // yScale: number = UNSET;
  minDate: number = UNSET;
  maxDate: number = UNSET;
  readout: HTMLParagraphElement;
  // highlight: SVGLineElement;
  // valueDot: SVGEllipseElement;
  maxDuration: number = UNSET;
  maxTipCount: number = UNSET;
  maxDurationLabel = '';
  chainMetadata: { [mdValue: string]: ChainMetadata } = {};
  // need a reference to pythia so we can recreate sub trees
  pythia: Pythia | null = null;
  tipCounts: number[] = [];



  constructor(hoverCallback: HoverCallback) {
    this.readout = container.querySelector(".alot-readout") as HTMLParagraphElement;
    // this.width = parseFloat(this.svg.getAttribute("width") as string);
    // this.height = parseFloat(this.svg.getAttribute("height") as string);
    // this.svg = container.querySelector("svg") as SVGElement;
    // this.highlight = this.svg.querySelector(".pointer") as SVGLineElement;
    // this.valueDot = this.svg.querySelector(".data-point") as SVGEllipseElement;
    // this.svg.addEventListener("pointermove", (event)=>{
    //   if (event === null) {
    //     hoverCallback(UNSET, NO_DATE, null);
    //   }
    //   const { maxDate, minDate, width } = this;
    //   const mouseTime = minDate + event.offsetX / width * (maxDate - minDate);
    //   hoverCallback(UNSET, mouseTime, null);
    // });
    // this.svg.addEventListener("pointerleave", () => hoverCallback(UNSET, NO_DATE, null));
  }

  setData(metadataValues: string[], colors: {[value: string]: MetadataColorOption},
    pythia: Pythia, minDate: number, maxDate: number
  ) : void {

    this.pythia = pythia;
    const mccRef = pythia.getMcc();
    this.tipCounts = getTipCounts(mccRef.getMcc());
    mccRef.release();
    const chains = pythia.getMCCTransmissionChains(metadataValues);
    const chainMetadata : { [mdValue: string]: ChainMetadata } = {};
    let maxDuration = 0;
    let maxTipCount = 0;
    Object.entries(chains).forEach(([value, chainList])=>{
      const durations: number[] = new Array(chainList.length);
      const tipCounts: number[] = new Array(chainList.length);
      chainList.forEach((chain, i)=>{
        durations[i] = chain.lastDate - chain.firstDate;
        tipCounts[i] = chain.tips.length;
        maxDuration = Math.max(maxDuration, durations[i]);
        maxTipCount = Math.max(maxTipCount, tipCounts[i]);
        // console.log(toDateString(chain.firstDate), toDateString(chain.lastDate), durations[i], chain);
      });
      chainMetadata[value] = {durations, tipCounts};
    });
    this.chains = chains;
    this.chainMetadata = chainMetadata;
    this.mdColors = colors;
    this.minDate = minDate;
    this.maxDate = maxDate;
    const dateScale = getNiceDateInterval(0, maxDuration).scale;
    let divisor = 1;
    let unit = 'day';
    switch (dateScale) {
    case DateScale.week:
      divisor = 7;
      unit = 'week';
      break;
    case DateScale.month:
      divisor = 365/12;
      unit = 'month';
      break;
    case DateScale.year:
      divisor = 365;
      unit = 'year';
      break;
    }
    const timeUnits = maxDuration / divisor;
    const unitMax = nicenum(timeUnits, false);
    this.maxDuration = unitMax * divisor;
    this.maxDurationLabel = `${nfc(unitMax)} ${unit}${unitMax === 1 ? '' : 's'}`;
    this.maxTipCount = nicenum(maxTipCount, false);

    // const maxY = Math.max.apply(null, this.alot.map(([_, __, score]) => score)); // eslint-disable-line @typescript-eslint/no-unused-vars
    // this.yScale = this.height / nicenum(maxY, false);
    requestAnimationFrame(()=>this.render());
  }

  render() : void {
    listContainer.querySelectorAll(".introduction-row").forEach(row=>row.remove());
    const {chains, chainMetadata, maxDuration, maxTipCount } = this;
    // const header = listContainer.querySelector(".introduction-header") as HTMLDivElement;
    // const durationMaxSpan = header.querySelector(".introduction-durations .row-max") as HTMLSpanElement;
    // const tipCountMaxSpan = header.querySelector(".introduction-tip-counts .row-max") as HTMLSpanElement;
    // durationMaxSpan.textContent = maxDurationLabel;
    // tipCountMaxSpan.textContent = `${nfc(maxTipCount)}`;

    /* sort by number of chains */
    const sortedRegions: string[] = Object.entries(chains)
      .sort((a, b)=>b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([mdValue]) => mdValue)
      .filter(value=>value !== UNDEF);

    sortedRegions.forEach((mdValue)=>{
      const chainList = chains[mdValue];
      const metadata = chainMetadata[mdValue];
      const {durations, tipCounts} = metadata;
      const row = listItemTemplate.cloneNode(true) as HTMLDivElement;
      const durationDistChart = row.querySelector(".introduction-durations") as SVGElement;
      const countsDistChart = row.querySelector(".introduction-tip-counts") as SVGElement;
      const margin = 5;
      const durationRange = parseFloat(durationDistChart.getAttribute("width") as string) - margin * 2;
      const tipCountRange = parseFloat(countsDistChart.getAttribute("width") as string) - margin * 2;
      (row.querySelector(".introduction-md-name") as HTMLSpanElement).textContent = mdValue;
      (row.querySelector(".introduction-count") as HTMLSpanElement).textContent = `${chainList.length}`;
      durations.forEach(n => {
        const x = margin + n / maxDuration * durationRange;
        const tick = tickTemplate.cloneNode(true) as SVGLineElement;
        tick.setAttribute("x1", `${x}`);
        tick.setAttribute("x2", `${x}`);
        durationDistChart.appendChild(tick);
      });
      tipCounts.forEach(n => {
        const x = margin + n / maxTipCount * tipCountRange;
        const tick = tickTemplate.cloneNode(true) as SVGLineElement;
        tick.setAttribute("x1", `${x}`);
        tick.setAttribute("x2", `${x}`);
        countsDistChart.appendChild(tick);
      });
      listContainer.appendChild(row);
      row.addEventListener("click", () => this.generateTrainSummary(chainList, row));
    });
  }


  generateTrainSummary(chainList: TransmissionChain[], callingRow: HTMLDivElement) {
    const { pythia, minDate, maxDate } = this;
    if (!pythia) return;
    const mccRef = pythia.getMcc();
    const mcc = mccRef.getMcc();
    chainList.sort((a, b)=>b.firstDate - a.firstDate);
    chainList.forEach(chain=>{
      const summary = new ChainSummary(chain, minDate, maxDate, mcc, callingRow);
      if (chain.nodes.length > 1) {
        summary.svg.addEventListener("click", ()=>{
          new ChainDetail(chain, minDate, maxDate, pythia, this.tipCounts, summary.svg);
        });
      }
    });
    mccRef.release();
  }


}