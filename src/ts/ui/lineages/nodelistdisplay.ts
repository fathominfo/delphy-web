import { BaseTreeSeriesType, NodeDistributionType } from '../../constants';
import { DisplayNode, UNSET, numericSortReverse, resizeCanvas, getNtile, getPercentLabel, CHART_TEXT_SIZE } from '../common';
import { NodeMetadataValues } from '../nodemetadata';
import { DismissCallback, NodeCallback, NodeDisplay } from './lineagescommon';

const METADATA_ITEM_TEMPLATE = document.querySelector(".node-metadata-item") as HTMLElement;
METADATA_ITEM_TEMPLATE.remove();

const REPORTING_NTILES = [0.025, 0.5, 0.975];

const DEBUG = false;

const TAU = Math.PI * 2;

const TARGET = 200;
const TOO_MANY = TARGET * 2;


class NodeItem {
  div: HTMLDivElement;
  countSpan: HTMLSpanElement;
  confidenceSpan: HTMLSpanElement;
  nodeStats: HTMLElement;
  nodeIsTip: HTMLElement;
  tipIdSpan: HTMLElement;
  mdDiv: HTMLDivElement;
  minDate: number;
  maxDate: number;
  dailyDistribution: number[][];
  nTiles: number[][];
  dayCount: number;
  rgb: string;

  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  hoverDate: number;

  constructor(div: HTMLDivElement) {
    this.div = div;
    this.countSpan = div.querySelector('.node--tip-count') as HTMLSpanElement;
    this.confidenceSpan = div.querySelector('.node--confidence') as HTMLSpanElement;
    this.nodeStats = div.querySelector(".node-stats") as HTMLElement;
    this.nodeIsTip = div.querySelector(".tip-info") as HTMLElement;
    this.tipIdSpan = div.querySelector(".tip-id") as HTMLElement;
    this.mdDiv = div.querySelector(".node-metadata") as HTMLDivElement;
    this.minDate = UNSET;
    this.maxDate = UNSET;
    this.dailyDistribution = [];
    this.nTiles = [];
    this.dayCount = UNSET;
    this.canvas = div.querySelector("canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.rgb = '';
    const {width, height} = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
    this.canvas.addEventListener('pointermove', event=>this.handlePointerMove(event));
    this.canvas.addEventListener('pointerleave', ()=>this.handlePointerLeave());
    this.hoverDate = UNSET;
  }


  setData(nodeConfidence: number, nodeChildCount: number, locked: boolean,
    nodeMetadata: NodeMetadataValues | undefined, nodeIndex: number = UNSET) : void {

    const {div, countSpan,
      confidenceSpan,
      nodeStats,
      nodeIsTip,
      tipIdSpan, mdDiv} = this;

    const isTip = nodeChildCount === 1;
    div.classList.toggle("is-tip", isTip);

    if (!isTip) {
      nodeStats.classList.remove("hidden");
      nodeIsTip.classList.add("hidden");
      countSpan.innerText = `${nodeChildCount} tip${nodeChildCount === 1 ? '' : 's'}`;
      if (confidenceSpan) {
        confidenceSpan.innerText = `${getPercentLabel(nodeConfidence)}%`;
      }
    } else {
      nodeStats.classList.add("hidden");
      nodeIsTip.classList.remove("hidden");
      if (DEBUG) {
        tipIdSpan.innerText = `${nodeIndex} `;
      }
      if (nodeMetadata !== undefined) {
        if (nodeMetadata.id !== undefined) {
          tipIdSpan.innerText = `${nodeMetadata.id.value}`;
          tipIdSpan.title = nodeMetadata.id.value;
        } else if (nodeMetadata.accession !== undefined) {
          tipIdSpan.innerText = `${nodeMetadata.accession.value}`;
          tipIdSpan.title = nodeMetadata.accession.value;
        }
      }
    }

    div.classList.add('active');
    div.classList.toggle('locked', locked);

    if (nodeMetadata === undefined || (Object.keys(nodeMetadata).length === 1 && nodeMetadata.id !== undefined)) {
      mdDiv.classList.add('hidden');
    } else {
      mdDiv.classList.remove('hidden');

      mdDiv.querySelectorAll(".node-metadata-item").forEach(div=>div.remove());
      Object.entries(nodeMetadata).forEach(([key, value])=>{
        if (key.toLowerCase() !== 'id' && key.toLowerCase() !== 'accession'){
          const item = METADATA_ITEM_TEMPLATE.cloneNode(true) as HTMLElement;
          mdDiv.appendChild(item);

          const summary = item.querySelector(".pair--key-value") as HTMLElement;
          (summary.querySelector(".key") as HTMLElement).innerText = key;
          (summary.querySelector(".value") as HTMLElement).innerText = replaceUnknown(value.value);

          const valueCountPair = item.querySelector(".pair--value-count") as HTMLElement;
          item.querySelectorAll(".pair--value-count").forEach(el => el.remove());

          if (!isTip) {
            const tipCounts = item.querySelector(".tip-counts") as HTMLElement;
            Object.entries(value.counts).forEach(([val, count])=>{
              const pair = valueCountPair.cloneNode(true) as HTMLElement;
              tipCounts.appendChild(pair);
              if (val === value.value) {
                pair.classList.add("current");
              }
              (pair.querySelector(".value") as HTMLElement).innerText = replaceUnknown(val);
              (pair.querySelector(".count") as HTMLElement).innerText = `${count}`;
            });
          } else {
            const details = item.querySelector("details") as HTMLDetailsElement;
            details.classList.add("disabled");
          }
        }
      });
    }
  }

  setPrevalenceData(index: number, nodeDist: BaseTreeSeriesType, minDate: number, maxDate: number, color: string) {
    // const t1 = Date.now();
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.rgb = color;
    const treeCount = nodeDist.length;
    // const seriesCount = nodeDist[0].length;
    const rawDayCount = nodeDist[0][0].length;
    const rebinning = rawDayCount > TOO_MANY;
    const dayCount = rebinning ? TARGET : rawDayCount;

    this.nTiles = REPORTING_NTILES.map(()=>Array(dayCount).fill(0));
    this.dailyDistribution = Array(dayCount);

    for (let d = 0; d < dayCount; d++) {
      const dd = rebinning ? Math.round(d / (dayCount - 1) * (rawDayCount -1)) : d;
      const dist: number[] = Array(treeCount);
      for (let t = 0; t < treeCount; t++) {
        dist[t] = nodeDist[t][index][dd];
      }
      dist.sort(numericSortReverse);
      REPORTING_NTILES.forEach((ntile, i)=>{
        this.nTiles[i][d] = getNtile(dist, ntile);
      });
      this.dailyDistribution[d] = dist;
    }
    this.dayCount = dayCount;
    // console.debug(`             nodeListDisplay.NodeItem.setPrevalenceData ${index}    ${dayCount}            ${(Date.now()-t1)/1000}ms`);
    requestAnimationFrame(()=>this.draw());
  }


  setDateRange(minDate: number, maxDate: number) : void {
    this.minDate = minDate;
    this.maxDate = maxDate;
  }


  draw() {
    const {ctx, width, height, nTiles, dayCount, rgb} = this,
      [lo, median, hi] = nTiles;
    if (lo) {
      ctx.fillStyle = 'rgb(250,250,250)'
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = rgb;
      ctx.beginPath();
      let x = 0,
        y = (1 - lo[0]) * height;
      ctx.moveTo(x, y);
      for (let i = 1; i < dayCount; i++) {
        x = i / (dayCount-1) * width;
        y = (1 - lo[i]) * height;
        ctx.lineTo(x, y);
      }
      for (let i = dayCount -1; i >= 0; i--) {
        x = i / (dayCount-1) * width;
        y = (1 - hi[i]) * height;
        ctx.lineTo(x, y);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rgb;
      ctx.lineWidth = 2;
      let drawing = false;
      ctx.beginPath();
      for (let i = 0; i < dayCount; i++) {
        if (drawing || median[i] > 0) {
          x = i / (dayCount-1) * width;
          y = (1 - median[i]) * height;
          if (!drawing) {
            ctx.moveTo(x, height);
            drawing = true;
          }
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      if (this.hoverDate !== UNSET) {
        x = this.hoverDate / dayCount * width;
        const dayData = this.nTiles.map(series=>series[this.hoverDate]),
          ys = dayData.map(n=>(1 - n) * height),
          labels = dayData.map(n=>`${getPercentLabel(n)}%`);
        ctx.strokeStyle = 'black';
        ctx.fillStyle = 'black';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, ys[0]);
        ctx.lineTo(x, ys[2]);
        ctx.stroke();
        ctx.beginPath();
        ys.forEach(y=>{
          ctx.moveTo(x, y+2);
          ctx.arc(x, y, 2, 0, TAU);
        });
        ctx.fill();
        ctx.textBaseline = 'alphabetic';
        /*
        space the label text. make sure the top and bottom are in the canvas,
        and that the center one doesn't overlap them.
        after that, if either the top or the bottom overlaps the center, move them out.
        */
        const labelX = x > width - 60 ? x - 25 : x + 5,
          LINE_SPACING = CHART_TEXT_SIZE * 1.25,
          BOTTOM = height - 3;
        ys[0] = Math.max(ys[0], CHART_TEXT_SIZE);
        ys[1] = Math.min(BOTTOM - LINE_SPACING, Math.max(CHART_TEXT_SIZE + LINE_SPACING, ys[1]));
        ys[2] = Math.min(ys[2], BOTTOM);
        if (ys[0] > ys[1]-LINE_SPACING) {
          ys[0] = ys[1] - LINE_SPACING;
        }
        if (ys[2] < ys[1]+LINE_SPACING) {
          ys[2] = ys[1] + LINE_SPACING;
        }
        labels.forEach((label:string, i: number)=>{
          ctx.fillText(label, labelX, ys[i]);
        });

      }
    }
  }


  handlePointerMove(event: PointerEvent) {
    const x = event.offsetX,
      dateIndex = Math.round(x / this.width * this.dayCount);
    if (dateIndex !== this.hoverDate) {
      this.hoverDate = dateIndex;
      requestAnimationFrame(()=>this.draw());
    }
  }

  handlePointerLeave() {
    if (this.hoverDate !== UNSET) {
      this.hoverDate = UNSET;
      requestAnimationFrame(()=>this.draw());
    }
  }



  clear() {
    this.div.classList.remove('active');
    this.div.classList.remove('locked');
  }

  pushback() {
    this.div.classList.add('lowlight');
  }

  restore() {
    this.div.classList.remove('lowlight');
  }

}



export class NodeListDisplay {
  private container: HTMLElement;
  private rootDiv: NodeItem;
  private mrcaDiv: NodeItem;
  private node1Div: NodeItem;
  private node2Div: NodeItem;
  private dismissCallback: DismissCallback;
  private nodeHighlightCallback: NodeCallback;
  private nodeZoomCallback: NodeCallback;

  constructor(dismissCallback: DismissCallback, nodeHighlightCallback: NodeCallback, nodeZoomCallback: NodeCallback) {
    this.container = document.querySelector("#lineages--node-list") as HTMLElement;

    const getDiv = (selector: string)=>{
      const div = document.querySelector(selector) as HTMLDivElement;
      if (!div) {
        throw new Error(`could not find display div for "${selector}"`);
      }
      return div;
    };
    this.rootDiv = new NodeItem(getDiv('.lineages--node-item.root'));
    this.mrcaDiv = new NodeItem(getDiv('.lineages--node-item.mrca'));
    this.node1Div = new NodeItem(getDiv('.lineages--node-item.node1'));
    this.node2Div = new NodeItem(getDiv('.lineages--node-item.node2'));
    this.dismissCallback = dismissCallback;
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.nodeZoomCallback = nodeZoomCallback;

    const bindDismiss = (div: HTMLDivElement, node: DisplayNode)=>{
      const dismiss = div.querySelector(".node-dismiss") as HTMLButtonElement;
      if (!dismiss) {
        throw new Error('the div has nothing for dismissing');
      }
      dismiss.addEventListener('click', ()=>this.dismissCallback(node));
    }
    const bindDiv = (div: HTMLDivElement, node: DisplayNode) => {
      div.addEventListener('pointerenter', () => nodeHighlightCallback(node));
      div.addEventListener('pointerleave', () => nodeHighlightCallback(UNSET));
    }
    // const bindIcon = (div: HTMLDivElement, node: DisplayNode)=>{
    //   const icon = div.querySelector(".node-icon") as HTMLDivElement;
    //   if (!icon) {
    //     throw new Error('the div has no icon to click');
    //   }
    //   icon.addEventListener('click', ()=>this.nodeZoomCallback(node));
    // }
    bindDismiss(this.node1Div.div, DisplayNode.node1);
    bindDismiss(this.node2Div.div, DisplayNode.node2);
    // bindIcon(this.rootDiv.div, DisplayNode.root);
    // bindIcon(this.mrcaDiv.div, DisplayNode.mrca);
    // bindIcon(this.node1Div.div, DisplayNode.node1);
    // bindIcon(this.node2Div.div, DisplayNode.node2);
    bindDiv(this.rootDiv.div, DisplayNode.root);
    bindDiv(this.mrcaDiv.div, DisplayNode.mrca);
    bindDiv(this.node1Div.div, DisplayNode.node1);
    bindDiv(this.node2Div.div, DisplayNode.node2);
    (document.querySelector("#lineages--node-list") as HTMLDivElement).addEventListener('pointerleave', ()=>this.nodeHighlightCallback(UNSET));

  }


  setPrevalenceData(nodeDist: NodeDistributionType, nodes: NodeDisplay[], minDate: number, maxDate: number) {
    const series: BaseTreeSeriesType = nodeDist.series;
    for (let i = 0; i < nodes.length; i++) {
      switch( nodes[i].type) {
      case DisplayNode.root: this.rootDiv.setPrevalenceData(i, series, minDate, maxDate, nodes[i].color); break;
      case DisplayNode.mrca: this.mrcaDiv.setPrevalenceData(i, series, minDate, maxDate, nodes[i].color); break;
      case DisplayNode.node1: this.node1Div.setPrevalenceData(i, series, minDate, maxDate, nodes[i].color); break;
      case DisplayNode.node2: this.node2Div.setPrevalenceData(i, series, minDate, maxDate, nodes[i].color); break;
      }
    }
  }

  setRoot(nodeConfidence: number, nodeChildCount: number, nodeMetadata: NodeMetadataValues | undefined, nodeIndex: number) : void {
    this.rootDiv.setData(nodeConfidence, nodeChildCount, false, nodeMetadata, nodeIndex);
  }

  setMRCA(nodeConfidence: number, nodeChildCount: number, locked = false, nodeMetadata: NodeMetadataValues | undefined, nodeIndex: number) : void {
    this.mrcaDiv.setData(nodeConfidence, nodeChildCount, locked, nodeMetadata, nodeIndex);
    this.container.scrollTo({ top: this.container.scrollHeight, behavior: "smooth" });
  }

  setNode1(nodeConfidence: number, nodeChildCount: number, locked = false, nodeMetadata: NodeMetadataValues | undefined, nodeIndex: number) : void {
    this.node1Div.setData(nodeConfidence, nodeChildCount, locked, nodeMetadata, nodeIndex);
    this.container.scrollTo({ top: this.container.scrollHeight, behavior: "smooth" });
  }

  setNode2(nodeConfidence: number, nodeChildCount: number, locked = false, nodeMetadata: NodeMetadataValues | undefined, nodeIndex: number) : void {
    this.node2Div.setData(nodeConfidence, nodeChildCount, locked, nodeMetadata, nodeIndex);
    this.container.scrollTo({ top: this.container.scrollHeight, behavior: "smooth" });
  }

  clearMRCA(): void {
    this.mrcaDiv.clear();
  }

  clearNode1(): void {
    this.node1Div.clear();
  }

  clearNode2(): void {
    this.node2Div.clear();
  }

  highlightNode(node: DisplayNode | typeof UNSET) : void {
    if (node === UNSET) {
      this.rootDiv.restore();
      this.mrcaDiv.restore();
      this.node1Div.restore();
      this.node2Div.restore();
    } else {
      this.rootDiv.pushback();
      this.mrcaDiv.pushback();
      this.node1Div.pushback();
      this.node2Div.pushback();
      switch (node) {
      case DisplayNode.root: this.rootDiv.restore(); break;
      case DisplayNode.mrca: this.mrcaDiv.restore(); break;
      case DisplayNode.node1: this.node1Div.restore(); break;
      case DisplayNode.node2: this.node2Div.restore(); break;
      }

    }
  }

  requestDraw(): void {
    requestAnimationFrame(()=>{
      this.rootDiv.draw();
      this.mrcaDiv.draw();
      this.node1Div.draw();
      this.node2Div.draw();
    });
  }

}

const replaceUnknown = (val: string)=>val === '-' ? 'Unknown' : val;
