import {Tree } from '../pythia/delphy_api';
import {MccUmbrella} from '../pythia/mccumbrella';
import {DateLabel} from './datelabel';
import {
  UNSTYLED_CANVAS_WIDTH,
  BRANCH_WEIGHT, BRANCH_WEIGHT_MIN, BRANCH_WEIGHT_MAX,
  TREE_PADDING_TOP,
  TREE_PADDING_BOTTOM, TREE_PADDING_LEFT, TREE_PADDING_RIGHT,
  TREE_TEXT_TOP, TREE_TEXT_LINE_SPACING,
  TREE_TEXT_FONT, TREE_TEXT_FONT_2,
  TREE_TEXT_COLOR, TREE_TEXT_COLOR_2,
  TREE_DATELINE_COLOR, TREE_DATELINE_COLOR_2,
  DASH_LENGTH, DASH_SPACING, DASH_WEIGHT,
  resizeCanvas,
  UNSET,
  getNiceDateInterval,
  DateScale,
  DATE_TEMPLATE} from './common';
import {getTipCounts} from '../util/treeutils';
import { PdfCanvas } from '../util/pdfcanvas';
import { Context2d } from "jspdf";

// import { MostCommonSplitTree } from '../pythia/mostcommonsplittree';

// import '/assets/fonts/MDSystemStandard/MDSystem-Bold.woff2?url';


// const PDF_TYPEFACE = 'Helvetica',
//   PDF_700_WT = 'Bold',
//   PDF_500_WT = '';
const PDF_TYPEFACE = 'Roboto',
  PDF_700_WT = '700',
  PDF_500_WT = '500';

const HOVER_DISTANCE = 30;

const TIP_COLOR = 'rgb(77, 132, 191)';
const BRANCH_COLOR = 'rgb(96, 156, 219)';
// const TAU = Math.PI * 2;

type DrawBranchFnc =  (i:number, ctx:CanvasRenderingContext2D | Context2d)=>void;

{
  /* ensure fonts that we use in canvas are added to the document before we need them */
  const success = (font:FontFace)=>document.fonts.add(font),
    failure = ()=>{
      throw new Error('could not load a font');
    };
  const promises = Promise.all([
    (new FontFace("MDSystem", "url('./assets/fonts/MDSystemStandard/MDSystem-Bold.woff2')", {weight: '700', style: 'normal'})).load().then(success, failure),
    (new FontFace("MDSystem", "url('./assets/fonts/MDSystemStandard/MDSystem-Medium.woff2')", {weight: '500', style: 'normal'})).load().then(success, failure),
  ]).catch(()=>{}); // eslint-disable-line @typescript-eslint/no-empty-function
  promises.then(fonts => {
    if (!fonts) {
      console.debug("Could not load MD fonts, using Roboto fallbacks");
      const backupPromises = Promise.all([
        (new FontFace("Roboto", "url('./assets/fonts/roboto/roboto-bold.ttf')", {weight: '700', style: 'normal'})).load(),
        (new FontFace("Roboto", "url('./assets/fonts/roboto/roboto-medium.ttf')", {weight: '500', style: 'normal'})).load(),
      ]);
      backupPromises.then(fonts => {
        fonts.forEach(font => document.fonts.add(font));
      });
    }
  });


}




export class TreeCanvas {

  canvas: HTMLCanvasElement | PdfCanvas;
  ctx: CanvasRenderingContext2D | Context2d;
  dateAxis: HTMLDivElement;
  height: number;
  width: number;
  branchColor: string;
  tipColor: string;
  protected nodeYs: number[];
  nodeTimes: number[];
  nodeChildren: number[][];
  nodeParents: number[];
  tipCount: number;
  /* how many tips for the node at this index */
  tipCounts: number[];
  branchWeights: number[];
  minDate: number;
  maxDate: number;
  tree: Tree | null;
  creds: number[];
  paddingTop : number;
  paddingBottom: number;
  /* we don't want this to be less than 1, but typescript can't enforce that for us */
  verticalZoom: number;
  zoomCenterY: number;
  horizontalZoom: number;
  zoomCenterX: number;
  drawBranch: DrawBranchFnc;

  minOpacity: number;
  maxOpacity: number;



  constructor(canvas: HTMLCanvasElement | PdfCanvas, ctx: CanvasRenderingContext2D | Context2d) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.dateAxis = canvas.parentNode?.querySelector(".dates") as HTMLDivElement;
    this.tree = null;
    this.nodeYs = [];
    this.nodeTimes = [];
    this.nodeChildren = [];
    this.nodeParents = [];
    this.tipCount = 0;
    this.tipCounts = [];
    this.branchWeights = [];
    this.minDate = Number.MAX_VALUE;
    this.maxDate = Number.MIN_VALUE;
    this.height = 0;
    this.width = 0;
    this.creds = [];
    this.sizeCanvas();
    this.branchColor = BRANCH_COLOR;
    this.tipColor = TIP_COLOR;
    this.paddingTop = TREE_PADDING_TOP;
    this.paddingBottom = TREE_PADDING_BOTTOM;
    this.verticalZoom = 1;
    this.zoomCenterY = 0.5;
    this.horizontalZoom = 1;
    this.zoomCenterX = 0.5;

    this.minOpacity = 0.1;
    this.maxOpacity = 1.0;
    this.drawBranch = (i:number, ctx: CanvasRenderingContext2D | Context2d)=>console.debug(`drawBranch not decided ${i}`, ctx)
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
        console.log(`sizing canvas height to ${this.height}`)
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.font = TREE_TEXT_FONT;
      }
    } catch (typeError) {
      // this happens if the canvas is a PdfCanvas
    }
  }

  setAspectRatio(aspectRatio: number) {
    const canvas = this.canvas as HTMLCanvasElement;
    try {
      // ugh, forced reflow…
      canvas.style.width = '';
      canvas.style.height = '';
      const {width, height} = resizeCanvas(canvas),
        currentAspectRatio = width / height;
      let targetWidth = height * aspectRatio,
        targetHeight = width / aspectRatio;
      if (currentAspectRatio >= aspectRatio || targetHeight > height) {
        targetHeight = height;
      } else {
        targetWidth = width;
      }
      canvas.style.width = `${targetWidth}px`;
      canvas.style.height = `${targetHeight}px`;
      if (window.devicePixelRatio > 1) {
        canvas.width = Math.round(targetWidth * window.devicePixelRatio);
        canvas.height = Math.round(targetHeight * window.devicePixelRatio);
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      } else {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }
      this.width = targetWidth;
      this.height = targetHeight;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.font = TREE_TEXT_FONT;
    } catch (typeError) {
      // this happens if the canvas is a PdfCanvas
    }
  }



  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  setNodeColor(index:number, ctx=this.ctx) {
    let opa = this.nodeChildren[index].length === 0 ? this.creds[this.nodeParents[index]] : this.creds[index];
    // opa = 0.1 + 0.9 * opa; //Math.pow(Math.E, opa);
    opa = this.minOpacity + (this.maxOpacity - this.minOpacity) * opa; //Math.pow(Math.E, opa);
    ctx.globalAlpha = opa;
  }

  setBranchColor(index:number, ctx = this.ctx) {
    // const opa = this.nodeChildren[index].length === 0 ? 1 : (0.1 + 0.9 * this.creds[index]);
    const opa = this.nodeChildren[index].length === 0 ? 1 : (this.minOpacity + (this.maxOpacity - this.minOpacity) * this.creds[index]);
    ctx.globalAlpha = opa;
  }

  setBranchWeight(index:number, ctx = this.ctx) {
    // const wt = this.nodeChildren[index].length === 0 ? 1 : (0.1 + 0.9 * this.creds[index]);
    ctx.lineWidth = this.branchWeights[index];
  }



  // // ██████  ███████  ██████ ████████
  // // ██   ██ ██      ██         ██
  // // ██████  █████   ██         ██
  // // ██   ██ ██      ██         ██
  // // ██   ██ ███████  ██████    ██



  positionTreeNodes(tree:Tree, creds: number[]=[]): number[][] {
    this.drawBranch = tree instanceof MccUmbrella ?
      (i:number, ctx:CanvasRenderingContext2D | Context2d = this.ctx)=>this.drawUmbrellaBranch(i, ctx)
      : (i:number, ctx:CanvasRenderingContext2D | Context2d = this.ctx) => this.drawNodeBranch(i, ctx);

    const {height} = this,
      nodeCount = tree.getSize(),
      yPositions: number[] = Array(nodeCount),
      times: number[] = Array(nodeCount),
      nodeChildren: number[][] = Array(nodeCount),
      nodeParents: number[] =  Array(nodeCount).fill(-1);
    if (nodeCount > 0) {
      if (creds.length === 0) {
        creds = new Array(nodeCount);
        creds.fill(0.8)
      }
      let minDate = Number.MAX_SAFE_INTEGER,
        maxDate = Number.MIN_SAFE_INTEGER,
        actualTipCount = 0;
      for (let i = 0; i < nodeCount; i++) {
        const t = tree.getTimeOf(i),
          kidCount = tree.getNumChildrenOf(i);
        times[i] = t;
        minDate = Math.min(minDate, t);
        maxDate = Math.max(maxDate, t);
        if (kidCount === 0) {
          actualTipCount++;
          nodeChildren[i] = [];
        } else if (kidCount === 2) {
          const left = tree.getLeftChildIndexOf(i),
            right = tree.getRightChildIndexOf(i);
          nodeChildren[i] = [left, right];
          nodeParents[left] = i;
          nodeParents[right] = i;
        } else {
          nodeChildren[i] = (tree as MccUmbrella).getChildren(i);
          nodeChildren[i].forEach(c=>nodeParents[c] = i);
        }
      }
      /*
      to ladderize the tree we need to sort clades by their tip counts.
      build a queue from the tree, filling it by traversing the tree
      depth first, and choosing the branch with the higher tip
      count at each node.
      */
      let ypos = height - this.paddingBottom;
      const h = (ypos - this.paddingTop)/actualTipCount;
      const tipCounts = getTipCounts(tree),
        rootIndex = tree.getRootIndex(),
        verticallySortedTips:number[] = [],
        queue:number[] = [rootIndex];
      while (queue.length > 0) {
        const index: number = queue.shift() as number,
          children = nodeChildren[index],
          kidCount = children.length;
        if (kidCount === 0) {
          verticallySortedTips.push(index);
          yPositions[index] = ypos;
          ypos -= h;
          nodeChildren[index] = [];
        } else if (kidCount === 2) {
          const left = children[0],
            right = children[1],
            lCount = tipCounts[left],
            rCount = tipCounts[right];
          nodeChildren[index] = [left, right];
          /*
          puts the node with the lower count before the one with the higher count
          if the same count, put the earlier one first
          */
          if (lCount < rCount) {
            queue.unshift(right);
            queue.unshift(left);
          } else if (lCount > rCount) {
            queue.unshift(left);
            queue.unshift(right);
          } else if (times[left] < times[right]) {
            queue.unshift(right);
            queue.unshift(left);
          } else {
            queue.unshift(left);
            queue.unshift(right);
          }
        } else {
          const umbrella: MccUmbrella = tree as MccUmbrella,
            kids: number[] = umbrella.getChildren(index),
            counts = kids.map(c=>[c, tipCounts[c]]);
          nodeChildren[index] = kids;
          /*
          sort the list by count desc so that the queue
          gets the lower counts first
          */
          counts.sort((a,b)=>{
            let diff = b[1] - a[1];
            if (diff === 0) diff = times[b[0]] - times[a[0]];
            return diff;
          });
          counts.forEach(item=>queue.unshift(item[0]));
        }
      }

      queue.length = 0;
      /* fill the queue from the root down, breadth first */
      let i = 0;
      queue.push(tree.getRootIndex());
      while (i < queue.length) {
        const index = queue[i];
        nodeChildren[index].forEach(c=>queue.push(c));
        i++;
      }
      const logMaxTipCount = Math.log(tipCounts[rootIndex]);
      while (queue.length > 0) {
        const index = queue.pop() as number;
        if (yPositions[index] === undefined) {
          const left = tree.getLeftChildIndexOf(index),
            right = tree.getRightChildIndexOf(index),
            ly = yPositions[left],
            ry = yPositions[right];
          if (ly === undefined || ry === undefined) {
            /*
            This shouldn't happen, but just in case…
            one of the children's positions isn't defined yet,
            so put this back on the queue to try again later
            */
            queue.push(index);
            queue.push(left);
            queue.push(right);
          } else {
            yPositions[index] = (ly + ry) / 2;
            const wt = Math.log(tipCounts[index]) / logMaxTipCount;
            this.branchWeights[index] = BRANCH_WEIGHT_MIN + (BRANCH_WEIGHT_MAX - BRANCH_WEIGHT_MIN) * wt;
          }
        }
      }
      this.tipCounts = tipCounts;
      this.tipCount = actualTipCount;
      this.minDate = minDate;
      this.maxDate = maxDate;
      this.tree = tree;
      this.nodeYs = yPositions;
      this.nodeTimes = times;
      this.nodeChildren = nodeChildren;
      this.nodeParents = nodeParents;
      this.creds = creds;

      // if (tree instanceof MccTree || tree instanceof MostCommonSplitTree || tree instanceof MccUmbrella) {
      //   const summ = tree as SummaryTree,
      //     root = summ.getRootIndex(),
      //     count = summ.getNumBaseNodesOf(root),
      //     times: number[] = [];
      //   for (let t = 0; t < count; t++) {
      //     const n1 = summ.getBaseNodeNodeIndexOf(root, t),
      //       t1 = summ.getBaseNodeTreeIndexOf(root, t),
      //       bt1 = summ.getBaseTree(t1),
      //       d1 = bt1.getTimeOf(n1);
      //     times.push(Math.round(d1));
      //   }
      //   times.sort((a:number, b:number)=>a-b);
      //   console.debug(summ.getNumBaseTrees(), root, times.map(t=>`${t}`).join());
      //   for (let i = 0; i < summ.getSize(); i++) {
      //     console.debug(`    ${i}   ${summ.getNumBaseNodesOf(i)}`);
      //   }
      // }


      requestAnimationFrame(()=>this.setAxisDates());
    }
    return yPositions.map(y=>[y]);
  }


  setAxisDates() {
    if (!this.dateAxis) return;
    const { scale, entries } = getNiceDateInterval(this.minDate, this.maxDate);
    const lastIndex = entries.length - 1;
    this.dateAxis.innerHTML = '';
    entries.forEach((entry, i)=>{
      console.log(entry)
      const div: HTMLDivElement = DATE_TEMPLATE.cloneNode(true) as HTMLDivElement;
      if (scale == DateScale.year) {
        //
      } else {
        if (entry.isNewYear || i === lastIndex) {
          (div.querySelector(".cal .month") as HTMLSpanElement).textContent = entry.monthLabel;
          (div.querySelector(".cal .day") as HTMLSpanElement).textContent = entry.dateLabel;
          (div.querySelector(".year") as HTMLSpanElement).textContent = entry.yearLabel;
          div.classList.add("reference")
        }
      }
      const x = this.getZoomX(entry.date);
      div.style.left = `${x}px`;
      this.dateAxis.appendChild(div);
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
      offset = Math.max(Math.min(zoomCenter - unzoomedCenter, maxOffset), minOffset);
    return this.nodeYs[index] * this.verticalZoom - offset;
  }

  getZoomedDateRange() : number[] {
    const dateRange = this.maxDate - this.minDate,
      centerDate = this.maxDate - dateRange * this.zoomCenterX,
      dateWindowSide = dateRange / this.horizontalZoom * 0.5,
      minDate = Math.round(centerDate - dateWindowSide),
      maxDate = Math.round(centerDate + dateWindowSide);
    return [minDate, maxDate];
  }


  getDateRange() : number[] {
    return [this.minDate, this.maxDate];
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
      pct =  (this.maxDate - t) / (this.maxDate - this.minDate);
    return right - (pct * zoomedWidth - offset);
  }




  draw(earliest:number, latest:number, dates:DateLabel[], pdf: PdfCanvas | null = null) {
    if (earliest === undefined) earliest = this.minDate;
    if (latest === undefined) latest = this.maxDate;
    const {ctx, width, height, nodeYs, drawBranch} = this,
      nodeCount = nodeYs.length;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = this.branchColor;
    ctx.lineCap = 'round';
    ctx.lineWidth = BRANCH_WEIGHT;
    ctx.globalAlpha = this.maxOpacity;
    for (let i = 0; i < nodeCount; i++) {
      drawBranch(i, this.ctx);
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

  drawTimelineLines(dates:DateLabel[], ctx: CanvasRenderingContext2D | Context2d):void {
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.fillRect(0, 0, this.width, this.paddingTop);
    ctx.strokeStyle = TREE_DATELINE_COLOR_2;
    const y1 = TREE_TEXT_TOP,
      bottom = this.height - this.paddingBottom;
    let first = true;
    ctx.lineWidth = DASH_WEIGHT;
    const lineTop = y1 + TREE_TEXT_LINE_SPACING * 2 + DASH_LENGTH - 1;
    dates.forEach((dl:DateLabel)=>{
      if (dl.index > this.minDate) {
        const x = this.getZoomX(dl.index);
        const y = lineTop;
        ctx.beginPath();
        // while (y < bottom) {
        //   ctx.moveTo(x, y);
        //   y += DASH_LENGTH;
        //   ctx.lineTo(x, y);
        //   y += DASH_SPACING;
        // }
        ctx.stroke();
        if (first) {
          first = false;
          ctx.strokeStyle = TREE_DATELINE_COLOR;
        }
      }
    });
  }


  drawTimelineLabels(dates:DateLabel[], pdf: PdfCanvas | null = null, ctx: CanvasRenderingContext2D | Context2d):void {
    if (pdf !== null) {
      ctx.fillStyle = TREE_TEXT_COLOR_2;
      const fontTokens = TREE_TEXT_FONT_2.split(' ');
      pdf.setFont(PDF_TYPEFACE, fontTokens[0] === '700' ? PDF_700_WT : PDF_500_WT);
      pdf.setFontSize(parseInt(fontTokens[1]));
    }
    const y1 = TREE_TEXT_TOP,
      y2 = y1 + TREE_TEXT_LINE_SPACING;
    let first = true;
    ctx.lineWidth = DASH_WEIGHT;
    dates.forEach((dl:DateLabel)=>{
      if (dl.index > this.minDate) {
        const x = this.getZoomX(dl.index);
        if (dl.index === this.maxDate || dl.index < this.maxDate - 30) {
          // ctx.fillText(dl.label1, x, y1);
          // ctx.fillText(dl.label2, x, y2);
        }
        if (first) {
          first = false;
          if (pdf !== null) {
            const fontTokens = TREE_TEXT_FONT.split(' ');
            pdf.setFont(PDF_TYPEFACE, fontTokens[0] === '500' ? PDF_500_WT : PDF_700_WT);
            pdf.setFontSize(parseInt(fontTokens[1]));
          }
          ctx.fillStyle = TREE_TEXT_COLOR;
        }
      }
    });

  }


  drawTimelineLabelsPDF(dates:DateLabel[], earliest:number = this.minDate, latest:number = this.maxDate,
    withBackground=true, ctx: CanvasRenderingContext2D):void {
    ctx.fillStyle = TREE_TEXT_COLOR_2;
    if (withBackground) {
      /*
      here, withBackground is a proxy for are we drawing to a js canvas
      or a pdf. And the pdf isn't playing nice with the way we
      specify canvas fonts, e.g.
        > jsPdfCtx.font = '700 12px MDSystem';
      doesn’t work
      */
      ctx.font = TREE_TEXT_FONT_2;
    }
    const y1 = TREE_TEXT_TOP,
      y2 = y1 + TREE_TEXT_LINE_SPACING;
    let first = true;
    ctx.lineWidth = DASH_WEIGHT;
    dates.forEach((dl:DateLabel)=>{
      if (dl.index > earliest) {
        const x = this.getZoomX(dl.index);
        if (dl.index === latest || dl.index < latest - 30) {
          ctx.fillText(dl.label1, x, y1);
          ctx.fillText(dl.label2, x, y2);
        }
        if (first) {
          first = false;
          if (withBackground) {
            ctx.font = TREE_TEXT_FONT;
            ctx.fillStyle = TREE_TEXT_COLOR;
          }
        }
      }
    });

  }



  drawNodeBranch(index: number, ctx: CanvasRenderingContext2D | Context2d): void {
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


  drawSubtree(nodeIndex: number, ctx: CanvasRenderingContext2D | Context2d): void {
    if (this.tree) {
      const q: number[] = [nodeIndex];
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
          q.push(left);
          q.push(right);
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

  getNodePosition(nodeIndex: number):number[] {
    const ny = this.nodeYs[nodeIndex],
      nx = this.getZoomX(this.nodeTimes[nodeIndex]);
    return [nx,ny];
  }


  getNodeAt(x:number, y:number):number {
    let closest = -1;
    let minD2 = HOVER_DISTANCE * HOVER_DISTANCE;
    for (let i = 0; i < this.nodeYs.length; i++) {
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

  zoomToTips(tips: number[]) : void {
    const height = this.height - this.paddingBottom - this.paddingTop;
    let index = tips[0],
      y1 = this.nodeYs[index],
      y2 = y1;
    for (let i = 1; i < tips.length; i++) {
      index = tips[i];
      y1 = Math.min(y1, this.nodeYs[index]);
      y2 = Math.max(y2, this.nodeYs[index]);
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


  // // ██    ██ ████████ ██ ██
  // // ██    ██    ██    ██ ██
  // // ██    ██    ██    ██ ██
  // // ██    ██    ██    ██ ██
  // //  ██████     ██    ██ ███████

  getCanvas():HTMLCanvasElement|PdfCanvas {
    return this.canvas;
  }

}


export const instantiateTreeCanvas = (selector: string)=>{
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
  return new TreeCanvas(maybeCanvas, maybeCtx);
}
