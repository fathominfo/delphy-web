import { Distribution } from "./distribution";


export class TimeDistribution extends Distribution {

  name: string;

  constructor(name: string, times: number[]) {
    super(times);
    this.name = name;
  }
}

