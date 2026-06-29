export type Face = 'N' | 'S' | 'E' | 'W'; // N=+Y, S=-Y, E=+X, W=-X
export type JointType = 'openlock-clip' | 'cantilever';
export type ClosureType = 'screw' | 'snap'; // how the lid is retained
export type PortType = 'usb-c' | 'usb-a' | 'micro-usb' | 'barrel' | 'rect' | 'circle';

export type ComponentType =
  | 'pot' | 'push-button' | 'toggle' | 'encoder' | 'led' | 'slider' | 'display';

// Discriminated by the catalog shape of the component's type.
export type ComponentSize =
  | { dia: number }                     // round
  | { w: number; h: number }            // rect
  | { travel: number; slotW: number };  // slot

export interface PlacedComponent {
  id: string;        // crypto.randomUUID()
  type: ComponentType;
  x: number;         // mm from lid center, +X = E (right)
  y: number;         // mm from lid center, +Y = N (back)
  rotation: number;  // degrees CCW; affects rect + slot only
  size?: ComponentSize;
}

export interface ComponentArray {
  id: string;            // crypto.randomUUID()
  type: ComponentType;   // one type per array
  cols: number;          // >= 1
  rows: number;          // >= 1
  width: number;         // mm, span across columns
  length: number;        // mm, span across rows
  x: number; y: number;  // array center, lid-center mm
  rotation: number;      // degrees CCW, whole-array
  size?: ComponentSize;  // optional override of the catalog default
}

export interface Faceplate {
  snap: number;                    // grid step, mm
  components: PlacedComponent[];
  arrays: ComponentArray[];
}

/** Component no-go volume, authored in PCB-corner space.
 *  x,y = corner offset on board top (x in [0,L], y in [0,W]).
 *  z   = base height above board top surface (default 0).
 *  w,d,h = extents along x,y,z. */
export interface KeepOut {
  label: string;
  x: number; y: number; z: number;
  w: number; d: number; h: number;
}

export interface Port {
  face: Face;
  type: PortType;
  anchor: string;        // KeepOut.label this port aligns to
  margin: number;        // clearance added around the opening, mm
  size?: { w: number; h: number }; // override for type 'rect'; diameter via w for 'circle'
}

export interface EnclosureSpec {
  pcb: { length: number; width: number; height: number }; // height = board thickness
  clearances: { wall: number; floor: number; ceiling: number; pcbGap: number };
  standoff: { height: number; holeDia: number };
  keepouts: KeepOut[];
  ports: Port[];
  closure: { type: ClosureType };
  // Corner screw bosses (used when closure.type === 'screw'). Self-tapping by default:
  //   dia = screw shank, pilotDia = boss bore the screw threads into,
  //   bossDia = outer Ø of the boss column, headDia = lid counterbore Ø.
  screw: { dia: number; pilotDia: number; bossDia: number; headDia: number };
  joint: { type: JointType; spacing: number; tolerance: number }; // used when closure.type === 'snap'
  lid: { lipDepth: number; lipInset: number; thickness: number };
  faceplate: Faceplate;
  chamfer: number; // 45° lead-in / edge-relief size, mm (0 disables)
  tolerance: number; // global fit tuning, mm
  exports: ('stl' | 'scad')[];
}

export const DEFAULT_SPEC: EnclosureSpec = {
  pcb: { length: 60, width: 40, height: 1.6 },
  clearances: { wall: 2.0, floor: 2.0, ceiling: 6.0, pcbGap: 1.0 },
  standoff: { height: 3.0, holeDia: 2.5 },
  keepouts: [
    { label: 'usb', x: 24, y: 38, z: 0, w: 9, d: 2, h: 3.2 }, // USB-C against north edge
  ],
  ports: [
    { face: 'N', type: 'usb-c', anchor: 'usb', margin: 0.5 },
  ],
  closure: { type: 'screw' },
  screw: { dia: 3.0, pilotDia: 2.5, bossDia: 6.0, headDia: 5.5 }, // M3 self-tapping
  joint: { type: 'openlock-clip', spacing: 20, tolerance: 0.2 },
  lid: { lipDepth: 4.0, lipInset: 1.2, thickness: 2.0 },
  faceplate: { snap: 2.5, components: [], arrays: [] },
  chamfer: 0.8,
  tolerance: 0.2,
  exports: ['stl', 'scad'],
};
