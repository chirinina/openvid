"use client";
import { Device3DBoundary } from "./Device3DBoundary";
import { IPhoneDuoScene } from "./IPhoneDuo3DViewer";
import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { IPhone13ProMax3DApi, IPhone13ProMaxScene } from "./IPhone13ProMax3DViewer";
import { DoubleIPhone3DApi, DoubleIPhoneScene } from "./DoubleIPhone3DViewer";
import { Phone3DApi, Phone3DScene } from "./Phone3DViewer";
import { Laptop3DApi, LaptopScene } from "./Laptop3DViewer";
import { IPhone17ProMax3DApi, IPhone17ProMaxScene } from "./IPhone17ProMax3DViewer";
import { IPadMini63DApi, IPadMiniScene } from "./IPadMini63DViewer";
import { ImageMaskConfigLike, PHONE_DEVICE_URLS } from "@/lib/phone3d.utils";
import type { ImageDeviceId } from "@/types/mockup.types";
import { EnvironmentPreset } from "@/lib/viewer-controls3d";
import { REST_MOCKUP_3D_MOTION, type Mockup3DMotionTransform } from "@/lib/mockup-motion-3d";
import { useFrame } from "@react-three/fiber";

export type Mockup3DApi =
  | IPhone13ProMax3DApi
  | DoubleIPhone3DApi
  | Phone3DApi
  | Laptop3DApi
  | IPhone17ProMax3DApi
  | IPadMini63DApi;

export interface Mockup3DStageProps {
  imageUrl?: string | null;
  imageMaskConfig?: ImageMaskConfigLike | null;
  cropArea?: { x: number; y: number; width: number; height: number } | null;
  initialRotationX?: number;
  initialRotationY?: number;
  initialRotationZ?: number;
  openingProgress?: number;   // laptop / foldable phone
  modelUrl?: string;          // solo devices genéricos (phone/iphone)
  onRotationChange?: (rx: number, ry: number) => void;
  onMount?: (canvas: HTMLCanvasElement) => void;
  onApi?: (api: Mockup3DApi | null) => void;
  scale?: number;
  zoom?: number;
  shadowIntensity?: number;
  shadowColor?: string;
  videoElement?: HTMLVideoElement | null;
  autoRotate?: boolean;
  rotationSpeed?: number;
  glow?: number;
  environment?: EnvironmentPreset;
  isSelected?: boolean;
  isHovered?: boolean;
  onHoverChange?: (isHovered: boolean) => void;
  onSelectChange?: (isSelected: boolean) => void;
  /** 3D motion transform applied additively to the root group every frame. */
  motionTransform?: Mockup3DMotionTransform;
  /** External root group ref, used for export-time motion application. */
  rootRef?: React.MutableRefObject<THREE.Group | null>;
}

interface StageProps extends Mockup3DStageProps {
  device: ImageDeviceId;
  cameraRef?: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  onLoadedChange?: (loaded: boolean) => void;
}

/**
 * Applies a 3D motion transform to the root group every frame.
 * Records the base rotation/scale/position on first mount, then adds
 * the motion transform additively so the model's base pose is preserved.
 */
function Motion3DApplicator({
  rootRef,
  motionTransform,
  device,
  baseRotationZ,
}: {
  rootRef: React.MutableRefObject<THREE.Group | null>;
  motionTransform: Mockup3DMotionTransform;
  device: ImageDeviceId;
  baseRotationZ: number;
}) {
  const baseRef = useRef<{ rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; px: number; py: number; pz: number } | null>(null);

  // Reset the captured base transform whenever the device OR the target
  // base rotationZ changes. Without the second dependency, this ref stays
  // frozen at whatever rotation.z the model had at mount time, and every
  // useFrame tick below overwrites root.rotation.z back to that stale
  // value — silently undoing any rotateZ slider change made afterward.
  useEffect(() => {
    baseRef.current = null;
  }, [device, baseRotationZ]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || baseRef.current) return;
    baseRef.current = {
      rx: root.rotation.x,
      ry: root.rotation.y,
      rz: root.rotation.z,
      sx: root.scale.x,
      sy: root.scale.y,
      sz: root.scale.z,
      px: root.position.x,
      py: root.position.y,
      pz: root.position.z,
    };
  }, [rootRef, device]);

  useFrame(() => {
    const root = rootRef.current;
    if (!root) return;
    // Capture the base transform lazily inside useFrame in case the group
    // mounts after the initial useEffect (R3F suspends scene children).
    if (!baseRef.current) {
      baseRef.current = {
        rx: root.rotation.x,
        ry: root.rotation.y,
        rz: root.rotation.z,
        sx: root.scale.x,
        sy: root.scale.y,
        sz: root.scale.z,
        px: root.position.x,
        py: root.position.y,
        pz: root.position.z,
      };
    }
    const base = baseRef.current;
    const m = motionTransform;
    root.rotation.x = base.rx + m.rotX;
    root.rotation.y = base.ry + m.rotY;
    root.rotation.z = base.rz + m.rotZ;
    root.scale.x = base.sx * m.scale;
    root.scale.y = base.sy * m.scale;
    root.scale.z = base.sz * m.scale;
    root.position.x = base.px + m.posX;
    root.position.y = base.py + m.posY;
    root.position.z = base.pz + m.posZ;
  });

  return null;
}

export function Mockup3DStage(props: StageProps) {
  return <Device3DBoundary key={props.device} modelUrl={PHONE_DEVICE_URLS[props.device]}><StageContent {...props} /></Device3DBoundary>;
}

function StageContent({ device, rootRef: externalRootRef, cameraRef: externalCameraRef, onLoadedChange, ...props }: StageProps) {
  const internalRootRef = useRef<THREE.Group | null>(null);
  const internalCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rootRef = externalRootRef ?? internalRootRef;
  const cameraRef = externalCameraRef ?? internalCameraRef;
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  const hasMotion = props.motionTransform && props.motionTransform !== REST_MOCKUP_3D_MOTION;

  const [loaded, setLoaded] = useState(false);
  const [prevDevice, setPrevDevice] = useState(device);
  if (device !== prevDevice) {
    setPrevDevice(device);
    setLoaded(false);
    onLoadedChange?.(false);
  }

  const markLoaded = useCallback(() => {
    setLoaded(true);
    onLoadedChange?.(true);
  }, [onLoadedChange]);

  const handleMount = (canvas: HTMLCanvasElement) => {
    canvasElRef.current = canvas;
    props.onMount?.(canvas);
  };

  return (
    <>
      <Canvas
        style={{ width: "100%", height: "100%", overflow: "visible" }}
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
        dpr={device === "iphone-duo" ? [1, 2] : 3}
        frameloop={props.videoElement || props.autoRotate || hasMotion ? "always" : "demand"}
        resize={{ scroll: false, offsetSize: device === "iphone-duo", debounce: { scroll: 0, resize: 0 } }}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.0;
          scene.environmentIntensity = 1.6;
          handleMount(gl.domElement);
        }}
      >
        <Motion3DApplicator rootRef={rootRef} motionTransform={props.motionTransform ?? REST_MOCKUP_3D_MOTION} device={device} baseRotationZ={props.initialRotationZ ?? 0} />
        <Suspense fallback={null}>
          {device === "iphone-13-pro-max" && (
            <IPhone13ProMaxScene {...props} rootRef={rootRef} cameraRef={cameraRef} onLoaded={markLoaded} />
          )}
          {device === "double_iphone_13_pro" && (
            <DoubleIPhoneScene {...props} rootRef={rootRef} cameraRef={cameraRef} onLoaded={markLoaded} />
          )}
          {device === "iphone-17-pro-max" && (
            <IPhone17ProMaxScene {...props} rootRef={rootRef} cameraRef={cameraRef} onLoaded={markLoaded} />
          )}
          {device === "iphone-duo" && (
            <IPhoneDuoScene {...props} rootRef={rootRef} cameraRef={cameraRef} onLoaded={markLoaded} />
          )}
          {device === "laptop" && (
            <LaptopScene {...props} rootRef={rootRef} cameraRef={cameraRef} onLoaded={markLoaded} />
          )}
          {device === "ipad_mini_6_2021" && (
            <IPadMiniScene {...props} rootRef={rootRef} cameraRef={cameraRef} onLoaded={markLoaded} />
          )}
          {(device === "iphone" || device === "phone") && (
            <Phone3DScene {...props} rootRef={rootRef} cameraRef={cameraRef} onLoaded={markLoaded} />
          )}
        </Suspense>
      </Canvas>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 4 }}>
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </>
  );
}