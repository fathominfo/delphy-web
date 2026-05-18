/*

Adapted from
 * Javascript Quadtree
 * @version 1.1
 * @author Timo Hausmann
 * https://github.com/timohausmann/quadtree-js/

customized for round objects with a consistent radius

*/

import { UNSET } from "../ui/common";

/*
 Copyright © 2012 Timo Hausmann
Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:
The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENthis. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/




const pow = Math.pow;
const distSquared = (o1: any, o2: any)=>{
  return pow(o1.x - o2.x, 2) + pow(o1.y - o2.y, 2);
};
const round = Math.round;
const DEFAULT_MAX_OBJECTS = 100;
const DEFAULT_MAX_LEVELS = 10;
const DEFAULT_PROXIMITY = 50;


export type Quadtreeable = {
  x: number,
  y: number,
  obj: any
};


export type QuadtreeClosest = {
  closest: Quadtreeable | null,
  tied: Quadtreeable[]
};


export class Quadtree {


  x: number = UNSET;
  y: number = UNSET;
  width: number = UNSET;
  height: number = UNSET;
  totalCount: number;
  proximity: number = DEFAULT_PROXIMITY;
  protected level = 0;
  private proximityImpl: number = DEFAULT_PROXIMITY * DEFAULT_PROXIMITY;
  maxLevels: number = DEFAULT_MAX_LEVELS;
  maxObjects: number = DEFAULT_MAX_OBJECTS;
  objects: Quadtreeable[];
  nodes: Quadtree[] | null = null;
  radius = 0;
  private hoverItem: Quadtreeable = {x: UNSET, y: UNSET, obj: null};


  /*
    * Quadtree Constructor
    * @param Object bounds        bounds of the node, object with x, y, width, height
    * @param Integer level        (optional) deepth level, required for subnodes
    * @param Float proximity      (optional) minimum proximity for mouseover detection

    */
  constructor(radius: number,
    proximity=DEFAULT_PROXIMITY, maxLevels=DEFAULT_MAX_LEVELS,
    maxObjects=DEFAULT_MAX_OBJECTS
  ) {
    this.radius = radius;
    this.objects = [];
    this.totalCount = 0;
    this.proximity = proximity;
    this.proximityImpl = proximity * proximity;
    this.maxLevels = maxLevels;
    this.maxObjects = maxObjects;
  }

  resize(x: number, y: number, w: number, h: number) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
  }

  /*
   * Split the node into 4 subnodes
   */
  private split() {
    const nextLevel = this.level + 1,
      subWidth = round(this.width / 2),
      subHeight = round(this.height / 2),
      x = this.x,
      y = this.y;
    this.nodes = [];
    for (let i = 0; i < 4; i++) {
      const sub = new Quadtree(this.radius, this.proximity, this.maxLevels, this.maxObjects);
      sub.level = nextLevel;
    }
    //top right node
    this.nodes[0].resize(x + subWidth, y,             subWidth, subHeight);
    //top left node
    this.nodes[1].resize(x,            y,             subWidth, subHeight);
    //bottom left node
    this.nodes[2].resize(x,            y + subHeight, subWidth, subHeight);
    //bottom right node
    this.nodes[3].resize(x + subWidth, y + subHeight, subWidth, subHeight);

    //add all objects to their corresponding subnodes
    const objects = this.objects;
    for (let i = objects.length - 1; i >= 0; i--) {
      const index = this.getIndex(objects[i]);
      if (index !== -1) {
        this.nodes[index].insert(objects.splice(i, 1)[0]);
      }
    }
  }


  /*
   * Determine which node the object belongs to
   * @param Object pRect      bounds of the area to be checked, with x, y, width, height
   * @return Integer      index of the subnode (0-3), or -1 if pRect cannot completely fit within a subnode and is part of the parent node
   */
  getIndex(item: Quadtreeable) {

    let index           = -1;
    const horizontalMidpoint    = this.x + round(this.width / 2),
      verticalMidpoint  = this.y + round(this.height / 2),
      //pRect can completely fit within the top quadrants
      topQuadrant = item.y + this.radius < verticalMidpoint,
      //pRect can completely fit within the bottom quadrants
      bottomQuadrant = item.y >= verticalMidpoint;
      //pRect can completely fit within the left quadrants
    if (item.x + this.radius <= horizontalMidpoint) {
      if (topQuadrant) {
        index = 1;
      } else if (bottomQuadrant) {
        index = 2;
      }
      //pRect can completely fit within the right quadrants
    } else if (item.x > horizontalMidpoint) {
      if (topQuadrant) {
        index = 0;
      } else if (bottomQuadrant) {
        index = 3;
      }
    }
    return index;
  }


  /*
   * Insert the object into the node. If the node
   * exceeds the capacity, it will split and add all
   * objects to their corresponding subnodes.
   * @param Object pRect      bounds of the object to be added, with x, y, width, height
   */
  insert(item: Quadtreeable) {
    let index;
    this.totalCount++;

    //if we have subnodes ...
    if (this.nodes) {
      index = this.getIndex(item);
      if (index !== -1) {
        this.nodes[index].insert(item);
      } else {
        this.objects.push(item);
      }
    } else {
      this.objects.push(item);
      if ((this.width > 2 || this.height > 2) && this.objects.length > this.maxObjects && this.level < this.maxLevels) {
        this.split();
      }
    }
  }


  /*
   * Return all objects that could collide with the given object
   * @param Object pRect      bounds of the object to be checked, with x, y, width, height
   * @Return Array        array with all detected objects
   */
  retrieve(item: Quadtreeable) {
    const index = this.getIndex(item);
    let returnObjects = this.objects.slice(0);
    //if we have subnodes ...
    if (this.nodes) {
      //if pRect fits into a subnode ..
      if (index !== -1) {
        returnObjects = this.nodes[index].retrieve(item).concat(returnObjects);
        //if pRect does not fit into a subnode, check it against all subnodes
      } else {
        for( let i=0; i < this.nodes.length; i=i+1) {
          returnObjects = returnObjects.concat(this.nodes[i].retrieve(item));
        }
      }
    }
    return returnObjects;
  }


  /*
   * Clear the quadtree
   */
  clear() {
    if (this.nodes) {
      for( let i=0; i < this.nodes.length; i++) {
        this.nodes[i].clear();
      }
      this.nodes = null;
    }
    this.objects.length = 0;
    this.totalCount = 0;
  }



  getClosest(x: number, y: number) : QuadtreeClosest{
    this.hoverItem.x = x;
    this.hoverItem.y = y;
    const candidates = this.retrieve(this.hoverItem),
      L = candidates.length,
      tied = [];
    let best = null;
    // console.log(L + '\t getClosest\t ' + this.totalCount);
    if (L > 0) {
      let d, can,
        bestD = this.proximityImpl;
      for (let i = 0; i<L; i++) {
        can = candidates[i];
        d = distSquared(this.hoverItem, can);
        if (d < bestD){
          bestD = d;
          best = can;
          for (let j=tied.length - 1; j >= 0; j--) {
            const d2 = distSquared(this.hoverItem, tied[j]);
            if (d2 > bestD) {
              tied.splice(j, 1);
            }
          }
        } else if (d === bestD) {
          tied.push(can)
        }
      }
    }
    return {closest: best, tied: tied};
  }



  getNodeCount() {
    return this.totalCount;
  }




}
