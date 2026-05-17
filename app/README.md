# Cuerpo Humano Studio

Aplicación web educativa e interactiva sobre órganos del cuerpo humano en 3D.
La interfaz toma como referencia la app de `Mar-especies`, pero adapta el
contenido, la estética y los paneles al dominio anatómico.

## Cómo ejecutarla

Desde esta carpeta:

```bash
npm start
```

Después abre:

```text
http://localhost:5173/app/
```

La app sirve la carpeta padre para que las rutas relativas hacia
`app-assets/` y `Cuerpo_humano.png` funcionen sin duplicar recursos.

## Estructura

```text
Cuerpo Humano/
├── app-assets/
│   ├── 3D/
│   ├── anatomia/
│   ├── datos_importantes/
│   ├── identidad/
│   ├── miniaturas/
│   └── organos_16x9_transparentes/
├── Cuerpo_humano.png
└── app/
    ├── index.html
    ├── package.json
    ├── README.md
    ├── css/styles.css
    └── js/
        ├── app.js
        └── data.js
```

## Funciones incluidas

- Selector lateral de órganos y sistemas.
- Visor 3D con modo 3D, AR y 360 grados.
- Fondo anatómico activable.
- Controles de restablecer, acercar, alejar, rotar y pantalla completa.
- Galería educativa con anatomía y ficha visual.
- Comparador de órganos.
- Panel de detalles y notas clínicas.
- Biblioteca, cuaderno y ajustes en modales auxiliares.
- Página `studio.html` para armar el cuerpo humano por piezas en una escena 3D.
