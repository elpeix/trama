# Trama — Millores possibles

26 de setembre de 2026 (actualitzat el 2 d'octubre)

Tots els punts de l'ordre suggerit del final ja estan fets, menys el 12, que
queda aparcat. Cada secció té un apartat **Estat** amb el que s'ha fet i el que
hi falta. El que queda és a "Característiques que falten": hi ha fets el so
analògic clàssic (**VCO** i **Ladder**) i tot el que va faltar en fer la peça de
trance. Hi queden el Sampler amb diverses mostres, els parcials inharmònics, el
piano de cua, el MIDI (ajornat sense teclat) i alguna millora petita.

## Escriure valors amb doble clic

Fer doble clic sobre el número d'un control per escriure'l, com ja fa la
pantalla del tempo. És la manera més precisa d'arribar a un valor concret, i la
solució per a l'ajust fi quan Alt+arrossegar no està disponible (alguns gestors
de finestres de Linux el fan servir per moure finestres).

### On s'aplica

- Els valors dels sliders de paràmetre (Freq, Q, Gain, Time, Rate…).
- L'atenuador dels cables de control (−1 a 1).
- Tot el que es mostri com a número al costat d'un control.

### Com es comporta el doble clic

- El doble clic sobre el número el converteix en un camp de text amb el valor
  seleccionat.
- Enter o clicar fora desa; Esc descarta.
- El valor es limita al rang del paràmetre i s'arrodoneix al seu pas (0,01, 1
  Hz…).
- Accepta la unitat opcional ("440", "440 Hz", "0.3 s"), i potser notes per a
  les freqüències ("A4").
- Cada valor escrit és un sol pas de desfer.
- Mentre s'escriu, les tecles no toquen notes ni engeguen el so (com ja passa
  amb el nom dels nodes).

### Decisions

- [x] Enter amb el control enfocat també obre l'edició, com al tempo.

### Estat

Fet, amb un control de valor comú (`useValueControl`) que fan servir els knobs,
l'atenuador dels cables i el tempo. Accepta la unitat i la coma decimal ("0,3").
Falta escriure notes a les freqüències ("A4").

## Millorar la resta de sliders: knobs

Els sliders dels mòduls passen a ser **knobs rodons**, com els d'un
sintetitzador, i es comporten com la pantalla del tempo i l'atenuador dels
cables, que ja s'han polit. Ara són els sliders del navegador, amb l'aspecte i
el comportament per defecte.

| Millora                                               | Què aporta                                                           | Ja existeix a |
| ----------------------------------------------------- | -------------------------------------------------------------------- | ------------- |
| Knob rodó en lloc de slider horitzontal               | Més "synth" i ocupa menys; cal que el valor es llegeixi bé al costat | —             |
| Arrossegar amunt o avall per canviar el valor         | Com un potenciòmetre; no cal apuntar a la barra                      | Tempo         |
| Rodeta del ratolí sobre el control                    | Ajust ràpid sense clicar, sense fer zoom a l'editor                  | Tempo         |
| Ajust fi (Alt, o arrossegar més lent)                 | Precisió en rangs grans, com Freq de 20 Hz a 20 kHz                  | Atenuador     |
| Doble clic al nom per tornar al valor per defecte     | Desfer un canvi d'un sol gest                                        | —             |
| Enganxar a valors clau (0, el centre, el per defecte) | Arribar al valor neutre sense buscar-lo                              | Atenuador (0) |
| Aspecte de maquinari (knob fosc, valor en verd)       | Coherència amb la barra de dalt                                      | Tempo, botons |
| Marca del valor modulat                               | Veure fins on arriba la modulació d'un LFO o ADSR sobre el knob      | —             |

### Decisions

- [x] Knobs rodons, no sliders horitzontals.
- [x] Es canvien arrossegant en vertical, un cop siguin knobs.
- [x] Les mateixes dreceres a tot arreu (knobs, atenuador dels cables i tempo):
      Alt per a l'ajust fi, doble clic al valor per escriure'l i doble clic al
      nom per restablir.

### Estat

Fet, tota la taula:

- Els knobs tenen faldó amb estries, tapa bombada i un anell de LEDs amb el
  valor en verd. Arrossegar tot el rang són 160 píxels, sigui quin sigui.
- S'enganxen al valor per defecte, i a 0 quan el rang hi arriba.
- La modulació es veu en taronja a la vora del knob mentre sona.
- L'atenuador és un knob petit dins la píndola del cable, i s'enganxa a 0 i
  a 1.
- Els mòduls s'han vestit com la barra de dalt: panell fosc, noms en
  majúscules i un LED amb el color de la categoria.

El tempo no té nom per restablir-lo, i Alt no hi fa res amb passos d'1 BPM.

## Octaves des del teclat: Keyboard i Arp

Mantenir Maj mentre toques fa sonar les notes una octava amunt, al Keyboard i a
l'Arp alhora, perquè tots dos reben les mateixes tecles. Ara el teclat de
l'ordinador només cobreix del Do4 al Do5, i per canviar d'octava s'ha d'anar al
paràmetre Octave de cada mòdul.

### Com es comporta Maj

- Maj + tecla: la nota sona 12 semitons amunt (A = Do5 en lloc de Do4).
- Cada tecla recorda la nota que ha començat: si deixes anar Maj abans que la
  tecla, s'atura la nota correcta i no en queda cap penjada.
- A l'Arp, un acord amb Maj s'arpegia una octava amunt; es poden barrejar notes
  amb i sense Maj per tenir acords de més d'una octava.

### Alternatives o complements

- Z / X per baixar i pujar l'octava de forma permanent, com a Ableton Live, amb
  l'octava actual visible al node.
- ~~Ampliar el teclat amb les tecles de la fila de sota (Z, X, C…) per tenir
  dues octaves alhora.~~ Descartat: Z i X passen a canviar l'octava.
- Entrada MIDI (Web MIDI): un teclat de veritat, amb totes les octaves.

### A tenir en compte

- Maj és la tecla de selecció per rectangle de l'editor: mentre es manté,
  l'editor posa una capa a sobre que captura el ratolí. Per tocar no molesta,
  però cal comprovar que no deixi l'editor en mode selecció.
- Z pot tenir conflicte amb ⌘Z / Ctrl+Z (desfer) si es fa servir per a l'octava;
  cal que només actuï sense modificadors.

### Decisions

- [x] Les dues coses: Maj puja una octava mentre es manté, i Z / X baixen i
      pugen l'octava de forma permanent, amb l'octava actual visible.

### Estat

Fet, i més del que es preveia:

- El Keyboard i l'Arp mostren un piano amb les lletres de l'ordinador. Les
  tecles premudes s'il·luminen, i la de la nota que sona s'il·lumina del tot.
- Z / X, o els botons ▼ ▲ del node, mouen l'octava de les tecles, que es veu en
  una pantalleta. És de la sessió: no es desa amb el patch.
- Un LED "UP" s'encén mentre les tecles sonen una octava amunt: amb Maj, o amb
  Bloq Maj activat. Amb Bloq Maj, Maj les torna avall.
- El paràmetre Octave del Keyboard i de l'Arp ha passat a ser **Transpose**, de
  C a B: tria la nota per on comencen les tecles, i Z / X en trien l'octava. La
  pantalleta mostra les notes que surten, amb les dues coses sumades. Els
  patches antics perden l'octava d'aquests dos nodes.

Queda l'entrada MIDI.

## Diverses fonts de notes al mateix oscil·lador

Amb un Keyboard i un Arp, o un Keyboard i un Seq, connectats al mateix
oscil·lador, només en sona un, perquè un oscil·lador és una sola veu. A més, els
cables de control que van al mateix paràmetre se sumen: les dues alçades
s'afegeixen l'una a l'altra.

### Què passa ara

- **Seq + Keyboard:** el `pitch` del Keyboard, que es queda a l'última nota
  tocada, se suma al del Seq i transposa el patró. És útil, però passa de rebot:
  no es veu enlloc, i si el `gate` del Keyboard va al mateix ADSR també el
  dispara.
- **Arp + Keyboard:** tots dos reben les mateixes tecles. La nota de l'Arp se
  suma a la del Keyboard i surt desplaçada (amb Do4 no es nota, amb Mi4 sí), i
  els dos `gate` disparen el mateix ADSR.

### Decisions

- [x] **La transposició és cosa del Seq, no del Keyboard.** El Seq escolta les
      tecles i transposa el seu patró (relatiu a Do4), sense cap Keyboard
      connectat. El Keyboard queda per tocar. Substitueix la fila "Transposar el
      patró tocant el teclat" de la taula.
- [x] **Avís ara.** El node avisa quan dos `pitch` arriben al mateix paràmetre
      ("Two pitch sources add up"), com l'avís que ja té el Gain.
- [x] **Explicar-ho al README:** per tocar dues parts alhora cal una cadena per
      part (oscil·lador, ADSR, Gain).

La polifonia no fa innecessari l'avís. Polifonia vol dir diverses veus d'una
mateixa part (un acord del Keyboard). Dues parts diferents, com un Seq i un
Keyboard, continuaran necessitant una cadena cadascuna, i connectar-les al
mateix oscil·lador sempre sumarà les alçades.

### Estat

- [x] La transposició del Seq, amb un selector **Keys** (`off` / `transpose`)
      apagat per defecte, perquè tocar una melodia no mogui el baix sense
      voler. La darrera tecla premuda es manté fins que se'n prem una altra, i
      la graella mostra les notes que sonen. L'Arp en mode `notes` fa el
      mateix. La transposició és de la sessió; el selector es desa.
- [x] L'avís "Two pitch sources add up", sota el paràmetre on arriben les dues
      fonts, com l'avís del Gain.
- [x] L'explicació al README, a "Connexions".

## Arp amb notes pròpies, sense teclat

L'Arp podria tenir les seves pròpies notes i tocar sol, en bucle, com el Seq.
Així no cal mantenir tecles premudes per sentir un arpegi.

### Com es comporta

- **Paràmetre Source:** `keys` (com ara, arpegia les tecles premudes) o `notes`
  (arpegia les notes del mateix node).
- **Amb `notes`:** el node mostra un teclat petit d'una octava. Cada clic activa
  o treu una nota, i les actives s'il·luminen. L'Arp les toca mentre sona el so,
  i torna a començar en engegar-lo, com el Seq.
- **Al fitxer:** les notes es guarden com a text llegible (`"C4 E4 G4"`), igual
  que el patró del Seq. Cada clic és un pas de desfer.
- **Amb Chord:** una sola nota i un acord ja fan un arpegi sencer amb un clic.
  Pattern, Span, Gate i Octave funcionen igual que ara.
- **Amb les tecles:** en mode `notes`, tocar una tecla podria transposar les
  notes de l'Arp (relatiu a Do4), amb el mateix criteri que el Seq.

### Estat

Fet. A més:

- Un selector ▼ [C4–C5] ▲ sota el piano mou les notes una octava. És el
  paràmetre `octave`, que només afecta les notes pròpies.
- Ja no hi ha la llista de notes que sonen: la nota que sona s'il·lumina al
  piano, en tots dos modes.
- Amb **Keys** a `transpose`, les tecles transposen les notes, com al Seq.

### Alternativa lleugera: Latch

Toques les tecles una vegada i l'arpegi continua en deixar-les anar, fins que en
toques d'altres. És més petit de fer (ja és a la taula d'idees), però continua
depenent del teclat per triar les notes.

Descartat: amb les notes pròpies, l'Arp ja toca sol sense mantenir cap tecla.

### Ritme: passos que sonen i passos que callen

Una fila de passos a l'Arp, com la del Seq, per triar quins sonen i quins
callen. Així es pot fer un ritme amb l'arpegi sense canviar de mòdul. Es
desaria com a text, com el patró del Seq (per exemple, `"x x - x"`), i cada
clic seria un pas de desfer.

**Fet.** Un pas que calla no perd la nota: queda per al pas següent que sona, i
l'arpegi es recorre sencer. El ritme té 16 passos i un paràmetre **Length**
(1–16, per defecte 8), i per defecte sonen tots, de manera que els patches
antics sonen igual. Funciona amb les tecles i amb les notes pròpies, i va sobre
la graella comuna, alineat amb els Seq.

## Patrons i canvi quantitzat: Seq i Arp

Per improvisar: cada Seq i cada Arp té quatre patrons (A–D), i se'n pot fer
sonar un mentre se n'edita un altre. Quan el nou està llest, es llança, i el
canvi arriba a la pulsació 1 del compàs o a l'instant. És el que als
seqüenciadors de maquinari se'n diu *patterns*, amb *launch quantization*
(Ableton) o *pattern change mode* (Elektron).

### Com es comporta

- **Què guarda un patró:** la melodia i el ritme. Al Seq, els passos, Length,
  Root i Scale; a l'Arp, les notes, el ritme, Length, Pattern i Chord. El que és
  so (Gate, Step, i l'oscil·lador i el filtre, que són d'altres nodes) queda fora,
  perquè canviar de patró no canviï el caràcter del node.
- **Dues seleccions:** el patró que **sona** i el que **edites**. El node mostra
  el que edites, i els botons A–D indiquen quin sona i quin està a punt d'entrar.
- **Quan entra el patró llançat:** un selector amb `bar` (a la pulsació 1 del
  compàs següent), `now` (a l'instant, continuant pel mateix pas perquè quedi a
  temps) i `end` (quan acaba el patró que sona).
- **Desfer:** editar un patró es desfà, com ara. Canviar el que sona és un gest
  d'actuació i no entra a l'historial, com la transposició amb les tecles.

### A tenir en compte

- **Format del fitxer:** quatre còpies dels passos o les notes per node, amb el
  mateix format de text, en un camp nou del node (com el `mute` i el `solo` dels
  cables). Els patches antics carreguen el que tenen com a patró A.
- **Compàs:** el `Transport` compta pulsacions però no compassos. `bar` suposa
  compassos de 4 pulsacions, comptats des que s'engega el so.

### Estat

Fet, com es descriu a dalt, amb aquests detalls:

- Els botons A–D i el selector **Launch** (`bar` / `end` / `now`) van en una
  sola fila del node. Clic per editar, doble clic per llançar.
- Al model, els paràmetres del node són el patró A, i `patterns` guarda el B, el
  C i el D. Al fitxer només s'escriuen els que no són iguals a l'A.
- Els compassos són `BEATS_PER_BAR` al `Transport`, que ara també pot fer servir
  el Clip.
- Després s'hi han afegit el Drums i el Clip. Al Clip, un patró són les notes i
  Bars, i el piano roll edita el patró triat al node.
- Falta copiar un patró sobre un altre, i que la graella mostri el pas que sona
  només quan s'edita el patró que sona.

### Escenes, més endavant

Llançar alhora el mateix patró de tots els Seq i Arp, com les escenes d'Ableton.
Té sentit un cop hi hagi patrons per node. Si una escena també hagués de canviar
el so (els knobs d'altres nodes), la peça és més gran: s'acosta a
l'automatització de "Gravar el que es toca".

Analitzat com a part del mode cançó.

## Seqüències llargues: un mòdul de clip

Un mòdul nou, tipus "piano roll" o "clip", per a frases de diversos compassos
amb notes de qualsevol durada i, amb el temps, acords. No substitueix el Seq: el
Seq de passos es queda tal com és, perquè és l'eina ràpida per a línies de baix,
arpegis i patrons curts. Tots dos conviuen, com a molts sintetitzadors i DAW.

|                     | Seq (el que hi ha)                | Clip (nou)                                             |
| ------------------- | --------------------------------- | ------------------------------------------------------ |
| Temps               | Passos fixos sobre una graella    | Notes lliures, amb inici i durada en beats             |
| Durada de les notes | Un pas (o més, amb la lligadura)  | La que vulguis                                         |
| Llargada            | 1–16 passos                       | Diversos compassos                                     |
| Alçada              | Una nota per pas, dins una escala | Qualsevol nota; diverses alhora quan hi hagi polifonia |
| On s'edita          | Dins del node                     | En un editor gran a part, que s'obre des del node      |

### Què cal

- **Guardar notes, no números.** Una nota té inici, durada, alçada i potser
  intensitat (velocity). Els paràmetres d'ara són números o textos, així que
  probablement cal un camp de dades nou als nodes i pujar la versió del format
  de fitxer, amb migració dels antics.
- **Un editor a part.** Una graella llarga no cap en un node: un piano roll a la
  part de baix de la pantalla, com el de qualsevol DAW. El node mostra una
  miniatura i on és el cursor.
- **Sincronització.** Ja resolta: el `Transport` compartit dona el temps en
  pulsacions, i els compassos de 4 (`BEATS_PER_BAR`) que va afegir el canvi de
  patró. El clip aniria a temps amb els Seq i l'Arp.
- **Polifonia.** Mentre no n'hi hagi, el clip sona monofònic: si dues notes
  coincideixen, sona l'última. Ja és útil per a melodies llargues. Els acords
  arriben amb la polifonia.

### Estat

Fet el clip monofònic (pas 2 de l'ordre de sota):

- Les notes es desen com a text al paràmetre `notes` (`"C4@0+1 E4@1+0.5"`), com
  els passos del Seq: no ha calgut un camp nou ni pujar la versió del fitxer.
- El piano roll és un panell a la part de baix. Es dibuixa, es mou i s'allarga
  arrossegant, i s'esborra amb doble clic; cada gest és un pas de desfer. El node
  mostra una miniatura amb el cursor.
- Acords (pas 4): la sortida `notes` envia totes les notes, les que es
  trepitgen i les que comencen alhora, a un subpatch de diverses veus. Cada nota
  s'allarga fins que la mateixa nota torna a començar (`chordSchedule`), i el
  note off s'envia quan arriba el seu moment, no en programar la nota, perquè
  el repartidor no alliberi la veu abans d'hora. `pitch` i `gate` continuen
  monofònics, com abans. El piano roll ja deixava apilar notes: no ha calgut
  tocar-lo. Exemple `23-chords`.
- Després s'hi ha afegit: seleccionar i moure diverses notes alhora, copiar,
  enganxar i duplicar, dreceres de teclat, quantitzar, duplicar el bucle,
  graelles de tresets, remarcar una escala, sentir les notes mentre s'editen i
  gravar des del teclat de l'ordinador, i importar i exportar `.mid`.
- Després, la **velocity**: cada nota del Clip en té una (`C4@0+1v90`), el senyal
  `notes` la porta, el Keyboard, el Clip i l'In de notes en tenen una sortida de
  control, el Seq toca a 127 els passos accentuats, i el MIDI la conserva.
  S'edita en una franja sota el piano roll. Exemple `35-velocity`.
- I el **zoom**: Ctrl/Cmd i la roda (o pessigar) en el temps, Alt i la roda en
  l'alçada de les files, mantenint el que hi ha sota el ratolí; botons −, + i
  Fit a la barra.

### Ordre

1. ~~**Lligadura (i accent) per pas al Seq.**~~ Fet. Pas intermedi: un pas pot allargar
   la nota de l'anterior, i ja hi ha notes de més d'una pulsació sense canviar
   d'eina. Petit i no trenca res.
2. ~~**Clip monofònic**, amb l'editor a part i el format de notes.~~ Fet.
3. ~~**Polifonia.**~~ Fet.
4. ~~**Clip amb acords.**~~ Fet.

## Mòduls de so nous

Mòduls que generen o transformen el so d'una manera que els nodes de Web Audio
no poden fer sols. Gairebé tots necessiten un `AudioWorklet`: codi propi que
corre al fil d'àudio, mostra a mostra. És una peça d'arquitectura nova (un
processador per mòdul, carregat abans d'engegar el so) que es fa una vegada i
després serveix per a tots.

| Mòdul              | Què fa                                                                 | Mida | Notes                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| ~~PhysicalModel~~  | Sintetitza un so imitant un objecte físic, com una corda pinçada       | M    | Fet: Karplus-Strong, pinçat per un `gate`, amb Decay i Tone. Ha posat la base de l'`AudioWorklet`                     |
| ~~PitchShifter~~   | Canvia l'altura del so que hi entra sense canviar-ne la durada         | M    | Fet: dos capçals sobre una línia de retard que es fonen; Shift modulable en semitons, Window i Mix                    |
| ~~SpectralFreeze~~ | Congela l'espectre d'un instant i el manté sonant                      | L    | Fet: FFT de 2048 amb solapament de 4, congelat per un `gate`, amb Mix i Release. Falta un Blur                        |
| ~~Granulator~~     | Trenca un so en grans petits i els recombina: densitat, mida i posició | L    | Fet en directe: grans sobre els últims 4 s del que li arriba, amb Freeze. Falta carregar un fitxer d'àudio com a font |
| ~~CustomFilter~~   | Un filtre amb la resposta que triïs, dibuixant-ne la corba             | M    | Fet: 16 bandes `peaking` de 25 Hz a 20 kHz, ±24 dB, amb l'editor de corbes de l'oscil·lador                           |
| ~~Harmonics~~      | Oscil·lador additiu: l'ona es fa sumant harmònics que es poden modular | M    | Fet: 16 sinus amb Bright i Even modulables, l'editor en barres i l'exemple `17-harmonics`                             |

## Gravar i reproduir una sessió

Hi ha dues coses que es poden gravar, i són molt diferents de mida:

- **El que sona.** Gravar la sortida en un fitxer d'àudio per escoltar-lo o
  compartir-lo. És petit: un `MediaRecorder` connectat a l'Output, amb un botó
  a la barra de dalt. El so gravat també podria ser la font del Granulator.
  **Fet:** el botó ● engega el so si cal, mostra el temps i descarrega un
  `.webm` en aturar-lo o en aturar el so.
- **El que es toca.** Gravar les notes i els moviments dels knobs, i
  reproduir-los després sobre el patch, com l'automatització d'un DAW. És gran,
  i guarda notes amb inici i durada, com el clip: convé fer-lo després del clip
  i reaprofitar-ne el format.

### Aparcat: loop o gravació de sessió

Sota "gravar el que es toca" hi ha dues idees diferents, i s'ha decidit deixar-les
per més endavant:

- ~~**Loop:** armar un Clip i que les tecles que es toquen mentre sona hi quedin
  gravades, volta rere volta.~~ Fet: botó **Rec** al piano roll. Les notes se
  sumen a les que hi ha (overdub) i es graven tal com es toquen, sense ajustar-les
  a la graella (hi ha Quantize per fer-ho després).
- **Gravació de sessió:** gravar-ho tot (notes, knobs, llançaments de patrons)
  sobre una línia de temps llarga i reproduir-ho sencer, com l'automatització
  d'una DAW. Mida L o més: cal un format nou, un editor de corbes per knob i
  decidir com conviu amb el que es toca en directe. Té més sentit quan hi hagi
  escenes i potser subpatches. Revisat amb el mode cançó: el
  ReBirth grava els knobs en continu sense editor de corbes, i la cançó de
  patrons i knobs s'estima en 6–8 dies.

La gravació que interessa és la de tot, notes i knobs. El loop es pot fer sol si
algun dia cal, sense decidir res de la sessió.

## Subpatches i abstraccions, com a Pure Data

Agrupar nodes en un de sol, i més endavant fer-ne mòduls propis reutilitzables. La
referència és Pure Data, que té dues coses diferents:

| Pure Data                 | Què és                                                                   | A Trama                                                            |
| ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Subpatch `[pd nom]`       | Un grup de nodes dins d'una caixa, amb llenç propi; cada còpia és seva  | **Subpatch**: agrupar per endreçar (una Voice, un delay estèreo…)  |
| Abstracció (`nom.pd`)     | Un patch desat a part; les instàncies comparteixen la definició         | **Mòduls propis**: la base de la polifonia (una Voice ×N)          |
| `[inlet~]` / `[outlet~]`  | Objectes de dins que defineixen els ports de fora                       | Mòduls **In** i **Out**, amb el tipus del senyal i el nom del port |
| *Graph on parent*         | Mostrar controls de dins a la caixa de fora                             | Una entrada de control es veu a fora com un knob modulable         |

### Decisions

- [x] **Ports explícits, com a PD:** mòduls In i Out dins del subpatch, amb el
      tipus (àudio, control, trigger) i el nom del port. Una drecera, "Group",
      convertirà una selecció en subpatch i crearà els In i Out dels cables que
      creuen la frontera.
- [x] **Editar a dins en el mateix llenç:** doble clic al node l'obre, amb un
      camí a dalt ("Patch › Voice") per tornar. Desfer funciona a tots els
      nivells.
- [x] **El motor no canvia:** en sincronitzar, els subpatches s'aplanen en un sol
      graf, amb els ids dels nodes de dins prefixats (`subpatch-1/filter-2`), i
      els In i Out fan de pas entre fora i dins.
- [x] **Primer els subpatches inline** (còpies independents, com `[pd]`). Les
      abstraccions, amb una definició compartida, vindran amb la polifonia.

### Estat

Fet el pas 1, el subpatch inline:

- El node `subpatch` guarda el seu graf a `patch`, i el fitxer el desa i el
  valida com el de fora. Els ports surten dels In i Out de dins, ordenats de dalt
  a baix i amb el seu nom.
- El store mostra el graf del `path` obert, però l'historial, l'autosave i el
  motor treballen sempre amb el patch sencer. Els cables que perden el port
  (un In esborrat o amb un altre senyal) es treuen sols, a tots els nivells.
- Les pantalles de dins (passos, mesuradors, modulació) parlen amb el motor amb
  els ids prefixats, a través d'un `EngineContext` amb el camí.
- Exemple `21-subpatch`.

### Ordre

1. ~~**Subpatch inline:** el mòdul, els In i Out, entrar-hi i sortir-ne, i
   l'aplanat per al motor.~~ Fet.
2. ~~**Group:** convertir una selecció en subpatch.~~ Fet: botó Group i
   Ctrl/⌘+G. Un In per cada font de fora i un Out per cada port que surt, amb la
   configuració dels cables al destí; no agrupa si faria un bucle per fora.
3. ~~**Knobs a fora:** les entrades de control com a knobs del node de fora.~~
   Fet: un In de control té un Value que se suma al cable, i a fora es veu com un
   paràmetre modulable, amb el mateix valor que a dins. Falta la marca de
   modulació en aquests knobs de fora.
4. ~~**Polifonia**~~ Fet, sense passar per les abstraccions; vegeu "Polifonia".
5. ~~**Paràmetres publicats**~~ Fet: qualsevol knob o selector de dins surt a la
   cara del subpatch amb el seu rang i unitats, i es pot reanomenar i modular.
   Resol el que els In de control no podien: els paràmetres no modulables
   (el Decay d'un ADSR) i les unitats. Exemple `25-drums`.
6. **Abstraccions**, si algun dia calen: una definició compartida per diverses
   instàncies. La polifonia no les ha necessitat. Els subpatches desats com a
   presets (**My modules**) en fan la part de reaprofitar, amb còpies
   independents. Aparcat fins que hi hagi una aplicació d'escriptori: vegeu
   "Anàlisi de les abstraccions".

### Anàlisi de les abstraccions

Feta el 30 de setembre de 2026. Una abstracció és una sola definició compartida
per diverses instàncies: es canvia l'interior una vegada i canvien totes, però
cada instància té els seus knobs.

**Com encaixaria al web:**

- Les definicions anirien dins del patch, en un camp nou `definitions` (id →
  nom, graf i paràmetres publicats), perquè el fitxer continuï sent autònom, com
  amb les mostres.
- Una instància seria un node `subpatch` amb `ref` en lloc de `patch`, i els seus
  propis `values` per als knobs publicats. Voices ja és de cada node.
- El motor gairebé no canvia: `flattenGraph` resoldria el `ref` i aplicaria els
  `values`. Com que ja prefixa per id d'instància, cada instància té els seus
  nodes d'àudio, i les pantalles de dins mostren la instància per on s'ha entrat.
- Desfer funciona sol, perquè les definicions formen part del patch.

**Cost: uns 4–6 dies (L).**

| Peça                   | Què cal                                                                                                                                                                                                                                             | Mida |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Model (`subpatch.ts`)  | Resoldre `ref` a `graphAt`, `validPath`, `allNodes`, `pruneConnections`, `prunePublished`, `portsOfNode` i l'aplanat; detectar cicles                                                                                                               | M    |
| Store (`patchStore.ts`) | `withGraphAt` ha d'escriure a la definició quan el camí passa per una instància. El knob publicat de fora avui escriu el paràmetre del node de dins (`updateInnerParam`): amb una definició compartida, cada instància ha de tenir el seu valor | L    |
| Accions noves          | "Make abstraction", "Make unique" (desenllaçar), inserir instància, Group i enganxar amb `ref`, i ids que passin per davant dels de les definicions                                                                                                  | M    |
| Fitxer                 | Validar definicions, `ref` i cicles, i pujar `PATCH_VERSION` a 2 perquè una versió antiga no carregui el patch trencat                                                                                                                              | S–M  |
| UI                     | Marca d'instància al node ("Voice ×3"), avís al camí ("edites 3 instàncies"), opcions als menús de mòduls i de presets                                                                                                                              | M    |
| Tests                  | Subpatch, store, serialització, Group, i e2e d'editar, knobs per instància, desfer, desar i carregar                                                                                                                                                | M    |

Que **My modules** fossin definicions vives, enllaçades entre patches, afegiria
2–3 dies més, i caldria decidir què passa quan la còpia del patch i la de la
biblioteca divergeixen.

**Riscos:**

- El camí a través d'instàncies: avui "el graf del camí" és un sol lloc del
  patch, i amb abstraccions hi passen diverses instàncies. És el canvi més
  subtil (esborrar, reanomenar, publicar o seleccionar a dins).
- L'estat de dins: els patrons A–D o la graella d'un Seq de dins serien de la
  definició, compartits. Llançar un patró a dins només afectaria la instància per
  on s'ha entrat.

**Alternativa barata (~1 dia):** que els subpatches inserits des del mateix
mòdul de My modules recordin d'on vénen, i una acció **"Update copies"** que copiï
l'interior del subpatch que s'edita als altres del mateix origen, conservant els
knobs publicats de cadascun. Continuen sent còpies independents, i cada
actualització és un sol pas de desfer.

**Decisió:** aparcat. Tindria més sentit en una aplicació d'escriptori, on els
mòduls propis serien fitxers al disc, com els `.pd` de Pure Data: editar-ne un
actualitzaria tots els patches que el fan servir, sense haver de guardar les
definicions dins de cada patch ni sincronitzar-les amb la biblioteca del
navegador.

### Instruments tancats, com el ReBirth

Idea del 1 d'octubre de 2026: muntar instruments com els del ReBirth (una 808,
una 303) i tocar-los des de fora, sense entrar-hi. No calen abstraccions: els
dos 303 del ReBirth són iguals, però mai se n'edita l'interior, i les còpies
independents de **My modules** ja ho resolen. El que cal és una **cara** per al
subpatch.

**Què hi ha:**

- Les veus de bateria sintetitzades dins d'un subpatch, amb el Drums que les
  dispara (`25-drums`).
- Els knobs i els selectors de dins, publicats a la cara amb el seu nom.
- Desar el subpatch a **My modules** i inserir-ne còpies.

**Què falta:**

- **Publicar la graella.** `publishableParam` (`src/patch/subpatch.ts`) només
  accepta paràmetres `number` i `select`: les files del Drums (`rhythm`), els
  passos del Seq (`sequence`) i les notes de l'Arp no surten a la cara, i el
  botó de publicar només es mostra als knobs i als selectors. Per programar el
  patró cal entrar al subpatch.
- **Els patrons A–D a la cara.** Els botons de patró són del node de dins; des
  de fora no es pot triar quin s'edita ni llançar-ne un, tret del mode Perform.
- **La disposició del panell.** La cara posa els controls publicats en una
  llista, en l'ordre en què s'han publicat. Per semblar un instrument caldrien
  seccions amb títol, triar-ne l'ordre i potser un color per instrument.
- **Del Drums mateix:** mute per fila, més files (clap, toms) i un accent per
  fila en lloc d'una sola sortida `accent`.

**Què es publica:** el que es toca o es programa des de fora, com el panell
d'un aparell; el que construeix el so es queda a dins.

| Què                                         | Tipus                    | Publicar-ho                                                                                                                         |
| ------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Files del Drums, passos del Seq             | `rhythm`, `sequence`     | Sí: és el cor d'una 808 o una 303                                                                                                   |
| Notes de l'Arp                              | `notes`                  | Sí, pel mateix motiu                                                                                                                |
| Piano roll del Clip                         | `clip`                   | Sí, i és barat: s'obre a baix de la pantalla, no dins del node, i a la cara només cal un botó Edit que l'obri sobre el Clip de dins |
| Mostra del Sampler                          | `sample`                 | Sí, per a un kit: canviar el bombo sense entrar-hi                                                                                  |
| Keyboard                                    | només Transpose          | No cal: es toca amb les tecles de l'ordinador. Per tocar un instrument des de fora, un In de `notes` i un Keyboard fora             |
| Corbes d'ona, harmònics, corba de distorsió | `curve`                  | Més endavant: és disseny del so, i el ReBirth no ho ensenya. Potser els harmònics, com les drawbars d'un orgue                      |
| Scope i meter                               | pantalles, no paràmetres | Una altra cosa: que una cara pugui mostrar un meter, però no és publicar un paràmetre                                               |

Més que afegir els tipus un per un, que es pugui publicar qualsevol paràmetre i
que la cara faci servir el mateix control que el node. No tots costen igual:

- **Fàcils:** knobs, selectors, la mostra i el botó del Clip, que només escriuen
  al paràmetre del node de dins.
- **Més feina:** les graelles, que han de saber quin pas sona i quin patró
  s'edita. Avui ho troben pel camí, amb l'`EngineContext` i els ids prefixats,
  que la cara de fora no té.

Fet: graelles, patrons i seccions a la cara del subpatch, amb els exemples
`44-808` i `45-303`.

**Ordre:**

1. Publicar qualsevol paràmetre, començant per la mostra i el botó del Clip.
2. Publicar la graella del Drums i del Seq: la cara la mostra sencera, amb el
   pas que sona, i escriu al paràmetre del node de dins com els knobs.
3. Els patrons A–D a la cara, quan hi ha una graella publicada.
4. Seccions i ordre dels controls publicats.
5. Una 808 i una 303 d'exemple a **Examples**, fetes només amb subpatches.

## Polifonia

Un subpatch amb diverses veus toca acords: el motor en munta una còpia per veu, i
les notes es reparteixen entre les còpies.

### Decisions

- [x] **Un senyal nou, `notes`,** per portar les notes una a una (on i off). Un
      voltatge de `pitch` només en porta una. El Keyboard té la sortida `notes`
      a més de `pitch` i `gate`, i els patches antics no canvien.
- [x] **Voices (1–8) al subpatch,** no un mòdul nou. Dins, un **In de notes** fa
      de teclat de la veu: treu un `pitch` i un `gate`.
- [x] **Primer només el Keyboard.** El Clip amb acords és el pas següent.

### Estat

Fet:

- En aplanar, un subpatch de N veus s'hi copia N vegades. La primera conserva els
  ids d'una sola veu (`subpatch-2/…`), i així les pantalles de dins mostren la
  primera veu sense cap canvi. Les altres són `subpatch-2#2/…`. Els cables que
  entren van a totes les veus, i les sortides de totes se sumen.
- Cada In de notes rep totes les notes i sap quina veu és: tots fan el mateix
  repartiment (`VoiceAllocator`), i cadascun toca només les seves notes. Una nota
  va a la veu lliure alliberada fa més temps, perquè la cua de l'última continuï,
  i si no n'hi ha cap, pren la de la nota més antiga. Canviar les Voices, o
  treure el cable, allibera les notes.
- Group no agrupa si un cable de notes creuaria la vora.
- Exemple `22-poly`.
- El Clip ja envia notes, amb acords (vegeu "Seqüències llargues").
- El Seq també: la sortida `notes` posa cada pas en una veu pròpia, perquè les
  cues se solapin, i el selector **Chord** (`off`, `5th`, `triad`, `7th`) hi
  apila l'acord de l'escala, amb Root i Scale: cada grau té el seu acord. Forma
  part del patró. `pitch`, `gate` i accent no canvien. Exemple
  `24-seq-chords`.
- Un legato llisca les veus: les notes tenen un missatge `glide` (de la nota X
  a la Y, amb un temps), i l'In de notes mou la seva nota sense tornar a obrir
  el gate. El Seq programa tota la tirada lligada en començar la nota: cada nota
  de l'acord llisca cap a la mateixa de l'acord nou, i el Gate de l'últim pas
  les acaba.
- El Clip i el Seq comparteixen una cua (`NoteQueue`) que envia cada note off
  quan arriba el seu moment, i no abans.
- Descartat: marcar a la graella del Seq les altres notes de l'acord. S'ha provat
  amb contorn i amb un punt, i en tots dos casos carregava la graella i feia
  difícil llegir la melodia.
- Falta: notes des de l'Arp; la marca de modulació dels knobs de dins mostra la
  primera veu.

## Altres idees que han sortit

Idees comentades durant el desenvolupament que van quedar pendents, agrupades
per zona. La mida és una estimació relativa: S (unes hores), M (un dia), L
(diversos dies o canvis d'arquitectura).

| Zona   | Idea                                                           | Mida | Notes                                                                                                                                                                                                    |
| ------ | -------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mòduls | ~~Mixer amb un canal per cable~~                               | M    | Fet: nivell, mesurador, mute i solo per cable, desats al cable, i un Level general modulable                                                                                                             |
| Mòduls | ~~Dibuixador d'ona per a l'oscil·lador~~                       | M    | Fet: les ones `drawn` (forma) i `harmonics` (barres), amb el tipus de paràmetre `curve`                                                                                                                  |
| Mòduls | ~~Tocar amb el ratolí el piano del Keyboard i de l'Arp~~         | S    | Fet: la tecla sona mentre es manté, s'arrossega d'una a l'altra, i fa el mateix que la lletra (`press` / `release` a `useComputerKeyboard`); Enter amb la tecla enfocada                                                                                                                                                              |
| So     | ~~Estèreo i pan~~                                              | L    | Fet: pan per canal al Mixer, un mòdul Pan modulable, i els efectes de worklet en estèreo; exemple `20-stereo`. Els mesuradors mostren L i R, el del canal del Mixer després del pan, i l'scope es parteix en dues pistes, L a dalt i R a baix, quan són diferents |
| So     | ~~Polifonia~~                                                  | L    | Fet: Voices al subpatch i un senyal `notes`, del Keyboard a un In de notes; exemple `22-poly`                                                                                                            |
| Editor | ~~Subpatches~~                                                 | L    | Fet: inline, amb In i Out, Group i els knobs a fora. Les abstraccions queden per si calen. Vegeu "Subpatches i abstraccions"                                                                             |
| Editor | ~~Afegir mòduls amb clic dret a l'editor, on hi ha el ratolí~~ | S    | Fet: el mateix menú que Add module (`ModuleList`), on hi ha el ratolí i dins de la finestra; el mòdul es col·loca sota el clic                                                                           |
| Editor | Avís "ResizeObserver loop" quan un node canvia de mida         | S    | Inofensiu; surt al servidor de desenvolupament                                                                                                                                                           |
| Cables | Mostrar el signe de l'atenuador amb color quan és negatiu      | S    | Un cable invertit es veu d'una ullada                                                                                                                                                                    |
| Cables | ~~Avís al Gain quan li arriba modulació negativa~~ | S | Fet al `check-patch`: avisa quan el que modula un Gain el pot fer baixar de 0, si totes les fonts són d'un rang conegut (LFO, Envelope, Envelope Follower, velocity del Clip, accent del Seq). Va sortir d'un sidechain massa fort a la peça de trance |
| Seq    | ~~Transposar el patró tocant el teclat~~                       | M    | Fet, amb el selector Keys; vegeu "Diverses fonts de notes al mateix oscil·lador"                                                                                                                         |
| Seq    | ~~Omplir passos arrossegant per la graella~~                   | S    | Fet: el gest segueix el que fa la primera casella, i es desfà d'un sol cop                                                                                                                               |
| Seq    | ~~Accent i lligadura per pas~~                                 | M    | Fet: `!`, `_` i `_nota` (legato amb Glide) al text dels passos, files ACC i TIE, i una sortida accent; exemple `19-acid`                                                                                 |
| Seq    | ~~Unir-se al reinici del Transport des del moment exacte~~     | S    | Fet al `StepClock`: s'hi uneix des de l'instant del reinici, no des del tic que el veu                                                                                                                   |
| Arp    | ~~Opció de començar a l'instant, sense esperar la graella~~    | S    | Fet: el paràmetre Start (`grid` / `now`)                                                                                                                                                                 |
| Arp    | ~~Ritme: passos que sonen i passos que callen~~                | M    | Fet; vegeu "Arp amb notes pròpies"                                                                                                                                                                       |
| Arp    | ~~Latch: l'arpegi continua en deixar anar les tecles~~         | S    | Descartat: l'Arp amb notes pròpies ja toca sol, sense tecles                                                                                                                                             |
| Scope  | ~~Color del traç segons el tipus de senyal (àudio o control)~~ | S    | Fet: blaus per a l'àudio, taronges per al control, i el to distingeix els cables d'una mena                                                                                                              |
| Scope  | ~~Mode de trigger Off o per nivell~~                           | S    | Descartat: el trigger ja agafa el mig del senyal, i sense creuament la finestra ja llisca                                                                                                                |
| Scope  | ~~Desar amb el patch el traç de referència~~                   | S    | Fet: el paràmetre `trigger` del node, de tipus "cable"                                                                                                                                                   |
| Scope  | Congelar la pantalla, o capturar una sola vegada               | S    | Per mirar el que no es repeteix: una sola nota d'un ADSR, un transitori                                                                                                                                  |
| Patch  | ~~Autosave per pestanya~~                                      | S    | Fet: cada pestanya desa al seu `sessionStorage`, i una de nova comença amb el darrer patch de qualsevol (`localStorage`)                                                                                 |
| Tests  | E2e també a Firefox                                            | S    | Bloquejat: el Firefox de Playwright (155) no arrenca a macOS 27 ("Could not find profile folder"), ni llançat a mà. Tornar-ho a provar amb una versió nova de Playwright, o fer-ho només a la CI (Linux) |
| Tests  | ~~Test e2e "plays the notes of its steps" inestable~~          | S    | Fet: l'espectre podia anar un pas enrere del nivell (buit en engegar, o sense actualitzar sota càrrega). Ara es descarten les mostres sense un pic clar, sense suavitzat i amb el pic interpolat         |
| Build  | ~~El paquet de JavaScript passa de 500 kB~~                    | S    | Fet: React i React Flow en trossos propis (l'app en fa 117 kB), i un e2e contra el build que ho vigila                                                                                                   |
| Params | Escriure notes a les freqüències ("A4")                        | S    | El lector de valors ja té on afegir-ho                                                                                                                                                                   |
| Mòduls | ~~Mòdul Drums: files de ritme, un gate per fila i accent~~     | M    | Fet: Kick, Snare, Hat, Open i Acc, amb patrons A–D; `25-drums` en fa servir un en lloc de tres Seq                                                                                                       |
| So     | ~~Corba exponencial a l'ADSR~~                                 | S    | Fet: Curve (`linear` / `exp`), cada tram dibuixat amb 16 rampes curtes sobre la corba; `25-drums` la fa servir                                                                                           |
| Sync   | ~~Swing~~                                                      | S    | Fet: global, a la barra de dalt (50–75 %), sobre els setzens de la graella; el Clip queda recte                                                                                                          |

## Característiques que falten

Repàs del 29 de setembre, amb gairebé tot l'ordre suggerit fet: el que encara
no hi és, comparat amb un sintetitzador modular o una DAW. La mida segueix el
criteri de la taula anterior.

### Mòduls de so

| Mòdul                      | Què fa                                                  | Mida | Notes                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Reverb~~                 | Reverberació per a pads i veus; ara només hi ha Delay   | S–M  | Fet: `ConvolverNode` amb una cua de soroll estèreo generada; Decay, Pre-delay, Tone modulable i Mix; exemple `26-reverb`                                                                                                                          |
| ~~Distorsió / Waveshaper~~ | Saturació, fold i bitcrush                              | S    | Fet: `WaveShaperNode` amb oversampling 4x; modes `soft`, `hard`, `fold` i `drawn` (corba a l'editor de corbes), Drive modulable, Tone i Mix; exemple `27-distortion`. Falta el bitcrush, que necessita reduir també la freqüència de mostreig     |
| ~~Compressor~~             | Dinàmica per a la bateria i el bus de sortida           | S    | Fet: `DynamicsCompressorNode` amb Threshold, Ratio, Knee, Attack i Release, i un Makeup en dB; el sidechain el fa l'Envelope Follower; exemple `39-compressor`. Falta un mesurador de la reducció |
| ~~Chorus / Flanger / Phaser~~ | Retards curts modulats                                  | M    | Fet: tres mòduls en worklet, en estèreo amb l'LFO de la dreta desfasat un quart; el Chorus amb 1–4 veus, el Flanger i el Phaser amb Feedback; exemples `40-chorus`, `41-flanger` i `42-phaser` |
| ~~Sampler~~                | Carregar un fitxer d'àudio i tocar-lo amb notes o gates | M–L  | Fet: mòdul **Sampler** amb Play `one-shot`, `gate` i `loop`, Start, End i Tune modulable; les mostres van a IndexedDB i dins del `.json` en desar; exemple `32-sampler`. Falta el revers, velocity i carregar un fitxer directament al Granulator |
| ~~Entrada d'àudio~~        | Micròfon o targeta de so com a font                     | S    | Fet: mòdul **Audio Input** amb `getUserMedia` sense el processament de trucades, Gain, nivell i estat del permís; s'apaga en esborrar-lo; exemple `31-audio-input`. Falta triar el dispositiu                                                     |
| ~~Sampler amb diverses mostres~~ | Un knob tria entre diverses mostres, i un mode les alterna a l'atzar | M    | Fet: fins a 8 mostres al `sample` (ids separats per espais), **Order** `select` (amb **Select** modulable, canvi al gate següent), `random` (mai la mateixa seguida) o `cycle`; quadrets a la pantalla per veure-les i treure-les; exemple `49-samples` |
| ~~Parcials inharmònics~~ | Campanes, campanes tubulars, marimbes i gongs           | M–L  | Fet com a mòdul **Modal** (l'opció 3, síntesi modal), en un worklet: models `tubular`, `bell`, `marimba`, `vibraphone`, `glass` i `gong`, amb Decay, Bright, Hit i Stretch; exemple `48-modal` |
| ~~Piano de cua~~ | Un piano que convenci, tocat amb notes i velocity       | L    | Fet com a mòdul **Piano** sintetitzat (síntesi additiva, sense mostres): parcials estirats, una a tres cordes que baten, decay doble, velocity a la brillantor, martell, apagadors i pedal; exemple `50-piano`. Les zones per tecla al Sampler queden per si cal |
| Caràcter analògic clàssic  | Filtre ladder, PWM, unison, hard sync i deriva           | M–L  | Fet al mòdul **VCO**, en un worklet amb polyBLEP: Width modulable (PWM), Voices i Spread (unison, en estèreo), entrada sync i Drift; exemple `46-vco`. El filtre ladder és el mòdul **Ladder** (24 dB, Res fins a autooscil·lar i Drive); exemple `47-ladder` |

#### Sampler amb diverses mostres, com les bateries del ReBirth

Idea treta del manual de la ReBirth RB-338 Mod ReFill per al Reason (pàgines 2 i
6), que explica com sonaven les bateries del ReBirth:

- El **Tune** del snare de l'808 no afinava una mostra, sinó que passava entre
  cinc gravacions diferents del snare. El bombo de la 909 feia el mateix amb
  quatre.
- El **Snappy** controlava el volum de quatre mostres de "soroll", que sonaven
  una cada vegada en ordre aleatori.
- El canvi de mostra entrava quan el patró tornava a començar, no a l'instant.

A Trama seria un Sampler que carrega diverses mostres en lloc d'una:

- Un knob tria quina sona, i es pot modular. Com al ReBirth, el canvi entraria a
  la nota següent, sense tallar la que sona.
- Un mode **round robin** les alterna a l'atzar a cada nota, perquè un hat o un
  snare repetit no soni sempre igual.
- Les mostres ja van a IndexedDB i dins del `.json` per identificador: el
  paràmetre `sample` passaria a ser una llista.
- Amb dos Samplers, un de cos i un de soroll, i un Mixer, es fa el snare de
  l'808 sencer, amb el Snappy com a volum del segon.

**Estat:** fet així. El Select es llegeix en el moment del `gate`, el knob i el que
hi porten els cables, i el canvi entra a la nota següent, com al ReBirth.

#### Parcials inharmònics: la campana tubular

Ara no es pot fer una campana tubular que es toqui amb notes. Els parcials d'un
tub que vibra lliure pels dos extrems no són harmònics: van a ratios de
**1 : 2,76 : 5,40 : 8,93 : 13,34 : 18,64**. La nota que se sent surt dels modes
4, 5 i 6, que queden gairebé a 2 : 3 : 4, i cada parcial s'apaga a una
velocitat pròpia: els aguts de seguida, els greus a poc a poc.

Què hi ha ara i per què no n'hi ha prou:

- Diversos Oscillator sinus en mode `free`, cadascun amb el seu Envelope, fan
  una campana convincent, però d'una sola nota.
- En mode `keyboard` la freqüència queda a C4 i el Detune va de −1200 a 1200
  cents: un parcial a 2,76× (uns 1757 cents) ja no hi cap.
- El Harmonics només fa harmònics enters, i sona a orgue.
- El PhysicalModel és Karplus-Strong, una corda: també harmònic.
- El cable de `frequency` va al `detune`, en cents: és FM exponencial, que
  desafina la nota en lloc de donar les bandes laterals netes d'una campana DX7.

Opcions, de menys a més feina:

1. Un paràmetre **Ratio** a l'Oscillator, que multipliqui la freqüència també
   en mode `keyboard`. És el canvi més petit perquè l'additiva inharmònica es
   pugui tocar, però una campana demana sis oscil·ladors i sis envelopes.
2. Un mode inharmònic al **Harmonics**, amb una ratio i un decay per parcial.
   Una campana tubular cabria en un sol mòdul, i també campanes, marimbes o
   gongs, amb preajustos de ratios.
3. Un model de barra o campana al **PhysicalModel**, amb síntesi modal: un banc
   de ressonadors excitats per un cop. És el més realista.

Abans de triar, un exemple amb els mòduls d'ara, a nota fixa, serviria per
sentir si el resultat convenç.

**Estat:** fet amb l'opció 3, com un mòdul a part, **Modal**: un ressonador de
dos pols per a cada parcial del model, colpejat per un `gate`. Les proporcions de
la campana tubular són les d'un tub lliure pels dos extrems, normalitzades
perquè la nota sigui la que se sent (la meitat del quart mode).

#### Piano de cua

Ara només es pot fer una aproximació. El que fa que un piano de cua soni com a
tal:

- **Parcials una mica estirats:** la rigidesa de la corda posa cada parcial una
  mica més agut que l'harmònic exacte, més com més agut és.
- **Dues o tres cordes per nota**, una mica desafinades entre si: fan batecs i
  un doble decay, que primer cau ràpid i després deixa una cua llarga.
- **El martell:** com més fort es toca, més brillant és el so, no només més
  fort. Sense velocity no hi ha piano.
- **La taula harmònica i el pedal:** les ressonàncies del cos, la ressonància
  per simpatia de les altres cordes i el soroll de l'apagador en deixar la
  tecla.

Què hi ha ara i per què no n'hi ha prou:

- El PhysicalModel, amb polifonia, Decay llarg, Damp i un Filter, sona a arpa,
  a clavecí o a piano de joguina. Li falten l'excitació de martell (ara pinça
  amb una ràfega de soroll), la inharmonicitat, les cordes dobles i la velocity
  a la brillantor.
- El Sampler, amb una mostra real, dona el millor timbre, però només en carrega
  una: el Tune va de −24 a 24 semitons, i una mostra transportada més d'uns
  quants semitons ja no sona natural. Tampoc té velocity.
- El Harmonics no hi arriba: un piano té desenes de parcials, cadascun amb el
  seu decay, i estirats.

Opcions:

1. **Sampler multimostra:** zones per tecla (una mostra cada tres o quatre
   semitons) i capes de velocity. És el camí dels pianos sampled i lliga amb el
   "Sampler amb diverses mostres" d'aquí dalt. Demana tenir mostres que no
   pesin massa dins del `.json`.
2. **Un model de piano al PhysicalModel**, a l'estil del Pianoteq: martell,
   filtres passa-tot de dispersió dins del llaç, dues o tres cordes acoblades i
   un filtre de cos. Molta més feina, però sense mostres i amb tot modulable.

**Estat:** fet amb un tercer camí, un mòdul **Piano** de síntesi additiva: cada
parcial és un sinus amb el seu decay doble, estirat per la inharmonicitat de la
corda, i repetit a cada corda de la tecla als parcials baixos. Toca amb el senyal
`notes`, és polifònic sol (16 veus) i no fa servir mostres. El Sampler multimostra
per zones queda per si es volen fer servir mostres de piano de debò.

#### El so analògic clàssic

La síntesi subtractiva ja hi és: una `sawtooth` o una `square` passa per un
Filter passa-baixos i un Envelope, com als exemples `01-basic-synth`,
`19-acid`, `22-poly` i `45-303`. El que falta és el caràcter dels analògics
clàssics, com el Moog, el Juno o el Prophet:

- **Filtre ladder:** el Filter és un `BiquadFilterNode` de 12 dB/octava. Un
  Moog és un ladder de 24 dB/octava, que satura quan l'empenys i auto-oscil·la
  amb la ressonància al màxim. És la diferència que més s'hi nota. Demana un
  worklet; un tipus `ladder` al Filter, amb un Drive.
- **PWM:** la `square` de l'Oscillator és sempre al 50 %. Les cordes i els pads
  del Juno venen de modular-ne l'amplada amb un LFO. Una ona `pulse` amb un
  Width modulable; no es pot fer amb una `PeriodicWave` modulable, però sí amb
  dues serres desfasades o amb un worklet.
- **Unison o supersaw:** diverses serres desafinades a la vegada, el so trance
  o el "hoover". Ara es munta a mà amb diversos Oscillator. Un paràmetre Voices
  i un Spread a l'Oscillator.
- **Hard sync:** un oscil·lador que reinicia el cicle d'un altre, el so dels
  leads agressius. Els `OscillatorNode` no ho permeten: demana un worklet.
- **Deriva analògica:** petites variacions a l'atzar de l'afinació i del tall a
  cada nota, perquè no soni tan perfecte. Es pot fer ara amb un Sample & Hold i
  un Slew; un paràmetre Drift ho faria d'un sol cop.

Si se'n fa un worklet d'oscil·lador, PWM, unison i hard sync hi caben junts,
amb ones sense aliasing (polyBLEP).

**Estat:** fet amb el mòdul **VCO** (PWM, unison, hard sync i deriva), que
conviu amb l'Oscillator. El filtre ladder és un mòdul a part, **Ladder**: quatre
etapes de zero delay amb saturació a l'entrada, en un worklet.

### Mòduls de control

| Mòdul                          | Què fa                                                                    | Mida | Notes                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Sample & Hold~~              | Agafa el valor d'un senyal a cada gate i el manté                         | S    | Fet: en un worklet, a la mostra exacta; Clock `gate` o una divisió de la graella, i sense `in` un valor a l'atzar; exemple `28-sample-hold`                                                             |
| ~~Slew / Lag~~                 | Suavitza els salts d'un senyal de control                                 | S    | Fet com a **Slew**: en un worklet, a ritme constant, amb Rise i Fall per separat (temps per moure's 1, una octava en un `pitch`); exemple `37-slew`                                                     |
| ~~Quantizer~~                  | Ajusta un `pitch` a una escala                                            | S    | Fet: un `WaveShaperNode` amb una corba en escala, ±5 octaves, amb Root i Scale del Seq; exemple `29-quantizer`                                                                                          |
| ~~Clock divider / multiplier~~ | Un rellotge a la meitat, al doble…                                        | S    | Fet com a **Clock**: una sortida `gate` per divisió de la graella (bar a 1/32), o ÷16 a ÷1 dels `gate`s que li arriben; exemple `30-clock`. El Seq, l'Arp i el Drums hi segueixen amb l'entrada `clock` |
| ~~Math~~                       | Sumar, multiplicar, invertir, offset, mínim i màxim de senyals de control | S    | Fet: en un worklet, `a` combinat amb B (knob més cable) per `add`, `subtract`, `multiply`, `min` o `max`; B fa l'offset, l'escala i la inversió; exemple `36-math`                                       |
| ~~Envelope follower~~          | El volum d'un senyal com a modulació                                      | S    | Fet com a **Envelope Follower**: en un worklet, el canal més fort suavitzat amb Attack i Release, i Gain fins a 4; amb un cable negatiu fa de sidechain; exemple `38-envelope-follower`              |
| ~~Probabilitat per pas~~       | Cada pas del Seq o del Drums sona amb una probabilitat                    | S    | Fet: fila **%** sota TIE al Seq, i clic dret en cada cop del Drums (100 → 75 → 50 → 25); `?NN` al text dels passos; una nota que no sona calla les seves lligadures; `25-drums` en fa servir |

### Connexió amb el món

| Idea                     | Què aporta                                                | Mida | Notes                                                               |
| ------------------------ | --------------------------------------------------------- | ---- | ------------------------------------------------------------------- |
| Entrada Web MIDI         | Un teclat de veritat, amb totes les octaves i velocity    | M    | Ja sortia a "Octaves des del teclat"; alimentaria el senyal `notes` |
| MIDI learn               | Moure els knobs amb un controlador                        | M    | Sobre el control de valor comú                                      |
| Clock MIDI               | Sincronitzar el Transport amb un altre aparell o programa | M    | Entrada o sortida                                                   |
| ~~Importar i exportar MIDI~~ | Passar el Clip o el Seq a un `.mid` i al revés            | M    | Fet per al Clip (al piano roll) i el Seq (sota la graella), amb la velocity; `src/patch/midi.ts` i `sequenceMidi.ts`, sense dependències |
| Compartir per URL        | Un patch dins d'un enllaç, sense passar fitxers           | S    | Comprimit al hash. Mesurat amb deflate + base64url: 0,4–2 KB els exemples habituals, 4 KB l'`34-acid-techno`. Les mostres no hi caben (megues): caldria deixar-les fora i avisar-ho, i avisar també si l'enllaç passa d'uns 4.000 caràcters, que alguns xats i correus tallen |

### Editor

| Idea                                  | Què aporta                                                                 | Mida | Notes                                                                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Copiar, enganxar i duplicar nodes~~ | Reaprofitar parts d'un patch, també entre subpatches                       | S–M  | Fet: Ctrl/⌘+C, V i D, amb els cables de dins de la selecció; cada enganxada va un pas més enllà, i un subpatch s'enganxa sencer. Falta retallar (Ctrl/⌘+X) i copiar entre pestanyes                                         |
| ~~Cercador de mòduls~~                | Afegir un mòdul escrivint-ne el nom                                        | S    | Fet: al menú del botó i al del clic dret, amb el focus en obrir; ordena per nom i després per descripció o grup, i Enter afegeix el primer. El menú s'ha compactat: un mòdul per línia, sis columnes i la descripció a baix |
| ~~Moure cables~~                      | Canviar on arriba o d'on surt un cable sense esborrar-lo                   | S    | Fet: arrossegant un extrem, amb la mateixa validació que en crear-lo; conserva l'atenuador, i el canal del Mixer mentre el final no es mou                                                                                  |
| ~~Mòduls clars al tema clar~~         | Que el tema clar no siguin peces fosques sobre blanc                       | M    | Fet: els colors del maquinari són variables (`--hw-*`, `--lcd-*`, `--led-*`): alumini i LCD reflectant en clar, com abans en fosc; els knobs (`--knob-*`), d'alumini en clar i de grafit en fosc                            |
| ~~Presets~~                           | Desar i carregar la configuració d'un node o un subpatch                   | M    | Fet: botó de presets a cada node (desar, carregar en un pas de desfer, esborrar), a IndexedDB; els subpatches desats surten a **My modules** del menú de mòduls; s'exporten i s'importen amb les seves mostres              |
| ~~Exemples dins l'app~~               | Obrir els exemples des d'un menú, sense carregar fitxers                   | S    | Fet: botó **Examples** a la barra, amb títol, descripció i si cal el teclat o el micròfon; `src/patch/exampleCatalog.ts`, amb els fitxers carregats a demanda |
| ~~Cara d'instrument per als subpatches~~ | Tocar una 808 o una 303 des de fora, com al ReBirth                        | M–L  | Fet: graelles, patrons i seccions publicats a la cara del subpatch; exemples `44-808` i `45-303` |
| Snapshots / macros                    | Desar l'estat de tots els knobs i passar d'un a l'altre, o fer-hi morphing | M    | Fet en part: les escenes guarden els knobs fixats, i el crossfader hi fa morphing. Falta la macro, un knob que en mou uns quants |

### Pendents d'altres seccions

- ~~Escenes: vegeu "Patrons i canvi quantitzat".~~ Fet: escenes amb patrons
  i knobs, i crossfader, al panell Perform.
- ~~Loop de gravació al Clip.~~ Fet: botó Rec al piano roll.
- ~~Velocity a les notes del Clip i al senyal `notes`.~~ Fet (exemple
  `35-velocity`).
- Notes des de l'Arp cap als subpatches polifònics.
- ~~Entrada de rellotge al Seq, l'Arp i el Drums, perquè un Clock en pugui
  marcar els passos.~~ Fet: entrada `clock` i Step `gate` (`GateSteps`); cada
  pas dura el que dura el seu `gate`, i `bar` fa com `end`; exemple
  `33-clock-input`.

### El que ha faltat en fer una peça de trance

La peça `10-trance-alba-a-montserrat.json`, d'`audiojac-peces`, és un trance en
La menor a 138 BPM: kick four-on-the-floor, baix rodant al contratemps amb
sidechain, pads de serres amb trance gate, un pluck amb eco, un lead, un
breakdown amb redoblament i pujada de soroll, i el drop. Es pot fer tot amb els
mòduls d'ara, però amb aquestes dreceres. **Estat:** totes resoltes; la versió
`10b-trance-alba-a-montserrat-vco.json` ja fa servir el VCO i el Ladder.

| Què ha faltat                         | Com s'ha resolt a la peça                                                                                    | Mida | Proposta                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Unison / supersaw~~ | Quatre serres desafinades per veu als pads (setze oscil·ladors amb quatre veus) i tres al lead | M | Fet amb el **VCO**: Voices i Spread en un sol mòdul |
| ~~Rampes a l'automatització de la cançó~~ | Un punt per pulsació a cada escombrat (el filtre del pluck, el del lead i la pujada de soroll): uns 230 punts | S–M | Fet: un punt escrit `pulsació~valor` hi arriba en rampa des de l'anterior (`"0:300 32~900"`); la cançó el mou cada 1/16 de pulsació, i el knob ho mostra. Els punts gravats amb Rec continuen sent salts |
| ~~Automatitzar un cable de modulació~~ | El trance gate és un camí repetit (Gain i eco) en un canal del Mixer propi, que s'obre al drop amb el nivell | S | Fet: la clau `"id-del-cable.amount"` per a qualsevol cable de control, també dins dels subpatches i en totes les veus; l'Amount del cable es grava amb Rec com un knob |
| ~~Redoblaments i retrigs per pas~~ | Un segon Drums, "Roll", a 1/32, que sona un sol compàs; i tres patrons del Beat per accelerar de negres a setzens | S–M | Fet: `x2`, `x3` i `x4` al text del ritme del Drums fan sonar el pas tantes vegades dins seu, cadascuna amb el Gate del seu tros; es combinen amb la probabilitat (`x3?50`). A la graella, Maj+clic en un pas que sona passa per 2, 3 i 4, i el pas es parteix en un segment per cada cop |
| ~~Aturar un node a la cançó~~ | Un patró D8 buit a cada node, que s'hi posa per fer-lo callar | S | Fet: un `.` a la fila fa callar el node des d'aquell compàs fins al patró següent; es tecleja a la cel·la, i en tornar a engegar el so el node torna a sonar |
| ~~Validar una peça sense obrir l'app~~ | Un test de vitest fora del repo: `parsePatch`, les files i les automatitzacions, i el motor amb el context fals | S | Fet: `npm run check-patch -- fitxer.json…` (`src/patch/check.ts`) diu què es perd en carregar-la (files, línies d'automatització, knobs fixats, escenes, params i camps desconeguts, l'enllaç) o per què no carrega; també avisa dels Gains que es poden invertir i dels retrigs i les probabilitats al ritme de l'Arp, que els ignora; els exemples passen sense avisos |

### Ordre suggerit

1. ~~**Reverb i Distorsió.**~~ Fet. Petits, i canvien molt el so.
2. **Web MIDI amb velocity.** Canvia com es toca, i la velocity serveix també
   per al Clip. Ajornat: ara no hi ha cap teclat MIDI a mà per provar-lo. Es
   podria fer amb un teclat virtual (IAC Driver a macOS) i e2e que simulin
   `navigator.requestMIDIAccess`.
3. ~~**Sample & Hold, Quantizer i Clock divider.**~~ Fet. El Clock divider és
   un mòdul **Clock**, que també fa de rellotge sol.
4. ~~**Copiar i enganxar nodes, i el cercador de mòduls.**~~ Fet.
5. ~~**Sampler i entrada d'àudio**, que porten l'àudio de fora al patch.~~ Fet.

## Ordre suggerit

Primer els controls, perquè totes les altres millores se'n beneficien; després
el teclat; i les peces grans (estèreo, polifonia) al final, perquè canvien
l'arquitectura. Els mòduls de so nous van després del dibuixador d'ona, perquè
comparteixen l'editor de corbes, i comencen pel més petit, que és el que posa
la base de l'`AudioWorklet`.

1. ~~**Un control de valor comú, amb knobs.**~~ Fet. Doble clic per escriure,
   arrossegar en vertical, rodeta, ajust fi i restablir, fet una sola vegada i
   fet servir pels knobs dels mòduls, l'atenuador dels cables i el tempo. Així
   les dreceres són les mateixes a tot arreu.
2. ~~**Octaves des del teclat** (Maj i Z / X).~~ Fet. Petit i molt útil per
   tocar.
3. ~~**Arp amb notes pròpies** (Source `notes`).~~ Fet. Reaprofita el format de
   text i la manera de desar del Seq.
4. ~~**Millores petites de Seq, Arp i Scope** de la taula anterior.~~ Fet,
   amb l'avís i el README de "Diverses fonts de notes". El Latch i el mode de
   trigger s'han descartat.
5. ~~**Gravar el que sona.**~~ Fet. Petit i independent, i permet compartir el
   que fas.
6. ~~**Ritme de l'Arp** (passos que sonen i que callen).~~ Fet. Reaprofita la
   graella i el format de text del Seq.
7. ~~**Mixer.**~~ Fet. Reaprofita el mecanisme d'un canal per cable del Scope.
8. ~~**Dibuixador d'ona, i CustomFilter amb el mateix editor de corbes.**~~
   Fet. El tipus de paràmetre `curve` és la "llista de valors": es desa com a
   text, i no s'escriu al fitxer mentre no s'ha tocat. L'oscil·lador guanya les
   ones `drawn` (la forma d'un cicle, 64 punts) i `harmonics` (16 barres), totes
   dues sobre una `PeriodicWave`. Els harmònics d'una `PeriodicWave` no es
   poden modular: per això hi ha el mòdul Harmonics, que ve just després i
   reaprofita l'editor en barres. L'accent i la lligadura del Seq s'expressen
   millor amb un text per pas, com el ritme, que no pas amb una corba.
9. ~~**`AudioWorklet` i els primers mòduls de so:** PhysicalModel per posar-ne
   la base, i després PitchShifter i SpectralFreeze.~~ Fet. Els worklets es
   carreguen en obrir l'app, i el càlcul de cada mòdul és una classe que es
   prova sense navegador. Cada mòdul té el seu exemple (`12` a `14`).
10. ~~**Patrons i canvi quantitzat** al Seq i a l'Arp.~~ Fet. Les escenes poden
    venir després.
11. ~~**Clip monofònic** per a seqüències llargues.~~ Fet, amb un format de
    text propi per a les notes (`nota@inici+durada`), no amb la "llista de
    valors" del pas 8.
12. **Gravar el que es toca i reproduir-ho**, amb el format de notes del clip.
    Aparcat: vegeu "Aparcat: loop o gravació de sessió".
13. ~~**Granulator**~~ Fet en directe, sense dependre de gravar: llegeix els grans
    dels últims segons del que li arriba. Carregar un fitxer d'àudio com a font
    queda per més endavant.
14. ~~**Estèreo, subpatches i polifonia**, en aquest ordre: la polifonia és molt
    més neta amb subpatches, i el pan del Mixer necessita l'estèreo.~~ Fet.
15. ~~**Clip amb acords**, un cop hi hagi polifonia.~~ Fet: la sortida `notes`
    del Clip, i l'exemple `23-chords`.
