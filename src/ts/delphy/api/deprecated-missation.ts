// automatically generated by the FlatBuffers compiler, do not modify

import * as flatbuffers from 'flatbuffers';

export class DEPRECATED_Missation {
  bb: flatbuffers.ByteBuffer|null = null;
  bb_pos = 0;
  __init(i:number, bb:flatbuffers.ByteBuffer):DEPRECATED_Missation {
  this.bb_pos = i;
  this.bb = bb;
  return this;
}

nodeIdx():number {
  return this.bb!.readInt32(this.bb_pos);
}

site():number {
  return this.bb!.readInt32(this.bb_pos + 4);
}

static sizeOf():number {
  return 8;
}

static createDEPRECATED_Missation(builder:flatbuffers.Builder, node_idx: number, site: number):flatbuffers.Offset {
  builder.prep(4, 8);
  builder.writeInt32(site);
  builder.writeInt32(node_idx);
  return builder.offset();
}

}