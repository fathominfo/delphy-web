const ATTRACTION = 0.3,
  DAMPING = 0.55,
  EPSILON = 0.0001;


export class SoftFloat {

  value : number;
  acceleration : number;
  velocity : number;
  damping : number;
  attraction : number;
  epsilon: number;
  target : number;
  targeting : boolean;


  constructor(value:number, damping:number=DAMPING, attraction:number=ATTRACTION, epsilon:number=EPSILON) {
    this.value = value !== undefined ? value : 0;
    this.acceleration = 0;
    this.velocity = 0;
    this.targeting = false;
    this.damping = damping;
    this.attraction = attraction;
    this.epsilon = epsilon;
    this.target = this.value;
  }

  set(v:number):void {
    this.value = v;
    this.target = v;
    this.targeting = false;
  }

  get():number {
    return this.value;
  }

  update():boolean {
    if (this.targeting) {
      this.acceleration += this.attraction * (this.target - this.value);
      this.velocity = (this.velocity + this.acceleration) * this.damping;
      this.value += this.velocity;
      this.acceleration = 0;
      if (Math.abs(this.velocity) > this.epsilon) {
        return true;
      }
      this.value = this.target;
      this.targeting = false;
    }
    return false;
  }

  setTarget(t:number):void {
    this.targeting = true;
    this.target = t;
  }

  atTarget():boolean {
    if (!this.targeting) {
      return true;
    }
    return Math.abs(this.value - this.target) < this.epsilon;
  }

  isTargeting():boolean {
    return this.targeting;
  }

  noTarget():void {
    this.targeting = false;
  }

  getTarget():number {
    return this.target;
  }
} // end SoftFloat class

