// The 3D view of the cabinet (M6 part 3): three.js through @react-three/fiber (both MIT). Every device is a box
// from its dimensions, the enclosure an outline, the plate, rails and ducts thin boxes, and the door devices hang
// inside the door. Orbit with the left button, pan with the right, zoom with the wheel. This module is loaded
// only when the view is opened (App.tsx lazy import), so three.js stays out of the startup.
import { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { t } from '@shared/i18n';
import { cabinetOf } from '@shared/cabinet/model';
import { shortDesignation } from '@shared/cabinet/draw';
import { cabinetDevices, type LayoutGroup } from '@shared/cabinet/size';
import { useEditor } from '../state/editor';
import { Modal } from './Modal';

const COLOURS: Record<LayoutGroup | 'other', string> = { power: '#d9534f', heavy: '#8d6e63', control: '#4f8fd6', terminals: '#e0b13b', door: '#5cb85c', other: '#9aa0a6' };
const K = 0.01; // millimetres to scene units

interface Item {
  id: string;
  label: string;
  c: [number, number, number];
  s: [number, number, number];
  colour: string;
  kind: 'device' | 'plate' | 'rail' | 'duct';
}

function useItems() {
  const project = useEditor((s) => s.history.present);
  const lib = useEditor((s) => s.lib);
  return useMemo(() => {
    const cab = cabinetOf(project);
    const enc = cab.enclosure;
    if (!enc) return null;
    const D = enc.d ?? 300;
    const back = -D / 2;
    const pd = cab.plate?.d ?? 3;
    const groupOf = new Map(cabinetDevices(project, lib).map((d) => [d.key, d.group]));
    const items: Item[] = [];
    const at = (x: number, y: number, w: number, h: number, ox: number, oy: number) => [x - ox + w / 2 - enc.w / 2, enc.h / 2 - (y - oy + h / 2)] as const;
    if (cab.plate) {
      const [cx, cy] = at(cab.plate.x, cab.plate.y, cab.plate.w, cab.plate.h, enc.x, enc.y);
      items.push({ id: cab.plate.id, label: t('Mounting plate'), c: [cx, cy, back + pd / 2], s: [cab.plate.w, cab.plate.h, pd], colour: '#b0b7bd', kind: 'plate' });
    }
    for (const r of cab.rails) { const [cx, cy] = at(r.el.x, r.el.y, r.el.w, r.el.h, enc.x, enc.y); items.push({ id: r.el.id, label: r.el.designation ?? t('DIN rail'), c: [cx, cy, back + pd + 3.75], s: [r.el.w, r.el.h, 7.5], colour: '#cfd4d8', kind: 'rail' }); }
    for (const d of cab.ducts) { const dd = d.el.d ?? 60; const [cx, cy] = at(d.el.x, d.el.y, d.el.w, d.el.h, enc.x, enc.y); items.push({ id: d.el.id, label: d.el.designation ?? t('Duct'), c: [cx, cy, back + pd + dd / 2], s: [d.el.w, d.el.h, dd], colour: '#7e8b94', kind: 'duct' }); }
    for (const p of cab.devices) {
      const e = p.el;
      const door = cab.doors.includes(p.page);
      const frame = door ? p.page.elements.find((x) => x.kind === 'cab' && x.item === 'enclosure') : enc;
      const fx = frame && 'x' in frame ? frame.x : enc.x, fy = frame && 'y' in frame ? frame.y : enc.y;
      const [cx, cy] = at(e.x, e.y, e.w, e.h, fx, fy);
      const dep = e.d ?? 60;
      const g = door ? 'door' : (groupOf.get(e.designation as string) ?? 'other');
      items.push({ id: e.id, label: shortDesignation(e.designation ?? ''), c: [cx, cy, door ? D / 2 - dep / 2 : back + pd + dep / 2], s: [e.w, e.h, dep], colour: COLOURS[g], kind: 'device' });
    }
    return { enc: { w: enc.w, h: enc.h, d: D }, items };
  }, [project, lib]);
}

function Controls({ distance }: { distance: number }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    camera.position.set(distance * 0.55, distance * 0.25, distance);
    camera.lookAt(0, 0, 0);
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.update();
    return () => c.dispose();
  }, [camera, gl, distance]);
  return null;
}

function Scene({ model, door, onHover }: { model: NonNullable<ReturnType<typeof useItems>>; door: boolean; onHover: (s: string) => void }) {
  const { enc, items } = model;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(enc.w * K, enc.h * K, enc.d * K)), [enc]);
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 8, 10]} intensity={1.1} />
      <directionalLight position={[-6, -2, -4]} intensity={0.3} />
      <lineSegments geometry={edges}><lineBasicMaterial color="#e6e8ea" /></lineSegments>
      {door && (
        <mesh position={[0, 0, (enc.d / 2) * K]}>
          <planeGeometry args={[enc.w * K, enc.h * K]} />
          <meshStandardMaterial color="#9fb6c7" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      {items.map((it) => (
        <mesh key={it.id} position={[it.c[0] * K, it.c[1] * K, it.c[2] * K]} onPointerOver={(e) => { e.stopPropagation(); onHover(it.label); }} onPointerOut={() => onHover('')}>
          <boxGeometry args={[it.s[0] * K, it.s[1] * K, it.s[2] * K]} />
          <meshStandardMaterial color={it.colour} transparent={it.kind === 'duct'} opacity={it.kind === 'duct' ? 0.55 : 1} />
        </mesh>
      ))}
      <Controls distance={Math.max(enc.w, enc.h, enc.d) * K * 1.55} />
    </>
  );
}

const webgl = (): boolean => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

export default function Cabinet3D() {
  const model = useItems();
  const [door, setDoor] = useState(true);
  const [hover, setHover] = useState('');
  const close = () => useEditor.getState().setDialog(null);
  return (
    <Modal title={t('Cabinet in 3D')} wide onClose={close}>
      {!model ? <p className="hint">{t('There is no enclosure on the layout yet.')}</p> : !webgl() ? <p className="warn" role="alert">{t('This computer cannot draw 3D (WebGL is not available).')}</p> : (
        <>
          <div className="view3d" data-testid="cabinet-3d" style={{ height: 'min(56vh, 520px)', background: '#1b1f23', borderRadius: 6 }}>
            <Canvas camera={{ fov: 40, near: 0.1, far: 500 }} gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={() => { (window as unknown as { __cabinet3dReady?: boolean }).__cabinet3dReady = true; }}>
              <Scene model={model} door={door} onHover={setHover} />
            </Canvas>
          </div>
          <div className="bom-controls">
            <label className="prop check"><input type="checkbox" checked={door} onChange={(e) => setDoor(e.target.checked)} /><span>{t('Show the door')}</span></label>
            <span className="hint" data-testid="view3d-hover">{hover || t('Drag to turn, right button to move, wheel to zoom. Point at a device to see its name.')}</span>
          </div>
          <ul className="chips legend">{(['power', 'heavy', 'control', 'terminals', 'door'] as const).map((g) => <li key={g}><span style={{ background: COLOURS[g], display: 'inline-block', width: 10, height: 10, marginRight: 6 }} />{g === 'power' ? t('Power') : g === 'heavy' ? t('Plate-mounted') : g === 'control' ? t('Control') : g === 'terminals' ? t('Terminals') : t('Door')}</li>)}</ul>
        </>
      )}
    </Modal>
  );
}
