import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { paintToPbr, REFERENCE_EXPOSURE } from '@/lib/pbr.js';
import {
  buildEnvironmentTexture,
  buildFlakeNormalMap,
  buildOrangePeelMap,
} from '@/lib/environment.js';

/** Doku katmanlarının varsayılanları — arayüzden elle ezilebilir. */
export const DEFAULT_TEXTURE = {
  flakeScale: 64, // pulcuk tekrar oranı: yüksek = küçük pulcuk
  flakeIntensity: 1, // ölçülen değerin çarpanı
  orangePeel: 0.35, // vernik dalgalılığı
  orangePeelScale: 5, // dalga boyu: düşük = geniş dalga
};

/**
 * Gerçek zamanlı PBR boya önizlemesi.
 * Boyanın metallic / pearl / flake / gloss değerleri MeshPhysicalMaterial
 * parametrelerine çevrilir; ortam yansıması PMREM ile üretilir.
 */
export default function PaintViewer3D({
  paint,
  shape = 'knot',
  geometry = null,
  spinning = true,
  scenario = 'studio',
  texture = DEFAULT_TEXTURE,
}) {
  const mountRef = useRef(null);
  const stateRef = useRef(null);

  // Sahne kurulumu — bir kez.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Khronos PBR Neutral: ürün görselleştirme için tasarlandı, rengi korur.
    // ACES koyu doygun renklerde ortalama ΔE 5.8 hata veriyordu (Meteor serisi),
    // Neutral aynı renklerde 2.0'a iniyor. Kalanı displayCorrectedAlbedo siliyor.
    // Ölçüm: test/tonemap.test.mjs
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = REFERENCE_EXPOSURE;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.6, 4.2);

    // Ayrı ışık kaynağı yok: aydınlatmanın tamamı ortam haritasından geliyor.
    // Boyanın görünüşü yansıttığı dünyanın kendisi olduğu için doğrusu bu.
    const flakeMap = buildFlakeNormalMap();
    const peelMap = buildOrangePeelMap();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = 9;

    const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff });

    // Açıya bağlı renk kayması (flop) — three.js'te yerleşik karşılığı yok,
    // fragment shader'a enjekte ediyoruz. Normal hesaplandıktan hemen sonra
    // diffuseColor'ı bakış açısına göre face↔flop arasında karıştırıyoruz.
    // material.color face rengini taşır; shader sıyırma açısına doğru MUTLAK
    // flop rengine karışır.
    //
    // Oran (flop/face) ile çarpmayı denedim, kırılgan: bir kanal sıfıra
    // yakınsa bölme patlıyor — saf kırmızıda yeşil çarpanı 209 çıktı.
    // mix() ile mutlak renkler arasında geçmek hem güvenli hem de
    // enjeksiyon başarısız olursa malzeme sessizce doğru face rengine düşüyor.
    material.userData.flop = {
      absorption: { value: new THREE.Vector3(0, 0, 0) },
    };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uAbsorption = material.userData.flop.absorption;

      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform vec3 uAbsorption;
           void main() {`
        )
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
           {
             // Beer-Lambert: renkli saydam katmandan geçen ışığın soğurulması.
             //
             // Derinlik hissini üreten optik bu. Işık verniğe girer, altındaki
             // pigment/pulcuk katmanından döner, tekrar dışarı çıkar. Yüzeye
             // dik bakışta yol kısadır — renk açık ve parlak. Açı yattıkça yol
             // uzar ve renk ÜSTEL olarak koyulaşıp doyar.
             //
             // Doğrusal geçiş (mix) iki uçta doğru rengi verse bile arada düz
             // görünür; yüzey boyalı plastik gibi okunur. Candy boyaların o
             // derin görünümü tam olarak bu eğrinin üstelliğinden gelir.
             float ndv = clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.02, 1.0 );
             float path = 1.0 / ndv - 1.0;   // dik bakışta 0
             diffuseColor.rgb *= exp( -uAbsorption * path );
           }`
        );
    };
    const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.34, 220, 40), material);
    scene.add(mesh);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      // updateStyle=true: yüksek DPR ekranlarda CSS boyutu doğru kalsın.
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const state = {
      renderer,
      scene,
      camera,
      controls,
      mesh,
      material,
      spinning,
      raf: 0,
      pmrem,
      flakeMap,
      peelMap,
      texture,
      envTexture: null,
    };
    stateRef.current = state;

    // Geliştirme kancası: sahneyi senkron render edip piksel okumayı sağlar.
    // Bu olmadan renk zincirinin ucunu ölçemiyoruz — rAF döngüsü sekme
    // görünmediğinde duruyor ve readPixels boş tampon döndürüyor.
    if (import.meta.env.DEV) {
      window.__paintViewer = {
        render: () => renderer.render(scene, camera),
        readCenter: (size = 8) => {
          renderer.render(scene, camera);
          const gl = renderer.getContext();
          const w = renderer.domElement.width;
          const h = renderer.domElement.height;
          const px = new Uint8Array(size * size * 4);
          gl.readPixels(
            Math.floor(w / 2 - size / 2),
            Math.floor(h / 2 - size / 2),
            size,
            size,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            px
          );
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;
          for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] === 0) continue;
            r += px[i];
            g += px[i + 1];
            b += px[i + 2];
            n += 1;
          }
          return n ? { r: r / n, g: g / n, b: b / n, samples: n } : null;
        },
        state,
      };
    }

    const clock = new THREE.Clock();
    const tick = () => {
      state.raf = requestAnimationFrame(tick);
      const dt = clock.getDelta();
      if (state.spinning) state.mesh.rotation.y += dt * 0.5;
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(state.raf);
      ro.disconnect();
      controls.dispose();
      state.mesh.geometry.dispose();
      material.dispose();
      flakeMap.dispose();
      peelMap.dispose();
      state.envTexture?.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      if (import.meta.env.DEV) delete window.__paintViewer;
      stateRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (stateRef.current) stateRef.current.spinning = spinning;
  }, [spinning]);

  // Işık senaryosu değişimi
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const equirect = buildEnvironmentTexture(scenario);
    const target = state.pmrem.fromEquirectangular(equirect);
    state.envTexture?.dispose();
    state.envTexture = target.texture;
    state.scene.environment = target.texture;
    equirect.dispose();
  }, [scenario]);

  // Geometri değişimi
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const old = state.mesh.geometry;
    state.mesh.geometry = geometry ? fitGeometry(geometry) : primitive(shape);
    state.mesh.rotation.set(0, 0, 0);
    old.dispose();
  }, [shape, geometry]);

  // Malzeme (boya) değişimi
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !paint) return;
    state.texture = texture;
    applyPaint(state.material, paint, state);
  }, [paint, texture]);

  return <div ref={mountRef} className="w-full h-full" />;
}

function primitive(shape) {
  if (shape === 'sphere') return new THREE.SphereGeometry(1.25, 96, 64);
  if (shape === 'panel') return bentPanel();
  return new THREE.TorusKnotGeometry(1, 0.34, 220, 40);
}

/**
 * Bükülü numune paneli.
 *
 * Düz bir panel işe yaramıyor: pürüzsüz bir ortamı yansıtan düz yüzey
 * kaçınılmaz olarak gradyan dolgulu bir dikdörtgen verir, boya gibi
 * görünmez. Gerçek boya numune kartlarının bükülü basılmasının sebebi de bu —
 * kavis yansımayı yüzey boyunca tarar ve face ile flop'u aynı karede gösterir.
 * Metalik bir boyayı yargılayabileceğin tek şekil budur.
 */
function bentPanel() {
  const g = new THREE.CylinderGeometry(2.1, 2.1, 1.75, 128, 1, true, Math.PI * 0.72, Math.PI * 0.56);
  // Silindir dikey duruyor; yatırıp kameraya dönük hale getir
  g.rotateZ(Math.PI / 2);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Yüklenen STL'i sahneye sığdırır ve merkezler. */
function fitGeometry(source) {
  const g = source.clone();
  g.computeBoundingBox();
  const box = g.boundingBox;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  g.translate(-center.x, -center.y, -center.z);
  const scale = 2.4 / Math.max(size.x, size.y, size.z || 1);
  g.scale(scale, scale, scale);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

function applyPaint(material, paint, state) {
  const p = paintToPbr(paint);
  const tex = { ...DEFAULT_TEXTURE, ...(state?.texture || {}) };

  // İKİ AYRI DOKU KATMANI, iki farklı ölçekte ve iki farklı yüzeyde:
  //
  // Pulcuk — mikron mertebesi, rastgele, TABAN katmanına. Alüminyum
  // pulcukların tek tek çakması. Clearcoat'a uygulanmaz çünkü dalgalanan
  // pigment değil.
  //
  // Portakal kabuğu — milimetre mertebesi, yumuşak, CLEARCOAT normaline.
  // Verniğin fırın sonrası hafif dalgalılığı. Gerçek boyayı kusursuz CG'den
  // ayıran şey büyük ölçüde bu: mükemmel ayna gerçek dünyada yok, yansıyan
  // çizgiler daima hafifçe dalgalanır.
  const flakeAmount = p.flakeIntensity * tex.flakeIntensity;
  if (flakeAmount > 0.01 && state?.flakeMap) {
    material.normalMap = state.flakeMap;
    material.normalMap.repeat.set(tex.flakeScale, tex.flakeScale);
    material.normalScale = new THREE.Vector2(flakeAmount * 0.6, flakeAmount * 0.6);
  } else {
    material.normalMap = null;
  }

  if (tex.orangePeel > 0.005 && state?.peelMap) {
    material.clearcoatNormalMap = state.peelMap;
    material.clearcoatNormalMap.repeat.set(tex.orangePeelScale, tex.orangePeelScale);
    material.clearcoatNormalScale = new THREE.Vector2(tex.orangePeel, tex.orangePeel);
  } else {
    material.clearcoatNormalMap = null;
  }

  // Taban renk = FACE rengi (kameraya dik bakışta görünen).
  // Lineer uzayda ve doğrudan veriliyor: değer 1.0'ı aşabildiği için
  // sRGB hex üzerinden gitmek ton eşleme telafisini kırpardı.
  material.color = new THREE.Color().setRGB(
    p.faceLinear[0],
    p.faceLinear[1],
    p.faceLinear[2],
    THREE.LinearSRGBColorSpace
  );

  // Kanal başına soğurma — face'ten flop'a üstel eğriyi bu belirliyor.
  if (material.userData.flop) {
    material.userData.flop.absorption.value.set(
      p.absorption[0],
      p.absorption[1],
      p.absorption[2]
    );
  }
  material.metalness = p.metalness;
  material.roughness = p.roughness;
  material.clearcoat = p.clearcoat;
  material.clearcoatRoughness = p.clearcoatRoughness;
  material.iridescence = p.iridescence;
  material.iridescenceIOR = p.iridescenceIOR;
  material.iridescenceThicknessRange = p.iridescenceThicknessRange;
  // sheen kumaş içindir, otomotiv verniğinde yeri yok — kapalı.
  material.sheen = 0;
  material.envMapIntensity = p.envMapIntensity;
  material.transmission = 0;
  material.opacity = p.opacity;
  material.transparent = p.transparent;
  material.needsUpdate = true;
}

/**
 * Bir model dosyasını tek bir BufferGeometry'e çözer.
 * STL ve OBJ destekleniyor — hazır araba modelleri çoğunlukla OBJ dağıtılıyor.
 */
export function loadModel(file) {
  const isObj = /\.obj$/i.test(file.name);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (!isObj) {
          resolve(new STLLoader().parse(reader.result));
          return;
        }

        // OBJ birden çok mesh içerebilir (gövde, cam, jant…). Hepsini tek bir
        // geometriye topluyoruz: bu görüntüleyici tek malzemeli — amaç boyayı
        // görmek, modeli olduğu gibi sahnelemek değil.
        //
        // NORMALLER KORUNMALI. İlk yazdığımda yalnızca position'ı kopyalayıp
        // birleştirdikten sonra computeVertexNormals çağırıyordum; non-indexed
        // geometride bu YÜZEY normali üretir, yani düz gölgeleme. Faceli bir
        // gövdede yansıma parçalanır ve sürekli parlama hiç oluşmaz — araba
        // tamamen mat göründü. Modelin kendi yumuşak normalleri varsa onları
        // kullanıyoruz, yoksa parçayı BİRLEŞTİRMEDEN ÖNCE hesaplıyoruz ki
        // hesap kendi indeksi üzerinden yumuşak çıksın.
        const group = new OBJLoader().parse(reader.result);
        const parts = [];
        group.updateMatrixWorld(true);

        group.traverse((child) => {
          if (!child.isMesh || !child.geometry) return;
          const g = child.geometry.clone();
          g.applyMatrix4(child.matrixWorld);
          if (!g.getAttribute('position')) return;

          if (!g.getAttribute('normal')) g.computeVertexNormals();

          const flat = g.index ? g.toNonIndexed() : g;
          const plain = new THREE.BufferGeometry();
          plain.setAttribute('position', flat.getAttribute('position').clone());
          plain.setAttribute('normal', flat.getAttribute('normal').clone());
          parts.push(plain);
        });

        if (!parts.length) {
          reject(new Error('OBJ içinde geometri bulunamadı'));
          return;
        }

        resolve(mergeParts(parts));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;

    if (isObj) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

/** Pozisyon + normal taşıyan geometrileri tek geometriye birleştirir. */
function mergeParts(geometries) {
  let total = 0;
  for (const g of geometries) total += g.getAttribute('position').count;

  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  let offset = 0;

  for (const g of geometries) {
    const pos = g.getAttribute('position').array;
    const nrm = g.getAttribute('normal').array;
    positions.set(pos, offset);
    normals.set(nrm, offset);
    offset += pos.length;
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return out;
}

/** Geriye dönük ad — eski çağrılar çalışmaya devam etsin. */
export const loadStl = loadModel;
