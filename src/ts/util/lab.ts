const L_MIN = 0.0;
const L_MAX = 100.0;
const L_EDGE = L_MAX / 2;

const S_MIN = -128.0;
const S_MAX = 127.0;

const SLICES = 64;
const R0 = 0; // 0  // all floats
const R1 = 4; // 0.05
const R2 = 10; // 0.125
const R3 = 20; // 0.25
const R4 = 32; // 0.4
const R5 = 44; // 0.55
const R6 = 54; // 0.675
const R7 = 60; // 0.75
const R8 = 80; // 1


const A_SIGN_INDEX = 0;
const B_SIGN_INDEX = 1;
// const A_unknown_INDEX = 2;
// const B_unknown_INDEX = 3;
const A_QUANTITY_INDEX = 4;
const B_QUANTITY_INDEX = 5;

const BALA = [  // static final private float[][]
  [1, 1, R0, R8, R1, R8],

  [1, 1, R1, R8, R2, R8],
  [1, 1, R2, R8, R3, R8],
  [1, 1, R3, R8, R4, R8],
  [1, 1, R4, R8, R5, R8],
  [1, 1, R5, R8, R6, R8],
  [1, 1, R6, R8, R7, R8],

  [1, 1, R7, R8, R8, R8],
  [1, 1, R8, R8, R8, R7],

  [1, 1, R8, R7, R8, R6],
  [1, 1, R8, R6, R8, R5],
  [1, 1, R8, R5, R8, R4],
  [1, 1, R8, R4, R8, R3],
  [1, 1, R8, R3, R8, R2],
  [1, 1, R8, R2, R8, R1],

  [1, 1, R8, R1, R8, R0],
  [1, -1, R8, R0, R8, R1],

  [1, -1, R8, R1, R8, R2],
  [1, -1, R8, R2, R8, R3],
  [1, -1, R8, R3, R8, R4],
  [1, -1, R8, R4, R8, R5],
  [1, -1, R8, R5, R8, R6],
  [1, -1, R8, R6, R8, R7],

  [1, -1, R8, R7, R8, R8],
  [1, -1, R8, R8, R7, R8],

  [1, -1, R7, R8, R6, R8],
  [1, -1, R6, R8, R5, R8],
  [1, -1, R5, R8, R4, R8],
  [1, -1, R4, R8, R3, R8],
  [1, -1, R3, R8, R2, R8],
  [1, -1, R2, R8, R1, R8],

  [1, -1, R1, R8, R0, R8],
  [-1, -1, R0, R8, R1, R8],

  [-1, -1, R1, R8, R2, R8],
  [-1, -1, R2, R8, R3, R8],
  [-1, -1, R3, R8, R4, R8],
  [-1, -1, R4, R8, R5, R8],
  [-1, -1, R5, R8, R6, R8],
  [-1, -1, R6, R8, R7, R8],

  [-1, -1, R7, R8, R8, R8],
  [-1, -1, R8, R8, R8, R7],

  [-1, -1, R8, R7, R8, R6],
  [-1, -1, R8, R6, R8, R5],
  [-1, -1, R8, R5, R8, R4],
  [-1, -1, R8, R4, R8, R3],
  [-1, -1, R8, R3, R8, R2],
  [-1, -1, R8, R2, R8, R1],

  [-1, -1, R8, R1, R8, R0],
  [-1, 1, R8, R0, R8, R1],

  [-1, 1, R8, R1, R8, R2],
  [-1, 1, R8, R2, R8, R3],
  [-1, 1, R8, R3, R8, R4],
  [-1, 1, R8, R4, R8, R5],
  [-1, 1, R8, R5, R8, R6],
  [-1, 1, R8, R6, R8, R7],

  [-1, 1, R8, R7, R8, R8],
  [-1, 1, R8, R8, R7, R8],

  [-1, 1, R7, R8, R6, R8],
  [-1, 1, R6, R8, R5, R8],
  [-1, 1, R5, R8, R4, R8],
  [-1, 1, R4, R8, R3, R8],
  [-1, 1, R3, R8, R2, R8],
  [-1, 1, R2, R8, R1, R8],
  [-1, 1, R1, R8, R0, R8]
];

export class Lab {
  el = 0;
  ay = 0;
  be = 0;

  constructor(l: number, a: number, b:number) {
    this.el = constrainL(l);
    this.ay = constrainS(a);
    this.be = constrainS(b);
  }

  setFromHCV(hue: number, chroma: number, value: number) : Lab {
    this.setHue(hue);
    this.setChroma(chroma);
    this.el = constrainL(L_MAX * value);
    return this;
  }


  /* set a and b values, not L */
  setHue(hue: number) : Lab {
    hue = hue % SLICES;
    if (hue < 0) {
      hue = (SLICES + hue) % SLICES;
    } else {
      hue = hue % SLICES;
    }
    const balaRow = BALA[hue];
    let a = balaRow[A_SIGN_INDEX] * balaRow[A_QUANTITY_INDEX];
    let b = balaRow[B_SIGN_INDEX] * balaRow[B_QUANTITY_INDEX];
    const aTop = Math.abs(a) >= Math.abs(b);
    const abRatio = b === 0 ? 1.0 : Math.abs(a) / Math.abs(b);
    // inheritChroma
    let Z;
    const maxChannel = aTop ? a : b;
    if (maxChannel > 0) {
      Z = remap(maxChannel, 0, 127, 0, 1);
    } else {
      Z = remap(maxChannel, -128, 0, 1, 0);
    }
    // setChroma
    if (maxChannel !== 0) {
      if (aTop) {
        if (a > 0) {
          a = S_MAX * Math.abs(Z);
        } else {
          a = S_MIN * Math.abs(Z);
        }
        a = constrainS(a);
        b = Math.abs(a / abRatio) * balaRow[B_SIGN_INDEX];
      } else {
        if (b > 0) {
          b = S_MAX * Math.abs(Z);
        } else {
          b = S_MIN * Math.abs(Z);
        }
        b = constrainS(b);
        a = Math.abs(b * abRatio) * balaRow[A_SIGN_INDEX];
      }
    }
    this.ay = a;
    this.be = b;
    return this;
  }

  setValue(Z: number) : Lab {
    // values from 0 - 1
    this.el = constrainL(L_MAX * Z);
    return this;
  }

  setChroma(chroma: number) : Lab {
    chroma = Math.abs(chroma);
    // values from 0 - 1
    let a = this.ay;
    let b = this.be;
    const aSign = Math.sign(a);
    const bSign = Math.sign(b);
    const aTop = Math.abs(a) >= Math.abs(b);
    const abRatio = b === 0 ? 1.0 : Math.abs(a) / Math.abs(b);
    if (a !== 0 || b !== 0) {
      if (aTop) {
        if (a > 0) {
          a = S_MAX * chroma;
        } else {
          a = S_MIN * chroma;
        }
        a = constrainS(a);
        b = Math.abs(a / abRatio) * bSign;
      } else {
        if (b > 0) {
          b = S_MAX * chroma;
        } else {
          b = S_MIN * chroma;
        }
        b = constrainS(b);
        a = Math.abs(b * abRatio) * aSign;
      }
    }
    this.ay = a;
    this.be = b;
    return this;
  }


  adjustChroma(Z: number) : Lab {
    let a = this.ay;
    let b = this.be;
    const aSign = Math.sign(a);
    const bSign = Math.sign(b);
    const aTop = Math.abs(a) >= Math.abs(b);
    const abRatio = b === 0 ? 1.0 : Math.abs(a) / Math.abs(b);
    if (a !== 0 || b !== 0) {
      if (aTop) {
        a *= Math.abs(Z);
        a = constrainS(a);
        b = Math.abs(a / abRatio) * bSign;
      } else {
        b *= Math.abs(Z);
        b = constrainS(b);
        a = Math.abs(b * abRatio) * aSign;
      }
    }
    this.ay = a;
    this.be = b;
    return this;
  }

  getValueReflector(l: number) : number {
    const reflector = Math.sign(l - L_EDGE);
    return reflector === 0 ? 1 : reflector;
  }

  adjustValue(Z:number) : Lab {
    this.el = constrainL(this.el * Math.abs(Z));
    return this;
  }

  mirrorMoveValue(Z: number) : Lab {
    const reflected = this.getValueReflector(this.el);
    this.el = (-Z * reflected) + (L_EDGE + Math.abs(L_EDGE - this.el) * reflected);
    return this;
  }

  toRgb() : string {
    let y = (this.el + 16.0) / 116.0;
    let x = this.ay / 500.0 + y;
    let z = y - this.be / 200.0;
    x = (Math.pow(x, 3) > 0.008856) ? Math.pow(x, 3) : (x - 16 / 116.0) / 7.787;
    y = (Math.pow(y, 3) > 0.008856) ? Math.pow(y, 3) : (y - 16 / 116.0) / 7.787;
    z = (Math.pow(z, 3) > 0.008856) ? Math.pow(z, 3) : (z - 16 / 116.0) / 7.787;
    x = 95.047 * x;
    y = 100.0 * y;
    z = 108.883 * z;
    // now convert from xyz to rgb
    x /= 100.0;
    y /= 100.0;
    z /= 100.0;
    let rr = (x * 3.2406 + y * -1.5372 + z * -0.4986);
    let gg = (x * -0.9689 + y * 1.8758 + z * 0.0415);
    let bb = (x * 0.0557 + y * -0.2040 + z * 1.0570);
    rr = (rr > 0.0031308) ? 1.055 * (Math.pow(rr, 1 / 2.4)) - 0.055 : 12.92 * rr;
    gg = (gg > 0.0031308) ? 1.055 * (Math.pow(gg, 1 / 2.4)) - 0.055 : 12.92 * gg;
    bb = (bb > 0.0031308) ? 1.055 * (Math.pow(bb, 1 / 2.4)) - 0.055 : 12.92 * bb;
    const ri = Math.max(0, Math.min(Math.trunc(rr * 256), 255));
    const gi = Math.max(0, Math.min(Math.trunc(gg * 256), 255));
    const bi = Math.max(0, Math.min(Math.trunc(bb * 256), 255));
    return `rgb(${ri}, ${gi}, ${bi})`;
  }

  copy() : Lab {
    return new Lab(this.el, this.ay, this.be);
  }

}


const constrain = (amt: number, low: number, high: number) : number =>(amt < low) ? low : ((amt > high) ? high : amt);
const constrainL = (l: number): number => constrain(l, L_MIN, L_MAX);
const constrainS = (l: number): number => constrain(l, S_MIN, S_MAX);
const remap = (value: number, start1: number, stop1: number, start2: number, stop2: number)=>{
  return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1));
};


export class HCV {
  hue = 0;
  chroma = 0;
  value = 0;

  constructor(h:number, c: number, v: number){
    this.hue = h;
    this.chroma = c;
    this.value = v;
  }

  toRgb() : string {
    return "";
  }

}



