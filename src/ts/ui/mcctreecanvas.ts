import { DateLabel } from './datelabel';
import {
  UNSTYLED_CANVAS_WIDTH,
  BRANCH_WEIGHT, BRANCH_WEIGHT_MIN, BRANCH_WEIGHT_MAX,
  TREE_PADDING_TOP,
  TREE_PADDING_BOTTOM, TREE_PADDING_LEFT, TREE_PADDING_RIGHT,
  TREE_TEXT_FONT,
  resizeCanvas,
  UNSET,
  getNiceDateInterval,
  DateScale,
  DATE_TEMPLATE,
  getCSSValue,
  setDateLabel,
  DATE_LABEL_WIDTH_PX,
  AxisLabel} from './common';
import { getTipCounts } from '../util/treeutils';
import { PdfCanvas } from '../util/pdfcanvas';
import { Context2d } from "jspdf";


import { Tree } from '../pythia/delphy_api';
import { ColorOption, DEFAULT_NODE_CONFIDENCE } from './common';
import { MccConfig } from "./mccconfig";
import { isTip } from '../util/treeutils';


// const PDF_TYPEFACE = 'Roboto',
//   PDF_700_WT = '700',
//   PDF_500_WT = '500';

const HOVER_DISTANCE = 30;


class TipInfo {
  index: number;
  y: number;

  constructor(i:number, y:number) {
    this.index = i;
    this.y = y;
  }
}


type OptionCount = {[name: string]: number};

const FADE_OPACITY = 0.3;


class CustomSubTree {
  minDate: number;
  maxDate: number;
  verticallySortedTips: number[];
  nodeYs: number[];
  size: number;

  constructor(minDate: number, maxDate: number, verticallySortedTips: number[], nodeYs: number[], size: number) {
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.verticallySortedTips = verticallySortedTips;
    this.nodeYs = nodeYs;
    this.size = size;
  }



}

export class MccTreeCanvas {
  canvas: HTMLCanvasElement | PdfCanvas;
  ctx: CanvasRenderingContext2D | Context2d;
  dateAxis: HTMLDivElement;
  height: number;
  width: number;
  /*
  by default, we draw the entire tree.
  however, the user can select a root index to draw from.
  */
  rootIndex: number;
  // protected nodeYs: number[];
  nodeTimes: number[];
  nodeChildren: number[][];
  nodeParents: number[];
  tipCount: number;
  /* how many tips for the node at this index */
  tipCounts: number[];
  branchWeights: number[];
  // minDate: number;
  // maxDate: number;
  tree: Tree | null;
  creds: number[];
  paddingTop : number;
  paddingBottom: number;
  /* we don't want this to be less than 1, but typescript can't enforce that for us */
  verticalZoom: number;
  zoomCenterY: number;
  horizontalZoom: number;
  zoomCenterX: number;
  dateHoverDiv: HTMLDivElement | null;
  dateAxisEntries: AxisLabel[] = [];

  minOpacity: number;
  maxOpacity: number;

  mccConfig : MccConfig | null;
  verticalTips: TipInfo[];
  confidenceThreshold: number;
  nodeColors: string[];
  branchColors: string[];
  colorsUnSet: boolean;
  metadataNodeValues: string[];
  metadataNodeValueOptions: OptionCount[];
  totalTipMutations: number[];

  selectable: boolean;

  rootConfigs: CustomSubTree[] = [];

  constructor(canvas: HTMLCanvasElement | PdfCanvas, ctx: CanvasRenderingContext2D | Context2d) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.dateAxis = canvas.parentNode?.querySelector(".dates") as HTMLDivElement;
    this.tree = null;
    // this.nodeYs = [];
    this.nodeTimes = [];
    this.nodeChildren = [];
    this.nodeParents = [];
    this.tipCount = 0;
    this.tipCounts = [];
    this.branchWeights = [];
    // this.minDate = Number.MAX_VALUE;
    // this.maxDate = Number.MIN_VALUE;
    this.height = 0;
    this.width = 0;
    this.creds = [];
    this.sizeCanvas();
    this.paddingTop = TREE_PADDING_TOP;
    this.paddingBottom = TREE_PADDING_BOTTOM;
    this.verticalZoom = 1;
    this.zoomCenterY = 0.5;
    this.horizontalZoom = 1;
    this.zoomCenterX = 0.5;
    this.dateHoverDiv = null;

    this.minOpacity = 0.1;
    this.maxOpacity = 1.0;
    this.mccConfig = null;
    this.verticalTips = [];
    this.confidenceThreshold = DEFAULT_NODE_CONFIDENCE;
    this.nodeColors = [];
    this.branchColors = [];
    this.colorsUnSet = true;
    this.metadataNodeValues = [];
    this.metadataNodeValueOptions = [];
    this.totalTipMutations = [];

    this.selectable = true;

    this.rootIndex = UNSET;
  }


  sizeCanvas() {
    const canvas = this.canvas as HTMLCanvasElement;
    try {
      const computed = window.getComputedStyle(canvas);
      this.width = parseInt(computed.width.replace('px', ''));
      if (this.width !== UNSTYLED_CANVAS_WIDTH) {
        const {width, height} = resizeCanvas(canvas);
        this.width = width;
        this.height = height;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.font = TREE_TEXT_FONT;
      }
    } catch (typeError) {
      // this happens if the canvas is a PdfCanvas
    }
  }

  // setAspectRatio(aspectRatio: number) {
  //   const canvas = this.canvas as HTMLCanvasElement;
  //   try {
  //     // ugh, forced reflow…
  //     canvas.style.width = '';
  //     canvas.style.height = '';
  //     const {width, height} = resizeCanvas(canvas),
  //       currentAspectRatio = width / height;
  //     let targetWidth = height * aspectRatio,
  //       targetHeight = width / aspectRatio;
  //     if (currentAspectRatio >= aspectRatio || targetHeight > height) {
  //       targetHeight = height;
  //     } else {
  //       targetWidth = width;
  //     }
  //     canvas.style.width = `${targetWidth}px`;
  //     canvas.style.height = `${targetHeight}px`;
  //     if (window.devicePixelRatio > 1) {
  //       canvas.width = Math.round(targetWidth * window.devicePixelRatio);
  //       canvas.height = Math.round(targetHeight * window.devicePixelRatio);
  //       this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  //     } else {
  //       canvas.width = targetWidth;
  //       canvas.height = targetHeight;
  //     }
  //     this.width = targetWidth;
  //     this.height = targetHeight;
  //     this.ctx.textAlign = 'center';
  //     this.ctx.textBaseline = 'top';
  //     this.ctx.font = TREE_TEXT_FONT;
  //   } catch (typeError) {
  //     // this happens if the canvas is a PdfCanvas
  //   }
  // }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  setBranchWeight(index:number, ctx = this.ctx) {
    // const wt = this.nodeChildren[index].length === 0 ? 1 : (0.1 + 0.9 * this.creds[index]);
    ctx.lineWidth = this.branchWeights[index];
  }



  setConfig(mccConfig : MccConfig) : void {
    this.mccConfig = mccConfig;
    this.confidenceThreshold = mccConfig.confidenceThreshold;
    this.colorsUnSet = true;
  }

  setTreeNodes(tree:Tree, creds: number[]=[]) : void {
    this.colorsUnSet = true;
    const nodeCount = tree.getSize();
    if (nodeCount > 0) {
      this.gatherNodeStats(tree, creds);
      if (this.rootIndex === UNSET) {
        this.rootIndex = (this.tree as Tree).getRootIndex();
      }
      this.positionTreeNodes();
      if (this.mccConfig) {
        this.confidenceThreshold = this.mccConfig.confidenceThreshold;
      }
      this.setColors(tree);
    }
  }

  setRootNode(rootIndex: number) : void {
    if (rootIndex === UNSET) {
      rootIndex = (this.tree as Tree).getRootIndex();
    }
    this.rootIndex = rootIndex;
    if (this.rootConfigs[rootIndex] === undefined) {
      this.positionTreeNodes();
    }

  }



  protected gatherNodeStats(tree:Tree, creds: number[]=[]) : void {
    const nodeCount = tree.getSize(),
      times: number[] = Array(nodeCount),
      nodeChildren: number[][] = Array(nodeCount),
      nodeParents: number[] =  Array(nodeCount).fill(-1),
      branchWeights: number[] = Array(nodeCount),
      tipCounts = getTipCounts(tree),
      tipCount = (nodeCount + 1) / 2,
      logMaxTipCount = Math.log(tipCount);
    if (creds.length === 0) {
      creds = new Array(nodeCount);
      creds.fill(0.8)
    }
    let minDate = Number.MAX_SAFE_INTEGER,
      maxDate = Number.MIN_SAFE_INTEGER,
      actualTipCount = 0;
    for (let i = 0; i < nodeCount; i++) {
      const t = tree.getTimeOf(i),
        kidCount = tree.getNumChildrenOf(i),
        wt = Math.log(tipCounts[i]) / logMaxTipCount;
      branchWeights[i] = BRANCH_WEIGHT_MIN + (BRANCH_WEIGHT_MAX - BRANCH_WEIGHT_MIN) * wt;
      times[i] = t;
      minDate = Math.min(minDate, t);
      maxDate = Math.max(maxDate, t);
      if (kidCount === 0) {
        actualTipCount++;
        nodeChildren[i] = [];
      } else if (kidCount === 2) {
        const left = tree.getLeftChildIndexOf(i),
          right = tree.getRightChildIndexOf(i),
          lCount = tipCounts[left],
          rCount = tipCounts[right];
        nodeParents[left] = i;
        nodeParents[right] = i;
        /*
        put the node with the lower count before the one with the higher count.
        if the same count, put the earlier one first.
        if same time, put the lower index first for predictability.
        */
        if (lCount < rCount) {
          nodeChildren[i] = [left, right];
        } else if (lCount > rCount) {
          nodeChildren[i] = [right, left];
        } else if (times[left] < times[right]) {
          nodeChildren[i] = [left, right];
        } else if (times[left] > times[right]) {
          nodeChildren[i] = [right, left];
        } else if (left < right) {
          nodeChildren[i] = [left, right];
        } else {
          nodeChildren[i] = [right, left];
        }
      }
    }
    this.tipCounts = tipCounts;
    this.tipCount = actualTipCount;
    this.branchWeights = branchWeights;
    this.tree = tree;
    this.nodeTimes = times;
    this.nodeChildren = nodeChildren;
    this.nodeParents = nodeParents;
    this.creds = creds;
  }

  protected positionTreeNodes(): void {
    const {height, tipCounts, nodeChildren, nodeTimes, rootIndex } = this,
      tipCount = tipCounts[rootIndex] || 0,
      size = tipCount === 0 ? 0 : tipCount * 2 - 1,
      yPositions: number[] = new Array(size),
      verticallySortedTips:number[] = [],
      queue:number[] = [rootIndex];
    let minDate = Number.MAX_SAFE_INTEGER,
      maxDate = Number.MIN_SAFE_INTEGER,
      ypos = height - this.paddingBottom;
    const h = (ypos - this.paddingTop) / tipCount;
    /*
    The typical tree layout is called a "ladderized" tree: the
    branches don't cross, and there's a general cascade to the
    tree that keeps the branches generally short. The first step
    is to sort clades by their tip counts, and assign y-positions
    to the tips.
    Build a queue from the tree, filling it by traversing the tree
    _depth_ first, and choosing the branch with the higher tip
    count at each node.
    When we reach a tip, set its position.
    While we're at it, set the min and max dates.
    Implementation note: in this queue, we process items as we go,
    so we add things, remove them, add some more, etc.
    At the end of it, the queue will be empty.
    */
    while (queue.length > 0) {
      const index: number = queue.shift() as number,
        children = nodeChildren[index],
        kidCount = children.length,
        t = nodeTimes[index];
      minDate = Math.min(minDate, t);
      maxDate = Math.max(maxDate, t);
      if (kidCount === 0) {
        verticallySortedTips.push(index);
        yPositions[index] = ypos;
        ypos -= h;
      } else {
        const [left, right] = children;
        /*
        the node children have already been sorted into the order we want
        to process.
        Implementation note: we process the queue by taking the first element
        via `shift`. That means putting the  larger one at the front of the queue,
        and then the smaller one before that. Thus, the order of operations below
        does not correspond to the order they get processed. e.g.
          queue.unshift(right);
          queue.unshift(left);
        results in left getting processed before right.
        */
        queue.unshift(right);
        queue.unshift(left);
      }
    }
    /*
    Each inner node's y position is the average of its
    immediate children. So far, only the tips have their
    positions set. In order to build from the tips up,
    we traverse the tree _breadth_ first to build a queue,
    and then work from the end of the queue to the start.
    Implementation note: this time, we fill the queue with
    all the entries that need processing, and then work
    from that list.
    */
    queue.length = 0;
    let i = 0;
    queue.push(rootIndex);
    while (i < queue.length) {
      const index = queue[i];
      nodeChildren[index].forEach(c=>queue.push(c));
      i++;
    }

    /* now work backwards */
    while (queue.length > 0) {
      const index = queue.pop() as number;
      /* tips will already have a y position */
      if (yPositions[index] === undefined) {
        const [left, right] = nodeChildren[index],
          ly = yPositions[left],
          ry = yPositions[right];
        // if (ly === undefined || ry === undefined) {
        //   console.warn(`bad assumptions lurk in positionTreeNodes`)
        //   /*
        //   This shouldn't happen, but just in case…
        //   one of the children's positions isn't defined yet,
        //   so put this back on the queue to try again later
        //   */
        //   queue.push(index);
        //   queue.push(left);
        //   queue.push(right);
        // } else {
        yPositions[index] = (ly + ry) / 2;
        // }
      }
      this.rootConfigs[rootIndex] = new CustomSubTree(minDate, maxDate, verticallySortedTips, yPositions, size);
      requestAnimationFrame(()=>this.setAxisDates());
    }
  }



  setAxisDates() {
    if (!this.dateAxis) return;
    const config = this.rootConfigs[this.rootIndex];
    const { scale, entries } = getNiceDateInterval(config.minDate, config.maxDate);
    const lastIndex = entries.length - 1;
    this.dateAxis.innerHTML = '';
    this.dateAxisEntries.length = 0;
    entries.forEach((entry, i)=>{
      if (scale === DateScale.year) {
        //
      } else {
        if (entry.isNewYear || i === lastIndex) {
          const div: HTMLDivElement = DATE_TEMPLATE.cloneNode(true) as HTMLDivElement;
          (div.querySelector(".cal .month") as HTMLSpanElement).textContent = entry.monthLabel;
          (div.querySelector(".cal .day") as HTMLSpanElement).textContent = entry.dateLabel;
          (div.querySelector(".year") as HTMLSpanElement).textContent = entry.yearLabel;
          div.classList.add("reference")
          const left = this.getZoomX(entry.date);
          div.style.left = `${left}px`;
          this.dateAxis.appendChild(div);
          this.dateAxisEntries.push({div, left})
        }
      }
    })
  }




  getZoomY(index: number) : number {
    const height = this.height - this.paddingBottom - this.paddingTop,
      zoomedHeight = this.verticalZoom * height,
      unzoomedCenter = height * 0.5,
      zoomCenter = this.zoomCenterY * zoomedHeight,
      /*
      constrain the offset so we don't have empty space at the top or bottom,
      where does this offset put the bottom of the zoomed tree?
      */
      maxOffset = zoomedHeight - height,
      minOffset = 0,
      offset = Math.max(Math.min(zoomCenter - unzoomedCenter, maxOffset), minOffset),
      config = this.rootConfigs[this.rootIndex];
    return config.nodeYs[index] * this.verticalZoom - offset;
  }

  getZoomedDateRange() : number[] {
    const config = this.rootConfigs[this.rootIndex],
      dateRange = config.maxDate - config.minDate,
      centerDate = config.maxDate - dateRange * this.zoomCenterX,
      dateWindowSide = dateRange / this.horizontalZoom * 0.5,
      minDate = Math.round(centerDate - dateWindowSide),
      maxDate = Math.round(centerDate + dateWindowSide);
    return [minDate, maxDate];
  }


  getDateRange() : number[] {
    if (this.rootIndex === UNSET) {
      return [UNSET, UNSET];
    }
    const config = this.rootConfigs[this.rootIndex];
    return [config.minDate, config.maxDate];
  }

  // xFor(t: number): number {
  //   return this.width - TREE_PADDING_RIGHT - 0.5 - (this.maxDate - t) / (this.maxDate - this.minDate) * (this.width - TREE_PADDING_LEFT - TREE_PADDING_RIGHT);
  // }

  getZoomX(t: number): number {
    const right = this.width - TREE_PADDING_RIGHT - 0.5,
      width = right - TREE_PADDING_LEFT,
      zoomedWidth = this.horizontalZoom * width,
      unzoomedCenter = width * 0.5,
      zoomCenter = this.zoomCenterX * zoomedWidth,
      /*
      constrain the offset so we don't have empty space at the top or bottom,
      where does this offset put the bottom of the zoomed tree?
      */
      maxOffset = zoomedWidth - width,
      minOffset = 0,
      offset = Math.max(Math.min(zoomCenter - unzoomedCenter, maxOffset), minOffset),
      config = this.rootConfigs[this.rootIndex],
      pct =  (config.maxDate - t) / (config.maxDate - config.minDate),
      x = right - (pct * zoomedWidth - offset)
    return x;
  }

  getZoomDate(x: number) : number {
    let t = UNSET;
    const right = this.width - TREE_PADDING_RIGHT - 0.5,
      width = right - TREE_PADDING_LEFT,
      zoomedWidth = this.horizontalZoom * width,
      unzoomedCenter = width * 0.5,
      zoomCenter = this.zoomCenterX * zoomedWidth,
      /*
      constrain the offset so we don't have empty space at the top or bottom,
      where does this offset put the bottom of the zoomed tree?
      */
      maxOffset = zoomedWidth - width,
      minOffset = 0,
      offset = Math.max(Math.min(zoomCenter - unzoomedCenter, maxOffset), minOffset),
      config = this.rootConfigs[this.rootIndex],
      pct = (right - x + offset) / zoomedWidth;
    t = config.maxDate - pct * (config.maxDate - config.minDate);
    // console.log(x, this.minDate, t, this.maxDate);
    return t;
  }


  zoomToTips(tips: number[]) : void {
    const height = this.height - this.paddingBottom - this.paddingTop,
      config = this.rootConfigs[this.rootIndex];
    let index = tips[0],
      y1 = config.nodeYs[index],
      y2 = y1;
    for (let i = 1; i < tips.length; i++) {
      index = tips[i];
      y1 = Math.min(y1, config.nodeYs[index]);
      y2 = Math.max(y2, config.nodeYs[index]);
    }
    const y = (y1 + y2) / 2,
      span = y2 - y1,
      zoom = height / span;
    this.zoomCenterY = y / height;
    this.verticalZoom = zoom;
    console.debug(`zoom: ${tips.length} tips at y ${y1} - ${y2} => ${zoom}, ${this.zoomCenterY}`);
  }

  resetZoom(): void {
    this.verticalZoom = 1.0;
    this.zoomCenterY = 0.5
    this.horizontalZoom = 1;
    this.zoomCenterX = 0.5;
  }

  setZoom(vZoom: number, vScroll: number, hZoom: number, hScroll: number) : void {
    this.verticalZoom = vZoom;
    this.zoomCenterY = vScroll;
    this.horizontalZoom = hZoom;
    this.zoomCenterX = hScroll;
  }




  sortTips():void {
    /* gather a list of node indexes by y position */

    const nodeYs = this.rootConfigs[this.rootIndex].nodeYs,
      nodeCount = nodeYs.length,
      sortable: TipInfo[] = [];
    for (let i = 0; i < nodeCount; i++) {
      if (this.nodeChildren[i].length === 0) {
        const y = nodeYs[i];
        sortable.push(new TipInfo(i, y));
      }
    }
    sortable.sort((a, b)=>a.y - b.y);
    this.verticalTips = sortable;
  }


  setColors(tree:Tree): void {
    // console.debug('setColorrs');
    const mccConfig = this.mccConfig,
      size = this.rootConfigs[this.rootIndex].size;

    if (!mccConfig || mccConfig.colorOption === ColorOption.confidence) {
      const confidenceThreshold = this.confidenceThreshold;
      const HI_CONFIDENCE_COLOR = getCSSValue("--tree-branch-a-stroke");
      const LOW_CONFIDENCE_COLOR = getCSSValue("--tree-branch-c-stroke");
      const HI_CONFIDENCE_WEIGHT = getCSSValue("--tree-branch-a-stroke-weight");
      const LOW_CONFIDENCE_WEIGHT = getCSSValue("--tree-branch-c-stroke-weight");

      for (let index = 0; index < size; index++) {
        let confidence = this.creds[index];
        if (isTip(tree,index)) {
          confidence = this.creds[this.nodeParents[index]];
          this.nodeColors[index] = confidence >= confidenceThreshold ? HI_CONFIDENCE_COLOR : LOW_CONFIDENCE_COLOR;
          this.branchColors[index] = HI_CONFIDENCE_COLOR;
        } else {
          const hiConf = confidence >= confidenceThreshold,
            color = hiConf ? HI_CONFIDENCE_COLOR : LOW_CONFIDENCE_COLOR,
            weight = parseFloat(hiConf ? HI_CONFIDENCE_WEIGHT : LOW_CONFIDENCE_WEIGHT);
          this.nodeColors[index] = color;
          this.branchColors[index] = color;
          this.branchWeights[index] = weight;
        }
      }
    } else if (mccConfig.metadataColors) {
      this.metadataNodeValues = mccConfig.getMetadataValues();
      this.metadataNodeValueOptions = mccConfig.getMetadataTipCounts();
      const nodeValues = this.metadataNodeValues;
      for (let index = 0; index < size; index++) {
        const value = nodeValues[index],
          color = mccConfig.getMetadataColor(value);
        this.nodeColors[index] = color;
        this.branchColors[index] = color;
      }
    }
    this.colorsUnSet = false;
  }

  setHoverDate(date:number) {
    const x = this.getZoomX(date);
    if (date === UNSET) {
      if (this.dateHoverDiv !== null) {
        this.dateHoverDiv.classList.remove("active");
      }
    } else {
      if (this.dateHoverDiv === null) {
        this.dateHoverDiv = DATE_TEMPLATE.cloneNode(true) as HTMLDivElement;
        this.dateAxis.appendChild(this.dateHoverDiv);
        this.dateHoverDiv.classList.add("hover");
      }
      setDateLabel(date, this.dateHoverDiv);
      this.dateHoverDiv.classList.add("active");
      this.dateHoverDiv.style.left = `${x}px`;
      // hide overlapping labels
      let isOverlapping = false;
      this.dateAxisEntries.forEach(({div, left})=>{
        isOverlapping = left + DATE_LABEL_WIDTH_PX > x && left < x + DATE_LABEL_WIDTH_PX;
        div.classList.toggle("off", isOverlapping);
      });
    }

  }

  setNodeColor(index:number, ctx:CanvasRenderingContext2D):void {
    (ctx || this.ctx).fillStyle = this.nodeColors[index];
  }

  setBranchColor(index:number, ctx = this.ctx):void {
    ctx.strokeStyle = this.branchColors[index];
  }

  setFade(fade: boolean) {
    this.maxOpacity = fade ? FADE_OPACITY : 1.0;
  }

  draw(earliest:number, latest:number, _dates:DateLabel[], _pdf: PdfCanvas | null = null) { // eslint-disable-line @typescript-eslint/no-unused-vars
    const config = this.rootConfigs[this.rootIndex];
    if (earliest === undefined) earliest = config.minDate;
    if (latest === undefined) latest = config.maxDate;
    const { nodeYs } = config;
    const { ctx, width, height } = this,
      nodeCount = nodeYs.length;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    // ctx.strokeStyle = this.branchColor;
    ctx.lineCap = 'round';
    ctx.lineWidth = BRANCH_WEIGHT;
    ctx.globalAlpha = this.maxOpacity;
    for (let i = 0; i < nodeCount; i++) {
      this.drawBranch(i, this.ctx);
    }
    // Draw tips
    // ctx.fillStyle = this.tipColor;
    // for (let i = 0; i !== nodeCount; i++) {
    //   if (this.nodeChildren[i].length === 0) {
    //     const ny = this.getZoomY(i),
    //       nx = this.getZoomX(this.nodeTimes[i]);
    //     this.setNodeColor(i, ctx);
    //     ctx.beginPath();
    //     ctx.moveTo(nx + TIP_SIZE, ny);
    //     ctx.arc(nx, ny, TIP_SIZE, 0, 2 * Math.PI, false);
    //     ctx.fill();
    //   }
    // }

    ctx.globalAlpha = 1;
    // this.drawTimelineLines(dates, ctx);
    // this.drawTimelineLabels(dates, pdf, ctx);
  }




  drawBranch(index: number, ctx: CanvasRenderingContext2D | Context2d): void {
    const children = this.nodeChildren[index],
      parent = this.nodeParents[index],
      nodeX = this.getZoomX(this.nodeTimes[index]);
    this.setBranchColor(index);
    this.setBranchWeight(index);
    ctx.beginPath();
    if (parent !== UNSET) {
      const nodeY = this.getZoomY(index),
        parentX = this.getZoomX(this.nodeTimes[parent]);
      ctx.moveTo(nodeX, nodeY);
      ctx.lineTo(parentX, nodeY);
    }
    if (children.length > 0) {
      const left = children[0],
        right = children[1],
        leftY = this.getZoomY(left),
        rightY = this.getZoomY(right);
      ctx.moveTo(nodeX, leftY);
      ctx.lineTo(nodeX, rightY);
    }
    ctx.stroke();
  }

  drawUmbrellaBranch(index: number, ctx: CanvasRenderingContext2D | Context2d): void {
    const children = this.nodeChildren[index],
      count = children.length;
    if (count > 0) {
      const nodeX = this.getZoomX(this.nodeTimes[index]),
        nodeY = this.getZoomY(index),
        childTimes = children.map(c=>this.nodeTimes[c]),
        earliestChildTime = Math.min(...childTimes),
        ex = Math.max(this.getZoomX(earliestChildTime), nodeX) + 3;
      this.setBranchColor(index);
      // this.setBranchWeight(tree, index);
      ctx.lineWidth = BRANCH_WEIGHT_MIN + (BRANCH_WEIGHT_MAX - BRANCH_WEIGHT_MIN) * 2 / Math.sqrt(children.length);
      ctx.beginPath();
      children.forEach((c,i)=>{
        const cx = this.getZoomX(childTimes[i]),
          cy = this.getZoomY(c);
        ctx.moveTo(cx, cy);
        // if (cx > ex) {
        ctx.lineTo(ex, cy);
        ctx.quadraticCurveTo(nodeX, cy, nodeX, nodeY);
        // } else {
        //   this.ctx.quadraticCurveTo(cx, nodeY, nodeX, nodeY);
        // }
      });
      ctx.stroke();
    }
  }

  /*
  @param stopIndices: each entry in this array is a node index where we stop traversing the tree.
  */
  drawSubtree(nodeIndex: number, ctx: CanvasRenderingContext2D | Context2d, stopIndices: number[] = []): void {
    if (this.tree) {
      const q: number[] = [nodeIndex];
      /*
      make a quick lookup for stop indices
      */
      const stops: boolean[] = [];
      stopIndices.forEach(i=>stops[i] = true);
      let index, nodeX, left, right,
        leftX, leftY, rightX, rightY;
      ctx.beginPath();
      while (q.length > 0) {
        index = q.shift() as number;
        left = this.tree.getLeftChildIndexOf(index);
        if (left !== UNSET) {
          nodeX = this.getZoomX(this.tree.getTimeOf(index));
          right = this.tree.getRightChildIndexOf(index);
          leftX = this.getZoomX(this.tree.getTimeOf(left));
          leftY = this.getZoomY(left);
          rightX = this.getZoomX(this.tree.getTimeOf(right));
          rightY = this.getZoomY(right);
          ctx.moveTo(leftX, leftY);
          ctx.lineTo(nodeX, leftY);
          ctx.lineTo(nodeX, rightY);
          ctx.lineTo(rightX, rightY);
          if (!stops[left]) q.push(left);
          if (!stops[right]) q.push(right);
        // } else {
        //   nodeX = this.getZoomX(this.tree.getTimeOf(index));
        //   nodeY = this.getZoomY(index);
        //   ctx.moveTo(nodeX + TIP_SIZE_MAX, nodeY);
        //   ctx.arc(nodeX, nodeY, TIP_SIZE_MAX, 0, TAU, false);
        }
      }
      // ctx.fill();
      ctx.stroke();
    }
  }

  getNodeAt(x:number, y:number):number {
    let closest = -1;
    let minD2 = HOVER_DISTANCE * HOVER_DISTANCE;
    const nodeYs = this.rootConfigs[this.rootIndex].nodeYs;
    for (let i = 0; i < nodeYs.length; i++) {
      const ny = this.getZoomY(i);
      if (Math.abs(ny-y) < 50) {
        const nx = this.getZoomX(this.nodeTimes[i]),
          d2 = Math.pow(x - nx, 2) + Math.pow(y - ny, 2);
        if (d2 < minD2) {
          closest = i;
          minD2 = d2;
        }
      }
    }
    if (isNaN(closest)) closest = -1;
    return closest;
  }




  getCanvas():HTMLCanvasElement|PdfCanvas {
    return this.canvas;
  }

}


export const instantiateMccTreeCanvas = (selector: string)=>{
  const maybeCanvas = document.querySelector(selector);
  if (maybeCanvas === null) {
    throw new Error(`UI canvas '${selector}' not found`);
  }
  if (!(maybeCanvas instanceof HTMLCanvasElement)) {
    throw new Error(`UI canvas '${selector}' is not a canvas`);
  }
  const maybeCtx = maybeCanvas.getContext("2d");
  if (maybeCtx === null) {
    throw new Error('This browser does not support 2-dimensional canvas rendering contexts.');
  }
  return new MccTreeCanvas(maybeCanvas, maybeCtx);
}
