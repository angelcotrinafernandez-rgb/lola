# Lola — primera versión

Aplicación web para Mac y iPhone. Por defecto la inteligencia funciona en la nube gratis (Pollinations, sin cuenta ni clave). En Ajustes (⚙) se puede cambiar a Google Gemini con una clave gratuita que creas tú, o al modo local con WebLLM, que se ejecuta en el navegador y no envía nada fuera del dispositivo.

## Probarla en el Mac

1. Publica Lola gratis siguiendo `PUBLICAR-GRATIS.md`. No abras `index.html` directamente desde Finder: esa dirección no permite preparar correctamente la inteligencia local.
2. Abre la dirección que te da GitHub Pages con Chrome actualizado.
3. Pulsa **Empezar a hablar con Lola**. En modo nube no hay descarga. (Opcional: en Ajustes ⚙ cambia a **Local** para una inteligencia privada con descarga de 1 GB, o a **Gemini** pegando tu clave gratuita.)
4. Escribe un mensaje. Para dictar, acepta el permiso del micrófono cuando el navegador lo solicite.

La instalación como app y la caché sin conexión también requieren la dirección publicada.

## Probarla en el iPhone

1. Cuando esté publicada, abre la dirección en Safari.
2. Pulsa compartir y selecciona **Añadir a pantalla de inicio**.
3. Usa el chat y activa la voz en Ajustes si quieres escuchar las respuestas.

## Límites reales

- En modo nube los mensajes se envían a un servicio externo gratuito (Pollinations o Google Gemini): no escribas datos privados. El modo gratis de Pollinations admite una pregunta cada 30 segundos y no garantiza el servicio.
- La descarga del modo local y la primera carga requieren Internet. Después, el modelo queda en la caché del navegador cuando este conserve los datos del sitio.
- El modelo local ligero prioriza poder funcionar gratis; no alcanza la calidad de un servicio comercial avanzado.
- WebLLM necesita WebGPU. Si no está disponible en el navegador o el móvil no tiene memoria suficiente, el chat avisará y no fingirá responder.
- El dictado depende de `SpeechRecognition`, que no está disponible en todos los navegadores; el chat escrito sigue funcionando.
- Las voces las aporta cada sistema operativo. Lola selecciona una voz española si el dispositivo la ofrece, pero no puede garantizar una voz femenina concreta.
- La conversación y preferencias se guardan solo en el navegador del dispositivo. Mac e iPhone no se sincronizan en esta versión.
- No añadas datos sensibles en ningún modo. En modo local los mensajes no salen del dispositivo, pero el navegador descarga el motor y el modelo de proveedores públicos en la primera carga.
