// automatically generated by the FlatBuffers compiler, do not modify

import * as flatbuffers from 'flatbuffers';

import { RealSeqLetter } from '../../delphy/api/real-seq-letter.js';


export class Mut {
  bb: flatbuffers.ByteBuffer|null = null;
  bb_pos = 0;
  __init(i:number, bb:flatbuffers.ByteBuffer):Mut {
  this.bb_pos = i;
  this.bb = bb;
  return this;
}

from():RealSeqLetter {
  return this.bb!.readUint8(this.bb_pos);
}

to():RealSeqLetter {
  return this.bb!.readUint8(this.bb_pos + 1);
}

site():number {
  return this.bb!.readInt32(this.bb_pos + 4);
}

t():number {
  return this.bb!.readFloat32(this.bb_pos + 8);
}

static sizeOf():number {
  return 12;
}

static createMut(builder:flatbuffers.Builder, from: RealSeqLetter, to: RealSeqLetter, site: number, t: number):flatbuffers.Offset {
  builder.prep(4, 12);
  builder.writeFloat32(t);
  builder.writeInt32(site);
  builder.pad(2);
  builder.writeInt8(to);
  builder.writeInt8(from);
  return builder.offset();
}

}