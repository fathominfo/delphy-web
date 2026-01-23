import { getMutationNameParts } from "../../constants";
import { MutationDistribution } from "../../pythia/mutationdistribution";
import { DisplayNode, resizeCanvas, getNodeStroke, UNSET } from "../common";
import { NodeCallback, NodeComparisonData } from "./lineagescommon";
import { mutationPrevalenceThreshold } from "./nodecomparisonchartdata";


const stub = 20;
const margin = {
  top: 10,
  right: 20,
  bottom: 25,
  left: 20
};

type XYCoord = [number, number];

const rad = 5;

const NODE_FILLS: string[] = [];
NODE_FILLS[DisplayNode.root] = getNodeStroke(DisplayNode.root);
NODE_FILLS[DisplayNode.mrca] = getNodeStroke(DisplayNode.mrca);
NODE_FILLS[DisplayNode.nodeA] = "#ffffff";
NODE_FILLS[DisplayNode.nodeB] = "#ffffff";



/*
this draws a simple schematic to show the relations
between nodes in the tree. The current intent is that
there is only one of these.
*/
export class NodeRelationChart {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  hasMRCA: boolean;
  highlightedNode: DisplayNode | typeof UNSET;
  nodeHighlightCallback: NodeCallback;
  src: NodeComparisonData[] = [];
  indexes: [number, number, number, number] = [UNSET, UNSET, UNSET, UNSET];
  nodePos: [XYCoord,XYCoord,XYCoord,XYCoord] = [[0,0],[0,0],[0,0],[0,0]];
  branchWidth = 0;
  branchHeight = 0;
  mutationLists: MutationDistribution[][];

  constructor(nodeHighlightCallback: NodeCallback) {
    const maybeCanvas = document.querySelector("#lineages--node-layout--chart-canvas");
    if (!maybeCanvas) {
      throw new Error("could not find canvas for the NodeRelationChart");
    }
    this.canvas = maybeCanvas as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    this.hasMRCA = false;
    this.highlightedNode = UNSET;
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.mutationLists = Array(4);
    {
      let prev: DisplayNode | typeof UNSET;
      const dist2 = (mx: number, my: number, nodePosIndex: number)=>{
        const dx = mx - this.nodePos[nodePosIndex][0],
          dy = my - this.nodePos[nodePosIndex][1];
        return dx * dx + dy * dy;
      }
      const findClosest = (e: MouseEvent)=>{
        const mx = e.offsetX,
          my = e.offsetY;
        let closest: DisplayNode | typeof UNSET = UNSET,
          minD = 50 * 50;
        const testNode = (node: DisplayNode, index:number)=>{
          const d = dist2(mx, my, index);
          if (d < minD) {
            minD = d;
            closest = node;
          }
        }
        testNode(DisplayNode.root, 0);
        if (this.checkHasNode(DisplayNode.mrca)) {
          testNode(DisplayNode.mrca, 1);
        }
        if (this.checkHasNode(DisplayNode.nodeA)) {
          testNode(DisplayNode.nodeA, 2);
        }
        if (this.checkHasNode(DisplayNode.nodeB)) {
          testNode(DisplayNode.nodeB, 3);
        }
        return closest;
      }

      this.canvas.addEventListener('pointermove', (e: MouseEvent)=>{
        const closest = findClosest(e);
        if (closest !== prev) {
          prev = closest;
          nodeHighlightCallback(closest, UNSET, null);
        }
      });

      this.canvas.addEventListener('pointerleave', ()=>{
        if (prev !== UNSET) {
          prev = UNSET;
          nodeHighlightCallback(UNSET, UNSET, null);
        }
      })


    }
  }

  resize():void {
    const {width, height} = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
    this.branchHeight = (height - margin.top - margin.bottom) / 3;
    this.branchWidth = (width - margin.left - margin.right - stub * 2) / 2;
    const rootX = margin.left + stub,
      rootY = margin.top + this.branchHeight,
      gen1X = rootX + this.branchWidth,
      gen1Y = rootY + this.branchHeight;

    this.nodePos[DisplayNode.root][0] = rootX;
    this.nodePos[DisplayNode.root][1] = rootY;
    this.nodePos[DisplayNode.mrca][0] = gen1X;
    this.nodePos[DisplayNode.mrca][1] = gen1Y;

  }

  draw() {
    this.resize();
    const { ctx, width, height, nodePos, branchHeight, branchWidth } = this;

    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "#e2e2e2";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.moveTo(nodePos[0][0] - stub, nodePos[0][1]);
    ctx.lineTo(nodePos[0][0], nodePos[0][1]);
    ctx.stroke();


    this.drawSubBranch(nodePos[0][0], nodePos[0][1], true, branchWidth, branchHeight, false);
    this.drawSubBranch(nodePos[0][0], nodePos[0][1], false, branchWidth, branchHeight, true);
    this.drawSubBranch(nodePos[1][0], nodePos[1][1], true, branchWidth, branchHeight, false);
    this.drawSubBranch(nodePos[1][0], nodePos[1][1], false, branchWidth, branchHeight, false);

    this.drawNode(DisplayNode.root);
    this.drawNode(DisplayNode.mrca);
    this.drawNode(DisplayNode.nodeA);
    this.drawNode(DisplayNode.nodeB);

  }

  private checkHasNode(type: DisplayNode): boolean {
    switch (type) {
    case DisplayNode.root:
      return this.indexes[0] !== UNSET;
    case DisplayNode.mrca:
      return this.indexes[1] !== UNSET;
    case DisplayNode.nodeA:
      return this.indexes[2] !== UNSET;
    case DisplayNode.nodeB:
      return this.indexes[3] !== UNSET;
    case DisplayNode.UNSET:
      return false
    default:
      return false;
    }
  }


  private drawSubBranch(x: number, y: number, up: boolean, branchWidth: number,
    branchHeight: number, hasDescendants: boolean) {
    const {ctx} = this,
      y2 = up ? (y - branchHeight) : (y + branchHeight);
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.moveTo(x, y);
    ctx.lineTo(x, y2);
    ctx.lineTo(x + branchWidth, y2);
    ctx.stroke();
    if (!hasDescendants) {
      this.drawFadingEnd(x + branchWidth, y2);
    }
  }


  private drawMutationsBranch(x: number, y: number, branchWidth: number, shownMutations: MutationDistribution[]) {

    const {ctx} = this;
    const margin = {
      top: 5,
      right: 20,
      bottom: 10,
      left: 10
    };
    const padding = 10;
    const boxHeight = 15;
    ctx.strokeStyle = "#e2e2e2";
    ctx.lineWidth = 3;

    ctx.fillStyle = "rgb(247, 247, 247)";
    ctx.fillRect(x + margin.left, y - boxHeight / 2, branchWidth - margin.left - margin.right, boxHeight);

    ctx.beginPath();
    ctx.setLineDash([5, 3]);
    ctx.moveTo(x + margin.left + padding, y);
    ctx.lineTo(x + margin.left + padding + (branchWidth - margin.left - margin.right - padding * 2), y);
    ctx.stroke();

    ctx.textAlign = "center";
    const centerX = x + margin.left + (branchWidth - margin.left - margin.right) / 2;

    // mutations count
    ctx.fillStyle = "rgb(108, 108, 108)";
    ctx.textBaseline = "bottom";

    // mutation list
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const mutationY = y + boxHeight / 2 + margin.top;
    if (shownMutations.length === 1) {
      const nameParts = getMutationNameParts(shownMutations[0].mutation);
      const textWidths = nameParts.map((part, i) => {
        ctx.font = `${i === 1 ? '' : '600 '  }9px 'MD IO', RobotoMono, monospace`;
        return ctx.measureText(part).width;
      });
      const totalWidth = textWidths.reduce((a, b) => a + b, 0);
      let mutationX = centerX - totalWidth / 2;
      const padding = 0.5;
      nameParts.forEach((part, i) => {
        ctx.font = `${i === 1 ? '' : '600 '  }9px 'MD IO', RobotoMono, monospace`;
        ctx.fillText(part, mutationX, mutationY);
        mutationX += textWidths[i] + padding;
      });
    } else if (shownMutations.length > 1) {
      ctx.textAlign = "center";
      ctx.font = "9px MDSystem, Roboto, sans-serif";
      ctx.fillText(`${shownMutations.length} mutations`, centerX, mutationY);
    }
  }

  private drawFadingEnd(x: number, y: number) {
    const {ctx} = this;
    const endLength = 30;
    if (!Number.isFinite(x + y)) return;
    const gradient = ctx.createLinearGradient(x, y, x + endLength, y);
    gradient.addColorStop(0, "#e2e2e2");
    gradient.addColorStop(1, "#ffffff");
    ctx.strokeStyle = gradient;
    ctx.moveTo(x, y);
    ctx.lineTo(x + endLength, y);
    ctx.stroke();
    ctx.strokeStyle = "#e2e2e2";
  }

  private drawNode(nodeType: DisplayNode) {
    if (this.checkHasNode(nodeType) && nodeType !== UNSET){
      const {ctx, branchWidth} = this,
        [x, y] = this.nodePos[nodeType],
        mutations = this.mutationLists[nodeType];
      ctx.fillStyle = NODE_FILLS[nodeType];
      ctx.strokeStyle = getNodeStroke(nodeType);
      if (this.highlightedNode === UNSET || nodeType === this.highlightedNode) {
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.3;
      }
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.ellipse(x, y, rad, rad, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (mutations) {
        this.drawMutationsBranch(x - branchWidth, y, branchWidth, mutations);
      }

    }
  }

  setData(src: NodeComparisonData[], indexes: [number, number, number, number], nodeAIsUpper: boolean) {
    // console.debug(src.map(ncd=>ncd.nodePair.pairType));
    this.src = src;
    this.indexes = indexes;


    const {nodePos, branchHeight, branchWidth } = this;

    const rootY = nodePos[DisplayNode.root][1],
      [gen1X, gen1Y] = nodePos[DisplayNode.mrca];

    const getMutationsFor = (nodeIndex: number)=>{
      const data = src.filter(ncd=>ncd.nodePair.index2 === nodeIndex)[0],
        muts = !data? []: data.nodePair.mutations.filter(md => md.getConfidence() >= mutationPrevalenceThreshold);
      return muts;
    }

    this.mutationLists[DisplayNode.root] = [];
    this.mutationLists[DisplayNode.mrca] = getMutationsFor(indexes[DisplayNode.mrca]);
    this.mutationLists[DisplayNode.nodeA] = getMutationsFor(indexes[DisplayNode.nodeA]);
    this.mutationLists[DisplayNode.nodeB] = getMutationsFor(indexes[DisplayNode.nodeB]);
    if (indexes[DisplayNode.mrca] !== UNSET) {
      nodePos[DisplayNode.nodeA][0] = gen1X + branchWidth;
      nodePos[DisplayNode.nodeB][0] = gen1X + branchWidth;
      if (nodeAIsUpper) {
        nodePos[DisplayNode.nodeA][1] = gen1Y - branchHeight;
        nodePos[DisplayNode.nodeB][1] = gen1Y + branchHeight;
      } else {
        nodePos[DisplayNode.nodeA][1] = gen1Y + branchHeight;
        nodePos[DisplayNode.nodeB][1] = gen1Y - branchHeight;
      }
    } else if (indexes[DisplayNode.nodeA] !== UNSET) {
      if (indexes[DisplayNode.nodeB] === UNSET) {
        /* if there is no nodeB, then this goes where the MRCA would go */
        nodePos[DisplayNode.nodeA][0] = gen1X;
        nodePos[DisplayNode.nodeA][1] = gen1Y;
      } else {
        /*
        are nodes 1 and 2 both descended from root,
        or is one the parent of the other?
        */
        const root = indexes[DisplayNode.root],
          nodeA = indexes[DisplayNode.nodeA],
          nodeB = indexes[DisplayNode.nodeB];
        let nodeAParent: number = UNSET,
          nodeBParent: number = UNSET;
        src.forEach((ncd: NodeComparisonData)=>{
          const pair = ncd.nodePair;
          if (pair.index2 === nodeA) nodeAParent = pair.index1;
          else if (pair.index2 === nodeB) nodeBParent = pair.index1;
        });
        if (nodeAParent === root) {
          if (nodeBParent === root) {
            nodePos[DisplayNode.nodeA][0] = gen1X;
            nodePos[DisplayNode.nodeB][0] = gen1X;
            if (nodeAIsUpper)  {
              nodePos[DisplayNode.nodeA][1] = rootY - branchHeight;
              nodePos[DisplayNode.nodeB][1] = gen1Y;
            } else {
              nodePos[DisplayNode.nodeA][1] = gen1Y;
              nodePos[DisplayNode.nodeB][1] = rootY - branchHeight;
            }
          } else if (nodeBParent === nodeA) {
            nodePos[DisplayNode.nodeA][0] = gen1X;
            nodePos[DisplayNode.nodeA][1] = gen1Y;
            nodePos[DisplayNode.nodeB][0] = gen1X + branchWidth;
            nodePos[DisplayNode.nodeB][1] = gen1Y + branchHeight;
          } else {
            nodePos[DisplayNode.nodeA][0] = gen1X;
            nodePos[DisplayNode.nodeA][1] = gen1Y;
            console.warn('the developer has unwarranted assumptions about node relations', nodeBParent, indexes);
          }
        } else if (nodeAParent === nodeB && nodeBParent === root) {
          nodePos[DisplayNode.nodeB][0] = gen1X;
          nodePos[DisplayNode.nodeB][1] = gen1Y;
          nodePos[DisplayNode.nodeA][0] = gen1X + branchWidth;
          nodePos[DisplayNode.nodeA][1] = gen1Y + branchHeight;
        } else {
          console.warn('the developer has unwarranted assumptions about node relations', nodeAParent, nodeBParent, indexes);
        }
      }
    } else if (indexes[DisplayNode.nodeB] !== UNSET) {
      nodePos[DisplayNode.nodeB][0] = gen1X;
      nodePos[DisplayNode.nodeB][1] = gen1Y;
    }
    this.draw();
  }


  highlightNode(node: DisplayNode | typeof UNSET) : void {
    if (node !== this.highlightedNode) {
      this.highlightedNode = node;
      this.draw();
    }
  }


}