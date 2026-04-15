import { Mutation, SummaryTree } from '../../pythia/delphy_api';
import { MccUI } from '../mccui';
import { DataResolveType, Screens, UNSET } from '../common';
import { SharedState } from '../../sharedstate';
import { HoverCallback, NodeCallback,
  OpenMutationPageFncType, TreeHint,  TREE_HINT_CLASSES } from './lineagescommon';
// import { NodeListDisplay } from './nodelistdisplay';
import { NodeTimelines } from './nodetimelines';
import autocomplete from 'autocompleter';
// import { PdfCanvas } from '../../util/pdfcanvas';
import { NodeSchematic } from './nodeschematic';
import { LineagesTreeCanvas } from './lineagestreecanvas';
import { ChartData, CoreLineagesData, updateFunction } from './corelineagesdata';
import { NodeDetails } from './nodedetails';
import { DisplayNode } from './displaynode';
import { NodeListDisplay } from './nodelistdisplay';



const AC_SUGGESTION_TEMPLATE = document.querySelector(".autocomplete-suggestion") as HTMLElement;
AC_SUGGESTION_TEMPLATE.remove();


export class LineagesUI extends MccUI {
  coreData: CoreLineagesData;
  nodeSchematic: NodeSchematic;
  nodeTimelines: NodeTimelines;
  nodeDetails: NodeDetails;
  nodeListDisplay: NodeListDisplay;


  nodeHighlightCallback: HoverCallback;

  treeHints: HTMLElement[];

  resetZoomButton: HTMLButtonElement;


  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector, "#lineages .tree-canvas");
    const updateCallback: updateFunction = (data: ChartData)=>this.update(data);
    this.coreData = new CoreLineagesData(sharedState, updateCallback);
    const dismissCallback: NodeCallback = nodeIndex=>this.handleNodeDismiss(nodeIndex);
    const nodeZoomCallback: NodeCallback = nodeIndex=>this.handleNodeZoom(nodeIndex);
    const nodeHighlightCallback: HoverCallback = (nodeIndex, date, mutation)=>this.updateHighlight(nodeIndex, date, mutation);
    let previousNode = UNSET
    const treeHoverCallback: NodeCallback = (nodeIndex: number)=>{
      if (nodeIndex !== previousNode) {
        previousNode = nodeIndex;
        this.handleNodeHover(nodeIndex, UNSET);
      }
    };
    const nodeSelectCallback: NodeCallback = (nodeIndex: number)=>this.selectNode(nodeIndex);
    const rootSelectCallback: NodeCallback = (nodeIndex: number)=>this.coreData.selectRoot(nodeIndex);
    const canvas = this.mccTreeCanvas.getCanvas();
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    this.mccTreeCanvas = new LineagesTreeCanvas(canvas, ctx, this.highlightCanvas, this.highlightCtx, treeHoverCallback, nodeSelectCallback);
    this.nodeSchematic = new NodeSchematic(nodeHighlightCallback);
    this.nodeDetails = new NodeDetails(dismissCallback, nodeHighlightCallback, rootSelectCallback);
    this.nodeListDisplay = new NodeListDisplay(dismissCallback, nodeHighlightCallback, nodeZoomCallback, rootSelectCallback);
    this.nodeTimelines = new NodeTimelines(nodeHighlightCallback);
    this.nodeHighlightCallback = nodeHighlightCallback;

    this.treeHints = Array.from(this.div.querySelectorAll(".tree-hint") as NodeListOf<HTMLElement>);

    this.resetZoomButton = this.div.querySelector(".mcc-zoom-button.reset") as HTMLButtonElement;

    const lookupForm = document.querySelector(".id-lookup form") as HTMLFormElement;
    lookupForm.addEventListener("submit", e => e.preventDefault());

    const constrainHoverByCredibilityInput = document.querySelector("#lineages--constrain-selection") as HTMLInputElement;
    constrainHoverByCredibilityInput.addEventListener('change', ()=>{
      this.coreData.setCredibilityConstrained(constrainHoverByCredibilityInput.checked);
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
        const selectedIds = this.coreData.getSelectedTipIds();
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
    this.coreData.activate();
    const [minDate, maxDate] = this.mccTreeCanvas.getDateRange();
    this.nodeTimelines.setDateRange(minDate, maxDate);
  }

  deactivate() {
    super.deactivate();
    this.coreData.setNodeSelection();
    this.coreData.deactivate();

  }


  resize(): void {
    super.resize();
    this.nodeTimelines.resize();
    this.nodeSchematic.resize();
    this.nodeTimelines.requestDraw();
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
          this.requestDraw();
          resolve(summary);
        })
    });
    return prom;
  }

  private updateNodeData() : void {
    if (this.pythia) {
      const mccRef = this.pythia.getMcc();
      this.coreData.initNodeData(this.mccTreeCanvas, this.isApobecEnabled);
      mccRef.release();
    }
  }


  setChartData(): void {
    this.coreData.setChartData();
  }

  update(chartData: ChartData): void {
    const { nodes, minDate, maxDate, nodePairs, rootNode, selectedRootIndex } = chartData;
    const {node} = this.coreData.getHighlights();
    const actualNodes = nodes.filter(dnc=>dnc.index !== UNSET);
    this.nodeDetails.setData(node || rootNode?.node as DisplayNode);
    this.nodeListDisplay.setNodes(nodes);
    (this.mccTreeCanvas as LineagesTreeCanvas).setNodes(actualNodes, nodePairs, selectedRootIndex);
    this.nodeTimelines.setData(nodes);
    this.nodeTimelines.setDateRange(minDate, maxDate);
    this.nodeSchematic.setData(nodePairs, rootNode);
    this.requestDraw();
  }

  requestDraw() {
    (this.mccTreeCanvas as LineagesTreeCanvas).requestDrawSelection();
    this.nodeSchematic.requestRender()
    this.nodeDetails.requestDraw();
    this.nodeListDisplay.requestDraw();
    this.nodeTimelines.requestDraw();
  }




  /* invoked by the tree when hovering a node */
  handleNodeHover(nodeIndex: number, date:number):void {
    this.coreData.hoverNode(nodeIndex, date);
    /* if this is a node that we have selected, highlight it */
    const selected = this.coreData.getSelection(nodeIndex);
    if (selected && selected.isLocked) {
      this.nodeDetails.setData(selected);
    } else {
      this.nodeDetails.setData(this.coreData.getRootNode());
    }

  }


  updateHighlight(nodeIndex: number, date: number, mutation: Mutation | null) {
    if (this.coreData.checkNewHighlight(nodeIndex, date, mutation)) {
      this.highlightCharts();
    }
  }

  highlightCharts() {
    const { node, date, mutation } = this.coreData.getHighlights(); // eslint-disable-line @typescript-eslint/no-unused-vars
    (this.mccTreeCanvas as LineagesTreeCanvas).highlightNode(node, date);
    this.nodeDetails.setData(node || this.coreData.getRootNode());
    this.nodeDetails.requestDraw();
    this.nodeListDisplay.highlightNode(node);
    this.nodeSchematic.highlightNode(node);
    this.nodeTimelines.highlightNode(node, date);
  }

  selectNode(nodeIndex: number): void {
    this.coreData.selectNode(nodeIndex);
  }



  setSelectable(selectable: boolean) {
    this.coreData.setSelectable(selectable);
    const lookupInput = document.querySelector(".id-lookup--input") as HTMLInputElement;
    lookupInput.disabled = !this.coreData.selectionsAvailable();
  }

  setHint(hint: TreeHint) {
    const className = TREE_HINT_CLASSES[hint];
    requestAnimationFrame(()=>this.treeHints.forEach(th => th.classList.toggle("hidden", !th.classList.contains(className))));
  }


  handleNodeDismiss(nodeIndex: number): void {
    this.coreData.dismissNode(nodeIndex);
    // this.setChartData([this.coreData.rootIndex, this.coreData.mrcaIndex, this.coreData.nodeAIndex, this.coreData.nodeBIndex]);
    // this.highlightCharts(null, UNSET, null);
    // this.setHint(TreeHint.Hover);
  }


  handleNodeZoom(nodeIndex: number) : void {
    console.log(`handleNodeZoom(${nodeIndex}) not implemented`)
    // const zoomNode: DisplayNode | null = null;

    // // switch (node) {
    // // case DisplayNodeClass.mrca:
    // //   zoomNode = this.mrcaIndex;
    // //   break;
    // // case DisplayNodeClass.nodeA:
    // //   zoomNode = this.nodeAIndex;
    // //   break;
    // // case DisplayNodeClass.nodeB:
    // //   zoomNode = this.nodeBIndex;
    // //   break;
    // // }
    // if (zoomNode === null) {
    //   this.mccTreeCanvas.resetZoom();
    //   this.sharedState.mccConfig.resetZoom();
    // } else if (this.pythia) {
    //   const tips = this.pythia.getMccNodeTips(zoomNode),
    //     treeCanvas = this.mccTreeCanvas;
    //   treeCanvas.zoomToTips(tips);
    //   this.sharedState.mccConfig.setZoom(1, treeCanvas.verticalZoom, 0.5, treeCanvas.zoomCenterY);
    // }
    // super.requestTreeDraw();
    // this.nodeSchematic.highlightNode(zoomNode, null);
  }




  goToMutations: OpenMutationPageFncType = (mutation?: Mutation) => {
    if (mutation) {
      this.sharedState.addMutation(mutation);
      this.sharedState.goTo(Screens.mutations);
    }
  }



}

