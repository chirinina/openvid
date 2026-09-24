"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { createScreenMaterial } from "@/lib/iphone-duo/screen-material";
import { foldChoreography } from "@/lib/iphone-duo/fold-choreography";
import { applyTextureCover } from "@/lib/phone3d.utils";
import { HDRI_FILES, sphericalCameraPos } from "@/lib/viewer-controls3d";
import type { Mockup3DStageProps } from "./Mockup3DStage";
import type { Phone3DApi } from "@/lib/phone3d-composite-draw.utils";
import type { Mockup3DMotionTransform } from "@/lib/mockup-motion-3d";

const DEG = Math.PI / 180;
const MODEL_SCALE = 0.04;
const CAMERA_RADIUS = 1.7;

export function IPhoneDuoScene({
  imageUrl, videoElement, cropArea, openingProgress = 1,
  initialRotationX = 6, initialRotationY = -12, initialRotationZ = 0,
  zoom = 1, autoRotate = false, rotationSpeed = 3.5,
  environment = "studio", glow = 1.2, shadowIntensity = 0,
  motionTransform, onRotationChange, onApi, onLoaded, rootRef, cameraRef,
}: Mockup3DStageProps & {
  rootRef: React.MutableRefObject<THREE.Group | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  onLoaded?: () => void;
}) {
  const { scene: source } = useGLTF("/models/iphone-duo.glb");
  const { gl, scene, invalidate } = useThree();
  const orbitRef = useRef<OrbitControlsType | null>(null);
  const textureRef = useRef<THREE.Texture[]>([]);
  const callbacks = useRef({ onLoaded, onApi });
  const pose = useRef({ openingProgress, motionTransform });
  useLayoutEffect(() => {
    callbacks.current = { onLoaded, onApi };
    pose.current = { openingProgress, motionTransform };
  });

  const model = useMemo(() => {
    const body = source.clone(true);
    const hinge = body.getObjectByName("folding-half");
    if (!hinge) throw new Error("iPhone Duo: missing folding-half");
    const inner = createScreenMaterial(false);
    const cover = createScreenMaterial(true);
    const owned = new Set<THREE.Material>([inner, cover]);
    body.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const replace = (material: THREE.Material) => {
        if (material.name === "inner-screen") return inner;
        if (material.name === "cover-screen") return cover;
        const clone = material.clone();
        owned.add(clone);
        return clone;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(replace) : replace(object.material);
    });
    return { body, hinge, inner, cover, owned };
  }, [source]);

  useEffect(() => () => {
    // GLTF geometry/textures belong to useGLTF's cache; only dispose our materials.
    model.owned.forEach((material) => material.dispose());
  }, [model]);

  const modelRef = useRef(model);
  useLayoutEffect(() => { modelRef.current = model; }, [model]);

  const applyOpening = useCallback((motion?: Mockup3DMotionTransform) => {
    const model = modelRef.current;
    const p = THREE.MathUtils.clamp(motion?.openingProgress ?? pose.current.openingProgress, 0, 1);
    const fold = foldChoreography(p);
    model.hinge.rotation.y = fold.angle;
    model.body.position.x = -4.12 * (1 - Math.max(0, Math.cos(fold.angle)));
    model.inner.uniforms.defocus.value = fold.innerDefocus;
    model.cover.uniforms.focusEdge.value = fold.coverFocusEdge;
    for (const material of [model.inner, model.cover]) {
      material.uniforms.progress.value = p;
      material.uniforms.blur.value = 28;
      material.uniforms.parallax.value = 1;
    }
    // Preserve the source shader's model-space screen projection after scaling/rotation.
    model.body.updateWorldMatrix(true, true);
    for (const material of [model.inner, model.cover]) {
      material.uniforms.bodyInverse.value.copy(model.body.matrixWorld).invert();
    }
  }, []);

  useFrame(() => applyOpening(pose.current.motionTransform));
  useEffect(() => { invalidate(); }, [openingProgress, motionTransform, invalidate]);

  useEffect(() => {
    let cancelled = false;
    const textures: THREE.Texture[] = [];
    const materials = [model.inner, model.cover];
    const targets = [[15.798708, 11.10349], [7.739354, 11.251288]];
    const updateScreen = (texture: THREE.Texture, index: number, width: number, height: number) => {
      const material = materials[index];
      const transform = new THREE.Texture();
      transform.flipY = texture.flipY;
      applyTextureCover(transform, width, height, targets[index][0], targets[index][1], imageUrl || videoElement ? cropArea : null);
      transform.updateMatrix();
      material.uniforms.screenTransform.value.copy(transform.matrix);
      transform.dispose();
      material.uniforms.screenMap.value = texture;
      material.uniforms.isVideo.value = texture instanceof THREE.VideoTexture ? 1 : 0;
      // Bind valid samplers for unused optional layers as well.
      material.uniforms.overlayMap.value = texture;
      material.uniforms.revealMap.value = texture;
      material.uniforms.resolution.value.set(width, height);
      material.needsUpdate = true;
      invalidate();
    };
    const setup = (texture: THREE.Texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      textures.push(texture);
      return texture;
    };
    const updateVideo = () => {
      if (cancelled || !videoElement || !videoElement.videoWidth) return;
      textures.forEach((texture, index) => updateScreen(texture, index, videoElement.videoWidth, videoElement.videoHeight));
      callbacks.current.onLoaded?.();
    };
    if (videoElement) {
      // Independent UV transforms for the wide inner screen and narrow cover.
      for (let index = 0; index < 2; index++) setup(new THREE.VideoTexture(videoElement));
      textureRef.current = textures;
      updateVideo();
      videoElement.addEventListener("loadeddata", updateVideo);
      videoElement.addEventListener("resize", updateVideo);
    } else {
      const urls = imageUrl ? [imageUrl, imageUrl] : [
        "/images/mockups-3d/apple-desert_duo.avif",
        "/images/mockups-3d/apple-desert-cover_duo.avif",
      ];
      Promise.all(urls.map(async (url, index) => {
        const texture = await new THREE.TextureLoader().loadAsync(url);
        if (cancelled) { texture.dispose(); return; }
        setup(texture);
        updateScreen(texture, index, texture.image.width, texture.image.height);
      })).then(() => {
        if (!cancelled) callbacks.current.onLoaded?.();
      }).catch((error) => {
        if (!cancelled) {
          console.error("iPhone Duo screen could not load", error);
          // The device remains usable even when an external image is unavailable.
          callbacks.current.onLoaded?.();
        }
      });
      textureRef.current = textures;
    }
    return () => {
      cancelled = true;
      videoElement?.removeEventListener("loadeddata", updateVideo);
      videoElement?.removeEventListener("resize", updateVideo);
      textureRef.current = [];
      textures.forEach((texture) => texture.dispose());
    };
  }, [model, imageUrl, videoElement, cropArea, gl, invalidate]);

  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    cam.position.set(...sphericalCameraPos(initialRotationX, initialRotationY, CAMERA_RADIUS / zoom));
    cam.lookAt(0, 0, 0);
    orbitRef.current?.update();
    invalidate();
  }, [initialRotationX, initialRotationY, zoom, cameraRef, invalidate]);

  useEffect(() => {
    const callback = callbacks.current.onApi;
    let previewPixelRatio = gl.getPixelRatio();
    const api = {
      renderAt(width: number, height: number, motion?: Mockup3DMotionTransform) {
        const cam = cameraRef.current;
        if (!cam) return;
        previewPixelRatio = gl.getPixelRatio();
        const ratio = Math.min(2, gl.capabilities.maxTextureSize / Math.max(1, width, height));
        const w = Math.max(1, Math.round(width));
        const h = Math.max(1, Math.round(height));
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        gl.setPixelRatio(ratio);
        gl.setSize(w, h, false);
        applyOpening(motion ?? pose.current.motionTransform);
        textureRef.current.forEach((texture) => {
          if (texture instanceof THREE.VideoTexture) texture.needsUpdate = true;
        });
        gl.render(scene, cam);
      },
      restorePreview() {
        const cam = cameraRef.current;
        if (!cam) return;
        const w = Math.max(1, gl.domElement.clientWidth);
        const h = Math.max(1, gl.domElement.clientHeight);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        gl.setPixelRatio(previewPixelRatio);
        gl.setSize(w, h, false);
        applyOpening(pose.current.motionTransform);
        invalidate();
      },
      hasBuiltInShadow: false,
      getVisualSize: () => ({ width: 1100, height: 900, offsetY: -(shadowIntensity ** 2 * 60 * 0.8) / 2 }),
    } satisfies Phone3DApi;
    callback?.(api);
    return () => callback?.(null);
  }, [gl, scene, cameraRef, applyOpening, shadowIntensity, invalidate]);

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={30} near={0.01} far={100}
        position={sphericalCameraPos(initialRotationX, initialRotationY, CAMERA_RADIUS / zoom)} />
      <OrbitControls ref={orbitRef} enableZoom={false} enablePan={false} enableDamping
        autoRotate={autoRotate} autoRotateSpeed={rotationSpeed}
        onEnd={() => {
          const orbit = orbitRef.current;
          if (orbit) onRotationChange?.(90 - orbit.getPolarAngle() / DEG, orbit.getAzimuthalAngle() / DEG);
        }} />
      <Environment files={HDRI_FILES[environment]} environmentIntensity={glow} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[-0.8, 1.2, 2]} intensity={3} />
      <directionalLight position={[1, -0.5, 1]} intensity={0.7} color="#b7ccff" />
      <group ref={rootRef} rotation={[0, 0, initialRotationZ * DEG]}>
        <group scale={MODEL_SCALE}>
          <primitive object={model.body} dispose={null} />
        </group>
      </group>
    </>
  );
}
