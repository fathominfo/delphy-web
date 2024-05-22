
/* time of Most Recent Common Ancestor */
export class PctLabel {

  label: HTMLLabelElement;
  bar: HTMLDivElement;
  pct: number;
  color: string;

  constructor(color:string, template:HTMLDivElement) {
    let label = template.querySelector('label');
    if (!label) {
      throw new Error('could not make a percent label, as there was no label element')
    }
    this.label = label as HTMLLabelElement;
    this.bar = template.querySelector('.selection--bar-value') as HTMLDivElement;
    this.pct = 0;
    this.color = color;
  }

  setData(data:number):void {
    this.pct = data * 100;
    const pct = `${Math.round(this.pct)}%`;
    this.label.innerHTML = pct;
    this.bar.style.width = pct;
  }


  draw():void {
    // const {p, pct, color} = this;
  }

  remove() {
    // this.p.remove();
  }

}