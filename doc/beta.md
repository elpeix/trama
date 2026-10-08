# Beta

El que falta per publicar una beta de Trama, per ordre d'importància. Revisat
el 2026-10-04: el build, el lint, els tests unitaris i els e2e passen.

## Fet

- **Pantalles d'error.** Si el navegador no pot engegar l'àudio (sense Web
  Audio, sense audio worklets o sense HTTPS), ho diu en lloc de quedar-se en
  blanc. Si l'app falla mentre es dibuixa, un `ErrorBoundary` mostra l'error amb
  **Reload**, **Save the patch** i **Start with an empty patch**, que aparta el
  patch autodesat perquè no torni a fer petar l'app en recarregar.
- **Còpia de l'autosave.** Un patch autodesat que no es pot obrir es guarda a
  `trama:patch:backup` del `localStorage` abans que l'autosave el
  sobreescrigui.
- **Migració de versions.** `src/patch/migrations.ts` té un pas per cada versió
  antiga de patches i presets; un test exigeix que n'hi hagi un per cada versió
  anterior a l'actual. Un fitxer d'una versió més nova diu que l'ha desat un
  Trama més nou.
- **Editar els valors de la cançó.** Les cel·les dels carrils mostren el valor
  de cada compàs, amb un fons segons on cau dins del rang, i s'editen com les
  pantalles. **+ Control** afegeix un carril per a qualsevol control
  automatitzable.
- **Protecció de la sortida.** Cada Output té un **Limiter** (`on` per
  defecte) en un worklet propi: sostre a −0,3 dBFS, tots dos costats alhora,
  sense latència. Si el so queda mig segon seguit per sobre de +12 dBFS de mitjana
  o arriba un NaN, l'Output calla i el node ho diu amb un botó **Unmute**. Un
  limitador sol no hauria fet sonar menys fort una retroalimentació, perquè el
  navegador ja talla a 0 dBFS. Amb el Limiter engegat, el CLIP ja no s'encén.
- **Sons anteriors en fer play.** El Piano no era a la llista de mòduls que
  sonen després de l'stop i que es refan en tornar a engegar, perquè es va
  afegir l'endemà d'aquella llista. Les cordes es quedaven congelades i
  continuaven en fer play. Ara la llista és un `Record` amb tots els tipus de
  mòdul (`RINGS` a `AudioEngine.ts`), i TypeScript no deixa afegir-ne cap sense
  decidir si sona després de l'stop.
- **Avís de navegadors.** Als navegadors que no deriven de Chromium, i als
  mòbils i tauletes, una barra sota la de dalt diu que Trama està provat en
  navegadors d'escriptori derivats de Chromium, com ara Chrome i Brave. Es pot
  tancar, i el navegador ho recorda (`trama:browser-notice`).
- **Versió, About i feedback.** La versió és la `0.1.0` i ve del
  `package.json`. El logo obre l'About, amb la versió, **Report a problem** (un
  issue nou amb la versió i el navegador escrits), el codi font i la llicència.
  La pantalla d'error té **Report the error**, amb l'error escrit.
- **Llicència.** GPL-3.0 o posterior: `LICENSE`, `package.json` i el README.
- **Guia d'inici.** **Getting started**, en anglès, en sis passos: afegir
  mòduls, connectar-los, fer sonar, canviar valors, desar, i els exemples i el
  Composer. S'obre des del centre de l'editor quan el patch és buit i des de
  l'About. La traducció al català vindrà amb la de la interfície.

## Abans de publicar

### Reanomenar i fer públic el repo

L'enllaç **Report a problem** obre un issue a `github.com/elpeix/trama`, però
el repo encara es diu `elpeix/audiojac` i és privat: cal reanomenar-lo a
`trama` i fer-lo públic perquè els usuaris de la beta hi puguin obrir issues.

### Publicar a Vercel

`vercel.json` ja diu com es construeix (`npm run build`, `dist`) i que els
fitxers d'`assets/` es poden desar per sempre a la memòria cau, perquè porten
el hash al nom. Queda connectar el repo a Vercel i registrar el domini,
`trama.audio`.

## Molt recomanable

### Imatge per compartir

L'`index.html` ja té `description` i les etiquetes `og:` de títol i
descripció. L'`og:image` necessita una imatge i l'URL absoluta del domini.

### Navegadors a Playwright

Els e2e només corren a Chromium. El Firefox de Playwright no arrenca a
macOS 27 (vegeu el README); es podria provar el projecte `webkit`.

## Pot esperar

- **Compartir per URL**, que no s'ha començat. Ajudaria molt amb el feedback
  ("envia'm el link del patch").
- **Exportació offline a WAV**, planificada a `doc/export-offline.md`.
- **Web MIDI**, ajornat per manca de maquinari.
- **Zoom de la graella de la cançó** (S/M/L o Ctrl+roda), si les cel·les dels
  carrils encara queden petites amb 28 px.
- **Interfície en català**, amb una funció `t()` pròpia i un diccionari tipat.
  Són uns 600–700 textos repartits en 67 components.
- **El piano als mitjos i als greus**, que sona a corda percutida. És un tema
  de so, no de beta.
