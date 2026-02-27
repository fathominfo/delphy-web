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

  setNodeSeries(nodes: DisplayNode[]) {
    const serieses: Distribution[] = [];
    const correspondingNodes: DisplayNode[] = [];
    const incomingNodeIndexes: boolean[] = [];
    nodes.forEach(node=>{
      if (node.series !== null) {
        correspondingNodes.push(node);
        serieses.push(node.series);
        incomingNodeIndexes[node.index] = true;
      }
    });

    let i = this.svgGroups.length - 1;
    const currentNodes: NodeSVGSeriesGroup[] = [];
    while (i >= 0) {
      const nodeGroup = this.svgGroups[i] as NodeSVGSeriesGroup;
      const node = nodeGroup.node as DisplayNode;
      if (!incomingNodeIndexes[node.index]) {
        nodeGroup.remove();
        this.svgGroups.splice(i, 1);
      } else {
        currentNodes[node.index] = nodeGroup;
      }
      i--;
    }

    this.series = serieses;
    this.svgGroups.length = 0;

    correspondingNodes.forEach((node)=>{
      let group = currentNodes[node.index];
      if (!group) {
        group = new this.groupType(this.svg) as NodeSVGSeriesGroup; // eslint-disable-line new-cap
        group.setNode(node);
      }
      group.setNodeClass("tip", node.series === null || node.series.range === 0);
      this.svgGroups.push(group);
    });
    const newSeriesBandMax = Math.max(...this.series.map(distribution=>{
      let seriesMax = 0;
      if (distribution.range > 0 && distribution.bandMax) seriesMax = distribution.bandMax;
      return seriesMax;
    }));
    this.seriesMax.setTarget(newSeriesBandMax);
  }

  requestDraw(): void {
    // update the max
    this.seriesMax.update();
    this.allSeriesBandMax = this.seriesMax.value;
    requestAnimationFrame(()=>this.draw());
    if (this.seriesMax.isTargeting()) {
      setTimeout(()=>this.requestDraw(), 15);
    }
  }


}

