import { SoftFloat } from "../../util/softfloat";
import { UNSET } from "../common";
import { Distribution } from "../distribution";
import { SVGSeriesGroup, TimeDistributionChart } from "../timedistributionchart";
import { DisplayNode } from "./displaynode";



export class NodeSVGSeriesGroup extends SVGSeriesGroup {

  node: DisplayNode | null = null;

  setNode(node: DisplayNode, toggle=true) {
    this.node = node;
    if (node.className === '') {
      console.log(`why an empty class here?` , node);
    } else {
      this.g.classList.toggle(node.className, toggle);
    }
  }

  setNodeClass(className: string, toggle=true) {
    this.g.classList.toggle(className, toggle);
  }

  remove() {
    this.g.remove();
  }
}




export class NodeTimeDistributionChart extends TimeDistributionChart {

  setNodeSeries(nodes: DisplayNode[]) {
    const serieses: Distribution[] = [];
    const correspondingNodes: DisplayNode[] = [];
    nodes.forEach(node=>{
      if (node.series !== null) {
        correspondingNodes.push(node);
        serieses.push(node.series);
      }
    });
    super.setSeries(serieses);
    /*
    revise the max value: tips will have 100% probability,
    but other nodes are likely to have single digit maxes. So exclude tips
    from being the max, and we will draw them differently to indicate the certainty.

    And the peak probability is a mostly useless value, so we don't display it.
    In which case, there's no point in making it a nice number.
    */
    this.allSeriesBandMax = Math.max(...this.series.map(distribution=>{
      let seriesMax = 0;
      if (distribution.range > 0 && distribution.bandMax) seriesMax = distribution.bandMax;
      return seriesMax;
    }));
    this.svgGroups.forEach((group: SVGSeriesGroup, i)=>{
      const nodeGroup = (group as NodeSVGSeriesGroup);
      const node = correspondingNodes[i];
      nodeGroup.setNode(node);
      nodeGroup.setNodeClass("tip", node.series === null || node.series.range === 0);
    });
  }

  setMatching(matchNode:DisplayNode | null) {
    if (matchNode === null || matchNode.index === UNSET) {
      this.svgGroups.forEach((group: SVGSeriesGroup)=>{
        const nodeGroup = (group as NodeSVGSeriesGroup);
        nodeGroup.setNodeClass("matching", false);
        nodeGroup.setNodeClass("unmatching", false);
      });
    } else {
      this.svgGroups.forEach((group: SVGSeriesGroup, i)=>{
        const nodeGroup = (group as NodeSVGSeriesGroup);
        const node = nodeGroup.node;
        if (node?.index === matchNode.index) {
          nodeGroup.setNodeClass("matching");
          nodeGroup.setNodeClass("unmatching", false);
        } else {
          nodeGroup.setNodeClass("matching", false);
          nodeGroup.setNodeClass("unmatching");
        }
      });
    }
  }

}




/*
Most TimeDistributionCharts get created once, with one series.
This one can have multiple series at a time, some persisting between draws.
To avoid flickering, we want to preserve paths as much as we can.
*/
export class AnimatedNodeTimeDistributionChart extends NodeTimeDistributionChart {

  seriesMax: SoftFloat = new SoftFloat(0);
  groupLookup: NodeSVGSeriesGroup[] = [];
  timer: number = UNSET;

  setNodeSeries(nodes: DisplayNode[]) {
    const serieses: Distribution[] = [];
    const correspondingNodes: DisplayNode[] = [];
    const incomingNodes: boolean[] = [];
    let newSeriesBandMax = 0;
    nodes.forEach(node=>{
      if (node.series !== null) {
        correspondingNodes.push(node);
        serieses.push(node.series);
        incomingNodes[node.index] = true;
        const distribution = node.series;
        if (distribution.range > 0 && distribution.bandMax > newSeriesBandMax) {
          newSeriesBandMax = distribution.bandMax;
        }
      }
    });

    this.groupLookup.forEach((group, nodeIndex)=> {
      if (!incomingNodes[nodeIndex]) {
        group.remove();
        delete this.groupLookup[nodeIndex];
      }
    });

    this.series = serieses;
    this.svgGroups.length = 0;

    correspondingNodes.forEach((node)=>{
      let group = this.groupLookup[node.index];
      if (!group) {
        group = new this.groupType(this.svg) as NodeSVGSeriesGroup; // eslint-disable-line new-cap
        group.setNode(node);
        this.groupLookup[node.index] = group;
      }
      group.setNodeClass("tip", node.series === null || node.series.range === 0);
      this.svgGroups.push(group);
    });
    this.seriesMax.setTarget(newSeriesBandMax);
  }

  requestDraw(): void {
    // update the max
    this.seriesMax.update();
    requestAnimationFrame(()=>{
      this.allSeriesBandMax = this.seriesMax.value;
      this.draw();
      if (this.seriesMax.isTargeting()) {
        if (this.timer === UNSET) clearTimeout(this.timer);
        this.timer = setTimeout(()=>this.requestDraw(), 500);
      } else {
        this.timer = UNSET;
      }
    });
  }


}

