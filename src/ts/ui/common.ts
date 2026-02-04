import { SummaryTree } from '../pythia/delphy_api';
import { DateLabel } from './datelabel';

export const UNDEF = '-';

export enum YSpacing {
  even = 1,
  genetic = 2
}
export enum Topology {
  mcc = 1,
  bestof = 2
}
export enum ColorOption {
  confidence = 1,
  metadata = 2
}
export enum Presentation {
  all = 1,
  umbrella = 2
}

export enum Screens {
  run = 1,
  lineages = 2,
  mutations = 3,
  customize = 4,
  about = 5
}

/*
these correspond to values on the HTML radio buttons
*/
export const Y_EVEN_SPACING = "even";
export const Y_GENETIC_DISTANCE = "genetic";
export const TOPOLOGY_MCC = "mcc";
export const TOPOLOGY_BEST_OF = "mcs";
export const COLOR_CONF = "confidence";
export const COLOR_METADATA = "metadata";
export const PRESENTATION_ALL = "all";
export const PRESENTATION_UMBRELLA = "mutations";


export type NavigateFunctionType = (screen: Screens)=>void; // eslint-disable-line no-unused-vars


export const CONFIDENCE_DEFAULT = 90;



export const TEXT_Y_OFFSET = 12;
export const DATE_STRING_WIDTH = 55;

export const TIP_COLOR = 'rgb(88,88,88)',
  TIP_SIZE = 1.5,
  TIP_SIZE_MIN = 1.25,
  TIP_SIZE_MAX = 1.75,
  BRANCH_COLOR = 'rgb(140,140,140)',
  BRANCH_WEIGHT = 0.5,
  BRANCH_WEIGHT_MIN = 0.25,
  BRANCH_WEIGHT_MAX = 2.0,
  // MUTATION_COLOR = 'rgb(200,0,0)',
  MUTATION_COLOR = 'rgb(200,200,200)',
  MUTATION_RADIUS = 1;


export const UNSTYLED_CANVAS_WIDTH = 100;



export const enum DisplayNode {
  root = 0,
  mrca = 1,
  node1 = 2,
  node2 = 3,
  UNSET = -1
}
export const nodeTypeNames = ["Root", "MRCA of A and B", "Selection A", "Selection B"];
export const nodeColors = [
  'rgb(120, 164, 167)',
  'rgb(242, 88, 255)',//teal:'rgb(0, 197, 185)',//green:'rgb(121, 178, 0)',
  'rgb(0, 117, 255)',//'rgb(255, 122, 0)',
  'rgb(244, 98, 15)'//'rgb(0, 148, 255)'
];
export const nodeColorsDark = [
  'rgb(120, 164, 167)',
  'rgb(227, 53, 255)',//green:'rgb(75, 150, 0)',
  'rgb(0, 117, 255)',//'rgb(255, 122, 0)',
  'rgb(244, 98, 15)'//'rgb(0, 148, 255)'
];
export const nodeColorsStream = [
  'rgb(178, 200, 203)',
  'rgb(227, 53, 255)',
  'rgb(0, 117, 255)',
  'rgb(244, 98, 15)'
];
export const nodeClassNames: string[] = ["root", "mrca", "node1", "node2"];


export const getNodeTypeName = (dn: DisplayNode)=>nodeTypeNames[dn];
export const getNodeColor = (dn:DisplayNode)=>nodeColors[dn];
export const getNodeColorDark = (dn:DisplayNode)=>nodeColorsDark[dn];
export const getNodeColorStream= (dn:DisplayNode)=>nodeColorsStream[dn];
export const getNodeClassName = (dn: DisplayNode)=>nodeClassNames[dn];


export const TREE_TIMELINE_SPACING = 110 - 60,
  TREE_PADDING_BOTTOM = 50,
  TREE_PADDING_LEFT = 30,
  TREE_PADDING_RIGHT = 40,
  TREE_TEXT_TOP = 15,
  TREE_TEXT_LINE_SPACING = 15,
  TREE_TEXT_FONT = '500 12px MDSystem, Roboto, sans-serif',
  TREE_TEXT_FONT_2 = '700 12px MDSystem, Roboto, sans-serif',
  CHART_TEXT_SIZE = 12,
  CHART_TEXT_FONT = `500 ${CHART_TEXT_SIZE}px MDSystem, Roboto, sans-serif`,
  // CHART_TEXT_BOLD_FONT = `600 ${CHART_TEXT_SIZE}px MDSystem, Roboto, sans-serif`,
  CHART_TEXT_SMALL_SIZE = 6,
  CHART_TEXT_SMALL_FONT = `700 ${CHART_TEXT_SMALL_SIZE}px MDSystem, Roboto, sans-serif`,
  CHART_MONO_FONT = `400 ${CHART_TEXT_SIZE}px "MD IO", RobotoMono, sans-serif`,
  CHART_MONO_BOLD_FONT = `600 ${CHART_TEXT_SIZE}px "MD IO", RobotoMono, sans-serif`,
  TREE_TEXT_COLOR = 'rgb(152, 152, 152)',
  TREE_TEXT_COLOR_2 = 'rgb(102, 102, 102)',
  TREE_DATELINE_COLOR = 'rgb(203, 203, 203)',
  TREE_DATELINE_COLOR_2 = 'rgb(102, 102, 102)',
  DASH_LENGTH = 1.5,
  DASH_SPACING = 3.5,
  DASH_WEIGHT = 1.5;



export const HI_CONFIDENCE_COLOR = 'rgb(6, 35, 33)',
  LOW_CONFIDENCE_COLOR = 'rgb(200,200,200)',
  DEFAULT_NODE_CONFIDENCE = 0.9;


export const nfc = (x:number)=>{
  return x === undefined ? '' : x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const safeLabel = (x:number)=>{
  if (x === undefined || isNaN(x) || x === null) return '';
  return Math.abs(x) >= 100 ? nfc(Math.round(x)) : x.toFixed(2);
}

export const getOrdinal = (n:number)=>{
  const lastDigit = n % 10;
  let ord = `${n}`;
  switch(Math.abs(lastDigit)) {
  case 1: ord += 'st'; break;
  case 2: ord += 'nd'; break;
  case 3: ord += 'rd'; break;
  default: ord += 'th'; break;
  }
  return ord;
}

export const minimalDecimalLabel = (x:number)=>{
  if (x === undefined || isNaN(x) || x === null) return '';
  let label = '';
  if (Math.abs(x) < 1) {
    label = x.toLocaleString();
    label = label.replace(/0+$/, ''); // trim zeroes off the end
  } else {
    label = nfc(Math.round(x));
  }
  return label;
}

export const mutToPos = (s:string):number => {
  const r =  /.([\d]*)/.exec(s);
  // console.log(r);
  return r ? parseInt(r[1]) : -1;
}


export const MONTHLY = 1,
  QUARTERLY = 2,
  YEARLY = 3,
  FIVE_YEARLY = 4,
  TEN_YEARLY = 5;


export const getTimelineIndices = (minDate:number, maxDate:number)=>{
  const timelineIndices = [],
    range = maxDate - minDate + 1,
    /*
    how often do we want to add an actual label?
    Let's assume we have room for up to 5 labels
    */
    daysPerLabel = Math.ceil(range / 5);
  let d = maxDate,
    dl  = new DateLabel(d),
    prev = new DateLabel(d),
    labelFreq = TEN_YEARLY;
  timelineIndices.push(dl);
  if (daysPerLabel <= 31) {
    labelFreq = MONTHLY;
  } else if (daysPerLabel < 100) {
    labelFreq = QUARTERLY;
  } else if (daysPerLabel < 400) {
    labelFreq = YEARLY;
  } else if (daysPerLabel < 2000) {
    labelFreq = FIVE_YEARLY;
  }

  for (let i = 0; i < range * 3; i++) {
    d--;
    dl = new DateLabel(d);
    if (dl.day === 1) {
      switch (labelFreq) {
      case MONTHLY:
        timelineIndices.push(dl);
        break;
      case QUARTERLY:
        if (dl.month % 3 === 0 && Math.abs(prev.month - dl.month) > 1) {
          timelineIndices.push(dl);
          prev = dl;
        }
        break;
      case YEARLY:
        if (dl.month === 0) {
          timelineIndices.push(dl);
          prev = dl;
        }
        break;
      case FIVE_YEARLY:
        if (dl.month === 0 && Math.abs(prev.year - dl.year) > 4) {
          timelineIndices.push(dl);
          prev = dl;
        }
        break;
      case TEN_YEARLY:
        if (dl.month === 0 && Math.abs(prev.year - dl.year) > 9) {
          timelineIndices.push(dl);
          prev = dl;
        }
        break;
      }

    }
  }
  return timelineIndices;
}

/* expects a number between 0 and 1 */
export const getPercentLabel = (n:number)=>{
  if (n === 0) return '0';
  if (n === 1) return '100';
  if (n <= 0.01) return '<1';
  if (n > 0.99)  return '>99';
  return `${Math.round(100*n)}`;
}



export const resizeCanvas = (canvas: HTMLCanvasElement) => {
  const computed = window.getComputedStyle(canvas),
    width = parseInt(computed.width.replace('px', '')),
    height = parseInt(computed.height.replace('px', '')),
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (window.devicePixelRatio > 1) {
    canvas.width = Math.round(window.devicePixelRatio * width);
    canvas.height = Math.round(window.devicePixelRatio * height);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  } else {
    canvas.width = width;
    canvas.height = height;
  }
  return {width, height};
}


export type MetadataColorOption = {color: string, active: boolean};

export type ColorDict = {[value: string]: MetadataColorOption};


export function constrain(n: number, low: number, high: number): number {
  return Math.max(Math.min(n, high), low);
}

interface MyTextMetrics {
  width: number,
  height: number,
  left?: number | undefined,
  right?: number | undefined,
  top?: number | undefined,
  bottom?: number | undefined
}

interface TextPosition {
  x: number,
  y: number,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline
}

export function measureText(ctx: CanvasRenderingContext2D, text: string, textPosition?: TextPosition): MyTextMetrics {
  const metrics = ctx.measureText(text);
  const width = metrics.width;
  const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  const myMetrics: MyTextMetrics = {width, height};
  if (textPosition) {
    const {x, y, align, baseline} = textPosition;
    let left: number | undefined, right: number | undefined, top: number | undefined, bottom: number | undefined;

    const setLeftAlign = () => {
      left = x;
      right = x + width;
    }

    const setRightAlign = () => {
      left = x - width;
      right = x;
    }

    switch (align) {
    case "left":
      setLeftAlign();
      break;
    case "center":
      left = x - width / 2;
      right = x + width / 2;
      break;
    case "right":
      setRightAlign();
      break;
    case "start":
      if (ctx.direction === "ltr" || ctx.direction === "inherit") { // assuming LTR...
        setLeftAlign();
      } else {
        setRightAlign();
      }
      break;
    case "end":
      if (ctx.direction === "ltr" || ctx.direction === "inherit") { // assuming LTR...
        setRightAlign();
      } else {
        setLeftAlign();
      }
      break;
    }

    const setTopAlign = () => {
      top = y;
      bottom = y + height;
    }

    const setBottomAlign = () => {
      top = y - height;
      bottom = y;
    }

    // naive LTR/English-dominant implementation

    switch (baseline) {
    case "top":
    case "hanging":
      setTopAlign();
      break;
    case "middle":
      top = y - height / 2;
      bottom = y + height / 2;
      break;
    case "alphabetic": //
    case "ideographic": //
    case "bottom":
      setBottomAlign();
      break;
    }

    myMetrics.left = left;
    myMetrics.right = right;
    myMetrics.top = top;
    myMetrics.bottom = bottom;
  }

  return myMetrics;
}

export function textIntersects(metrics1: MyTextMetrics, metrics2: MyTextMetrics): boolean {
  if (!(metrics1.left && metrics1.right && metrics1.top && metrics1.bottom)) {
    throw new Error(`missing position on metrics1: ${metrics1}`);
  }
  if (!(metrics2.left && metrics2.right && metrics2.top && metrics2.bottom)) {
    throw new Error(`missing position on metrics2: ${metrics2}`);
  }

  if (metrics2.left > metrics1.right) return false;
  if (metrics2.right < metrics1.left) return false;
  if (metrics2.top > metrics1.bottom) return false;
  if (metrics2.bottom < metrics1.top) return false;

  return true;
}

export const UNSET = -1;

export type ZoomFnc = (vertZoom: number, vertScroll: number, horizZoom: number, horizScroll: number)=>void;

export type DataResolveType = (tree:SummaryTree)=>void;

export const pad = (n:number)=>`${(n < 10 ? '0' : '')}${n}`;
export const getTimestampString = ()=>{
  const now = new Date();
  return `${now.getFullYear() % 100}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
};


export const numericSort = (a: number, b: number)=>a-b;
export const numericSortReverse = (a: number, b: number)=>b-a;


export const getNtile = (arr: number[], ntile: number) =>{
  const index = (arr.length - 1) * ntile,
    floored = Math.floor(index),
    diff = index - floored;
  let value = arr[floored];
  if (diff !== 0) {
    /*
    weight the influence of the two bounding amounts.
    */
    // value = value * (1.0 - diff) + arr[floored+1] * diff;
    value = (value + arr[floored+1]) / 2;
  }
  return value;
}

export type ValueHandler = (value: number) => void;