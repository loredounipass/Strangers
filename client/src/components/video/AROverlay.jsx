import React, { useRef, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { FaceMesh } from '@mediapipe/face_mesh';
import * as THREE from 'three';

const DOG_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMDAgMjAwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCI+CiAgPGRlZnM+CiAgICA8cmFkaWFsR3JhZGllbnQgaWQ9ImVhckdyYWRMZWZ0IiBjeD0iMzAlIiBjeT0iMzAlIiByPSI3MCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjYTA2MDMwIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzUwMzAxMCIvPgogICAgPC9yYWRpYWxHcmFkaWVudD4KICAgIDxyYWRpYWxHcmFkaWVudCBpZD0iZWFyR3JhZFJpZ2h0IiBjeD0iNzAlIiBjeT0iMzAlIiByPSI3MCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjYTA2MDMwIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzUwMzAxMCIvPgogICAgPC9yYWRpYWxHcmFkaWVudD4KICAgIDxyYWRpYWxHcmFkaWVudCBpZD0ibm9zZUdyYWQiIGN4PSI1MCUiIGN5PSIzMCUiIHI9IjUwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM0NDQ0NDQiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSI3MCUiIHN0b3AtY29sb3I9IiMxMTExMTEiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMDAwMDAwIi8+CiAgICA8L3JhZGlhbEdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJ0b25ndWVHcmFkIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjAlIiB5Mj0iMTAwJSI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNmZjc3ODgiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSI4MCUiIHN0b3AtY29sb3I9IiNlNjQ0NTUiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjY2MyMjMzIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGZpbHRlciBpZD0ic2hhZG93Ij4KICAgICAgPGZlRHJvcFNoYWRvdyBkeD0iMCIgZHk9IjUiIHN0ZERldmlhdGlvbj0iNSIgZmxvb2Qtb3BhY2l0eT0iMC42Ii8+CiAgICA8L2ZpbHRlcj4KICA8L2RlZnM+CiAgCiAgPHBhdGggZD0iTTIwLDEwMCBRLTEwLDMwIDQwLDIwIFE2MCwxMCA3MCwzMCBRNjAsNjAgNDAsMTAwIFoiIGZpbGw9InVybCgjZWFyR3JhZExlZnQpIiBmaWx0ZXI9InVybCgjc2hhZG93KSIvPgogIDxwYXRoIGQ9Ik0yNSw5MCBRNSwzNSA0MCwyOCBRNTAsMjUgNTUsMzUgUTQ1LDU1IDM1LDkwIFoiIGZpbGw9IiNjZjliODAiIG9wYWNpdHk9IjAuNiIvPgoKICA8cGF0aCBkPSJNMTgwLDEwMCBRMjEwLDMwIDE2MCwyMCBRMTQwLDEwIDEzMCwzMCBRMTQwLDYwIDE2MCwxMDAgWiIgZmlsbD0idXJsKCNlYXJHcmFkUmlnaHQpIiBmaWx0ZXI9InVybCgjc2hhZG93KSIvPgogIDxwYXRoIGQ9Ik0xNzUsOTAgUTE5NSwzNSAxNjAsMjggUTE1MCwyNSAxNDUsMzUgUTE1NSw1NSAxNjUsOTAgWiIgZmlsbD0iI2NmOWI4MCIgb3BhY2l0eT0iMC42Ii8+CgogIDxwYXRoIGQ9Ik04NSwxNDUgUTg1LDE5MCAxMDAsMTkwIFExMTUsMTkwIDExNSwxNDUgWiIgZmlsbD0idXJsKCN0b25ndWVHcmFkKSIgZmlsdGVyPSJ1cmwoI3NoYWRvdykiLz4KICA8cGF0aCBkPSJNMTAwLDE0NSBMMTAwLDE4MCIgc3Ryb2tlPSIjYWExMTIyIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgoKICA8cGF0aCBkPSJNNzUsMTMwIFExMDAsMTE1IDEyNSwxMzAgUTEzNSwxNTAgMTAwLDE2MCBRNjUsMTUwIDc1LDEzMCBaIiBmaWxsPSJ1cmwoI25vc2VHcmFkKSIgZmlsdGVyPSJ1cmwoI3NoYWRvdykiLz4KICAKICA8ZWxsaXBzZSBjeD0iOTAiIGN5PSIx四十IHJ4PSI2IiByeT0iMyIgZmlsbD0iIzAwMCIgdHJhbnNmb3JtPSJyb3RhdGUoLTIwIDkwIDE0MCkiLz4KICA8ZWxsaXBzZSBjeD0iMTEwIiBjeT0iMTQwIiByeD0iNiIgcnk9IjMiIGZpbGw9IiMwMDAiIHRyYW5zZm9ybT0icm90YXRlKDIwIDExMCAxNDApIi8+CiAgCiAgPGVsbGlwc2UgY3g9IjEwMCIgY3k9IjEyNyIgcng9IjEwIiByeT0iMyIgZmlsbD0iI2ZmZmZmZiIgb3BhY2l0eT0iMC41Ii8+CiAgPGNpcmNsZSBjeD0iODUiIGN5PSIxMzMiIHI9IjIiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjAuNCIvPgogIAogIDxjaXJjbGUgY3g9IjY1IiBjeT0iMTQwIiByPSIxLjUiIGZpbGw9IiMzMzMiLz4KICA8Y2lyY2xlIGN4PSI2MCIgY3k9IjE1MCIgcj0iMS41IiBmaWxsPSIjMzMzIi8+CiAgPGNpcmNsZSBjeD0iNzAiIGN5PSIxNTMiIHI9IjEuNSIgZmlsbD0iIzMzMyIvPgogIDxjaXJjbGUgY3g9IjEzNSIgY3k9IjE0MCIgcj0iMS41IiBmaWxsPSIjMzMzIi8+CiAgPGNpcmNsZSBjeD0iMTQwIiBjeT0iMTUwIiByPSIxLjUiIGZpbGw9IiMzMzMiLz4KICA8Y2lyY2xlIGN4PSIxMzAiIGN5PSIxNTMiIHI9IjEuNSIgZmlsbD0iIzMzMyIvPgo8L3N2Zz4=';
const ANONYMOUS_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTMwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEzMCI+CiAgPHBhdGggZD0iTTEwLDUwIEMxMCwwIDkwLDAgOTAsNTAgQzkwLDEwMCA3MCwxMzAgNTAsMTMwIEMzMCwxMzAgMT0wLDEwMCAxMCw1MCBaIiBmaWxsPSIjZjVmNWY1IiBzdHJva2U9IiNjY2NjY2MiIHN0cm9rZS13aWR0aD0iMiIvPgogIDxlbGxpcHNlIGN4PSIzMiIgY3k9IjUwIiByeD0iMTAiIHJ5PSI1IiBmaWxsPSIjMDAwMDAwIiAvPgogIDxlbGxpcHNlIGN4PSI2OCIgY3k9IjUwIiByeD0iMTAiIHJ5PSI1IiBmaWxsPSIjMDAwMDAwIiAvPgogIDxwYXRoIGQ9Ik0yMCwzOCBRMzIsMzAgNDUsNDMiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMDAwMCIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8cGF0aCBkPSJNODAsMzggUTY4LDMwIDU1LDQzIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPGNpcmNsZSBjeD0iMjUiIGN5PSI3MCIgcj0iNyIgZmlsbD0iI2ZmYjNiMyIgb3BhY2l0eT0iMC44Ii8+CiAgPGNpcmNsZSBjeD0iNzUiIGN5PSI3MCIgcj0iNyIgZmlsbD0iI2ZmYjNiMyIgb3BhY2l0eT0iMC44Ii8+CiAgPHBhdGggZD0iTTMwLDgyIFE1MCw2OCA3MCw4MiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDAwMDAwIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik00OCw3NiBMNTAsODAgTDUyLDc2IFoiIGZpbGw9IiMwMDAwMDAiLz4KICA8cGF0aCBkPSJNNDYsMTEwIEw1MCwxMjIgTDU0LDExMCBaIiBmaWxsPSIjMDAwMDAwIi8+Cjwvc3ZnPgo=';

function DogMask({ faceData }) {
  const texture = useLoader(THREE.TextureLoader, DOG_BASE64);
  const meshRef = useRef();

  useFrame(() => {
    if (meshRef.current && faceData.current && faceData.current.visible) {
      const data = faceData.current;
      const scale = data.width * 4.0; 
      meshRef.current.position.set(data.eyeX, data.eyeY, 0.05);
      meshRef.current.rotation.set(0, 0, -data.rz);
      meshRef.current.scale.set(scale, scale, scale);
      meshRef.current.visible = true;
    } else if (meshRef.current) {
      meshRef.current.visible = false;
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent={true} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function AnonymousMask({ faceData }) {
  const texture = useLoader(THREE.TextureLoader, ANONYMOUS_BASE64);
  const meshRef = useRef();

  useFrame(() => {
    if (meshRef.current && faceData.current && faceData.current.visible) {
      const data = faceData.current;
      const scaleX = data.width * 3.5;
      const scaleY = scaleX * 1.3;
      // Offset position so mask eyes align with user eyes
      meshRef.current.position.set(data.eyeX, data.eyeY + scaleY * 0.115, 0.05);
      meshRef.current.rotation.set(0, 0, -data.rz);
      meshRef.current.scale.set(scaleX, scaleY, scaleX);
      meshRef.current.visible = true;
    } else if (meshRef.current) {
      meshRef.current.visible = false;
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent={true} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Wrapper para manejar Suspense
function FaceMaskSwitcher({ faceData, activeFilter }) {
  return (
    <React.Suspense fallback={null}>
      {activeFilter === 'dog' && <DogMask faceData={faceData} />}
      {activeFilter === 'anonymous' && <AnonymousMask faceData={faceData} />}
    </React.Suspense>
  );
}

export default function AROverlay({ stream, activeFilter }) {
  const videoRef = useRef(null);
  const faceData = useRef({ visible: false, x: 0, y: 0, rz: 0, width: 0 });
  const reqRef = useRef(null);
  const faceMeshRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.error('[AROverlay] Video play error:', e));
    }
  }, [stream]);

  useEffect(() => {
    if (!activeFilter || activeFilter === 'none') {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
      faceData.current.visible = false;
      return;
    }

    let isRunning = true;

    async function initFaceMesh() {
      const faceMesh = new FaceMesh({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      faceMesh.onResults((results) => {
        if (!isRunning) return;
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
          const landmarks = results.multiFaceLandmarks[0];
          
          // Nariz (punto 1)
          const nose = landmarks[1];
          // Ojos para rotación y escala
          const leftEye = landmarks[33];
          const rightEye = landmarks[263];

          const dx = leftEye.x - rightEye.x;
          const dy = leftEye.y - rightEye.y;
          const angleZ = Math.atan2(dy, dx);
          const width = Math.sqrt(dx*dx + dy*dy);

          const eyeX = (leftEye.x + rightEye.x) / 2;
          const eyeY = (leftEye.y + rightEye.y) / 2;

          faceData.current = {
            visible: true,
            x: nose.x, // Nose X
            y: nose.y, // Nose Y
            eyeX: eyeX,
            eyeY: eyeY,
            rz: angleZ,
            width: width
          };
        } else {
          faceData.current.visible = false;
        }
      });

      faceMeshRef.current = faceMesh;

      async function processVideo() {
        if (!isRunning) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          await faceMesh.send({ image: video });
        }
        reqRef.current = requestAnimationFrame(processVideo);
      }

      processVideo();
    }

    initFaceMesh();

    return () => {
      isRunning = false;
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
      if (faceMeshRef.current) {
        faceMeshRef.current.close();
        faceMeshRef.current = null;
      }
    };
  }, [activeFilter]);

  if (!activeFilter || activeFilter === 'none') return null;

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', top: '-9999px' }} />
      {/* Canvas R3F offscreen en el DOM, del que useInstacam leerá */}
      <Canvas 
        id="ar-canvas"
        style={{ position: 'absolute', width: '640px', height: '480px', top: '-9999px', pointerEvents: 'none', zIndex: -1 }}
        gl={{ preserveDrawingBuffer: true, alpha: true }}
        orthographic
        camera={{ left: 0, right: 1, top: 0, bottom: 1, near: -100, far: 100 }}
      >
        <ambientLight intensity={1} />
        <directionalLight position={[0.5, 0.5, 1]} intensity={2} />
        <FaceMaskSwitcher faceData={faceData} activeFilter={activeFilter} />
      </Canvas>
    </>
  );
}
