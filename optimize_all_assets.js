const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_DIR = __dirname;
const ASSETS_3D_DIR = path.join(BASE_DIR, 'app-assets', '3D');
const BACKUP_3D_DIR = path.join(BASE_DIR, 'app-assets', '3D-backup');

const IMAGE_FOLDERS = [
  path.join(BASE_DIR, 'app-assets', 'anatomia'),
  path.join(BASE_DIR, 'app-assets', 'organos_16x9_transparentes'),
  path.join(BASE_DIR, 'app-assets', 'datos_importantes'),
  path.join(BASE_DIR, 'app-assets', 'miniaturas')
];

const DATA_JS_PATH = path.join(BASE_DIR, 'app', 'js', 'data.js');

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = 2;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function optimizeGLB(inputFile, outputFile) {
  const data = fs.readFileSync(inputFile);
  const magic = data.toString('ascii', 0, 4);
  if (magic !== 'glTF') {
    throw new Error('Not a GLB file');
  }

  const chunk0Length = data.readUInt32LE(12);
  const jsonStr = data.toString('utf8', 20, 20 + chunk0Length);
  const json = JSON.parse(jsonStr);

  const chunk1Offset = 20 + chunk0Length;
  const chunk1Length = data.readUInt32LE(chunk1Offset);
  const binBuffer = data.subarray(chunk1Offset + 8, chunk1Offset + 8 + chunk1Length);

  const tempDir = path.join(BASE_DIR, 'temp_glb_processing');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const newImageBuffers = [];
  let hasOptimizedImages = false;

  if (json.images) {
    for (let idx = 0; idx < json.images.length; idx++) {
      const img = json.images[idx];
      if (img.bufferView !== undefined) {
        const bv = json.bufferViews[img.bufferView];
        const start = bv.byteOffset || 0;
        const len = bv.byteLength;
        const imgBuffer = binBuffer.subarray(start, start + len);

        const tempIn = path.join(tempDir, `img_${idx}.png`);
        const tempResized = path.join(tempDir, `img_${idx}_resized.png`);
        const tempOut = path.join(tempDir, `img_${idx}_opt.png`);

        fs.writeFileSync(tempIn, imgBuffer);

        try {
          // Resize with ImageMagick (max 2048x2048)
          execSync(`convert "${tempIn}" -resize "2048x2048>" "${tempResized}"`, { stdio: 'ignore' });

          // Compress with pngquant
          execSync(`pngquant --quality=65-80 --speed 1 --force --output "${tempOut}" "${tempResized}"`, { stdio: 'ignore' });

          const optBuffer = fs.readFileSync(tempOut);
          newImageBuffers.push(optBuffer);
          hasOptimizedImages = true;
        } catch (err) {
          // If PNG processing fails, fallback to original image buffer
          newImageBuffers.push(imgBuffer);
        }
      } else {
        newImageBuffers.push(null);
      }
    }
  }

  if (!hasOptimizedImages) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return false;
  }

  // Rebuild the binary buffer and updated JSON
  let rebuiltOffset = 0;
  const rebuiltBinBuffer = Buffer.alloc(binBuffer.length * 2);
  const updatedBufferViews = JSON.parse(JSON.stringify(json.bufferViews));

  const indexedBufferViews = json.bufferViews.map((bv, idx) => ({ bv, idx }));
  indexedBufferViews.sort((a, b) => (a.bv.byteOffset || 0) - (b.bv.byteOffset || 0));

  indexedBufferViews.forEach(({ bv, idx }) => {
    const originalStart = bv.byteOffset || 0;
    const originalLen = bv.byteLength;

    const align = rebuiltOffset % 4;
    if (align !== 0) {
      rebuiltOffset += (4 - align);
    }

    updatedBufferViews[idx].byteOffset = rebuiltOffset;

    const imgIdx = json.images.findIndex(img => img.bufferView === idx);
    if (imgIdx !== -1 && newImageBuffers[imgIdx]) {
      const compBuf = newImageBuffers[imgIdx];
      compBuf.copy(rebuiltBinBuffer, rebuiltOffset);
      updatedBufferViews[idx].byteLength = compBuf.length;
      rebuiltOffset += compBuf.length;
    } else {
      binBuffer.copy(rebuiltBinBuffer, rebuiltOffset, originalStart, originalStart + originalLen);
      rebuiltOffset += originalLen;
    }
  });

  const finalBinLength = rebuiltOffset;
  const finalBinAlignedLength = Math.ceil(finalBinLength / 4) * 4;
  const finalBinBuffer = rebuiltBinBuffer.subarray(0, finalBinAlignedLength);

  json.bufferViews = updatedBufferViews;
  json.buffers[0].byteLength = finalBinBuffer.length;

  const newJsonStr = JSON.stringify(json);
  const newJsonBuffer = Buffer.from(newJsonStr, 'utf8');
  const newJsonAlignedLength = Math.ceil(newJsonBuffer.length / 4) * 4;
  const finalJsonBuffer = Buffer.alloc(newJsonAlignedLength, 0x20);
  newJsonBuffer.copy(finalJsonBuffer);

  const totalGLBLength = 12 + 8 + finalJsonBuffer.length + 8 + finalBinBuffer.length;
  const newGLB = Buffer.alloc(totalGLBLength);

  newGLB.write('glTF', 0, 4, 'ascii');
  newGLB.writeUInt32LE(2, 4);
  newGLB.writeUInt32LE(totalGLBLength, 8);

  newGLB.writeUInt32LE(finalJsonBuffer.length, 12);
  newGLB.writeUInt32LE(0x4E4F534A, 16);
  finalJsonBuffer.copy(newGLB, 20);

  const binChunkOffset = 20 + finalJsonBuffer.length;
  newGLB.writeUInt32LE(finalBinBuffer.length, binChunkOffset);
  newGLB.writeUInt32LE(0x004E4942, binChunkOffset + 4);
  finalBinBuffer.copy(newGLB, binChunkOffset + 8);

  fs.writeFileSync(outputFile, newGLB);
  fs.rmSync(tempDir, { recursive: true, force: true });
  return true;
}

function convert2DImagesToWebP() {
  console.log('\n🖼️ Convirtiendo imágenes 2D a WebP...');
  let totalOrig2D = 0;
  let totalOpt2D = 0;

  IMAGE_FOLDERS.forEach(folder => {
    if (!fs.existsSync(folder)) return;

    console.log(`📁 Procesando carpeta: ${path.basename(folder)}`);
    const files = fs.readdirSync(folder).filter(f => f.endsWith('.png'));

    files.forEach(file => {
      const origPath = path.join(folder, file);
      const optFile = file.replace(/\.png$/, '.webp');
      const optPath = path.join(folder, optFile);

      const stats = fs.statSync(origPath);
      totalOrig2D += stats.size;

      try {
        // Convert to WebP using cwebp
        execSync(`cwebp -q 80 "${origPath}" -o "${optPath}"`, { stdio: 'ignore' });

        const optStats = fs.statSync(optPath);
        totalOpt2D += optStats.size;

        // Remove the original PNG file
        fs.unlinkSync(origPath);

        console.log(`  ✅ ${file} -> ${optFile} (${formatBytes(stats.size)} -> ${formatBytes(optStats.size)})`);
      } catch (err) {
        console.error(`  ❌ Error convirtiendo ${file}:`, err.message);
        totalOpt2D += stats.size;
      }
    });
  });

  const saved = totalOrig2D - totalOpt2D;
  const pct = ((saved / totalOrig2D) * 100).toFixed(1);
  console.log(`📊 Ahorro total en imágenes 2D: ${formatBytes(saved)} (${pct}% de reducción)`);
}

function updateDataJs() {
  console.log('\n📝 Actualizando app/js/data.js...');
  if (fs.existsSync(DATA_JS_PATH)) {
    let content = fs.readFileSync(DATA_JS_PATH, 'utf8');
    const updated = content.replace(/(miniatura|imagen|anatomia|ficha):\s*["']([^"']+)\.png["']/g, '$1: "$2.webp"');
    if (updated !== content) {
      fs.writeFileSync(DATA_JS_PATH, updated, 'utf8');
      console.log('  ✅ data.js actualizado con las nuevas extensiones .webp.');
    } else {
      console.log('  ⚠️ No se encontraron referencias para actualizar en data.js.');
    }
  } else {
    console.error(`  ❌ No se encontró data.js en: ${DATA_JS_PATH}`);
  }
}

async function main() {
  console.log('🚀 Iniciando optimización de todos los recursos del proyecto...');

  // 1. Optimizar modelos 3D
  if (fs.existsSync(ASSETS_3D_DIR)) {
    if (!fs.existsSync(BACKUP_3D_DIR)) {
      console.log(`📁 Creando carpeta de respaldo en: ${BACKUP_3D_DIR}`);
      fs.mkdirSync(BACKUP_3D_DIR, { recursive: true });
    }

    const files = fs.readdirSync(ASSETS_3D_DIR).filter(file => file.endsWith('.glb'));
    console.log(`🔍 Se encontraron ${files.length} modelos en formato GLB.`);

    let totalOriginalSize = 0;
    let totalOptimizedSize = 0;

    for (const file of files) {
      const originalPath = path.join(ASSETS_3D_DIR, file);
      const backupPath = path.join(BACKUP_3D_DIR, file);

      const originalStats = fs.statSync(originalPath);
      totalOriginalSize += originalStats.size;

      if (!fs.existsSync(backupPath)) {
        console.log(`💾 Respaldando ${file}...`);
        fs.copyFileSync(originalPath, backupPath);
      }

      console.log(`⚡ Comprimiendo texturas de ${file} (${formatBytes(originalStats.size)})...`);

      try {
        const tempOut = originalPath + '.tmp';
        const success = optimizeGLB(originalPath, tempOut);
        if (success && fs.existsSync(tempOut)) {
          const optimizedStats = fs.statSync(tempOut);
          totalOptimizedSize += optimizedStats.size;

          fs.renameSync(tempOut, originalPath);

          const savingPercent = ((originalStats.size - optimizedStats.size) / originalStats.size * 100).toFixed(1);
          console.log(`  ✅ ${file} optimizado: ${formatBytes(optimizedStats.size)} (Ahorro del ${savingPercent}%)\n`);
        } else {
          console.log(`  ⚠️ No se pudo optimizar ${file} o no tiene imágenes PNG. Manteniendo original.\n`);
          totalOptimizedSize += originalStats.size;
        }
      } catch (err) {
        console.error(`  ❌ Error optimizando ${file}:`, err.message);
        totalOptimizedSize += originalStats.size;
      }
    }

    const totalSavingPercent = ((totalOriginalSize - totalOptimizedSize) / totalOriginalSize * 100).toFixed(1);
    console.log('==================================================');
    console.log('🎉 ¡Optimización de 3D completada!');
    console.log(`📊 Tamaño Original Total:  ${formatBytes(totalOriginalSize)}`);
    console.log(`📊 Tamaño Optimizado Total: ${formatBytes(totalOptimizedSize)}`);
    console.log(`📈 Ahorro total en 3D:     ${formatBytes(totalOriginalSize - totalOptimizedSize)} (${totalSavingPercent}% menos)`);
    console.log('==================================================');
  }

  // 2. Convertir imágenes 2D a WebP
  convert2DImagesToWebP();

  // 3. Actualizar data.js
  updateDataJs();

  console.log('\n✨ ¡Proceso global finalizado con éxito! ✨');
}

main().catch(err => {
  console.error('❌ Error en el proceso de optimización:', err);
});
