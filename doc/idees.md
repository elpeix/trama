# Idees

## Marca

- Millorar logo (la idea és bona, però no encaixa amb els colors - estètica)
- Buscar un nom millor

## UI

- [x] Poder triar mode fosc/clar/sistema - Fet: botó a la barra de dalt, desat
      al navegador
- [x] No permetre seleccionar tot. Només els elements editables.

## Mode song

- [x] Configurar un fadeout al final
- [ ] Tram amb loop (n vegades) (ara n'hi ha un. No sé fa falta)
- [x] Vista de pantalla completa (amagar react/flow - no render)
  - Posar-hi les ones a l'espai lliure? (opcional)
- [x] Poder seguir automàticament el compàs que sona (opcional): que la graella
      es desplaci sola fins al compàs que sona - Fet: botó "Follow" al panell
      Song, encès per defecte i desat al navegador; quan el compàs que sona
      surt de la vista, la graella passa pàgina i el deixa després dels noms

## Mode performance

- [x] Vista pantalla completa (react flow no es renderitza)
- [x] Colors dels botons ABCD, diferenciats - Fet: paleta 808 (vermell, taronja,
      groc i crema) als bancs, als pads i a la graella de la cançó
- [x] Mixer: toc realista a les barres de so. (ombra...)
- [ ] Fixar selectors al panell, segons el tipus: botons segmentats amb text
      per a 2–4 opcions curtes (Launch, `linear/exp`, `off/on`), amb icona per
      a les que es poden dibuixar (Wave, tipus de filtre, Drive) i una
      pantalleta LCD amb ◀ ▶ per a les de moltes opcions (Chord, Step, Pattern
      de l'Arp)
  - Queda per decidir si aquesta divisió i les icones són el camí
  - La cançó no grava selectors: un selector tocat al panell amb Rec no
    quedaria gravat, tret que la cançó els gravi, per exemple al canvi de
    compàs
- [ ] Crossfader: canviar el mute i el solo a la meitat del recorregut. Les
      escenes no els guarden
- [ ] Macro: un knob del panell que en mou uns quants alhora, cadascun amb el
      seu rang (obrir tots els filtres, pujar tots els reverbs)
- [ ] Dreceres per als pads o les escenes amb el focus al panell, com les
      fletxes a la graella de la cançó. Fora del panell les lletres toquen notes
- [ ] MIDI learn, quan hi hagi un controlador: el panell és el lloc natural per
      assignar-lo

## Subpatches

- [ ] Tornar a publicar més amunt un control publicat d'un subpatch de dins.
      Ara una 808 dins d'un rack es toca entrant al rack
- [ ] Publicar corbes a la cara, com els harmònics en drawbars d'un orgue

## Instruments

- [ ] Strings: afinar d'oïda els cossos dels presets (Violin, Viola, Cello,
      Double bass), que ara són de literatura
- [ ] Wind: el so metàl·lic dels metalls tocats molt fort el fan el cos i la
      campana, no la física del tub (que caldria per a un *fortissimo* de
      trompeta més real)
- [ ] Wind: `reed` i `double reed` sobre un con fan servir el mateix motor
- [ ] Wind: *growl*, frullato i sordines
- [ ] Wind: la flauta de bec no puja d'afinació en bufar més fort
- [ ] Wind: un tub tapat de debò (`stopped`) donaria els harmònics senars a la
      flauta de pan, que ara és una flauta de bec amb molt d'aire
- [ ] Physical Model: la corda pinçada sona metàl·lica als greus; li caldria
      una pulsació més suau (a la peça 23 s'ha resolt amb un filtre)

## Scope

- [x] Si li arriba stereo, mostrar les dues parts.

## Peces

- [x] Potser cal poder desar a la peça: Fet, amb una fitxa al costat del logo
  - Títol de la peça
  - Descripció (cal?)
  - Autor
  - Link
  - Data de creació (editable?)

## Altres

- [x] Fer sonar el teclat sense el play actiu, també les notes, els beats i
      altres. S'ha de poder triar si es vol so o no. - Fet: el teclat i els
      pianos dels nodes, amb el botó "Sound without play" al costat del play,
      desat al navegador. Les notes del piano roll sonen amb el seu Hear, amb
      el play o sense. Els beats queden per més endavant
- [x] Amagar les ajudes d'un mòdul en un tooltip i afegir una icona interrogant
      (?) que mostri el tooltip. - Fet: s'obre si el punter s'hi atura 400 ms,
      amb el focus o amb un clic (que el deixa obert)
- [x] A la barra superior, posar el títol al mig i el desplegable
      "+ Add module" al costat dret dels botons de desfer/fer. - Fet: per sota
      de 1300 px es compacta (només icones) i per sota de 1120 px el transport
      passa a una segona fila
- [x] Compàs: Hauríem de pensar poder fer compassos de 2, 3, 4 (ja el tenim),
      5, etc. (Molaria fer un vals, o ritmes d'amalgama 3/4+2/4). En un inici,
      per a tota la peça. - Fet: un compàs per peça, en grups de negres (2/4 a
      7/4, 3+2/4, 2+2+3/4…), triat a la capçalera; en canviar-lo, els clips i
      l'automatització es reajusten. Exemple: "Waltz"

## Rendiment

Revisat l'1 d'octubre de 2026 amb l'exemple `43-song` sonant (build de
producció, Chrome headless):

- Fil principal: uns 40 ms de JavaScript per segon amb l'editor (4% d'un
  nucli), 60 ms amb el panell Perform obert i 20 ms en pantalla completa.
- Àudio: cap tall en 8 segons a cada vista (`playbackStats`).
- Hi ha 16–48 bucles de `requestAnimationFrame` alhora (mesuradors, files del
  llançador, escenes, scopes), barats cadascun. Un sol bucle compartit, que no
  llegeixi res amb el so aturat, en podria estalviar la meitat si mai cal.
- Les aturades mentre passen els e2e són de la càrrega dels tests. Opció per més
  endavant: triar `latencyHint` ("playback" aguanta més càrrega, però amb més
  latència; ara és la mínima).

Revisat el 2 d'octubre de 2026 amb la peça de trance (96 compassos) sonant, en
arrossegar un knob:

- El panell Song es repintava a cada canvi del patch, i rellegia cada fila per a
  cada cel·la: bloquejos de fins a 140 ms, i els rellotges, amb 0,1 s
  d'antelació, perdien notes. Arreglat: es llegeix cada fila una vegada, i el
  panell només escolta els noms de les files i de les línies.
- Ara, en producció, el bloqueig més llarg és de 28–47 ms. En desenvolupament
  encara n'hi pot haver algun d'uns 100 ms, pel mode de desenvolupament de React
  i perquè tots els nodes es repinten a cada moviment. Si cal, el següent pas és
  que només es repinti el node que canvia.
