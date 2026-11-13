# Lola — primera versión

Aplicación web privada para Mac y iPhone. La inteligencia se ejecuta en el navegador con WebLLM y no utiliza cuentas ni claves de API.

## Probarla en el Mac

1. Publica Lola gratis siguiendo `PUBLICAR-GRATIS.md`. No abras `index.html` directamente desde Finder: esa dirección no permite preparar correctamente la inteligencia local.
2. Abre la dirección que te da GitHub Pages con Chrome actualizado.
3. Pulsa **Activar inteligencia local** y espera la descarga inicial (aprox. 1 GB).
4. Escribe un mensaje. Para dictar, acepta el permiso del micrófono cuando el navegador lo solicite.

La instalación como app y la caché sin conexión también requieren la dirección publicada.

## Probarla en el iPhone

1. Cuando esté publicada, abre la dirección en Safari.
2. Pulsa compartir y selecciona **Añadir a pantalla de inicio**.
3. Usa el chat y activa la voz en Ajustes si quieres escuchar las respuestas.

## Límites reales

- La descarga y la primera carga requieren Internet. Después, el modelo queda en la caché del navegador cuando este conserve los datos del sitio.
- El modelo local ligero prioriza poder funcionar gratis; no alcanza la calidad de un servicio comercial avanzado.
- WebLLM necesita WebGPU. Si no está disponible en el navegador o el móvil no tiene memoria suficiente, el chat avisará y no fingirá responder.
- El dictado depende de `SpeechRecognition`, que no está disponible en todos los navegadores; el chat escrito sigue funcionando.
- Las voces las aporta cada sistema operativo. Lola selecciona una voz española si el dispositivo la ofrece, pero no puede garantizar una voz femenina concreta.
- La conversación y preferencias se guardan solo en el navegador del dispositivo. Mac e iPhone no se sincronizan en esta versión.
- No añadas datos sensibles: aunque no se envían a un servidor propio de Lola, el navegador descarga el motor y el modelo de proveedores públicos en la primera carga.
