const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ASSETS_DIR = path.join(__dirname, 'app-assets', '3D');
const BACKUP_DIR = path.join(__dirname, 'app-assets', '3D-backup');
const TEMP_DIR = path.join(__dirname, 'app-assets', '3D-temp');

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = 2;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function main() {
  console.log('🚀 Iniciando optimización de modelos 3D...');

  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`❌ Directorio no encontrado: ${ASSETS_DIR}`);
    process.exit(1);
  }

  // 1. Crear directorios necesarios
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log(`📁 Creando carpeta de respaldo en: ${BACKUP_DIR}`);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const files = fs.readdirSync(ASSETS_DIR).filter(file => file.endsWith('.glb'));
  console.log(`🔍 Se encontraron ${files.length} modelos en formato GLB.`);

  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;

  for (const file of files) {
    const originalPath = path.join(ASSETS_DIR, file);
    const backupPath = path.join(BACKUP_DIR, file);
    const tempOutputPath = path.join(TEMP_DIR, file);

    const originalStats = fs.statSync(originalPath);
    totalOriginalSize += originalStats.size;

    // Respaldo preventivo si no existe ya
    if (!fs.existsSync(backupPath)) {
      console.log(`💾 Respaldando ${file}...`);
      fs.copyFileSync(originalPath, backupPath);
    }

    console.log(`⚡ Comprimiendo ${file} (${formatBytes(originalStats.size)})...`);

    try {
      // Ejecutar gltf-pipeline usando npx
      const command = `npx --yes gltf-pipeline -i "${originalPath}" -o "${tempOutputPath}" -d`;
      execSync(command, { stdio: 'inherit' });

      if (fs.existsSync(tempOutputPath)) {
        const optimizedStats = fs.statSync(tempOutputPath);
        totalOptimizedSize += optimizedStats.size;
        
        const savingPercent = ((originalStats.size - optimizedStats.size) / originalStats.size * 100).toFixed(1);
        console.log(`✅ ${file} optimizado: ${formatBytes(optimizedStats.size)} (Ahorro del ${savingPercent}%)\n`);
      } else {
        console.error(`❌ Error: El archivo optimizado para ${file} no fue creado.`);
        fs.copyFileSync(originalPath, tempOutputPath); // Fallback: usar el original
        totalOptimizedSize += originalStats.size;
      }
    } catch (error) {
      console.error(`❌ Error al comprimir ${file}:`, error.message);
      console.log(`⚠️ Usando archivo original como fallback.`);
      fs.copyFileSync(originalPath, tempOutputPath);
      totalOptimizedSize += originalStats.size;
    }
  }

  // 2. Reemplazar los archivos originales con los optimizados
  console.log('🔄 Reemplazando modelos originales con versiones optimizadas...');
  for (const file of files) {
    const tempOutputPath = path.join(TEMP_DIR, file);
    const originalPath = path.join(ASSETS_DIR, file);
    fs.copyFileSync(tempOutputPath, originalPath);
  }

  // Limpiar directorio temporal
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  const totalSavingPercent = ((totalOriginalSize - totalOptimizedSize) / totalOriginalSize * 100).toFixed(1);
  console.log('==================================================');
  console.log('🎉 ¡Optimización completada con éxito!');
  console.log(`📊 Tamaño Original Total:  ${formatBytes(totalOriginalSize)}`);
  console.log(`📊 Tamaño Optimizado Total: ${formatBytes(totalOptimizedSize)}`);
  console.log(`📈 Ahorro total de peso:   ${formatBytes(totalOriginalSize - totalOptimizedSize)} (${totalSavingPercent}% menos)`);
  console.log(`📂 Los respaldos originales están en: ${BACKUP_DIR}`);
  console.log('==================================================');
}

main().catch(err => {
  console.error('❌ Error general en la optimización:', err);
});
