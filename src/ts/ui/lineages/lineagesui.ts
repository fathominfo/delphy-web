import { Mutation, SummaryTree } from '../../pythia/delphy_api';
import { Pythia } from '../../pythia/pythia';
import { MutationDistribution } from '../../pythia/mutationdistribution';
import { MccUI } from '../mccui';
import { TreeCanvas } from '../treecanvas';
import { CHART_TEXT_FONT, DataResolveType, DisplayNode, Screens,
  TREE_PADDING_BOTTOM,
  TREE_PADDING_LEFT,
  TREE_PADDING_RIGHT,
  TREE_TEXT_LINE_SPACING, TREE_TEXT_TOP, TREE_PADDING_TOP, UNSET,
  getNodeColor, getNodeTypeName, getNodeClassName } from '../common';
import { SharedState } from '../../sharedstate';
import { NodePairType, NodePair, NodeComparisonData,
  NodeCallback, DismissCallback, NodeDisplay, getAncestorType, getDescendantType,
  NodeDistributionSeries,
  OpenMutationPageFncType} from './lineagescommon';
import { NodeListDisplay } from './nodelistdisplay';
import { NodeTimelines } from './nodetimelines';
import { NodeMutations } from './nodepairmutations';
import { NodePrevalenceChart } from './nodeprevalencechart';
import { isTip } from '../../util/treeutils';
import autocomplete from 'autocompleter';
import { PdfCanvas } from '../../util/pdfcanvas';
import { FieldTipCount, NodeMetadata } from '../nodemetadata';
import { NodeComparisonChartData } from './nodecomparisonchartdata';
import { NodeSchematic } from './nodeschematic';


type KeyEventHandler = (event: KeyboardEvent)=>void;


// const HOVER_COLOR = 'rgb(0, 70, 148)';

const AC_SUGGESTION_TEMPLATE = document.querySelector(".autocomplete-suggestion") as HTMLElement;
AC_SUGGESTION_TEMPLATE.remove();


const CLICK_TIME = 300;
const DRAG_DIST = 15;
const DRAG_DIST_2 = DRAG_DIST * DRAG_DIST;
// const SCROLLBAR_W = 10;

const enum TreeHint {
  Hover,

  HoverRoot,
  HoverMrca,
  HoverNodeA,
  HoverNodeBDescendant,
  HoverNodeBCousin,

  PreviewNodeA,
  PreviewNodeBDescendant,
  PreviewNodeBCousin,

  MaxSelections,

  Zoom
}

const TREE_HINT_CLASSES = [
  "hover",

  "hover-root",
  "hover-mrca",
  "hover-node-a",
  "hover-nodeB-descendant",
  "hover-nodeB-cousin",

  "preview-nodeA",
  "preview-nodeB-descendant",
  "preview-nodeB-cousin",

  "max-selections",

  "zoom"
]

export class LineagesUI extends MccUI {
  nodeAIndex = UNSET;
  nodeBIndex = UNSET;
  mrcaIndex = UNSET;
  rootIndex = UNSET;

  nodeChildCount: number[];

  maxVal = 0;


  // nodeRelationChart: NodeRelationChart;
  nodeSchematic: NodeSchematic;
  nodeListDisplay: NodeListDisplay;
  nodeComparisonData: NodeComparisonChartData[];
  nodeTimelines: NodeTimelines;
  nodeMutationCharts: NodeMutations;


  highlightNode: DisplayNode | typeof UNSET;

  canvasDownHandler: (event:MouseEvent)=>void; // eslint-disable-line no-unused-vars
  canvasMoveHandler: (event:MouseEvent)=>void; // eslint-disable-line no-unused-vars
  canvasLeaveHandler: ()=>void;
  keyupHandler: KeyEventHandler;

  nodeHighlightCallback: NodeCallback;

  prevMcc: SummaryTree | null;

  nodePrevalenceCanvas: NodePrevalenceChart;

  currentHover: number;
  selectable: boolean;

  constrainHoverByCredibility: boolean;

  treeHints: HTMLElement[];

  resetZoomButton: HTMLButtonElement;


  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector, "#lineages--mcc-canvas");
    const dismissCallback: DismissCallback = node=>this.handleNodeDismiss(node);
    const nodeZoomCallback: NodeCallback = node=>this.handleNodeZoom(node);
    const nodeHighlightCallback: NodeCallback = node=>this.handleNodeHighlight(node);
    // this.nodeRelationChart = new NodeRelationChart(nodeHighlightCallback);
    this.nodeSchematic = new NodeSchematic(nodeHighlightCallback);
    this.nodeListDisplay = new NodeListDisplay(dismissCallback, nodeHighlightCallback, nodeZoomCallback);
    this.nodeComparisonData = []

    this.nodeMutationCharts = new NodeMutations( this.goToMutations, nodeHighlightCallback);
    this.constrainHoverByCredibility = false;
    {
      let startTime = 0,
        startX = UNSET,
        startY = UNSET,
        selectionX = UNSET,
        selectionY = UNSET,
        dragging = false,
        dragged = false,
        canvas: HTMLCanvasElement | PdfCanvas;
      const drawSelection = ()=>{
        const ctx = this.highlightCtx,
          treeCanvas = this.mccTreeCanvas;
        ctx.clearRect(0, 0, treeCanvas.width, treeCanvas.height);
        ctx.fillStyle = 'rgba(240,240,240,0.8)';
        ctx.fillRect(0, 0, treeCanvas.width, treeCanvas.height);
        ctx.clearRect(startX, startY, selectionX - startX, selectionY - startY);
        this.drawHighlightNode(this.rootIndex, DisplayNode.root, ctx, treeCanvas);
        this.drawHighlightNode(this.mrcaIndex, DisplayNode.mrca, ctx, treeCanvas);
        this.drawHighlightNode(this.nodeAIndex, DisplayNode.nodeA, ctx, treeCanvas);
        this.drawHighlightNode(this.nodeBIndex, DisplayNode.nodeB, ctx, treeCanvas);
        ctx.fillStyle = "rgb(84,84,84)";
        ctx.textBaseline = "top";
        ctx.font = CHART_TEXT_FONT;
        ctx.fillText("Zoom to selection", startX, Math.max(startY, selectionY) + 3);
      }
      this.canvasDownHandler = (event: MouseEvent)=>{
        canvas = this.mccTreeCanvas.getCanvas();
        event.preventDefault();
        lookupInput.blur();
        if (!(canvas instanceof HTMLCanvasElement)) return;

        startTime = Date.now();
        dragging = true;
        dragged = false;
        startX = event.offsetX;
        startY = event.offsetY;
        // this.sharedState.mccConfig.startDrag();
        canvas.addEventListener('pointerup', canvasUpHandler);
        canvas.setPointerCapture((event as PointerEvent).pointerId);
      };
      this.canvasMoveHandler = (event: MouseEvent)=>{
        if (!dragging) {
          this.hoverCallback(event);
          return;
        }

        const dx = event.offsetX - startX,
          dy = event.offsetY - startY,
          d2 = dx * dx + dy * dy;
        if (d2 > DRAG_DIST_2) {
          dragged = true;
        }
        if (dragged) {
          selectionX = event.offsetX;
          selectionY = event.offsetY;
          drawSelection();
          this.setHint(TreeHint.Zoom);
          this.mccTreeCanvas.setNoding(false, false);
        }
      };
      const canvasUpHandler = (event: MouseEvent)=>{
        if (canvas instanceof HTMLCanvasElement) {
          dragging = false;
          canvas.removeEventListener('pointerup', canvasUpHandler);
          if (dragged) {
            const left = TREE_PADDING_LEFT,
              right = this.mccTreeCanvas.width - TREE_PADDING_RIGHT,
              top = TREE_PADDING_TOP,
              bottom = this.mccTreeCanvas.height - TREE_PADDING_BOTTOM,
              height = bottom - top,
              width = right - left;
            startX = Math.min(right, Math.max(left, startX));
            startY = Math.min(bottom, Math.max(top, startY));
            selectionX = Math.min(right, Math.max(left, selectionX));
            selectionY = Math.min(bottom, Math.max(top, selectionY));
            const h = Math.abs(selectionY - startY),
              w = Math.abs(selectionX - startX),
              vZoom = height / h * this.mccTreeCanvas.verticalZoom,
              hZoom = width / w * this.mccTreeCanvas.horizontalZoom,
              cy = ((selectionY + startY) / 2 - TREE_PADDING_TOP) / height,
              cx = 1 - ((selectionX + startX) / 2 - TREE_PADDING_LEFT) / width,
              zY = this.mccTreeCanvas.zoomCenterY + (cy - 0.5) / this.mccTreeCanvas.verticalZoom,
              zX = this.mccTreeCanvas.zoomCenterX + (cx - 0.5) / this.mccTreeCanvas.horizontalZoom;
            this.sharedState.mccConfig.setZoom(hZoom, vZoom, zX, zY);
          } else if (Date.now() - startTime < CLICK_TIME) {
            const nodeIndex:number = this.mccTreeCanvas.getNodeAt(startX, startY);
            if (!this.constrainHoverByCredibility || this.mccTreeCanvas.creds[nodeIndex] >= this.sharedState.mccConfig.confidenceThreshold) {
              this.selectNode(nodeIndex);
            }
          }
          canvas.releasePointerCapture((event as PointerEvent).pointerId);
        }
      };
      this.canvasLeaveHandler = ()=>{
        this.exitCallback();
        if (this.selectable) {
          this.setHint(TreeHint.Hover);
        } else {
          this.setHint(TreeHint.MaxSelections);
        }
      }
      this.keyupHandler = (event: KeyboardEvent)=>{
        if (dragging && event.key === 'Escape') {
          dragging = false;
          dragged = false;
          this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
        }
      };
    }

    this.nodeTimelines = new NodeTimelines(nodeHighlightCallback);
    this.nodeChildCount = [];
    this.prevMcc = null;
    this.highlightNode = UNSET;
    this.nodeHighlightCallback = nodeHighlightCallback;

    this.nodePrevalenceCanvas = new NodePrevalenceChart(nodeHighlightCallback);
    this.currentHover = UNSET;
    this.selectable = true;

    this.treeHints = Array.from(this.div.querySelectorAll(".tree-hint") as NodeListOf<HTMLElement>);

    this.resetZoomButton = this.div.querySelector(".mcc-zoom-button.reset") as HTMLButtonElement;

    const lookupForm = document.querySelector(".id-lookup form") as HTMLFormElement;
    lookupForm.addEventListener("submit", e => e.preventDefault());

    const constrainHoverByCredibilityInput = document.querySelector("#lineages--constrain-selection") as HTMLInputElement;
    constrainHoverByCredibilityInput.addEventListener('change', ()=>{
      this.constrainHoverByCredibility = constrainHoverByCredibilityInput.checked;
    });

    const lookupInput = document.querySelector(".id-lookup--input") as HTMLInputElement;
    autocomplete({
      input: lookupInput,
      emptyMsg: "No sequences found",
      minLength: 1,
      fetch: (text, update) => {
        text = text.toLowerCase();
        let suggestions: {label: string, value: string}[] = [];
        const allIds = sharedState.getTipIds();
        const selectedIds = [this.nodeAIndex, this.nodeBIndex].map(index => {
          if (index === UNSET) return null;
          const metadata = sharedState.mccConfig.nodeMetadata?.getNodeMetadata(index);
          if (!metadata) return null;
          const id = metadata.id?.value;
          if (!id) return null;
          return id;
        });
        if (allIds) {
          suggestions = allIds.filter(id => {
            return id.toLowerCase().includes(text);
          })
            .filter(id => !selectedIds.includes(id))
            .map(id => {
              return {
                label: id,
                value: id
              }
            });
        }
        update(suggestions);
      },
      render: (item) => {
        const el = AC_SUGGESTION_TEMPLATE.cloneNode(true) as HTMLDivElement;
        if (item.label) {
          el.innerText = item.label;
        }
        return el;
      },
      onSelect: (item) => {
        if (item.label) {
          lookupInput.value = item.label;
          const nodeIndex = this.sharedState.getTipIndexFromId(item.label);
          if (nodeIndex !== undefined && nodeIndex !== UNSET) {
            this.selectNode(nodeIndex);
          }
          lookupInput.value = "";
        }
      },
      preventSubmit: true
    });
  }


  activate() {
    super.activate();
    const {minDate, maxDate} = this.mccTreeCanvas;
    this.nodeTimelines.setDateRange(minDate, maxDate);

    const canvas = this.mccTreeCanvas.getCanvas();
    if (canvas instanceof HTMLCanvasElement) {
      canvas.addEventListener('pointerdown', this.canvasDownHandler);
      canvas.addEventListener('pointermove', this.canvasMoveHandler);
      canvas.addEventListener('pointerleave', this.canvasLeaveHandler);
      document.addEventListener('keyup', this.keyupHandler);
    }
  }

  deactivate() {
    super.deactivate();
    const canvas = this.mccTreeCanvas.getCanvas();
    if (canvas instanceof HTMLCanvasElement) {
      canvas.removeEventListener('pointerdown', this.canvasDownHandler);
      canvas.removeEventListener('pointermove', this.canvasMoveHandler);
      canvas.removeEventListener('pointerleave', this.canvasLeaveHandler);
      document.removeEventListener('keyup', this.keyupHandler);
    }
    const nodes = [ this.nodeAIndex, this.nodeBIndex].filter(n=>n!==UNSET);
    if (nodes.length > 0) {
      this.sharedState.setNodeSelection(nodes);
    }
  }


  resize(): void {
    super.resize();
    this.nodeMutationCharts.resize();
    this.nodeTimelines.resize();
    this.nodePrevalenceCanvas.resize();
    this.nodePrevalenceCanvas.requestDraw();
  }




  handleConfigChange(): void {
    super.handleConfigChange();
    this.updateNodeData();
  }


  protected updateData(): Promise<SummaryTree> {
    const prom = new Promise((resolve: DataResolveType)=>{
      super.updateData()
        .then((summary:SummaryTree)=>{
          this.updateNodeData();
          this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
          this.requestDrawNodeRelationChart();
          resolve(summary);
        })
    });
    return prom;
  }

  private updateNodeData() : void {
    if (this.pythia) {
      const mccRef = this.pythia.getMcc(),
        summaryTree = this.mccTreeCanvas.tree as SummaryTree;
      if (summaryTree !== this.prevMcc) {
        const rootIndex = summaryTree.getRootIndex(),
          nodeCount = summaryTree.getSize(),
          childCounts = new Array(nodeCount),
          rootConfidence = this.mccTreeCanvas.creds[rootIndex];
        childCounts.fill(0);
        for (let i = 0; i < nodeCount; i++) {
          if (isTip(summaryTree,i)) {
            /* this is a tip */
            let ii = i;
            while (ii !== UNSET) {
              childCounts[ii]++;
              ii = summaryTree.getParentIndexOf(ii);
            }
          }
        }
        this.rootIndex = rootIndex;
        this.nodeAIndex = UNSET;
        this.nodeBIndex = UNSET;
        this.mrcaIndex = UNSET;
        if (this.sharedState.nodeList.length > 0) {
          this.nodeAIndex = this.sharedState.nodeList[0];
          if (this.sharedState.nodeList.length > 1) {
            this.nodeBIndex = this.sharedState.nodeList[1];
            this.mrcaIndex = this.checkMRCA(this.nodeAIndex, this.nodeBIndex);
          }
        }
        this.nodeChildCount = childCounts;
        this.nodeListDisplay.setRoot(rootConfidence, this.nodeChildCount[rootIndex], this.sharedState.mccConfig.nodeMetadata?.getNodeMetadata(rootIndex), rootIndex);
        this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
        this.requestDrawNodeRelationChart();
        this.setChartData(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);

      }
      mccRef.release();
    }
  }



  hoverCallback(event:MouseEvent):void {
    const rootIndex = this.rootIndex;
    let mrcaIndex = this.mrcaIndex,
      nodeAIndex = this.nodeAIndex,
      nodeBIndex = this.nodeBIndex;

    const nodeIndex:number = this.mccTreeCanvas.getNodeAt(event.offsetX, event.offsetY);

    if (this.constrainHoverByCredibility) {
      // if lower than threshold, don't do anything
      if (this.mccTreeCanvas.creds[nodeIndex] < this.sharedState.mccConfig.confidenceThreshold) {
        return;
      }
    }

    if (nodeIndex === this.currentHover) {
      // already hovering
      const onNode = nodeIndex !== UNSET;
      const onExistingNode = onNode && (nodeIndex === rootIndex || nodeIndex === mrcaIndex || nodeIndex === nodeAIndex || nodeIndex === nodeBIndex);

      const isNoding = (this.selectable && onNode) || (!this.selectable && onExistingNode);
      const isSelectable = this.selectable && !onExistingNode;

      this.mccTreeCanvas.setNoding(isNoding, isSelectable);

      return;
    }

    this.currentHover = nodeIndex;
    let displayNode: DisplayNode = DisplayNode.UNSET;
    if (nodeIndex === UNSET) {
      /* if hovering didn't result in a new node, then clear the hover */
      this.exitCallback();
      this.setHint(TreeHint.Zoom);
    } else if (nodeIndex === rootIndex || nodeIndex === mrcaIndex || nodeIndex === nodeAIndex || nodeIndex === nodeBIndex) {
      /* new hover on existing node */
      this.requestDrawHighlights(rootIndex, mrcaIndex, nodeAIndex, nodeBIndex, nodeIndex);
      switch (nodeIndex) {
      case rootIndex: {
        displayNode = DisplayNode.root;
        this.setHint(TreeHint.HoverRoot);
        break;
      }
      case mrcaIndex: {
        displayNode = DisplayNode.mrca;
        this.setHint(TreeHint.HoverMrca);
        break;
      }
      case nodeAIndex: {
        displayNode = DisplayNode.nodeA;
        this.setHint(TreeHint.HoverNodeA);
        break;
      }
      case nodeBIndex: {
        displayNode = DisplayNode.nodeB;
        if (mrcaIndex === UNSET) {
          this.setHint(TreeHint.HoverNodeBDescendant);
        } else {
          this.setHint(TreeHint.HoverNodeBCousin);
        }
        break;
      }
      default: break;
      }
      this.handleNodeHighlight(displayNode);
      this.setChartData(this.rootIndex, mrcaIndex, nodeAIndex, nodeBIndex);
    } else if (nodeAIndex !== UNSET && nodeBIndex !== UNSET ) {
      /* if both the settable nodes are locked, then skip */
      this.exitCallback();
      this.setHint(TreeHint.Zoom);
    } else {
      if (nodeAIndex === UNSET && nodeIndex !== nodeBIndex) {
        /* selecting node 1 */
        nodeAIndex = nodeIndex;
        displayNode = DisplayNode.nodeA;
        if (nodeBIndex !== UNSET) {
          mrcaIndex = this.checkMRCA(nodeAIndex, nodeBIndex);
        }
        this.setHint(TreeHint.PreviewNodeA);
      } else if (nodeBIndex === UNSET && nodeIndex !== nodeAIndex) {
        /* selecting node 2 */
        nodeBIndex = nodeIndex;
        mrcaIndex = this.checkMRCA(nodeAIndex, nodeBIndex);
        displayNode = DisplayNode.nodeB;
        if (mrcaIndex === UNSET) {
          this.setHint(TreeHint.PreviewNodeBDescendant);
        } else {
          this.setHint(TreeHint.PreviewNodeBCousin);
        }
      }
      this.requestDrawHighlights(this.rootIndex, mrcaIndex, nodeAIndex, nodeBIndex, nodeIndex);
      this.requestDrawNodeRelationChart();
      this.setChartData(this.rootIndex, mrcaIndex, nodeAIndex, nodeBIndex);
    }

    this.nodeListDisplay.highlightNode(displayNode);
    this.nodeSchematic.highlightNode(displayNode);
    // this.nodeRelationChart.highlightNode(displayNode);
    this.nodePrevalenceCanvas.highlightNode(displayNode);
    this.nodeMutationCharts.highlightNode(displayNode);
    this.nodeTimelines.highlightNode(displayNode);
  }


  selectNode(nodeIndex: number): void {
    if (nodeIndex === this.nodeAIndex || nodeIndex === this.nodeBIndex) {
      /* clicking on an already selected node */
      return;
    }

    if (this.nodeAIndex === UNSET) {
      this.nodeAIndex = nodeIndex;
      this.setHint(TreeHint.HoverNodeA);
    } else if (this.nodeBIndex === UNSET) {
      this.nodeBIndex = nodeIndex;
    }

    if (this.nodeAIndex !== UNSET && this.nodeBIndex !== UNSET) {
      this.mrcaIndex = this.checkMRCA(this.nodeAIndex, this.nodeBIndex);
      this.setSelectable(false);
      if (nodeIndex === this.nodeBIndex) {
        if (this.mrcaIndex === UNSET) {
          this.setHint(TreeHint.HoverNodeBDescendant);
        } else {
          this.setHint(TreeHint.HoverNodeBCousin);
        }
      }
    } else {
      this.setSelectable(true);
    }

    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex, nodeIndex);
    this.requestDrawNodeRelationChart();
    this.setChartData(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
  }

  getMRCA(index1: number, index2: number): number {
    /* check for a common ancestor that is not root */
    let mrcaIndex = UNSET;
    const mcc = this.mccTreeCanvas.tree as SummaryTree,
      root = mcc.getRootIndex();
    let i1 = index1,
      i2 = index2,
      steps = 0;
    while (i1 !== i2 && i1 !== root && i2 !== root) {
      /*
      the mrca will always have more tips
      so if we aren't matched yet, then take the
      parent of the node that has fewer tips.
      */
      const size1 = this.nodeChildCount[i1],
        size2 = this.nodeChildCount[i2];
      if (size1 < size2) {
        i1 = mcc.getParentIndexOf(i1);
      } else {
        i2 = mcc.getParentIndexOf(i2);
      }
      steps++;
      if (steps >= 1000) {
        console.warn(`we had a problem on ${index1} and ${index2}, setting mrca to root`)
        mrcaIndex = root;
        break;
      }
    }
    if (i1 === i2) {
      mrcaIndex = i1;
    } else if (i1 === root || i2 === root) {
      mrcaIndex = root;
    }
    return mrcaIndex;
  }


  checkMRCA(index1: number, index2: number): number {
    const mrca = this.getMRCA(index1, index2);
    if (mrca === this.rootIndex || mrca === index1 || mrca === index2) {
      return UNSET;
    }
    return mrca;
  }

  exitCallback():void {
    this.handleNodeHighlight(UNSET);
    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
    this.setChartData(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
  }


  setChartData(rootIndex:number, mrcaIndex:number, nodeAIndex:number, nodeBIndex:number): void {
    const pythia = this.pythia
    if (pythia) {

      const mccRef = pythia.getMcc(),
        nodePairs: NodeComparisonData[] = [],
        minDate = pythia.getBaseTreeMinDate(),
        maxDate = pythia.maxDate,
        nodeConfidence = this.mccTreeCanvas.creds,
        summaryTree = this.mccTreeCanvas.tree as SummaryTree,
        nodeMetadata = this.sharedState.mccConfig.nodeMetadata,
        tipIds = this.sharedState.getTipIds();
      let nodes: NodeDisplay[] = [rootIndex, mrcaIndex, nodeAIndex, nodeBIndex].map(getNodeDisplay);
      nodes.forEach(node=>{
        if (node.index >= 0) {
          node.times = pythia.getNodeTimeDistribution(node.index, summaryTree);
          node.series = new NodeDistributionSeries(node.type, node.times, node.className, node.color);
        }
      });
      if (nodeAIndex === UNSET && nodeBIndex === UNSET) {
        /* we clear all but the root node */
        this.nodeListDisplay.clearNodeA();
        this.nodeListDisplay.clearNodeB();
        this.nodeListDisplay.clearMRCA();
        const nodePair = this.assembleNodePair(rootIndex, UNSET, NodePairType.rootOnly, pythia),
          upperNodeTimes = nodes[DisplayNode.root].times,
          lowerNodeTimes: number[] = [],
          overlapCount = 0;
        nodePairs.push({ nodePair, upperNodeTimes, lowerNodeTimes, overlapCount});
        this.setSelectable(true);
      } else {
        let nodePair: NodePair,
          upperNodeTimes: number[],
          lowerNodeTimes: number[];
        const nodeALocked = nodeAIndex === this.nodeAIndex,
          nodeBLocked = nodeBIndex === this.nodeBIndex,
          overlapCount = 0;
        if (mrcaIndex === UNSET) {
          /* if there is no mrca, then we connect the root directly to the other nodes */
          if (nodeAIndex === UNSET) {
            this.nodeListDisplay.clearNodeA();
            if (nodeBIndex !== UNSET) {
              this.nodeListDisplay.setNodeB(nodeConfidence[nodeBIndex], this.nodeChildCount[nodeBIndex], nodeBLocked, getNodeMetadata(nodeBIndex, nodeMetadata, tipIds), nodeBIndex);
              nodePair = this.assembleNodePair(rootIndex, nodeBIndex, NodePairType.rootToNodeB, pythia);
              upperNodeTimes = nodes[DisplayNode.root].times;
              lowerNodeTimes = nodes[DisplayNode.nodeB].times;
              nodePairs.push({nodePair, upperNodeTimes, lowerNodeTimes, overlapCount });
            } else {
              this.nodeListDisplay.clearNodeB();
            }
            this.setSelectable(true);
          } else if (nodeBIndex === UNSET || nodeBIndex === nodeAIndex) {
            /* we have node 1 without node 2 */
            this.nodeListDisplay.setNodeA(nodeConfidence[nodeAIndex], this.nodeChildCount[nodeAIndex], nodeALocked, getNodeMetadata(nodeAIndex, nodeMetadata, tipIds), nodeAIndex);
            nodePair = this.assembleNodePair(rootIndex, nodeAIndex, NodePairType.rootToNodeA, pythia);
            upperNodeTimes = nodes[DisplayNode.root].times;
            lowerNodeTimes = nodes[DisplayNode.nodeA].times;
            nodePairs.push({nodePair, upperNodeTimes, lowerNodeTimes, overlapCount });
            this.nodeListDisplay.clearNodeB();
            this.setSelectable(true);
          } else {
            /*
              we have both node 1 and node 2, but no mrca.
              this could mean both are descended from root,
              or one is descended from the other.
              We know we have two pairs, and in the first one
              the ancestor node is root. So the questions are:
                in the second pair, is the ancestor node root, nodeA, or nodeB?
                  this

              */
            const mrca = this.getMRCA(nodeAIndex, nodeBIndex),
              ancestor1: DisplayNode = DisplayNode.root,
              ancestor1Index = rootIndex;
            let ancestor2: DisplayNode = DisplayNode.root,
              descendant1: DisplayNode = DisplayNode.root,
              descendant2: DisplayNode = DisplayNode.root,
              ancestor2Index = rootIndex,
              descendant1Index = rootIndex,
              descendant2Index = rootIndex,
              pair1: NodePairType = NodePairType.rootToNodeA,
              pair2: NodePairType = NodePairType.rootToNodeB;

            if (mrca === rootIndex) {
              pair1 = NodePairType.rootToNodeA;
              descendant1 = DisplayNode.nodeA;
              descendant1Index = nodeAIndex;
              pair2 = NodePairType.rootToNodeB;
              descendant2 = DisplayNode.nodeB;
              descendant2Index = nodeBIndex;
            } else if (mrca === nodeAIndex) {
              pair1 = NodePairType.rootToNodeA;
              descendant1 = DisplayNode.nodeA;
              descendant1Index = nodeAIndex;
              pair2 = NodePairType.nodeAToNodeB;
              ancestor2 = DisplayNode.nodeA;
              ancestor2Index = nodeAIndex;
              descendant2 = DisplayNode.nodeB;
              descendant2Index = nodeBIndex;
            } else if (mrca === nodeBIndex) {
              pair1 = NodePairType.rootToNodeB;
              descendant1 = DisplayNode.nodeB;
              descendant1Index = nodeBIndex;
              pair2 = NodePairType.nodeBToNodeA;
              ancestor2 = DisplayNode.nodeB;
              ancestor2Index = nodeBIndex;
              descendant2 = DisplayNode.nodeA;
              descendant2Index = nodeAIndex;
            } else {
              console.warn("need to revisit how node pairs are made");
            }

            this.nodeListDisplay.setNodeA(nodeConfidence[nodeAIndex], this.nodeChildCount[nodeAIndex], nodeALocked, getNodeMetadata(nodeAIndex, nodeMetadata, tipIds), nodeAIndex);
            this.nodeListDisplay.setNodeB(nodeConfidence[nodeBIndex], this.nodeChildCount[nodeBIndex], nodeBLocked, getNodeMetadata(nodeBIndex, nodeMetadata, tipIds), nodeBIndex);

            nodePair = this.assembleNodePair(ancestor1Index, descendant1Index, pair1, pythia);
            upperNodeTimes = nodes[ancestor1].times;
            lowerNodeTimes = nodes[descendant1].times;
            nodePairs.push({nodePair, upperNodeTimes, lowerNodeTimes, overlapCount });

            nodePair = this.assembleNodePair(ancestor2Index, descendant2Index, pair2, pythia);
            upperNodeTimes = nodes[ancestor2].times;
            lowerNodeTimes = nodes[descendant2].times;
            nodePairs.push({nodePair, upperNodeTimes, lowerNodeTimes, overlapCount });
            // this.disableSelections();
          }
          this.nodeListDisplay.clearMRCA();
        } else {
          this.nodeListDisplay.setNodeA(nodeConfidence[nodeAIndex], this.nodeChildCount[nodeAIndex], nodeALocked, getNodeMetadata(nodeAIndex, nodeMetadata, tipIds), nodeAIndex);
          this.nodeListDisplay.setNodeB(nodeConfidence[nodeBIndex], this.nodeChildCount[nodeBIndex], nodeBLocked, getNodeMetadata(nodeBIndex, nodeMetadata, tipIds), nodeBIndex);
          this.nodeListDisplay.setMRCA(nodeConfidence[mrcaIndex], this.nodeChildCount[mrcaIndex], false, getNodeMetadata(mrcaIndex, nodeMetadata, tipIds), mrcaIndex);
          nodePair = this.assembleNodePair(rootIndex, mrcaIndex, NodePairType.rootToMrca, pythia);
          upperNodeTimes = nodes[DisplayNode.root].times;
          lowerNodeTimes = nodes[DisplayNode.mrca].times;
          nodePairs.push({nodePair, upperNodeTimes, lowerNodeTimes, overlapCount });
          upperNodeTimes = lowerNodeTimes;
          nodePair = this.assembleNodePair(mrcaIndex, nodeAIndex, NodePairType.mrcaToNodeA, pythia);
          lowerNodeTimes = nodes[DisplayNode.nodeA].times;
          nodePairs.push({nodePair, upperNodeTimes, lowerNodeTimes, overlapCount });
          nodePair = this.assembleNodePair(mrcaIndex, nodeBIndex, NodePairType.mrcaToNodeB, pythia);
          lowerNodeTimes = nodes[DisplayNode.nodeB].times;
          nodePairs.push({nodePair, upperNodeTimes, lowerNodeTimes, overlapCount });
          // this.disableSelections();
        }
      }

      nodes = nodes.filter(({index})=>index>=0);
      const nodeIndices = nodes.map(({index})=>index),
        nodePrevalenceData = pythia.getPopulationNodeDistribution(nodeIndices, minDate, maxDate, summaryTree),
        nodeDistributions = nodePrevalenceData.series,
        overlap = nodePrevalenceData.overlap;


      /*
      The list `nodes` has an indicator of whether the node in question is Root, MRCA, Selection A or B.
      The `overlap` list was built from a list that does not have that information, and where unset
      nodes were removed. The `index1` and `index2` attributes of each item in the `overlap` list reference index
      positions of the nodes list. Combine them now in order to find which node pair `index1` and `index2` are referring to,
      then track the overlap on the NodeComparisonData item.
      */
      overlap.forEach(oItem=>{
        const nodeAType = nodes[oItem.index1].type,
          nodeBType = nodes[oItem.index2].type;
        nodePairs.forEach((ncd:NodeComparisonData)=>{
          const pairType = ncd.nodePair.pairType,
            na = getAncestorType(pairType),
            nb = getDescendantType(pairType);
          if (na === nodeAType && nb === nodeBType) {
            ncd.overlapCount = oItem.count;
          }
        });
      });


      // let [zoomMinDate, zoomMaxDate] = this.mccTreeCanvas.getDateRange(); // eslint-disable-line prefer-const
      // console.log('dates', minDate, maxDate, zoomMinDate, zoomMaxDate);
      // const zoomDateRange = zoomMaxDate - zoomMinDate;
      // zoomMinDate += Math.round(PREVALENCE_PCT_DAYS * zoomDateRange);
      this.nodeComparisonData = nodePairs.map(np=>new NodeComparisonChartData(np, minDate, maxDate, this.isApobecEnabled));
      this.nodeTimelines.setData(nodes);
      this.nodeTimelines.setDateRange(minDate, maxDate);
      this.nodeMutationCharts.setData(this.nodeComparisonData);
      const nodeAIsUpper = this.mccTreeCanvas.getZoomY(nodeAIndex) < this.mccTreeCanvas.getZoomY(nodeBIndex);
      this.nodeSchematic.setData(nodePairs, [rootIndex, mrcaIndex, nodeAIndex, nodeBIndex], nodeAIsUpper);
      /* we want the default distribution to come first, so take it off the end and put it first */
      nodeDistributions.forEach(treeSeries=>treeSeries.unshift(treeSeries.pop() as number[]));
      this.nodeListDisplay.setPrevalenceData(nodePrevalenceData, nodes, minDate, maxDate);

      /*
      add an empty node before the root to represent the uninfected population
      in the prevalence chart
      */
      const prevalenceNodes = nodes.slice(0);
      prevalenceNodes.unshift({ index: UNSET, color: 'rgb(240,240,240)', label: 'other', type: DisplayNode.UNSET, className: "", times: [], series: null });

      this.nodePrevalenceCanvas.setData(nodeDistributions, prevalenceNodes, minDate, maxDate);
      this.nodePrevalenceCanvas.requestDraw();

      mccRef.release();
    }
  }

  setSelectable(selectable: boolean) {
    this.selectable = selectable;
    const lookupInput = document.querySelector(".id-lookup--input") as HTMLInputElement;
    lookupInput.disabled = !selectable;
    // lookupInput.placeholder = selectable ? "Lookup a sequence id…" : "deselect a node below to enable search";
    // more hints...
  }

  setHint(hint: TreeHint) {
    const className = TREE_HINT_CLASSES[hint];
    this.treeHints.forEach(th => th.classList.toggle("hidden", !th.classList.contains(className)));
  }

  assembleNodePair(index1: number, index2: number, nodePairType: NodePairType, pythia: Pythia): NodePair {
    const tree = this.mccTreeCanvas.tree as SummaryTree,
      mutTimes : MutationDistribution[] = pythia.getMccMutationsBetween(index1, index2, tree);
    return new NodePair(index1, index2, nodePairType, mutTimes);
  }


  handleNodeDismiss(node:DisplayNode): void {
    switch (node) {
    case DisplayNode.nodeA: {
      this.nodeAIndex = UNSET;
      this.mrcaIndex = UNSET;
      this.nodeListDisplay.clearNodeA();
      this.nodeListDisplay.clearMRCA();

      if (this.nodeBIndex !== UNSET) {
        this.nodeAIndex = this.nodeBIndex;
        this.nodeBIndex = UNSET;
        this.nodeListDisplay.clearNodeB();
      }
    }
      break;
    case DisplayNode.nodeB: {
      this.nodeBIndex = UNSET;
      this.mrcaIndex = UNSET;
      this.nodeListDisplay.clearNodeB();
      this.nodeListDisplay.clearMRCA();
    }
      break;
    }

    this.mccTreeCanvas.setFade(false);
    super.requestTreeDraw();

    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
    this.setChartData(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);

    this.nodeListDisplay.highlightNode(UNSET);
    // this.nodeRelationChart.highlightNode(UNSET);
    this.nodeSchematic.highlightNode(UNSET);
    this.nodePrevalenceCanvas.highlightNode(UNSET);
    this.nodeMutationCharts.highlightNode(UNSET);
    this.nodeTimelines.highlightNode(UNSET);

    this.setHint(TreeHint.Hover);
  }

  handleNodeZoom(node: DisplayNode | typeof UNSET) : void {
    let zoomNode = UNSET;

    switch (node) {
    case DisplayNode.mrca:
      zoomNode = this.mrcaIndex;
      break;
    case DisplayNode.nodeA:
      zoomNode = this.nodeAIndex;
      break;
    case DisplayNode.nodeB:
      zoomNode = this.nodeBIndex;
      break;
    }
    if (zoomNode === UNSET) {
      this.mccTreeCanvas.resetZoom();
      this.sharedState.mccConfig.resetZoom();
    } else if (this.pythia) {
      const tips = this.pythia.getMccNodeTips(zoomNode),
        treeCanvas = this.mccTreeCanvas;
      treeCanvas.zoomToTips(tips);
      this.sharedState.mccConfig.setZoom(1, treeCanvas.verticalZoom, 0.5, treeCanvas.zoomCenterY);
    }
    super.requestTreeDraw();
    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
    // this.nodeRelationChart.highlightNode(node);
    this.nodeSchematic.highlightNode(node);
  }

  handleNodeHighlight(node: DisplayNode | typeof UNSET) : void {
    // console.log(`handleNodeHighlight(${node})`);
    if (node === this.highlightNode) {
      // no need to check again
      return;
    }
    this.highlightNode = node;

    /*
    for the tree, push back most of the tree,
    and draw the highlighted subtree on the highlight canvas
    */
    this.mccTreeCanvas.setFade(node !== UNSET);
    super.requestTreeDraw();
    let subtreeIndex = UNSET;
    switch(node) {
    case DisplayNode.root: {
      subtreeIndex = this.rootIndex;
      this.setHint(TreeHint.HoverRoot);
    }
      break;
    case DisplayNode.mrca: {
      subtreeIndex = this.mrcaIndex;
      this.setHint(TreeHint.HoverMrca);
    }
      break;
    case DisplayNode.nodeA: {
      subtreeIndex = this.nodeAIndex;
      this.setHint(TreeHint.HoverNodeA);
    }
      break;
    case DisplayNode.nodeB: {
      subtreeIndex = this.nodeBIndex;
      if (this.nodeAIndex !== UNSET) {
        this.setHint(TreeHint.HoverNodeBDescendant);
      } else {
        this.setHint(TreeHint.HoverNodeBCousin);
      }
    }
      break;
    default: {
      if (this.nodeAIndex !== UNSET && this.nodeBIndex !== UNSET) {
        this.setHint(TreeHint.MaxSelections);
      } else {
        this.setHint(TreeHint.Hover);
      }
    }
      break;
    }
    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex, subtreeIndex);

    /* highlight node in other components */
    this.nodeListDisplay.highlightNode(node);
    this.nodePrevalenceCanvas.highlightNode(node);
    this.nodeSchematic.highlightNode(node);
    this.nodeTimelines.highlightNode(node);
    this.nodeMutationCharts.highlightNode(node);
  }


  /*
  need a means for the the mccconfig to invoke drawing
  the tree and the highlights when the zoom has changed.
  So we override the default request to draw the tree
  with a version that also draws the highlight nodes.
  */
  requestTreeDraw(): void {
    super.requestTreeDraw();
    this.requestDrawHighlights(this.rootIndex, this.mrcaIndex, this.nodeAIndex, this.nodeBIndex);
  }




  private requestDrawHighlights(rootIndex:number, mrcaIndex:number, nodeAIndex:number, nodeBIndex:number, subtreeNode: number = UNSET) {
    requestAnimationFrame(()=>this.drawHighlights(rootIndex, mrcaIndex, nodeAIndex, nodeBIndex, subtreeNode));
  }

  private drawHighlights(rootIndex:number, mrcaIndex:number, nodeAIndex:number, nodeBIndex:number, subtreeNode: number):void {
    if (!this.pythia) return;

    const ctx = this.highlightCtx,
      treeCanvas = this.mccTreeCanvas,
      barTop = TREE_TEXT_TOP + TREE_TEXT_LINE_SPACING * 2;
    ctx.clearRect(0, 0, treeCanvas.width, treeCanvas.height);
    if (subtreeNode !== UNSET) {
      const color = subtreeNode === mrcaIndex ? getNodeColor(DisplayNode.mrca)
        : subtreeNode === nodeAIndex ? getNodeColor(DisplayNode.nodeA)
          : subtreeNode === nodeBIndex ? getNodeColor(DisplayNode.nodeB)
            // : HOVER_COLOR;
            : getNodeColor(DisplayNode.root);
      this.drawSubtree(subtreeNode, ctx, treeCanvas, color);

    }
    this.drawHighlightNode(rootIndex, DisplayNode.root, ctx, treeCanvas);
    this.drawHighlightNode(mrcaIndex, DisplayNode.mrca, ctx, treeCanvas);
    this.drawHighlightNode(nodeAIndex, DisplayNode.nodeA, ctx, treeCanvas);
    this.drawHighlightNode(nodeBIndex, DisplayNode.nodeB, ctx, treeCanvas);
    ctx.clearRect(0, 0, treeCanvas.width, barTop);
    // this.drawScrollBar();
  }

  private drawHighlightNode(index: number, displayNode: DisplayNode, ctx: CanvasRenderingContext2D, treeCanvas: TreeCanvas): void {
    if (index === UNSET) return;

    const mcc = treeCanvas.tree as SummaryTree,
      x = treeCanvas.getZoomX(mcc.getTimeOf(index)),
      y = treeCanvas.getZoomY(index),
      radius = 6,
      color = getNodeColor(displayNode);
    ctx.globalAlpha = this.highlightNode === UNSET || displayNode === this.highlightNode ? 1 : 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    ctx.moveTo(x + radius, y);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (index === this.rootIndex || index === this.mrcaIndex || color === getNodeColor(DisplayNode.mrca)) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      let alpha = 1.0;
      if ((displayNode === DisplayNode.nodeA && this.nodeAIndex === UNSET) ||
          (displayNode === DisplayNode.nodeB && this.nodeBIndex === UNSET)) {
        ctx.setLineDash([4, 2]);
        alpha = 0.5;
        ctx.lineWidth = 2;
      }
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
      ctx.stroke();
    }

    ctx.setLineDash([]);
  }

  drawSubtree(index: number, ctx: CanvasRenderingContext2D, treeCanvas: TreeCanvas, color: string) : void {
    ctx.fillStyle = color;
    ctx.lineWidth  = 0.75;
    ctx.strokeStyle = ctx.fillStyle;
    treeCanvas.drawSubtree(index, ctx);
  }


  private requestDrawNodeRelationChart() {
    requestAnimationFrame(() => this.nodeSchematic.draw());
  }

  goToMutations: OpenMutationPageFncType = (mutation?: Mutation) => {
    if (mutation) {
      this.sharedState.addMutation(mutation);
      this.sharedState.goTo(Screens.mutations);
    }
  }



}


const getNodeDisplay = (index: DisplayNode, dn: DisplayNode) => {
  return {
    index: index,
    color: getNodeColor(dn),
    label: getNodeTypeName(dn),
    type: dn,
    className: getNodeClassName(dn),
    times: [],
    series: null
  };
}


const getNodeMetadata = (nodeIndex:number, nodeMetadata: NodeMetadata | null, tipIds:string[])=>{
  let md = undefined;
  if (nodeMetadata) {
    md = nodeMetadata.getNodeMetadata(nodeIndex);
  } else if (nodeIndex < tipIds.length) {
    const value =  tipIds[nodeIndex],
      counts: FieldTipCount = {};
    counts[value] = 1;
    md = {id: {value, counts}};
  }
  return md;
}