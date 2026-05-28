import { Mutation, SummaryTree } from "../../pythia/delphy_api";
import { MutationDistribution } from "../../pythia/mutationdistribution";
import { AggregateMOI, tallyMutationsOfInterest } from "../../pythia/mutationsofinterest";
import { Pythia } from "../../pythia/pythia";
import { SharedState } from "../../sharedstate";
import { UNSET } from "../common";
import { DisplayNode } from "../displaynode";
import { Distribution } from "../distribution";
import { NodeSchematic } from "../nodeschematic";
import { SchematicNode } from "../schematicdata";
import { HoverCallback, NodePair, NodeRelationType } from "../select/selectcommon";
import { UIScreen } from "../uiscreen";
import { NodeMutationsData } from "./nodemutationsdata";
import { NodeMutations } from "./nodepairmutations";
import { NodePrevalenceChart } from "./nodeprevalencechart";
import { NodeTimelines } from "./nodetimelines";


export class AnalysisUI extends UIScreen {

  nodeSchematic: NodeSchematic;
  nodePrevalenceCanvas: NodePrevalenceChart;
  nodeTimelines: NodeTimelines;
  nodeMutationCharts: NodeMutations;
  highlightNode: number = UNSET;
  highlightDate: number = Number.MAX_SAFE_INTEGER;
  highlightMutation: Mutation | null = null;



  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector);
    const subway = this.div.querySelector(".subway") as HTMLDivElement;
    const nodeHighlightCallback: HoverCallback  = (nodeIndex, date, mutation)=>this.updateHighlight(nodeIndex, date, mutation);
    this.nodeSchematic = new NodeSchematic(subway, nodeHighlightCallback);
    this.nodePrevalenceCanvas = new NodePrevalenceChart(nodeHighlightCallback);
    this.nodeTimelines = new NodeTimelines(nodeHighlightCallback);
    this.nodeMutationCharts = new NodeMutations(nodeHighlightCallback);
  }

  activate(): void {
    super.activate();
    this.setData();
  }


  resize(): void {
    super.resize();
    this.nodeSchematic.resize();
    /*
    TODO
    the x-axis of the prevalence chart, node timelines, and mutations
    should all be aligned. It probably makes sense to set the width of
    one of the charts, and then pass that value to the other two in
    order to make sure they are all pixel perfect aligned. [mark 260528]
    */
    this.nodePrevalenceCanvas.resize();
    this.nodePrevalenceCanvas.requestDraw();
    this.nodeTimelines.resize();
    this.nodeTimelines.requestDraw();
    this.nodeMutationCharts.resize();
  }

  setData() : void {
    const pythia = this.pythia;
    const schematicData = this.sharedState.schematicData;
    if (!pythia) return;
    if (!schematicData.rootNode) return;
    const mccRef = pythia.getMcc();
    const summaryTree = mccRef.getMcc();
    const maxDate = pythia.maxDate;
    let minDate = pythia.getBaseTreeMinDate();
    const dNode : DisplayNode = schematicData.rootNode.node;
    if (dNode.series) {
      minDate = dNode.series.bandTimes[0];
    }
    const nodes: DisplayNode[] = [schematicData.rootNode.node];
    schematicData.pairs.forEach(pair=>{
      const desc = pair.descendant;
      if (desc.index !== UNSET && desc.className !== 'mrca') {
        nodes.push(pair.descendant);
      }
    });
    /*
    build pairs of ancestor -> descendant nodes, skipping any branching
    placeholder nodes
    */
    const q: {anc: SchematicNode, desc: SchematicNode, relation: NodeRelationType}[] = [];
    const pairs: {anc: SchematicNode, desc: SchematicNode, relation: NodeRelationType}[] = [];
    const processNext = (node: SchematicNode, ancestor: SchematicNode | null = null,
      relation: NodeRelationType = NodeRelationType.singleDescendant
    )=>{
      if (ancestor && node.node.className !== 'mrca') {
        pairs.push({anc: ancestor, desc: node, relation});
      }
      const display: DisplayNode = node.node;
      if (display.index !== UNSET && display.className !== 'mrca') {
        const L = node.children.length;
        node.children.forEach((desc, i)=>{
          const rel = L === 1 ? NodeRelationType.singleDescendant
            : i === 0 ? NodeRelationType.upperDescendant
              : NodeRelationType.lowerDescendant;
          q.push({desc: desc, anc: node, relation: rel});
        });
      } else if (ancestor !== null) {
        const L = node.children.length;
        node.children.forEach((desc, i)=>{
          const rel = L === 1 ? NodeRelationType.singleDescendant
            : i === 0 ? NodeRelationType.upperDescendant
              : NodeRelationType.lowerDescendant;
          q.push({desc: desc, anc: ancestor, relation: rel});
        });
      } else {
        console.warn("kuinka tämä tapahtuu?");
      }
    };
    processNext(schematicData.rootNode);
    while (q.length > 0) {
      const item = q.shift();
      if (item) {
        const {anc, desc, relation} = item;
        processNext(desc, anc, relation);
      }
    }
    console.log(pairs.map(p=>`${p.anc.node.className}->${p.desc.node.className}`))
    const nodeComparisonData: NodeMutationsData[] = pairs.map(({anc, desc, relation})=>{
      const ancestorSeries: Distribution = anc.node.series as Distribution;
      const descendantSeries: Distribution = desc.node.series as Distribution;
      const nodePair = this.assembleNodePair(anc.node, desc.node, relation, summaryTree);
      return new NodeMutationsData(nodePair, ancestorSeries.median, descendantSeries.median, minDate, maxDate, this.isApobecEnabled)
    });
    const currentIndices = nodes.map(n=>n.index);
    console.log('currentIndices', currentIndices)
    const nodePrevalenceData = pythia.getPopulationNodeDistribution(currentIndices, minDate, maxDate, summaryTree);
    console.log(nodePrevalenceData)
    const nodeDistributions = nodePrevalenceData.series;
    /* we want the default distribution to come first, so take it off the end and put it first */
    nodeDistributions.forEach(treeSeries=>treeSeries.unshift(treeSeries.pop() as number[]));
    const moiHist = pythia.mutationOfInterestHist.slice(pythia.kneeIndex);
    const mutationsOfInterest = tallyMutationsOfInterest(moiHist);
    this.nodeSchematic.setData(this.sharedState.schematicData);
    this.nodePrevalenceCanvas.setData(nodeDistributions, nodes, minDate, maxDate);
    this.nodeTimelines.setData(nodes);
    this.nodeTimelines.setDateRange(minDate, maxDate);
    this.nodeMutationCharts.setData(nodeComparisonData, mutationsOfInterest);
    mccRef.release();
  }


  assembleNodePair(ancestor: DisplayNode, descendant: DisplayNode,
    relation: NodeRelationType, tree: SummaryTree): NodePair {
    const pythia = this.pythia as Pythia;
    const mutTimes : MutationDistribution[] = pythia.getMccMutationsBetween(ancestor.index, descendant.index, tree);
    return new NodePair(ancestor, descendant, relation, mutTimes);
  }



  updateHighlight(nodeIndex: number, date: number, mutation: Mutation | null) {
    if (nodeIndex !== this.highlightNode
      || date !== this.highlightDate
      || mutation !== this.highlightMutation
    ) {
      this.highlightNode = nodeIndex;
      this.highlightDate = date;
      this.highlightMutation = mutation;
      this.nodeSchematic.highlightNode(nodeIndex);
      this.nodePrevalenceCanvas.highlightNode(nodeIndex, date);
      this.nodeTimelines.highlightNode(nodeIndex, date);
      this.nodeMutationCharts.highlightNode(nodeIndex, date, mutation);
    }
  }

}