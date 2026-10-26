"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Float, useGLTF } from "@react-three/drei";
import { cn } from "@/lib/cn";

class OrbitErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail?.();
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

const MODELS = [
  {
    src: "/brand/models/priest-ring-v2.glb",
    label: "The Priest Ring",
    scale: 1.15,
    position: [0, -0.05, 0],
  },
  {
    src: "/brand/models/imago-dei-ring-v1.glb",
    label: "Imago Dei Ring",
    scale: 1.1,
    position: [0, -0.04, 0],
  },
  {
    src: "/brand/models/triada-necklace-v1.glb",
    label: "The Triada Necklace",
    scale: 0.95,
    position: [0, 0.02, 0],
  },
  {
    src: "/brand/models/stone-pendant-earrings-v1.glb",
    label: "Convertible Earrings",
    scale: 1.05,
    position: [0, -0.02, 0],
  },
  {
    src: "/brand/models/covenant-ring-v1.glb",
    label: "Covenant Ring",
    scale: 1.1,
    position: [0, -0.05, 0],
  },
];

const PHOTO_ORBIT = [
  { src: "/brand/jewellery/priest-ring.jpg", alt: "The Priest Ring" },
  { src: "/brand/jewellery/imago-dei-ring.jpg", alt: "Imago Dei Ring" },
  { src: "/brand/jewellery/triada-necklace.jpg", alt: "The Triada Necklace" },
  { src: "/brand/jewellery/convertible-earrings.jpg", alt: "Convertible Earrings" },
  { src: "/brand/jewellery/tides-treasure.jpg", alt: "Tides Treasure earrings" },
  { src: "/brand/jewellery/footprints-sand.jpg", alt: "Footprints in the Sand pendant" },
];

function JewelleryMesh({ src, scale, position }) {
  const group = useRef(null);
  const { scene } = useGLTF(src);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useFrame((_, delta) => {
    if (group.current) {
      group.current.rotation.y += delta * 0.35;
    }
  });

  return (
    <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.35}>
      <group ref={group} scale={scale} position={position}>
        <primitive object={cloned} />
      </group>
    </Float>
  );
}

MODELS.forEach((m) => useGLTF.preload(m.src));

function Scene({ index }) {
  const model = MODELS[index % MODELS.length];
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 2]} intensity={1.15} color="#fff6e8" />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} color="#c7ae8a" />
      <Suspense fallback={null}>
        <JewelleryMesh
          key={model.src}
          src={model.src}
          scale={model.scale}
          position={model.position}
        />
        <Environment preset="studio" environmentIntensity={0.45} />
      </Suspense>
      <ContactShadows
        position={[0, -1.15, 0]}
        opacity={0.35}
        scale={8}
        blur={2.4}
        far={3}
        color="#292622"
      />
    </>
  );
}

function PhotoCarousel({ className }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % PHOTO_ORBIT.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  const current = PHOTO_ORBIT[index];

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      {PHOTO_ORBIT.map((photo, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.src}
          src={photo.src}
          alt={photo.alt}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out",
            i === index ? "opacity-100" : "opacity-0"
          )}
          decoding="async"
        />
      ))}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(41,38,34,0.45)_100%)]" />
      <p className="absolute bottom-5 left-5 right-5 font-display text-lg text-white/90">
        {current.alt}
      </p>
    </div>
  );
}

/**
 * Desktop: WebGL orbit of official Triada GLB jewellery models.
 * Mobile / reduced-motion: photographic carousel from live site assets.
 */
export function JewelleryOrbit({ className }) {
  const [index, setIndex] = useState(0);
  const [useWebGL, setUseWebGL] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mqDesktop = window.matchMedia("(min-width: 768px)");
    const decide = () => {
      setUseWebGL(mqDesktop.matches && !mqReduce.matches && !webglFailed);
    };
    decide();
    mqReduce.addEventListener("change", decide);
    mqDesktop.addEventListener("change", decide);
    return () => {
      mqReduce.removeEventListener("change", decide);
      mqDesktop.removeEventListener("change", decide);
    };
  }, [webglFailed]);

  useEffect(() => {
    if (!useWebGL) return undefined;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % MODELS.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, [useWebGL]);

  if (!useWebGL) {
    return <PhotoCarousel className={className} />;
  }

  const label = MODELS[index % MODELS.length].label;

  return (
    <OrbitErrorBoundary
      onFail={() => setWebglFailed(true)}
      fallback={<PhotoCarousel className={className} />}
    >
      <div className={cn("relative h-full w-full", className)}>
        <Canvas
          camera={{ position: [0, 0.35, 3.2], fov: 38 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <Scene index={index} />
        </Canvas>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#2a2218]/80 to-transparent px-8 pb-8 pt-16">
          <p className="font-display text-2xl text-white">{label}</p>
          <p className="mt-1 text-sm text-white/70">
            Official Triada Designs pieces · Salt &amp; Spirit
          </p>
        </div>
      </div>
    </OrbitErrorBoundary>
  );
}
