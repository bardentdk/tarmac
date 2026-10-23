/**
 * BoxScene.tsx — le boîtier Tarmac en 3D, sur l'accueil.
 *
 * Chargé à part (React.lazy) : three.js ne pèse que sur la page qui l'affiche.
 * La chorégraphie reprend le langage de l'app :
 *   1. le boîtier arrive en tournant et se pose ;
 *   2. la LED clignote comme pendant la connexion OBD, puis reste fixe ;
 *   3. le logo s'allume en vert, le feu vert du sapin.
 * Ensuite il flotte, suit la souris, pivote au défilement pour montrer sa
 * prise, et se laisse tourner à la main (il revient en place quand on lâche).
 *
 * Éclairage : des panneaux de lumière déclarés ici (Lightformer), aucune image
 * HDR téléchargée. Le rendu s'arrête quand la scène sort de l'écran.
 */
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, PresentationControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const MODEL = '/models/tarmac-box.glb';
const POSTER = '/models/tarmac-box-poster.png';

/** Le GLB est en mètres (62 mm hors tout) : on le ramène à ~2,5 unités. */
const SCALE = 34;
/** Pose de repos : dessus, face avant et prise OBD visibles. */
const REST = { x: 0.08, y: -0.55 };
const INTRO_S = 1.6;
const LOGO_GLOW = 0.55;
const LED_GLOW = 1.2;

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Box({ still }: { still: boolean }) {
  // Pas de Draco (son décodeur viendrait d'un CDN) ; Meshopt est embarqué.
  const { scene } = useGLTF(MODEL, false, true);
  const group = useRef<THREE.Group>(null);
  const scroll = useRef(0);

  const parts = useMemo(() => {
    const emissive = (name: string) => {
      const m = (scene.getObjectByName(name) as THREE.Mesh | undefined)?.material;
      return m instanceof THREE.MeshStandardMaterial ? m : null;
    };
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    return { logo: emissive('Logo'), led: emissive('LED') };
  }, [scene]);

  useEffect(() => {
    const onScroll = () => { scroll.current = Math.min(1, window.scrollY / window.innerHeight); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = still ? 10 : state.clock.elapsedTime;
    const p = easeOut(t / INTRO_S);
    const idle = still ? 0 : 1;

    g.rotation.y = THREE.MathUtils.lerp(REST.y - 2.4, REST.y, p)
      + idle * (Math.sin(t * 0.45) * 0.1 + state.pointer.x * 0.3)
      + scroll.current * 1.1;
    g.rotation.x = THREE.MathUtils.lerp(0.6, REST.x, p) - idle * state.pointer.y * 0.1;
    g.position.y = THREE.MathUtils.lerp(-1.4, 0, p) + idle * Math.sin(t * 1.1) * 0.035;

    if (parts.led) {
      // Clignote pendant la « connexion », puis reste allumée.
      const blinking = t > INTRO_S * 0.6 && t < INTRO_S + 1.4;
      parts.led.emissiveIntensity = blinking ? (Math.sin(t * 16) > 0 ? LED_GLOW : 0.05) : t >= INTRO_S + 1.4 ? LED_GLOW : 0.05;
    }
    if (parts.logo) parts.logo.emissiveIntensity = LOGO_GLOW * smooth(INTRO_S + 1.2, INTRO_S + 2.2, t);
  });

  return (
    <group ref={group}>
      <primitive object={scene} scale={SCALE} position={[0, -0.3, 0]} />
    </group>
  );
}

function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={3.4} position={[0, 4, 1.5]} rotation-x={Math.PI / 2} scale={[6, 3, 1]} />
      <Lightformer form="rect" intensity={1.8} position={[-4, 1, 2]} rotation-y={Math.PI / 2.5} scale={[3, 2, 1]} />
      <Lightformer form="rect" intensity={0.8} position={[4, 0.5, -1]} rotation-y={-Math.PI / 2} scale={[2, 2, 1]} />
      {/* Liseré vert de la charte, en contre-jour. */}
      <Lightformer form="rect" color="#C6F432" intensity={1.4} position={[0, 0.6, -4]} scale={[5, 0.6, 1]} />
    </Environment>
  );
}

/** Repli : l'image du boîtier, si WebGL est absent ou si le chargement échoue. */
class Fallback extends Component<{ children: ReactNode; poster: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.poster : this.props.children; }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function BoxScene() {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [still] = useState(reducedMotion);
  const [gl] = useState(webglAvailable);

  useEffect(() => {
    if (!wrap.current) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '100px' });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  const poster = <img src={POSTER} alt="Le boîtier OBD Tarmac" className="box-poster" />;

  return (
    <div ref={wrap} className="box-scene" role="img" aria-label="Le boîtier OBD Tarmac en 3D. Fais-le tourner à la souris ou au doigt.">
      {!ready ? poster : null}
      {gl ? (
        <Fallback poster={poster}>
          <Canvas
            className={ready ? 'box-canvas ready' : 'box-canvas'}
            dpr={[1, 2]}
            frameloop={visible ? 'always' : 'never'}
            shadows
            camera={{ position: [0, 1.5, 5.2], fov: 30 }}
            gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping }}
            onCreated={({ camera }) => camera.lookAt(0, 0.05, 0)}
          >
            <ambientLight intensity={0.3} />
            <directionalLight position={[-3, 5, 3]} intensity={1.9} castShadow />
            <Suspense fallback={null}>
              <Studio />
              <PresentationControls
                global={false}
                cursor
                snap
                speed={1.4}
                polar={[-0.25, 0.35]}
                azimuth={[-Math.PI / 1.4, Math.PI / 1.4]}
              >
                <Box still={still} />
              </PresentationControls>
              <ContactShadows position={[0, -0.55, 0]} opacity={0.55} scale={6} blur={2.6} far={1.6} color="#000000" />
              <Ready onReady={() => setReady(true)} />
            </Suspense>
          </Canvas>
        </Fallback>
      ) : null}
    </div>
  );
}

/** Signale le premier rendu, une fois le modèle chargé (fin du Suspense). */
function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onReady();
  });
  return null;
}

useGLTF.preload(MODEL, false, true);
