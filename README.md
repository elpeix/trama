# Trama

Entorn modular d'àudio al navegador. Es construeix un patch connectant mòduls
(oscil·ladors, filtres, envolupants…) en un editor de nodes, i el so es genera
en temps real amb la Web Audio API.

Està inspirat en AudioMulch, Pure Data i Max/MSP.

## Posada en marxa

Desenvolupat amb Node 24.

```bash
npm install
npm run dev
```

Obre l'adreça que mostra Vite i prem el botó ▶ a la dreta de la barra de dalt (o
<kbd>Espai</kbd>); mentre sona es converteix en ■ per aturar-lo. El so no
comença fins que l'usuari l'engega, encara que el navegador permeti l'autoplay.

## Scripts

| Script               | Què fa                                     |
| -------------------- | ------------------------------------------ |
| `npm run dev`        | Servidor de desenvolupament                |
| `npm run build`      | Comprovació de tipus i build de producció  |
| `npm run preview`    | Serveix el build                           |
| `npm test`           | Tests unitaris i de components (Vitest)    |
| `npm run test:watch` | Vitest en mode watch                       |
| `npm run test:e2e`   | Tests end-to-end amb Chromium (Playwright) |
| `npm run lint`       | Oxlint                                     |

La primera vegada, els tests e2e necessiten el navegador:
`npx playwright install chromium`.

## Ús

### Mòduls

Els mòduls semblen panells de maquinari i segueixen el tema del sistema: amb el
tema clar són d'alumini, amb pantalles LCD reflectants de dígits foscos; amb el
fosc són gris fosc, amb pantalles de dígits verds que brillen. Els knobs hi fan
joc: d'alumini amb l'agulla fosca en el clar, de grafit amb l'agulla clara en el
fosc, i en tots dos el valor es mostra en un anell com les pantalles.

Els mòduls s'afegeixen des del botó **Add module**, que obre un menú amb els
mòduls agrupats per tipus (Sources, Processing, Modulation, Notes, Output,
Patch), un per línia. A baix hi ha la descripció del mòdul marcat o del que hi
ha sota el ratolí. A dalt hi ha un cercador, que ja té el focus en obrir el
menú: en escriure, el menú es redueix als mòduls que hi coincideixen, primer els
que tenen el nom que comença pel text, després els que tenen una paraula del nom
que hi comença, i després els que ho diuen a la descripció o al grup. No
distingeix majúscules ni accents, i cal que hi siguin totes les paraules. Les
fletxes mouen la marca, <kbd>Enter</kbd> afegeix el mòdul marcat (`rev`
<kbd>Enter</kbd> afegeix una Reverb), i <kbd>Esc</kbd> buida la cerca o, si ja
és buida, tanca el menú. El mòdul nou apareix a la part visible de l'editor.

Un clic dret al fons de l'editor obre el mateix menú, amb el cercador, on hi ha
el ratolí, i el
mòdul triat s'hi col·loca, amb la cantonada de dalt a l'esquerra a sota del
clic. Si no hi cap, el menú es desplaça perquè no surti de la finestra. Un clic
dret sobre un mòdul no l'obre.

| Mòdul             | Entrades                                     | Sortides                                                 | Paràmetres                                          |
| ----------------- | -------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Oscillator        | Freq, Detune (control)                       | àudio                                                    | Wave, Mode, Freq, Detune; Shape o Harmonics         |
| VCO               | sync (àudio), Freq, Detune, Width (control)  | àudio (estèreo)                                          | Wave, Mode, Freq, Detune, Width, Voices, Spread, Drift|
| Harmonics         | Freq, Detune, Bright, Even (control)         | àudio                                                    | Mode, Freq, Detune, Bright, Even, Harmonics         |
| Physical Model    | gate (trigger), Freq, Detune, Tone (control) | àudio                                                    | Mode, Freq, Detune, Decay, Tone                     |
| Piano             | notes, Bright, Pedal (control)                | àudio (estèreo)                                          | Bright, Decay, Unison, Hammer, Pedal, Body                  |
| Modal             | gate (trigger), Freq, Detune, Bright (control)| àudio                                                    | Model, Mode, Freq, Detune, Decay, Bright, Hit, Stretch|
| Wind              | notes, Breath, Detune, Bright (control)       | àudio                                                    | Exciter, Bore, Breath, Detune, Noise, Bright, Vibrato, Bell, Flare, Attack, Body |
| Strings           | notes, Bow, Pressure, Position, Detune, Bright (control) | àudio                                         | Play, Bow, Pressure, Position, Detune, Bright, Noise, Vibrato, Attack, Body |
| Noise             | —                                            | àudio                                                    | —                                                   |
| Audio Input       | —                                            | àudio                                                    | Gain                                                |
| Sampler           | gate (trigger), Select, Tune (control)       | àudio                                                    | Sample, Play, Order, Select, Tune, Start, End       |
| Filter            | àudio, Freq, Q (control)                     | àudio                                                    | Type, Freq, Q                                       |
| Ladder            | àudio, Freq, Res (control)                   | àudio (estèreo)                                          | Freq, Res, Drive                                    |
| Custom Filter     | àudio                                        | àudio                                                    | Response                                            |
| Pitch Shifter     | àudio, Shift (control)                       | àudio                                                    | Shift, Window, Mix                                  |
| Spectral Freeze   | àudio, gate (trigger)                        | àudio                                                    | Mix, Release                                        |
| Granulator        | àudio, Position, Pitch, Spread (control)     | àudio                                                    | Position, Size, Density, Pitch, Spread, Mix, Freeze |
| Gain              | àudio, Gain (control)                        | àudio                                                    | Gain                                                |
| Delay             | àudio                                        | àudio                                                    | Sync, Time, Feedback, Mix                           |
| Distortion        | àudio, Drive, Tone (control)                 | àudio                                                    | Mode, Drive, Shape, Tone, Mix                       |
| Reverb            | àudio, Tone (control)                        | àudio                                                    | Decay, Pre-delay, Tone, Mix                         |
| Compressor        | àudio                                        | àudio                                                    | Threshold, Ratio, Knee, Attack, Release, Makeup     |
| Chorus            | àudio                                        | àudio                                                    | Rate, Depth, Delay, Voices, Mix                     |
| Flanger           | àudio                                        | àudio                                                    | Rate, Depth, Delay, Feedback, Mix                   |
| Phaser            | àudio                                        | àudio                                                    | Rate, Depth, Freq, Stages, Feedback, Mix            |
| Mixer             | àudio, Level (control)                       | àudio                                                    | Level; nivell, pan, mute i solo per cable           |
| Pan               | àudio, Pan (control)                         | àudio                                                    | Pan                                                 |
| LFO               | —                                            | control                                                  | Wave, Sync, Rate                                    |
| ADSR              | gate (trigger)                               | control                                                  | A, D, S, R, Curve                                   |
| Sample & Hold     | in (control), gate (trigger)                 | control                                                  | Clock                                               |
| Quantizer         | in (control)                                 | control                                                  | Root, Scale                                         |
| Math              | a (control), B (control)                     | control                                                  | Op, B                                               |
| Slew              | in (control)                                 | control                                                  | Rise, Fall                                          |
| Envelope Follower | àudio                                        | control                                                  | Attack, Release, Gain                               |
| Clock             | gate (trigger)                               | bar, 1/2, 1/4, 1/8, 1/16, 1/32 (trigger)                 | Gate                                                |
| Keyboard          | —                                            | pitch i velocity (control), gate (trigger), `notes`      | Octave                                              |
| Arp               | clock (trigger)                              | pitch (control), gate (trigger)                          | Step, Pattern, Chord, Span, Gate, Octave            |
| Seq               | clock (trigger)                              | pitch i accent (control), gate (trigger), `notes`        | Step, Length, Gate, Octave, Root, Scale, Chord      |
| Clip              | —                                            | pitch i velocity (control), gate (trigger), `notes`      | Bars, Octave, Launch, Notes (al piano roll)         |
| Drums             | clock (trigger)                              | kick, snare, hat, open (trigger), accent                 | Step, Length, Gate; Kick, Snare, Hat, Open, Acc     |
| Output            | àudio                                        | —                                                        | Volume, Limiter                                     |
| Scope             | àudio, control                               | —                                                        | Time, Range                                         |
| Subpatch          | els seus In                                  | els seus Out                                             | Voices; els mòduls de dins                          |
| In                | — (dins d'un subpatch)                       | el seu senyal; amb notes: pitch, gate, velocity, notes   | Signal                                              |
| Out               | la del seu senyal                            | — (fora del subpatch)                                    | Signal                                              |

### Tempo

El tempo és del patch, no de cada mòdul: es guarda amb el patch i es pot desfer.
Es mostra a la barra de dalt, en una pantalla com la d'un sintetitzador (30–300
BPM), i es canvia:

- **arrossegant** la xifra amunt o avall, com un potenciòmetre (un arrossegament
  sencer és un sol pas de desfer);
- amb la **rodeta** del ratolí;
- amb les **fletxes** quan té el focus, de 10 en 10 amb <kbd>Maj</kbd> o amb Re
  Pàg / Av Pàg, i fins als extrems amb Inici / Fi;
- fent **doble clic** per escriure'l (<kbd>Enter</kbd> desa, <kbd>Esc</kbd>
  descarta);
- picant **Tap** unes quantes vegades al ritme que vols: fa la mitjana dels
  últims cops.

El llum de la pantalla parpelleja a cada temps mentre sona: verd als temps i
taronja al primer de cada compàs de 4.

Tots els Arp, Seq i Drums segueixen la mateixa graella de temps, i per això van
sincronitzats. Un canvi de tempo s'aplica a l'instant, sense perdre el lloc a la
graella.

Al costat hi ha el **Swing** (50–75 %), que es canvia igual que el tempo i també
es guarda amb el patch. Endarrereix els setzens que cauen entre dues corxeres: a
50 % la graella és recta, cap a 67 % sona com un tresillo, i a 75 % cada setzè
endarrerit arriba a mig camí del següent. El pas endarrerit s'escurça i
l'anterior s'allarga, de manera que el parell dura el mateix. Afecta els passos
de l'Arp, el Seq i el Drums a `1/16`; les corxeres i les negres no es mouen. Al
Clip, una nota que comença en un setzè endarrerit, o a menys d'1/32 de temps
d'ell, també arriba més tard, i una que hi acaba s'allarga fins allà; així un
acord rascat s'endarrereix sencer, i les notes de fora d'aquests passos no es
mouen.

Sota la paraula SWING es tria què endarrereix: `1/16`, els setzens, o `1/8`, les
corxeres que cauen entre dos temps, com el swing del jazz. Amb `1/8` són els
passos a `1/8` i les notes del Clip a les corxeres els que es mouen, i a 67 %
sonen com un tresillo de corxeres.

L'**LFO** també s'hi pot sincronitzar. Amb **Sync** a `free` va a la velocitat
de Rate. Amb una divisió (`4 bars`, `2 bars`, `1 bar`, `1/2`, `1/4`, `1/8`,
`1/16`), fa un cicle per divisió: a 120 BPM i `1/8`, 4 cicles per segon. Mentre
està sincronitzat, el slider de Rate queda desactivat i mostra la velocitat que
li toca. Cada cicle comença sobre la graella, de manera que un wobble a `1/8`
cau a temps amb els seqüenciadors. Quan canvies el tempo, la divisió o engegues
el so, l'LFO es torna a alinear a partir del següent inici de cicle.

El **Delay** també té **Sync**: amb una divisió (`1/16`, `1/8`, `3/16`, `1/4`,
`3/8`, `1/2`), l'eco es repeteix al cap d'aquella durada i segueix els canvis de
tempo. Les divisions de tres (`3/16`, `3/8`) són les de nota amb punt, el
clàssic eco a contratemps. Mentre està sincronitzat, el slider de Time queda
desactivat i mostra el temps que li toca.

Les notes es programen una mica per endavant sobre el rellotge d'àudio, de
manera que el ritme es manté encara que el navegador vagi carregat. Els fitxers
d'abans que el tempo fos del patch el tenien a cada Arp o Seq: en carregar-los,
el del primer passa a ser el del patch.

### Sample & Hold

Agafa el valor del senyal de control que li arriba a `in` en un instant i el
manté fins al següent: una modulació a graons. Sense cap cable a `in`, cada
vegada agafa un valor a l'atzar entre −1 i 1, el clàssic so "d'ordinador" quan
va al filtre.

- **Clock** diu quan agafa el valor: en cada pas de la graella (`1/4`, `1/8`,
  `1/16`, `1/32`), a temps amb els seqüenciadors i amb el swing, o amb `gate`,
  cada cop que s'obre el `gate` que li arriba (d'un Seq, un Drums o un
  Keyboard).
- El valor s'agafa a la mostra exacta del pas, al fil d'àudio.
- Amb un LFO lent a `in`, fa una escala que puja i baixa a graons.

### Quantizer

Arrodoneix un `pitch` a la nota més propera d'una escala. El `pitch` va com el
del Keyboard: 0 és Do4, i cada 1 és una octava (un semitò és 1/12). Arrodoneix
fins a cinc octaves amunt i avall de Do4.

- **Root** i **Scale** són les del Seq: la nota on comença l'escala i quines
  notes té.
- Amb un Sample & Hold al davant, un valor a l'atzar es converteix en una
  melodia que sempre és dins de l'escala. Amb un LFO, en una escala que puja i
  baixa. L'atenuador del cable que hi entra diu quantes octaves abasta.
- La sortida va al Detune d'un oscil·lador en mode `keyboard`, com el `pitch`
  d'un Keyboard.

### Math

Combina dos senyals de control, mostra a mostra: el que arriba a `a` i **B**, que
és el knob més els cables que arriben a `b`. Els cables que van al mateix port
se sumen, com a tot arreu; el Math serveix per fer-ne la resta.

- **Op** tria què en fa: `add` (a + B), `subtract` (a − B), `multiply` (a × B),
  `min` (el més baix dels dos) o `max` (el més alt). Per defecte és `add` amb B
  a 0: el senyal passa tal com arriba.
- Sense cable a `b`, el knob fa d'offset amb `add`, i amb `multiply` escala `a`
  o l'inverteix (B a −1).
- Amb `multiply`, un ADSR a `a` i un LFO a `b` fan una modulació que creix i
  s'apaga amb cada nota. Amb `max` i B a 0, només passa la meitat positiva
  d'un LFO.
- Sense cable a `a`, `a` val 0.

### Slew

Suavitza els salts d'un senyal de control: el segueix, però sense pujar ni
baixar més de pressa del que diuen **Rise** i **Fall**, el temps per moure's 1
amunt o avall. En un `pitch`, 1 és una octava: és un portamento per a qualsevol
font de notes, no només el Glide del Seq.

- Rise i Fall van per separat: amb Rise curt i Fall llarg, les notes pugen
  gairebé de cop i baixen lliscant.
- Amb el valor més petit (1 ms) el senyal passa gairebé tal com arriba.
- En engegar el so, comença al primer valor que li arriba, sense lliscar-hi.
- Darrere d'un Sample & Hold o d'un Seq, converteix els graons en rampes.

### Envelope Follower

Converteix el volum d'un so en un senyal de control: a cada mostra agafa el
canal més fort, sense signe, i el suavitza.

- **Attack** i **Release** diuen com de ràpid segueix el so quan puja i quan
  baixa: el temps per fer-ne gairebé dos terços del camí. Amb un Release curt
  segueix cada ona i tremola; amb un de llarg, dona la forma de les notes.
- **Gain** multiplica el nivell (fins a 4), per als sons fluixos: l'atenuador
  del cable no passa d'1.
- **Sidechain:** amb un cable negatiu cap al Gain d'un altre so, aquest s'abaixa
  cada cop que sona el primer, com el pad que "respira" amb el bombo. El Gain del
  node que s'abaixa marca el volum quan l'altre calla.
- També pot obrir un filtre amb la força amb què es toca, o fer que un LFO
  s'acceleri quan el so és fort.

### Clock

Obre un `gate` a cada divisió de la graella, amb una sortida per divisió:
`bar`, `1/2`, `1/4`, `1/8`, `1/16` i `1/32`. Van a temps amb els seqüenciadors
i amb el swing. **Gate** és quina part del pas es queda obert, del 5 al 95 %.
Serveix per disparar un ADSR, un Sample & Hold, un Physical Model o un Spectral
Freeze sense haver de fer servir un Seq o una fila del Drums.

Si li arriba un cable a l'entrada `gate`, deixa la graella i divideix els
`gate`s que li arriben: les sortides passen a ser `÷16`, `÷8`, `÷4`, `÷3`, `÷2`
i `÷1`, i el node ho mostra. Cada sortida deixa passar un de cada tants `gate`s,
començant pel primer, i el manté obert el mateix temps que l'original. Amb les
tecles, `÷2` sona una tecla sí i una no; amb un Clock a `1/16` al davant, `÷3`
fa una pulsació cada tres setzens, a contratemps de les corxeres. En treure el
cable, torna a la graella i torna a comptar des del principi.

### Arpegiador

L'**Arp** té les mateixes sortides que el Keyboard, i per tant es connecta
igual: `pitch` al Detune d'un oscil·lador en mode `keyboard` i `gate` a un ADSR.
En lloc de tocar la darrera tecla, toca les tecles que mantens premudes, una
darrere l'altra.

- **Step** (1/4, 1/8, 1/16, 1/32) marca cada quant sona una nota, segons el
  [tempo del patch](#tempo). A 120 BPM i 1/16, sonen 8 notes per segon. A
  `gate`, els passos els marquen els `gate`s que arriben a l'entrada `clock`
  (vegeu [Passos marcats per gates](#passos-marcats-per-gates)).
- **Pattern**: `up` (de greu a agut, sigui quin sigui l'ordre en què has premut
  les tecles), `down`, `up-down` (sense repetir els extrems) o `random` (sense
  repetir la mateixa nota dues vegades seguides).
- **Chord** construeix un acord sobre cada tecla premuda: `major`, `minor`, `7`,
  `maj7`, `m7` o `sus4`. Així, amb una sola tecla ja tens un arpegi sencer. Si
  en prems més d'una, se sumen els acords de totes, sense repetir les notes que
  comparteixen. Amb `off` només sonen les tecles.
- **Span** repeteix les notes 1, 2 o 3 octaves amunt. **Octave** ho desplaça
  tot, com al Keyboard.
- **Gate** és quina part de cada pas queda oberta la nota: 0,5 és staccato i 1
  lligat.
- **Start** decideix quan comença: amb `grid` espera el pas següent de la
  graella comuna, i amb `now` sona a l'instant, en prémer la tecla, i els passos
  següents segueixen aquell moment.
- El **ritme** és la fila de 16 passos sota els paràmetres: els encesos sonen i
  els apagats callen. Un pas que calla no perd la nota, que queda per al pas
  següent que sona. **Length** (1–16) és quants passos fa el bucle; els que
  queden fora surten apagats. Cada clic es desfà per separat, i arrossegant pots
  canviar-ne diversos d'un sol gest, com a la graella del Seq. Per defecte sonen
  tots.
- El **llapis** (✎), a baix a la dreta, obre el ritme com a text (`x - x x`;
  els passos que falten callen) i, amb Source a `notes`, també les notes que toca
  (`C4 E4 G4`, en minúscula o amb bemolls, sense l'Octave). **Apply** ho desa tot
  d'un sol cop de desfer.

Arpegia les tecles que mantens premudes **alhora**. Amb Chord a `off` i una sola
tecla només hi ha una nota, i amb Span > 1 sents aquella nota a diverses
octaves: posa-hi un acord a Chord, o prova <kbd>A</kbd> <kbd>D</kbd>
<kbd>G</kbd> (Do major) o <kbd>A</kbd> <kbd>E</kbd> <kbd>G</kbd> (Do menor). El
node mostra les notes que recorre, ja amb l'Span i l'Octave aplicats, i
il·lumina la que sona.

Comença en prémer la primera tecla i s'atura en deixar-les anar totes. Amb
**Start** a `grid` espera el següent pas de la graella comuna, perquè vagi a
temps amb els seqüenciadors: per això hi pot haver fins a un pas d'espera (125 ms
a 120 BPM i 1/16). Amb `now` sona de seguida, a canvi de no quedar alineat amb
la resta. Si
afegeixes o treus notes mentre sona, continua a partir de la darrera nota que ha
tocat. Els canvis de Step s'apliquen des del pas següent.

Si tens un Keyboard i un Arp al mateix patch, tots dos reben les tecles.

### Seqüenciador

El **Seq** té les mateixes sortides que el Keyboard i l'Arp, i es connecta
igual. Toca sol, en bucle, mentre el so està engegat: no li cal cap tecla.

- La **graella** té un pas per columna i una nota per fila. Clica una casella
  per posar-hi aquella nota; si el pas ja en tenia una altra, la substitueix.
  Torna-la a clicar per treure-la, i el pas queda en silenci. Cada clic es pot
  desfer per separat. La columna que sona s'il·lumina.
- **Arrossegant** per la graella omples diverses caselles d'un sol gest. El gest
  fa el mateix que hauria fet la casella on comença: si era buida, va posant
  notes; si ja tenia la nota, les va traient. Tot l'arrossegament es desfà d'un
  sol cop.
- **Step** funciona com a l'Arp. **Length** (1–16) és quants passos fa el bucle;
  els que queden fora surten apagats.
- **Gate** és quina part de cada pas queda oberta la nota. **Octave** desplaça
  tot el patró, i els noms de les files ja mostren les notes que sonen.
- **Root** i **Scale** decideixen quines notes té la graella, de manera que tot
  el que hi posis quedi dins l'escala. Les escales són `chromatic`, `major`,
  `minor`, `pentatonic major`, `pentatonic minor` (la del patró per defecte) i
  `blues`. La graella comença a la tònica i fa dues octaves (una sola amb la
  cromàtica, que té més notes); les files de la tònica surten en negreta.
  Canviar la **tònica transposa la melodia**: de Do a Re, totes les notes pugen
  un to. La melodia puja o baixa tants semitons com hi ha entre les dues
  tòniques. Si alguna nota quedés fora del rang de la graella, es mou una octava
  perquè no es perdi. Canviar l'**escala**, en canvi, no mou cap nota: si alguna
  queda fora de la nova escala, la seva fila es continua mostrant, amb el nom en
  vermell. Tots dos canvis es poden desfer d'un sol cop.
- Sota la graella, la fila **ACC** accentua la nota d'un pas, i la fila **TIE**
  lliga un pas a l'anterior: el gate no es torna a obrir, i el Gate s'aplica
  només a l'últim pas lligat. Un pas lligat sense nota **allarga** la nota
  d'abans, i així es fan notes de dos, tres o més passos. Un pas lligat amb una
  nota pròpia fa **legato**: l'altura llisca cap a la nota nova durant el
  **Glide** (0–500 ms; a 0 salta de cop), com l'slide d'un 303. Per fer-ho,
  marca TIE en un pas i posa-hi la nota a la graella; clicar la nota que ja
  sonava el torna a deixar com a simple allargament. Només es poden accentuar
  passos amb nota, i només es pot lligar un pas que vingui després d'una nota o
  d'una altra lligadura. A la graella, els allargaments es veuen com la
  continuació de la nota, les notes amb legato amb una vora clara, i els
  accentuats amb un contorn vermell.
- La fila **%**, sota TIE, és la **probabilitat** de cada nota: cada clic la
  baixa un quart (100 → 75 → 50 → 25) i de 25 torna a 100, i el pas s'omple
  tant com la probabilitat. Cada volta del bucle es tiren els daus de nou, així
  que el patró no es repeteix igual. Una nota que no sona deixa callades les
  lligadures que la segueixen. Només en tenen les notes que comencen, no els
  passos lligats.
- La sortida **notes** envia la nota de cada pas a un subpatch de diverses
  veus. Cada pas sona en una veu pròpia, i així la cua (release) d'una nota no
  es talla quan comença la següent. Una lligadura allarga la nota, i un legato
  la fa lliscar cap a la nota nova durant el Glide, a la mateixa veu i sense
  tornar a obrir el gate, com a `pitch`. Amb Chord, llisca l'acord sencer: cada
  nota cap a la mateixa de l'acord nou (la fonamental cap a la fonamental, la
  tercera cap a la tercera…).
- **Chord** afegeix a cada nota, per la sortida notes, les de l'acord de
  l'escala que hi cau: `5th` la quinta, `triad` la tercera i la quinta, i `7th`
  també la sèptima. Les notes es compten dins de Root i Scale, així que cada grau
  té el seu acord (en La menor, un La fa La-Do-Mi i un Re fa Re-Fa-La). Amb les
  pentatòniques surten acords oberts, i amb la cromàtica es fa servir l'escala
  major de la tònica. Una nota fora de l'escala pren l'acord de la nota de
  l'escala que té a sota. `pitch` i `gate` continuen amb la nota del pas sola.
  Chord forma part del patró.
- La sortida **accent** val 1 mentre sona una nota accentuada i 0 amb les
  altres. Connectada al Freq d'un filtre o al Gain, fa que les notes accentuades
  sonin més fortes o més obertes, com en un 303.
- Pel senyal `notes`, les notes dels passos accentuats van amb velocity 127 i
  les altres amb 100.
- **Export MIDI**, sota la graella, desa el patró en un `.mid` tal com sona: amb
  l'acord (Chord), l'octava, les lligadures i la durada de Gate, i els accents
  com a velocity 127. Una lligadura amb nota, on el Seq fa glide, hi va com una
  nota nova. **Import MIDI** posa les notes d'un `.mid` als passos: cada nota al
  pas més proper, les que en duren diversos amb lligadures, les tocades fort
  (velocity de 114 amunt) accentuades, i les de fora de rang mogudes per octaves.
  Un pas només té una nota: d'un acord es queda la més greu, perquè el Chord ja
  el torna a fer. Length s'ajusta al que ocupen les notes (o el fitxer), i es
  desfà d'un sol cop. L'export escriu totes les notes, sense tenir en compte la
  probabilitat.
- En engegar el so (▶), el bucle torna al primer pas. Un Seq afegit mentre sona
  entra al pas que toca, així que dos Seq amb la mateixa Length van sempre
  junts. Els canvis de la graella o del Step s'apliquen des del pas següent.

Al fitxer, el patró es guarda com un text llegible: un pas per paraula, amb el
nom de la nota o `-` per als silencis (`"C4 - D#4 - F4 …"`), `!` després d'una
nota accentuada, `_` per a una lligadura que allarga la nota d'abans i `_` davant
d'una nota per a un legato cap a ella (`"C4! _ _D#4 - G4"`), i `?` amb un
percentatge al final d'una nota que no sona sempre (`"C4!?50 D#4?25"`). Els noms
són els de la graella abans d'aplicar l'Octave.

El **llapis** (✎), sota la graella, obre aquest mateix text en una finestra per
escriure'l o enganxar-lo. S'hi poden posar les notes en minúscula i amb bemolls
(`eb4` es desa com `D#4`), i els passos que falten són silencis. Mentre s'escriu
diu què falla (una nota fora de rang, un pas que no ho és, massa passos), i
**Apply** o <kbd>Enter</kbd> ho desen d'un sol cop de desfer; <kbd>Esc</kbd> ho
deixa com era.

### Clip

Una frase de notes de qualsevol durada, en un bucle de 1 a 16 compassos
(**Bars**), amb les mateixes sortides que el Seq. Segueix la graella comuna, així
que sona a temps amb els Seq i els Arp. Per `pitch` i `gate` és monofònic: si
dues notes se solapen, la nova talla l'anterior, i de les que comencen alhora
sona la més aguda. Per la sortida **notes** les envia totes, i connectada a un
subpatch de diverses veus toca acords: n'hi ha prou d'apilar notes al piano roll.
Una nota només es talla si la mateixa nota torna a començar.

El node mostra les notes en petit, amb una línia vermella on és mentre sona. El
botó **Edit** (o doble clic a la miniatura) obre el **piano roll** a la part de
baix de la pantalla:

- **Arrossegar en un lloc buit** dibuixa una nota tan llarga com l'arrossegament.
  Un **clic** en dibuixa una tan llarga com l'última nota que has tocat.
- **Arrossegar una nota** la mou en el temps i en l'altura.
- **Arrossegar la vora dreta** d'una nota en canvia la durada.
- **Clic dret** o **doble clic** en una nota l'esborra. Arrossegar amb el botó
  dret esborra totes les notes per on passa.
- **Snap** tria la graella on cauen les notes: de negra a fusa, tresets de
  corxera (1/8T) i de semicorxera (1/16T), o **Off** per posar-les lliures.
- **Scale** i la tònica il·luminen les notes d'una escala: les de fora queden
  fosques i la tònica, remarcada. Només és una guia: no mou cap nota.
- **Quantize** porta l'inici de les notes seleccionades (o de totes, si no n'hi
  ha cap de seleccionada) al pas més proper de la graella, sense canviar-ne la
  durada.
- **×2** duplica el bucle: dobla Bars i hi copia les notes. Les notes que eren
  més enllà de Bars es perden. No es pot passar de 16 compassos.
- **Clear** esborra totes les notes del patró.
- **La franja de velocity**, a sota del roll, té una barra per nota: com més
  alta, més fort sona. Arrossegar-la amunt o avall en canvia la velocity. Les
  notes que comencen alhora es mouen juntes, i si la nota és seleccionada, es
  mouen totes les seleccionades, cadascuna des de la seva. Les notes més fluixes
  es dibuixen més pàl·lides, i les noves prenen la velocity de l'última nota que
  has tocat. Al fitxer, la velocity va després de la nota amb una `v`
  (`C4@0+1v90`) quan no és 100. Export i Import MIDI la conserven.
- **Hear** (encès per defecte) fa sonar el Clip mentre edites: la nota que
  dibuixes, la que agafes i cada altura per on la mous, i la que transposes amb
  les fletxes, un moment. **Clicar una tecla** de l'esquerra la fa sonar mentre
  la tens premuda, i si llisques amb el botó premut, sonen les tecles per on
  passes. Sona per les sortides del Clip (pitch, gate i notes), així que se
  sent amb el so del patch, i cal que l'àudio estigui engegat.
- **Rec** grava el que toques amb el teclat de l'ordinador mentre el clip
  sona: cada nota queda on era el bucle quan l'has premuda, i tan llarga com
  l'has tinguda premuda, tal com l'has tocada (després es pot passar Quantize).
  S'afegeix a les notes que ja hi ha, volta rere volta. Amb Hear encès, el que
  toques sona per les sortides del Clip. Només es pot engegar amb l'àudio en
  marxa, i grava al patró que edites.
- **Export MIDI** desa les notes del patró (les que sonen, dins de Bars) en un
  fitxer `.mid` amb el tempo del patch, que qualsevol DAW pot obrir. **Import
  MIDI** posa les notes d'un `.mid` al patró, en lloc de les que hi havia, i
  ajusta Bars al que ocupen (o al que dura el fitxer, si acaba en silenci). Llegeix totes les pistes i canals, deixa fora les
  notes de fora de C1–C7 o més enllà de 16 compassos (i ho diu), i no canvia el
  tempo del patch. Es desfà d'un sol cop.
- **Seleccionar:** un clic selecciona una nota (i la que dibuixes queda
  seleccionada). **Shift+clic** n'afegeix o en treu una, i **Shift+arrossegar**
  en un lloc buit selecciona les notes d'un rectangle. Les notes seleccionades
  es mouen i s'allarguen juntes, i **Alt+arrossegar** en mou una còpia.
- **Amb el teclat**, després d'haver clicat al piano roll: **Supr** o
  **Retrocés** esborra la selecció, les **fletxes** la mouen un pas de la
  graella o un semitò (amb **Shift**, un compàs o una octava) i **Esc** la
  deixa anar. Amb **Ctrl** (o **Cmd**): **A** ho selecciona tot, **C** copia,
  **X** retalla, **V** enganxa on és el ratolí (o al principi) i **D** duplica
  la selecció just després d'ella. Les notes que caurien més enllà de Bars no
  s'enganxen.
- **Zoom:** **Ctrl** (o **Cmd**) i la roda del ratolí, o pessigar al trackpad,
  amplien o redueixen el temps, i **Alt** i la roda fan les files més altes o
  més baixes; el que hi ha sota el ratolí es queda on és. Els botons **−** i
  **+** de la barra fan zoom en el temps pel mig, i **Fit** mostra el clip
  sencer. L'alçada de les files es recorda mentre la pàgina és oberta.
- **La vora de dalt** del piano roll s'arrossega per fer-lo més alt o més baix
  (o, amb el focus, amb les fletxes amunt i avall).

A dalt hi ha el número de cada compàs. Cada gest es desfà d'un sol cop. Les
notes van de C1 a C7, i les que queden més enllà de Bars es veuen apagades i no
sonen, però no es perden. Al fitxer es
desen com a text, com els passos del Seq: `"C4@0+1 E4@1+0.5"` (nota, inici i
durada en pulsacions).

Té els mateixos [patrons](#patrons) que el Seq: cadascun amb la seva durada
(Bars) i les seves notes. El piano roll edita el patró que tens triat al node, i
el diu a la barra de dalt ("Pattern A2"); si en tries un altre amb el piano roll
obert, passa a aquell. Un Clip amb el patró A1 buit calla fins que en llances un
altre.

### Drums

Una fila de passos per a cada peça d'una bateria: **Kick**, **Snare**, **Hat** i
**Open** (el charles obert). Cada fila té la seva sortida de gate, que es
connecta a la peça que ha de sonar, i la fila **Acc** posa la sortida `accent` a
1 durant els passos accentuats. Els noms són orientatius: cada gate pot disparar
qualsevol cosa.

- Un **clic** en un pas el fa sonar o callar, i **arrossegant** per una fila
  se'n canvien diversos d'un sol gest, com a la fila de ritme de l'Arp.
- Un **clic dret** en un pas que sona en baixa la **probabilitat** un quart
  (100 → 75 → 50 → 25, i de 25 torna a 100), i el pas s'omple tant com la
  probabilitat. Cada fila tira els seus daus a cada volta: el bombo pot ser fix
  i el hat, només de tant en tant. A la fila Acc, l'accent també pot caure o
  no. Al fitxer s'escriu `x?25`.
- <kbd>Maj</kbd>+**clic** en un pas que sona el fa sonar dues, tres o quatre
  vegades dins seu, per als redoblaments, i a la quarta torna a un sol cop; el
  pas es parteix en un segment per cada cop. Al fitxer s'escriu `x2`, `x3` o `x4`, i es combina
  amb la probabilitat (`x3?50`). Amb Step a `gate`, sona un sol cop.
- **Step**, **Length** i **Gate** funcionen com al Seq. Un Drums segueix la
  graella comuna, així que va a temps amb els Seq, els Arp i els Clip.
- Té els mateixos patrons que el Seq (vegeu "Patrons"). Cada patró guarda les
  files i la Length.
- El **llapis** (✎), sota les files, obre totes les files com a text, una sota l'altra i amb els passos
  alineats en columnes (`x - x?50 x3`; una `X` també val i els passos que falten
  són silencis). **Apply** desa les files canviades d'un sol cop de desfer.

Les peces es fan amb els altres mòduls: l'exemple `34-acid-techno` en té quatre, cada
una en un subpatch amb un In de gate. L'ADSR amb Curve `exp` els dona una
caiguda natural. L'accent va al Level del Mixer, com l'accent general d'una 808.

### Passos marcats per gates

El Seq, l'Arp i el Drums tenen una entrada `clock`. Amb **Step** a `gate`,
deixen la graella i avancen un pas a cada `gate` que hi arriba: d'un Clock,
d'una fila del Drums, d'un altre Seq o de les tecles. Amb un Clock que divideix
per tres les notes d'un Seq, un segon Seq avança a un altre ritme i fa
polirítmies. Amb qualsevol altre Step, l'entrada no fa res.

- Cada pas dura el que dura el `gate` que el marca: el knob **Gate** s'amaga,
  perquè no hi compta, i el swing és el del rellotge que hi arriba. Al Seq, un pas lligat al
  següent manté la nota fins que es tanca el `gate` de l'últim pas lligat.
- Els passos compten des del primer `gate` després d'engegar el so; a l'Arp amb
  tecles, des de la primera tecla premuda.
- Sense `gate`s, no sona res i la graella no marca cap pas.
- Com que no hi ha compàs, un patró llançat amb `bar` entra quan el que sona
  torna a començar, com amb `end`.
- En canviar Step, la nota que sonava per un `gate` s'acaba.

### Patrons

El Seq, l'Arp, el Clip i el Drums tenen 32 patrons, en quatre bancs, **A**,
**B**, **C** i **D**, de vuit patrons cadascun, de l'**A1** al **D8**, com les
màquines del ReBirth. Al node, una fila de botons tria el banc, i una altra, a
sota, té els vuit patrons del banc. Un patró és la melodia i el ritme: al Seq,
els passos, Length, Root, Scale i Chord; a l'Arp, les notes, el ritme, Length,
Pattern i Chord; al Clip, les notes i Bars; al Drums, les files i Length. La
resta (Step, Gate, Octave…) és del node i no canvia amb el patró.

- **Clic** en un banc en mostra els vuit patrons i passa a editar el del mateix
  número en aquell banc (de l'A3 al C3, per exemple).
- **Clic** en un patró el mostra i s'hi edita, mentre el que sona continua
  sonant. El botó del patró que edites té la vora encesa.
- **Doble clic** el llança. El patró que sona s'il·lumina, i el llançat
  parpelleja fins que entra; els seus bancs fan el mateix, perquè es vegi
  encara que siguin d'un altre banc.
- **Launch**, al costat dels botons, tria quan entra: `bar`, a la primera
  pulsació del compàs següent (compassos de 4 pulsacions des que s'engega el
  so); `end`, quan el patró que sona torna a començar; o `now`, al pas següent,
  continuant pel mateix lloc de la graella.

Editar un patró es desfà com qualsevol altre canvi; llançar-ne un no entra a
l'historial. En començar a sonar, sempre sona l'A1. Els altres patrons d'un node
nou, o d'un patch antic, són còpies de l'A1, i al fitxer només s'escriuen els que
en són diferents. Els fitxers d'abans dels bancs, amb quatre patrons A, B, C i D,
es carreguen com l'A1, l'A2, l'A3 i l'A4, també a la cançó.

### Cançó

El botó **Composer** de la capçalera obre i tanca, a sota, el panell amb dues
pestanyes: **Song**, la cançó, i [Perform](#perform). La cançó encadena els
patrons de cada node compàs a compàs, i hi grava els moviments dels knobs, com
el mode cançó del ReBirth. Té una fila per a cada node amb patrons, també els de
dins dels subpatches ("Bass › Clip"), i una columna per a cada compàs.

- **Pattern** i **Song**, després de **Source** a la capçalera, al costat del
  Play, trien què sona, amb el panell obert o tancat. En mode Song, el Play
  toca la cançó des del **cursor**, que es mou amb els números dels
  compassos o amb les fletxes del panell; en mode Pattern, tot sona com si no
  hi hagués cançó. **Bars** en diu la llargada, i en acabar l'últim compàs el
  so s'atura.
- **Cel·les**: un clic en un guió hi posa l'A1, i en un patró passa al següent
  del banc, fins a un guió després del vuitè; un clic dret hi deixa un guió. Amb
  una cel·la triada, una lletra de l'A a la D en canvia el banc i un número de
  l'1 al 8 el patró, el punt fa callar el node fins al patró següent, el guió,
  <kbd>Supr</kbd> o <kbd>Retrocés</kbd> la buiden, i les fletxes van a les altres
  cel·les. Un guió continua amb el que sona, que es veu apagat; si hi escrius,
  parteix d'aquest patró. Mentre un node calla, els llançadors no n'encenen cap
  patró. En tornar a engegar el so, els nodes que la cançó ha fet callar tornen
  a sonar.
- Abans de cada compàs, la cançó llança els patrons del compàs següent per a la
  seva primera pulsació, sigui quin sigui el Launch del node. Un patró que ja
  sona no torna a començar, així que un Clip de quatre compassos no es talla si
  la lletra es repeteix. Un patró llançat a mà mana fins que la cançó torna a
  tenir-ne un per a aquell node.
- **Loop** repeteix un tros de la cançó (**From** i **Length**). A cada volta, i
  en començar des de qualsevol compàs, sona el que la cançó hi tindria, com si
  hagués sonat fins allà.
- **Fade** fa baixar el volum de totes les sortides durant els últims compassos
  que diu, fins al silenci just quan la cançó s'acaba; també a la gravació. Amb
  el loop activat la cançó no s'acaba, i no hi ha fade. Si s'atura abans, el
  volum torna a ser el de sempre.
- El menú **⋯** té les accions de tant en tant. **From patterns** torna a
  començar la cançó amb el patró que toca cada node al primer compàs.
- **Rec** escriu a la cançó:
  - Els **patrons** llançats amb doble clic: al compàs del cursor amb el so
    aturat, o al compàs següent mentre sona.
  - Els **knobs**, en mode Song: mentre sona, arrossegar un knob en grava el
    moviment i, en deixar-lo anar, substitueix el que hi havia en aquell tros;
    els altres controls continuen sonant com estaven gravats. Amb el so aturat,
    un canvi en posa el valor a l'inici del compàs del cursor. Es graven tots
    els knobs dels nodes, fora dels que formen part d'un patró (Length, Root…),
    del Mixer el nivell, el pan, el mute i el solo de cada canal, i l'Amount
    dels cables de control (el d'un LFO a un Gain, per exemple). Les tecles i
    la roda, mentre sona, canvien el patch i no la cançó.
- Mentre la cançó sona, els knobs gravats mostren el valor de la cançó; en
  aturar-la, tornen al del patch, que no ha canviat. Cada control gravat té una
  fila a sota dels patrons, amb una creu per treure'l de la cançó. Cada cel·la
  mostra el valor que té al primer temps del compàs (o on el compàs el posa per
  primer cop), apagat si ve d'abans, i una línia ambre als compassos on es mou;
  abans del primer punt és buida i sona el valor del patch. Una cel·la s'edita
  com les pantalles: arrossegar, la roda, les fletxes amunt i avall, o doble
  clic per escriure-hi; el valor va al primer temps del compàs i es manté fins
  al punt següent. El clic dret, <kbd>Supr</kbd> o <kbd>Retrocés</kbd> esborren
  els punts del compàs, i les fletxes esquerra i dreta van a les cel·les del
  costat. **+ Control** afegeix a la cançó qualsevol control del patch que s'hi
  pugui gravar, amb un cercador, en el valor que té al patch. **Copy to loop** i
  **Copy to song**, al menú **⋯**, posen els controls tocats amb Rec en el seu
  últim valor per tot el loop o tota la cançó.

Editar la cançó es desfà com qualsevol altre canvi. Al fitxer va a `song`, amb
una fila de text per a cada node, pel seu camí dins dels subpatches
(`"sub-2/seq-1": "A1 A1 B3 - C8"`), el loop si n'hi ha, i una línia per a cada
control, amb la pulsació des de l'inici de la cançó i el valor de cada punt
(`"sub-2/filter-3.frequency": "0:440 1.25:880"`). L'exemple `43-song` és una
cançó sencera.

### Perform

La pestanya **Perform** del panell que obre **Composer** és per tocar sense anar
pel patch: hi tens els knobs que fas servir, els patrons de cada node, les
escenes i un crossfader, tot junt. El botó de pantalla completa la posa en el
lloc de l'editor, que no es munta mentre dura; es surt amb el mateix botó, amb
<kbd>Esc</kbd> o tancant el panell.

- **Knobs fixats**: un clic dret en un knob d'un node, o en un canal d'un Mixer,
  i **Pin to Perform** el porta al panell; **Unpin from Perform**, o la creu del
  panell, el treu. Cada knob és el paràmetre del seu node, també de dins dels
  subpatches: es mou, es grava a la cançó i es desfà com allà. Mostra el node a
  sobre i el nom a sota; un doble clic al nom el canvia només al panell. Es
  reordenen arrossegant-los per la nansa <kbd>⠿</kbd>, o amb les fletxes.
- Un **Mixer** fixat surt sencer, com una taula: una columna per canal, amb el
  level, el pan, el mute (M) i el solo (S), i el level general a la columna
  **Main**.
- **Llançador**: una fila per a cada node amb patrons, també els de dins dels
  subpatches. Els botons A a D trien quin banc es veu, i un clic en un dels vuit
  patrons el llança quan diu el Launch del node; el que sona s'encén i el que
  espera parpelleja. Amb **Rec** s'escriu a la cançó com un doble clic al node.
  La creu amaga la fila, i el grup **Hidden** les torna a mostrar.
- **Escenes**: **Save scene** desa el patró que toca cada node, o el que està a
  punt de tocar, i el valor dels knobs fixats (level i pan dels Mixer inclosos).
  Un clic llança tots els patrons de l'escena junts al compàs següent; l'escena
  que sona s'encén i la que espera parpelleja. Un doble clic la reanomena, i la
  creu l'esborra.
- **Crossfader**, sota les escenes quan n'hi ha: es tria una escena per a cada
  costat (A i B) i el fader va d'una a l'altra, com a l'Octatrack. Mou cada knob
  que guarden les escenes, seguint el gir del knob (una Freq passa per l'escala
  logarítmica); si només una de les dues el guarda, o un costat no té escena,
  aquell costat és el valor del patch. No toca el patch: els knobs mostren el
  valor que sona, i treient l'escena dels dos costats tot torna al patch.
  **Apply** escriu al patch el que sona, en un sol pas de desfer. Si gires a mà
  un knob que mou, mana la mà fins que el fader es torna a moure. Amb **Rec** i
  la cançó sonant, arrossegar el fader grava una línia de la cançó per a cada
  knob que mou. Llançar una escena amb un clic no en canvia els knobs: només ho
  fa el crossfader.

Al fitxer, els knobs fixats van a `perform`, les files amagades a
`hiddenLaunchers` i les escenes a `scenes`, cadascuna amb els seus patrons i, si
en té, els seus knobs (`"knobs": { "filter-1.frequency": 300 }`). La posició del
crossfader i les escenes triades no es desen.

### Subpatches

Un **Subpatch** agrupa mòduls en un node, com un `[pd]` de Pure Data: per
endreçar un patch gran, o per tancar una veu sencera (oscil·lador, filtre, ADSR i
VCA) en una sola caixa.

- **Open** hi entra: el llenç passa a mostrar el que hi ha a dins, i a dalt hi
  apareix el camí ("Patch › Voice"). Clicant-ne un tros es torna a aquell nivell.
  Els subpatches es poden posar uns dins dels altres.
- A dins, els mòduls **In** i **Out** són els ports del subpatch: cada In és una
  entrada del node de fora, i cada Out una sortida. **Signal** tria què hi passa
  (àudio, control o trigger), i el nom del mòdul és el nom del port. Els ports
  surten a fora en l'ordre en què són a dins, de dalt a baix. In i Out només
  surten al menú dins d'un subpatch.
- Un In de **control** té un knob **Value** (−1 a 1) que se suma al que li
  arriba pel cable, com el knob d'un paràmetre se suma a la seva modulació. A
  fora, el subpatch el mostra com un paràmetre més: el nom de l'In, el knob i el
  connector per modular-lo. Els dos knobs, el de fora i el de dins, són el mateix
  valor.
- Un In de **notes** fa de teclat de la veu: a fora rep les notes d'un
  Keyboard, un Clip o un Seq (la sortida `notes`), i a dins les treu com un
  `pitch`, un `gate` i una `velocity`, i també com a `notes`, per als mòduls
  que es toquen amb notes, com el Strings o el Wind: així un subpatch de tres
  veus amb un Strings toca acords de tres notes. Amb una sola veu les passa
  totes tal com arriben, i el mòdul lliga les notes com ho faria a fora.
- La **velocity** és la força amb què es toca cada nota, d'1 a 127 com al MIDI,
  i la sortida `velocity` la dona de 0 a 1. Connectada al Gain d'un Gain a 0
  (després del VCA de l'envelope), fa que les notes fluixes sonin fluixes; al
  Freq d'un filtre, que les fortes sonin més brillants. Les notes del teclat de
  l'ordinador són a 100, les dels passos accentuats del Seq a 127 i les altres
  a 100, i les del Clip, les que tingui cada nota. L'exemple `35-velocity` ho
  fa servir.
- **Voices** (1–8) fa el subpatch polifònic: el motor en munta una còpia per
  veu, i cada nota que arriba per un In de notes sona en una veu lliure, la que
  fa més estona que ha callat. Si no n'hi ha cap, pren la de la nota més antiga.
  Una veu encara sona mentre dura el release de l'ADSR més llarg de dins: si una
  nota nova n'agafa una que encara sona, els Out de so d'aquella veu s'apaguen
  en 5 ms i la nota comença just després, en lloc que la cua salti de nota. Si
  les notes, amb el release, han demanat més veus de les que té, el node ho diu
  ("Its notes needed 6 voices at once"). La resta d'Ins arriben a totes les
  veus, i les sortides de totes se sumen. Els knobs de dins són els de totes les
  veus alhora, i els mesuradors i el Scope de dins mostren la primera. Amb una
  sola veu, un In de notes toca l'última nota.
- **Publicar un paràmetre** el porta a la cara del subpatch. A dins, cada knob i
  cada selector tenen un llum petit a la dreta, que surt en passar-hi el ratolí:
  un clic el publica i queda encès, un altre el retira. A fora, el paràmetre és
  un control més del subpatch, amb el rang, les unitats i el valor per defecte
  de dins, i el mateix valor. Es diu com el node i el paràmetre ("ADSR R"), i
  amb doble clic al nom se li'n posa un altre; per tornar-lo al valor per
  defecte, doble clic al nom del de dins. Si és modulable, porta el seu
  connector, i el cable va directe al paràmetre de dins, a totes les veus. Així
  una peça de bateria pot tenir Tune, Tone i Decay, com les d'una 808.
- Si un In o un Out desapareix, o en canvia el senyal, els cables de fora que hi
  anaven es treuen sols.
- **Group** (el botó que surt a dalt a la dreta quan hi ha mòduls seleccionats,
  o Ctrl/⌘+G) tanca la selecció en un subpatch nou. Per seleccionar-ne diversos,
  clica'ls amb ⌘ o Ctrl premut, o arrossega un rectangle amb Maj. Els cables entre els mòduls
  seleccionats queden a dins; cada font de fora que hi arriba té el seu In, i
  cada port que en surt el seu Out, amb el nom del port. Els atenuadors i els
  canals del Mixer es queden al cable que arriba al seu destí, així que el patch
  sona igual. Es desfà d'un sol cop. No agrupa si un camí de fora portaria de la
  selecció a ella mateixa, perquè faria un bucle, ni si un cable de notes
  creuaria la vora, perquè un In de notes no les passa a un altre subpatch.
- Desfer funciona igual a dins i a fora; entrar i sortir no són passos de desfer.

### Noms

Fes doble clic al títol d'un node per posar-li nom ("Vent", "VCA"…).
<kbd>Enter</kbd> o clicar fora el desa, i <kbd>Esc</kbd> el descarta. El tipus
de mòdul continua sortint al costat en petit. Si deixes el nom buit, el node
torna a mostrar només el tipus. Canviar el nom es pot desfer i es guarda amb el
patch.

### Presets

El botó de presets de la capçalera d'un node (tres ratlles, al costat de la
creu) obre els presets d'aquell tipus de mòdul. A dalt, separats, hi ha els que
vénen amb Trama, si el mòdul en té (`src/patch/factoryPresets.ts`): es carreguen
amb un clic, però no es poden esborrar ni substituir, i no surten a l'**Export
all**. A sota, els desats per tu:

- **Desar**: escriu un nom (surt el del node, si en té) i prem **Save** o
  <kbd>Enter</kbd>. Amb el nom d'un preset que ve amb Trama, se'n desa un de
  teu i el de Trama queda com era. Es desa la configuració del node: els paràmetres, els
  patrons que no són l'A1 del Seq, l'Arp, el Clip o el Drums, i, en un
  subpatch, tot el que té a dins i els paràmetres publicats. No es desen ni el
  nom ni la posició. Amb un
  nom que ja existeix per a aquell mòdul, el botó diu **Replace** i el
  substitueix.
- **Carregar**: clic al nom d'un preset. El node en pren la configuració, i es
  desfà en un sol pas. Un subpatch en pren també tot el de dins; els cables de
  fora que anaven a ports que ja no té es treuen.
- **Esborrar**: la creu del costat del preset.

Els subpatches desats surten també al menú de mòduls, al grup **My modules**, i
el cercador els troba pel nom. Afegir-ne un en posa una còpia amb el nom del
preset: una bateria o una veu que has fet es pot reaprofitar a qualsevol patch.
Cada còpia és independent, com els altres subpatches.

Els presets es desen al navegador (IndexedDB), al costat de les mostres del
Sampler, i els veuen totes les pestanyes. Un preset d'un Sampler guarda quina
mostra toca, que ja és al navegador. Els In i els Out no tenen presets.

Per passar-los a un altre navegador o compartir-los, al peu del menú de presets
de qualsevol node:

- **Export all** baixa `trama-presets.json` amb tots els presets, de tots els
  mòduls, i les mostres que toquen els Samplers que hi ha, com el fitxer d'un
  patch.
- **Import** n'afegeix els d'un fitxer, i diu quants. Un preset del mateix mòdul
  i amb el mateix nom que un que ja tens el substitueix. Un fitxer amb errors no
  n'importa cap, i diu quin preset falla.

Si carregues un fitxer de presets amb el **Load** del patch, t'avisa que s'ha
d'importar des del menú de presets, i el patch no es toca.

### Scope

Mostra els senyals que li arriben. Té una entrada d'àudio i una de control, i a
cada una hi pots connectar tants cables com vulguis. **Cada cable és un traç
separat**, amb el seu color. Els senyals no se sumen: si vols veure'n la suma,
barreja'ls abans amb un Gain i connecta aquell Gain al Scope.

**Time** és l'amplada de la finestra, de 5 ms a 5 s, i **Range** és l'amplitud
que ocupa l'alçada sencera. Tots dos són comuns a tots els traços, perquè es
puguin comparar. Als costats del dibuix hi ha el valor de Range (`+0.09` /
`−0.09`).

Sota el dibuix hi ha una llegenda amb una línia per cable: el color, el nom del
node d'on ve (o el tipus i el número, si no té nom) i el pic del senyal. Si el
pic no hi cap, surt en vermell i cal pujar el Range. El color diu quina mena de
senyal és —blaus per als cables d'àudio, taronges per als de control— i el to
distingeix els cables d'una mateixa mena.

- El dibuix comença en un pas ascendent pel mig del traç de referència, i tots
  els traços es dibuixen a partir del mateix instant, de manera que l'ona es
  queda quieta. El mig és el punt entre els dos pics del senyal, no el zero: així
  també queden quietes les envolupants i els controls que no passen mai per sota
  de zero. El pas només compta si abans el senyal ha baixat prou per sota d'aquell
  punt (histèresi), de manera que els harmònics o les petites oscil·lacions no
  fan saltar el dibuix.
- Per defecte la referència és el primer cable; clica un altre traç a la llegenda
  per canviar-la. La tria es desa amb el patch.
- Per enganxar-s'hi, el Scope necessita tenir gravada la finestra sencera i un
  tros igual de llarg per buscar-hi el pas: amb un Time llarg, el dibuix va
  corrent el doble de Time des que comença a sonar, i després es queda quiet.
- Amb el so aturat, el dibuix es congela.
- Quan un senyal és diferent a l'esquerra i a la dreta (un pan, un Chorus, la
  Reverb), el dibuix es parteix en dues pistes: **L** a dalt i **R** a baix, cada
  una amb el seu zero i el Range sencer, que porta escrit (`L ±1.00`). Un senyal
  mono es veu en una sola pista, a tota l'alçada.
  Les dues pistes es mantenen un segon després de l'última diferència, perquè el
  dibuix no salti.

Un Scope no cal que vagi connectat a l'Output.

### Ones dibuixades

A més de les quatre ones clàssiques, el **Wave** de l'Oscillator té dues ones
que es dibuixen al mateix node:

- **drawn**: es dibuixa la forma d'un cicle de l'ona, de −1 a 1, arrossegant
  per la corba (**Shape**). Per defecte és un sinus.
- **harmonics**: es dibuixa el nivell de cadascun dels 16 primers harmònics, en
  barres (**Harmonics**). Per defecte és una dent de serra.

Un moviment ràpid omple els punts que salta amb una línia recta, i tot
l'arrossegament es desfà d'un sol cop. Doble clic al nom de la corba la torna al
valor per defecte. Totes dues ones es normalitzen, així que dibuixar-les més
petites no baixa el volum: per això hi ha el Gain.

Les ones dibuixades no es poden modular: canviar-les vol dir substituir l'ona
sencera. La freqüència i el detune sí, com amb les altres ones.

### VCO

Un oscil·lador a la manera dels analògics, calculat mostra a mostra: les ones no
fan aliasing (polyBLEP), i té el que l'Oscillator no pot fer.

- **Wave**: serra, quadrada, triangular o sinus. **Mode**, **Freq** i **Detune**
  funcionen com a l'Oscillator: amb `keyboard`, el `pitch` connectat al Detune
  tria la nota.
- **Width**: quant de cada cicle la quadrada està a dalt, del 5 al 95 %. Amb un
  LFO connectat, és el PWM de les cordes d'un Juno. Només canvia la quadrada.
- **Voices** (1 a 7) i **Spread** (en cents): diverses veus alhora,
  desafinades entre elles i repartides d'esquerra a dreta. Amb set veus de serra
  és el supersaw del trance. El volum es manté semblant amb més veus.
- **sync**: cada vegada que el so que hi arriba passa de negatiu a positiu, totes
  les veus tornen a començar el cicle. Amb un altre oscil·lador a l'entrada i la
  Freq del VCO escombrada, fa el so dels leads de hard sync.
- **Drift**: cada veu es desafina a poc a poc i a l'atzar, fins a 10 cents,
  com un oscil·lador analògic que no és perfecte.

Treu so estèreo. L'exemple `46-vco` en fa servir tres: un pad, un baix amb PWM i
una veu en sync.

### Harmonics

Un oscil·lador additiu: el so es fa sumant setze sinus, un per a cadascun dels
primers harmònics, al nivell que es dibuixa en barres (**Harmonics**). A
diferència de l'ona `harmonics` de l'Oscillator, aquí el so es pot moure mentre
sona, amb dos controls que es poden modular:

- **Bright** inclina l'espectre: a 1 sona tal com està dibuixat, i com més baix,
  més s'apaguen els harmònics aguts. El fonamental no canvia.
- **Even** és la quantitat d'harmònics parells: a 0 només queden els senars, un
  so buit com el d'un clarinet o una ona quadrada.

Sota les barres, numerades de l'1 al 16, una pantalleta dibuixa un cicle de
l'ona que en surt. Mentre sona, hi suma el que els cables aporten a Bright i
Even, així que es veu com l'ona canvia amb la modulació.

**Mode**, **Freq** i **Detune** funcionen com a l'Oscillator, i la modulació de
la freqüència mou tots els harmònics junts, així que es mantenen afinats. La
suma dels nivells es divideix perquè no saturi. La Freq arriba fins a 1 kHz: més
amunt, els harmònics més aguts passarien del que es pot sentir.

### Physical Model

Una corda pinçada, sintetitzada pel mètode de Karplus-Strong: cada `gate` que li
arriba (d'un Keyboard, un Seq o un Arp) la pinça, i la corda sona sola fins que
s'apaga. No li cal ADSR ni Gain: el Keyboard la toca directament.

- **Mode**, **Freq** i **Detune** funcionen com a l'Oscillator: amb `keyboard`,
  el `pitch` d'un Keyboard, un Seq o un Arp connectat al Detune tria la nota.
- **Decay** és el temps que triga a apagar-se 60 dB, de 0,05 a 10 s.
- **Tone** va de fosc (0), com una corda de niló, a brillant (1), metàl·lic.
  Es pot modular.

Una pinçada nova mentre la corda encara sona se suma a la que sona, com en una
corda de veritat.

### Piano

Un piano de cua sintetitzat, sense mostres. Es toca amb el senyal `notes` d'un
Keyboard, un Clip, un Seq o un Arp: fa acords sol, fins a 16 notes alhora, i
cada nota sona tan forta com es toca. No cal posar-lo dins d'un subpatch.

Cada nota fa sonar fins a 32 parcials, cada un una mica més agut que l'harmònic
exacte, com les cordes rígides d'un piano (més com més aguda és la nota). El
feltre del martell tarda uns mil·lisegons a entrar a la corda (més com més greu és
la nota, de Do5 avall, que els martells hi són més pesants) i deixa passar els
parcials fins a una freqüència, més alta com més fort es toca: per això l'atac és
rodó i els aguts no piquen, com en un clavicèmbal. Té una
corda als greus, dues al mig i tres als aguts, una mica desafinades entre si: als
parcials baixos fan el batec, i la nota cau de pressa al principi i després
ressona molta estona, els greus més que els aguts. El martell colpeja a un vuitè
de la corda, i els parcials que hi tenen un node sonen menys.

- **Bright**: la duresa dels martells. Com més fort es toca una nota, més
  brillant sona, i Bright diu quant. Es pot modular.
- **Decay**: allarga (fins a 2) o escurça (fins a 0,25) la cua de les notes.
- **Unison**: quant desafinades estan les cordes d'una tecla, en passos d'un
  cent: 0 les afina del tot, i més amunt el batec és més ràpid.
- **Hammer**: el cop de feltre del martell al principi de cada nota.
- **Pedal**: el pedal de ressonància, premut d'0,5 amunt. Mentre és premut, les
  notes que es deixen anar continuen sonant, i en aixecar-lo s'apaguen. Es pot
  modular i gravar a la cançó.
- **Body**: quant sona a través de la taula harmònica, unes ressonàncies de la
  fusta repartides entre 90 Hz i 3 kHz, curtes i una mica desiguals, que totes
  les notes comparteixen. Dona color i cos sobretot als greus i als mitjos. A 0
  no hi és.

En deixar anar una tecla, l'apagador apaga la nota amb una cua curta, amb un
fregament suau: uns 0,3 s al Do central, el doble dues octaves avall i la meitat
dues octaves amunt, i els parcials alts primer, de manera que la nota s'enfosqueix
mentre s'apaga. Les notes de Fa6 amunt no en tenen, com en un piano de veritat. Els
greus sonen a l'esquerra i els aguts a la dreta, com els sent el pianista.

### Wind

Un instrument de vent fet per modelatge físic. No es tria per nom: es descriu pel
que el fa sonar (**Exciter**) i pel tub (**Bore**), i se'n pinta el cos (**Body**).
Es toca amb el senyal `notes` d'un Keyboard, un Clip, un Seq o un Arp, una nota
cada vegada, com un instrument de vent de veritat. No cal posar-lo dins d'un
subpatch.

El tub és una línia de retard: la pressió hi va i torna, i als extrems oberts es
gira i perd els aguts. La nota la dona la llargada del tub. L'Exciter i el Bore
trien què el fa sonar:

| Exciter | Bore | Què passa | Instruments |
|---|---|---|---|
| `reed`, `double reed` | `cylinder` | Una canya que es tanca si se li bufa massa, sobre un tub que només ressona als harmònics senars | clarinet |
| `reed`, `double reed` | `cone` | Una vàlvula que s'obre quan la pressió de la boca passa la del tub, sobre un tub que ressona a tots els harmònics | oboè, fagot, saxo |
| `lips` | `cylinder`, `cone` | La mateixa vàlvula: els llavis | trompa i la resta de metalls |
| `air` | `cylinder`, `cone` | Un raig d'aire que formen els llavis i tarda mig període a arribar al bisell, on el so del tub el doblega; com que no cau just al mig, hi apareix l'octava, i l'alè se sent dins del so | flauta travessera, flautí |
| `duct` | `cylinder`, `cone` | El mateix raig, però l'apunta un conducte just al bisell: més pur, amb molt menys de l'octava | flauta de bec, flabiol |

- Al tub cilíndric amb canya, per sota de la **Bell** se sent el tub, amb els
  harmònics senars; per sobre, el so surt pels forats oberts i se sent la canya
  mateixa, amb els parells, fins on la canya pot seguir. Per això les notes
  greus són buides i les de dalt més plenes, i les més agudes gairebé pures.
- A la vàlvula, el tub es parteix on bufa la vàlvula, una mica abans de la
  meitat, perquè es mantingui a la nota. Això deixa febles els harmònics que hi
  tenen un node, com una pinta, i la pinta inversa els torna: no n'hi falta cap.
  Per sobre de la Bell no deixa passar gairebé res.
- Al raig d'aire, el tub ressona el mateix temps a totes les notes. Amb `duct`
  el raig va centrat al bisell i el segon harmònic queda uns 10 dB més avall que
  amb `air`.

Cada nota es bufa tan fort com es toca: més forta i més brillant. Una nota que
es toca mentre l'anterior encara és premuda s'hi lliga, sense tornar a atacar;
una que es toca després d'un silenci, per curt que sigui, porta cop de llengua,
una empenta curta de pressió, i deixa el tub vibrant a la nota, com quan la
llengua deixa anar la canya o el raig: així la nota parla de seguida i ja
comença a la seva altura, sense passar per un harmònic de dalt. En deixar anar
la tecla, s'atura l'alè i la nota s'apaga en uns mil·lisegons. Si en deixes anar
una i n'hi ha una altra de premuda, hi torna lligant.

- **Exciter** i **Bore**: què el fa sonar i quin tub, com a la taula. Es poden
  canviar mentre sona.
- **Breath**: com de fort es bufa, de 0 a 1, multiplicat per la força de cada
  nota. Sempre es queda entre el punt on la canya comença a sonar i on es tanca,
  de manera que totes les notes parlen. Es pot modular a cada mostra: un ADSR
  hi fa crescendos dins d'una nota, i un LFO lent, un trèmolo d'alè.
- **Detune**: en cents. Es pot modular a cada mostra, per al vibrato.
- **Noise**: l'aire que entra amb l'alè i se sent dins del so.
- **Bright**: com de pocs aguts perd el tub a l'extrem obert. Es pot modular.
- **Vibrato**: un vibrato de 5,2 Hz a l'alè i a l'afinació (fins a 12 cents),
  que arriba a poc a poc: comença 0,2 s després d'una nota amb cop de llengua i
  creix durant 0,4 s. Les notes lligades no el tornen a començar.
- **Bell**: on la campana o els forats deixen de tenir el so a dins, de 300 Hz a
  12 kHz.
- **Flare**: quant s'obre la Bell en bufar fort, de 0 (gens) a 1 (fins a 20
  vegades més amunt), com la campana d'un metall: rodó fluix, metàl·lic fort.
- **Attack**: com de fort el cop de llengua posa el tub a vibrar: amb menys,
  l'atac és més rodó i tarda més a parlar.
- **Body**: el cos de l'instrument, 32 barres de -12 a +24 dB per bandes fixes
  en hertz, de 100 Hz a 8 kHz, amb la freqüència escrita sota una barra de cada
  quatre. Com que són fixes, cada nota pren el color d'on
  cauen els seus harmònics, com en un instrument de veritat. El cos canvia el
  color i no el volum: el so que en surt es manté tan fort com el que hi entra,
  mesurat en una dècima de segon, de manera que una nota que té els harmònics
  sobre bandes alçades no sona més forta que les altres. Cada barra és el
  guany exacte a la seva freqüència, encara que les bandes es trepitgin: es
  calculen totes juntes perquè sumin just el que marquen. Un dibuix que les
  bandes no poden seguir, com barres que pugen i baixen alternades, se segueix
  tan bé com es pot.

Al final, una saturació suau arrodoneix el que passa de 0,7, perquè no arribi
mai a dalt de tot. Quan no es toca cap nota i el so s'ha apagat del tot (50 ms
sense sentir-se), deixa de calcular fins a la mostra de la nota següent: un
Wind que calla no gasta gairebé res, i en una peça només costen els que sonen.

Els instruments vénen amb Trama com a presets del Wind (Flute, Oboe, Clarinet,
Horn, Bassoon, Alto sax, Alto recorder, Pan flute i els de la cobla: Flabiol,
Tible, Tenora, Fiscorn, Trumpet i Trombone, al menú de presets del node), amb aquests paràmetres
(`src/patch/windInstruments.ts`). Carregar-ne un no toca el Breath ni el Detune:

| Instrument | Exciter | Bore | Bright | Bell | Flare | Attack | Noise | Vibrato | Body |
|---|---|---|---|---|---|---|---|---|---|
| Flute | `air` | `cylinder` | 0,5 | 12 kHz | 0 | 0,5 | 0,3 | 0,4 | pla |
| Oboe | `double reed` | `cone` | 0,82 | 4,5 kHz | 0,29 | 0,38 | 0,08 | 0,38 | formants a 1,2 i 2,9 kHz |
| Clarinet | `reed` | `cylinder` | 0,5 | 2 kHz | 0 | 0,5 | 0,2 | 0 | pla |
| Horn | `lips` | `cone` | 0,69 | 600 Hz | 1 | 0,21 | 0,1 | 0 | ample, amb el màxim cap a 350 Hz i baix per sobre de 2 kHz |
| Bassoon | `double reed` | `cone` | 0,67 | 2,5 kHz | 0 | 0,43 | 0,2 | 0,24 | ample, de 100 Hz a 1 kHz, i baix per sobre de 2 kHz |
| Alto sax | `reed` | `cone` | 0,7 | 650 Hz | 1 | 0,5 | 0,25 | 0,3 | +10 dB d'1 a 4 kHz: nasal i brillant |
| Alto recorder | `duct` | `cone` | 0,4 | 12 kHz | 0 | 0,7 | 0,15 | 0 | pla |
| Pan flute | `duct` | `cone` | 0,3 | 8 kHz | 0 | 0,2 | 0,6 | 0,25 | pla |
| Flabiol | `duct` | `cone` | 0,7 | 12 kHz | 0 | 0,8 | 0,25 | 0,15 | +5 dB cap a 3,5 kHz: penetrant |
| Tible | `double reed` | `cone` | 1 | 6 kHz | 0,3 | 0,6 | 0,08 | 0,1 | +4 dB de 300 a 900 Hz i fins a +14 dB de 2 a 4,5 kHz: ric, nasal i el més brillant |
| Tenora | `double reed` | `cone` | 0,9 | 500 Hz | 1 | 0,5 | 0,1 | 0,3 | -6 dB fins a 500 Hz i fins a +18 dB de 1,6 a 2,5 kHz: nasal; la campana de metall s'obre amb la dinàmica |
| Fiscorn | `lips` | `cone` | 0,7 | 800 Hz | 0,8 | 0,3 | 0,1 | 0 | ample de 200 a 800 Hz: rodó, més obert que la trompa |
| Trumpet | `lips` | `cylinder` | 0,9 | 500 Hz | 1 | 0,5 | 0,08 | 0 | fins a +12 dB d'1,8 a 2,5 kHz: dolça fluix, metàl·lica fort |
| Trombone | `lips` | `cylinder` | 0,8 | 500 Hz | 1 | 0,4 | 0,08 | 0 | ample, amb el màxim cap a 650 Hz |

L'oboè, el fagot i la trompa estan afinats d'oïda. La flauta de pan és una
aproximació: els seus tubs són tapats i només haurien de sonar als harmònics
senars, i aquí és una flauta de bec amb molt d'aire i l'atac tou. El saxo té la campana baixa i
oberta del tot amb la dinàmica: dolç i fosc fluix, brillant i aspre fort.

### Strings

Un instrument de corda fregada o pinçada fet per modelatge físic: violí, viola,
violoncel o contrabaix. Es toca amb el senyal `notes` d'un Keyboard, un Clip, un
Seq o un Arp, una nota cada vegada. Per a dobles cordes, dos nodes.

La corda són dues línies de retard, a banda i banda del punt on frega l'arc o
pinça el dit: cap al pont, que la torna girada i perd aguts, i cap al mànec. La
nota la dona la llargada de la corda. Amb l'arc (**Play** `bowed`), l'arc arrossega la
corda fins que la fricció no l'aguanta i llisca; llavors la fricció baixa com
més de pressa llisca, fins que la corda torna a enganxar-se. Així surt sol el
moviment de Helmholtz, la dent de serra de la corda fregada, i l'atac és el de
l'arc que agafa la corda, no un volum que puja. La corda es calcula quatre
vegades per mostra, perquè cada lliscament pugui caure entre dues mostres i la
nota no s'enganxi a un període sencer de mostres.

La velocity de cada nota fa la dinàmica i també l'atac de cada arcada. Per
sobre de 100, la nota surt accentuada: comença més forta i més brillant i
s'assenta en uns 0,1 s. Per sota de 100, entra gradualment, com més suau més a
poc a poc. La manera com l'arc agafa la corda és la mateixa a totes les
velocities, perquè la corda la prengui sempre neta. Una nota que es toca mentre
l'anterior encara és premuda canvia el dit sense aixecar l'arc; una que es toca després d'un silenci és una arcada nova, i l'arc
arrenca des de quiet. En deixar anar la tecla, l'arc s'aixeca i la corda, que el
dit encara apaga, sona uns instants. Amb el dit (**Play** `plucked`), cada nota
estira la corda i la deixa anar, també les lligades, i sona fins que s'apaga
sola o fins que es deixa anar la tecla.

- **Play**: `bowed` (amb arc) o `plucked` (pizzicato). Es pot canviar mentre
  sona.
- **Bow**: la dinàmica de l'arc, de 0 a 1, multiplicada per la força de cada
  nota: més fort i més brillant. Es pot modular a cada mostra, per a
  crescendos dins d'una nota.
- **Pressure**: com de fort pressiona l'arc. Es queda sempre dins del marge on
  la corda fa la dent de serra; com més pressió, més brillant. Es pot modular.
- **Position**: on frega o pinça, en fracció de la corda des del pont, de 0,06
  (sul ponticello, brillant) a 0,25 (sul tasto, dolç). L'arc pressiona més com
  més a prop del pont, com fa un músic, i la corda té la cantonada més esmolada.
  Es pot modular.
- **Detune**: en cents. Es pot modular a cada mostra.
- **Bright**: quants aguts deixa sortir. Es pot modular.
- **Noise**: el soroll de les crines; a l'inici de l'arcada, mentre l'arc agafa
  velocitat, se'n sent més.
- **Vibrato**: un vibrato de 5,5 Hz (fins a 18 cents) que comença 0,25 s
  després d'una arcada nova i creix durant 0,5 s. Les notes lligades no el
  tornen a començar.
- **Attack**: quant triga l'arc a agafar velocitat en una arcada nova, de
  0,02 a 0,15 s. Mentre agafa velocitat, l'arc també pressiona més, com fa
  un músic: així la corda agafa la nota neta, sense un moment bufat abans.
- **Body**: el cos, com el del Wind: 32 barres de -12 a +24 dB per bandes fixes
  de 100 Hz a 8 kHz, que canvien el color i no el volum.

Com el Wind, quan no es toca cap nota i el so s'ha apagat (50 ms sense
sentir-se), deixa de calcular fins a la nota següent.

Els instruments vénen com a presets del Strings (Violin, Viola, Cello i Double
bass, al menú de presets del node), amb aquests paràmetres
(`src/patch/stringInstruments.ts`). Carregar-ne un no toca el Play, el Bow ni el
Detune:

| Instrument | Pressure | Position | Bright | Noise | Vibrato | Attack | Body |
|---|---|---|---|---|---|---|---|
| Violin | 0,5 | 0,12 | 0,6 | 0,15 | 0,4 | 0,4 | fluix sota 200 Hz, ressonàncies a 270, 470 i 550 Hz, i el turó del pont de 2 a 3 kHz |
| Viola | 0,55 | 0,13 | 0,5 | 0,15 | 0,35 | 0,45 | com el violí, més avall |
| Cello | 0,6 | 0,13 | 0,45 | 0,12 | 0,4 | 0,4 | ressonàncies a 100 i 200 Hz, fosc per sobre de 3 kHz |
| Double bass | 0,3 | 0,12 | 0,35 | 0,1 | 0,25 | 0,6 | greus forts, fosc per sobre de 2 kHz |

### Modal

Un cos que es colpeja, sintetitzat per modes: campanes, barres i gongs. Cada
`gate` que li arriba (d'un Keyboard, un Seq, un Clip o un Arp) el colpeja, i
sona sol fins que s'apaga. Cada parcial del model és un ressonador que sona a la
seva proporció de la nota i s'apaga al seu ritme; un cop nou mentre sona s'hi
suma, com en una campana de veritat. Deixar anar la tecla no el talla.

- **Model**: `tubular` (campana tubular, amb els parcials d'un tub lliure, que
  no són múltiples de la nota), `bell` (campana d'església), `marimba`,
  `vibraphone`, `glass` (copa de vidre) i `gong` (un tam-tam: la nota i desenes
  de modes en parelles que baten, i els aguts que floreixen després del cop, com
  més aguts més tard).
- **Mode**, **Freq** i **Detune** funcionen com a l'Oscillator: amb `keyboard`,
  el `pitch` connectat al Detune tria la nota. A la campana tubular, la nota
  és la que s'hi sent, no el parcial més greu, i la cua s'acaba a la seva
  octava.
- **Decay**: el temps que triga la nota a apagar-se 60 dB, de 0,1 a 10 s.
- **Bright**: amb 1 els parcials de sobre del principal (el que més sona del
  model) duren el que diu el model; amb menys, s'apaguen abans. Els de sota no
  en canvien, perquè no desafinin la cua. Es pot modular.
- **Hit**: la duresa de la maça. Tou (0) amaga els parcials de sobre del
  principal; dur (1) els fa sortir.
- **Stretch**: apropa els parcials a la nota (fins a -1) o els allunya (fins a
  1), per fer el model més afinat o més metàl·lic.

### Ladder

El filtre passa-baixos d'un Moog, de 24 dB per octava, el doble que el Filter:
retalla molt més i té el color dels analògics. Va bé per a baixos i leads; per
retallar sense color, el Filter gasta molt menys.

- **Freq** és on comença a tallar. Es pot modular, com la del Filter: amb un
  envelope a la Freq, cada nota s'obre i es tanca.
- **Res**, de 0 a 1, fa ressonar el filtre a la Freq. A prop d'1 xiula sol, com
  un oscil·lador, encara que no li arribi so. Es pot modular. Com al Moog, com
  més ressonància, menys greus deixa passar.
- **Drive** empeny el so cap a la saturació de l'entrada: més calent, més quadrat
  i més fort, però mai per sobre d'1.

Treu so estèreo, cada costat filtrat pel seu compte.

### Custom Filter

Un filtre amb la resposta que dibuixes (**Response**): 16 bandes repartides
per igual en octaves, de 25 Hz a 20 kHz, que es poden retallar o realçar fins a
24 dB. La corba es dibuixa com la de l'Oscillator, i sense tocar-la el filtre
deixa passar el so tal com arriba.

### Audio Input

Porta al patch el so del micròfon o de la targeta de so, per passar la veu o un
instrument pel Pitch Shifter, el Spectral Freeze, el Granulator, la Distortion
o la Reverb. En afegir-lo, el navegador demana permís per fer servir el
micròfon. El so arriba tal com és, sense la cancel·lació d'eco, la supressió de
soroll ni el control de volum que el navegador aplica a les trucades.

- **Gain** amplifica el que arriba, de 0 a 4.
- El node mostra el nivell del que sent i què fa el micròfon: `Asking for the
microphone…` mentre el navegador espera el permís, `Listening` quan escolta,
  i un avís si el permís s'ha denegat o no hi ha cap micròfon. Si l'has
  denegat, cal permetre'l a la configuració del lloc i tornar a afegir el
  mòdul.
- En esborrar el mòdul, el micròfon s'apaga.

Fes servir auriculars: si els altaveus sonen a prop del micròfon, el so hi
torna a entrar i es retroalimenta. La pàgina ha de ser `localhost` o `https`
perquè el navegador deixi fer servir el micròfon.

### Sampler

Toca un fitxer d'àudio (WAV, MP3, OGG, FLAC… el que sàpiga llegir el navegador)
a cada `gate`. Es carrega amb el botó **Load** del node o deixant-hi anar el
fitxer a sobre. El node en mostra el nom, la durada i la forma d'ona, amb la
part que sona il·luminada.

Pot tenir fins a 8 mostres: **Load**, o deixar-hi anar fitxers (diversos alhora),
n'**afegeix**. Amb més d'una, surt un quadret per a cada mostra, encès a la que
sona; un clic n'ensenya una a la pantalla, i la creu la treu. Com a les bateries
del ReBirth, cada cop toca una sola mostra:

- **Order** `select`: la que diu **Select**, que reparteix el seu recorregut
  entre les mostres. Es pot modular: un LFO o un Sample & Hold al Select van
  canviant de mostra. El canvi entra al `gate` següent, sense tallar el que sona.
- Amb **Order** `random` o `cycle` el Select s'amaga, amb el seu port; un cable
  que hi arribi es queda al patch i torna a sortir amb `select`.
- **Order** `random`: una a l'atzar a cada cop, mai la mateixa dues vegades
  seguides, perquè un charles o una caixa repetits no sonin sempre igual.
- **Order** `cycle`: les va passant en ordre.

Play, Start, End i Tune valen per a totes.

- **Play** diu què fa amb el `gate`: `one-shot` el toca fins al final encara
  que el `gate` es tanqui; `gate` el toca mentre el `gate` és obert; `loop` el
  repeteix mentre el `gate` és obert. Un `gate` nou talla el que sona i torna a
  començar.
- **Start** i **End** trien la part del fitxer que sona, de 0 (el principi) a 1
  (el final). Si End talla el fitxer abans del final, el so s'hi apaga en 5 ms,
  sense clic. En `loop`, moure'ls mentre sona canvia el tros que es repeteix.
- **Tune** el mou en semitons, de −24 a +24, canviant-ne la velocitat. Es pot
  modular: amb el `pitch` d'un Keyboard, un Seq o un Clip al Tune, Do4 el toca
  tal com és i cada nota el transposa. Per tocar-lo amb acords, posa'l dins d'un
  subpatch amb veus.

Un Sampler en `loop` dins d'un Granulator fa de font de fitxer per als grans.

El fitxer es desa al navegador (IndexedDB), i el patch només en guarda un
identificador, perquè el desat automàtic no s'ompli. En fer **Save**, el fitxer
del patch porta dins les mostres que fa servir, i en carregar-lo tornen al
navegador: un patch amb Sampler es pot obrir en un altre ordinador. Si el
navegador ha perdut una mostra (s'han esborrat les dades del lloc), el node ho
diu, i cal tornar-la a carregar.

### Pitch Shifter

Canvia l'altura del so que hi entra sense canviar-ne la durada. Per defecte és
un harmonitzador: el so original i el mateix una quinta amunt, meitat i meitat.

- **Shift** és l'interval, de −24 a +24 semitons. Es pot modular: amb el
  `pitch` d'un Keyboard al Shift, cada tecla tria l'interval (Do4 no mou res).
- **Window** és la mida dels trossos que es llegeixen i es fonen entre ells, de
  20 a 200 ms. Curt va bé per a sons aguts i nets; llarg, per a sons greus, però
  s'hi nota més eco.
- **Mix** va del so original (0) al desplaçat (1).

Com més gran és el salt, més s'hi sent el tremolor dels trossos fonent-se: és
el so dels harmonitzadors senzills.

### Spectral Freeze

Congela el so d'un instant i el manté sonant: quan se li obre el `gate` (d'un
Keyboard, un Seq o un Arp), captura l'espectre del que li arriba en aquell
moment i el continua fent sonar, encara que el so original s'aturi. Quan el
`gate` es tanca, el so congelat s'apaga.

- **Mix** va del so original (0) al congelat (1). Sense `gate` obert, el mòdul
  només deixa passar la part del so original.
- **Release** és el temps que triga el so congelat a apagar-se 60 dB un cop es
  tanca el `gate`, de 0,01 a 10 s. Amb un Release llarg i un `gate` que es
  repeteix, les congelacions s'encadenen com un pad.

Un `gate` nou mentre encara sona en congela el so d'aquell moment.

### Granulator

Trenca el so que li arriba en grans petits i els torna a sonar molts alhora, en
un núvol. Guarda sempre els últims quatre segons del que li arriba, i hi llegeix
els grans en directe: no cal gravar ni carregar res.

- **Position** és quant enrere comencen a llegir els grans, de 0 a 4 s. Es pot
  modular: un LFO lent el fa passejar pel que ha sonat.
- **Size** és la mida de cada gra, de 10 a 500 ms, i **Density** quants en
  comencen per segon, d'1 a 100.
- **Pitch** fa sonar els grans més aguts o més greus, fins a dues octaves, sense
  canviar la velocitat del so. Es pot modular.
- **Spread** fa que cada gra comenci en un lloc una mica diferent, a l'atzar,
  fins a la mida d'un gra. Es pot modular.
- **Mix** va del so original (0) als grans (1).
- **Freeze** a `on` deixa d'escoltar: els grans continuen sobre l'últim que ha
  sentit, encara que el so que li arriba s'aturi.

El volum dels grans es compensa segons quants se'n solapen.

### Distortion

Satura, retalla o doblega el so. **Drive** l'empeny abans de la corba, d'1 a
40 vegades: amb poc, només s'arrodoneixen els pics; amb molt, qualsevol so
s'acosta a una ona quadrada. Es pot modular: un ADSR al Drive fa que l'atac
d'una nota soni més brut que la cua.

- **Mode** tria la corba: `soft` satura suau, com una vàlvula forçada; `hard`
  retalla en sec el que passa del màxim; `fold` doblega cap endins el que en
  passa, i com més Drive, més plecs i més harmònics metàl·lics (el _wavefolder_
  dels sintetitzadors de West Coast); `drawn` fa servir la corba que dibuixes.
- **Shape**, en mode `drawn`, és la corba: d'esquerra a dreta, el so que hi
  entra de −1 a 1, i a quina altura en surt. Per defecte és una recta, que deixa
  el so igual fins que el Drive el fa passar del màxim. Una corba que no és igual
  pels dos costats afegeix els harmònics parells, més càlids.
- **Tone** retalla els aguts del que surt, de 500 Hz a 20 kHz, i es pot modular
  com la Freq d'un filtre.
- **Mix** va del so original (0) al distorsionat (1).

La corba es calcula amb quatre vegades més mostres (_oversampling_), perquè els
harmònics que passen de l'agut no tornin avall com a soroll.

### Reverb

El so d'una sala, de petita a gran. El so que hi entra es barreja amb una cua
de soroll que s'apaga a poc a poc, com els rebots d'unes parets.

- **Decay** és el temps que triga la cua a apagar-se 60 dB, de 0,1 a 10 s.
  Canviar-lo munta una sala nova, i se sent un petit tall.
- **Pre-delay** és el silenci entre el so i la cua, de 0 a 0,25 s. Uns quants
  mil·lisegons separen la veu de la sala i la fan més clara.
- **Tone** retalla els aguts de la cua, de 500 Hz a 20 kHz: baix és una sala
  fosca i esmorteïda, alt una de brillant. Es pot modular, com la Freq d'un
  filtre.
- **Mix** va del so original (0) a la sala sola (1).

### Chorus, Flanger i Phaser

Tres efectes que mouen el so amb un LFO intern. Tots tres treballen en estèreo
(un so mono arriba als dos costats) amb l'LFO de la dreta un quart de cicle
desfasat del de l'esquerra, i així el so s'obre. **Rate** és la velocitat de
l'LFO (0,05–10 Hz), **Depth** quant mou l'efecte, i **Mix** va del so original
(0) a l'efecte sol (1).

- **Chorus:** còpies del so uns quants mil·lisegons tard (**Delay**, 5–40 ms),
  que l'LFO allarga i escurça fins a la meitat del Delay. Cada una de les
  **Voices** (1–4) va en un altre punt del cicle. Fa el so més ample i gruixut,
  com diversos instruments tocant alhora.
- **Flanger:** una sola còpia molt a prop (**Delay**, 0,5–10 ms) que l'LFO
  escombra, fins a Depth vegades el Delay, i que es torna a enviar a si mateixa
  (**Feedback**, −0,95 a 0,95; negatiu, amb el signe girat). Fa el "jet" que puja
  i baixa; com més Feedback, més metàl·lic.
- **Phaser:** una cadena d'etapes passa-tot (**Stages**, de 2 a 12 de dues en
  dues) que giren la fase del so sense canviar-ne el volum. Barrejades amb el so
  original, cada dues etapes fan un forat on s'anul·len. L'LFO mou els forats
  fins a dues octaves amunt i avall de **Freq**. **Feedback** els fa més
  marcats. Amb Mix a 0,5 els forats són més profunds.

Els tres es calculen al fil d'àudio, mostra a mostra, perquè la realimentació
del Flanger i del Phaser no cap en els nodes de Web Audio: un bucle hi ha de
tenir un retard d'almenys 128 mostres.

### Compressor

Abaixa les parts fortes d'un so i deixa les fluixes, perquè el volum sigui més
igual: la bateria sona més compacta, i el bus de sortida no es dispara.

- **Threshold** és el nivell a partir del qual comprimeix, de −60 a 0 dB.
- **Ratio** és quant: amb 4, el que passa del Threshold creix quatre vegades
  menys. Amb 20 ja és un limitador.
- **Knee** suavitza l'entrada a la compressió al voltant del Threshold, de 0
  (de cop) a 40 dB.
- **Attack** i **Release** són com de ràpid comença i deixa de comprimir. Un
  Attack d'uns quants mil·lisegons deixa passar el cop d'un bombo abans
  d'abaixar-lo.
- **Makeup** torna a pujar el so sencer, fins a 24 dB, per recuperar el volum
  que s'ha perdut.
- Per fer que un so s'abaixi quan en sona un altre (sidechain), hi ha
  l'Envelope Follower.

### Mixer

Suma els sons que li arriben, amb un **canal per cable**: pots connectar tants
cables com vulguis a la seva entrada, i cadascun surt en una fila amb el nom de
la font. Cada fila té:

- Un knob de **nivell**, de 0 a 1, que per defecte és a 1: connectar un cable al
  Mixer sona igual que connectar-lo directament.
- Un knob de **pan**, que col·loca el canal entre l'esquerra i la dreta. La
  pantalleta mostra `C` al centre, i `L` o `R` amb el percentatge cap a cada
  costat; es pot escriure igual (`L30`, `R100`).
- Un mesurador del senyal del canal, després del nivell i abans del mute, així
  que un canal en mute continua mostrant si hi arriba so.
- **M** (mute), que el silencia.
- **S** (solo): mentre hi ha algun canal en solo, només sonen els canals en
  solo. Un canal en mute no sona mai, encara que estigui en solo.

El nivell, el pan, el mute i el solo es desen al cable: si el treus, el canal
desapareix, i si ho desfàs, torna amb els mateixos valors. Cada clic a M o S es
desfà per separat. **Level** és el nivell general de tot el Mixer, i es pot
modular amb un cable de control, com el Gain.

### Pan

Col·loca el so que li arriba entre l'esquerra (−1) i la dreta (1). Es pot
modular: amb un LFO lent, el so va d'un costat a l'altre (auto-pan).

### Estèreo

Tot el patch és estèreo. Les fonts sonen al centre, i el que les mou cap als
costats és el **pan** del Mixer o el mòdul **Pan**. Els filtres, els guanys, el
delay i la Distortion treballen cada costat per separat. També ho fan el Pitch Shifter, el
Spectral Freeze i el Granulator: un so que hi entra al centre en surt al
centre, i un de panoramitzat hi manté el seu lloc. El Granulator, a més, tria els
grans de cada costat per separat, així que el seu núvol ja surt obert. La
Reverb també obre el so: cada costat té la seva cua, així que un so del centre
en surt envoltant, i un de panoramitzat hi manté el seu costat.

### Output

**Volume** és el volum general, de 0 a 1, i s'aplica a tot el que arriba a
l'Output. A sota hi ha un mesurador del pic de sortida en dBFS: verd fins a −12
dB, taronja fins a −3 dB i vermell a partir d'aquí.

**Limiter**, a `on` per defecte, protegeix les orelles i els altaveus. Manté la
sortida per sota de −0,3 dBFS, abaixant tots dos costats alhora i sense afegir
latència. Si el so es desboca (queda mig segon seguit molt per sobre de 0 dBFS,
com en una retroalimentació o un Gain negatiu molt gran) o deixa de ser un
número, l'Output calla i ho avisa al node. Per tornar a sonar, abaixa el que el
fa sonar tan fort i prem **Unmute**. A `off`, el so passa tal com arriba.

Amb el Limiter a `off`, quan la sortida passa de 0 dBFS, el so distorsiona i
s'encén **CLIP**, que queda encès un segon i mig. Si s'encén, baixa el Volume o
el Gain d'alguna de les fonts: diverses fonts connectades a l'Output se sumen i
poden passar d'1 encara que cap ho faci per separat.

### Gravar

El botó ● de la barra de dalt, al costat de ▶, grava el que sona. Si el so
estava aturat, l'engega. Mentre grava, el botó parpelleja en vermell i al costat
es veu el temps. Quan tornes a prémer ●, o quan atures el so, la gravació es
descarrega com a `trama-AAAA-MM-DD-HHMMSS.webm` (o `.m4a` si el navegador no
grava WebM). Es grava el que arriba a tots els Output, després del seu Volume.

### Connexions

Hi ha quatre tipus de port, i només es poden connectar ports del mateix tipus. Els
cicles no estan permesos.

- **Àudio** (cercle blau, cable continu): senyal d'àudio.
- **Control** (quadrat taronja, cable discontinu): modula un paràmetre. El
  senyal se suma al valor del slider. Cada cable té un atenuador, de −1 a 1, que
  es mostra compacte i s'obre en passar-hi el ratolí. Els valors negatius
  inverteixen la modulació (un ADSR al filtre el tanca en lloc d'obrir-lo). En
  arrossegar-lo, s'enganxa al 0 quan hi passes a prop (±0,05), i una marca sota
  la barra indica on és. Per a un ajust fi prop del 0, arrossega'l mantenint
  <kbd>Alt</kbd> (<kbd>⌥</kbd> al Mac), o fes servir les fletxes del teclat, que
  avancen de 0,01 en 0,01 i no s'enganxen mai.
- **Trigger** (rombe verd, cable puntejat): esdeveniments de nota, del Keyboard
  a l'ADSR.
- **Notes** (magenta, cable de ratlla i punt): les notes una a una, del
  Keyboard, el Clip o el Seq a un In de notes d'un subpatch. És el que permet
  tocar acords.

Un cable es mou arrossegant-ne un extrem fins a un altre port: el final, a una
altra entrada, o l'inici, a una altra sortida. Si el port no pot rebre'l (un
altre tipus, o un cicle) o el deixes anar enlloc, el cable es queda on era.
Moure'l és un sol pas de desfer. Un cable de control conserva l'atenuador vagi
on vagi; un canal del Mixer (nivell, pan, mute i solo) és del Mixer, i es queda
enrere si el final del cable va a un altre lloc. Un Scope que tenia el cable
com a referència el continua seguint.

La modulació de **Freq** (oscil·lador i filtre) és exponencial: amb l'atenuador
a 1, l'oscil·lador recorre ±4 octaves i el filtre ±5. La resta de paràmetres es
modulen de manera lineal.

Per fer un VCA, posa el Gain a 0 i connecta-hi un ADSR. Si el Gain modulat no és
a 0, el node t'avisa, perquè el so no s'aturaria mai del tot.

El **Curve** de l'ADSR tria la forma de cada tram. Amb `linear` (per defecte),
l'envolupant va en línia recta d'un nivell a l'altre. Amb `exp`, cada tram
comença de pressa i s'alenteix a mesura que s'acosta al nivell, com un ADSR
analògic, i hi arriba igualment en el temps que marca el knob. Fa les caigudes
més naturals: és el que volen els cops de bateria, les pinçades i les cues.

Un oscil·lador és una sola veu, i els cables de control que arriben al mateix
paràmetre se sumen. Si hi connectes dues fonts de notes alhora (un Keyboard i un
Seq, per exemple), les dues alçades s'afegeixen l'una a l'altra i se sent una
sola nota transposada; el node t'avisa amb "Two pitch sources add up". Per tocar
acords d'una mateixa part, posa la veu en un subpatch amb un In de notes i
puja'n les Voices. Per tocar dues parts alhora cal una cadena per part: un oscil·lador, un ADSR i un Gain per
a cadascuna, totes dues cap a l'Output. Per transposar un patró amb el teclat no
cal cap cable: el Seq i l'Arp tenen el selector **Keys**.

### Teclat

- <kbd>A</kbd> <kbd>W</kbd> <kbd>S</kbd> <kbd>E</kbd> <kbd>D</kbd> <kbd>F</kbd>
  <kbd>T</kbd> <kbd>G</kbd> <kbd>Y</kbd> <kbd>H</kbd> <kbd>U</kbd> <kbd>J</kbd>
  <kbd>K</kbd> toquen del Do4 al Do5 (monofònic).
- El piano del Keyboard i de l'Arp també es toca amb el **ratolí**: una tecla
  sona mentre es manté premuda, i arrossegant per damunt del piano es passa
  d'una a l'altra. Fa el mateix que la lletra: va a tots els nodes que escolten
  les tecles, a l'octava de Z / X, i una octava amunt amb Maj o Bloq Maj. Amb
  una tecla del piano enfocada, <kbd>Enter</kbd> la toca.
- Amb l'oscil·lador en mode `keyboard` i Keyboard `pitch` → `Detune`, les notes
  són afinades: la <kbd>A</kbd> és un Do4 de 261,63 Hz.
- <kbd>Espai</kbd>: engegar i aturar el so.
- <kbd>⌘Z</kbd> / <kbd>Ctrl+Z</kbd>: desfer. <kbd>⇧⌘Z</kbd> / <kbd>Ctrl+Y</kbd>:
  refer.
- <kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd>: desar el patch en un fitxer JSON, com el
  botó de desar, en lloc de la pàgina.
- <kbd>Backspace</kbd> / <kbd>Supr</kbd>: esborrar la selecció.
- <kbd>⌘C</kbd> / <kbd>Ctrl+C</kbd>: copiar els mòduls seleccionats, amb els
  cables que van d'un a l'altre. <kbd>⌘V</kbd> / <kbd>Ctrl+V</kbd>: enganxar-los
  una mica més avall, a la vista que hi hagi oberta (també dins d'un subpatch), i
  deixar-los seleccionats. Cada enganxada de la mateixa còpia cau un pas més
  enllà. Un subpatch s'enganxa amb tot el que té a dins, i els In i Out només
  s'enganxen dins d'un subpatch.
- <kbd>⌘D</kbd> / <kbd>Ctrl+D</kbd>: duplicar els mòduls seleccionats d'un sol
  cop, sense tocar el que hi havia copiat.

### Patches

El patch es desa automàticament al navegador mig segon després de l'últim
canvi, i es recupera en tornar a obrir la pàgina. Cada pestanya desa el seu
(`sessionStorage`), així que dues pestanyes obertes no es trepitgen: en
recarregar-ne una, torna el seu patch. Una pestanya nova comença amb el darrer
patch desat per qualsevol pestanya (`localStorage`). L'historial de desfer no es
conserva. Si el patch desat no es pot carregar, l'editor comença buit i en
guarda una còpia a `trama:patch:backup` del `localStorage`.

Si l'app falla mentre es dibuixa, mostra una pantalla amb l'error i tres
botons: **Reload**, **Save the patch** (el desa com a fitxer, amb les mostres) i
**Start with an empty patch** (aparta el patch desat a la mateixa còpia i
recarrega). Si el navegador no pot engegar l'àudio (sense Web Audio, sense audio
worklets o sense HTTPS), ho diu en lloc de quedar-se en blanc.

Un clic al logo obre l'**About**: la versió, **Getting started**, **Report a
problem** (obre un issue a GitHub amb la versió i el navegador escrits), el codi
font i la llicència. **Getting started** és una guia d'inici curta, en anglès,
que també s'ofereix al mig de l'editor mentre el patch és buit.

Al costat del logo hi ha el **títol** i l'**autor** de la peça. Un clic hi obre
una fitxa per escriure'ls, amb una descripció curta i un enllaç (només
`http://` o `https://`, que s'obre en una pestanya nova). Es desen amb el patch
(`meta`) i es poden desfer; el títol surt a la pestanya del navegador i dona nom
al fitxer de Save.

Els primers botons de l'esquerra de la barra són **New** (buida l'editor; es pot
desfer), **Save** (descarrega el patch com a `trama-patch.json`), **Load**
(en carrega un) i **Examples**, seguits de desfer i refer. Passant-hi el ratolí
se'n veu el nom i la drecera de teclat.

**Examples** obre una llista amb els patches de mostra de
[`examples/`](examples), cadascun amb una línia del que fa i una etiqueta si cal
tocar les tecles o fer servir el micròfon. Surten en seccions per categoria
(First steps, Instruments, Sequencing, Modulation, Effects, Sources & filters,
Patching i Pieces). El camp de cerca de dalt, que s'obre amb el focus, els
redueix a una sola llista dels que tenen totes les paraules al títol, a la
descripció o a la categoria, la millor primer; Enter obre la primera i Escape
buida la cerca abans de tancar. En triar-ne un, substitueix el patch, com Load,
i es pot desfer. Els fitxers es baixen només quan es trien. Els títols, les
descripcions, la categoria i l'ordre del menú són a
`src/patch/exampleCatalog.ts`, no al número del fitxer: un exemple nou s'hi ha
d'afegir, dins de la seva categoria, i un test ho comprova. Els exemples són:

| Fitxer                 | Què és                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-basic-synth`       | Sinte subtractiu amb envolupant al volum i al filtre                                                                                                                                                                                                                                                                                                                   |
| `02-echo-pluck`        | Nota pinçada amb delay                                                                                                                                                                                                                                                                                                                                                 |
| `03-wobble-bass`       | Baix amb un LFO al filtre ressonant, sincronitzat a corxeres                                                                                                                                                                                                                                                                                                           |
| `04-vibrato-lead`      | Ona quadrada amb vibrato                                                                                                                                                                                                                                                                                                                                               |
| `05-siren-echo`        | Sirena amb LFO i eco                                                                                                                                                                                                                                                                                                                                                   |
| `06-wind`              | Vent generat amb soroll filtrat; sona sense teclat                                                                                                                                                                                                                                                                                                                     |
| `07-scope-synth`       | El sinte de `01` amb quatre Scopes: l'ona de l'oscil·lador, la del filtre, el so final i l'envolupant                                                                                                                                                                                                                                                                  |
| `08-arpeggio`          | Arpegi up-down de dues octaves amb filtre i delay; mantén dues o tres tecles                                                                                                                                                                                                                                                                                           |
| `09-sequencer`         | Línia de baix de 16 passos amb filtre ressonant; sona sense teclat                                                                                                                                                                                                                                                                                                     |
| `10-mixer`             | Baix, arpegi amb ritme i eco, i hi-hat de soroll, cadascun en un canal del Mixer; sona sense teclat                                                                                                                                                                                                                                                                    |
| `11-drawn-waves`       | Baix amb harmònics dibuixats i arpegi amb una ona dibuixada pel Custom Filter, amb eco; sona sense teclat                                                                                                                                                                                                                                                              |
| `12-plucked-strings`   | Arpa i baix de niló amb el Physical Model, sense ADSR ni Gain; un LFO mou el Tone de l'arpa; sona sense teclat                                                                                                                                                                                                                                                         |
| `13-harmonizer`        | Melodia en La menor pentatònica doblada una quinta amunt pel Pitch Shifter, amb eco; sona sense teclat                                                                                                                                                                                                                                                                 |
| `14-frozen-pads`       | Arpegi de La menor amb set congelat un cop per compàs pel Spectral Freeze, que s'encadena en un pad; sona sense teclat                                                                                                                                                                                                                                                 |
| `15-patterns`          | Baix i arpegi en La menor amb quatre patrons cadascun, de l'A1 a l'A4 (Am, F, C, G); doble clic per llançar-los, el baix al compàs i l'arpegi quan acaba; sona sense teclat                                                                                                                                                                                            |
| `16-clip`              | Melodia de quatre compassos en La menor amb notes de durades diferents, dibuixada al piano roll d'un Clip; sona sense teclat                                                                                                                                                                                                                                           |
| `17-harmonics`         | Melodia en Re menor amb un orgue del Harmonics; dos LFO lents mouen el Bright i l'Even; sona sense teclat                                                                                                                                                                                                                                                              |
| `18-grains`            | Pinçades del Physical Model convertides en un núvol per un Granulator una octava amunt; dos LFO mouen Position i Spread; sona sense teclat                                                                                                                                                                                                                             |
| `19-acid`              | Línia de baix a l'estil del 303: lligadures, i la sortida accent del Seq obrint el filtre i pujant el Gain; sona sense teclat                                                                                                                                                                                                                                          |
| `20-stereo`            | Arpegi mogut d'un costat a l'altre per un Pan amb un LFO, i un núvol estèreo del Granulator al Mixer amb el seu pan; sona sense teclat                                                                                                                                                                                                                                 |
| `21-subpatch`          | Una veu sencera (oscil·lador, filtre, ADSR i VCA) dins d'un subpatch amb ports pitch, gate i sound, tocada per un Seq; sona sense teclat                                                                                                                                                                                                                               |
| `22-poly`              | Un pad de quatre veus en un subpatch amb un In de notes: toca acords amb el teclat, amb un LFO al filtre de totes les veus i eco                                                                                                                                                                                                                                       |
| `23-chords`            | Els acords d'un Clip (Am, F, C, G) sobre el pad de quatre veus de `22-poly`; sona sense teclat                                                                                                                                                                                                                                                                         |
| `24-seq-chords`        | Un Seq en La menor amb Chord `triad` sobre un subpatch de vuit veus amb cues llargues, que se solapen d'un pas a l'altre; sona sense teclat                                                                                                                                                                                                                            |
| `26-reverb`            | Una melodia pinçada en La menor dins d'una sala de 4,5 s; un LFO lent obre i tanca el Tone de la cua; sona sense teclat                                                                                                                                                                                                                                                |
| `27-distortion`        | Baix en La menor amb dues Distortion en cadena: un `fold` amb un LFO al Drive i una corba dibuixada que no és igual pels dos costats; sona sense teclat                                                                                                                                                                                                                |
| `28-sample-hold`       | Línia de serra en Re menor amb un Sample & Hold que mou el filtre ressonant a l'atzar a cada setzè; sona sense teclat                                                                                                                                                                                                                                                  |
| `29-quantizer`         | Un Sample & Hold al ritme d'un Seq, arrodonit a La menor pentatònica: una melodia a l'atzar dins de l'escala, amb eco; sona sense teclat                                                                                                                                                                                                                               |
| `30-clock`             | Un Clock pinça el Physical Model a corxeres, i un altre en divideix els setzens per tres per canviar la nota: tres contra dos; sona sense teclat                                                                                                                                                                                                                       |
| `31-audio-input`       | El micròfon, doblat una quinta amunt pel Pitch Shifter i dins d'una Reverb; demana permís per fer servir el micròfon                                                                                                                                                                                                                                                   |
| `32-sampler`           | Una marimba en Do4, tocada a cada nota d'un Seq en Do menor pentatònic, amb el `pitch` al Tune; porta la mostra dins; sona sense teclat                                                                                                                                                                                                                                |
| `33-clock-input`       | Un Seq greu en La menor pentatònic, i un Clock que en divideix les notes per tres per fer avançar un Seq de cinc passos a Step `gate`; sona sense teclat                                                                                                                                                                                                               |
| `34-acid-techno`       | Una peça acid techno a 132 BPM: un Drums amb quatre veus, cadascuna en un subpatch, dues 303 en La menor (un baix de serra i una quadrada una octava amunt que li respon) que un LFO de quatre compassos obre i tanca a la contra, i acords curts d'un Clip amb eco de punt i sala; la 303 aguda i els acords callen al patró A1 i entren en llançar-ne l'A2 o l'A3; sona sense teclat|
| `35-velocity`          | Una línia de Clip amb notes fortes als temps, mitjanes a les corxeres i fluixes a les semicorxeres, tocada per un subpatch de tres veus on la `velocity` de cada veu fa de VCA i obre el filtre; sona sense teclat                                                                                                                                                     |
| `36-math`              | Un baix de serra en Mi menor on un Math multiplica l'ADSR de cada nota per un LFO a setzens: el filtre tremola amb força en atacar la nota i es calma quan l'ADSR baixa al sustain; sona sense teclat                                                                                                                                                                  |
| `37-slew`              | Una melodia de Seq en Sol menor amb salts grans, passada per un Slew: les notes pugen gairebé de cop i baixen lliscant mig segon per octava, amb eco; sona sense teclat                                                                                                                                                                                                |
| `38-envelope-follower` | Un bombo a negres i un pad de serra: un Envelope Follower escolta el bombo i, amb un cable negatiu, abaixa el pad a cada cop, com un sidechain; sona sense teclat                                                                                                                                                                                                      |
| `39-compressor`        | Un bombo a negres i un hi-hat de soroll a setzens, junts dins d'un Compressor que els abaixa i els torna a pujar amb el Makeup; sona sense teclat                                                                                                                                                                                                                      |
| `40-chorus`            | Acords lents de serra en La menor, oberts per un Chorus de tres veus, dins d'una sala; sona sense teclat                                                                                                                                                                                                                                                               |
| `41-flanger`           | Un baix de serra en Mi menor per un Flanger amb Feedback, que escombra a poc a poc com un jet; sona sense teclat                                                                                                                                                                                                                                                       |
| `42-phaser`            | Una melodia d'ona quadrada en Re menor per un Phaser de sis etapes, amb eco; sona sense teclat                                                                                                                                                                                                                                                                         |
| `43-song`              | Una cançó techno de 64 compassos en Fa menor a 126 BPM: Drums, un baix de Seq, un Arp i dos Clip (pads i melodia), amb quatre patrons cadascun encadenats compàs a compàs, mutes que fan entrar i sortir els instruments i escombrats de filtre gravats; obre el panell Song i toca-la en mode Song                                                                    |
| `46-vco`               | Un pad supersaw de set veus desafinades, un baix d'ona quadrada amb el Width mogut per un LFO, i una veu en hard sync amb el baix, escombrada pel seu envelope; sona sense teclat                                                                                                                                                                                      |
| `47-ladder`            | Un baix de serra en Re menor pel passa-baixos de 24 dB d'un Moog, saturat amb el Drive: l'envelope l'obre a cada nota i els accents el fan ressonar; sona sense teclat                                                                                                                                                                                                 |
| `48-modal`             | Campanes tubulars en una melodia lenta i una marimba en un arpegi, cadascuna colpejada per un gate i ressonant amb els parcials del seu model, dins d'una sala; sona sense teclat                                                                                                                                                                                      |
| `49-samples`           | Una bateria de Samplers amb diverses mostres fetes dins del fitxer: charles que en trien un de tres a l'atzar a cada cop, i quatre caixes que un LFO lent va triant amb el Select; sona sense teclat                                                                                                                                                                   |
| `50-piano`             | Una peça lenta en La menor al Piano: acords trencats a la mà esquerra i una melodia a la dreta, cada nota tan forta com es toca, i per tant més o menys brillant, dins d'una sala; sona sense teclat                                                                                                                                                                   |
| `51-violin`            | Un violí d'arquet per tocar amb el teclat: una sola serra pel cos d'un violí dibuixat al Custom Filter, amb soroll d'arquet i un vibrato que un Math fa entrar amb un ADSR lent després de l'atac
| `53-wind`              | Una melodia de clarinet en Sol menor al Wind amb canya sobre un cilindre, i una línia d'oboè per sobre amb canya doble sobre un con i el cos dibuixat: les notes que es toquen mentre l'anterior encara sona s'hi lliguen, les altres porten cop de llengua, i cadascuna es bufa tan fort com es toca; sona sense teclat |
| `54-strings`           | Una melodia de violí en Re major al Strings amb arc, les notes que entren en la següent lligades sense aixecar l'arc i les altres amb arcada nova, sobre un violoncel en pizzicato, dins d'una sala; sona sense teclat |

El format té una versió (`"version": 1`; els presets en tenen una altra). Quan
canviï, cada versió antiga tindrà un pas a `src/patch/migrations.ts` que la
porta a la següent, i els fitxers vells s'obriran passant per tots els passos.
Un fitxer d'una versió més nova que la de l'app no s'obre i ho diu. En carregar
un fitxer, els paràmetres que hi falten prenen el valor per defecte i els
desconeguts es descarten. Les corbes (Shape, Harmonics, Response) que no s'han
tocat no s'escriuen al fitxer. Les mostres dels Samplers van al final, a
`samples`, per identificador, amb el nom, el tipus i el fitxer en base64. Un
fitxer amb errors no es carrega i el patch actual no es toca.

## Arquitectura

`React Flow (editor)  →  Store (Zustand)  →  AudioEngine  →  Web Audio`

- **`src/patch/`**: el model del patch, serialitzable i sense dependències de
  Web Audio. `registry.ts` defineix cada mòdul de manera declarativa (ports,
  paràmetres, rangs de modulació), i la UI, la validació i la serialització en
  surten automàticament.
- **`src/store/`**: l'estat de l'aplicació, l'historial de desfer i l'autosave.
  Cada canvi calcula el patch sencer següent i l'envia al motor.
- **`src/audio/`**: el motor. Els mòduls són a `src/audio/modules/`, en una
  carpeta per categoria, les mateixes del menú (`sources/`, `processing/`,
  `modulation/`, `notes/` i `output/`), amb els seus tests al costat. Els que
  calculen el so mostra a mostra (el Physical Model, el Pitch Shifter, el
  Spectral Freeze i el Granulator) ho fan en un `AudioWorklet`, al fil d'àudio:
  al costat de cadascun hi ha el càlcul, en una classe que es prova sense
  navegador, i el processador que el registra.
  `src/audio/worklets/` només té el que és comú: la càrrega dels worklets en
  obrir l'app, abans de crear cap mòdul, i els noms dels processadors.
  `AudioEngine.sync(patch)` compara el patch amb el graf que té muntat i aplica
  només les diferències. El motor no sap res dels subpatches: el store li envia
  el patch aplanat (`flattenPatch`), amb els nodes de dins al costat dels altres,
  els ids prefixats (`subpatch-2/filter-8`) i els In i Out fent de pas. Un
  subpatch de diverses veus s'hi copia una vegada per veu (`subpatch-2#2/…`), i
  cada In de notes sap quina veu toca. Si una sincronització falla, el store torna el motor al
  patch anterior. `Transport` és el rellotge musical comú: converteix el temps
  d'àudio en beats al tempo del patch, i `StepClock` hi alinea els passos de
  cada Arp i Seq.
- **`src/presets/`** i **`src/storage/`**: els presets, que `PresetLibrary`
  guarda a IndexedDB i torna a validar en llegir-los, amb la mateixa validació
  que un node d'un fitxer de patch. `src/storage/` obre la base de dades que
  comparteixen amb les mostres.
- **`src/samples/`**: les mostres dels Samplers. `SampleLibrary` les guarda a
  IndexedDB per un identificador tret del contingut, i descodifica cada fitxer
  una sola vegada per a tots els Samplers que el toquen (també les veus d'un
  subpatch).
- **`src/flow/`**: l'editor visual i l'adaptació entre React Flow i el store.
- **`src/components/`**: la interfície, en una carpeta per zona: `header/` (la
  barra de dalt), `controls/` (knobs i corbes), `keys/` (el teclat de
  l'ordinador i els pianos), `sequencing/` (la graella del Seq, els patrons i el
  piano roll) i `displays/` (el Scope, els mesuradors i la forma d'ona). Les
  pantalles, els cursors que avancen i les marques de modulació llegeixen del
  motor mentre sona, a través d'`EngineContext`, sense passar pel store.

## Tests

- **Unitaris** (`src/**/*.test.ts(x)`): el motor es prova contra un
  `AudioContext` fals (`src/test/fakeAudioContext.ts`) que verifica la forma del
  graf d'àudio i les automatitzacions dels paràmetres.
- **End-to-end** (`e2e/`): proven l'editor amb el ratolí i el teclat reals.
  Abans de carregar la pàgina s'injecta un `AnalyserNode` davant la sortida, i
  així els tests poden comprovar que realment hi ha so o silenci. El projecte
  `build` (`e2e/build.spec.ts`) construeix l'app i la prova tal com es
  publicaria: que arrenca sense errors, que carrega els worklets i sona, i que
  cap tros de JavaScript no passa de 500 kB.

## Limitacions conegudes

- L'Arp no treu notes per a les veus: és monofònic.
- Els tests e2e només s'executen a Chromium: el Firefox de Playwright (155) no
  arrenca a macOS 27.
- Si un cable de control passa per sota d'un node de punta a punta, el seu
  atenuador queda a sobre del node.
- En agrupar nodes en un subpatch, les seves files i els seus controls de la
  cançó es perden, perquè canvia el camí que els anomena.
- En un subpatch de més d'una veu, la cançó només llança els patrons i mou els
  knobs de la primera veu, com el doble clic en un patró.
- Els mòbils i les tauletes no tenen suport. Als navegadors que no deriven de
  Chromium, i als mòbils, una barra sota la de dalt ho avisa fins que es tanca.

## Llicència

Trama és programari lliure: es pot redistribuir i modificar sota els termes
de la GNU General Public License publicada per la Free Software Foundation, la
versió 3 o, si es vol, qualsevol de posterior. El text complet és a
[`LICENSE`](LICENSE).
